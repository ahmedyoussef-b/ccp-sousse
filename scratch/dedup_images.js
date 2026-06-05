/**
 * Script de déduplication: Supprime les doublons physiques (même hash) de la base de données.
 * Conserve le premier enregistrement et supprime les suivants.
 */
const Database = require('better-sqlite3');
const db = new Database('./data/ai-core.db');

// 1. Trouver les doublons
const dupes = db.prepare(
  "SELECT file_hash, COUNT(*) as count, GROUP_CONCAT(id) as ids FROM vision_data WHERE file_hash IS NOT NULL AND file_hash != '' GROUP BY file_hash HAVING count > 1"
).all();

console.log(`=== DÉDUPLICATION ===`);
console.log(`Doublons trouvés: ${dupes.length} groupes`);

let totalRemoved = 0;

for (const dupe of dupes) {
  const ids = dupe.ids.split(',');
  const keep = ids[0]; // Garder le premier
  const remove = ids.slice(1); // Supprimer les suivants
  
  console.log(`\nHash: ${dupe.file_hash.substring(0, 16)}...`);
  console.log(`  Conservé: ${keep}`);
  console.log(`  Supprimés: ${remove.join(', ')}`);
  
  for (const id of remove) {
    // Supprimer de vision_data
    db.prepare('DELETE FROM vision_data WHERE id = ?').run(id);
    // Supprimer de image_preparations
    try { db.prepare('DELETE FROM image_preparations WHERE image_id = ?').run(id); } catch (e) {}
    // Supprimer de l'index BM25
    try { db.prepare('DELETE FROM innovation_bm25_index WHERE document_id = ?').run(id); } catch (e) {}
    totalRemoved++;
  }
}

console.log(`\n✅ Total supprimé: ${totalRemoved} doublons`);

// Vérification
const afterCount = db.prepare('SELECT COUNT(*) as c FROM vision_data').get();
console.log(`Images restantes: ${afterCount.c}`);

db.close();
