(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const status = $('#status');
  const form = $('#setupForm');
  const button = $('#submitBtn');

  const messages = {
    invalid_bootstrap_token: 'BOOTSTRAP_TOKEN 不正确。',
    bootstrap_token_not_configured: 'Cloudflare 尚未配置 BOOTSTRAP_TOKEN Secret。',
    session_secret_not_configured: 'Cloudflare 尚未配置 SESSION_SECRET Secret。',
    auth_schema_not_ready: 'D1 Auth schema 尚未初始化，请先执行 migrations/0003_auth.sql。',
    bootstrap_disabled: 'Workspace 已经初始化，Bootstrap 已关闭。',
    invalid_email: 'Email 格式不正确。',
    invalid_display_name: 'Display name 不正确。',
    invalid_tenant_name: 'Workspace 名称不正确。',
    password_too_short: '密码至少需要 12 位。',
    password_too_long: '密码过长。',
    invalid_origin: '请求来源校验失败，请从本站 setup.html 操作。',
    bootstrap_runtime_error: 'Bootstrap 服务端执行失败。',
    bootstrap_failed: 'D1 初始化写入失败。'
  };

  function show(text, type = '') {
    status.textContent = text;
    status.className = `status ${type}`.trim();
  }

  async function responseJson(r) {
    const type = (r.headers.get('content-type') || '').toLowerCase();
    const text = await r.text();
    if (type.includes('application/json')) {
      try { return JSON.parse(text); }
      catch (_) { throw new Error(`http_${r.status}_invalid_json`); }
    }
    const snippet = text.replace(/\s+/g, ' ').slice(0, 100);
    throw new Error(`http_${r.status}${snippet ? `: ${snippet}` : ''}`);
  }

  async function refreshStatus() {
    try {
      const r = await fetch('/api/auth/status', { cache: 'no-store' });
      const j = await responseJson(r);
      if (!j.dbBound) return show('D1 DB 尚未绑定到 Pages Production。', 'bad');
      if (!j.authSchemaReady) return show(`当前 schema v${j.schemaVersion || '?'}；请先执行 migrations/0003_auth.sql。`, 'bad');
      if (j.hasUsers) {
        form.classList.add('hidden');
        return show(`Workspace 已初始化（${j.userCount} user）。Bootstrap 已关闭，请使用登录页。`, 'ok');
      }
      if (!j.sessionSecretConfigured || !j.bootstrapTokenConfigured) {
        const missing = [];
        if (!j.sessionSecretConfigured) missing.push('SESSION_SECRET');
        if (!j.bootstrapTokenConfigured) missing.push('BOOTSTRAP_TOKEN');
        return show(`请先在 Cloudflare Production Secrets 配置：${missing.join('、')}，然后重新部署。`, 'bad');
      }
      form.classList.remove('hidden');
      show('D1、Auth schema 与 Secrets 已就绪，可以创建第一个 Workspace Owner。', 'ok');
    } catch (error) {
      show(`无法读取 /api/auth/status：${error.message}`, 'bad');
    }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    button.disabled = true;
    show('正在创建 Tenant、Owner Role、User 与 Session…');
    try {
      const r = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantName: $('#tenantName').value.trim(),
          displayName: $('#displayName').value.trim(),
          email: $('#email').value.trim(),
          password: $('#password').value,
          bootstrapToken: $('#bootstrapToken').value
        })
      });
      const j = await responseJson(r);
      if (!r.ok) {
        const err = new Error(j.error || `http_${r.status}`);
        err.detail = j.detail;
        throw err;
      }
      $('#password').value = '';
      $('#bootstrapToken').value = '';
      form.classList.add('hidden');
      show(`初始化成功：${j.tenant.name} / ${j.user.email}。正在进入登录页…`, 'ok');
      setTimeout(() => location.href = '/login.html?created=1', 1000);
    } catch (error) {
      const base = messages[error.message] || `初始化失败：${error.message}`;
      show(error.detail ? `${base} ${error.detail}` : base, 'bad');
      button.disabled = false;
    }
  });

  refreshStatus();
})();
