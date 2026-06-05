/**
 * @fileOverview Cartes métriques principales
 */

'use client';

interface MetricsCardsProps {
  data: {
    activeModel: {
      name: string;
      version: string;
      accuracy: number;
    };
    registry: {
      totalModels: number;
      averageAccuracy: number;
      bestAccuracy: number;
      productionCount: number;
      candidateCount: number;
      
    };
    trainingStats: {
      totalInteractions: number;
      correctionsReceived: number;
      avgSatisfaction: number;
    };
    performance: {
      inferenceLatency: number;
      totalPredictions: number;
    };
  };
}

export default function MetricsCards({ data }: MetricsCardsProps) {
  const cards = [
    {
      title: 'Modèle Actif',
      value: data.activeModel.name,
      subValue: `v${data.activeModel.version}`,
      icon: '🧠',
      color: 'blue',
      metric: `${(data.activeModel.accuracy * 100).toFixed(1)}% accuracy`,
    },
    {
      title: 'Performance Globale',
      value: `${(data.performance.inferenceLatency || 0).toFixed(0)}ms`,
      subValue: `${data.performance.totalPredictions} prédictions`,
      icon: '⚡',
      color: 'green',
      metric: `${(data.registry.averageAccuracy * 100).toFixed(1)}% avg accuracy`,
    },
    {
      title: 'Données Collectées',
      value: data.trainingStats.totalInteractions.toLocaleString(),
      subValue: `${data.trainingStats.correctionsReceived} corrections`,
      icon: '📊',
      color: 'purple',
      metric: `${data.trainingStats.avgSatisfaction.toFixed(1)}/5 satisfaction`,
    },
    {
      title: 'Registre Modèles',
      value: data.registry.totalModels.toString(),
      subValue: `${data.registry.bestAccuracy * 100}% best`,
      icon: '📚',
      color: 'orange',
      metric: `${data.registry.productionCount} en prod, ${data.registry.candidateCount} candidats`,
    },
  ];

  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
      {cards.map((card) => (
        <div
          key={card.title}
          className={`bg-gradient-to-br ${colorClasses[card.color as keyof typeof colorClasses]} rounded-xl shadow-lg p-6 text-white`}
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white/80 text-sm">{card.title}</p>
              <p className="text-3xl font-bold mt-1">{card.value}</p>
              <p className="text-white/70 text-sm mt-1">{card.subValue}</p>
              <p className="text-white/60 text-xs mt-2">{card.metric}</p>
            </div>
            <div className="text-4xl">{card.icon}</div>
          </div>
        </div>
      ))}
    </div>
  );
}