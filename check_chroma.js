
const { ChromaClient } = require('chromadb');

async function checkChroma() {
  const client = new ChromaClient({ path: "http://127.0.0.1:8000" });
  try {
    const collections = await client.listCollections();
    console.log('Collections count:', collections.length);
    
    for (const collInfo of collections) {
      const name = typeof collInfo === 'string' ? collInfo : collInfo.name;
      if (!name) {
        console.log('Skipping invalid collection info:', collInfo);
        continue;
      }
      const collection = await client.getCollection({ name });
      const count = await collection.count();
      console.log(`Collection ${name}: ${count} items`);
    }
  } catch (e) {
    console.error('Error checking Chroma:', e.message);
  }
}

checkChroma();
