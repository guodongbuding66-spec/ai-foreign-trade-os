import { json, requireAuth } from '../../_lib/auth.js';
import { openAIStatus } from '../../_lib/openai.js';

export async function onRequestGet(context) {
  const { response } = await requireAuth(context, 'ai.use');
  if (response) return response;
  const status = openAIStatus(context.env);
  return json({ ok: true, provider: 'openai', ...status });
}
