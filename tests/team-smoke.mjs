import assert from 'node:assert/strict';
import { can } from '../functions/_lib/auth.js';
import { TEAM_ROLE_PRESETS } from '../functions/_lib/team.js';

const sales={permissions:TEAM_ROLE_PRESETS.sales.permissions};
for(const permission of [
  'crm.companies.read','crm.contacts.write','crm.opportunities.write','crm.tasks.read',
  'lead.write','product.catalog.read','product.skus.write','quotes.write','orders.read',
  'documents.write','shipments.write','outreach.read','ai.research.use','ai.outreach.use',
  'container.write','automation.read'
]) assert.equal(can(sales,permission),true,`sales missing ${permission}`);
assert.equal(can(sales,'workspace.users.manage'),false,'sales must not manage users');

const viewer={permissions:TEAM_ROLE_PRESETS.viewer.permissions};
assert.equal(can(viewer,'crm.companies.read'),true);
assert.equal(can(viewer,'orders.read'),true);
assert.equal(can(viewer,'crm.companies.write'),false);
assert.equal(can(viewer,'orders.write'),false);
assert.equal(can(viewer,'workspace.users.manage'),false);
assert.equal(can({permissions:['*']},'workspace.users.manage'),true);

console.log('Team RBAC smoke OK');
