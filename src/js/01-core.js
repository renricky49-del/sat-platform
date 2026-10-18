'use strict';
/* ============ 基础配置 ============ */
const TZ = 'America/Los_Angeles';
const START = '2026-10-15';
const EXAM = '2026-12-05';
const DAY_MS = 86400000;
const SEC_LIMIT = { rw: 60 * 60000, math: 45 * 60000 };
const REVIEW_PER_Q = { rw: 90000, math: 120000 };
// 额外练习每题时长（按 hard 难度的实际用时估算）
const EXTRA_PER_Q = {
  chart: 90000, evidence: 85000, detail: 80000, inference: 90000, wic: 60000, structure: 75000,
  crosstext: 95000, synthesis: 60000, transition: 50000, boundary: 50000, form: 50000,
  psda: 100000, geo: 120000, alg: 95000, adv: 120000,
};
const SRS = [1, 3, 7, 14, 30]; // 错题复习间隔（天）
const REWARD = { speed: 5, acc: 5, done: 5, review: 5 };
const SEC_NAME = { rw: '阅读', math: '数学' };
const SEC_FULL = { rw: 'Reading and Writing', math: 'Math' };
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/* ============ 工具函数 ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);

let DEBUG_TODAY = null;
try { DEBUG_TODAY = localStorage.getItem('sat:debugToday'); } catch (e) { /* storage blocked */ }

