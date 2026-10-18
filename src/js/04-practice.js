/* ============ 题目 HTML 渲染 ============ */
const MML = 'http://www.w3.org/1998/Math/MathML';
// Chrome 的 MathML Core 不支持 <mfenced>，换成带括号的 <mrow>
function fixMath(root) {
  const list = [...root.getElementsByTagName('mfenced')].reverse();
  for (const f of list) {
    const open = f.hasAttribute('open') ? f.getAttribute('open') : '(';
    const close = f.hasAttribute('close') ? f.getAttribute('close') : ')';
    const seps = (f.hasAttribute('separators') ? f.getAttribute('separators') : ',').replace(/\s/g, '');
    const row = document.createElementNS(MML, 'mrow');
    const mo = (t) => { const o = document.createElementNS(MML, 'mo'); o.textContent = t; return o; };
    if (open) row.appendChild(mo(open));
    const kids = [...f.children];
    kids.forEach((k, i) => {
      row.appendChild(k);
      if (i < kids.length - 1 && seps) row.appendChild(mo(seps[Math.min(i, seps.length - 1)]));
    });
    if (close) row.appendChild(mo(close));
    f.replaceWith(row);
  }
}

/* ============ 高亮与批注 ============ */
function hlTextNodes(root) {
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && n.parentElement.closest('svg,math') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n;
  while ((n = w.nextNode())) out.push(n);
  return out;
}
function hlOffset(root, container, offset) {
  const r = document.createRange();
  r.setStart(root, 0);
  r.setEnd(container, offset);
  const frag = r.cloneContents();
  frag.querySelectorAll('svg,math').forEach((x) => x.remove());
  return frag.textContent.length;
}
function applyHL(root, list) {
  list.forEach((h, idx) => {
    let pos = 0;
    for (const t of hlTextNodes(root)) {
      const len = t.length, a = pos, b = pos + len;
      pos = b;
      if (b <= h.s || a >= h.e) continue;
      let node = t;
      const s = Math.max(h.s - a, 0), e = Math.min(h.e - a, len);
      if (e < len) node.splitText(e);
      if (s > 0) node = node.splitText(s);
      const mark = document.createElement('mark');
      mark.className = 'hl hl-' + (h.c || 'y') + (h.n ? ' has-note' : '');
      mark.dataset.h = h.i ?? idx;
      node.parentNode.insertBefore(mark, node);
      mark.appendChild(node);
    }
  });
}

/* ============ 作答会话 ============ */
let PR = null;
function makeSession(ctx) {
  if (ctx.kind === 'run') {
    const run = runOf(ctx.id), S = run.sections[ctx.sec], st = S.stages[ctx.idx];
    return {
      ctx, qids: st.qids, ans: st.ans, timer: S, holder: st, sec: ctx.sec,
      title: `Section ${ctx.sec === 'rw' ? 1 : 2}: ${SEC_FULL[ctx.sec]}`,
      chip: `关卡 ${ctx.idx + 1}/${S.stages.length} · ${typeName(st.type)}`,
      save: (now) => (now ? saveRun(run) : Store.putSoon('runs', run.dayId, run)),
      submit: (timedOut) => { submitRunStage(run, ctx.sec, ctx.idx, timedOut); },
      after: () => go('stage', { id: ctx.id, sec: ctx.sec, idx: ctx.idx, fresh: true }),
    };
  }
  if (ctx.kind === 'review') {
    const r = Store.get('reviews', ctx.id), S = r.sections[ctx.sec];
    return {
      ctx, qids: S.qids, ans: S.ans, timer: S, holder: S, sec: ctx.sec,
      title: `错题巩固: ${SEC_FULL[ctx.sec]}`,
      chip: `${SEC_NAME[ctx.sec]}错题 · ${S.qids.length} 题`,
      save: (now) => (now ? Store.put('reviews', r.date, r) : Store.putSoon('reviews', r.date, r)),
      submit: () => submitReviewSection(r, ctx.sec),
      after: () => go('reviewDone', { id: ctx.id, sec: ctx.sec, fresh: true }),
    };
  }
  const e = Store.get('extras', ctx.id);
  return {
    ctx, qids: e.qids, ans: e.ans, timer: e, holder: e, sec: e.sec,
    title: `额外练习: ${SEC_FULL[e.sec]}`,
    chip: `${typeName(e.type)} · ${e.qids.length} 题 · 不计金币`,
    save: (now) => (now ? Store.put('extras', e.id, e) : Store.putSoon('extras', e.id, e)),
    submit: () => submitExtra(e),
    after: () => go('extraDone', { id: e.id, fresh: true }),
  };
}

