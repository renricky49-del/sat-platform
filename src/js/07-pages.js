/* ============ 错题本 ============ */
let WB = { sec: 'all', type: 'all', status: 'open', open: {} };
function fromLabel(from) {
  if (!from) return '';
  if (from === 'manual') return '手动加入';
  const [k, id] = from.split(':');
  if (k === 'day') { const p = PLAN.find((x) => x.id === id); return p ? PLAN_LABEL(p) : '每日新题'; }
  if (k === 'extra') return '额外练习';
  return '';
}
function stageDots(w) {
  return `<span class="dots" title="复习进度：${w.mastered ? '已掌握' : `第 ${w.stage + 1} 轮`}">${SRS.map((_, i) => `<i class="${w.mastered || i < w.stage ? 'on' : i === w.stage ? 'cur' : ''}"></i>`).join('')}</span>`;
}
function wrongList(readOnly) {
  const T = todayStr();
  let list = Store.all('wrong').filter((w) => QB[w.qid]);
  if (WB.sec !== 'all') list = list.filter((w) => w.sec === WB.sec);
  if (WB.type !== 'all') list = list.filter((w) => w.type === WB.type);
  if (WB.status === 'open') list = list.filter((w) => !w.mastered);
  if (WB.status === 'done') list = list.filter((w) => w.mastered);
  list.sort((a, b) => (a.mastered - b.mastered) || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  return list.map((w) => {
    const q = QB[w.qid];
    const note = (Store.get('notes', w.qid) || {}).text || '';
    const snippet = stripHtml(q.sec === 'rw' ? q.stem + ' ' + q.stim : q.stem).slice(0, 150);
    const open = WB.open[w.qid];
    const dueTxt = w.mastered ? `已掌握（${md(w.masteredOn || w.due)}）` : w.due <= T ? (w.addedOn < T ? '今天到期' : '明天开始复习') : `下次复习 ${md(w.due)}`;
    return `<li class="wb-item ${w.mastered ? 'mastered' : ''}">
      <div class="wb-top">
        <span class="badge ${q.sec}">${esc(typeShort(q.type))}</span>
        <span class="wb-meta">${esc(fromLabel(w.from))} · ${md(w.addedOn)} 收录${w.times > 1 ? ` · 错过 ${w.times} 次` : ''}</span>
        <span class="wb-due ${!w.mastered && w.due <= T && w.addedOn < T ? 'hot' : ''}">${dueTxt} ${stageDots(w)}</span>
      </div>
      <p class="wb-snip">${esc(snippet)}${snippet.length >= 150 ? '…' : ''}</p>
      <div class="wb-actions">
        <button class="lnk wb-note-t" data-q="${w.qid}">${open ? '收起订正笔记' : note ? '显示订正笔记' : '添加订正笔记'}</button>
        <button class="lnk wb-view" data-q="${w.qid}">查看题目与解析</button>
        ${!readOnly ? `<button class="lnk danger wb-rm" data-q="${w.qid}">移出</button>` : ''}
      </div>
      ${open ? `<div class="wb-note">${readOnly ? `<p>${note ? esc(note) : '<span class="muted">没有笔记</span>'}</p>` : `<textarea rows="3" data-q="${w.qid}" placeholder="错因、正确思路、下次注意…">${esc(note)}</textarea><button class="btn small wb-note-save" data-q="${w.qid}">保存</button>`}</div>` : ''}
    </li>`;
  }).join('') || '<li class="empty">这里还没有错题。做完关卡后答错的题会自动收进来。</li>';
}
function wbFilters() {
  const types = [...new Set(Store.all('wrong').map((w) => w.type))];
  const chip = (k, v, label) => `<button class="chip ${WB[k] === v ? 'on' : ''}" data-k="${k}" data-v="${v}">${label}</button>`;
  return `<div class="filters">
    <div class="chips">${chip('sec', 'all', '全部')}${chip('sec', 'rw', '阅读')}${chip('sec', 'math', '数学')}</div>
    <div class="chips">${chip('status', 'open', '待复习')}${chip('status', 'done', '已掌握')}${chip('status', 'all', '全部状态')}</div>
    <select id="wbType" aria-label="题型"><option value="all">全部题型</option>${types.map((t) => `<option value="${t}" ${WB.type === t ? 'selected' : ''}>${esc(typeName(t))}</option>`).join('')}</select>
  </div>`;
}
function bindWrongList(readOnly, rerender) {
  $$('.filters .chip').forEach((b) => (b.onclick = () => { WB[b.dataset.k] = b.dataset.v; rerender(); }));
  const sel = $('#wbType'); if (sel) sel.onchange = () => { WB.type = sel.value; rerender(); };
  $$('.wb-note-t').forEach((b) => (b.onclick = () => { WB.open[b.dataset.q] = !WB.open[b.dataset.q]; rerender(); }));
  $$('.wb-view').forEach((b) => (b.onclick = () => {
    const w = Store.get('wrong', b.dataset.q);
    const items = [...$$('.wb-view')].map((x) => ({ qid: x.dataset.q, a: { c: (Store.get('wrong', x.dataset.q) || {}).lastAns } }));
    go('qview', { list: items, idx: items.findIndex((x) => x.qid === w.qid), title: '错题本', back: { name: VIEW.name, params: {} } });
  }));
  $$('.wb-rm').forEach((b) => (b.onclick = () => confirmBox('移出错题本？', '移出后不再安排复习，笔记会保留。', '移出', () => { Store.del('wrong', b.dataset.q); rerender(); })));
  $$('.wb-note-save').forEach((b) => (b.onclick = () => {
    const txt = $(`textarea[data-q="${b.dataset.q}"]`).value.trim();
    if (txt) Store.put('notes', b.dataset.q, { text: txt, updatedAt: Date.now() }); else Store.del('notes', b.dataset.q);
    toast('笔记已保存');
  }));
}
VIEWS.wrong = () => {
  const T = todayStr();
  const all = Store.all('wrong').filter((w) => QB[w.qid]);
  const open = all.filter((w) => !w.mastered);
  const due = dueWrong(T).length;
  mount(`<section class="card">
    <div class="sec-head"><h1>错题本</h1><span class="muted">答错自动收录；在解析页也能手动加入</span></div>
    <div class="mini-stats"><div><b>${open.length}</b><span>待复习</span></div><div><b>${due}</b><span>今天到期</span></div><div><b>${all.length - open.length}</b><span>已掌握</span></div>
      <div><b>${SRS.join(' · ')}</b><span>复习间隔（天）</span></div></div>
    ${wbFilters()}
    <ul class="wb-list">${wrongList(false)}</ul>
  </section>`, 'wrong');
  bindWrongList(false, VIEWS.wrong);
};

/* ============ 练习记录 ============ */
VIEWS.records = () => {
  const runs = Store.all('runs').sort((a, b) => (a.startedOn < b.startedOn ? 1 : -1));
  const revs = Store.all('reviews').filter((r) => !r.empty).sort((a, b) => (a.date < b.date ? 1 : -1));
  const exs = Store.all('extras').filter((e) => e.status === 'done').sort((a, b) => b.createdAt - a.createdAt);
  const runHTML = runs.map((r) => {
    const p = PLAN.find((x) => x.id === r.dayId);
    const rows = dayStages(r).map((x) => `<tr class="${x.st.status === 'done' ? 'clickable' : ''}" data-run="${r.dayId}" data-sec="${x.sec}" data-idx="${x.idx}">
      <td><span class="badge ${x.sec}">${SEC_NAME[x.sec]}</span> ${esc(typeName(x.st.type))}</td>
      <td>${x.st.status === 'done' ? `${x.st.correct}/${x.st.total}（${pct(x.st.correct, x.st.total)}%）` : x.st.status === 'active' ? '进行中' : '未开始'}</td>
      <td>${x.st.status === 'done' ? fmtClock(x.st.timeMs) : '—'}</td>
      <td>${x.st.hist ? Math.round(x.st.hist.acc * 100) + '%' : '—'}</td></tr>`).join('');
    return `<div class="rec">
      <div class="rec-head"><b>${mdw(r.startedOn)}</b><span>${esc(p ? PLAN_LABEL(p) : r.dayId)}${r.makeup ? ' · 补做' : ''}${r.early ? ' · 提前' : ''}</span>
        <span class="rec-coin"><i class="coin sm"></i>+${runCoins(r)}</span>${r.doneAt ? '<span class="ok-tag">完成</span>' : ''}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>关卡</th><th>正确</th><th>用时</th><th>往期平均</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="rec-foot muted">阅读部分 ${r.sections.rw.doneAt ? fmtDur(r.sections.rw.usedMs) : '未完成'} · 数学部分 ${r.sections.math.doneAt ? fmtDur(r.sections.math.usedMs) : '未完成'}</div>
    </div>`;
  }).join('') || '<p class="empty">还没有练习记录。</p>';
  const revHTML = revs.map((r) => `<li><b>${mdw(r.date)}</b>
      ${['rw', 'math'].map((sec) => { const S = r.sections[sec]; return S.qids.length ? `<button class="lnk rv-open" data-d="${r.date}" data-sec="${sec}">${SEC_NAME[sec]} ${S.status === 'done' ? `${S.correct}/${S.total}` : '未完成'}</button>` : ''; }).join(' · ')}
      ${r.coin ? `<span class="rec-coin"><i class="coin sm"></i>+${r.coin}</span>` : ''}</li>`).join('') || '<li class="empty">还没有错题巩固记录。</li>';
  const exHTML = exs.map((e) => `<li><b>${mdw(e.date)}</b> ${esc(typeName(e.type))} <button class="lnk ex-open" data-id="${e.id}">${e.correct}/${e.total}</button> <span class="muted">${fmtClock(e.usedMs)}</span></li>`).join('') || '<li class="empty">还没有额外练习。</li>';
  mount(`<section class="card"><div class="sec-head"><h1>练习记录</h1><span class="muted">点关卡查看每道题</span></div>${runHTML}</section>
    <div class="two-col">
      <section class="card"><div class="sec-head"><h2>错题巩固</h2></div><ul class="simple-list">${revHTML}</ul></section>
      <section class="card"><div class="sec-head"><h2>额外练习</h2></div><ul class="simple-list">${exHTML}</ul></section>
    </div>`, 'records');
  $$('tr.clickable').forEach((tr) => (tr.onclick = () => {
    const r = runOf(tr.dataset.run), st = r.sections[tr.dataset.sec].stages[+tr.dataset.idx];
    go('qview', { list: st.qids.map((id) => ({ qid: id, a: st.ans[id] })), idx: 0, title: `${typeName(st.type)} · ${md(r.startedOn)}`, back: { name: 'records', params: {} } });
  }));
  $$('.rv-open').forEach((b) => (b.onclick = () => {
    const S = Store.get('reviews', b.dataset.d).sections[b.dataset.sec];
    go('qview', { list: S.qids.map((id) => ({ qid: id, a: S.ans[id] })), idx: 0, title: `错题巩固 · ${md(b.dataset.d)}`, back: { name: 'records', params: {} } });
  }));
  $$('.ex-open').forEach((b) => (b.onclick = () => go('extraDone', { id: b.dataset.id })));
};

/* ============ 额外练习 ============ */
let EXN = 10;
VIEWS.extra = () => {
  const T = todayStr(), s = todayStatus(T);
  const unlocked = s.allDone;
  const active = Store.all('extras').find((e) => e.status === 'active');
  const cards = extraTypes().map((t) => {
    const left = extraPool(t).length;
    const per = EXTRA_PER_Q[t] || 90000;
    return `<div class="ex-card ${left ? '' : 'off'}">
      <span class="badge ${typeSec(t)}">${SEC_NAME[typeSec(t)]}</span>
      <h3>${esc(typeName(t))}</h3>
      <p class="muted">剩余 ${left} 题 · 每题 ${per / 1000} 秒</p>
      <button class="btn small ex-go" data-t="${t}" ${!unlocked || !left || active ? 'disabled' : ''}>练 ${Math.min(EXN, left)} 题 · ${fmtClock(Math.min(EXN, left) * per)}</button>
    </div>`;
  }).join('');
  mount(`<section class="card">
    <div class="sec-head"><h1>额外练习</h1><span class="muted">每天任务完成后开放 · 不计金币 · 错题照样进错题本</span></div>
    ${!unlocked ? `<div class="notice">先完成今天的${s.p && !s.planDone ? '新题关卡' : ''}${!s.revDone ? (s.p && !s.planDone ? '和' : '') + '错题巩固' : ''}，额外练习就会解锁。</div>` : ''}
    ${active ? `<div class="notice">有一组额外练习还没做完（${esc(typeName(active.type))}，剩余 ${fmtClock(timerLeft(active))}）。<button class="btn small" id="exResume">继续</button></div>` : ''}
    <div class="ex-count">每组题数：${[5, 10, 15, 20].map((n) => `<button class="chip ${EXN === n ? 'on' : ''}" data-n="${n}">${n}</button>`).join('')}</div>
    <div class="ex-grid">${cards}</div>
  </section>`, 'extra');
  $$('.ex-count .chip').forEach((b) => (b.onclick = () => { EXN = +b.dataset.n; VIEWS.extra(); }));
  $$('.ex-go').forEach((b) => (b.onclick = () => {
    const e = newExtra(b.dataset.t, EXN);
    VIEW = { name: 'practice', params: {} };
    startSession({ kind: 'extra', id: e.id });
  }));
  const rs = $('#exResume');
  if (rs) rs.onclick = () => { VIEW = { name: 'practice', params: {} }; startSession({ kind: 'extra', id: active.id }); };
};

/* ============ 萌宠小窝 ============ */
VIEWS.pet = () => {
  const coins = coinsEarned();
  const ps = petState();
  const ap = activePet(coins);
  const card = (u, kind) => {
    const ok = coins >= u.at;
    const using = kind === 'pet' ? ap.cat === u.id : kind === 'wear' ? ap.wear === u.id : !ap.hideDeco.includes(u.id);
    const img = kind === 'pet' ? `img/cat_${u.id}.png` : kind === 'wear' ? `img/acc_${u.id}.png` : `img/deco_${u.id}.png`;
    const btn = !ok ? `<span class="lock">累计 ${u.at} 金币解锁</span>`
      : kind === 'pet' ? (using ? '<span class="using">陪伴中</span>' : `<button class="btn small pk" data-kind="pet" data-id="${u.id}">换它陪我</button>`)
        : kind === 'wear' ? `<button class="btn small pk" data-kind="wear" data-id="${u.id}">${using ? '摘下' : '戴上'}</button>`
          : `<button class="btn small pk" data-kind="deco" data-id="${u.id}">${using ? '收起' : '摆出来'}</button>`;
    return `<div class="pk-card ${ok ? '' : 'locked'} ${using && ok ? 'using' : ''}"><div class="pk-img"><img alt="" src="${img}"></div><b>${esc(u.name)}</b>${u.desc ? `<small class="muted">${esc(u.desc)}</small>` : ''}${btn}</div>`;
  };
  const items = allUnlocks();
  const ladder = items.map((u) => `<li class="${coins >= u.at ? 'got' : ''}"><span class="ld-at"><i class="coin sm"></i>${u.at}</span><span>${KIND_CN[u.kind]} · ${esc(u.name)}</span>${coins >= u.at ? '<em>已解锁</em>' : `<em class="muted">还差 ${u.at - coins}</em>`}</li>`).join('');
  const L = levelRange(coins);
  mount(`<section class="card pet-hero">
      <div class="sec-head"><h1>萌宠小窝</h1><span class="muted">按累计获得的金币解锁，兑换美元后不会失去</span></div>
      ${roomHTML({ coins, id: 'petRoom' })}
      <div class="pet-bar">
        <div><b>${esc(petName(ap.cat))}</b> · Lv ${L.l}<div class="pxbar thin"><i style="width:${L.to ? pct(coins - L.from, L.to - L.from) : 100}%"></i></div><small class="muted">${L.to ? `再得 ${L.to - coins} 金币升到 Lv ${L.l + 1}` : '已满级'}</small></div>
        <div class="anim-btns"><span class="muted">看看动作：</span><button class="chip" data-anim="hop">答对跳跃</button><button class="chip" data-anim="party">通关庆祝</button></div>
      </div>
    </section>
    <section class="card"><div class="sec-head"><h2>猫咪</h2></div><div class="pk-grid">${PETS.map((u) => card({ ...u, at: unlockAt(u) }, 'pet')).join('')}</div></section>
    <section class="card"><div class="sec-head"><h2>配饰</h2><span class="muted">每只猫都能戴</span></div><div class="pk-grid">${WEARS.map((u) => card({ ...u, at: unlockAt(u) }, 'wear')).join('')}</div></section>
    <section class="card"><div class="sec-head"><h2>小窝装饰</h2></div><div class="pk-grid">${DECOS.map((u) => card({ ...u, at: unlockAt(u) }, 'deco')).join('')}</div></section>
    <div class="two-col">
      <section class="card"><div class="sec-head"><h2>解锁路线</h2><span class="muted">累计 ${coins} 金币</span></div><ol class="ladder">${ladder}</ol></section>
      ${redeemHTML(true)}
    </div>`, 'pet');
  bindPetPoke($('#petRoom'));
  $$('.anim-btns .chip').forEach((b) => (b.onclick = () => playPet($('#petRoom .pet'), b.dataset.anim)));
  $$('.pk').forEach((b) => (b.onclick = () => {
    const s = petState();
    if (b.dataset.kind === 'pet') s.cat = b.dataset.id;
    if (b.dataset.kind === 'wear') s.wear = s.wear === b.dataset.id ? null : b.dataset.id;
    if (b.dataset.kind === 'deco') { s.hideDeco = s.hideDeco || []; s.hideDeco = s.hideDeco.includes(b.dataset.id) ? s.hideDeco.filter((x) => x !== b.dataset.id) : s.hideDeco.concat(b.dataset.id); }
    Store.put('meta', 'pet', s);
    VIEWS.pet();
    playPet($('#petRoom .pet'), 'hop');
  }));
  bindRedeem(VIEWS.pet);
};

/* ============ 金币兑换 ============ */
function redeemHTML(student) {
  const L = ledger();
  const bal = coinBalance(), pend = coinsPending();
  const canConfirm = Store.canWrite;
  const items = L.items.slice().reverse().map((i) => `<li><span>${mdw(laDate(new Date(i.at)))}</span><b>${i.coins} 金币 = $${i.coins}</b>
    ${i.status === 'done' ? `<em class="ok-tag">已兑换 ${i.doneAt ? md(laDate(new Date(i.doneAt))) : ''}</em>` : canConfirm && !student ? `<button class="btn small rd-ok" data-id="${i.id}">确认已给</button>` : '<em class="muted">等爸爸确认</em>'}
    ${i.status === 'pending' && student && Store.canWrite ? `<button class="lnk danger rd-cancel" data-id="${i.id}">撤回</button>` : ''}</li>`).join('');
  return `<section class="card redeem">
    <div class="sec-head"><h2>金币兑换</h2><span class="muted">1 金币 = 1 美元</span></div>
    <div class="mini-stats"><div><b>${coinsEarned()}</b><span>累计获得</span></div><div><b>${coinsRedeemed()}</b><span>已兑换</span></div><div><b class="coin-txt">${bal}</b><span>可兑换</span></div></div>
    ${student && Store.canWrite ? `<form class="rd-form" id="rdForm"><label for="rdN">申请兑换</label><input id="rdN" type="number" min="1" max="${Math.max(0, bal - pend)}" placeholder="金币数"><button class="btn small" type="submit" ${bal - pend <= 0 ? 'disabled' : ''}>提交给爸爸</button></form>` : ''}
    <ul class="simple-list rd-list">${items || '<li class="empty">还没有兑换记录。</li>'}</ul>
  </section>`;
}
function bindRedeem(rerender) {
  const f = $('#rdForm');
  if (f) f.onsubmit = (e) => {
    e.preventDefault();
    const n = Math.floor(+$('#rdN').value);
    const max = coinBalance() - coinsPending();
    if (!n || n < 1 || n > max) { toast(`可以申请 1 到 ${max} 金币`, 'warn'); return; }
    const L = clone(ledger());
    L.items.push({ id: uid(), coins: n, at: Date.now(), status: 'pending' });
    Store.put('meta', 'ledger', L);
    toast('已提交，等爸爸确认');
    rerender();
  };
  $$('.rd-ok').forEach((b) => (b.onclick = () => {
    const L = clone(ledger());
    const it = L.items.find((x) => x.id === b.dataset.id);
    if (it) { it.status = 'done'; it.doneAt = Date.now(); }
    Store.put('meta', 'ledger', L);
    toast('已确认兑换');
    rerender();
  }));
  $$('.rd-cancel').forEach((b) => (b.onclick = () => {
    const L = clone(ledger());
    L.items = L.items.filter((x) => x.id !== b.dataset.id);
    Store.put('meta', 'ledger', L);
    rerender();
  }));
}

/* ============ 周报页 ============ */
function allWeekStarts() {
  const set = new Set([weekStart(todayStr())]);
  Store.all('runs').forEach((r) => set.add(weekStart(r.startedOn)));
  Store.all('reviews').forEach((r) => set.add(weekStart(r.date)));
  return [...set].filter((w) => w >= weekStart(START)).sort().reverse();
}
VIEWS.weekly = () => {
  const weeks = allWeekStarts();
  mount(`<section class="card"><div class="sec-head"><h1>周报</h1><span class="muted">每周日做完任务后自动结算</span></div>
    ${weeks.map((ws) => weekCardHTML(weekReport(ws))).join('')}</section>`, 'weekly');
};

/* ============ 家长视图 ============ */
VIEWS.parent = () => {
  const T = todayStr();
  const ws = weekStart(T);
  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDays(ws, i));
  const rows = days.map((d) => {
    const runs = Store.all('runs').filter((r) => r.startedOn === d);
    const rev = Store.get('reviews', d);
    const r = runs[0];
    const secTxt = (sec) => { if (!r) return '—'; const S = r.sections[sec]; const c = sum(S.stages.filter((x) => x.status === 'done'), (x) => x.correct), n = sum(S.stages.filter((x) => x.status === 'done'), (x) => x.total); return n ? `${pct(c, n)}%（${c}/${n}）${S.doneAt ? ' · ' + fmtClock(S.usedMs) : ''}` : '未开始'; };
    const plan = planOfDate(d);
    return `<tr class="${d === T ? 'today' : ''}"><td>${mdw(d)}</td>
      <td>${r ? (r.doneAt ? '<span class="ok-tag">完成</span>' : '进行中') : plan ? (d < T ? '<span class="bad-tag">未做</span>' : '待做') : '—'}</td>
      <td>${secTxt('rw')}</td><td>${secTxt('math')}</td>
      <td>${rev && !rev.empty ? (rev.doneAt ? `完成 ${(rev.sections.rw.correct || 0) + (rev.sections.math.correct || 0)}/${rev.sections.rw.total + rev.sections.math.total}` : '未完成') : '—'}</td>
      <td>${coinsOnDate(d) || '—'}</td></tr>`;
  }).join('');
  const past = allWeekStarts().filter((w) => w !== ws);
  mount(`${ROLE === 'student' ? '<div class="notice">这是家长看到的页面（预览）。</div>' : ''}
    <section class="card"><div class="sec-head"><h1>家长视图</h1><button class="btn small ghost" id="refresh">刷新数据</button></div>
      ${weekCardHTML(weekReport(ws))}
    </section>
    <section class="card"><div class="sec-head"><h2>本周每日答题情况</h2><span class="muted">美西时间</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>日期</th><th>新题</th><th>阅读 正确率 · 用时</th><th>数学 正确率 · 用时</th><th>错题巩固</th><th>金币</th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>
    ${redeemHTML(false)}
    ${past.length ? `<section class="card"><div class="sec-head"><h2>往期周报</h2></div>${past.map((w) => weekCardHTML(weekReport(w), { pet: false })).join('')}</section>` : ''}`, 'parent');
  bindRefresh();
  bindRedeem(VIEWS.parent);
};

