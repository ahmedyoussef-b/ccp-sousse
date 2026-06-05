// create-table.js
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'ai-core.db');
const db = new Database(dbPath);

// Créer la table vision_data
db.exec(`
  CREATE TABLE IF NOT EXISTS vision_data (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    thumbnail_path TEXT,
    description TEXT,
    tags TEXT DEFAULT '[]',
    location TEXT,
    folder_id TEXT,
    date TEXT,
    created_at INTEGER NOT NULL,
    qa_pairs TEXT,
    invocation_keywords TEXT,
    equipment_state TEXT DEFAULT 'normal',
    valid_until INTEGER,
    linked_procedure TEXT,
    image_base64 TEXT,
    image_type TEXT DEFAULT 'simple',
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    mime_type TEXT,
    metadata TEXT DEFAULT '{}'
  )
`);

console.log('✅ Table vision_data créée avec succès');
db.close();