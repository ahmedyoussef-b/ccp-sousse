const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.cwd(), 'data', 'industrial_ai.db');
const db = new Database(dbPath);

console.log('--- circuit_mindmaps schema ---');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='circuit_mindmaps'").get().sql);

console.log('--- mindmap_nodes schema ---');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='mindmap_nodes'").get().sql);

const systInfo = db.prepare("SELECT * FROM circuit_mindmaps WHERE circuit_id = 'SYST'").get();
if (systInfo) {
    console.log('--- SYST mindmap data ---');
    console.log(JSON.stringify(systInfo, null, 2).substring(0, 500));
}
