export async function onRequestGet(context) {
  return Response.json({
    ok: true,
    service: 'ai-foreign-trade-os',
    version: '1.0.0-dev',
    runtime: 'cloudflare-pages-functions',
    time: new Date().toISOString()
  }, { headers: { 'Cache-Control': 'no-store' } });
}
