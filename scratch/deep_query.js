const Database = require('better-sqlite3');
const db = new Database('data/ai-core.db');
const id = '307ec286-34f0-4c83-8212-ee78ecc260c8';
const row = db.prepare("SELECT * FROM vision_data WHERE id = ?").get(id);
const prep = db.prepare("SELECT * FROM image_preparations WHERE image_id = ?").get(id);
const hierarchy = db.prepare("SELECT * FROM part_matching_hierarchy WHERE child_id = ? OR parent_id = ?").all(id, id);

console.log("=== IMAGE DATA ===");
console.log(JSON.stringify(row, null, 2));
console.log("\n=== PREPARATION ===");
console.log(JSON.stringify(prep, null, 2));
console.log("\n=== SPATIAL HIERARCHY (Part Matching) ===");
console.log(JSON.stringify(hierarchy, null, 2));

db.close();
