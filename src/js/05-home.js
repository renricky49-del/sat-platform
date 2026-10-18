/* ============ 路由与外壳 ============ */
let VIEW = { name: 'home', params: {} };
let ROLE = 'student';
const VIEWS = {};

function go(name, params = {}) {
  if (PR && name !== 'practice') { trackTime(); PR.sess.save(true); clearInterval(window._tick); PR = null; }
  VIEW = { name, params };
  const fn = VIEWS[name] || VIEWS.home;
  fn(params);
  if (name !== 'practice') window.scrollTo(0, 0);
}

function shell(content, active) {
  const coins = coinsEarned();
  const tabs = ROLE === 'student'
    ? [['home', '今日'], ['wrong', '错题本'], ['records', '练习记录'], ['extra', '额外练习'], ['pet', '萌宠小窝'], ['weekly', '周报']]
    : ROLE === 'parent' ? [['parent', '家长视图'], ['teacher', '老师视图']] : [['teacher', '老师视图']];
  const ap = activePet(coins);
  return `<div class="shell">
    <header class="topbar"><div class="topbar-in">
      <button class="brand" data-go="${ROLE === 'student' ? 'home' : ROLE}"><img alt="" src="img/cat_${ap.cat}.png"><span>喵喵 SAT 通关</span></button>
      <nav class="tabs" aria-label="页面">${tabs.map(([k, l]) => `<button class="tab ${active === k ? 'on' : ''}" data-go="${k}">${l}</button>`).join('')}</nav>
      <div class="top-right">
        <span class="pill coin-pill" title="可兑换金币（1 金币 = 1 美元）"><i class="coin"></i><b>${coinBalance()}</b></span>
        <span class="pill lv-pill" title="萌宠等级（看累计金币）">Lv ${levelOf(coins)}</span>
      </div>
    </div></header>
    <main class="page">${content}</main>
    <footer class="foot">
      <span id="saveState" class="save-state">${Store.mode === 'cloud' ? '数据保存在云端' : '本机调试模式：数据只存在这个浏览器'}</span>
      ${Store.mode === 'cloud' ? `<span class="muted">${esc(Store.email)} · <button class="lnk" id="logoutBtn">退出登录</button></span>` : ''}
      ${ROLE === 'student' ? `<span class="foot-links"><button class="lnk" data-go="parent">家长视图</button><button class="lnk" data-go="teacher">老师视图</button><button class="lnk" data-go="settings">设置</button></span>` : ''}
      <span class="muted">美西时间 ${mdw(todayStr())}</span>
    </footer>
  </div>`;
}
function mount(html, active) {
  $('#app').innerHTML = shell(html, active);
  fixMath($('#app'));
  const lo = $('#logoutBtn');
  if (lo) lo.onclick = () => Store.logout();
}

/* ============ 弹窗 ============ */
function modal(html, opts = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${opts.cls || ''}" role="dialog" aria-modal="true">${html}${opts.noClose ? '' : '<button class="modal-x" aria-label="关闭">×</button>'}</div>`;
  document.body.appendChild(back);
  const close = () => { back.remove(); if (opts.onClose) opts.onClose(); };
  if (!opts.noClose) {
    back.querySelector('.modal-x').onclick = close;
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  }
  fixMath(back);
  return { el: back, close };
}
function confirmBox(title, text, okLabel, onOk) {
  const m = modal(`<h3 class="m-title">${esc(title)}</h3><p class="m-text">${esc(text)}</p>
    <div class="m-btns"><button class="btn ghost" id="cbNo">再想想</button><button class="btn primary" id="cbOk">${esc(okLabel)}</button></div>`, { cls: 'small' });
  m.el.querySelector('#cbNo').onclick = m.close;
  m.el.querySelector('#cbOk').onclick = () => { m.close(); onOk(); };
}

