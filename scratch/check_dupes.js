const Database = require('better-sqlite3');
const db = new Database('./data/ai-core.db');

// Check duplicates
const dupes = db.prepare(
  "SELECT file_hash, COUNT(*) as count, GROUP_CONCAT(id) as ids FROM vision_data WHERE file_hash IS NOT NULL AND file_hash != '' GROUP BY file_hash HAVING count > 1"
).all();
console.log('=== DUPLICATE HASHES ===');
console.log(JSON.stringify(dupes, null, 2));

// Total
const total = db.prepare('SELECT COUNT(*) as c FROM vision_data').get();
console.log('\nTOTAL IMAGES:', total.c);

// Null hashes
const nullHash = db.prepare("SELECT COUNT(*) as c FROM vision_data WHERE file_hash IS NULL OR file_hash = ''").get();
console.log('NULL/EMPTY HASHES:', nullHash.c);

// Show all hashes with IDs (first 20)
const all = db.prepare("SELECT id, file_hash, filename FROM vision_data LIMIT 20").all();
console.log('\n=== FIRST 20 ENTRIES ===');
all.forEach(r => {
  console.log(`  ${r.id.substring(0,12)}... | hash: ${r.file_hash ? r.file_hash.substring(0,16)+'...' : 'NULL'} | ${r.filename}`);
});

db.close();