/* ============ 老师视图 ============ */
VIEWS.teacher = () => {
  const st = typeStats();
  const order = Object.keys(TYPE_NAME);
  const rows = Object.values(st).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)).map((x) => {
    const last = x.sessions.slice(-3).map((s) => `<span class="spark-v" title="${md(s.d)}">${Math.round(s.acc * 100)}</span>`).join('');
    return `<tr><td><span class="badge ${typeSec(x.type)}">${SEC_NAME[typeSec(x.type)]}</span> ${esc(typeName(x.type))}</td>
      <td>${x.q || '—'}</td><td>${x.q ? pct(x.c, x.q) + '%' : '—'}</td><td>${x.q ? fmtSec(x.ms / x.q) : '—'}</td>
      <td class="spark-cell">${last || '—'}</td>
      <td>${x.xq ? `${pct(x.xc, x.xq)}%（${x.xq}）` : '—'}</td>
      <td>${x.rq ? `${pct(x.rc, x.rq)}%（${x.rq}）` : '—'}</td>
      <td>${(x.wOpen || 0)} / ${(x.wDone || 0)}</td></tr>`;
  }).join('') || '<tr><td colspan="8" class="empty">还没有做题数据。</td></tr>';
  const render = () => {
    mount(`${ROLE === 'student' ? '<div class="notice">这是老师看到的页面（预览）。</div>' : ''}
      <section class="card"><div class="sec-head"><h1>老师视图</h1><button class="btn small ghost" id="refresh">刷新数据</button></div>
        <p class="muted">每日新题按题型统计；“最近 3 次”是最近三次该题型关卡的正确率（%）。难度均为 Hard（题库不足时会用 Medium 补充，题目页有标注）。</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>题型</th><th>新题数</th><th>正确率</th><th>平均每题</th><th>最近 3 次</th><th>额外练习</th><th>错题巩固</th><th>错题 待复习/已掌握</th></tr></thead><tbody>${rows}</tbody></table></div>
      </section>
      <section class="card"><div class="sec-head"><h2>错题详情</h2><span class="muted">点「查看题目与解析」看原题、学生答案和笔记</span></div>
        ${wbFilters()}<ul class="wb-list">${wrongList(true)}</ul></section>`, 'teacher');
    bindRefresh();
    bindWrongList(true, render);
  };
  render();
};
function bindRefresh() {
  const b = $('#refresh');
  if (b) b.onclick = async () => { b.disabled = true; await Store.loadAll(COLLECTIONS); go(VIEW.name, VIEW.params); toast('已刷新'); };
}

