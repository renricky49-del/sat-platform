/* ============ 题库与周计划 ============ */
let TYPES = {}, WEEKS = [], PLAN = [], QB = {};
const TYPE_NAME = {
  chart: '图表题', evidence: '文本证据题', detail: '细节题', inference: '推断题', wic: '词汇题',
  structure: '结构目的题', crosstext: '双篇题', synthesis: '笔记整合题', transition: '过渡词题',
  boundary: '标点边界题', form: '语法形式题',
  psda: 'Problem-Solving & Data Analysis', geo: 'Geometry & Trigonometry', alg: 'Algebra', adv: 'Advanced Math',
};
const TYPE_SHORT = { psda: 'PSDA', geo: 'Geo & Trig', alg: 'Algebra', adv: 'Adv Math' };
const typeName = (t) => TYPE_NAME[t] || (TYPES[t] && TYPES[t].name) || t;
const typeShort = (t) => TYPE_SHORT[t] || typeName(t);
const typeSec = (t) => (TYPES[t] && TYPES[t].sec) || (['psda', 'geo', 'alg', 'adv'].includes(t) ? 'math' : 'rw');

// 题目只存在 Supabase（登录后才能读）；?local 调试时读本地 data/ 文件
async function loadQuestions() {
  if (Store.mode === 'cloud') {
    const w = await SB.from('weeks').select('week,data').order('week');
    if (w.error) throw w.error;
    WEEKS = w.data.map((r) => ({ ...r.data, questions: {} }));
    for (let from = 0; ; from += 1000) {
      const { data, error } = await SB.from('questions').select('id,data').range(from, from + 999);
      if (error) throw error;
      for (const q of data) QB[q.id] = q.data;
      if (data.length < 1000) break;
    }
    TYPES = (WEEKS[0] && WEEKS[0].types) || {};
  } else {
    const idx = await fetch('data/weeks.json').then((r) => r.json());
    TYPES = idx.types || {};
    WEEKS = await Promise.all(idx.weeks.map((w) => fetch('data/' + w.file).then((r) => r.json())));
    for (const w of WEEKS) Object.assign(QB, w.questions);
  }
  PLAN = WEEKS.flatMap((w) => w.days.map((d) => ({ ...d, week: w.week })));
  PLAN.sort((a, b) => (a.dates[0] < b.dates[0] ? -1 : 1));
}

/* ============ 判分 ============ */
function parseNum(s) {
  s = String(s).trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes('/')) {
    const [a, b] = s.split('/');
    if (!b) return NaN;
    const x = Number(a), y = Number(b);
    return y === 0 ? NaN : x / y;
  }
  return Number(s);
}
function sprCorrect(input, answers) {
  const norm = (x) => String(x).trim().replace(/\s/g, '').replace(/^\+/, '');
  const u = norm(input);
  if (!u) return false;
  if (answers.some((a) => norm(a) === u)) return true;
  const uv = parseNum(u);
  if (isNaN(uv)) return false;
  for (const a of answers) { const av = parseNum(a); if (!isNaN(av) && Math.abs(av - uv) < 1e-9) return true; }
  const decs = (u.split('.')[1] || '').length;
  if (!u.includes('/') && decs >= 3) {
    for (const a of answers) if (String(a).includes('/') && Math.abs(parseNum(a) - uv) <= 0.0006) return true;
  }
  return false;
}
function isCorrect(q, a) {
  if (!q || !a || a.c == null || a.c === '') return false;
  return q.kind === 'mcq' ? a.c === q.ans : sprCorrect(a.c, q.ans);
}
function answerText(q) { return q.kind === 'mcq' ? q.ans : q.ans.join(' 或 '); }
function gradeList(qids, ans) { return qids.reduce((c, id) => c + (isCorrect(QB[id], ans[id]) ? 1 : 0), 0); }

/* ============ 计时（时间只在答题时走；关闭页面后照常倒计时） ============ */
function timerUsed(t) { return Math.min(t.limitMs, t.usedMs + (t.runningSince ? Date.now() - t.runningSince : 0)); }
function timerLeft(t) { return t.limitMs - timerUsed(t); }
function timerStart(t) { if (!t.runningSince) t.runningSince = Date.now(); }
function timerPause(t) { if (t.runningSince) { t.usedMs = timerUsed(t); t.runningSince = null; } }

