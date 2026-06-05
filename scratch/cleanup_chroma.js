
const { ChromaClient } = require('chromadb');

async function cleanupChroma() {
  const client = new ChromaClient({ path: "http://127.0.0.1:8000" });
  try {
    const collections = await client.listCollections();
    console.log('Total collections:', collections.length);
    
    // Collections à garder impérativement
    const whiteList = [
      'VISION_METADATA',
      'DOCUMENTS_GENERAUX',
      'MEMOIRE_EPISODIQUE',
      'SHARED'
    ];
    
    for (const collInfo of collections) {
      const name = typeof collInfo === 'string' ? collInfo : collInfo.name;
      if (!name) continue;
      
      const collection = await client.getCollection({ name });
      const count = await collection.count();
      
      if (count === 0 && !whiteList.includes(name)) {
        console.log(`🗑️ Deleting empty collection: ${name}`);
        await client.deleteCollection({ name });
      } else if (!whiteList.includes(name) && !name.startsWith('B') && !name.startsWith('T') && name !== 'centrale_procedures' && name !== 'centrale_analyse_performance' && name !== 'centrale_documents_generaux' && name !== 'A0_DIVERS' && name !== 'RH_COLL') {
        // Optionnel: on pourrait supprimer tout ce qui n'est pas dans le schéma officiel
        // Mais on va être prudent et ne supprimer que les vides pour l'instant
      } else {
        console.log(`✅ Keeping collection: ${name} (${count} items)`);
      }
    }
    
    console.log('Cleanup finished.');
  } catch (e) {
    console.error('Error during cleanup:', e.message);
  }
}

cleanupChroma().catch(console.error);
