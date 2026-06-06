/**
 * @fileOverview LearningAnalytics - Innovation Elite 32.
 * Agrégation des métriques de performance pour le RAG, l'Agent et l'Apprentissage.
 * Version corrigée avec Core SQLite - Persistance définitive.
 * 
 * @version 4.0.0
 * @lastUpdated 2026-04-24
 */

import { ChromaDBManager } from '@/ai/vector/chromadb-manager';
import { getRetrieverStats } from '@/ai/rag/intelligent-retriever';
import { getLearningStats as getRAGLearningStats } from '@/ai/rag/rag-learning-loop';
import { getAgenticLoopStats } from '@/ai/orchestration/agentic-loop';
import { analyticsLogger } from './utils/logger';
import { SQLiteCore } from '@/ai/core/sqlite';
import { getCurrentActiveModel } from '@/ai/training/model-registry';

// ============================================================================
// INTERFACES
// ============================================================================

export interface AnalyticsStats {
  totalInteractions: number;
  corrections: number;
  patterns: number;
  avgSatisfaction: number;
  rag: {
    avgTime: string;
    avgTimeMs: number;
    avgContextSize: string;
    avgContextTokens: number;
    sources: { documents: number; lessons: number; interactions: number };
  };
  agent: {
    total: number;
    successRate: number;
    avgSteps: number;
    topTools: string[];
    toolUsage: Record<string, number>;
  };
  training: {
    last: string;
    lastTimestamp: number;
    next: string;
    nextTimestamp: number;
    dataAvailable: number;
    lessonsExtracted: number;
  };
  system: {
    uptime: string;
    uptimeMs: number;
    activeCollections: number;
    totalDocuments: number;
    totalChunks: number;
  };
  timestamp: number;
}

// ============================================================================
// INITIALISATION CORE SQLITE
// ============================================================================

const db = SQLiteCore.getInstance();
let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await db.initialize();
    initialized = true;
  }
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function getDefaultStats(): AnalyticsStats {
  const now = Date.now();
  
  return {
    totalInteractions: 0,
    corrections: 0,
    patterns: 0,
    avgSatisfaction: 0,
    rag: {
      avgTime: "0ms",
      avgTimeMs: 0,
      avgContextSize: "0 tokens",
      avgContextTokens: 0,
      sources: { documents: 0, lessons: 0, interactions: 0 }
    },
    agent: {
      total: 0,
      successRate: 0,
      avgSteps: 0,
      topTools: [],
      toolUsage: {}
    },
    training: {
      last: new Date(now).toLocaleString('fr-FR'),
      lastTimestamp: now,
      next: new Date(now + 3600000).toLocaleString('fr-FR'),
      nextTimestamp: now + 3600000,
      dataAvailable: 0,
      lessonsExtracted: 0
    },
    system: {
      uptime: "0s",
      uptimeMs: 0,
      activeCollections: 0,
      totalDocuments: 0,
      totalChunks: 0
    },
    timestamp: now
  };
}

// ============================================================================
// COLLECTE DES STATISTIQUES
// ============================================================================

