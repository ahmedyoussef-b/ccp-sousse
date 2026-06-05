const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'ai-core.db');
const db = new Database(dbPath);

try {
    const row = db.prepare("SELECT * FROM vision_data WHERE id = ?").get("8934ff5f-c8a5-49e3-b479-f460460559a3");
    console.log(JSON.stringify(row, null, 2));
} catch (err) {
    console.error(err);
} finally {
    db.close();
}