/* ============ 今日任务流程 ============ */
function dayStages(run) { return [...run.sections.rw.stages.map((s, i) => ({ sec: 'rw', idx: i, st: s })), ...run.sections.math.stages.map((s, i) => ({ sec: 'math', idx: i, st: s }))]; }
function nextTask(T = todayStr()) {
  const s = todayStatus(T);
  if (s.p) {
    if (!s.run) return { kind: 'start', p: s.p };
    for (const sec of ['rw', 'math']) {
      const idx = s.run.sections[sec].stages.findIndex((x) => x.status !== 'done');
      if (idx >= 0) return { kind: 'stage', id: s.run.dayId, sec, idx };
    }
  }
  if (!s.revDone) {
    if (!s.rev) { const due = dueWrong(T); return { kind: 'review', sec: due.some((w) => w.sec === 'rw') ? 'rw' : 'math', fresh: true }; }
    for (const sec of ['rw', 'math']) if (s.rev.sections[sec].status !== 'done') return { kind: 'review', sec };
  }
  return null;
}
function runTask(t) {
  const T = todayStr();
  if (!t) return;
  if (t.kind === 'start') {
    const run = newRun(t.p, T);
    if (t.p.dates[0] > T) run.early = true;
    saveRun(run);
    go('intro', { kind: 'run', id: run.dayId, sec: 'rw', idx: 0 });
  } else if (t.kind === 'stage') {
    const st = runOf(t.id).sections[t.sec].stages[t.idx];
    if (st.status === 'active') { VIEW = { name: 'practice', params: {} }; startSession({ kind: 'run', id: t.id, sec: t.sec, idx: t.idx }); }
    else go('intro', { kind: 'run', id: t.id, sec: t.sec, idx: t.idx });
  } else if (t.kind === 'review') {
    const r = getOrCreateReview(T);
    if (r.empty) { toast('今天没有到期的错题'); go('home'); return; }
    let sec = t.sec;
    if (r.sections[sec].status === 'done') sec = sec === 'rw' ? 'math' : 'rw';
    if (r.sections[sec].status === 'active') { VIEW = { name: 'practice', params: {} }; startSession({ kind: 'review', id: T, sec }); }
    else go('intro', { kind: 'review', id: T, sec });
  }
}
function startMakeup(p) {
  const T = todayStr();
  let run = runOf(p.id);
  if (!run) { run = newRun(p, T); run.makeup = true; saveRun(run); }
  for (const sec of ['rw', 'math']) {
    const idx = run.sections[sec].stages.findIndex((x) => x.status !== 'done');
    if (idx >= 0) {
      if (run.sections[sec].stages[idx].status === 'active') { VIEW = { name: 'practice', params: {} }; startSession({ kind: 'run', id: run.dayId, sec, idx }); }
      else go('intro', { kind: 'run', id: run.dayId, sec, idx });
      return;
    }
  }
}