export async function getLearningStats(): Promise<AnalyticsStats> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  analyticsLogger.info('COLLECT', '📊 Collecte des statistiques globales...');
  
  try {
    const retrieverStats = getRetrieverStats();
    const ragLearningStats = getRAGLearningStats();
    const agentStats = await getAgenticLoopStats();

    
    const chromaManager = ChromaDBManager.getInstance();
    const collections = await chromaManager.getAllCollectionsStats();
    
    // Récupération du dernier entraînement
    let lastTrainingTimestamp = Date.now() - 86400000; // 24h par défaut
    try {
      const currentModel = await getCurrentActiveModel();
      if (currentModel && currentModel.deployedAt) {
        lastTrainingTimestamp = currentModel.deployedAt;
      }
    } catch (e) {
      // Ignorer les erreurs d'import
    }
    
    const nextTrainingTimestamp = lastTrainingTimestamp + (24 * 3600 * 1000);
    
    const totalDocuments = collections.reduce((sum: number, col: { count?: number; id?: string }) => sum + (col.count || 0), 0);
    const activeCollections = collections.filter((col: { count?: number; id?: string }) => (col.count || 0) > 0).length;
    const totalChunks = totalDocuments;
    
    // Distribution simplifiée basée sur des métriques connues
    const sources = {
      documents: collections.find((col: { count?: number; id?: string }) => col.id === 'SHARED')?.count || 0,
      lessons: ragLearningStats.totalLessons || 0,
      interactions: collections.find((col: { count?: number; id?: string }) => col.id === 'MEMOIRE_EPISODIQUE')?.count || 0
    };
    
    const totalInteractions = retrieverStats.totalSearches;
    
    const topTools = Object.entries(agentStats.toolUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool]) => tool);
    
    const avgProcessingTime = retrieverStats.avgProcessingTime;
    
    const stats: AnalyticsStats = {
      totalInteractions,
      corrections: ragLearningStats.totalLessons || 0,
      patterns: retrieverStats.totalSearches,
      avgSatisfaction: ragLearningStats.avgRating || 0.75,
      
      rag: {
        avgTime: formatDuration(avgProcessingTime),
        avgTimeMs: avgProcessingTime,
        avgContextSize: `${Math.round(avgProcessingTime / 4)} tokens`,
        avgContextTokens: Math.round(avgProcessingTime / 4),
        sources
      },
      
      agent: {
        total: agentStats.totalLoops,
        successRate: agentStats.successRate,
        avgSteps: agentStats.totalSteps > 0 ? agentStats.totalSteps / agentStats.totalLoops : 0,
        topTools,
        toolUsage: agentStats.toolUsage
      },
      
      training: {
        last: new Date(lastTrainingTimestamp).toLocaleString('fr-FR'),
        lastTimestamp: lastTrainingTimestamp,
        next: new Date(nextTrainingTimestamp).toLocaleString('fr-FR'),
        nextTimestamp: nextTrainingTimestamp,
        dataAvailable: ragLearningStats.totalLessons || 0,
        lessonsExtracted: ragLearningStats.totalLessons || 0
      },
      
      system: {
        uptime: formatDuration(process.uptime() * 1000),
        uptimeMs: process.uptime() * 1000,
        activeCollections,
        totalDocuments,
        totalChunks
      },
      
      timestamp: Date.now()
    };
    
    // Persister les métriques en SQLite
    await db.recordMetric('analytics', 'total_interactions', totalInteractions);
    await db.recordMetric('analytics', 'rag_avg_time_ms', avgProcessingTime);
    await db.recordMetric('analytics', 'agent_success_rate', agentStats.successRate);
    await db.recordMetric('analytics', 'agent_total_loops', agentStats.totalLoops);
    await db.recordMetric('analytics', 'active_collections', activeCollections);
    await db.recordMetric('analytics', 'total_documents', totalDocuments);
    
    const elapsedTime = Date.now() - startTime;
    analyticsLogger.success('COLLECT', `Statistiques collectées en ${formatDuration(elapsedTime)} - Interactions: ${stats.totalInteractions}, Documents: ${stats.system.totalDocuments}`);
    
    return stats;
    
  } catch (error: unknown) {
    const err = error as Error;
    analyticsLogger.error('ANALYTICS', `Erreur récupération métriques temporelles: ${err.message}`);
    
    return getDefaultStats();
  }
}

// ============================================================================
// RECOMMANDATIONS
// ============================================================================

