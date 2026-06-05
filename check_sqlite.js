const Database = require('better-sqlite3');
const db = new Database('data/ai-core.db');

try {
  const count = db.prepare('SELECT COUNT(*) as count FROM vision_data').get();
  console.log('Images in SQLite (vision_data):', count.count);
  
  const sample = db.prepare('SELECT id, filename FROM vision_data LIMIT 5').all();
  console.log('Sample images:', sample);
} catch (e) {
  console.error('Error:', e.message);
} finally {
  db.close();
}