/* ============ 设置、账本、萌宠 ============ */
function settings() { return Store.get('meta', 'settings') || { name: '', reviewCap: 0, unlocks: {} }; }
function saveSettings(s) { Store.put('meta', 'settings', s); }
function ledger() { return Store.get('meta', 'ledger') || { items: [] }; }
function petState() { return Store.get('meta', 'pet') || { cat: 'orange', wear: null, hideDeco: [] }; }

const LEVELS = [0, 20, 50, 90, 140, 200, 270, 350, 450, 600, 800, 1000];
const PETS = [
  { id: 'orange', name: '橘子', at: 0, desc: '元气满满的小橘猫，第一天就陪你' },
  { id: 'tuxedo', name: '奥利奥', at: 70, desc: '冷静沉着的奶牛猫' },
  { id: 'calico', name: '麻薯', at: 250, desc: '爱撒娇的三花猫' },
];
const WEARS = [
  { id: 'bow', name: '粉色蝴蝶结', at: 25 },
  { id: 'party', name: '派对帽', at: 100 },
  { id: 'gradcap', name: '学士帽', at: 190 },
  { id: 'crown', name: '小皇冠', at: 400 },
  { id: 'wizard', name: '魔法帽', at: 650 },
];
const DECOS = [
  { id: 'yarn', name: '毛线球', at: 10 },
  { id: 'bed', name: '猫窝软垫', at: 45 },
  { id: 'fishbowl', name: '小鱼缸', at: 140 },
  { id: 'plant', name: '龟背竹', at: 320 },
  { id: 'cattree', name: '猫爬架', at: 500 },
  { id: 'trophy', name: '金奖杯', at: 800 },
];
function unlockAt(u) { const o = settings().unlocks || {}; return o[u.id] != null ? o[u.id] : u.at; }
function allUnlocks() {
  return [
    ...PETS.map((x) => ({ ...x, kind: 'pet' })),
    ...WEARS.map((x) => ({ ...x, kind: 'wear' })),
    ...DECOS.map((x) => ({ ...x, kind: 'deco' })),
  ].map((u) => ({ ...u, at: unlockAt(u) })).sort((a, b) => a.at - b.at);
}
const KIND_CN = { pet: '萌宠', wear: '配饰', deco: '小窝装饰' };
function isUnlocked(id, coins = coinsEarned()) { const u = allUnlocks().find((x) => x.id === id); return !!u && coins >= u.at; }
function nextUnlock(c) { return allUnlocks().find((u) => u.at > c) || null; }
function levelOf(c) { let l = 1; LEVELS.forEach((t, i) => { if (c >= t) l = i + 1; }); return l; }
function levelRange(c) { const l = levelOf(c); return { l, from: LEVELS[l - 1], to: LEVELS[l] ?? null }; }

/* ============ 每日计划 ============ */
const runOf = (id) => Store.get('runs', id);
function todayPlan(T) {
  // 今天排定的关卡，或今天提前开始的关卡（补做的不算）
  return PLAN.find((p) => { const r = runOf(p.id); return r ? r.startedOn === T && !r.makeup : p.dates.includes(T); }) || null;
}
function makeups(T) {
  return PLAN.filter((p) => {
    const r = runOf(p.id);
    if (r && (r.doneAt || (!r.makeup && r.startedOn === T))) return false;
    return p.dates[p.dates.length - 1] < T;
  });
}
function nextUpcoming(T) { return PLAN.find((p) => !runOf(p.id) && p.dates[0] > T) || null; }
function planOfDate(d) { return PLAN.find((p) => { const r = runOf(p.id); return r ? r.startedOn === d : p.dates.includes(d); }) || null; }

function newRun(p, T) {
  const mk = (sec, list) => ({
    limitMs: SEC_LIMIT[sec], usedMs: 0, runningSince: null, doneAt: null,
    stages: list.map((st) => ({ type: st.type, qids: st.qids.slice(), status: 'todo', cur: 0, ans: {}, startUsed: null, timeMs: null, correct: null, total: st.qids.length, doneAt: null, hist: null })),
  });
  return { dayId: p.id, startedOn: T, createdAt: Date.now(), sections: { rw: mk('rw', p.reading), math: mk('math', p.math) }, doneAt: null, coins: {}, notes: {} };
}
function saveRun(run) { Store.put('runs', run.dayId, run); }

// 该题型此前的平均正确率与平均每题用时（只统计每日新题）
function histSnapshot(type, excludeDayId) {
  let q = 0, c = 0, ms = 0;
  for (const r of Store.all('runs')) {
    if (r.dayId === excludeDayId) continue;
    for (const sec of ['rw', 'math']) for (const st of r.sections[sec].stages) {
      if (st.status !== 'done' || st.type !== type) continue;
      q += st.total; c += st.correct; ms += st.timeMs || 0;
    }
  }
  return q ? { q, acc: c / q, msPerQ: ms / q } : null;
}