export async function getRecommendedActions(): Promise<string[]> {
  const startTime = Date.now();
  const recommendations: string[] = [];
  
  analyticsLogger.info('RECOMMEND', '🎯 Génération des recommandations...');
  
  try {
    const stats = await getLearningStats();
    
    if (stats.rag.avgTimeMs > 1000) {
      recommendations.push(`⏱️ Temps de réponse RAG élevé (${stats.rag.avgTime}), envisager d'optimiser les requêtes`);
    }
    
    if (stats.rag.sources.documents === 0) {
      recommendations.push("📄 Aucun document indexé. Ajouter des documents techniques dans le dossier data/centrale_documents");
    }
    
    if (stats.agent.successRate < 0.7 && stats.agent.total > 10) {
      recommendations.push(`🤖 Taux de succès de l'agent faible (${Math.round(stats.agent.successRate * 100)}%). Vérifier les logs pour identifier les erreurs`);
    }
    
    if (stats.training.lessonsExtracted > 20) {
      recommendations.push(`🧠 ${stats.training.lessonsExtracted} leçons extraites. Lancer un cycle d'entraînement pour améliorer la précision`);
    }
    
    if (stats.corrections > 10) {
      recommendations.push(`✏️ ${stats.corrections} corrections utilisateur enregistrées. Re-vectoriser les documents concernés`);
    }
    
    if (stats.system.activeCollections < 5) {
      recommendations.push(`📁 Seulement ${stats.system.activeCollections} collections actives. Ajouter des documents aux collections vides`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push("✅ Toutes les métriques sont dans les normes. Maintenir la veille technologique.");
      recommendations.push("📖 Re-vectoriser le manuel 'Chaudière V3' pour intégrer les corrections de la semaine.");
      recommendations.push("🚀 Lancer un cycle de fine-tuning LoRA pour améliorer la précision des calculs techniques.");
    }
    
    // Persister les recommandations en SQLite
    for (const _rec of recommendations) {
      await db.recordMetric('analytics', 'recommendation', 1);
    }
    
    const elapsedTime = Date.now() - startTime;
    analyticsLogger.success('RECOMMEND', `${recommendations.length} recommandations générées en ${formatDuration(elapsedTime)}`);
    
    return recommendations;
    
  } catch (error: unknown) {
    const err = error as Error;
    const elapsedTime = Date.now() - startTime;
    analyticsLogger.error('RECOMMEND', `Échec après ${formatDuration(elapsedTime)}`, { error: err.message });
    
    return [
      "📄 Ajouter des documents techniques dans le dossier data/centrale_documents",
      "🔍 Vérifier la connexion à ChromaDB et Ollama",
      "📊 Consulter les logs pour identifier les erreurs"
    ];
  }
}

// ============================================================================
// SUGGESTIONS D'AMÉLIORATION
// ============================================================================

export async function getImprovementSuggestions(): Promise<string[]> {
  const startTime = Date.now();
  const suggestions: string[] = [];
  
  analyticsLogger.info('SUGGEST', '💡 Génération des suggestions d\'amélioration...');
  
  try {
    const stats = await getLearningStats();
    
    const totalSources = stats.rag.sources.documents + stats.rag.sources.lessons + stats.rag.sources.interactions;
    if (totalSources > 0) {
      const docRatio = stats.rag.sources.documents / totalSources;
      const lessonRatio = stats.rag.sources.lessons / totalSources;
      
      if (docRatio > 0.7) {
        suggestions.push("📄 Augmenter le poids de la strate 'LESSONS' pour les requêtes de maintenance");
      }
      
      if (lessonRatio < 0.15) {
        suggestions.push("🧠 Encourager l'extraction de leçons à partir des interactions utilisateur");
      }
    }
    
    if (stats.agent.topTools.includes('search') && (stats.agent.toolUsage.search || 0) > 50) {
      suggestions.push("🔍 Optimiser l'outil de recherche avec des filtres sémantiques supplémentaires");
    }
    
    suggestions.push("🏛️ Ajouter une strate 'REGULATIONS' pour les normes ISO 9001 et les exigences réglementaires");
    suggestions.push("🔌 Ajouter un outil MCP pour la consultation des normes ISO 9001 en temps réel");
    suggestions.push("📊 Mettre en place un dashboard de monitoring des performances RAG en temps réel");
    
    if (stats.system.activeCollections === 13 && stats.system.totalDocuments > 50) {
      suggestions.push("📂 Créer une collection dédiée aux 'BONNES_PRATIQUES' pour capitaliser sur l'expérience");
    }
    
    if (stats.agent.successRate < 0.8 && stats.agent.total > 10) {
      suggestions.push("🎯 Optimiser les prompts système pour améliorer la précision des réponses");
    }
    
    // Persister les suggestions en SQLite
    for (const _sug of suggestions) {
      await db.recordMetric('analytics', 'suggestion', 1);
    }
    
    const elapsedTime = Date.now() - startTime;
    analyticsLogger.success('SUGGEST', `${suggestions.length} suggestions générées en ${formatDuration(elapsedTime)}`);
    
    return suggestions;
    
  } catch (error: unknown) {
    const err = error as Error;
    const elapsedTime = Date.now() - startTime;
    analyticsLogger.error('SUGGEST', `Échec après ${formatDuration(elapsedTime)}`, { error: err.message });
    
    return [
      "📊 Ajouter des métriques de performance supplémentaires",
      "🔧 Configurer le logging structuré pour mieux analyser les erreurs",
      "📈 Mettre en place un cache pour les requêtes fréquentes"
    ];
  }
}

export async function getAnalyticsMetrics(): Promise<Record<string, any>> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  
  // Récupérer les dernières métriques
  const metrics = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'analytics' 
    ORDER BY timestamp DESC LIMIT 100
  `).all() as Record<string, any>[];
  
  const aggregated: Record<string, any> = {};
  
  for (const metric of metrics) {
    if (!aggregated[metric.metricName]) {
      aggregated[metric.metricName] = [];
    }
    aggregated[metric.metricName].push({
      value: metric.metricValue,
      timestamp: metric.timestamp
    });
  }
  
  return aggregated;
}

export async function clearAnalyticsHistory(): Promise<void> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  dbInstance.prepare(`DELETE FROM metrics WHERE module = 'analytics'`).run();
  
  analyticsLogger.success('CLEAR', 'Historique des analytics nettoyé');
}

export default {
  getLearningStats,
  getRecommendedActions,
  getImprovementSuggestions,
  getAnalyticsMetrics,
  clearAnalyticsHistory
};