function laDate(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function todayStr() { return DEBUG_TODAY || laDate(new Date()); }
function parseD(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function addDays(s, n) { return new Date(parseD(s) + n * DAY_MS).toISOString().slice(0, 10); }
function diffDays(a, b) { return Math.round((parseD(b) - parseD(a)) / DAY_MS); }
function dow(s) { return new Date(parseD(s)).getUTCDay(); }
function weekStart(s) { return addDays(s, -((dow(s) + 6) % 7)); }
function md(s) { const p = s.split('-'); return `${+p[1]}月${+p[2]}日`; }
function mdw(s) { return `${md(s)} ${WD[dow(s)]}`; }
function fmtClock(ms) {
  ms = Math.max(0, ms);
  const t = Math.ceil(ms / 1000), m = Math.floor(t / 60), s = t % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function fmtDur(ms) {
  if (ms == null || isNaN(ms)) return '—';
  const t = Math.round(ms / 1000), m = Math.floor(t / 60), s = t % 60;
  return m ? `${m}分${String(s).padStart(2, '0')}秒` : `${s}秒`;
}
function fmtSec(ms) { return ms == null || isNaN(ms) ? '—' : `${Math.round(ms / 1000)}秒`; }
function stripHtml(h) {
  const d = document.createElement('div');
  d.innerHTML = h || '';
  d.querySelectorAll('svg,table,figure').forEach((x) => x.remove());
  return d.textContent.replace(/\s+/g, ' ').trim();
}

/* ============ 存储：Supabase（云端）；本地调试时 ?local 用 localStorage ============ */
let SB = null;
const Store = {
  mode: 'local', role: null, isOwner: true, canWrite: true, email: '',
  cache: {},          // collection -> {id: data}
  inflight: {}, queued: {},
  // 返回 'ok' | 'login'（需要登录）| 'norole'（账号还没分配身份）
  async init() {
    if (location.search.includes('local')) { this.mode = 'local'; this.role = 'student'; return 'ok'; }
    if (!window.supabase) throw new Error('数据库组件没有加载出来，请检查网络');
    SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    this.mode = 'cloud';
    const { data } = await SB.auth.getSession();
    if (!data.session) return 'login';
    return this.afterLogin(data.session);
  },
  async afterLogin(session) {
    this.email = session.user.email || '';
    const { data, error } = await SB.from('profiles').select('role').eq('user_id', session.user.id).maybeSingle();
    if (error || !data) { this.role = null; this.canWrite = false; this.isOwner = false; return 'norole'; }
    this.role = data.role;
    this.isOwner = this.role === 'student';
    this.canWrite = this.role === 'student';
    return 'ok';
  },
  async login(email, password) {
    const { data, error } = await SB.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return this.afterLogin(data.session);
  },
  async logout() { if (SB) await SB.auth.signOut(); location.reload(); },
  // 爸爸只能改兑换记录
  canWriteDoc(col, id) { return this.canWrite || (this.role === 'parent' && col === 'meta' && id === 'ledger'); },
  async loadAll(names) {
    for (const n of names) this.cache[n] = {};
    if (this.mode === 'cloud') {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await SB.from('docs').select('col,id,data').range(from, from + 999);
        if (error) { console.warn('load docs', error); break; }
        for (const d of data) if (this.cache[d.col]) this.cache[d.col][d.id] = d.data;
        if (data.length < 1000) break;
      }
    } else if (this.mode === 'local') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k.startsWith('satdb:')) continue;
          const [, col, id] = k.split(':');
          if (this.cache[col]) this.cache[col][id] = JSON.parse(localStorage.getItem(k));
        }
      } catch (e) { console.warn('local load', e); }
    }
  },
  get(col, id) { return (this.cache[col] || {})[id]; },
  all(col) { return Object.values(this.cache[col] || {}); },
  put(col, id, data) {
    if (!this.cache[col]) this.cache[col] = {};
    this.cache[col][id] = data;
    if (!this.canWriteDoc(col, id)) return;
    this._write(col, id);
  },
  del(col, id) {
    if (this.cache[col]) delete this.cache[col][id];
    if (!this.canWriteDoc(col, id)) return;
    this._write(col, id, true);
  },
  async _send(col, id, isDelete) {
    const data = this.cache[col] && this.cache[col][id];
    if (this.mode === 'cloud') {
      let res;
      if (isDelete || data === undefined) res = await SB.from('docs').delete().eq('col', col).eq('id', id);
      else if (this.role === 'parent') res = await SB.from('docs').update({ data: clone(data), updated_at: new Date().toISOString() }).eq('col', col).eq('id', id);
      else res = await SB.from('docs').upsert({ col, id, data: clone(data), updated_at: new Date().toISOString() });
      if (res.error) throw res.error;
    } else if (this.mode === 'local') {
      if (isDelete || data === undefined) localStorage.removeItem('satdb:' + col + ':' + id);
      else localStorage.setItem('satdb:' + col + ':' + id, JSON.stringify(data));
    }
  },
  // 同一文档一次只写一个请求，期间的修改合并成下一次写入
  _write(col, id, isDelete) {
    const key = col + '/' + id;
    if (this.inflight[key]) { this.queued[key] = isDelete ? 'del' : 'set'; return; }
    this.inflight[key] = true;
    const run = async () => {
      try {
        try { await this._send(col, id, isDelete); }
        catch (e) { await new Promise((r) => setTimeout(r, 800 + Math.random() * 800)); await this._send(col, id, isDelete); }
        setSaveState('ok');
      } catch (e) {
        console.warn('write failed', key, e);
        setSaveState('err');
      } finally {
        this.inflight[key] = false;
        const q = this.queued[key];
        if (q) { delete this.queued[key]; this._write(col, id, q === 'del'); }
      }
    };
    run();
  },
  // 高频修改（作答、计时）先合并，停顿后再写
  timers: {},
  putSoon(col, id, data, ms = 1500) {
    if (!this.cache[col]) this.cache[col] = {};
    this.cache[col][id] = data;
    const key = col + '/' + id;
    clearTimeout(this.timers[key]);
    this.timers[key] = setTimeout(() => this.put(col, id, this.cache[col][id]), ms);
  },
  flush() {
    for (const key of Object.keys(this.timers)) {
      clearTimeout(this.timers[key]);
      const [col, id] = key.split('/');
      if (this.cache[col] && this.cache[col][id]) this.put(col, id, this.cache[col][id]);
    }
    this.timers = {};
  },
};

function setSaveState(s, code) {
  const el = $('#saveState');
  if (!el) return;
  if (s === 'err') { el.textContent = '保存失败，请检查网络后刷新'; el.className = 'save-state err'; }
  else { el.textContent = Store.mode === 'cloud' ? '已云端保存' : '已保存在本机'; el.className = 'save-state'; }
}

function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3100);
}
