const EXPECTED_TABLES = [
  'schema_meta',
  'tenants',
  'roles',
  'users',
  'user_roles',
  'settings',
  'companies',
  'contacts',
  'leads',
  'products',
  'skus',
  'sku_packages',
  'opportunities',
  'tasks',
  'quotes',
  'quote_items',
  'load_plans',
  'load_plan_items',
  'automations',
  'automation_runs',
  'documents',
  'audit_logs'
];

const COUNT_TABLES = [
  'companies',
  'contacts',
  'leads',
  'products',
  'skus',
  'sku_packages',
  'quotes',
  'load_plans',
  'audit_logs'
];

export async function onRequestGet(context) {
  const DB = context.env?.DB;

  if (!DB) {
    return Response.json(
      {
        ok: false,
        bound: false,
        schemaReady: false,
        binding: 'DB',
        message: 'D1 binding DB is not configured for this Pages environment.'
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' }
      }
    );
  }

  try {
    const tableResult = await DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();

    const tables = (tableResult.results || []).map(row => row.name);
    const tableSet = new Set(tables);
    const missingTables = EXPECTED_TABLES.filter(name => !tableSet.has(name));

    let schemaVersion = null;
    if (tableSet.has('schema_meta')) {
      const row = await DB.prepare(
        "SELECT value FROM schema_meta WHERE key = 'schema_version' LIMIT 1"
      ).first();
      schemaVersion = row?.value ?? null;
    }

    const countTargets = COUNT_TABLES.filter(name => tableSet.has(name));
    const counts = {};

    if (countTargets.length) {
      const results = await DB.batch(
        countTargets.map(name => DB.prepare(`SELECT COUNT(*) AS count FROM ${name}`))
      );
      countTargets.forEach((name, index) => {
        counts[name] = Number(results[index]?.results?.[0]?.count || 0);
      });
    }

    return Response.json(
      {
        ok: true,
        bound: true,
        binding: 'DB',
        schemaReady: missingTables.length === 0,
        schemaVersion,
        expectedSchemaVersion: '2',
        tables,
        missingTables,
        counts
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        bound: true,
        schemaReady: false,
        binding: 'DB',
        message: 'D1 binding exists but the database health check failed.',
        error: error instanceof Error ? error.message : String(error)
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' }
      }
    );
  }
}