function startRunStage(run, sec, idx) {
  const S = run.sections[sec], st = S.stages[idx];
  if (st.status === 'todo') { st.status = 'active'; st.startUsed = S.usedMs; st.hist = histSnapshot(st.type, run.dayId); }
  timerStart(S);
  saveRun(run);
}

function submitRunStage(run, sec, idx, timedOut) {
  const S = run.sections[sec];
  timerPause(S);
  const finish = (st) => {
    if (st.startUsed == null) { st.startUsed = S.usedMs; st.hist = histSnapshot(st.type, run.dayId); }
    st.timeMs = Math.max(0, S.usedMs - st.startUsed);
    st.status = 'done'; st.doneAt = Date.now();
    st.correct = gradeList(st.qids, st.ans); st.total = st.qids.length;
    collectWrong(st.qids, st.ans, 'day:' + run.dayId);
  };
  if (idx >= 0 && S.stages[idx].status !== 'done') finish(S.stages[idx]);
  if (timedOut) { S.usedMs = S.limitMs; S.stages.forEach((st) => { if (st.status !== 'done') finish(st); }); }
  if (S.stages.every((st) => st.status === 'done') && !S.doneAt) { S.doneAt = Date.now(); sectionReward(run, sec); }
  if (run.sections.rw.doneAt && run.sections.math.doneAt && !run.doneAt) {
    run.doneAt = Date.now();
    run.coins.done = REWARD.done;
    run.notes.done = '新题全部完成';
  }
  saveRun(run);
}

function sectionReward(run, sec) {
  const S = run.sections[sec];
  let n = 0, c = 0, ms = 0, expC = 0, expMs = 0;
  for (const st of S.stages) {
    if (!st.hist) continue;
    n += st.total; c += st.correct; ms += st.timeMs || 0;
    expC += st.hist.acc * st.total; expMs += st.hist.msPerQ * st.total;
  }
  const k = sec === 'rw' ? 'rw' : 'math';
  if (!n) {
    run.coins[k + 'Acc'] = 0; run.coins[k + 'Speed'] = 0;
    run.notes[k + 'Acc'] = run.notes[k + 'Speed'] = '第一次练这些题型，先建立基线';
    return;
  }
  const accT = c / n, accH = expC / n, msT = ms / n, msH = expMs / n;
  const accWin = accT > accH + 1e-9 || accT === 1;
  const speedWin = msT < msH && accT >= accH - 1e-9;
  run.coins[k + 'Acc'] = accWin ? REWARD.acc : 0;
  run.coins[k + 'Speed'] = speedWin ? REWARD.speed : 0;
  run.notes[k + 'Acc'] = `正确率 ${Math.round(accT * 100)}%，往期 ${Math.round(accH * 100)}%`;
  run.notes[k + 'Speed'] = `每题 ${fmtSec(msT)}，往期 ${fmtSec(msH)}` + (msT < msH && !speedWin ? '（正确率下降，不计速度奖）' : '');
}
const runCoins = (r) => sum(Object.values(r.coins || {}));