function startSession(ctx) {
  if (ctx.kind === 'run') startRunStage(runOf(ctx.id), ctx.sec, ctx.idx);
  else {
    const obj = ctx.kind === 'review' ? Store.get('reviews', ctx.id).sections[ctx.sec] : Store.get('extras', ctx.id);
    if (obj.status === 'todo') obj.status = 'active';
    timerStart(obj);
    if (ctx.kind === 'review') Store.put('reviews', ctx.id, Store.get('reviews', ctx.id)); else Store.put('extras', ctx.id, obj);
  }
  const sess = makeSession(ctx);
  PR = { sess, elim: false, nav: false, hideTimer: false, check: false, qStart: Date.now(), warned: timerLeft(sess.timer) <= 300000 };
  if (sess.holder.cur == null || sess.holder.cur >= sess.qids.length) sess.holder.cur = 0;
  renderPractice();
  clearInterval(window._tick);
  window._tick = setInterval(tickPractice, 500);
}

function curQid() { return PR.sess.qids[PR.sess.holder.cur]; }
function ansOf(qid) { const s = PR.sess; return (s.ans[qid] ||= {}); }
function trackTime() {
  if (!PR || PR.check) { if (PR) PR.qStart = Date.now(); return; }
  const now = Date.now(), a = ansOf(curQid());
  a.t = (a.t || 0) + (now - PR.qStart);
  PR.qStart = now;
}

function tickPractice() {
  if (!PR || VIEW.name !== 'practice') { clearInterval(window._tick); return; }
  const left = timerLeft(PR.sess.timer);
  const el = $('#bbClock');
  if (el) { el.textContent = fmtClock(left); el.parentElement.classList.toggle('low', left <= 300000); }
  if (!PR.warned && left <= 300000 && left > 0) { PR.warned = true; toast('还剩 5 分钟', 'warn'); }
  if (left <= 0) finishSession(true);
}

function finishSession(timedOut) {
  if (!PR) return;
  trackTime();
  clearInterval(window._tick);
  const sess = PR.sess;
  PR = null;
  sess.submit(timedOut);
  Store.flush();
  if (timedOut) toast('时间到，已自动交卷', 'warn');
  sess.after();
}

function leavePractice() {
  trackTime();
  PR.sess.save(true);
  clearInterval(window._tick);
  PR = null;
  go('home');
}

/* ============ Bluebook 风格界面 ============ */
const ICON = {
  bookmark: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 3h12v18l-6-4.5L6 21z" fill="currentColor"/></svg>',
  bookmarkO: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 3h12v18l-6-4.5L6 21z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  pen: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 20h4L19 9l-4-4L4 16z M14 6l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  calc: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  ref: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 3h9l3 3v15H6z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 10h6M9 14h6M9 18h4" stroke="currentColor" stroke-width="1.8"/></svg>',
  exit: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  caret: '<svg viewBox="0 0 12 12" width="11" height="11"><path d="M2 8l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 2a6 6 0 0 0-6 6c0 4.5 6 12 6 12s6-7.5 6-12a6 6 0 0 0-6-6z" fill="currentColor"/></svg>',
};

function sprDirections() {
  return `<div class="spr-dir">
    <h3>Student-produced response directions</h3>
    <ul>
      <li>答案可能不止一个时，只填其中一个。</li>
      <li>正数最多填 5 个字符，负数最多 6 个字符（负号算一个）。</li>
      <li>可以填分数或小数；小数位数过多时，填满所给的位数即可。</li>
      <li>分数不用化简；不能写带分数（3½ 要写成 7/2 或 3.5）。</li>
      <li>不要输入 %、$、逗号等符号。</li>
    </ul>
    <table class="spr-ex"><tr><th>答案</th><th>可以填</th><th>不能填</th></tr>
      <tr><td>3.5</td><td>3.5 · 7/2</td><td>3 1/2</td></tr>
      <tr><td>2/3</td><td>2/3 · .6666 · .6667 · 0.666 · 0.667</td><td>0.66 · .66</td></tr>
      <tr><td>−1/3</td><td>-1/3 · -.3333 · -0.333</td><td>-.33</td></tr></table>
  </div>`;
}

