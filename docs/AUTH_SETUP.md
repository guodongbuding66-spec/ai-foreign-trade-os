# Production Auth Setup

This stage adds the first production authentication foundation without exposing anonymous D1 write APIs.

## 1. Apply migration 0003

In Cloudflare D1 Console for `ai-foreign-trade-os-production`, execute the full contents of:

`migrations/0003_auth.sql`

Then verify:

```sql
SELECT value FROM schema_meta WHERE key = 'schema_version';
```

Expected value: `3`.

## 2. Configure Production Secrets

In Cloudflare Pages → `ai-foreign-trade-os` → Settings → Variables and secrets, add these as **Secrets** for Production:

- `SESSION_SECRET` — random high-entropy secret used for server-side HMAC hashing of session metadata and login rate-limit keys.
- `BOOTSTRAP_TOKEN` — separate one-time token required to create the first Workspace Owner.

Do not commit either value to GitHub and do not put them in browser localStorage.

### Generate locally on Windows PowerShell

Run this command twice and use a different result for each secret:

```powershell
$bytes = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); [Convert]::ToBase64String($bytes)
```

Paste the generated values directly into Cloudflare Secrets. There is no need to send them through chat.

After saving Secrets, redeploy Production.

## 3. Verify Auth readiness

Open:

- `/api/db/status` — expected schema version `3`, `missingTables: []`.
- `/api/auth/status` — expected `authSchemaReady: true`, `sessionSecretConfigured: true`, `bootstrapTokenConfigured: true`, `hasUsers: false` before first setup.

## 4. Create the first Workspace Owner

Open:

`https://ai-foreign-trade-os.pages.dev/setup.html`

Enter:

- Workspace / Company name
- Owner display name
- Owner email
- Password (minimum 12 characters)
- The one-time `BOOTSTRAP_TOKEN`

The bootstrap endpoint creates, in one D1 batch transaction:

- Tenant
- Owner RBAC Role (`permissions_json = ["*"]`)
- User
- PBKDF2-SHA256 credential
- User ↔ Role relation
- Audit record
- Secure server-side Session

The bootstrap also inserts a unique `bootstrap_completed` marker. After the first user is created, subsequent bootstrap attempts return `409 bootstrap_disabled`.

## 5. Login

Open:

`https://ai-foreign-trade-os.pages.dev/login.html`

Authentication uses:

- PBKDF2-SHA256 password verification
- `__Host-aftos_session` HttpOnly + Secure + SameSite=Lax cookie
- D1-backed session revocation/expiry
- 15-minute login-attempt window with temporary blocking after repeated failures
- Tenant, Role and Permission resolution on the server
- Login audit logging

## Security boundary for the next stage

The existing workspace UI still uses browser-local development data until auth bootstrap is verified. Do not add anonymous write endpoints to D1. The next stage will enforce authenticated tenant-scoped APIs and then migrate Company, Contact, Product, SKU, Packaging and Quote CRUD from localStorage to D1.