/* ============ 首页 ============ */
VIEWS.home = () => {
  if (ROLE !== 'student') return go(ROLE === 'teacher' ? 'teacher' : 'parent');
  const T = todayStr();
  const s = todayStatus(T);
  const coins = coinsEarned();
  const total = diffDays(START, EXAM), passed = Math.max(0, Math.min(total, diffDays(START, T)));
  const left = Math.max(0, diffDays(T, EXAM));
  const p100 = ((passed / total) * 100).toFixed(1);
  const nu = nextUnlock(coins);
  const ap = activePet(coins);
  const html = `
  <section class="hero">
    ${questCard(s)}
    <div class="card countdown">
      <div class="cd-label">距离 <b>12月5日</b> SAT 考试</div>
      <div class="cd-num"><span class="big">${left}</span><span class="unit">天</span></div>
      <div class="pxbar" role="progressbar" aria-valuenow="${p100}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p100}%"></i></div>
      <div class="cd-foot"><span>10月15日 出发</span><span>备考已走过 <b>${p100}%</b></span></div>
      <div class="cd-week">${weekNo(T)}</div>
    </div>
  </section>
  ${makeupHTML(T)}
  <section class="card weekmap-card">
    <div class="sec-head"><h2>本周地图</h2><span class="muted">${md(weekStart(T))} – ${md(addDays(weekStart(T), 6))}</span></div>
    ${weekMapHTML(T)}
  </section>
  <section class="card room-card">
    <div class="sec-head"><h2>${esc(petName(ap.cat))}的小窝</h2><button class="lnk" data-go="pet">换装与解锁 →</button></div>
    ${roomHTML({ coins, id: 'homeRoom' })}
    <div class="unlock-line">
      ${nu ? `<span>再得 <b>${nu.at - coins}</b> 金币解锁${KIND_CN[nu.kind]}「${esc(nu.name)}」</span><div class="pxbar thin"><i style="width:${pct(coins - prevUnlockAt(coins), nu.at - prevUnlockAt(coins))}%"></i></div>` : '<span>所有萌宠和装饰都已解锁！</span>'}
    </div>
  </section>`;
  mount(html, 'home');
  bindPetPoke($('#homeRoom'));
  const cta = $('#ctaMain');
  if (cta) cta.onclick = () => runTask(nextTask(T));
  const early = $('#ctaEarly');
  if (early) early.onclick = () => { const p = nextUpcoming(T); if (p) confirmBox('提前开始？', `把 ${mdw(p.dates[0])} 的关卡挪到今天做。金币照常计算，那天就变成错题巩固日。`, '提前开始', () => runTask({ kind: 'start', p })); };
  const settle = $('#ctaSettle');
  if (settle) settle.onclick = () => showSettlement(T);
  $$('.mk-go').forEach((b) => (b.onclick = () => startMakeup(PLAN.find((p) => p.id === b.dataset.id))));
  maybeGuide(s);
  if (!$('.modal-back') && !$('.guide')) maybeSettle();
};
function prevUnlockAt(c) { const xs = allUnlocks().filter((u) => u.at <= c); return xs.length ? xs[xs.length - 1].at : 0; }
function weekNo(T) { const w = WEEKS.find((x) => T >= x.start && T <= x.end); return w ? `${w.label}` : ''; }

function stageChip(st, sec, active) {
  const done = st.status === 'done';
  return `<li class="stage-chip ${done ? 'done' : ''} ${active ? 'now' : ''}">
    <span class="sc-sec ${sec}">${SEC_NAME[sec]}</span>
    <span class="sc-name">${esc(typeShort(st.type))}</span>
    <span class="sc-n">${done ? `${st.correct}/${st.total}` : `×${st.total ?? st.qids.length}`}</span>
  </li>`;
}

function questCard(s) {
  const T = s.T;
  const t = nextTask(T);
  let title, sub = '', chips = '', cta = '', extra = '';
  if (s.p) {
    const label = `${PLAN_LABEL(s.p)}`;
    const list = s.run ? dayStages(s.run) : [...s.p.reading.map((x) => ({ sec: 'rw', st: { type: x.type, qids: x.qids, total: x.qids.length, status: 'todo' } })), ...s.p.math.map((x) => ({ sec: 'math', st: { type: x.type, qids: x.qids, total: x.qids.length, status: 'todo' } }))];
    chips = `<ol class="stage-list">${list.map((x) => stageChip(x.st, x.sec, t && t.kind === 'stage' && t.sec === x.sec && t.idx === x.idx)).join('')}
      <li class="stage-chip review ${s.revDone ? 'done' : ''}"><span class="sc-sec rv">巩固</span><span class="sc-name">错题巩固</span><span class="sc-n">${s.dueN ? `${s.dueN} 题` : '无到期'}</span></li></ol>`;
    title = s.allDone ? '今日已通关！' : '今日关卡';
    sub = `${label} · 阅读 60 分钟 · 数学 45 分钟`;
  } else if (s.dueN > 0) {
    title = s.allDone ? '今日已通关！' : '今天是错题巩固日';
    sub = '把到期的错题再做一遍，按艾宾浩斯曲线安排';
    chips = `<ol class="stage-list"><li class="stage-chip review ${s.revDone ? 'done' : ''}"><span class="sc-sec rv">巩固</span><span class="sc-name">错题巩固</span><span class="sc-n">${s.dueN} 题</span></li></ol>`;
  } else {
    title = '今天没有关卡';
    const nu = nextUpcoming(T);
    sub = nu ? `下一关在 ${mdw(nu.dates[0])}。今天没有到期的错题，可以休息，也可以提前开始。` : '本周的关卡都排完了。周日把下周的题型告诉 Claude，就会更新题目。';
    if (nu) extra = '<button class="btn ghost" id="ctaEarly">提前开始下一关</button>';
  }
  if (t) {
    const label = t.kind === 'start' ? '开始今天练习'
      : t.kind === 'stage' ? (runOf(t.id).sections[t.sec].stages[t.idx].status === 'active' ? '继续答题' : (dayStages(runOf(t.id)).every((x) => x.st.status === 'todo') ? '开始今天练习' : '进入下一关'))
        : '开始错题巩固';
    cta = `<button class="btn primary big" id="ctaMain">${label}<span class="cta-arrow">▶</span></button>`;
  } else if (s.hasTasks && s.allDone) {
    cta = '<button class="btn primary big" id="ctaSettle">查看今日结算</button>';
    extra = '<button class="btn ghost" data-go="extra">去做额外练习</button>';
  }
  return `<div class="card quest ${s.allDone && s.hasTasks ? 'cleared' : ''}">
    <div class="quest-head"><div><h1>${title}</h1><p class="muted">${sub}</p></div>
      <div class="quest-date"><span>${md(T)}</span><b>${WD[dow(T)]}</b></div></div>
    ${chips}
    <div class="quest-cta">${cta}${extra}</div>
  </div>`;
}
function PLAN_LABEL(p) { const w = WEEKS.find((x) => x.week === p.week); return `${w ? w.label : ''} ${p.label || mdw(p.dates[0])}`; }

