const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'src', 'ai', 'rag', 'intelligent-retriever_head.ts');
const destPath = path.join(__dirname, '..', 'src', 'ai', 'rag', 'intelligent-retriever.ts');

console.log('Reading from:', srcPath);
let content = fs.readFileSync(srcPath, 'utf8');

// Normalize newlines to \n to avoid CRLF mismatch
content = content.replace(/\r\n/g, '\n');

// Replacement 1: Import mindMapRagBridge
const search1 = `import {
  type ZoneType,
  ZONES_CONFIG,
  getRelevantZones,
  getExpectedResponseType
} from '../vector/chromadb-schema';`;
const replace1 = `import {
  type ZoneType,
  ZONES_CONFIG,
  getRelevantZones,
  getExpectedResponseType
} from '../vector/chromadb-schema';
import { mindMapRagBridge } from '../mindmap/mindmap-rag-bridge';`;

if (!content.includes(search1)) {
  console.error('Error: search1 not found!');
  process.exit(1);
}
content = content.replace(search1, replace1);
console.log('Replacement 1 successful!');

// Replacement 2: FusedResult type
const search2 = `export interface FusedResult {
  content: string;
  source: 'document' | 'lesson' | 'interaction' | 'procedure' | 'alarme' | 'hmi' | 'episodic' | 'hierarchy' | 'pattern';
  score: number;
  weight: number;
  finalScore: number;
  metadata?: any;
}`;
const replace2 = `export interface FusedResult {
  content: string;
  source: 'document' | 'lesson' | 'interaction' | 'procedure' | 'alarme' | 'hmi' | 'episodic' | 'hierarchy' | 'pattern' | 'mindmap';
  score: number;
  weight: number;
  finalScore: number;
  metadata?: any;
}`;

if (!content.includes(search2)) {
  console.error('Error: search2 not found!');
  process.exit(1);
}
content = content.replace(search2, replace2);
console.log('Replacement 2 successful!');

// Replacement 3: searchIntelligent integration
const search3 = `  const dynamicResults = await searchDynamicZones(query, safeOptions);
  results.push(...dynamicResults);

  const mergedResults = mergeResults(results);`;
const replace3 = `  const dynamicResults = await searchDynamicZones(query, safeOptions);
  results.push(...dynamicResults);

  // 🧠 RECHERCHE DANS LES MINDMAPS (SCHÉMAS MENTAUX)
  let mindmapSearchResults = [];
  const queryLower = query.toLowerCase();
  const hasMindMapKeywords = [
    'mindmap', 'mind map', 'schéma mental', 'schema mental', 'circuit', 
    'nœud', 'noeud', 'dépendance', 'dependance', 'paramètre', 'parametre', 
    'formule', 'équation', 'equation', 'kks', 'interdépendance'
  ].some(kw => queryLower.includes(kw));

  if (hasMindMapKeywords || !isShortQuery) {
    try {
      console.log(\`[RAG] 🧠 Recherche de schémas mentaux (Mind Maps) pour: "\${query}"\`);
      const mmResults = await mindMapRagBridge.searchMindMapNodes(query, 3);
      if (mmResults && mmResults.length > 0) {
        console.log(\`[RAG] ✅ \${mmResults.length} schéma(s) mental(aux) trouvé(s)\`);
        mindmapSearchResults = mmResults.map(mr => ({
          content: mr.markdown,
          metadata: {
            circuitId: mr.circuitId,
            nodesCount: mr.nodesCount,
            zone: 'MINDMAP',
            title: \`🧠 Schéma mental - Circuit \${mr.circuitId}\`,
            source: \`mindmap:\${mr.circuitId}\`,
            isMindMap: true
          },
          score: 0.95,
          source: 'mindmap',
          confidence: 0.95,
          citations: [\`MindMap:\${mr.circuitId}\`]
        }));
      }
    } catch (err) {
      console.error('[RAG] Erreur lors de la recherche MindMap:', err);
    }
  }

  if (mindmapSearchResults.length > 0) {
    results.push(...mindmapSearchResults);
  }

  const mergedResults = mergeResults(results);`;

if (!content.includes(search3)) {
  console.error('Error: search3 not found!');
  process.exit(1);
}
content = content.replace(search3, replace3);
console.log('Replacement 3 successful!');

// Replacement 4: retrieveContext mapping
const search4 = `    const fused: FusedResult[] = searchResults.map(r => ({
      content: r.content,
      source: (r.source === 'document' ? 'document' :
        r.source === 'episodic' ? 'interaction' :
          r.source === 'procedure' ? 'procedure' :
            r.source === 'alarme' ? 'alarme' :
              r.source === 'hmi' ? 'hmi' :
                r.source === 'VISION' ? 'document' :
                  'lesson') as FusedResult['source'],`;
const replace4 = `    const fused: FusedResult[] = searchResults.map(r => ({
      content: r.content,
      source: (r.source === 'document' ? 'document' :
        r.source === 'episodic' ? 'interaction' :
          r.source === 'procedure' ? 'procedure' :
            r.source === 'alarme' ? 'alarme' :
              r.source === 'hmi' ? 'hmi' :
                r.source === 'VISION' ? 'document' :
                r.source === 'mindmap' || r.source === 'MINDMAP' || r.source.startsWith('mindmap:') ? 'mindmap' :
                  'lesson') as FusedResult['source'],`;

if (!content.includes(search4)) {
  console.error('Error: search4 not found!');
  process.exit(1);
}
content = content.replace(search4, replace4);
console.log('Replacement 4 successful!');

// Convert back to CRLF for consistency on Windows
content = content.replace(/\n/g, '\r\n');

console.log('Writing to:', destPath);
fs.writeFileSync(destPath, content, 'utf8');
console.log('Successfully completed!');
