# Cloudflare D1 Production Setup

Target database name: `ai-foreign-trade-os-production`

Binding name used by Pages Functions: `DB`

## 1. Create the D1 database

Cloudflare Dashboard → Storage & Databases → D1 SQL Database → Create.

Create a database named:

`ai-foreign-trade-os-production`

## 2. Bind D1 to the Pages project

Cloudflare Dashboard → Workers & Pages → `ai-foreign-trade-os` → Settings → Bindings → Add → D1 database bindings.

Use:

- Variable name: `DB`
- D1 database: `ai-foreign-trade-os-production`

Save the binding and redeploy the Pages project so the binding becomes available to Pages Functions.

## 3. Apply database migrations

Apply migrations in order:

1. `migrations/0001_init.sql`
2. `migrations/0002_foundation.sql`

### Wrangler method

From a checked-out copy of this repository after authenticating Wrangler with the same Cloudflare account:

```bash
npx wrangler d1 execute ai-foreign-trade-os-production --remote --file=./migrations/0001_init.sql
npx wrangler d1 execute ai-foreign-trade-os-production --remote --file=./migrations/0002_foundation.sql
```

You can also use D1 migrations if the repository is later converted to Wrangler-managed migrations.

## 4. Verify production binding and schema

After the Pages redeploy, open:

`https://ai-foreign-trade-os.pages.dev/api/runtime`

`bindings.DB` should be `true`.

Then open:

`https://ai-foreign-trade-os.pages.dev/api/db/status`

Expected result:

```json
{
  "ok": true,
  "bound": true,
  "schemaReady": true,
  "schemaVersion": "2",
  "missingTables": []
}
```

The endpoint is read-only. It does not expose database contents beyond aggregate table counts.

## 5. Security boundary

The public site must not expose unauthenticated write access to D1.

Before switching Company / Contact / Lead / Product / SKU / Packaging / Quote / Load Plan CRUD from browser `localStorage` to D1, implement:

- Login/session handling
- Tenant isolation
- RBAC authorization
- Server-side validation
- Audit logging
- CSRF/session protections where applicable

Third-party provider secrets must remain Cloudflare server-side secrets/bindings and must never be written into browser storage or committed to GitHub.
