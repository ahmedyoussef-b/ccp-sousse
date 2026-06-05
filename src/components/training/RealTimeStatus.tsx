/**
 * @fileOverview Statut en temps réel du pipeline
 */

'use client';

interface RealTimeStatusProps {
  pipelineStatus: {
    isReadyForTraining: boolean;
    dataProgress: number;
    nextScheduledCycle: string;
    lastTrainingDuration: string;
    currentStep?: string;
  };
  performance: {
    trainingMode: string;
  };
  trainingMode: string;
}

export default function RealTimeStatus({ pipelineStatus, trainingMode }: RealTimeStatusProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        🔄 Statut en Temps Réel
      </h2>

      {/* Mode d'entraînement */}
      <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Mode d'entraînement</span>
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              trainingMode === 'real'
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}
          >
            {trainingMode === 'real' ? '⚡ RÉEL' : '🔄 SIMULATION'}
          </span>
        </div>
      </div>

      {/* Pipeline status */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">État du pipeline</span>
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              pipelineStatus.isReadyForTraining
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}
          >
            {pipelineStatus.isReadyForTraining ? 'PRÊT' : 'EN ATTENTE'}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Prochain cycle</span>
          <span className="font-mono text-sm">{pipelineStatus.nextScheduledCycle}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Dernier entraînement</span>
          <span className="font-mono text-sm">{pipelineStatus.lastTrainingDuration || 'N/A'}</span>
        </div>

        {pipelineStatus.currentStep && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Étape en cours</span>
            <span className="text-sm">{pipelineStatus.currentStep}</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {pipelineStatus.dataProgress !== undefined && pipelineStatus.dataProgress > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Progression</span>
            <span>{pipelineStatus.dataProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${pipelineStatus.dataProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}