/* ============ 设置 ============ */
VIEWS.settings = () => {
  const s = settings();
  const items = allUnlocks();
  mount(`<section class="card settings">
    <div class="sec-head"><h1>设置</h1></div>
    <form id="setForm" class="set-form">
      <label>答题页显示的名字<input id="setName" value="${esc(s.name || '')}" placeholder="例如 Ricky"></label>
      <label>每天错题巩固上限（每部分，0 = 全部做完）<input id="setCap" type="number" min="0" value="${+s.reviewCap || 0}"></label>
      <h3>解锁门槛（累计金币）</h3>
      <div class="set-unlocks">${items.map((u) => `<label><span>${KIND_CN[u.kind]} · ${esc(u.name)}</span><input type="number" min="0" data-id="${u.id}" value="${u.at}"></label>`).join('')}</div>
      <button class="btn primary" type="submit">保存设置</button>
    </form>
    <div class="notice">数据保存位置：${Store.mode === 'cloud' ? 'Supabase 云端（任何设备登录都能接着做；家长和老师看到的是同一份数据）' : '这个浏览器本机（调试模式）'}。</div>
  </section>`, 'settings');
  $('#setForm').onsubmit = (e) => {
    e.preventDefault();
    const n = clone(settings());
    n.name = $('#setName').value.trim();
    n.reviewCap = Math.max(0, Math.floor(+$('#setCap').value || 0));
    n.unlocks = {};
    $$('.set-unlocks input').forEach((i) => (n.unlocks[i.dataset.id] = Math.max(0, Math.floor(+i.value || 0))));
    saveSettings(n);
    toast('设置已保存');
    VIEWS.settings();
  };
};