function makeupHTML(T) {
  const ms = makeups(T);
  if (!ms.length) return '';
  return `<section class="card makeup">
    <div class="sec-head"><h2>待补关卡</h2><span class="muted">漏掉的新题留在这里，不会挤进明天</span></div>
    <ul class="mk-list">${ms.map((p) => { const r = runOf(p.id); return `<li><span><b>${esc(PLAN_LABEL(p))}</b>　原定 ${mdw(p.dates[0])}${r ? ' · 已开始' : ''}</span><button class="btn small mk-go" data-id="${p.id}">${r ? '继续补做' : '补做'}</button></li>`; }).join('')}</ul>
  </section>`;
}

function weekMapHTML(T) {
  const ws = weekStart(T);
  const nodes = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const p = planOfDate(d);
    const r = p ? runOf(p.id) : null;
    const rev = Store.get('reviews', d);
    let state = 'rest', label = '休息';
    if (p) {
      label = '新题';
      state = r && r.doneAt ? 'clear' : d < T ? 'miss' : d === T ? 'today' : 'future';
    } else if (d < T) {
      if (rev && !rev.empty) { label = '巩固'; state = rev.doneAt ? 'clear' : 'miss'; }
    } else if (d === T) {
      state = 'today';
      label = (rev && !rev.empty) || dueWrong(d).length ? '巩固' : '休息';
      if (rev && rev.doneAt && !rev.empty) state = 'clear';
    } else { label = '巩固'; state = 'future'; }
    const c = coinsOnDate(d);
    nodes.push(`<li class="wm-node ${state}">
      <div class="wm-dot">${state === 'clear' ? '★' : state === 'miss' ? '!' : i + 1}</div>
      <div class="wm-day">${WD[dow(d)]}</div><div class="wm-date">${md(d)}</div>
      <div class="wm-tag">${label}</div>${c ? `<div class="wm-coin"><i class="coin sm"></i>${c}</div>` : ''}
    </li>`);
  }
  return `<ol class="weekmap">${nodes.join('')}</ol>`;
}

