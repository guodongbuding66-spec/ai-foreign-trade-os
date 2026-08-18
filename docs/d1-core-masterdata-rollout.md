# D1 Core Master Data Rollout

This stage moves Contact, Product, SKU/Packaging and Quote persistence behind authenticated, tenant-scoped D1 APIs while preserving the existing UI.

No new SQL migration is required: all tables are already present in schema v3.

## Data source behavior
- Companies: D1 source of truth (already production-tested)
- Contacts: D1 source of truth
- Products: D1 source of truth
- SKUs and 1-set-N-cartons Packaging: D1 source of truth and synchronized as one SKU payload
- Quotes: D1 source of truth; quote header and quote item are persisted together

The workspace loader hydrates server data before loading `assets/app.js`; old demo records for these entities are overwritten rather than copied into production.

## Security
All resource APIs require authenticated session + tenant resolution. Writes use same-origin checks, RBAC permissions and audit logging. Foreign parent entities are revalidated inside the tenant before writes.

## Manual QA
After Production deploy:
1. Product: create Product, refresh, verify it persists.
2. SKU: create SKU with two or more cartons, refresh, verify all cartons persist.
3. SKU edit: change packaging dimensions or carton count, refresh, verify update persists.
4. Quote: create a quote from the D1 Company + SKU, refresh, verify it persists.
5. `/api/db/status`: product / sku / sku_packages / quote counts should increase.
