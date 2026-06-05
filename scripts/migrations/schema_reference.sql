-- Fichier: action-cache.db

-- 1. Caches (expiration automatique)
CREATE TABLE caches (
  namespace TEXT,      -- 'validation'|'plan'|'suggestion'|'decision'
  key TEXT,
  value TEXT,          -- JSON
  expiresAt INTEGER,
  createdAt INTEGER,
  PRIMARY KEY (namespace, key)
);

-- 2. Politiques apprises (démonstrations)
CREATE TABLE policies (
  id TEXT PRIMARY KEY,
  contextPattern TEXT,
  actionTemplate TEXT, -- JSON
  confidence REAL,
  demonstrationCount INTEGER,
  successRate REAL,
  createdAt INTEGER,
  updatedAt INTEGER,
  lastUsed INTEGER,
  tags TEXT             -- JSON array
);

-- 3. Démonstrations (historique d'apprentissage)
CREATE TABLE demonstrations (
  id TEXT PRIMARY KEY,
  timestamp INTEGER,
  context TEXT,        -- JSON
  action TEXT,         -- JSON
  result TEXT,         -- JSON
  userId TEXT,
  sessionId TEXT,
  success INTEGER,     -- 0/1
  tags TEXT,           -- JSON array
  duration INTEGER
);

-- 4. Snapshots (pour undo/redo)
CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  state TEXT,          -- JSON
  createdAt INTEGER,
  expiresAt INTEGER,   -- Nettoyage automatique
  workflowId TEXT
);

-- 5. Métriques (statistiques historiques)
CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER,
  module TEXT,
  metricName TEXT,
  metricValue REAL
);

-- Index pour performances
CREATE INDEX idx_caches_expires ON caches(expiresAt);
CREATE INDEX idx_policies_confidence ON policies(confidence);
CREATE INDEX idx_demonstrations_timestamp ON demonstrations(timestamp);
CREATE INDEX idx_snapshots_expires ON snapshots(expiresAt);