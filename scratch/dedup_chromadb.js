const { ChromaClient } = require('chromadb');

async function main() {
  const client = new ChromaClient({ path: 'http://127.0.0.1:8000' });
  
  try {
    // Le nom de la collection dans ChromaDB est 'VISION_METADATA' 
    const collection = await client.getCollection({ name: 'VISION_METADATA' });
    const count = await collection.count();
    console.log(`ChromaDB VISION_METADATA: ${count} documents`);
    
    // Supprimer le doublon
    const dupeId = 'vision_a924b144-927b-4fb9-a724-9bd4eb813014';
    try {
      await collection.delete({ ids: [dupeId] });
      console.log(`✅ Supprimé de ChromaDB: ${dupeId}`);
    } catch (e) {
      console.log(`⚠️ ID non trouvé dans ChromaDB: ${dupeId} (${e.message})`);
    }
    
    const afterCount = await collection.count();
    console.log(`ChromaDB VISION_METADATA après: ${afterCount} documents`);
    
    // Lister tous les IDs pour diagnostic
    const allDocs = await collection.get();
    console.log('\n=== IDs dans ChromaDB ===');
    allDocs.ids.forEach(id => console.log(`  ${id}`));
  } catch (e) {
    console.error('Erreur:', e.message);
  }
}

main().catch(console.error);