function renderPractice() {
  const s = PR.sess;
  const n = s.qids.length;
  const i = s.holder.cur;
  const qid = s.qids[i];
  const q = QB[qid];
  const a = s.ans[qid] || {};
  const left = timerLeft(s.timer);
  const isMath = s.sec === 'math';
  const name = settings().name || '我';
  let main;
  if (PR.check) {
    main = `<div class="bb-check">
      <h2>Check Your Work</h2>
      <p>交卷前检查一下：未作答的题会按错题计算，交卷后可以看到答案和解析。</p>
      <div class="bb-check-card">
        <div class="bb-check-head"><b>${esc(s.chip)}</b>${navLegend()}</div>
        <div class="bb-grid">${navGrid(true)}</div>
      </div>
    </div>`;
  } else {
    const twoPane = (q.stim && q.stim.trim()) || (isMath && q.kind === 'spr');
    const leftPane = q.stim && q.stim.trim()
      ? `<div class="qhtml hl-zone" data-k="p">${q.stim}</div>`
      : sprDirections();
    main = `<div class="bb-main ${twoPane ? 'two' : 'one'} ${isMath ? 'math' : 'rw'}">
      ${twoPane ? `<section class="bb-pane bb-left">${leftPane}</section><div class="bb-divider"></div>` : ''}
      <section class="bb-pane bb-right">
        <div class="bb-qwrap">
          <div class="bb-qbar">
            <span class="bb-num">${i + 1}</span>
            <button class="bb-mark ${a.m ? 'on' : ''}" id="bbMark">${a.m ? ICON.bookmark : ICON.bookmarkO}<span>Mark for Review</span></button>
            ${q.kind === 'mcq' ? `<button class="bb-abc ${PR.elim ? 'on' : ''}" id="bbElim" title="划掉选项"><span>ABC</span></button>` : ''}
          </div>
          <div class="qhtml bb-stem hl-zone" data-k="s">${q.stem}</div>
          ${q.kind === 'mcq' ? `<div class="bb-opts">${q.opts.map((o, k) => optRow(o, 'ABCD'[k], a)).join('')}</div>` : sprInput(a)}
        </div>
      </section>
    </div>`;
  }
  $('#app').innerHTML = `<div class="bb ${PR.elim ? 'elim' : ''}">
    <header class="bb-top">
      <div class="bb-title">
        <div class="bb-sec">${esc(s.title)}</div>
        <div class="bb-sub"><span class="bb-chip">${esc(s.chip)}</span></div>
      </div>
      <div class="bb-timer ${left <= 300000 ? 'low' : ''} ${PR.hideTimer ? 'hidden' : ''}">
        <div class="bb-clock" id="bbClock">${fmtClock(left)}</div>
        <button class="bb-hide" id="bbHide">${PR.hideTimer ? 'Show' : 'Hide'}</button>
      </div>
      <div class="bb-tools">
        ${isMath ? `<a class="bb-tool" href="https://www.desmos.com/calculator" target="_blank" rel="noopener">${ICON.calc}<span>Calculator</span></a>
        <button class="bb-tool" id="bbRef">${ICON.ref}<span>Reference</span></button>` : ''}
        <button class="bb-tool" id="bbNotes">${ICON.pen}<span>Highlights &amp; Notes</span></button>
        <button class="bb-tool" id="bbExit">${ICON.exit}<span>保存退出</span></button>
      </div>
    </header>
    <div class="bb-rule"></div>
    ${main}
    <footer class="bb-foot">
      <div class="bb-name">${esc(name)}</div>
      <button class="bb-navbtn" id="bbNav">${PR.check ? '检查页' : `Question ${i + 1} of ${n}`} ${ICON.caret}</button>
      <div class="bb-btns">
        ${PR.check || i > 0 ? '<button class="bb-btn" id="bbBack">Back</button>' : ''}
        ${PR.check ? '<button class="bb-btn primary" id="bbSubmit">提交本关</button>' : '<button class="bb-btn" id="bbNext">Next</button>'}
      </div>
    </footer>
    <div class="bb-pop ${PR.nav ? 'open' : ''}" id="bbPop">
      <div class="bb-pop-head"><b>${esc(s.chip)}</b><button class="x" id="bbPopX" aria-label="关闭">×</button></div>
      ${navLegend()}
      <div class="bb-grid">${navGrid(false)}</div>
      <button class="bb-btn ghost" id="bbGoCheck">Go to Review Page</button>
    </div>
    <div class="hl-tools" id="hlTools" hidden>
      <button data-c="y" class="sw sw-y" title="黄色高亮"></button><button data-c="b" class="sw sw-b" title="蓝色高亮"></button><button data-c="p" class="sw sw-p" title="粉色高亮"></button>
      <button data-c="note" class="hl-note-btn">批注</button>
    </div>
    <div class="hl-card" id="hlCard" hidden></div>
    <aside class="notes-drawer" id="notesDrawer" hidden></aside>
  </div>`;
  postRenderPractice();
}

