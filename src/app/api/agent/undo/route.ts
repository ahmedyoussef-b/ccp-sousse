export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { undoLastMission } from '@/ai/agent/agent-core';

/**
 * Route API pour annuler la dernière mission de l'agent.
 * Exploite la capacité de ReversibleExecutor intégrée dans agent-core.
 */
export async function POST(req: NextRequest) {
  try {
    const { missionId } = await req.json();

    if (!missionId) {
      return NextResponse.json(
        { error: "L'ID de la mission est requis pour l'annulation." }, 
        { status: 400 }
      );
    }

    console.log(`[API][AGENT] Demande d'annulation pour la mission: ${missionId}`);
    const success = await undoLastMission(missionId);

    if (success) {
      return NextResponse.json({
        success: true,
        message: `La mission ${missionId} a été annulée avec succès.`,
        timestamp: Date.now()
      });
    } else {
      return NextResponse.json({
        success: false,
        error: "Impossible d'annuler cette mission. Elle n'est peut-être plus en cache ou n'était pas réversible.",
      }, { status: 409 });
    }

  } catch (error: any) {
    console.error("[API][AGENT] Erreur lors de l'annulation:", error);
    return NextResponse.json({ 
      success: false,
      error: "Erreur technique lors de l'annulation.",
      details: error.message 
    }, { status: 500 });
  }
}
