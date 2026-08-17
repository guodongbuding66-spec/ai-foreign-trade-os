PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  brand_name TEXT,
  domain TEXT,
  website TEXT,
  country_code TEXT,
  city TEXT,
  company_type TEXT,
  industry TEXT,
  lead_score INTEGER DEFAULT 0,
  stage TEXT DEFAULT 'New',
  owner_user_id TEXT,
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  job_title TEXT,
  department TEXT,
  seniority TEXT,
  email TEXT,
  email_status TEXT DEFAULT 'unknown',
  phone TEXT,
  whatsapp TEXT,
  linkedin_url TEXT,
  language TEXT,
  timezone TEXT,
  owner_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  series TEXT,
  default_hs_code TEXT,
  material TEXT,
  market TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skus (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  variant TEXT,
  color TEXT,
  size TEXT,
  gross_weight REAL,
  cost REAL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  moq INTEGER DEFAULT 1,
  lead_time INTEGER,
  hs_code TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS sku_packages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  package_code TEXT NOT NULL,
  quantity_per_set INTEGER NOT NULL DEFAULT 1,
  length REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  dimension_unit TEXT NOT NULL DEFAULT 'CM',
  gross_weight REAL NOT NULL DEFAULT 0,
  net_weight REAL,
  weight_unit TEXT NOT NULL DEFAULT 'KG',
  rotatable_x INTEGER NOT NULL DEFAULT 1,
  rotatable_y INTEGER NOT NULL DEFAULT 1,
  rotatable_z INTEGER NOT NULL DEFAULT 1,
  keep_upright INTEGER NOT NULL DEFAULT 0,
  stackable INTEGER NOT NULL DEFAULT 1,
  max_stack_layers INTEGER,
  max_top_load REAL,
  fragile INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(sku_id) REFERENCES skus(id)
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  quote_no TEXT NOT NULL UNIQUE,
  company_id TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  incoterm TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  total REAL NOT NULL DEFAULT 0,
  margin REAL NOT NULL DEFAULT 0,
  cost_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_skus_product_id ON skus(product_id);
CREATE INDEX IF NOT EXISTS idx_packages_sku_id ON sku_packages(sku_id);
