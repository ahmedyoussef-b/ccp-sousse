
import { NextRequest, NextResponse } from 'next/server';
/**
 * @fileOverview Train API Route - Déclencheur du cycle ML.
 */
import { runDailyLearningCycle } from '@/ai/training/daily-learning-cycle';

export async function POST(req: NextRequest) {
  try {
    const context = await req.json();
    
    // Lancement du cycle d'entraînement Elite
    const result = await runDailyLearningCycle({
      memory: context.memory || [],
      documents: context.documents || []
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API][TRAIN] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
