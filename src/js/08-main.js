/* ============ 启动 ============ */
const COLLECTIONS = ['runs', 'reviews', 'wrong', 'notes', 'extras', 'days', 'weekly', 'meta'];

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b && !b.disabled) { e.preventDefault(); go(b.dataset.go); }
});
window.addEventListener('pagehide', () => { if (PR) { trackTime(); PR.sess.save(true); } Store.flush(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { if (PR) { trackTime(); PR.sess.save(true); } Store.flush(); }
  else if (ROLE === 'student' && !PR && checkTimers()) go(VIEW.name, VIEW.params);
});
// 过了午夜（美西时间）自动刷新首页
let LAST_DAY = null;
setInterval(() => {
  if (ROLE !== 'student') return;
  if (PR) return;
  const changed = checkTimers();
  const T = todayStr();
  if ((changed || (LAST_DAY && T !== LAST_DAY)) && VIEW.name === 'home' && !$('.modal-back')) go('home');
  LAST_DAY = T;
}, 15000);

async function boot() {
  $('#app').innerHTML = '<div class="boot"><div class="boot-cat"></div><p>正在铺好今天的关卡…</p></div>';
  let st;
  try { st = await Store.init(); } catch (e) { bootError(e); return; }
  if (st === 'login') return showLogin();
  if (st === 'norole') return showNoRole();
  startApp();
}
function bootError(e) {
  $('#app').innerHTML = `<div class="boot"><p>没能加载：${esc(e.message || e)}。刷新页面再试一次。</p></div>`;
}
function showLogin(msg) {
  $('#app').innerHTML = `<div class="login-wrap"><form class="card login" id="loginForm">
    <div class="login-cat">${petHTML({ cat: 'orange', h: 110, mode: 'idle' })}</div>
    <h1>喵喵 SAT 通关</h1>
    <p class="muted">学生、家长、老师都从这里登录，系统会自动打开对应的页面。</p>
    <label for="lgEmail">邮箱</label><input id="lgEmail" type="email" autocomplete="username" required>
    <label for="lgPass">密码</label><input id="lgPass" type="password" autocomplete="current-password" required>
    ${msg ? `<p class="login-err">${esc(msg)}</p>` : ''}
    <button class="btn primary big" type="submit" id="lgBtn">登录</button>
    <p class="muted small-note">账号由家里统一创建，忘记密码请找管理账号的人在 Supabase 后台重置。</p>
  </form></div>`;
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const b = $('#lgBtn');
    b.disabled = true; b.textContent = '登录中…';
    try {
      const st = await Store.login($('#lgEmail').value.trim(), $('#lgPass').value);
      if (st === 'norole') return showNoRole();
      startApp();
    } catch (err) {
      showLogin(/invalid/i.test(err.message || '') ? '邮箱或密码不对，再试一次。' : '登录失败：' + (err.message || err));
    }
  };
}
function showNoRole() {
  $('#app').innerHTML = `<div class="boot"><div><p>这个账号（${esc(Store.email)}）还没有分配身份（学生 / 家长 / 老师）。</p>
    <p class="muted">请管理账号的人在 Supabase 的 profiles 表里加上这个账号。</p><button class="btn" id="lgOut">换个账号登录</button></div></div>`;
  $('#lgOut').onclick = () => Store.logout();
}
async function startApp() {
  $('#app').innerHTML = '<div class="boot"><div class="boot-cat"></div><p>正在铺好今天的关卡…</p></div>';
  try {
    await loadQuestions();
    await Store.loadAll(COLLECTIONS);
  } catch (e) { bootError(e); return; }
  ROLE = Store.role === 'student' ? 'student' : Store.role;
  const hash = (location.hash || '').replace('#', '');
  LAST_DAY = todayStr();
  if (ROLE === 'student') {
    checkTimers();
    const resume = findActiveSession();
    if (resume) { VIEW = { name: 'practice', params: {} }; startSession(resume); toast('已回到上次的作答，倒计时一直在走'); return; }
    if (hash === 'parent' || hash === 'teacher') { go(hash); return; }
    go('home');
  } else go(ROLE);
}
function findActiveSession() {
  for (const r of Store.all('runs')) for (const sec of ['rw', 'math']) {
    const S = r.sections[sec];
    const idx = S.stages.findIndex((x) => x.status === 'active');
    if (idx >= 0 && S.runningSince) return { kind: 'run', id: r.dayId, sec, idx };
  }
  for (const rv of Store.all('reviews')) for (const sec of ['rw', 'math']) if (rv.sections[sec].status === 'active' && rv.sections[sec].runningSince) return { kind: 'review', id: rv.date, sec };
  const e = Store.all('extras').find((x) => x.status === 'active' && x.runningSince);
  return e ? { kind: 'extra', id: e.id } : null;
}
boot();
