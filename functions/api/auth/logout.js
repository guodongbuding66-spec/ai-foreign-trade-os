import { assertSameOrigin, clearSessionCookie, json, revokeCurrentSession } from '../../_lib/auth.js';

export async function onRequestPost(context) {
  const originError = assertSameOrigin(context.request);
  if (originError) return originError;
  await revokeCurrentSession(context);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
