PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_no TEXT NOT NULL,
  company_id TEXT NOT NULL,
  contact_id TEXT,
  opportunity_id TEXT,
  quote_id TEXT,
  po_number TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  incoterm TEXT,
  port TEXT,
  payment_terms TEXT,
  deposit REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  production_date TEXT,
  etd TEXT,
  eta TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  owner_user_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id, order_no),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(contact_id) REFERENCES contacts(id),
  FOREIGN KEY(opportunity_id) REFERENCES opportunities(id),
  FOREIGN KEY(quote_id) REFERENCES quotes(id),
  FOREIGN KEY(owner_user_id) REFERENCES users(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  line_total REAL NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(sku_id) REFERENCES skus(id)
);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  storage_key TEXT,
  mime_type TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(document_id, version_no),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  shipment_no TEXT NOT NULL,
  order_id TEXT NOT NULL,
  carrier TEXT,
  forwarder TEXT,
  mode TEXT,
  booking_no TEXT,
  bl_no TEXT,
  container_no TEXT,
  seal_no TEXT,
  tracking_no TEXT,
  pol TEXT,
  pod TEXT,
  etd TEXT,
  eta TEXT,
  vessel TEXT,
  voyage TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  owner_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id, shipment_no),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS outreach_drafts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT,
  contact_id TEXT,
  product_id TEXT,
  lead_id TEXT,
  channel TEXT NOT NULL DEFAULT 'email',
  purpose TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  tone TEXT,
  subject TEXT,
  body_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  provider TEXT,
  model TEXT,
  source_context_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(contact_id) REFERENCES contacts(id),
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(lead_id) REFERENCES leads(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_company ON orders(tenant_id, company_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_orders_quote ON orders(quote_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_sku ON order_items(tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_documents_order ON documents(order_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_document ON document_versions(document_id, version_no);
CREATE INDEX IF NOT EXISTS idx_shipments_tenant_status ON shipments(tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_outreach_tenant_status ON outreach_drafts(tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_outreach_contact ON outreach_drafts(contact_id, updated_at);

INSERT INTO schema_meta(key, value, updated_at)
VALUES ('schema_version', '4', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
