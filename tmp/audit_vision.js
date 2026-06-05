
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'data', 'ai-core.db');
const db = new Database(DB_PATH);

console.log('--- VISION_DATA COUNT ---');
try {
  const count = db.prepare("SELECT COUNT(*) as count FROM vision_data").get();
  console.log('Count:', count.count);
  
  if (count.count > 0) {
      console.log('--- SAMPLE DATA ---');
      const sample = db.prepare("SELECT id, filename FROM vision_data LIMIT 5").all();
      console.table(sample);
  }
} catch (e) {
  console.log('Error:', e.message);
}

db.close();
