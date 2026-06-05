import { NextRequest, NextResponse } from 'next/server';
import { predictiveCache } from '@/ai/orchestration/innovations/predictive-cache';
import { semanticCacheService } from '@/ai/cache/semantic-cache';
import { hybridRouter } from '@/ai/resilience/hybrid-router';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, userId } = body;

    if (!question) {
      return NextResponse.json({ error: 'Question requise' }, { status: 400 });
    }

    console.log(`[CACHE-API] 🗑️ Invalidation demandée pour: "${question.substring(0, 50)}..."`);
    
    const predictiveSuccess = await predictiveCache.invalidate(question, userId || 'anonymous');
    const semanticSuccess = await semanticCacheService.invalidate(question);
    const hybridSuccess = await hybridRouter.invalidateCache(question);

    const anySuccess = predictiveSuccess || semanticSuccess || hybridSuccess;

    return NextResponse.json({
      success: true,
      invalidated: anySuccess,
      details: {
        predictive: predictiveSuccess,
        semantic: semanticSuccess,
        hybrid: hybridSuccess
      },
      message: anySuccess ? 'Cache invalidé avec succès sur tous les niveaux' : 'Entrée non trouvée dans les caches'
    });
  } catch (error) {
    console.error('[CACHE-API] Erreur lors de l\'invalidation:', error);
    return NextResponse.json({ error: 'Erreur serveur lors de l\'invalidation du cache' }, { status: 500 });
  }
}
