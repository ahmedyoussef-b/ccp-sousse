
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'data', 'ai-core.db');
const db = new Database(DB_PATH);

const targetId = '3cc3027d-11ec-4e15-9863-2d283241397a';

console.log(`--- SEARCHING FOR ID: ${targetId} ---`);
try {
  const result = db.prepare("SELECT * FROM qr_index WHERE id = ?").get(targetId);
  if (result) {
    console.log('Found in qr_index:');
    console.table([result]);
  } else {
    console.log('Not found in qr_index.');
  }
} catch (e) {
  console.log('Error:', e.message);
}

db.close();
