/* ============ 关卡总结 ============ */
function nextInRun(run) {
  for (const sec of ['rw', 'math']) {
    const idx = run.sections[sec].stages.findIndex((x) => x.status !== 'done');
    if (idx >= 0) return { kind: 'stage', id: run.dayId, sec, idx };
  }
  return null;
}
function nextButton(nx, fromSec) {
  const T = todayStr();
  if (!nx) {
    const s = todayStatus(T);
    if (s.hasTasks && s.allDone) return '<button class="btn primary big" id="nxBtn" data-act="settle">今日结算 ▶</button>';
    return '<button class="btn primary big" data-go="home">回首页</button>';
  }
  let label;
  if (nx.kind === 'stage') {
    const st = runOf(nx.id).sections[nx.sec].stages[nx.idx];
    label = nx.sec !== fromSec && fromSec === 'rw' ? `进入数学：${typeShort(st.type)}` : `下一关：${typeShort(st.type)}`;
  } else if (nx.kind === 'review') label = fromSec && nx.sec !== fromSec && !nx.fresh ? `下一部分：${SEC_NAME[nx.sec]}错题` : '开始错题巩固';
  else label = '继续';
  return `<button class="btn primary big" id="nxBtn">${label} ▶</button>`;
}
function bindNext(nx) {
  const b = $('#nxBtn');
  if (!b) return;
  b.onclick = () => {
    if (b.dataset.act === 'settle') { go('home'); if (!$('.settle-modal')) showSettlement(todayStr()); return; }
    if (nx.kind === 'stage') go('intro', { kind: 'run', id: nx.id, sec: nx.sec, idx: nx.idx });
    else runTask(nx);
  };
}
function qgridHTML(qids, ans, resultMap) {
  return `<div class="qgrid">${qids.map((id, i) => {
    const ok = resultMap ? resultMap[id] : isCorrect(QB[id], ans[id]);
    const blank = !(ans[id] && ans[id].c != null && ans[id].c !== '');
    return `<button class="qg ${ok ? 'ok' : 'bad'}" data-i="${i}" title="${ok ? '答对' : blank ? '未作答' : '答错'}"><span>${i + 1}</span><i>${ok ? '✓' : blank ? '–' : '✗'}</i></button>`;
  }).join('')}</div>`;
}
function bindQgrid(qids, ans, title, back) {
  $$('.qg').forEach((b) => (b.onclick = () => go('qview', { list: qids.map((id) => ({ qid: id, a: ans[id] })), idx: +b.dataset.i, title, back })));
}

VIEWS.stage = (p) => {
  const run = runOf(p.id), S = run.sections[p.sec], st = S.stages[p.idx];
  const h = st.hist;
  const accR = st.total ? st.correct / st.total : 0;
  const good = h ? accR >= h.acc : accR >= 0.7;
  const ap = activePet();
  const T = todayStr();
  const nx = nextInRun(run) || (run.startedOn === T && !run.makeup ? nextTask(T) : null);
  const diff = h ? Math.round(accR * 100) - Math.round(h.acc * 100) : null;
  const all = dayStages(run), pos = all.findIndex((x) => x.sec === p.sec && x.idx === p.idx);
  mount(`<section class="card result">
    <div class="result-top">
      <div class="result-pet">${petHTML({ cat: ap.cat, wear: ap.wear, h: 150, mode: p.fresh ? (good ? 'party' : 'hop') : 'idle', extraClass: 'pokeable' })}</div>
      <div class="result-main">
        <div class="kicker">第 ${pos + 1} / ${all.length} 关 · ${SEC_NAME[p.sec]} · ${esc(PLAN_LABEL(PLAN.find((x) => x.id === run.dayId)))}</div>
        <h1 class="result-title">${good ? '关卡完成！' : '关卡完成'}<span>${esc(typeName(st.type))}</span></h1>
        <div class="result-stats">
          <div class="rs"><span>正确率</span><b>${Math.round(accR * 100)}%</b><small>${st.correct} / ${st.total} 题</small></div>
          <div class="rs"><span>往期同题型平均</span><b>${h ? Math.round(h.acc * 100) + '%' : '—'}</b><small>${h ? (diff >= 0 ? `高出 ${diff} 个百分点` : `低了 ${-diff} 个百分点`) : '第一次练，记为基线'}</small></div>
          <div class="rs"><span>用时</span><b>${fmtClock(st.timeMs)}</b><small>每题 ${fmtSec(st.timeMs / st.total)}${h ? `，往期 ${fmtSec(h.msPerQ)}` : ''}</small></div>
        </div>
        ${S.doneAt ? `<p class="sec-done">${SEC_NAME[p.sec]}部分全部完成，共用 ${fmtDur(S.usedMs)}。${coinLine(run, p.sec)}</p>` : `<p class="muted">${SEC_NAME[p.sec]}倒计时已暂停，剩余 ${fmtClock(timerLeft(S))}。进入下一关后继续。</p>`}
      </div>
    </div>
    <div class="sec-head"><h2>逐题回顾</h2><span class="muted">点题号看正确答案与解析，可以写笔记；错题已自动收进错题本</span></div>
    ${qgridHTML(st.qids, st.ans)}
    <div class="result-btns">${nextButton(nx, p.sec)}<button class="btn ghost" data-go="home">回首页</button></div>
  </section>`, 'home');
  bindPetPoke($('.result'));
  bindQgrid(st.qids, st.ans, `${typeName(st.type)} · ${md(run.startedOn)}`, { name: 'stage', params: { id: p.id, sec: p.sec, idx: p.idx } });
  bindNext(nx);
};
function coinLine(run, sec) {
  const k = sec === 'rw' ? 'rw' : 'math';
  const got = (run.coins[k + 'Speed'] || 0) + (run.coins[k + 'Acc'] || 0);
  return got ? `本部分奖励 <b class="coin-txt">+${got}</b> 金币。` : '';
}

