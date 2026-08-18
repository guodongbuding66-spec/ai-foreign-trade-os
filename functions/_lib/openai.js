const OPENAI_URL = 'https://api.openai.com/v1/responses';

export function openAIStatus(env = {}) {
  return {
    configured: Boolean(env.OPENAI_API_KEY),
    researchModel: String(env.OPENAI_RESEARCH_MODEL || env.OPENAI_MODEL || 'gpt-5.6-terra'),
    draftModel: String(env.OPENAI_DRAFT_MODEL || env.OPENAI_MODEL || 'gpt-5.6-luna')
  };
}

export class OpenAIProviderError extends Error {
  constructor(message, status = 502, code = 'openai_error', detail = '') {
    super(message);
    this.name = 'OpenAIProviderError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export async function createOpenAIResponse(env, payload) {
  if (!env?.OPENAI_API_KEY) throw new OpenAIProviderError('OPENAI_API_KEY is not configured', 503, 'openai_not_configured');
  let response;
  try {
    response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ store: false, ...payload })
    });
  } catch (error) {
    throw new OpenAIProviderError('Unable to reach OpenAI', 502, 'openai_network_error', String(error?.message || error).slice(0, 240));
  }
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch (_) { data = { raw: raw.slice(0, 500) }; }
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI HTTP ${response.status}`;
    const code = data?.error?.code || data?.error?.type || 'openai_request_failed';
    throw new OpenAIProviderError(message, response.status >= 400 && response.status < 500 ? 400 : 502, code, String(message).slice(0, 240));
  }
  return data;
}

export function outputText(response = {}) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();
  const parts = [];
  for (const item of response.output || []) {
    if (item?.type !== 'message') continue;
    for (const c of item.content || []) if (c?.type === 'output_text' && typeof c.text === 'string') parts.push(c.text);
  }
  return parts.join('\n').trim();
}

export function parseStructuredOutput(response = {}) {
  const text = outputText(response);
  if (!text) throw new OpenAIProviderError('OpenAI returned no text output', 502, 'openai_empty_output');
  try { return JSON.parse(text); }
  catch (_) { throw new OpenAIProviderError('OpenAI returned invalid structured output', 502, 'openai_invalid_structured_output', text.slice(0, 240)); }
}

export function extractWebSources(response = {}) {
  const seen = new Set(), sources = [];
  const add = (url, title = '') => {
    url = String(url || '').trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    sources.push({ url, title: String(title || '').trim().slice(0, 300) });
  };
  for (const item of response.output || []) {
    if (item?.type === 'web_search_call') {
      for (const s of item?.action?.sources || []) add(s?.url, s?.title || s?.name || '');
    }
    if (item?.type === 'message') {
      for (const c of item.content || []) for (const a of c?.annotations || []) {
        if (a?.type === 'url_citation') add(a?.url_citation?.url || a?.url, a?.url_citation?.title || a?.title || '');
      }
    }
  }
  return sources.slice(0, 30);
}

export function providerErrorJson(error) {
  if (error instanceof OpenAIProviderError) return { status: error.status, body: { ok: false, error: error.code, detail: error.detail || error.message } };
  return { status: 500, body: { ok: false, error: 'ai_runtime_error', detail: String(error?.message || error).slice(0, 240) } };
}
