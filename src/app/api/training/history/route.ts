export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { listAllModels } from '@/ai/training/model-registry';

export async function GET() {
  try {
    const models = await listAllModels();
    
    // Mapper le modèle vers le format attendu par TrainingHistory
    const sessions = models.map(m => ({
      id: m.id,
      date: new Date(m.deployedAt || Date.now()).toISOString(),
      modelName: m.name,
      datasetSize: m.metrics?.samplesProcessed || 0,
      epochs: m.metrics?.epochs || 1,
      finalLoss: m.metrics?.loss || 0,
      status: m.status === 'candidate' ? 'in_progress' : 'completed',
      metrics: {
        accuracy: Math.round((m.accuracy || 0) * 100),
        perplexity: m.metrics?.perplexity || 0
      }
    }));
    
    return NextResponse.json({ sessions });
  } catch (error: any) {
    console.error("[API][HISTORY] Erreur:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
