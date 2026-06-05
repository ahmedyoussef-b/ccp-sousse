const { ChromaDBManager } = require('./src/ai/vector/chromadb-manager');

async function test() {
    const manager = ChromaDBManager.getInstance();
    console.log('Searching for SOCLE_ET_SUPPORTS in SHARED...');
    const results = await manager.search('SHARED', 'SOCLE_ET_SUPPORTS_TURBINE_TG', { nResults: 5 });
    console.log('Results:', JSON.stringify(results, null, 2));
}

test();
