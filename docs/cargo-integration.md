# CargoFit cloud bridge

The CargoFit planner connects to `/cargo-bridge.html` in a same-origin popup so OS session credentials never enter the planner. The bridge accepts only the three configured planner production origins and checks opener identity and a per-connection channel. API reads/writes retain existing OS role permissions; writes require a same-origin request.

New endpoints:
- `/api/cargo-workspaces`: tenant-scoped immutable workspace versions (container.read / container.write).
- `/api/cargo-shares`: create 1–30 day read-only shares, list and revoke within the same tenant.
- `/api/cargo-share-public`: POST a random share token to read its snapshot; hash stored in D1, expiry/revocation checked on every read.
- `/api/cargo-load-plan`: bounded JSON and tenant-reference validation before the existing load-plan writer. Verifies SKU, SKU/package pairing and source orders.

Existing configured D1 binding `DB` is reused. `cargo_workspaces` and `cargo_shares` are created idempotently on the first authorized workspace/share request. No credentials, users or tenant permissions are auto-created. Standard deployment through the repository's existing Pages integration serves the static bridge/share pages and bundles the Functions.

Payloads including envelope are limited to 1 MiB, and no automatic upload occurs. The public share page renders data with textContent, uses external same-origin scripts compatible with the site's CSP, and carries the token in the URL fragment (not a URL query). Downloaded copies cannot be revoked.

Orders/SKU packaging flow through existing read endpoints. Planner dimensions use mm; the OS adapter converts cm to mm on import and mm to cm on write-back. Output is a new Draft load plan, not an order mutation.

Run `node --test tests/cargo-cloud.test.mjs` on Node 22.13+ to exercise real authentication and isolated SQLite tenant/version/share behavior. Complete production verification requires an authorized OS login and its existing D1 binding.