VIEWS.reviewDone = (p) => {
  const r = Store.get('reviews', p.id), S = r.sections[p.sec];
  const ap = activePet();
  const other = p.sec === 'rw' ? 'math' : 'rw';
  const nx = r.sections[other].status !== 'done' ? { kind: 'review', sec: other } : null;
  const good = S.total && S.correct / S.total >= 0.6;
  mount(`<section class="card result">
    <div class="result-top">
      <div class="result-pet">${petHTML({ cat: ap.cat, wear: ap.wear, h: 150, mode: p.fresh ? (r.doneAt ? 'party' : 'hop') : 'idle', extraClass: 'pokeable' })}</div>
      <div class="result-main">
        <div class="kicker">错题巩固 · ${SEC_NAME[p.sec]} · ${md(r.date)}</div>
        <h1 class="result-title">${good ? '巩固成功！' : '再接再厉'}<span>${SEC_NAME[p.sec]}错题</span></h1>
        <div class="result-stats">
          <div class="rs"><span>答对</span><b>${S.correct}/${S.total}</b><small>答对的题延后复习</small></div>
          <div class="rs"><span>答错</span><b>${S.total - S.correct}</b><small>明天再做一次</small></div>
          <div class="rs"><span>用时</span><b>${fmtClock(S.usedMs)}</b><small>限时 ${fmtClock(S.limitMs)}</small></div>
        </div>
        ${r.doneAt ? `<p class="sec-done">今天的错题巩固完成${r.coin ? `，奖励 <b class="coin-txt">+${r.coin}</b> 金币` : ''}。</p>` : ''}
      </div>
    </div>
    <div class="sec-head"><h2>逐题回顾</h2><span class="muted">绿色的题下次复习时间已延后</span></div>
    ${qgridHTML(S.qids, S.ans, S.result)}
    <div class="result-btns">${nextButton(nx, p.sec)}<button class="btn ghost" data-go="home">回首页</button></div>
  </section>`, 'home');
  bindPetPoke($('.result'));
  bindQgrid(S.qids, S.ans, `错题巩固 · ${md(r.date)}`, { name: 'reviewDone', params: { id: p.id, sec: p.sec } });
  bindNext(nx);
};

VIEWS.extraDone = (p) => {
  const e = Store.get('extras', p.id);
  const ap = activePet();
  mount(`<section class="card result">
    <div class="result-top">
      <div class="result-pet">${petHTML({ cat: ap.cat, wear: ap.wear, h: 150, mode: p.fresh ? 'hop' : 'idle', extraClass: 'pokeable' })}</div>
      <div class="result-main">
        <div class="kicker">额外练习 · 不计金币 · ${md(e.date)}</div>
        <h1 class="result-title">练习完成<span>${esc(typeName(e.type))}</span></h1>
        <div class="result-stats">
          <div class="rs"><span>正确率</span><b>${pct(e.correct, e.total)}%</b><small>${e.correct}/${e.total}</small></div>
          <div class="rs"><span>用时</span><b>${fmtClock(e.usedMs)}</b><small>每题 ${fmtSec(e.usedMs / e.total)}</small></div>
          <div class="rs"><span>剩余可练</span><b>${extraPool(e.type).length}</b><small>本题型额外题</small></div>
        </div>
      </div>
    </div>
    <div class="sec-head"><h2>逐题回顾</h2></div>
    ${qgridHTML(e.qids, e.ans)}
    <div class="result-btns"><button class="btn primary" data-go="extra">再练一组</button><button class="btn ghost" data-go="home">回首页</button></div>
  </section>`, 'extra');
  bindPetPoke($('.result'));
  bindQgrid(e.qids, e.ans, `额外练习 · ${typeName(e.type)}`, { name: 'extraDone', params: { id: p.id } });
};

