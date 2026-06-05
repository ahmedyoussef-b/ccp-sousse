
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'data', 'ai-core.db');
const db = new Database(DB_PATH);

console.log('--- TABLES ---');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables.map(t => t.name).join(', '));
const hasVisionData = tables.some(t => t.name === 'vision_data');
console.log('Has vision_data:', hasVisionData);

console.log('--- MIGRATIONS FOR vision_data ---');
try {
  const migrations = db.prepare("SELECT * FROM _migrations WHERE tableName = 'vision_data'").all();
  console.table(migrations);
} catch (e) {
  console.log('Error querying migrations:', e.message);
}

db.close();
