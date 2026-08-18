# D1 Workflow Migration

This stage moves the remaining implemented workflow state from browser localStorage to authenticated, tenant-scoped D1 persistence.

Migrated in this stage:

- Opportunities
- Tasks
- Automations
- Automation run checkpoints when `lastRun` advances
- Load Plans and placed carton rows
- Quote deletion

The workspace snapshot hydrates these entities from D1 before `app.js` starts. Browser localStorage remains a UI cache/compatibility layer, not the source of truth.

No schema migration is required: schema v3 already contains `opportunities`, `tasks`, `automations`, `automation_runs`, `load_plans`, and `load_plan_items`.

Write order preserves parent/child relations; delete order is reversed so referenced entities are removed before their parents.
