/**
 * @fileOverview Composant principal du dashboard training
 * @version 1.3.0
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import MetricsCards from './MetricsCards';
import ModelPerformance from './ModelPerformance';
import DataCollection from './DataCollection';
import RealTimeStatus from './RealTimeStatus';
import TrainingControls from './TrainingControls';
import { TrainingHistory } from './TrainingHistory';
import RAGTrainingPanel from './RAGTrainingPanel';

// Interface complète avec toutes les propriétés requises
interface DashboardData {
  activeModel: {
    id: string;
    name: string;
    version: string;
    accuracy: number;
    deployedAt: number;
    metrics: {  // RENDU REQUIS (non optionnel)
      loss?: number;
      trainingTime?: string;
      samplesProcessed?: number;
      hallucinationRate?: number;
      instructionFollowing?: number;
    };
  };
  trainingStats: {
    totalInteractions: number;
    correctionsReceived: number;
    avgSatisfaction: number;
    dataSize: string;
    todayData: number;
  };
  registry: {
    totalModels: number;
    productionCount: number;
    candidateCount: number;
    archivedCount: number;
    averageAccuracy: number;
    bestAccuracy: number;
  };
  models: Array<{
    id: string;
    name: string;
    version: string;
    accuracy: number;
    status: string;
    deployedAt: number;
  }>;
  performance: {
    recentAccuracy: number;
    inferenceLatency: number;
    totalPredictions: number;
    feedbackAlerts: number;
    trainingMode: string;
  };
  pipelineStatus: {
    isReadyForTraining: boolean;
    dataProgress: number;
    nextScheduledCycle: string;
    lastTrainingDuration: string;
    currentStep?: string;
  };
  improvementTrend: number[];
}

// Valeurs par défaut avec metrics REQUIS
const DEFAULT_DATA: DashboardData = {
  activeModel: {
    id: 'loading',
    name: 'Chargement...',
    version: '0.0.0',
    accuracy: 0,
    deployedAt: Date.now(),
    metrics: {  // metrics est toujours défini
      loss: 0,
      trainingTime: '0s',
      samplesProcessed: 0,
      hallucinationRate: 0,
      instructionFollowing: 0
    }
  },
  trainingStats: {
    totalInteractions: 0,
    correctionsReceived: 0,
    avgSatisfaction: 0,
    dataSize: '0 KB',
    todayData: 0
  },
  registry: {
    totalModels: 0,
    productionCount: 0,
    candidateCount: 0,
    archivedCount: 0,
    averageAccuracy: 0,
    bestAccuracy: 0
  },
  models: [],
  performance: {
    recentAccuracy: 0,
    inferenceLatency: 0,
    totalPredictions: 0,
    feedbackAlerts: 0,
    trainingMode: 'simulated'
  },
  pipelineStatus: {
    isReadyForTraining: false,
    dataProgress: 0,
    nextScheduledCycle: '02:00 AM',
    lastTrainingDuration: '0s',
    currentStep: 'En attente'
  },
  improvementTrend: []
};

export default function TrainingDashboard() {
  const [data, setData] = useState<DashboardData>(DEFAULT_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/training/dashboard');
      if (!response.ok) throw new Error('Erreur de chargement');
      const result = await response.json();
      
      // L'API renvoie activeBrain, stats, history
      setData({
        activeModel: {
          ...DEFAULT_DATA.activeModel,
          ...(result.activeBrain || result.activeModel || {}),
          metrics: {
            ...DEFAULT_DATA.activeModel.metrics,
            ...((result.activeBrain?.metrics || result.activeModel?.metrics) || {})
          }
        },
        trainingStats: {
          ...DEFAULT_DATA.trainingStats,
          totalInteractions: result.stats?.totalInteractions || result.trainingStats?.totalInteractions || 0,
          correctionsReceived: result.stats?.corrections || result.trainingStats?.correctionsReceived || 0,
          avgSatisfaction: result.stats?.efficiency || result.trainingStats?.avgSatisfaction || 0,
          dataSize: result.stats?.databaseSize || result.trainingStats?.dataSize || '0 KB',
          todayData: result.stats?.todayDataCollected || result.trainingStats?.todayData || 0
        },
        registry: result.registry || {
          totalModels: result.history?.length || 0,
          productionCount: result.history?.filter((m: any) => m.status === 'production').length || 0,
          candidateCount: result.history?.filter((m: any) => m.status === 'candidate').length || 0,
          archivedCount: result.history?.filter((m: any) => m.status === 'archived').length || 0,
          averageAccuracy: result.history?.reduce((acc: number, m: any) => acc + m.accuracy, 0) / (result.history?.length || 1) || 0,
          bestAccuracy: Math.max(...(result.history?.map((m: any) => m.accuracy) || [0]))
        },
        models: result.history || result.models || DEFAULT_DATA.models,
        performance: result.performance || DEFAULT_DATA.performance,
        pipelineStatus: result.pipelineStatus || DEFAULT_DATA.pipelineStatus,
        improvementTrend: result.improvementTrend || DEFAULT_DATA.improvementTrend,
      });
      
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const handleRefresh = () => {
    setLoading(true);
    fetchData();
  };

  const handleStartTraining = async () => {
    try {
      const response = await fetch('/api/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (result.status === 'skipped') {
        alert(`Entraînement ignoré: ${result.reason}`);
      } else if (result.status === 'completed') {
        alert(`✅ Entraînement terminé! Gain: ${(result.gain * 100).toFixed(1)}%`);
        fetchData();
      }
    } catch (err) {
      alert(`Erreur: ${err instanceof Error ? err.message : 'Inconnue'}`);
    }
  };

  if (loading && data.activeModel.name === 'Chargement...') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement du dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-red-600">
          <p>Erreur: {error}</p>
          <button
            onClick={handleRefresh}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const { activeModel, trainingStats, registry, performance, pipelineStatus } = data;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              🧠 Training Dashboard
            </h1>
            <p className="text-gray-500 mt-1">
              Suivi détaillé de l'entraînement des modèles IA
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-500">
              Dernière mise à jour: {lastUpdate.toLocaleTimeString()}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh (30s)
            </label>
            <button
              onClick={handleRefresh}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2"
            >
              🔄 Rafraîchir
            </button>
            <Link
              href="/training?tab=manual"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2 font-medium"
            >
              🎯 Entraînement Manuel
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <MetricsCards 
        data={{
          activeModel: {
            name: activeModel.name,
            version: activeModel.version,
            accuracy: activeModel.accuracy
          },
          registry: {
            totalModels: registry.totalModels,
            averageAccuracy: registry.averageAccuracy,
            bestAccuracy: registry.bestAccuracy,
            productionCount: registry.productionCount,
            candidateCount: registry.candidateCount
          },
          trainingStats: {
            totalInteractions: trainingStats.totalInteractions,
            correctionsReceived: trainingStats.correctionsReceived,
            avgSatisfaction: trainingStats.avgSatisfaction
          },
          performance: {
            inferenceLatency: performance.inferenceLatency,
            totalPredictions: performance.totalPredictions
          }
        }}
      />

      {/* RAG Training Panel - Entraînement Manuel via Q/R */}
      <div className="mb-6">
        <RAGTrainingPanel />
      </div>

      {/* Row 2: Model Performance + Training History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ModelPerformance 
          data={{
            activeModel: {
              name: activeModel.name,
              version: activeModel.version,
              accuracy: activeModel.accuracy,
              metrics: activeModel.metrics  // metrics est toujours défini
            },
            performance: {
              inferenceLatency: performance.inferenceLatency,
              totalPredictions: performance.totalPredictions,
              feedbackAlerts: performance.feedbackAlerts
            }
          }}
        />
        <TrainingHistory 
          
        />
      </div>

      {/* Row 3: Data Collection + Real Time Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <DataCollection
          totalInteractions={trainingStats.totalInteractions}
          correctionsReceived={trainingStats.correctionsReceived}
          avgSatisfaction={trainingStats.avgSatisfaction}
          dataSize={trainingStats.dataSize}
          todayData={trainingStats.todayData}
          threshold={50}
        />
        <RealTimeStatus
          pipelineStatus={pipelineStatus}
          performance={{ trainingMode: performance.trainingMode }} trainingMode={''}        />
      </div>

      {/* Training Controls */}
      <TrainingControls
        onStartTraining={handleStartTraining}
        isReady={pipelineStatus.isReadyForTraining}
        dataProgress={pipelineStatus.dataProgress}
        lastTrainingDuration={pipelineStatus.lastTrainingDuration}
      />
    </div>
  );
}