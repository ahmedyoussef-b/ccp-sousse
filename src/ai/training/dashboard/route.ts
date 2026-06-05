/**
 * @fileOverview Dashboard API - Statistiques et monitoring du training
 * @version 2.0.0
 * @lastUpdated 2026-04-02
 */

import { modelRegistry } from '@/ai/training/model-registry';
import { trainingDataCollector } from '@/ai/training/data-collector';
import { modelTrainer } from '@/ai/training/model-trainer';
import { feedbackLoop } from '@/ai/training/feedback-loop';
import { inferenceEngine } from '@/ai/training/inference-engine';

// ============================================================================
// API ROUTE
// ============================================================================

export async function GET() {
    try {
        // Récupération des données
        const currentModel = await modelRegistry.getCurrentActiveModel();
        const allModels = await modelRegistry.listAllModels();
        const registryStats = await modelRegistry.getStats();
        
        const collectorStats = trainingDataCollector.getStats();
        const trainerStatus = modelTrainer.getStatus();
        const feedbackStats = feedbackLoop.getStats();
        const inferenceStats = inferenceEngine.getStats();
        
        // Métriques en temps réel
        const now = Date.now();
        const lastWeek = now - 7 * 24 * 60 * 60 * 1000;
        
        const recentModels = allModels.filter(m => (m.deployedAt || 0) > lastWeek);
        const avgRecentAccuracy = recentModels.length > 0
            ? recentModels.reduce((sum, m) => sum + m.accuracy, 0) / recentModels.length
            : currentModel.accuracy;
        
        // Statistiques d'entraînement
        const trainingStats = {
            totalInteractions: feedbackStats.totalRecorded,
            correctionsReceived: feedbackStats.totalAlerts,
            avgSatisfaction: feedbackStats.avgRatingTrend.length > 0
                ? feedbackStats.avgRatingTrend.reduce((a, b) => a + b, 0) / feedbackStats.avgRatingTrend.length
                : 4.2,
            dataSize: `${collectorStats.collections.length * 5} MB`,
            todayData: collectorStats.collections.reduce((sum, c) => sum + (c.enabled ? 5 : 0), 0),
            nextTraining: "02:00 (planifié)",
            improvements: [0.02, 0.05, 0.03]
        };
        
        // Réponse
        return Response.json({
            currentModel: {
                id: currentModel.id,
                name: currentModel.name,
                version: currentModel.version,
                accuracy: currentModel.accuracy,
                deployedAt: currentModel.deployedAt,
                metrics: currentModel.metrics
            },
            trainingStats: {
                totalInteractions: trainingStats.totalInteractions,
                correctionsReceived: trainingStats.correctionsReceived,
                avgSatisfaction: trainingStats.avgSatisfaction,
                dataSize: trainingStats.dataSize
            },
            recentImprovements: trainingStats.improvements,
            nextTraining: {
                scheduledFor: trainingStats.nextTraining,
                dataAvailable: trainingStats.todayData,
                threshold: 50,
                ready: trainingStats.todayData >= 50
            },
            registry: {
                totalModels: registryStats.totalModels,
                productionCount: registryStats.productionCount,
                candidateCount: registryStats.candidateCount,
                archivedCount: registryStats.archivedCount,
                averageAccuracy: registryStats.averageAccuracy,
                bestAccuracy: registryStats.bestAccuracy,
                latestDeployment: registryStats.latestDeployment
            },
            models: allModels.map(m => ({
                id: m.id,
                name: m.name,
                version: m.version,
                accuracy: m.accuracy,
                status: m.status,
                deployedAt: m.deployedAt
            })),
            performance: {
                recentAccuracy: avgRecentAccuracy,
                inferenceLatency: inferenceStats.avgLatency,
                totalPredictions: inferenceStats.totalPredictions,
                feedbackAlerts: feedbackStats.totalAlerts,
                trainingMode: trainerStatus.mode
            },
            timestamp: now
        });
        
    } catch (error: any) {
        console.error('[DASHBOARD] Erreur:', error);
        
        return Response.json({
            error: error.message,
            timestamp: Date.now()
        }, { status: 500 });
    }
}