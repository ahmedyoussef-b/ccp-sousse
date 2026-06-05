const Database = require('better-sqlite3');
const db = new Database('data/ai-core.db');
const id = '1c9009fe-9cb2-48f1-a977-664b721b76dd';
const row = db.prepare("SELECT * FROM vision_data WHERE id = ?").get(id);
console.log(row ? JSON.stringify(row, null, 2) : 'NOT_FOUND');
db.close();
