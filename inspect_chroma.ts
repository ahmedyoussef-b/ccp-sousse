//src/inspect_chroma.ts
import { ChromaClient } from 'chromadb';

async function inspectCollections() {
  const client = new ChromaClient({ path: 'http://127.0.0.1:8000' });
  try {
    const collections = await client.listCollections();
    console.log('Collections:', collections);
    
    for (const name of collections) {
      const col = await client.getCollection({ name: name as string });
      const count = await col.count();
      const metadata = col.metadata;
      console.log(`Collection: ${name}, Count: ${count}, Metadata:`, metadata);
      
      // Try a dummy query to check dimension
      try {
        await col.query({ queryEmbeddings: [new Array(768).fill(0)], nResults: 1 });
        console.log(`  - Supporte 768D: ✅`);
      } catch (e: any) {
        console.log(`  - Supporte 768D: ❌ (${e.message})`);
      }
      
      try {
        await col.query({ queryEmbeddings: [new Array(1024).fill(0)], nResults: 1 });
        console.log(`  - Supporte 1024D: ✅`);
      } catch (e: any) {
        console.log(`  - Supporte 1024D: ❌ (${e.message})`);
      }
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

inspectCollections();
