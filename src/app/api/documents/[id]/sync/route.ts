
// src/app/api/documents/[id]/sync/route.ts
/**
 * @fileOverview API Route /api/documents/[id]/sync - Synchronisation manuelle (Next.js 15 Ready).
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChromaDBManager } from '@/ai/vector/chromadb-manager';
import { createStandardMetadata, type CollectionName } from '@/ai/vector/chromadb-schema';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { text, metadata } = await req.json();
    
    const manager = ChromaDBManager.getInstance();
    const collectionName = (metadata?.collection || 'DOCUMENTS_GENERAUX') as CollectionName;
    
    const enrichedMetadata = createStandardMetadata({
      id: id,
      titre: metadata?.titre || id,
      type: metadata?.type || 'document_technique',
      categorie: metadata?.categorie || 'general',
      tags: metadata?.tags || [],
      source: metadata?.source || `manual_sync_${id}`,
      version: metadata?.version || '1.0',
      ...metadata
    });
    
    // On utilise upsertDocuments pour mettre à jour ou créer le vecteur principal
    await manager.upsertDocuments(collectionName, [{
      id: id,
      content: text,
      metadata: enrichedMetadata
    }]);
    
    return NextResponse.json({ success: true, message: "Synchronisation réussie" });
    
  } catch (error: any) {
    console.error('[API][SYNC] Failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
