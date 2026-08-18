(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const status = $('#status');
  const form = $('#loginForm');
  const signedIn = $('#signedIn');
  const button = $('#submitBtn');

  const messages = {
    invalid_credentials: 'Email 或密码不正确。',
    workspace_required: '这个 Email 属于多个 Workspace，请填写 Workspace slug。',
    too_many_attempts: '登录失败次数过多，请稍后重试。',
    session_secret_not_configured: 'SESSION_SECRET 尚未配置。',
    db_not_bound: 'D1 DB 尚未绑定。',
    invalid_origin: '请求来源校验失败。'
  };

  function show(text, type = '') {
    status.textContent = text;
    status.className = `status ${type}`.trim();
  }

  async function checkSession() {
    try {
      const r = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!r.ok) {
        form.classList.remove('hidden');
        signedIn.classList.add('hidden');
        return show(new URLSearchParams(location.search).has('created') ? 'Workspace Owner 已创建，请登录。' : '请输入账户信息。');
      }
      const j = await r.json();
      form.classList.add('hidden');
      signedIn.classList.remove('hidden');
      show(`已登录：${j.user.displayName} · ${j.user.email} · ${j.tenant.name}`, 'ok');
    } catch (_) {
      form.classList.remove('hidden');
      show('无法检查 Session，请确认 Production 部署正常。', 'bad');
    }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    button.disabled = true;
    show('正在验证账户…');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: $('#email').value.trim(),
          password: $('#password').value,
          workspace: $('#workspace').value.trim()
        })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'login_failed');
      $('#password').value = '';
      show(`登录成功：${j.user.displayName}`, 'ok');
      await checkSession();
    } catch (error) {
      show(messages[error.message] || `登录失败：${error.message}`, 'bad');
    } finally {
      button.disabled = false;
    }
  });

  $('#openWorkspace').addEventListener('click', () => location.href = '/');
  $('#logoutBtn').addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } finally {
      location.href = '/login.html';
    }
  });

  checkSession();
})();
