-- Схема БД дашборда по химии
-- SQLite (better-sqlite3)

CREATE TABLE IF NOT EXISTS objects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT DEFAULT 'Москва',
  responsible_tu TEXT,
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chemical_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  unit TEXT DEFAULT 'канистра',
  unit_weight_kg REAL,
  category TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'test',
  contact TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS supplier_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER REFERENCES suppliers(id),
  chemical_type_id INTEGER REFERENCES chemical_types(id),
  product_name TEXT,
  status TEXT DEFAULT 'test',
  reject_reason TEXT,
  price_purchase REAL,
  price_franchise REAL,
  article TEXT,
  tested_at TEXT
);

CREATE TABLE IF NOT EXISTS weekly_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id INTEGER NOT NULL REFERENCES objects(id),
  chemical_type_id INTEGER NOT NULL REFERENCES chemical_types(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  week_start_date TEXT NOT NULL,
  writeoff REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  delivery_order REAL DEFAULT 0,
  delivery_fact REAL DEFAULT 0,
  cost REAL DEFAULT 0,
  transfer_return REAL DEFAULT 0,
  source_sheet TEXT,
  imported_at TEXT DEFAULT (datetime('now')),
  UNIQUE(object_id, chemical_type_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_weekly_object ON weekly_records(object_id);
CREATE INDEX IF NOT EXISTS idx_weekly_chem ON weekly_records(chemical_type_id);
CREATE INDEX IF NOT EXISTS idx_weekly_date ON weekly_records(week_start_date);

CREATE TABLE IF NOT EXISTS stock_thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id INTEGER NOT NULL REFERENCES objects(id),
  chemical_type_id INTEGER NOT NULL REFERENCES chemical_types(id),
  min_balance REAL NOT NULL DEFAULT 5,
  UNIQUE(object_id, chemical_type_id)
);
