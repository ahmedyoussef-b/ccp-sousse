
const { ChromaDBManager } = require('./src/ai/vector/chromadb-manager');
const { ChromaCollections } = require('./src/ai/vector/chromadb-schema');

const targetId = '3cc3027d-11ec-4e15-9863-2d283241397a';

async function search() {
    console.log(`--- SEARCHING CHROMADB FOR ID: ${targetId} ---`);
    const manager = ChromaDBManager.getInstance();
    await manager.initialize();
    
    const collections = Object.keys(ChromaCollections);
    
    for (const col of collections) {
        try {
            const collection = await manager.getOrCreateCollection(col);
            const result = await collection.get({ ids: [targetId] });
            if (result && result.ids.length > 0) {
                console.log(`Found in collection: ${col}`);
                console.log('Metadata:', result.metadatas[0]);
                process.exit(0);
            }
        } catch (e) {
            // Skip
        }
    }
    console.log('Not found in any ChromaDB collection.');
    process.exit(1);
}

search();
