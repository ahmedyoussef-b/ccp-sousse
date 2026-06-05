import { NextResponse } from 'next/server';
/**
 * @fileOverview API Dashboard d'Apprentissage Consolidé - Innovation Elite 32.
 * Centralise les métriques RAG, Agent et Pipeline ML local.
 */
import { getLearningStats, getRecommendedActions, getImprovementSuggestions } from '@/ai/learning/analytics';
import { getCurrentActiveModel } from '@/ai/training/model-registry';

export async function GET() {
  try {
    // Collecte des métriques depuis les différents modules d'intelligence
    const [stats, currentModel, nextActions, improvements] = await Promise.all([
      getLearningStats(),
      getCurrentActiveModel(),
      getRecommendedActions(),
      getImprovementSuggestions()
    ]);

    return NextResponse.json({
      model: {
        name: currentModel.id,
        version: "Elite-32-v2",
        accuracy: currentModel.accuracy,
        trainedOn: new Date(currentModel.deployedAt || Date.now()).toLocaleDateString('fr-FR'),
        dataSize: "14.5 MB",
        status: currentModel.status
      },
      learning: {
        totalInteractions: stats.totalInteractions,
        correctionsReceived: stats.corrections,
        patternsDetected: stats.patterns,
        avgSatisfaction: stats.avgSatisfaction
      },
      rag: {
        avgRetrievalTime: stats.rag.avgTime,
        contextSize: stats.rag.avgContextSize,
        sourceDistribution: stats.rag.sources
      },
      agent: {
        requestsProcessed: stats.agent.total,
        successRate: stats.agent.successRate,
        avgSteps: stats.agent.avgSteps,
        toolsUsed: stats.agent.topTools
      },
      training: {
        lastTraining: stats.training.last,
        nextScheduled: stats.training.next,
        dataAvailable: stats.training.dataAvailable,
        threshold: 100,
        isReady: stats.training.dataAvailable >= 100
      },
      recommendations: {
        nextActions,
        improvements
      }
    });
  } catch (error: any) {
    console.error("[API][LEARNING-DASHBOARD] Critical failure:", error);
    return NextResponse.json({ 
      error: "Impossible de charger les données analytiques consolidées.",
      details: error.message 
    }, { status: 500 });
  }
}
