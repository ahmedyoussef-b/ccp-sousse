/**
 * @fileOverview Suivi détaillé de la progression
 */

'use client';

interface TrainingProgressProps {
  stats: {
    totalExamples: number;
    correctionsCount: number;
    highQualityCount: number;
    threshold: number;
  };
  messages: any[];
}

export default function TrainingProgress({ stats, messages }: TrainingProgressProps) {
  const highQualityMessages = messages.filter(m => m.role === 'assistant' && m.rating && m.rating >= 4);

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">📈 Progression Détaillée</h2>

      {/* Statistiques globales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
          <p className="text-sm text-gray-500">Total interactions</p>
          <p className="text-2xl font-bold text-green-600">{stats.totalExamples}</p>
          <p className="text-xs text-gray-500">Objectif: {stats.threshold}</p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
          <p className="text-sm text-gray-500">Corrections (poids ×3)</p>
          <p className="text-2xl font-bold text-orange-600">{stats.correctionsCount}</p>
          <p className="text-xs text-gray-500">Impact maximal</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
          <p className="text-sm text-gray-500">Notations 5⭐ (poids ×1.66)</p>
          <p className="text-2xl font-bold text-purple-600">{stats.highQualityCount}</p>
          <p className="text-xs text-gray-500">Renforce les bonnes réponses</p>
        </div>
      </div>

      {/* Poids cumulé */}
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <p className="font-medium mb-1">🎯 Score d'entraînement cumulé</p>
        <div className="text-3xl font-bold text-blue-600">
          {Math.round(stats.totalExamples + stats.correctionsCount * 2 + stats.highQualityCount * 0.66)}
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Poids total = Interactions + (Corrections × 2) + (⭐⭐⭐⭐⭐ × 0.66)
        </p>
      </div>

      {/* Dernières interactions */}
      <div>
        <h3 className="font-medium mb-3">📝 Dernières interactions notées</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {highQualityMessages.slice(-5).reverse().map((msg, idx) => (
            <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-sm font-medium">Question précédente</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {messages[messages.findIndex(m => m.id === msg.id) - 1]?.content?.substring(0, 100)}...
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-yellow-500">{'⭐'.repeat(msg.rating || 0)}</div>
                  <span className="text-xs text-gray-500">
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {highQualityMessages.length === 0 && (
            <p className="text-gray-500 text-center py-8">
              Aucune notation encore. Commencez à noter les réponses avec ⭐
            </p>
          )}
        </div>
      </div>
    </div>
  );
}