/* ============ 题目解析（逐题查看） ============ */
VIEWS.qview = (p) => {
  const item = p.list[p.idx], q = QB[item.qid];
  if (!q) { toast('找不到这道题'); return go('home'); }
  const a = item.a || {};
  const answered = a.c != null && a.c !== '';
  const ok = isCorrect(q, a);
  const w = Store.get('wrong', q.id);
  const note = (Store.get('notes', q.id) || {}).text || '';
  const canEdit = ROLE === 'student' && Store.canWrite;
  const isMath = q.sec === 'math';
  const two = q.stim && q.stim.trim();
  const opts = q.kind === 'mcq'
    ? `<div class="bb-opts review">${q.opts.map((o, k) => {
      const L = 'ABCD'[k];
      const cls = L === q.ans ? 'right' : L === a.c ? 'wrongpick' : '';
      return `<div class="opt-row ${cls} ${L === a.c ? 'sel' : ''}"><div class="opt"><span class="opt-l">${L}</span><span class="qhtml opt-t">${o}</span>${L === q.ans ? '<em class="tag ok">正确答案</em>' : L === a.c ? '<em class="tag bad">你的选择</em>' : ''}</div></div>`;
    }).join('')}</div>`
    : `<div class="spr-result"><div>你的答案：<b class="${ok ? 'ok' : 'bad'}">${answered ? esc(a.c) : '未作答'}</b></div><div>正确答案：<b class="ok">${esc(answerText(q))}</b></div></div>`;
  const backP = p.back || { name: 'home', params: {} };
  $('#app').innerHTML = `<div class="bb review-mode">
    <header class="bb-top">
      <div class="bb-title"><div class="bb-sec">${esc(p.title || '题目解析')}</div><div class="bb-sub"><span class="bb-chip">${esc(typeName(q.type))} · ${q.diff === 'H' ? 'Hard' : q.diff === 'M' ? 'Medium' : q.diff === 'E' ? 'Easy' : '难度未知'} · ${q.src ? esc(q.src) : 'Question ID ' + esc(q.id)}</span></div></div>
      <div class="bb-verdict ${ok ? 'ok' : 'bad'}">${!answered ? '未作答' : ok ? '答对了' : '答错了'}${a.t ? `<small>用时 ${fmtSec(a.t)}</small>` : ''}</div>
      <div class="bb-tools"><button class="bb-tool" id="qvBack">${ICON.exit}<span>返回</span></button></div>
    </header>
    <div class="bb-rule"></div>
    <div class="bb-main ${two ? 'two' : 'one'} ${isMath ? 'math' : 'rw'}">
      ${two ? `<section class="bb-pane bb-left"><div class="qhtml hl-zone" data-k="p">${q.stim}</div></section><div class="bb-divider"></div>` : ''}
      <section class="bb-pane bb-right"><div class="bb-qwrap">
        <div class="bb-qbar"><span class="bb-num">${p.idx + 1}</span><span class="bb-qtype">${esc(typeName(q.type))}</span></div>
        <div class="qhtml bb-stem hl-zone" data-k="s">${q.stem}</div>
        ${opts}
        <div class="explain"><h4>解析 <span class="muted">${q.src ? '（Claude 编写）' : '（College Board 官方解析）'}</span></h4><div class="qhtml">${q.rat}</div></div>
        <div class="note-box">
          <h4>我的笔记</h4>
          ${canEdit ? `<textarea id="qvNote" rows="3" placeholder="写下订正思路、易错点…">${esc(note)}</textarea><div class="nb-btns"><span class="muted" id="qvNoteSaved"></span><button class="btn small" id="qvNoteSave">保存笔记</button></div>` : `<p>${note ? esc(note) : '<span class="muted">没有笔记</span>'}</p>`}
        </div>
        ${canEdit ? `<div class="wb-row">${w ? `<span class="wb-in">已在错题本 · ${w.mastered ? '已掌握' : `下次复习 ${md(w.due)}`}</span><button class="lnk danger" id="qvWbDel">移出错题本</button>` : '<button class="btn small ghost" id="qvWbAdd">加入错题本</button>'}</div>` : ''}
      </div></section>
    </div>
    <footer class="bb-foot">
      <div class="bb-name">${p.idx + 1} / ${p.list.length}</div>
      <div class="qv-dots">${p.list.map((it, k) => `<button class="qd ${isCorrect(QB[it.qid], it.a || {}) ? 'ok' : 'bad'} ${k === p.idx ? 'cur' : ''}" data-k="${k}" aria-label="第${k + 1}题"></button>`).join('')}</div>
      <div class="bb-btns">${p.idx > 0 ? '<button class="bb-btn" id="qvPrev">Back</button>' : ''}${p.idx < p.list.length - 1 ? '<button class="bb-btn" id="qvNext">Next</button>' : '<button class="bb-btn" id="qvDone">完成</button>'}</div>
    </footer>
  </div>`;
  fixMath($('.bb'));
  $$('.hl-zone').forEach((z) => applyHL(z, (a.hl || []).filter((h) => h.k === z.dataset.k)));
  const to = (k) => go('qview', { ...p, idx: k });
  $('#qvBack').onclick = () => go(backP.name, backP.params);
  const pv = $('#qvPrev'); if (pv) pv.onclick = () => to(p.idx - 1);
  const nv = $('#qvNext'); if (nv) nv.onclick = () => to(p.idx + 1);
  const dn = $('#qvDone'); if (dn) dn.onclick = () => go(backP.name, backP.params);
  $$('.qd').forEach((b) => (b.onclick = () => to(+b.dataset.k)));
  if (canEdit) {
    $('#qvNoteSave').onclick = () => {
      const txt = $('#qvNote').value.trim();
      if (txt) Store.put('notes', q.id, { text: txt, updatedAt: Date.now() }); else Store.del('notes', q.id);
      $('#qvNoteSaved').textContent = '已保存';
    };
    const add = $('#qvWbAdd'); if (add) add.onclick = () => { addWrongManual(q.id, a.c); toast('已加入错题本，明天开始复习'); go('qview', p); };
    const del = $('#qvWbDel'); if (del) del.onclick = () => confirmBox('移出错题本？', '移出后这道题不再安排复习，笔记会保留。', '移出', () => { Store.del('wrong', q.id); go('qview', p); });
  }
};

