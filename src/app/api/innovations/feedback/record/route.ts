import { NextRequest, NextResponse } from 'next/server';
import { confidenceFeedback } from '@/ai/innovations/08-confidence-feedback';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { predictionId, imageId, similarityScore, userFeedback, correction } = body;
    
    if (!predictionId || !userFeedback) {
      return NextResponse.json({ error: 'predictionId et userFeedback requis' }, { status: 400 });
    }
    
    const db = getSQLiteCore();
    
    const feedback = await confidenceFeedback.recordVisionFeedback(
      predictionId,
      imageId || 'unknown',
      similarityScore || 0.5,
      userFeedback,
      { correction }
    );
    
    // Sauvegarder dans l'historique
    await db.recordMetric('confidence', 'feedback_count', 1);
    await db.recordMetric('confidence', `feedback_${userFeedback}`, 1);
    
    // Mettre à jour les stats du modèle
    const stats = confidenceFeedback.getStats();
    
    return NextResponse.json({
      success: true,
      feedbackId: feedback.id,
      stats: {
        totalFeedbacks: stats.totalFeedbacks,
        confirmationRate: stats.confirmationRate,
        rejectionRate: stats.rejectionRate
      }
    });
  } catch (error: any) {
    console.error('Erreur feedback:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}