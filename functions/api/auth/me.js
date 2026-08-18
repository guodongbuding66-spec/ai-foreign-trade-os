import { json, requireAuth } from '../../_lib/auth.js';

export async function onRequestGet(context) {
  const { response, auth } = await requireAuth(context);
  if (response) return response;
  return json({ ok: true, ...auth });
}