function optRow(html, L, a) {
  const sel = a.c === L, crossed = (a.x || []).includes(L);
  return `<div class="opt-row ${sel ? 'sel' : ''} ${crossed ? 'crossed' : ''}" data-l="${L}">
    <button class="opt" data-l="${L}"><span class="opt-l">${L}</span><span class="qhtml opt-t">${html}</span></button>
    <button class="opt-x" data-l="${L}" title="${crossed ? '恢复' : '划掉'} ${L}">${crossed ? '<u>Undo</u>' : `<span class="xl">${L}</span>`}</button>
  </div>`;
}
function sprInput(a) {
  return `<div class="spr-box">
    <input id="sprIn" class="spr-in" autocomplete="off" spellcheck="false" maxlength="6" value="${esc(a.c || '')}" aria-label="填写答案">
    <div class="spr-prev">Answer Preview: <b id="sprPrev">${esc(a.c || '')}</b></div>
  </div>`;
}
function navLegend() {
  return `<div class="bb-legend"><span><i class="lg cur">${ICON.pin}</i>Current</span><span><i class="lg un"></i>Unanswered</span><span><i class="lg rv">${ICON.bookmark}</i>For Review</span></div>`;
}
function navGrid(fromCheck) {
  const s = PR.sess;
  return s.qids.map((id, k) => {
    const a = s.ans[id] || {};
    const answered = a.c != null && a.c !== '';
    return `<button class="g ${answered ? 'done' : ''} ${a.m ? 'rv' : ''} ${!fromCheck && k === s.holder.cur && !PR.check ? 'cur' : ''}" data-k="${k}">
      ${!fromCheck && k === s.holder.cur && !PR.check ? `<i class="gpin">${ICON.pin}</i>` : ''}${k + 1}${a.m ? `<i class="gmark">${ICON.bookmark}</i>` : ''}</button>`;
  }).join('');
}

function gotoQ(k) {
  trackTime();
  PR.check = false;
  PR.nav = false;
  PR.sess.holder.cur = Math.max(0, Math.min(PR.sess.qids.length - 1, k));
  PR.sess.save();
  renderPractice();
}