/* ============ 每日首次打开的引导 ============ */
function maybeGuide(s) {
  const cta = $('#ctaMain');
  if (!cta) return;
  const notStarted = s.p && !s.run;
  if (!notStarted) return;
  const key = 'sat:guide:' + s.T;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) { /* 继续显示 */ }
  const r = cta.getBoundingClientRect();
  const g = document.createElement('div');
  g.className = 'guide';
  g.style.height = document.documentElement.scrollHeight + 'px';
  g.innerHTML = `<div class="guide-hole" style="left:${r.left - 10}px;top:${r.top + window.scrollY - 10}px;width:${r.width + 20}px;height:${r.height + 20}px"></div>
    <div class="guide-bubble" style="left:${Math.max(16, Math.min(window.innerWidth - 336, r.left))}px;top:${r.bottom + window.scrollY + 22}px">
      <div class="gb-cat">${petHTML({ cat: activePet().cat, wear: activePet().wear, h: 64, mode: 'idle' })}</div>
      <div><b>今天的关卡准备好啦！</b><p>先阅读后数学，做完还有错题巩固。点上面的「开始今天练习」出发。</p>
      <button class="btn small" id="guideOk">知道了</button></div>
    </div>`;
  document.body.appendChild(g);
  const close = () => g.remove();
  g.querySelector('#guideOk').onclick = close;
  g.querySelector('.guide-hole').onclick = () => { close(); cta.click(); };
}

/* ============ 关卡开始页 ============ */
VIEWS.intro = (p) => {
  let title, kicker, info, n, left, sub;
  const ap = activePet();
  if (p.kind === 'run') {
    const run = runOf(p.id), S = run.sections[p.sec], st = S.stages[p.idx];
    const all = dayStages(run), pos = all.findIndex((x) => x.sec === p.sec && x.idx === p.idx);
    kicker = `第 ${pos + 1} / ${all.length} 关 · ${SEC_NAME[p.sec]}`;
    title = typeName(st.type);
    n = st.qids.length;
    left = timerLeft(S);
    sub = `${SEC_NAME[p.sec]}部分共 ${S.stages.length} 关，共用 ${SEC_LIMIT[p.sec] / 60000} 分钟倒计时。看解析时不计时。`;
    const h = histSnapshot(st.type, run.dayId);
    info = h ? `往期这个题型：正确率 ${Math.round(h.acc * 100)}% · 每题 ${fmtSec(h.msPerQ)}` : '第一次练这个题型，这次的成绩会成为基线。';
  } else {
    const r = Store.get('reviews', p.id), S = r.sections[p.sec];
    kicker = `错题巩固 · ${SEC_NAME[p.sec]}`;
    title = `${SEC_NAME[p.sec]}错题重做`;
    n = S.qids.length;
    left = timerLeft(S);
    sub = `每题 ${REVIEW_PER_Q[p.sec] / 1000} 秒，共 ${fmtClock(S.limitMs)}。答对的题按 3/7/14/30 天再复习，答错的明天再来。`;
    info = `${p.sec === 'rw' ? (r.sections.math.qids.length ? `做完还有数学错题 ${r.sections.math.qids.length} 题` : '') : ''}`;
  }
  mount(`<section class="intro card">
    <div class="intro-pet">${petHTML({ cat: ap.cat, wear: ap.wear, h: 150, mode: 'idle', extraClass: 'pokeable' })}</div>
    <div class="intro-body">
      <div class="kicker">${esc(kicker)}</div>
      <h1 class="intro-title">${esc(title)}</h1>
      <div class="intro-stats"><div><b>${n}</b><span>题</span></div><div><b>${fmtClock(left)}</b><span>剩余时间</span></div><div><b>Hard</b><span>难度</span></div></div>
      <p>${esc(sub)}</p>
      ${info ? `<p class="muted">${esc(info)}</p>` : ''}
      <div class="intro-btns"><button class="btn ghost" data-go="home">回首页</button><button class="btn primary big" id="goPlay">开始答题 ▶</button></div>
    </div>
  </section>`, 'home');
  bindPetPoke($('.intro'));
  $('#goPlay').onclick = () => { VIEW = { name: 'practice', params: {} }; startSession({ kind: p.kind, id: p.id, sec: p.sec, idx: p.idx }); };
};
VIEWS.practice = () => { if (PR) renderPractice(); else go('home'); };
