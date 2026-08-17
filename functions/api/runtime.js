export async function onRequestGet(context) {
  const bindings = ['DB', 'KV', 'R2', 'OPENAI_API_KEY', 'APOLLO_API_KEY', 'HUNTER_API_KEY'];
  const available = bindings.reduce((acc, key) => {
    acc[key] = Boolean(context.env?.[key]);
    return acc;
  }, {});
  return Response.json({
    mode: 'development-baseline',
    bindings: available,
    warning: 'Secrets are never returned. Only binding presence is exposed.'
  }, { headers: { 'Cache-Control': 'no-store' } });
}
