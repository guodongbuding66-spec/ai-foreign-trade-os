PRAGMA foreign_keys = ON;

-- Order structure: separate routing, promise dates, and packaging terms from the
-- legacy generic port/ETD/ETA fields so rules can compare promises vs execution.
ALTER TABLE orders ADD COLUMN pol TEXT;
ALTER TABLE orders ADD COLUMN pod TEXT;
ALTER TABLE orders ADD COLUMN promised_etd TEXT;
ALTER TABLE orders ADD COLUMN promised_eta TEXT;
ALTER TABLE orders ADD COLUMN packaging_terms TEXT;
ALTER TABLE orders ADD COLUMN shipping_marks TEXT;

-- Normalize document extraction separately from immutable business snapshots.
ALTER TABLE document_versions ADD COLUMN normalized_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE document_versions ADD COLUMN parsed_text TEXT;
ALTER TABLE document_versions ADD COLUMN extraction_status TEXT;
ALTER TABLE document_versions ADD COLUMN extraction_provider TEXT;
ALTER TABLE document_versions ADD COLUMN extraction_model TEXT;
ALTER TABLE document_versions ADD COLUMN extracted_at TEXT;
ALTER TABLE document_versions ADD COLUMN validation_status TEXT;

-- Planned shipment timestamps are not evidence of actual shipment events.
ALTER TABLE shipments ADD COLUMN actual_on_board_at TEXT;
ALTER TABLE shipments ADD COLUMN actual_departure_at TEXT;
ALTER TABLE shipments ADD COLUMN actual_arrival_at TEXT;

-- A load plan must be traceable to the commercial order / shipment and to the
-- packaging master-data version used when solving the plan.
ALTER TABLE load_plans ADD COLUMN order_id TEXT REFERENCES orders(id);
ALTER TABLE load_plans ADD COLUMN shipment_id TEXT REFERENCES shipments(id);
ALTER TABLE load_plans ADD COLUMN package_master_snapshot_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS letters_of_credit (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id TEXT,
  document_id TEXT,
  lc_no TEXT NOT NULL,
  applicant_name TEXT,
  beneficiary_name TEXT,
  currency TEXT,
  amount REAL,
  issue_date TEXT,
  expiry_date TEXT,
  presentation_place TEXT,
  latest_shipment_date TEXT,
  partial_shipment TEXT NOT NULL DEFAULT 'unknown',
  transshipment TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'Draft',
  raw_terms_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id, lc_no),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(document_id) REFERENCES documents(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS lc_required_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  letter_of_credit_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  description TEXT,
  originals INTEGER,
  copies INTEGER,
  conditions_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(letter_of_credit_id) REFERENCES letters_of_credit(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_discrepancies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id TEXT,
  letter_of_credit_id TEXT,
  document_id TEXT,
  document_version_id TEXT,
  rule_key TEXT NOT NULL,
  field_path TEXT,
  expected_json TEXT,
  actual_json TEXT,
  severity TEXT NOT NULL DEFAULT 'Warning',
  status TEXT NOT NULL DEFAULT 'Open',
  message TEXT NOT NULL,
  resolution_text TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(letter_of_credit_id) REFERENCES letters_of_credit(id),
  FOREIGN KEY(document_id) REFERENCES documents(id),
  FOREIGN KEY(document_version_id) REFERENCES document_versions(id),
  FOREIGN KEY(resolved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS document_custody (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_version_id TEXT,
  copy_no INTEGER,
  copy_kind TEXT NOT NULL DEFAULT 'original',
  holder_type TEXT,
  holder_name TEXT,
  status TEXT NOT NULL DEFAULT 'Held',
  tracking_no TEXT,
  transferred_at TEXT,
  received_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY(document_version_id) REFERENCES document_versions(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS shipment_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  shipment_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_at TEXT NOT NULL,
  location TEXT,
  source TEXT,
  source_ref TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shipment_legs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  shipment_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  mode TEXT,
  carrier TEXT,
  vessel_voyage TEXT,
  origin TEXT,
  destination TEXT,
  etd TEXT,
  eta TEXT,
  actual_departure_at TEXT,
  actual_arrival_at TEXT,
  transshipment_flag INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  UNIQUE(shipment_id, seq)
);

CREATE TABLE IF NOT EXISTS load_plan_unloaded_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  load_plan_id TEXT NOT NULL,
  sku_id TEXT,
  package_id TEXT,
  set_no INTEGER,
  package_code TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(load_plan_id) REFERENCES load_plans(id) ON DELETE CASCADE,
  FOREIGN KEY(sku_id) REFERENCES skus(id),
  FOREIGN KEY(package_id) REFERENCES sku_packages(id)
);

CREATE INDEX IF NOT EXISTS idx_lc_tenant_status ON letters_of_credit(tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_lc_order ON letters_of_credit(order_id);
CREATE INDEX IF NOT EXISTS idx_lc_document ON letters_of_credit(document_id);
CREATE INDEX IF NOT EXISTS idx_lc_required_lc ON lc_required_documents(letter_of_credit_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_discrepancies_order_status ON document_discrepancies(order_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_discrepancies_document ON document_discrepancies(document_id, document_version_id, status);
CREATE INDEX IF NOT EXISTS idx_custody_document ON document_custody(document_id, document_version_id, status);
CREATE INDEX IF NOT EXISTS idx_shipment_events_ship_time ON shipment_events(shipment_id, event_at);
CREATE INDEX IF NOT EXISTS idx_shipment_legs_ship_seq ON shipment_legs(shipment_id, seq);
CREATE INDEX IF NOT EXISTS idx_load_plans_order ON load_plans(order_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_load_plans_shipment ON load_plans(shipment_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_load_unloaded_plan ON load_plan_unloaded_items(load_plan_id);

INSERT INTO schema_meta(key, value, updated_at)
VALUES ('schema_version', '6', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
