/**
 * @fileOverview EpisodicMemory - Innovation 25.
 * Gestion de la mémoire à horizons temporels : Travail, Court terme, Long terme.
 * Version corrigée avec Core SQLite - Persistance définitive.
 * 
 * @version 4.0.0
 * @lastUpdated 2026-04-24
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { episodicLogger } from './utils/logger';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// INTERFACES
// ============================================================================

export interface Episode {
  id: string;
  timestamp: number;
  type: 'interaction' | 'feedback' | 'observation' | 'learning';
  content: string;
  context: string;
  importance: number;
  tags: string[];
  metadata: {
    userId?: string;
    confidence?: number;
    source?: string;
    duration?: number;
  };
}

export interface MemoryRecall {
  episodes: Episode[];
  summary: string;
  recallTime: number;
  processingTime: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const MAX_EPISODES = 500;

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

function formatAge(ms: number): string {
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}min`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h`;
  return `${Math.floor(ms / 86400000)}j`;
}

function generateEpisodeId(): string {
  return `epi_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function getImportanceEmoji(importance: number): string {
  if (importance > 0.8) return '🔴';
  if (importance > 0.6) return '🟠';
  if (importance > 0.4) return '🟡';
  return '⚪';
}

async function updateMemoryStats(episode: Episode): Promise<void> {
  await ensureInitialized();
  await db.recordMetric('episodic_memory', 'episode_created', 1);
  await db.recordMetric('episodic_memory', `type_${episode.type}`, 1);
}

async function updateRecallStats(processingTime: number): Promise<void> {
  await ensureInitialized();
  await db.recordMetric('episodic_memory', 'recall', 1);
  await db.recordMetric('episodic_memory', 'recall_duration', processingTime);
}

// ============================================================================
// MÉMORISATION
// ============================================================================

export async function remember(episode: Omit<Episode, 'id' | 'timestamp'>): Promise<string> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  episodicLogger.info('REMEMBER', `🧠 Mémorisation d'un épisode (type: ${episode.type}, importance: ${episode.importance}) - Contenu: "${episode.content.substring(0, 50)}..."`);
  
  const newEpisode: Episode = {
    ...episode,
    id: generateEpisodeId(),
    timestamp: Date.now(),
  };
  
  // Persister en SQLite
  await db.learning.saveEpisode(newEpisode);
  await updateMemoryStats(newEpisode);
  
  // Nettoyer si trop d'épisodes
  const allEpisodes = await db.learning.getEpisodes(10000);
  if (allEpisodes.length > MAX_EPISODES) {
    const episodesToDelete = allEpisodes.slice(MAX_EPISODES);
    const oldestTimestamp = episodesToDelete[episodesToDelete.length - 1]?.timestamp || Date.now();
    const deleted = await db.learning.deleteOldEpisodes(oldestTimestamp);
    episodicLogger.info('REMEMBER', `Nettoyage: ${deleted} anciens épisodes supprimés`);
  }
  
  const elapsedTime = Date.now() - startTime;
  episodicLogger.success('REMEMBER', `Épisode mémorisé: ${newEpisode.id} en ${formatDuration(elapsedTime)}`);
  
  return newEpisode.id;
}

export async function recall(query: string, limit: number = 5): Promise<MemoryRecall> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  episodicLogger.info('RECALL', `🔍 Recherche de souvenirs pour: "${query.substring(0, 50)}..."`);
  
  const allEpisodes = await db.learning.getEpisodes(1000);
  
  if (!allEpisodes || allEpisodes.length === 0) {
    episodicLogger.info('RECALL', 'Aucun historique disponible');
    return {
      episodes: [],
      summary: "",
      recallTime: 0,
      processingTime: Date.now() - startTime
    };
  }
  
  const q = query.toLowerCase();
  const relevant = allEpisodes
    .filter(e => {
      const contentMatch = e.content.toLowerCase().includes(q);
      const tagMatch = e.tags.some((t: string) => q.includes(t.toLowerCase()));
      const importantMatch = e.importance > 0.8;
      return contentMatch || tagMatch || importantMatch;
    })
    .sort((a, b) => b.importance - a.importance)
    .slice(0, limit);
  
  episodicLogger.metric('RECALL', 'Souvenirs pertinents', relevant.length);
  
  if (relevant.length > 0) {
    for (const ep of relevant) {
      const age = Date.now() - ep.timestamp;
      episodicLogger.info('RECALL', `  - ${getImportanceEmoji(ep.importance)} ${ep.type} (${formatAge(age)}): ${ep.content.substring(0, 60)}...`);
    }
  }
  
  let summary = "";
  
  if (relevant.length > 0) {
    try {
      episodicLogger.info('RECALL', '🤖 Génération du résumé des souvenirs...');
      
      const prompt = `Question actuelle: ${query}
Souvenirs pertinents:
${relevant.map((r, i) => `${i + 1}. [${r.type}] ${r.content} (importance: ${Math.round(r.importance * 100)}%)`).join('\n')}

Synthétise ces souvenirs pour éclairer la question actuelle. Sois concis et pertinent.`;

      const response = await callOllama(prompt, {
        model: 'tinyllama:1.1b',
        temperature: 0.5,
        maxTokens: 300,
        timeout: 10000
      });
      
      summary = response.trim();
      episodicLogger.success('RECALL', `Résumé généré: ${summary.substring(0, 80)}...`);
      
    } catch (error: unknown) {
      const err = error as Error;
      episodicLogger.warning('RECALL', `Échec génération résumé: ${err.message}`);
      summary = "Rappel partiel de souvenirs liés à ce sujet.";
    }
  } else {
    episodicLogger.info('RECALL', 'Aucun souvenir pertinent trouvé');
  }
  
  const elapsedTime = Date.now() - startTime;
  await updateRecallStats(elapsedTime);
  
  episodicLogger.success('RECALL', `Rappel terminé en ${formatDuration(elapsedTime)} - ${relevant.length} souvenirs, résumé: ${summary.length} caractères`);
  
  return {
    episodes: relevant as Episode[],
    summary,
    recallTime: elapsedTime,
    processingTime: elapsedTime
  };
}

export async function applyForgetting(keepCount: number = 100): Promise<number> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  episodicLogger.info('FORGET', `🧹 Application de l'oubli intelligent...`);
  
  const allEpisodes = await db.learning.getEpisodes(10000);
  const beforeCount = allEpisodes.length;
  
  if (beforeCount <= keepCount) {
    episodicLogger.info('FORGET', `Aucun nettoyage nécessaire (${beforeCount}/${keepCount} épisodes)`);
    return 0;
  }
  
  // Garder les épisodes importants (importance > 0.7)
  const importantEpisodes = allEpisodes.filter(e => e.importance > 0.7);
  
  // Trier les autres par date (plus récents d'abord)
  const otherEpisodes = allEpisodes
    .filter(e => e.importance <= 0.7)
    .sort((a, b) => b.timestamp - a.timestamp);
  
  // Calculer combien garder
  const keepFromOthers = Math.max(0, keepCount - importantEpisodes.length);
  const toKeep = [...importantEpisodes, ...otherEpisodes.slice(0, keepFromOthers)];
  const toKeepIds = new Set(toKeep.map(e => e.id));
  
  // Supprimer les épisodes non gardés
  let deletedCount = 0;
  for (const episode of allEpisodes) {
    if (!toKeepIds.has(episode.id)) {
      await db.learning.deleteOldEpisodes(episode.timestamp);
      deletedCount++;
    }
  }
  
  const elapsedTime = Date.now() - startTime;
  
  episodicLogger.success('FORGET', `${deletedCount} épisodes oubliés en ${formatDuration(elapsedTime)} (${beforeCount - deletedCount}/${beforeCount} conservés)`);
  
  return deletedCount;
}

export async function getEpisodesByType(type: Episode['type'], limit?: number): Promise<Episode[]> {
  await ensureInitialized();
  const allEpisodes = await db.learning.getEpisodes(limit || 1000);
  const filtered = allEpisodes.filter(e => e.type === type);
  episodicLogger.metric('FILTER', `Type ${type}`, `${filtered.length} épisodes`);
  return filtered as Episode[];
}

export async function getImportantEpisodes(threshold: number = 0.7, limit?: number): Promise<Episode[]> {
  await ensureInitialized();
  const allEpisodes = await db.learning.getEpisodes(limit || 1000);
  const filtered = allEpisodes.filter(e => e.importance >= threshold);
  episodicLogger.metric('IMPORTANT', `Seuil ${threshold}`, `${filtered.length} épisodes`);
  return filtered as Episode[];
}

export async function getRecentEpisodes(hours: number = 24, limit?: number): Promise<Episode[]> {
  await ensureInitialized();
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const allEpisodes = await db.learning.getEpisodes(limit || 1000);
  const filtered = allEpisodes.filter(e => e.timestamp >= cutoff);
  episodicLogger.metric('RECENT', `${hours}h`, `${filtered.length} épisodes`);
  return filtered as Episode[];
}
export async function getMemoryStats(): Promise<{
  totalEpisodes: number;
  byType: Record<string, number>;
  avgImportance: number;
  oldestEpisode: number | null;
  newestEpisode: number | null;
  totalRecallOperations: number;
  avgRecallTime: number;
}> {
  await ensureInitialized();
  
  const allEpisodes = await db.learning.getEpisodes(10000);
  
  const byType: Record<string, number> = {};
  let totalImportance = 0;
  let oldestTimestamp: number | null = null;
  let newestTimestamp: number | null = null;
  
  for (const ep of allEpisodes) {
    byType[ep.type] = (byType[ep.type] || 0) + 1;
    totalImportance += ep.importance;
    if (oldestTimestamp === null || ep.timestamp < oldestTimestamp) oldestTimestamp = ep.timestamp;
    if (newestTimestamp === null || ep.timestamp > newestTimestamp) newestTimestamp = ep.timestamp;
  }
  
  const avgImportance = allEpisodes.length > 0 ? totalImportance / allEpisodes.length : 0;
  
  // Version simplifiée - ces stats sont optionnelles
  // Les métriques détaillées peuvent être ajoutées ultérieurement
  const totalRecallOperations = 0;
  const avgRecallTime = 0;
  
  return {
    totalEpisodes: allEpisodes.length,
    byType,
    avgImportance: Math.round(avgImportance * 100) / 100,
    oldestEpisode: oldestTimestamp,
    newestEpisode: newestTimestamp,
    totalRecallOperations,
    avgRecallTime
  };
}
export async function deleteEpisode(id: string): Promise<boolean> {
  await ensureInitialized();
  // Récupérer l'épisode pour connaître son timestamp
  const episodes = await db.learning.getEpisodes(1000);
  const episode = episodes.find(e => e.id === id);
  if (episode) {
    const deleted = await db.learning.deleteOldEpisodes(episode.timestamp);
    episodicLogger.info('DELETE', `Épisode supprimé: ${id}`);
    return deleted > 0;
  }
  return false;
}

export async function clearAllEpisodes(): Promise<void> {
  await ensureInitialized();
  const allEpisodes = await db.learning.getEpisodes(10000);
  for (const episode of allEpisodes) {
    await db.learning.deleteOldEpisodes(episode.timestamp);
  }
  episodicLogger.success('CLEAR', 'Tous les épisodes ont été supprimés');
}

export default {
  remember,
  recall,
  applyForgetting,
  getEpisodesByType,
  getImportantEpisodes,
  getRecentEpisodes,
  getMemoryStats,
  deleteEpisode,
  clearAllEpisodes
};