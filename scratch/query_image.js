const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'ai-core.db');
const db = new Database(dbPath);

try {
    const row = db.prepare("SELECT * FROM vision_data WHERE filename LIKE '%pupitre_CR2%'").get();
    if (row) {
        console.log("ID_FOUND: " + row.id);
        console.log("IMAGE_DATA_START");
        console.log(JSON.stringify(row, null, 2));
        console.log("IMAGE_DATA_END");
        
        const prep = db.prepare("SELECT * FROM image_preparations WHERE image_id = ?").get(row.id);
        if (prep) {
            console.log("PREP_DATA_START");
            console.log(JSON.stringify(prep, null, 2));
            console.log("PREP_DATA_END");
        }
    } else {
        console.log("Image not found");
    }
} catch (err) {
    console.error(err);
} finally {
    db.close();
}
