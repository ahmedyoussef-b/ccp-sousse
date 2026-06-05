// src/app/api/documents/collection/[name]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ChromaClient } from 'chromadb';
import { ZONES_CONFIG } from '@/ai/vector/chromadb-schema';

const client = new ChromaClient({ path: process.env.CHROMADB_URL || "http://localhost:8000" });

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const collectionName = decodeURIComponent(name);
    
    // Vérifier si la collection correspond à une zone protégée
    if (ZONES_CONFIG[collectionName as keyof typeof ZONES_CONFIG]) {
      return NextResponse.json(
        { 
          error: `Impossible de supprimer la collection '${collectionName}' car elle correspond à une zone système.`,
          protectedZone: true
        },
        { status: 403 }
      );
    }
    
    await client.deleteCollection({ name: collectionName });
    return NextResponse.json({ success: true, deleted: collectionName });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erreur de suppression' },
      { status: 500 }
    );
  }
}