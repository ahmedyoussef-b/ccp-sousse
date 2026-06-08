export const runtime = 'edge';

// src/app/api/documents/collections/route.ts
import { NextResponse } from 'next/server';
import { ChromaClient } from 'chromadb';
import { ZONES_CONFIG } from '@/ai/vector/chromadb-schema';
import { getEmbeddingFunction } from '@/ai/vector/embeddings';

const client = new ChromaClient({ path: process.env.CHROMADB_URL || "http://localhost:8000" });

export async function GET() {
  try {
    const collections = await client.listCollections();
    const zones = Object.entries(ZONES_CONFIG);
    const collectionsInfo = [];
    
    for (const coll of collections) {
      const collectionName = typeof coll === 'string' ? coll : (coll as any).name;
      const collection = await client.getCollection({ 
        name: collectionName,
        embeddingFunction: getEmbeddingFunction()
      });
      const count = await collection.count();
      
      // Trouver si cette collection correspond à une zone (via son nom réel)
      const zoneEntry = zones.find(([_, config]) => config.collectionName === collectionName);
      const isZone = !!zoneEntry;
      
      collectionsInfo.push({
        name: collectionName,
        count,
        description: collection.metadata?.description || null,
        type: isZone ? 'zone' : 'legacy',
        displayName: isZone ? zoneEntry?.[1].displayName : collectionName
      });
    }
    
    // Trier : d'abord les zones, puis les autres par ordre alphabétique
    collectionsInfo.sort((a, b) => {
      if (a.type === 'zone' && b.type !== 'zone') return -1;
      if (a.type !== 'zone' && b.type === 'zone') return 1;
      return a.name.localeCompare(b.name);
    });
    
    return NextResponse.json({ collections: collectionsInfo });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erreur de récupération' },
      { status: 500 }
    );
  }
}