/* ============ 错题本与艾宾浩斯复习 ============ */
function collectWrong(qids, ans, from) {
  const T = todayStr();
  for (const id of qids) {
    const q = QB[id];
    if (!q || isCorrect(q, ans[id])) continue;
    const last = ans[id] && ans[id].c != null ? ans[id].c : null;
    const w = Store.get('wrong', id);
    if (w) {
      Object.assign(w, { stage: 0, due: addDays(T, 1), mastered: false, times: (w.times || 1) + 1, lastAns: last, lastFrom: from });
      Store.put('wrong', id, w);
    } else {
      Store.put('wrong', id, { qid: id, sec: q.sec, type: q.type, addedOn: T, source: 'auto', from, stage: 0, due: addDays(T, 1), mastered: false, hist: [], times: 1, lastAns: last });
    }
  }
}
function addWrongManual(id, lastAns) {
  const q = QB[id], T = todayStr();
  if (!q || Store.get('wrong', id)) return;
  Store.put('wrong', id, { qid: id, sec: q.sec, type: q.type, addedOn: T, source: 'manual', from: 'manual', stage: 0, due: addDays(T, 1), mastered: false, hist: [], times: 0, lastAns: lastAns ?? null });
}
function dueWrong(T) {
  return Store.all('wrong')
    .filter((w) => !w.mastered && w.due <= T && w.addedOn < T && QB[w.qid])
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.stage - b.stage));
}
function getOrCreateReview(T) {
  let r = Store.get('reviews', T);
  if (r) return r;
  const due = dueWrong(T), cap = +settings().reviewCap || 0;
  const mk = (sec) => {
    let qids = due.filter((w) => w.sec === sec).map((w) => w.qid);
    if (cap > 0) qids = qids.slice(0, cap);
    return { qids, limitMs: qids.length * REVIEW_PER_Q[sec], usedMs: 0, runningSince: null, status: qids.length ? 'todo' : 'done', cur: 0, ans: {}, result: {}, correct: null, total: qids.length, doneAt: qids.length ? null : Date.now() };
  };
  r = { date: T, createdAt: Date.now(), sections: { rw: mk('rw'), math: mk('math') }, doneAt: null, coin: 0, empty: false };
  if (!r.sections.rw.qids.length && !r.sections.math.qids.length) { r.empty = true; r.doneAt = Date.now(); }
  Store.put('reviews', T, r);
  return r;
}
function submitReviewSection(r, sec) {
  const S = r.sections[sec];
  timerPause(S);
  S.status = 'done'; S.doneAt = Date.now();
  let c = 0;
  for (const id of S.qids) {
    const ok = isCorrect(QB[id], S.ans[id]);
    S.result[id] = ok;
    if (ok) c++;
    srsUpdate(id, ok, r.date, S.ans[id]);
  }
  S.correct = c; S.total = S.qids.length;
  if (r.sections.rw.status === 'done' && r.sections.math.status === 'done' && !r.doneAt) {
    r.doneAt = Date.now();
    r.coin = r.date === todayStr() ? REWARD.review : 0;
  }
  Store.put('reviews', r.date, r);
}
function srsUpdate(id, ok, date, a) {
  const w = Store.get('wrong', id);
  if (!w) return;
  w.hist = (w.hist || []).concat({ d: date, ok, a: a && a.c != null ? a.c : null });
  if (ok) {
    w.stage = (w.stage || 0) + 1;
    if (w.stage >= SRS.length) { w.mastered = true; w.masteredOn = date; }
    else w.due = addDays(date, SRS[w.stage]);
  } else {
    w.stage = 0; w.due = addDays(date, 1); w.times = (w.times || 1) + 1; w.lastAns = a && a.c != null ? a.c : null;
  }
  Store.put('wrong', id, w);
}

/* ============ 额外练习 ============ */
function extraTypes() { const s = []; WEEKS.forEach((w) => Object.keys(w.extra || {}).forEach((t) => { if (!s.includes(t)) s.push(t); })); return s; }
function extraPool(type) {
  const used = new Set(Store.all('extras').flatMap((e) => e.qids));
  return WEEKS.flatMap((w) => (w.extra || {})[type] || []).filter((id) => QB[id] && !used.has(id));
}
function newExtra(type, n) {
  const qids = extraPool(type).slice(0, n);
  const id = 'x' + uid();
  const e = { id, type, sec: typeSec(type), date: todayStr(), qids, limitMs: qids.length * (EXTRA_PER_Q[type] || 90000), usedMs: 0, runningSince: null, status: 'todo', cur: 0, ans: {}, correct: null, total: qids.length, createdAt: Date.now() };
  Store.put('extras', id, e);
  return e;
}
function submitExtra(e) {
  timerPause(e);
  e.status = 'done'; e.doneAt = Date.now();
  e.correct = gradeList(e.qids, e.ans); e.total = e.qids.length;
  collectWrong(e.qids, e.ans, 'extra:' + e.id);
  Store.put('extras', e.id, e);
}

/* ============ 今日状态、金币 ============ */
function todayStatus(T = todayStr()) {
  const p = todayPlan(T);
  const run = p ? runOf(p.id) : null;
  const rev = Store.get('reviews', T);
  const dueN = rev ? rev.sections.rw.qids.length + rev.sections.math.qids.length : dueWrong(T).length;
  const planDone = !p || !!(run && run.doneAt);
  const revDone = rev ? !!rev.doneAt : dueN === 0;
  return { T, p, run, rev, dueN, planDone, revDone, allDone: planDone && revDone, hasTasks: !!p || dueN > 0 };
}
function coinsEarned(before) {
  const runs = Store.all('runs').filter((r) => !before || r.startedOn < before);
  const revs = Store.all('reviews').filter((r) => !before || r.date < before);
  return sum(runs, runCoins) + sum(revs, (r) => r.coin || 0);
}
function coinsOnDate(d) {
  return sum(Store.all('runs').filter((r) => r.startedOn === d), runCoins) + ((Store.get('reviews', d) || {}).coin || 0);
}
function coinsRedeemed() { return sum(ledger().items.filter((i) => i.status === 'done'), (i) => i.coins); }
function coinsPending() { return sum(ledger().items.filter((i) => i.status === 'pending'), (i) => i.coins); }
function coinBalance() { return coinsEarned() - coinsRedeemed(); }

