
import { getSQLiteCore } from '../src/ai/core/sqlite/manager';

async function listBM25() {
  const db = getSQLiteCore().getDB();
  console.log('--- BM25 INDEX CONTENT ---');
  
  const terms = db.prepare(`SELECT DISTINCT term FROM innovation_bm25_index`).all();
  console.log('Terms:', terms.map((t: any) => t.term).join(', '));
  
  const docs = db.prepare(`SELECT DISTINCT document_id FROM innovation_bm25_index`).all();
  console.log('Document IDs:', docs.map((d: any) => d.document_id).join(', '));

  process.exit(0);
}

listBM25().catch(console.error);
