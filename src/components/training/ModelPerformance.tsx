/**
 * @fileOverview Performance détaillée du modèle
 */

'use client';

interface ModelPerformanceProps {
  data: {
    activeModel: {
      name: string;
      version: string;
      accuracy: number;
      metrics: {
        loss?: number;
        trainingTime?: string;
        samplesProcessed?: number;
        hallucinationRate?: number;
        instructionFollowing?: number;
      };
    };
    performance: {
      inferenceLatency: number;
      totalPredictions: number;
      feedbackAlerts: number;
    };
  };
}

export default function ModelPerformance({ data }: ModelPerformanceProps) {
  const metrics = [
    {
      label: 'Précision (Accuracy)',
      value: `${(data.activeModel.accuracy * 100).toFixed(1)}%`,
      color: 'text-green-600',
      progress: data.activeModel.accuracy,
    },
    {
      label: 'Taux d\'hallucination',
      value: `${((data.activeModel.metrics.hallucinationRate || 0.1) * 100).toFixed(1)}%`,
      color: 'text-red-600',
      progress: 1 - (data.activeModel.metrics.hallucinationRate || 0.1),
    },
    {
      label: 'Suivi d\'instruction',
      value: `${((data.activeModel.metrics.instructionFollowing || 0.85) * 100).toFixed(1)}%`,
      color: 'text-blue-600',
      progress: data.activeModel.metrics.instructionFollowing || 0.85,
    },
    {
      label: 'Latence inférence',
      value: `${data.performance.inferenceLatency.toFixed(0)}ms`,
      color: 'text-purple-600',
      progress: Math.max(0, 1 - data.performance.inferenceLatency / 1000),
    },
  ];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        🎯 Performance du Modèle
      </h2>

      {/* Info modèle actuel */}
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-500">Modèle actif</p>
            <p className="font-semibold text-lg">{data.activeModel.name}</p>
            <p className="text-sm text-gray-500">Version {data.activeModel.version}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Déployé le</p>
            <p className="font-medium">{new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Métriques */}
      <div className="space-y-4">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <div className="flex justify-between text-sm mb-1">
              <span>{metric.label}</span>
              <span className={metric.color}>{metric.value}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${metric.progress * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Stats supplémentaires */}
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Prédictions totales</p>
            <p className="text-xl font-semibold">{data.performance.totalPredictions.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Alertes feedback</p>
            <p className="text-xl font-semibold text-orange-600">{data.performance.feedbackAlerts}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Échantillons entraînement</p>
            <p className="text-xl font-semibold">{data.activeModel.metrics.samplesProcessed?.toLocaleString() || 0}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Temps entraînement</p>
            <p className="text-xl font-semibold">{data.activeModel.metrics.trainingTime || 'N/A'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}