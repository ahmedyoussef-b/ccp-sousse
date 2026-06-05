const fs = require('fs').promises;

const JSON_FILE = 'C:/ahmed/ccp/data/centrale_documents/TG1/description/TG.json';
const CHROMA_URL = 'http://localhost:8000';
const OLLAMA_URL = 'http://localhost:11434';
const COLLECTION_NAME = 'TG1';
const EMBEDDING_MODEL = 'nomic-embed-text';

async function getEmbedding(text) {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text })
  });
  if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
  const data = await response.json();
  return data.embedding;
}

function splitText(text, chunkSize = 500, overlap = 100) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const bestBreak = Math.max(lastSpace, lastNewline, start + chunkSize / 2);
      if (bestBreak > start) end = bestBreak + 1;
    }
    chunks.push(text.substring(start, Math.min(end, text.length)));
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
}

async function indexTG1() {
  console.log('🚀 Indexation TG1 - Démarrage');
  const rawData = await fs.readFile(JSON_FILE, 'utf-8');
  const jsonData = JSON.parse(rawData);
  const textContent = JSON.stringify(jsonData, null, 2);
  console.log(`📊 ${textContent.length} caractères`);
  
  const chunks = splitText(textContent, 500, 100);
  console.log(`📦 ${chunks.length} chunks`);
  
  try {
    await fetch(`${CHROMA_URL}/api/v1/collections/${COLLECTION_NAME}`, { method: 'DELETE' });
  } catch (e) {}
  
  await fetch(`${CHROMA_URL}/api/v1/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: COLLECTION_NAME, metadata: { 'hnsw:space': 'cosine' } })
  });
  console.log(`✅ Collection ${COLLECTION_NAME} créée`);
  
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await getEmbedding(chunks[i]);
    await fetch(`${CHROMA_URL}/api/v1/collections/${COLLECTION_NAME}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: [`TG_json_${i}`],
        embeddings: [embedding],
        documents: [chunks[i]],
        metadatas: [{ source: 'TG.json', chunk: i, zone: 'TG1' }]
      })
    });
    if ((i + 1) % 5 === 0) console.log(`   📝 ${i + 1}/${chunks.length}`);
  }
  
  const countRes = await fetch(`${CHROMA_URL}/api/v1/collections/${COLLECTION_NAME}/count`);
  const count = await countRes.json();
  console.log(`✅ Indexation terminée : ${count} documents`);
}

indexTG1().catch(e => console.error('❌', e.message));