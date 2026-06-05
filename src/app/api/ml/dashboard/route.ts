/**
 * @fileOverview API Dashboard ML - Innovation Elite 32.
 * Fournit une vue d'ensemble du pipeline ML : Entraînement, Inférence et Recommandations.
 */
import { NextResponse } from 'next/server';
import { getCurrentActiveModel } from '@/ai/training/model-registry';

export async function GET() {
  try {
    const currentModel = await getCurrentActiveModel();
    
    // Métriques consolidées pour le pipeline complet
    const stats = {
      model: {
        version: currentModel.id,
        accuracy: currentModel.accuracy,
        trainedOn: new Date(currentModel.deployedAt || Date.now()).toLocaleDateString('fr-FR'),
        dataSize: "14.5 MB"
      },
      training: {
        lastTraining: "Hier, 02:15",
        nextScheduled: "Ce soir, 02:00",
        dataAvailable: 18, 
        threshold: 50
      },
      inference: {
        totalPredictions: 1420, 
        avgLatency: "840ms",
        cacheHitRate: "24%",
        confidenceAvg: 0.88
      },
      recommendations: {
        total: 450,
        clickRate: "12.5%",
        satisfactionAvg: 4.2,
        topCategories: ["Maintenance", "Sécurité", "Documentation"]
      }
    };
    
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API][ML-DASHBOARD] Erreur récupération métriques:", error);
    return NextResponse.json({ error: "Impossible de charger le dashboard ML." }, { status: 500 });
  }
}
