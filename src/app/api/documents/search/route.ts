export const runtime = 'edge';

// src/app/api/documents/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ChromaClient } from 'chromadb';
import { ChromaCollections } from '@/ai/vector/chromadb-schema';
import { getEmbeddingFunction } from '@/ai/vector/embeddings';

const client = new ChromaClient({ path: process.env.CHROMADB_URL || "http://localhost:8000" });

export async function POST(request: NextRequest) {
  try {
    const { query, collection: collectionName } = await request.json();
    
    if (!query) {
      return NextResponse.json({ error: 'Requête manquante' }, { status: 400 });
    }
    
    let results: any[] = [];
    
    if (collectionName) {
      // Recherche dans une collection spécifique
      try {
        const actualName = (ChromaCollections as any)[collectionName]?.name || collectionName;
        const collection = await client.getCollection({ 
          name: actualName,
          embeddingFunction: getEmbeddingFunction()
        });
        const searchResults = await collection.query({
          queryTexts: [query],
          nResults: 10
        });
        
        if (searchResults.documents && searchResults.documents[0]) {
          results = searchResults.documents[0].map((doc, i) => ({
            text: doc,
            metadata: searchResults.metadatas?.[0]?.[i] || {},
            score: searchResults.distances?.[0]?.[i] || 1
          }));
        }
      } catch (error) {
        // Collection non trouvée
      }
    } else {
      // Recherche dans toutes les collections
      const collections = await client.listCollections();
      
      for (const coll of collections) {
        try {
          const collName = typeof coll === 'string' ? coll : (coll as any).name;
          const collection = await client.getCollection({ 
            name: collName,
            embeddingFunction: getEmbeddingFunction()
          });
          const searchResults = await collection.query({
            queryTexts: [query],
            nResults: 3
          });
          
          if (searchResults.documents && searchResults.documents[0]) {
            results.push(...searchResults.documents[0].map((doc, i) => ({
              text: doc,
              metadata: { ...searchResults.metadatas?.[0]?.[i], collection: collName },
              score: searchResults.distances?.[0]?.[i] || 1
            })));
          }
        } catch (error) {
          continue;
        }
      }
      
      // Trier par score et limiter à 20 résultats
      results.sort((a, b) => (a.score || 1) - (b.score || 1));
      results = results.slice(0, 20);
    }
    
    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erreur de recherche' },
      { status: 500 }
    );
  }
}