const Database = require('better-sqlite3');
const db = new Database('data/ai-core.db');
const row = db.prepare("SELECT id FROM vision_data WHERE filename LIKE '%pupitre_CR2%'").get();
if (row) {
    console.log(row.id);
} else {
    console.log('NOT_FOUND');
}
db.close();