/* ============ 当天结算 ============ */
function maybeSettle() {
  if (ROLE !== 'student' || !Store.canWrite) return;
  const T = todayStr(), s = todayStatus(T);
  if (!s.hasTasks || !s.allDone) return;
  const d = Store.get('days', T);
  if (d && d.settledAt) return;
  showSettlement(T);
}
function showSettlement(T) {
  const runs = Store.all('runs').filter((r) => r.startedOn === T);
  const rev = Store.get('reviews', T);
  const before = coinsEarned(T);
  const today = coinsOnDate(T);
  const after = before + today;
  const ap = activePet(after);
  const rows = [];
  for (const r of runs) {
    const tag = runs.length > 1 ? `（${PLAN_LABEL(PLAN.find((x) => x.id === r.dayId))}）` : '';
    const c = r.coins || {}, n = r.notes || {};
    rows.push(['阅读速度奖' + tag, c.rwSpeed, n.rwSpeed, r.sections.rw.doneAt]);
    rows.push(['阅读正确率奖' + tag, c.rwAcc, n.rwAcc, r.sections.rw.doneAt]);
    rows.push(['数学速度奖' + tag, c.mathSpeed, n.mathSpeed, r.sections.math.doneAt]);
    rows.push(['数学正确率奖' + tag, c.mathAcc, n.mathAcc, r.sections.math.doneAt]);
    rows.push(['完成当天习题' + tag, c.done, r.doneAt ? '新题全部完成' : '还没做完', r.doneAt]);
  }
  rows.push(['完成错题巩固', rev ? rev.coin : 0, !rev || rev.empty ? '今天没有到期的错题' : rev.doneAt ? `答对 ${(rev.sections.rw.correct || 0) + (rev.sections.math.correct || 0)}/${rev.sections.rw.total + rev.sections.math.total}` : '还没做完', true]);
  const newly = allUnlocks().filter((u) => u.at > before && u.at <= after);
  const m = modal(`<div class="settle">
    <div class="settle-pet">${petHTML({ cat: ap.cat, wear: ap.wear, h: 130, mode: 'party' })}</div>
    <div class="kicker">${mdw(T)}</div>
    <h2 class="settle-title">今日结算</h2>
    <ul class="settle-rows">${rows.map(([k, v, note, ready]) => `<li class="${v ? 'got' : ''}"><span class="sr-k">${esc(k)}</span><span class="sr-note">${esc(ready ? note || '' : '还没完成')}</span><b>${v ? '+' + v : '0'}</b></li>`).join('')}</ul>
    <div class="settle-total"><span>今日获得</span><b><i class="coin"></i>+${today}</b></div>
    <div class="settle-sub">累计获得 ${after} 金币 · 可兑换 ${coinBalance()} 美元 · Lv ${levelOf(after)}</div>
    ${newly.length ? `<div class="settle-new"><b>解锁新内容！</b>${newly.map((u) => `<span class="unl">${KIND_CN[u.kind]}：${esc(u.name)}</span>`).join('')}</div>` : ''}
    <button class="btn primary big" id="settleOk">${dow(T) === 0 ? '查看本周周报' : '好耶'}</button>
  </div>`, { cls: 'settle-modal' });
  if (Store.canWrite && ROLE === 'student') Store.put('days', T, { date: T, settledAt: Date.now(), coins: today });
  m.el.querySelector('#settleOk').onclick = () => {
    m.close();
    if (dow(T) === 0) showWeekly(weekStart(T));
    else if (VIEW.name === 'home') go('home');
  };
}

