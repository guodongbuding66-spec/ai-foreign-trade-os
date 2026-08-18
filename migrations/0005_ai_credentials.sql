PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_provider_credentials (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_name TEXT,
  protocol TEXT,
  base_url TEXT,
  model TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  api_key_ciphertext TEXT NOT NULL,
  api_key_iv TEXT NOT NULL,
  api_key_last4 TEXT,
  cipher_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  last_tested_at TEXT,
  last_test_status TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id, user_id, provider_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_user_preferences (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  research_provider_id TEXT,
  draft_provider_id TEXT,
  allow_workspace_fallback INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id, user_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_credentials_user ON ai_provider_credentials(tenant_id, user_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_ai_credentials_provider ON ai_provider_credentials(tenant_id, provider_id, status);

INSERT INTO schema_meta(key, value, updated_at)
VALUES ('schema_version', '5', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
