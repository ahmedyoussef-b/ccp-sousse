import { chromaDBManager } from '../src/ai/vector/chromadb-manager';

async function fix() {
  console.log('--- Fixing VISION Collection Dimension ---');
  try {
    const collection = await chromaDBManager.getOrCreateCollection('VISION');
    const count = await collection.count();
    console.log(`✅ VISION Collection is ready. Current count: ${count}`);
    
    // Test a dummy query with 1024D
    const results = await collection.query({
      queryEmbeddings: [new Array(1024).fill(0)],
      nResults: 1
    });
    console.log('✅ Query test successful with 1024D vector');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failure:', err);
    process.exit(1);
  }
}

fix();
