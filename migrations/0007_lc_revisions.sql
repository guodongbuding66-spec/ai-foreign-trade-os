PRAGMA foreign_keys = ON;

-- Immutable L/C revision history. letters_of_credit remains the current effective
-- state; lc_revisions preserves each source-backed original/amendment snapshot so
-- amendment re-checks can compare versions without relying on overwritten rows.
CREATE TABLE IF NOT EXISTS lc_revisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  letter_of_credit_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  source_document_id TEXT,
  source_document_version_id TEXT,
  source_type TEXT NOT NULL DEFAULT 'original',
  source_ref TEXT,
  source_hash TEXT,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  required_documents_json TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(letter_of_credit_id) REFERENCES letters_of_credit(id) ON DELETE CASCADE,
  FOREIGN KEY(source_document_id) REFERENCES documents(id),
  FOREIGN KEY(source_document_version_id) REFERENCES document_versions(id),
  FOREIGN KEY(created_by) REFERENCES users(id),
  UNIQUE(letter_of_credit_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_lc_revisions_lc_rev
ON lc_revisions(letter_of_credit_id, revision_no DESC);

CREATE INDEX IF NOT EXISTS idx_lc_revisions_tenant_created
ON lc_revisions(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lc_revisions_source_document
ON lc_revisions(source_document_id, source_document_version_id);

INSERT INTO schema_meta(key, value, updated_at)
VALUES ('schema_version', '7', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