function postRenderPractice() {
  const root = $('.bb');
  fixMath(root);
  const s = PR.sess;
  $('#bbHide').onclick = () => { PR.hideTimer = !PR.hideTimer; $('.bb-timer').classList.toggle('hidden', PR.hideTimer); $('#bbHide').textContent = PR.hideTimer ? 'Show' : 'Hide'; };
  $('#bbExit').onclick = () => confirmBox('保存并退出？', '作答已保存。按规定倒计时不会暂停，回来时会接着剩余时间作答，时间到会自动交卷。', '保存退出', leavePractice);
  $('#bbNav').onclick = () => { PR.nav = !PR.nav; $('#bbPop').classList.toggle('open', PR.nav); };
  $('#bbPopX').onclick = () => { PR.nav = false; $('#bbPop').classList.remove('open'); };
  $('#bbGoCheck').onclick = () => { trackTime(); PR.check = true; PR.nav = false; renderPractice(); };
  $$('#bbPop .g, .bb-check .g').forEach((b) => (b.onclick = () => gotoQ(+b.dataset.k)));
  const back = $('#bbBack');
  if (back) back.onclick = () => (PR.check ? gotoQ(s.qids.length - 1) : gotoQ(s.holder.cur - 1));
  const next = $('#bbNext');
  if (next) next.onclick = () => {
    if (s.holder.cur < s.qids.length - 1) gotoQ(s.holder.cur + 1);
    else { trackTime(); PR.check = true; renderPractice(); }
  };
  const sub = $('#bbSubmit');
  if (sub) sub.onclick = () => {
    const un = s.qids.filter((id) => !(s.ans[id] && s.ans[id].c != null && s.ans[id].c !== '')).length;
    confirmBox('提交本关？', un ? `还有 ${un} 题没作答，提交后按错题计算。` : '全部作答完毕，提交后可以查看答案和解析。', '提交', () => finishSession(false));
  };
  const ref = $('#bbRef');
  if (ref) ref.onclick = showReference;
  $('#bbNotes').onclick = toggleNotesDrawer;
  if (PR.check) return;

  const qid = curQid(), q = QB[qid];
  const mark = $('#bbMark');
  mark.onclick = () => { const a = ansOf(qid); a.m = !a.m; s.save(); mark.classList.toggle('on', a.m); mark.innerHTML = (a.m ? ICON.bookmark : ICON.bookmarkO) + '<span>Mark for Review</span>'; };
  const el = $('#bbElim');
  if (el) el.onclick = () => { PR.elim = !PR.elim; el.classList.toggle('on', PR.elim); root.classList.toggle('elim', PR.elim); };
  $$('.opt').forEach((b) => (b.onclick = () => {
    const a = ansOf(qid), L = b.dataset.l;
    a.c = L;
    a.x = (a.x || []).filter((x) => x !== L);
    s.save();
    $$('.opt-row').forEach((r) => {
      r.classList.toggle('sel', r.dataset.l === L);
      if (r.dataset.l === L) { r.classList.remove('crossed'); r.querySelector('.opt-x').innerHTML = `<span class="xl">${L}</span>`; }
    });
  }));
  $$('.opt-x').forEach((b) => (b.onclick = () => {
    const a = ansOf(qid), L = b.dataset.l;
    a.x = a.x || [];
    const row = b.closest('.opt-row');
    if (a.x.includes(L)) { a.x = a.x.filter((x) => x !== L); row.classList.remove('crossed'); b.innerHTML = `<span class="xl">${L}</span>`; }
    else {
      a.x.push(L); row.classList.add('crossed'); b.innerHTML = '<u>Undo</u>';
      if (a.c === L) { a.c = null; row.classList.remove('sel'); }
    }
    s.save();
  }));
  const inp = $('#sprIn');
  if (inp) {
    inp.oninput = () => {
      let v = inp.value.replace(/[^0-9./\-]/g, '');
      const max = v.startsWith('-') ? 6 : 5;
      v = v.slice(0, max);
      if (v !== inp.value) inp.value = v;
      ansOf(qid).c = v;
      $('#sprPrev').textContent = v;
      s.save();
    };
  }
  // 高亮
  const a = s.ans[qid] || {};
  $$('.hl-zone').forEach((z) => applyHL(z, (a.hl || []).map((h, i) => ({ ...h, i })).filter((h) => h.k === z.dataset.k)));
  bindHighlighting(qid);
}