/* ============ 周报 ============ */
function weekReport(ws) {
  const we = addDays(ws, 6);
  const runs = Store.all('runs').filter((r) => r.startedOn >= ws && r.startedOn <= we);
  const revs = Store.all('reviews').filter((r) => r.date >= ws && r.date <= we);
  const acc = { rw: [0, 0], math: [0, 0] }, times = { rw: [], math: [] };
  for (const r of runs) for (const sec of ['rw', 'math']) {
    const S = r.sections[sec];
    for (const st of S.stages) if (st.status === 'done') { acc[sec][0] += st.correct; acc[sec][1] += st.total; }
    if (S.doneAt) times[sec].push(S.usedMs);
  }
  const revQ = sum(revs, (r) => (r.sections.rw.status === 'done' ? r.sections.rw.total : 0) + (r.sections.math.status === 'done' ? r.sections.math.total : 0));
  const revC = sum(revs, (r) => (r.sections.rw.correct || 0) + (r.sections.math.correct || 0));
  const coins = sum(runs, runCoins) + sum(revs, (r) => r.coin || 0);
  const before = coinsEarned(ws), after = before + coins;
  const avg = (a) => (a.length ? sum(a) / a.length : null);
  return {
    ws, we, runs, revs, coins, before, after,
    rwAcc: acc.rw, mathAcc: acc.math, rwAvg: avg(times.rw), mathAvg: avg(times.math),
    daysDone: runs.filter((r) => r.doneAt).length, reviewsDone: revs.filter((r) => r.doneAt && !r.empty).length,
    revQ, revC, levelStart: levelOf(before), levelEnd: levelOf(after),
    unlocked: allUnlocks().filter((u) => u.at > before && u.at <= after),
  };
}

/* ============ 按题型统计（老师视图） ============ */
function typeStats() {
  const s = {};
  const get = (t) => (s[t] ||= { type: t, q: 0, c: 0, ms: 0, sessions: [], xq: 0, xc: 0, rq: 0, rc: 0 });
  for (const r of Store.all('runs')) for (const sec of ['rw', 'math']) for (const st of r.sections[sec].stages) {
    if (st.status !== 'done') continue;
    const x = get(st.type);
    x.q += st.total; x.c += st.correct; x.ms += st.timeMs || 0;
    x.sessions.push({ d: r.startedOn, acc: st.total ? st.correct / st.total : 0, n: st.total, at: st.doneAt });
  }
  for (const e of Store.all('extras')) if (e.status === 'done') { const x = get(e.type); x.xq += e.total; x.xc += e.correct; }
  for (const rv of Store.all('reviews')) for (const sec of ['rw', 'math']) {
    const S = rv.sections[sec];
    if (S.status !== 'done') continue;
    for (const id of S.qids) { const q = QB[id]; if (!q) continue; const x = get(q.type); x.rq++; if (S.result[id]) x.rc++; }
  }
  for (const w of Store.all('wrong')) { const x = get(w.type); x.wOpen = (x.wOpen || 0) + (w.mastered ? 0 : 1); x.wDone = (x.wDone || 0) + (w.mastered ? 1 : 0); }
  Object.values(s).forEach((x) => x.sessions.sort((a, b) => a.at - b.at));
  return s;
}

/* ============ 超时自动交卷 ============ */
function checkTimers() {
  if (!Store.canWrite) return false;
  let changed = false;
  for (const r of Store.all('runs')) for (const sec of ['rw', 'math']) {
    const S = r.sections[sec];
    if (S.runningSince && timerLeft(S) <= 0) { submitRunStage(r, sec, S.stages.findIndex((s) => s.status === 'active'), true); changed = true; }
  }
  for (const rv of Store.all('reviews')) for (const sec of ['rw', 'math']) {
    const S = rv.sections[sec];
    if (S.runningSince && timerLeft(S) <= 0) { submitReviewSection(rv, sec); changed = true; }
  }
  for (const e of Store.all('extras')) if (e.runningSince && timerLeft(e) <= 0) { submitExtra(e); changed = true; }
  return changed;
}