/* ============ 周报 ============ */
function weekCardHTML(rep, opts = {}) {
  const lvUp = rep.levelEnd > rep.levelStart;
  const live = todayStr() <= rep.we;
  return `<div class="week-card">
    <div class="wk-head"><h3>${md(rep.ws)} – ${md(rep.we)}${live ? '<span class="live">进行中</span>' : ''}</h3><span class="muted">完成新题 ${rep.daysDone} 天 · 错题巩固 ${rep.reviewsDone} 天</span></div>
    <div class="wk-grid">
      <div><span>阅读总正确率</span><b>${rep.rwAcc[1] ? pct(rep.rwAcc[0], rep.rwAcc[1]) + '%' : '—'}</b><small>${rep.rwAcc[0]}/${rep.rwAcc[1]} 题</small></div>
      <div><span>数学总正确率</span><b>${rep.mathAcc[1] ? pct(rep.mathAcc[0], rep.mathAcc[1]) + '%' : '—'}</b><small>${rep.mathAcc[0]}/${rep.mathAcc[1]} 题</small></div>
      <div><span>阅读平均用时</span><b>${rep.rwAvg != null ? fmtClock(rep.rwAvg) : '—'}</b><small>每天整个阅读部分</small></div>
      <div><span>数学平均用时</span><b>${rep.mathAvg != null ? fmtClock(rep.mathAvg) : '—'}</b><small>每天整个数学部分</small></div>
      <div><span>本周金币</span><b class="coin-txt">+${rep.coins}</b><small>= ${rep.coins} 美元</small></div>
      <div><span>错题巩固</span><b>${rep.revQ ? pct(rep.revC, rep.revQ) + '%' : '—'}</b><small>${rep.revC}/${rep.revQ} 题答对</small></div>
    </div>
    <div class="wk-pet">${opts.pet !== false ? petHTML({ cat: activePet(rep.after).cat, wear: activePet(rep.after).wear, h: 72, mode: lvUp ? 'party' : 'idle' }) : ''}
      <div><b>萌宠升级：</b>${lvUp ? `Lv ${rep.levelStart} → <b>Lv ${rep.levelEnd}</b>` : `保持 Lv ${rep.levelEnd}`}
        ${rep.unlocked.length ? `<br>本周解锁：${rep.unlocked.map((u) => `${KIND_CN[u.kind]}「${esc(u.name)}」`).join('、')}` : ''}
        ${(() => { const nu = nextUnlock(rep.after); return nu ? `<br><span class="muted">离下一个解锁（${esc(nu.name)}）还差 ${nu.at - rep.after} 金币</span>` : ''; })()}</div>
    </div>
  </div>`;
}
function showWeekly(ws) {
  const rep = weekReport(ws);
  const m = modal(`<div class="weekly-modal"><div class="kicker">每周结算</div><h2 class="settle-title">本周周报</h2>${weekCardHTML(rep)}<button class="btn primary big" id="wkOk">下周继续加油</button></div>`, { cls: 'wide' });
  if (Store.canWrite && ROLE === 'student') Store.put('weekly', ws, { ws, seenAt: Date.now(), coins: rep.coins, rwAcc: rep.rwAcc, mathAcc: rep.mathAcc, rwAvg: rep.rwAvg, mathAvg: rep.mathAvg, levelStart: rep.levelStart, levelEnd: rep.levelEnd });
  m.el.querySelector('#wkOk').onclick = () => { m.close(); if (VIEW.name === 'home') go('home'); };
}
