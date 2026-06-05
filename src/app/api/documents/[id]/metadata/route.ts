/**
 * @fileOverview API Route /api/documents/[id]/metadata - Mise à jour des métadonnées dans ChromaDB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChromaDBManager } from '@/ai/vector/chromadb-manager';
import { findDocumentById } from '@/lib/document-manager/document-utils';
import { DOCUMENTS_ROOT, COLLECTION_MAPPING } from '@/lib/document-manager/config';
import path from 'path';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { metadata } = await req.json();
    const documentPath = await findDocumentById(id);
    
    if (!documentPath) {
      return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
    }

    const relative = path.relative(DOCUMENTS_ROOT, documentPath);
    const folder = relative.split(path.sep)[0];
    const collectionName = (COLLECTION_MAPPING[folder] || 'DOCUMENTS_GENERAUX') as any;

    const manager = ChromaDBManager.getInstance();
    const fileName = path.basename(documentPath);
    
    // Récupérer le contenu existant
    const current = await manager.search(collectionName, fileName, { 
      nResults: 1, 
      where: { id: id } 
    });
    
    // 🔥 CORRECTION : S'assurer que le contenu est une chaîne valide
    let content = '';
    if (current.documents && current.documents[0]) {
      const rawContent = current.documents[0];
      if (typeof rawContent === 'string') {
        content = rawContent;
      } else if (Buffer.isBuffer(rawContent)) {
        content = rawContent.toString('utf-8');
      } else if (rawContent && typeof rawContent === 'object') {
        // Si c'est un objet, essayer d'extraire du texte
        content = rawContent.text || rawContent.content || JSON.stringify(rawContent);
      } else {
        content = String(rawContent || '');
      }
    }
    
    // Si le contenu est vide, utiliser un placeholder
    if (!content || content.trim().length === 0) {
      console.warn(`[METADATA] Contenu vide pour le document ${id}, utilisation d'un placeholder`);
      content = `[Document: ${fileName}]`;
    }

    // Nettoyer les métadonnées pour ChromaDB
    const sanitizedMetadata: Record<string, string | number | boolean> = {};
    Object.entries(metadata).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        sanitizedMetadata[key] = value.join(', ');
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        sanitizedMetadata[key] = value;
      } else if (value !== null && value !== undefined) {
        sanitizedMetadata[key] = String(value);
      }
    });

    // 🔥 S'assurer que le contenu est bien une chaîne
    const finalContent = typeof content === 'string' ? content : String(content);

    await manager.upsertDocuments(collectionName, [{
      id: id,
      content: finalContent,
      metadata: { 
        ...sanitizedMetadata, 
        date_modification: new Date().toISOString(),
        id: id // S'assurer que l'ID est préservé dans les métadonnées
      }
    }]);

    return NextResponse.json({ success: true, message: "Métadonnées synchronisées." });
  } catch (error: any) {
    console.error('[API][METADATA] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}