function bindHighlighting(qid) {
  const tools = $('#hlTools'), card = $('#hlCard');
  const bb = $('.bb');
  let pending = null;
  const hide = () => { tools.hidden = true; pending = null; };
  bb.addEventListener('mouseup', (ev) => {
    if (ev.target.closest('#hlTools,#hlCard')) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { hide(); return; }
      const r = sel.getRangeAt(0);
      const zone = (r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement).closest('.hl-zone');
      if (!zone) { hide(); return; }
      const s0 = hlOffset(zone, r.startContainer, r.startOffset), e0 = hlOffset(zone, r.endContainer, r.endOffset);
      if (e0 - s0 < 1) { hide(); return; }
      pending = { k: zone.dataset.k, s: s0, e: e0 };
      const rect = r.getBoundingClientRect();
      tools.hidden = false;
      tools.style.left = Math.max(8, Math.min(window.innerWidth - 220, rect.left + rect.width / 2 - 100)) + 'px';
      tools.style.top = Math.max(8, rect.top - 46) + 'px';
    }, 0);
  });
  tools.onmousedown = (e) => e.preventDefault();
  tools.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || !pending) return;
    const a = ansOf(qid);
    a.hl = a.hl || [];
    const h = { ...pending, c: b.dataset.c === 'note' ? 'y' : b.dataset.c, n: '' };
    a.hl.push(h);
    PR.sess.save();
    window.getSelection().removeAllRanges();
    hide();
    rerenderHL(qid);
    if (b.dataset.c === 'note') openHLCard(qid, a.hl.length - 1);
  };
  bb.addEventListener('click', (e) => {
    const m = e.target.closest('mark.hl');
    if (m && !e.target.closest('.opt')) { openHLCard(qid, +m.dataset.h, m); return; }
    if (!e.target.closest('#hlCard,#hlTools,#notesDrawer')) card.hidden = true;
  });
}
function rerenderHL(qid) {
  const a = ansOf(qid);
  $$('.hl-zone').forEach((z) => {
    z.querySelectorAll('mark.hl').forEach((m) => { m.replaceWith(...m.childNodes); });
    z.normalize();
    applyHL(z, (a.hl || []).map((h, i) => ({ ...h, i })).filter((h) => h.k === z.dataset.k));
  });
  if (!$('#notesDrawer').hidden) fillNotesDrawer();
}
function openHLCard(qid, idx, markEl) {
  const a = ansOf(qid), h = a.hl[idx], card = $('#hlCard');
  if (!h) return;
  const m = markEl || $(`mark.hl[data-h="${idx}"]`);
  const rect = m ? m.getBoundingClientRect() : { left: 200, bottom: 200 };
  card.innerHTML = `<div class="hl-card-head"><span>批注</span>
      <span class="hl-colors">${['y', 'b', 'p'].map((c) => `<button class="sw sw-${c} ${h.c === c ? 'on' : ''}" data-c="${c}"></button>`).join('')}</span></div>
    <textarea id="hlNote" rows="3" placeholder="写下你的想法…">${esc(h.n || '')}</textarea>
    <div class="hl-card-btns"><button class="lnk danger" id="hlDel">删除高亮</button><button class="bb-btn small" id="hlSave">保存</button></div>`;
  card.hidden = false;
  card.style.left = Math.max(8, Math.min(window.innerWidth - 300, rect.left)) + 'px';
  card.style.top = Math.min(window.innerHeight - 200, rect.bottom + 8) + 'px';
  card.querySelectorAll('.sw').forEach((b) => (b.onclick = () => { h.c = b.dataset.c; PR.sess.save(); rerenderHL(qid); openHLCard(qid, idx); }));
  $('#hlSave').onclick = () => { h.n = $('#hlNote').value.trim(); PR.sess.save(); card.hidden = true; rerenderHL(qid); };
  $('#hlDel').onclick = () => { a.hl.splice(idx, 1); PR.sess.save(); card.hidden = true; rerenderHL(qid); };
  $('#hlNote').focus();
}
function toggleNotesDrawer() {
  const d = $('#notesDrawer');
  d.hidden = !d.hidden;
  if (!d.hidden) fillNotesDrawer();
}
function fillNotesDrawer() {
  const d = $('#notesDrawer');
  if (PR.check) { d.innerHTML = '<div class="nd-head"><b>Highlights &amp; Notes</b><button class="x" id="ndX">×</button></div><p class="muted">回到题目页查看高亮。</p>'; $('#ndX').onclick = toggleNotesDrawer; return; }
  const qid = curQid(), a = ansOf(qid), zones = {};
  $$('.hl-zone').forEach((z) => (zones[z.dataset.k] = z));
  const items = (a.hl || []).map((h, i) => {
    const txt = [...$$(`mark.hl[data-h="${i}"]`)].map((m) => m.textContent).join('');
    return `<li><mark class="hl hl-${h.c}">${esc(txt.slice(0, 120))}</mark>${h.n ? `<p>${esc(h.n)}</p>` : ''}<button class="lnk" data-i="${i}">编辑</button></li>`;
  }).join('');
  d.innerHTML = `<div class="nd-head"><b>Highlights &amp; Notes</b><button class="x" id="ndX" aria-label="关闭">×</button></div>
    <p class="muted">选中题目文字即可高亮；点高亮可写批注。</p>
    <ul class="nd-list">${items || '<li class="muted">这道题还没有高亮。</li>'}</ul>`;
  $('#ndX').onclick = toggleNotesDrawer;
  d.querySelectorAll('button[data-i]').forEach((b) => (b.onclick = () => openHLCard(qid, +b.dataset.i)));
}

function showReference() {
  modal(`<div class="ref-sheet">
    <h2>Reference</h2>
    <div class="ref-grid">
      <div><b>圆</b><p>A = πr²　C = 2πr</p></div>
      <div><b>长方形</b><p>A = ℓw</p></div>
      <div><b>三角形</b><p>A = ½bh</p></div>
      <div><b>勾股定理</b><p>c² = a² + b²</p></div>
      <div><b>特殊直角三角形</b><p>30°-60°-90°：x, x√3, 2x<br>45°-45°-90°：s, s, s√2</p></div>
      <div><b>长方体</b><p>V = ℓwh</p></div>
      <div><b>圆柱</b><p>V = πr²h</p></div>
      <div><b>球</b><p>V = 4⁄3 πr³</p></div>
      <div><b>圆锥</b><p>V = 1⁄3 πr²h</p></div>
      <div><b>棱锥</b><p>V = 1⁄3 ℓwh</p></div>
    </div>
    <p class="muted">圆周 360°，等于 2π 弧度；三角形内角和 180°。</p>
  </div>`);
}
