const { ChromaClient } = require('chromadb');

async function test() {
  const client = new ChromaClient({ path: 'http://127.0.0.1:8000' });
  try {
    console.log('Testing heartbeat...');
    const hb = await client.heartbeat();
    console.log('Heartbeat success:', hb);
    const version = await client.version();
    console.log('Version:', version);
  } catch (e) {
    console.error('Heartbeat failed:', e);
  }
}

test();
