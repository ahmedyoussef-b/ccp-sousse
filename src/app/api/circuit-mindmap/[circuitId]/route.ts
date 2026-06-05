// src/app/api/circuit-mindmap/[circuitId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mindMapManager } from '@/ai/mindmap/mindmap-manager';
import { mindMapEmbedder } from '@/ai/mindmap/mindmap-embedder';
import { mindMapCache } from '@/ai/mindmap/mindmap-cache';
import { getSQLiteCore } from '@/ai/core/sqlite';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ circuitId: string }> }
) {
  try {
    const { circuitId } = await params;
    const cacheKey = `mindmap:${circuitId}`;

    // 🚀 Performance: Try fetching from cache first
    let mindmap = mindMapCache.get<any>(cacheKey);
    if (!mindmap) {
      mindmap = mindMapManager.getMindMapByCircuit(circuitId);
      if (mindmap) {
        mindMapCache.set(cacheKey, mindmap, 60000); // 1 minute TTL
      }
    }
    
    // Fetch db parameters for this circuit to enable binding
    const db = getSQLiteCore().getDB();
    const parameters = db.prepare(`
      SELECT id, name, unit, description 
      FROM ref_parametres 
      WHERE circuitId = ?
      ORDER BY name ASC
    `).all(circuitId) as any[];

    return NextResponse.json({ 
      success: true, 
      mindmap: mindmap || null,
      parameters
    });
  } catch (error) {
    console.error('[API-MINDMAP-GET] ❌ Erreur:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ circuitId: string }> }
) {
  try {
    const { circuitId } = await params;
    const { mindmapData, thumbnailUrl, metadata } = await request.json();

    if (!mindmapData) {
      return NextResponse.json(
        { success: false, error: 'mindmapData est requis.' },
        { status: 400 }
      );
    }

    // Save the mind map
    const updated = await mindMapManager.saveMindMap(
      circuitId,
      mindmapData,
      thumbnailUrl,
      metadata
    );

    // Vectorize nodes
    await mindMapEmbedder.vectorizeMindMap(updated);

    // 🚀 Performance: Invalidate the cache
    mindMapCache.invalidate(`mindmap:${circuitId}`);

    return NextResponse.json({
      success: true,
      message: 'Mind Map mis à jour et vectorisé.',
      mindmap: updated
    });
  } catch (error) {
    console.error('[API-MINDMAP-PUT] ❌ Erreur:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ circuitId: string }> }
) {
  try {
    const { circuitId } = await params;
    
    // Retrieve mindmap to delete vectors first
    const mindmap = mindMapManager.getMindMapByCircuit(circuitId);
    if (!mindmap) {
      return NextResponse.json(
        { success: false, error: `Aucun Mind Map à supprimer pour ${circuitId}.` },
        { status: 404 }
      );
    }

    // 1. Delete vector embeddings
    await mindMapEmbedder.deleteVectors(mindmap.id);

    // 2. Delete database records
    const deleted = mindMapManager.deleteMindMap(circuitId);

    // 🚀 Performance: Invalidate the cache
    mindMapCache.invalidate(`mindmap:${circuitId}`);

    return NextResponse.json({
      success: deleted,
      message: deleted ? 'Mind Map supprimé de partout.' : 'Échec de la suppression du Mind Map.'
    });
  } catch (error) {
    console.error('[API-MINDMAP-DELETE] ❌ Erreur:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
