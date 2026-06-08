export const runtime = 'edge';

// src/app/api/circuit-mindmap/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mindMapRagBridge } from '@/ai/mindmap/mindmap-rag-bridge';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 5;

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Le paramètre de recherche q est requis.' },
        { status: 400 }
      );
    }

    const results = await mindMapRagBridge.searchMindMapNodes(query, limit);

    return NextResponse.json({
      success: true,
      query,
      resultsCount: results.length,
      results
    });
  } catch (error) {
    console.error('[API-MINDMAP-SEARCH] ❌ Erreur de recherche:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
