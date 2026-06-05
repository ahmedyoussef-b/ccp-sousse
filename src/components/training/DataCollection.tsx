/**
 * @fileOverview État de la collecte de données
 */

'use client';

interface DataCollectionProps {
  totalInteractions: number;
  correctionsReceived: number;
  avgSatisfaction: number;
  dataSize: string;
  todayData: number;
  threshold: number;
}

export default function DataCollection({
  totalInteractions,
  correctionsReceived,
  avgSatisfaction,
  dataSize,
  todayData,
  threshold,
}: DataCollectionProps) {
  const progress = Math.min(100, (totalInteractions / threshold) * 100);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        📥 Collecte de Données
      </h2>

      {/* Progression vers le seuil */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span>Progression vers l'entraînement</span>
          <span className="font-medium">{totalInteractions} / {threshold} exemples</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${
              progress >= 100 ? 'bg-green-600' : 'bg-blue-600'
            }`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        {progress < 100 && (
          <p className="text-sm text-gray-500 mt-2">
            Encore {threshold - totalInteractions} exemples nécessaires pour déclencher l'entraînement
          </p>
        )}
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-sm text-gray-500">Interactions totales</p>
          <p className="text-2xl font-semibold">{totalInteractions.toLocaleString()}</p>
        </div>
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-sm text-gray-500">Corrections reçues</p>
          <p className="text-2xl font-semibold text-orange-600">{correctionsReceived}</p>
        </div>
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-sm text-gray-500">Satisfaction moyenne</p>
          <p className="text-2xl font-semibold">{avgSatisfaction.toFixed(1)}/5</p>
        </div>
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-sm text-gray-500">Volume de données</p>
          <p className="text-2xl font-semibold">{dataSize}</p>
        </div>
      </div>

      {/* Aujourd'hui */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-500">Données collectées aujourd'hui</p>
            <p className="text-2xl font-semibold">{todayData}</p>
          </div>
          <div className="text-3xl">📈</div>
        </div>
      </div>
    </div>
  );
}