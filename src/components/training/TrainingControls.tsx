/**
 * @fileOverview Contrôles manuels de l'entraînement
 */

'use client';

import { useState } from 'react';

interface TrainingControlsProps {
  onStartTraining: () => Promise<void>;
  isReady: boolean;
  dataProgress: number;
  lastTrainingDuration: string;
}

export default function TrainingControls({
  onStartTraining,
  isReady,
  dataProgress,
  lastTrainingDuration,
}: TrainingControlsProps) {
  const [isTraining, setIsTraining] = useState(false);

  const handleStartTraining = async () => {
    setIsTraining(true);
    try {
      await onStartTraining();
    } finally {
      setIsTraining(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        🎮 Contrôles d'Entraînement
      </h2>

      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-3">
          <button
            onClick={handleStartTraining}
            disabled={!isReady || isTraining}
            className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2 ${
              isReady && !isTraining
                ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isTraining ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Entraînement en cours...
              </>
            ) : (
              <>
                🚀 Lancer l'entraînement
              </>
            )}
          </button>

          <button
            className="px-6 py-3 bg-gray-200 dark:bg-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors"
            onClick={() => window.location.reload()}
          >
            🔄 Reset Dashboard
          </button>
        </div>

        <div className="text-sm text-gray-500">
          {isReady ? (
            <span className="text-green-600">✅ Prêt pour l'entraînement</span>
          ) : (
            <span>⚠️ Collectez plus de données ({Math.max(0, 50 - dataProgress)} exemples restants)</span>
          )}
        </div>
      </div>

      {/* Info supplémentaire */}
      {lastTrainingDuration && lastTrainingDuration !== '0s' && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-sm text-gray-500">
            Dernier entraînement: <span className="font-medium">{lastTrainingDuration}</span>
          </p>
        </div>
      )}
    </div>
  );
}