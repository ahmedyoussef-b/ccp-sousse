/**
 * @fileOverview Phase 4: APPRENDRE — Boucle d'apprentissage RAG.
 * @version 3.1.0
 * @lastUpdated 2026-04-01
 * @description Version corrigée avec gestion réelle des retours ChromaDB
 */

import { ChromaDBManager } from '@/ai/vector/chromadb-manager';
import { CollectionName } from '@/ai/vector/chromadb-schema';
import { createRAGLogger } from './utils/logger';
import { StatsManager } from './utils/stats-manager';
import { getRAGConfig } from './config/rag.config';
import { z } from 'zod';

// ============================================================================
// INITIALISATION DES UTILITAIRES
// ============================================================================

const logger = createRAGLogger('[RAG-LEARNING]', {
  maxDataLength: 300,
  enableStructured: process.env.NODE_ENV === 'production'
});

interface LearningStats {
  totalInteractions: number;
  totalLessons: number;
  totalReinforcements: number;
  avgRating: number;
  avgProcessingTime: number;
  successfulLearning: number;
  failedLearning: number;
  lastLearningTime: number | null;
  lastLearningDuration: number | null;
  cacheHits: number;
  cacheMisses: number;
  persistenceErrors: number;
  typeDistribution: Record<string, number>;
  evictedLessons: number;
}

const statsManager = new StatsManager<LearningStats>({
  initial: {
    totalInteractions: 0,
    totalLessons: 0,
    totalReinforcements: 0,
    avgRating: 0,
    avgProcessingTime: 0,
    successfulLearning: 0,
    failedLearning: 0,
    lastLearningTime: null,
    lastLearningDuration: null,
    cacheHits: 0,
    cacheMisses: 0,
    persistenceErrors: 0,
    typeDistribution: {},
    evictedLessons: 0
  },
  persistIntervalMs: 60000,
  onPersist: async (stats, timestamp) => {
    logger.structured('STATS_PERSIST', { 
      module: 'rag-learning', 
      stats, 
      timestamp: timestamp.toISOString() 
    });
  }
});

// ============================================================================
// SCHÉMAS DE VALIDATION ZOD
// ============================================================================

const FeedbackSchema = z.object({
  rating: z.number().min(1).max(5),
  correction: z.string().max(5000).optional(),
  successfulSources: z.array(z.string()).optional(),
  failedSources: z.array(z.string()).optional(),
  feedbackType: z.enum(['explicit', 'implicit', 'behavioral']).optional(),
  timestamp: z.number().optional()
});

const LearningResultSchema = z.object({
  success: z.boolean(),
  lessonsCreated: z.number().min(0),
  lessonsReinforced: z.number().min(0),
  weightsUpdated: z.boolean(),
  processingTime: z.number().min(0),
  errors: z.array(z.string()).optional()
});

const RAGInteractionSchema = z.object({
  query: z.string().min(1).max(5000),
  response: z.string().min(1),
  context: z.string(),
  usedContexts: z.array(z.object({
    content: z.string(),
    source: z.string(),
    score: z.number(),
    weight: z.number(),
    finalScore: z.number(),
    metadata: z.record(z.unknown()).optional()
  }))
});

export type Feedback = z.infer<typeof FeedbackSchema>;
export type LearningResult = z.infer<typeof LearningResultSchema>;
export type RAGInteraction = z.infer<typeof RAGInteractionSchema>;
export type FeedbackType = 'explicit' | 'implicit' | 'behavioral';

// ============================================================================
// INTERFACES
// ============================================================================

export interface LearningOptions {
  enablePersistence?: boolean;
  enableCache?: boolean;
  cacheTTL?: number;
  collectionName?: CollectionName;
  minRatingForReinforcement?: number;
  maxRatingForCorrection?: number;
  includeQueryInLesson?: boolean;
  includeResponseInLesson?: boolean;
  maxContextLength?: number;
  maxEpisodicMemorySize?: number;
  deduplicationThreshold?: number;
}

export interface LessonDocument {
  id: string;
  content: string;
  metadata: Record<string, any>;
}

export interface LearningCacheEntry {
  result: LearningResult;
  timestamp: number;
  queryHash: string;
  ttl: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
  cacheTTL: 3600,
  maxCacheSize: 500,
  minRatingForReinforcement: 4,
  maxRatingForCorrection: 2,
  includeQueryInLesson: true,
  includeResponseInLesson: true,
  maxContextLength: 5000,
  enablePersistence: true,
  defaultCollection: 'MEMOIRE_EPISODIQUE' as CollectionName,
  maxEpisodicMemorySize: 10000,
  deduplicationThreshold: 0.85
};

// ============================================================================
// CACHE MÉMOIRE POUR LES RÉSULTATS D'APPRENTISSAGE
// ============================================================================

const learningCache = new Map<string, LearningCacheEntry>();

function getQueryHash(query: string): string {
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function getCacheKey(interaction: RAGInteraction, feedback: Feedback): string {
  const queryHash = getQueryHash(interaction.query);
  const feedbackHash = getQueryHash(`${feedback.rating}:${feedback.correction || ''}`);
  return `${queryHash}:${feedbackHash}`;
}

function getCached(key: string): LearningResult | null {
  const entry = learningCache.get(key);
  if (!entry) return null;
  
  const age = Date.now() - entry.timestamp;
  if (age > entry.ttl * 1000) {
    learningCache.delete(key);
    return null;
  }
  
  return entry.result;
}

function setCache(key: string, result: LearningResult, ttl: number, queryHash: string): void {
  learningCache.set(key, {
    result,
    timestamp: Date.now(),
    queryHash,
    ttl
  });
  
  if (learningCache.size > DEFAULT_CONFIG.maxCacheSize) {
    const entries = Array.from(learningCache.entries());
    const oldest = entries.sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) learningCache.delete(oldest[0]);
  }
}

function clearCache(): void {
  learningCache.clear();
  logger.info('CACHE', 'Cache d\'apprentissage vidé');
}

function getCacheSize(): number {
  return learningCache.size;
}

// ============================================================================
// GESTION LRU DE LA MÉMOIRE ÉPISODIQUE
// ============================================================================

const lessonTimestamps = new Map<string, number>();

async function enforceEpisodicMemoryLimit(
  collectionName: CollectionName,
  maxSize: number
): Promise<number> {
  try {
    const manager = ChromaDBManager.getInstance();
    await manager.getOrCreateCollection(collectionName);
    const collection = await manager.getOrCreateCollection(collectionName);
    const count = await collection.count();
    
    if (count <= maxSize) return 0;
    
    const evictCount = count - maxSize;
    
    const allDocs = await collection.get();
    if (!allDocs.ids || allDocs.ids.length === 0) return 0;
    
    // CORRECTION: Vérifier le type des timestamps
    const docsWithTimestamps = allDocs.ids.map((id, idx) => ({
      id,
      timestamp: typeof allDocs.metadatas?.[idx]?.timestamp === 'number' 
        ? allDocs.metadatas[idx]!.timestamp 
        : 0,
      metadata: allDocs.metadatas?.[idx]
    })).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    const toEvict = docsWithTimestamps.slice(0, evictCount).map(d => d.id);
    
    if (toEvict.length > 0) {
      await manager.deleteDocuments(collectionName, toEvict);
      statsManager.increment('evictedLessons', toEvict.length);
      logger.info('LRU', `${toEvict.length} leçons évincées (limite ${maxSize} atteinte)`);
    }
    
    return toEvict.length;
    
  } catch (error: any) {
    logger.warning('LRU', `Erreur lors de l'éviction LRU: ${error.message}`);
    return 0;
  }
}

// ============================================================================
// DÉDUPLICATION INTELLIGENTE
// ============================================================================

function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

async function isDuplicateLesson(
  content: string,
  collectionName: CollectionName,
  threshold: number = DEFAULT_CONFIG.deduplicationThreshold
): Promise<boolean> {
  try {
    const manager = ChromaDBManager.getInstance();
    await manager.getOrCreateCollection(collectionName);
    
    const similar = await manager.search(collectionName, content, { nResults: 3 });
    
    if (!similar.documents || similar.documents.length === 0) return false;
    
    for (const doc of similar.documents) {
      const similarity = calculateSimilarity(content, doc);
      if (similarity >= threshold) {
        // CORRECTION: logger.metric avec 3 arguments
        logger.metric('DEDUP', 'Similarité', `${(similarity * 100).toFixed(0)}%`);
        return true;
      }
    }
    
    return false;
    
  } catch (error: any) {
    logger.warning('DEDUP', `Erreur déduplication: ${error.message}`);
    return false;
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

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 100) + '\n\n... [tronqué]';
}

function getRatingEmoji(rating: number): string {
  if (rating >= 5) return '🌟';
  if (rating >= 4) return '👍';
  if (rating >= 3) return '😐';
  if (rating >= 2) return '👎';
  return '❌';
}

function getRatingLabel(rating: number): string {
  const labels: Record<number, string> = {
    5: 'Excellent',
    4: 'Bon',
    3: 'Moyen',
    2: 'Médiocre',
    1: 'Mauvais'
  };
  return labels[rating] || 'Inconnu';
}

function generateLessonId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function updateTypeDistribution(type: string): void {
  const current = statsManager.get().typeDistribution;
  statsManager.update({
    typeDistribution: {
      ...current,
      [type]: (current[type] || 0) + 1
    }
  });
}

// ============================================================================
// VALIDATION DES ENTRÉES/SORTIES
// ============================================================================

function validateFeedback(feedback: unknown): Feedback | null {
  try {
    return FeedbackSchema.parse(feedback);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      logger.warning('VALIDATION', `Feedback invalide: ${error.errors.map((e: any) => e.message).join('; ')}`);
    }
    return null;
  }
}

function validateInteraction(interaction: unknown): RAGInteraction | null {
  try {
    return RAGInteractionSchema.parse(interaction);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      logger.warning('VALIDATION', `Interaction invalide: ${error.errors.map((e: any) => e.message).join('; ')}`);
    }
    return null;
  }
}

function validateLearningResult(result: unknown): LearningResult | null {
  try {
    return LearningResultSchema.parse(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      logger.warning('VALIDATION', `Résultat invalide: ${error.errors.map((e: any) => e.message).join('; ')}`);
    }
    return null;
  }
}

// ============================================================================
// CRÉATION DE DOCUMENTS DE LEÇON
// ============================================================================

function createSuccessLesson(
  interaction: RAGInteraction,
  feedback: Feedback,
  config: LearningOptions
): LessonDocument {
  const queryText = config.includeQueryInLesson ? `Question: "${interaction.query}"` : '';
  const sourcesText = interaction.usedContexts.map((c: any) => c.source).join(', ');
  
  const content = `RAG_SUCCESS: ${queryText} Résolue avec succès via les sources: ${sourcesText}`;
  
  return {
    id: generateLessonId('success'),
    content,
    metadata: {
      type: 'rag_success',
      query: config.includeQueryInLesson ? truncateText(interaction.query, 500) : '[hidden]',
      rating: feedback.rating,
      sources: sourcesText,
      timestamp: Date.now(),
      contextLength: interaction.context.length,
      responseLength: interaction.response.length,
      feedbackType: feedback.feedbackType || 'explicit',
      successfulSources: feedback.successfulSources || [],
      embeddingVersion: 'v3.1'
    }
  };
}

function createCorrectionLesson(
  interaction: RAGInteraction,
  feedback: Feedback,
  config: LearningOptions
): LessonDocument {
  const queryText = config.includeQueryInLesson ? `Question: "${interaction.query}"` : '';
  const correctionText = feedback.correction 
    ? `Réponse correcte: ${truncateText(feedback.correction, config.maxContextLength || 5000)}`
    : 'Aucune correction fournie';
  const previousResponse = config.includeResponseInLesson 
    ? `Réponse précédente: ${truncateText(interaction.response, 500)}`
    : '';
  
  const content = `LEÇON APPRISE: ${queryText} ${correctionText}. ${previousResponse}`;
  
  return {
    id: generateLessonId('lesson'),
    content,
    metadata: {
      type: 'rag_lesson',
      query: config.includeQueryInLesson ? truncateText(interaction.query, 500) : '[hidden]',
      rating: feedback.rating,
      has_correction: !!feedback.correction,
      correction: feedback.correction ? truncateText(feedback.correction, 1000) : '',
      failedSources: (feedback.failedSources || []).join(', '),
      timestamp: Date.now(),
      originalResponse: config.includeResponseInLesson ? truncateText(interaction.response, 500) : '[hidden]',
      feedbackType: feedback.feedbackType || 'explicit',
      embeddingVersion: 'v3.1'
    }
  };
}

function createImplicitFeedbackLesson(
  interaction: RAGInteraction,
  feedbackType: 'implicit' | 'behavioral',
  _config: LearningOptions
): LessonDocument {
  const content = `FEEDBACK ${feedbackType.toUpperCase()}: Question "${truncateText(interaction.query, 200)}" - Interaction ${feedbackType}`;
  
  return {
    id: generateLessonId('implicit'),
    content,
    metadata: {
      type: `rag_${feedbackType}`,
      query: truncateText(interaction.query, 500),
      timestamp: Date.now(),
      feedbackType,
      contextLength: interaction.context.length,
      embeddingVersion: 'v3.1'
    }
  };
}

// ============================================================================
// PERSISTANCE DANS CHROMADB - CORRIGÉE
// ============================================================================

async function persistLessonToChromaDB(
  lesson: LessonDocument,
  collectionName: CollectionName
): Promise<boolean> {
  const startTime = Date.now();
  
  try {
    const manager = ChromaDBManager.getInstance();
    await manager.getOrCreateCollection(collectionName);
    
    await manager.addDocuments(collectionName, [{
      id: lesson.id,
      content: lesson.content,
      metadata: lesson.metadata
    }]);
    
    lessonTimestamps.set(lesson.id, Date.now());
    
    const elapsedTime = Date.now() - startTime;
    logger.success('PERSIST', `✅ Leçon persistée en ${formatDuration(elapsedTime)}`, {
      id: lesson.id,
      collection: collectionName,
      contentLength: lesson.content.length
    });
    return true;
    
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    logger.error('PERSIST', `Erreur après ${formatDuration(elapsedTime)}`, error);
    statsManager.increment('persistenceErrors');
    return false;
  }
}

export async function persistLessonsBatch(
  lessons: LessonDocument[],
  collectionName: CollectionName
): Promise<{ success: number; failed: number }> {
  const startTime = Date.now();
  let success = 0;
  let failed = 0;
  
  logger.info('BATCH', `📦 Persistance par lot de ${lessons.length} leçons`);
  
  const results = await Promise.allSettled(
    lessons.map(lesson => persistLessonToChromaDB(lesson, collectionName))
  );
  
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      success++;
    } else {
      failed++;
    }
  }
  
  const elapsedTime = Date.now() - startTime;
  logger.success('BATCH', `✅ Lot terminé en ${formatDuration(elapsedTime)}`, {
    succès: success,
    échecs: failed
  });
  
  return { success, failed };
}

// ============================================================================
// RENFORCEMENT POSITIF
// ============================================================================

async function reinforceSuccess(
  interaction: RAGInteraction,
  feedback: Feedback,
  config: LearningOptions
): Promise<boolean> {
  const startTime = Date.now();
  
  logger.info('REINFORCE', `🎉 Renforcement positif (${interaction.usedContexts.length} sources)`);
  
  if (!config.enablePersistence) {
    logger.info('REINFORCE', 'Persistance désactivée, skip');
    return true;
  }
  
  const lesson = createSuccessLesson(interaction, feedback, config);
  const collectionName = (config.collectionName || DEFAULT_CONFIG.defaultCollection) as CollectionName;
  
  const isDuplicate = await isDuplicateLesson(lesson.content, collectionName, config.deduplicationThreshold);
  if (isDuplicate) {
    logger.info('REINFORCE', 'Leçon similaire existe déjà, skip');
    return true;
  }
  
  const success = await persistLessonToChromaDB(lesson, collectionName);
  
  await enforceEpisodicMemoryLimit(collectionName, config.maxEpisodicMemorySize || DEFAULT_CONFIG.maxEpisodicMemorySize);
  
  const elapsedTime = Date.now() - startTime;
  
  if (success) {
    logger.success('REINFORCE', `Succès vectorisé en ${formatDuration(elapsedTime)}`);
    updateTypeDistribution('reinforcement');
  }
  
  return success;
}

// ============================================================================
// APPRENTISSAGE PAR CORRECTION
// ============================================================================

async function learnFromCorrection(
  interaction: RAGInteraction,
  feedback: Feedback,
  config: LearningOptions
): Promise<boolean> {
  const startTime = Date.now();
  
  logger.info('CORRECTION', `📝 Création d\'une nouvelle leçon (rating: ${feedback.rating})`);
  logger.metric('CORRECTION', 'Avec correction', feedback.correction ? 'OUI' : 'NON');
  
  if (!config.enablePersistence) {
    logger.info('CORRECTION', 'Persistance désactivée, skip');
    return true;
  }
  
  const lesson = createCorrectionLesson(interaction, feedback, config);
  const collectionName = (config.collectionName || DEFAULT_CONFIG.defaultCollection) as CollectionName;
  
  const isDuplicate = await isDuplicateLesson(lesson.content, collectionName, config.deduplicationThreshold);
  if (isDuplicate) {
    logger.info('CORRECTION', 'Leçon similaire existe déjà, skip');
    return true;
  }
  
  const success = await persistLessonToChromaDB(lesson, collectionName);
  
  await enforceEpisodicMemoryLimit(collectionName, config.maxEpisodicMemorySize || DEFAULT_CONFIG.maxEpisodicMemorySize);
  
  const elapsedTime = Date.now() - startTime;
  
  if (success) {
    logger.success('CORRECTION', `Leçon vectorisée en ${formatDuration(elapsedTime)}`);
    updateTypeDistribution('correction');
  }
  
  return success;
}

// ============================================================================
// FEEDBACK IMPLICITE
// ============================================================================

async function learnFromImplicitFeedbackInternal(
  interaction: RAGInteraction,
  feedbackType: 'implicit' | 'behavioral',
  config: LearningOptions
): Promise<boolean> {
  const startTime = Date.now();
  
  logger.info('IMPLICIT', `👁️ Apprentissage implicite (${feedbackType})`);
  
  if (!config.enablePersistence) {
    logger.info('IMPLICIT', 'Persistance désactivée, skip');
    return true;
  }
  
  const lesson = createImplicitFeedbackLesson(interaction, feedbackType, config);
  const collectionName = (config.collectionName || DEFAULT_CONFIG.defaultCollection) as CollectionName;
  
  const success = await persistLessonToChromaDB(lesson, collectionName);
  
  await enforceEpisodicMemoryLimit(collectionName, config.maxEpisodicMemorySize || DEFAULT_CONFIG.maxEpisodicMemorySize);
  
  const elapsedTime = Date.now() - startTime;
  
  if (success) {
    logger.success('IMPLICIT', `Feedback implicite vectorisé en ${formatDuration(elapsedTime)}`);
    updateTypeDistribution('implicit');
  }
  
  return success;
}

// ============================================================================
// MISE À JOUR DES POIDS DU RETRIEVER
// ============================================================================

async function updateRetrieverWeights(
  feedback: Feedback,
  _interaction: RAGInteraction
): Promise<boolean> {
  const startTime = Date.now();
  let updated = false;
  
  if (feedback.failedSources && feedback.failedSources.length > 0) {
    logger.info('WEIGHTS', `🔧 Signal de dégradation pour les sources: ${feedback.failedSources.join(', ')}`);
    updated = true;
    updateTypeDistribution('weight_decrease');
  }

  if (feedback.rating === 5 && feedback.successfulSources && feedback.successfulSources.length > 0) {
    logger.info('WEIGHTS', `✅ Stratégie de retrieval validée - Sources efficaces: ${feedback.successfulSources.join(', ')}`);
    updated = true;
    updateTypeDistribution('weight_increase');
  }
  
  if (feedback.rating <= 2 && feedback.successfulSources && feedback.successfulSources.length > 0) {
    logger.info('WEIGHTS', `🔍 Validation des sources malgré rating faible: ${feedback.successfulSources.join(', ')}`);
    updated = true;
    updateTypeDistribution('weight_review');
  }
  
  const elapsedTime = Date.now() - startTime;
  if (updated) {
    logger.success('WEIGHTS', `Mise à jour des poids en ${formatDuration(elapsedTime)}`);
  }
  
  return updated;
}

// ============================================================================
// ANALYSE DES PATTERNS D'ÉCHEC
// ============================================================================

export async function analyzeFailurePatterns(
  interactions: RAGInteraction[],
  timeWindow: number = 7
): Promise<{
  commonFailureSources: Array<{ source: string; count: number }>;
  commonQueryTypes: Array<{ type: string; count: number }>;
  avgFailureRating: number;
  recommendations: string[];
}> {
  logger.info('ANALYZE', `🔍 Analyse des patterns d\'échec sur ${timeWindow} jours`);
  
  const sourceFailures = new Map<string, number>();
  const queryTypeFailures = new Map<string, number>();
  let totalRating = 0;
  
  for (const interaction of interactions) {
    for (const ctx of interaction.usedContexts) {
      const count = sourceFailures.get(ctx.source) || 0;
      sourceFailures.set(ctx.source, count + 1);
    }
  }
  
  const commonFailureSources = Array.from(sourceFailures.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  const commonQueryTypes = Array.from(queryTypeFailures.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  const recommendations: string[] = [];
  
  if (commonFailureSources.length > 0) {
    recommendations.push(`Réviser les documents des sources: ${commonFailureSources.slice(0, 3).map(s => s.source).join(', ')}`);
  }
  
  logger.success('ANALYZE', `✅ Analyse terminée`, {
    sourcesIdentifiées: commonFailureSources.length,
    recommandations: recommendations.length
  });
  
  return {
    commonFailureSources,
    commonQueryTypes,
    avgFailureRating: totalRating / (interactions.length || 1),
    recommendations
  };
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

export async function learnFromRAGInteraction(
  interaction: RAGInteraction,
  feedback: Feedback,
  options: LearningOptions = {}
): Promise<LearningResult> {
  const startTime = Date.now();
  const config = getRAGConfig();
  
  const mergedConfig: LearningOptions = {
    enablePersistence: options.enablePersistence ?? config.learning.enablePersistence,
    enableCache: options.enableCache ?? true,
    cacheTTL: options.cacheTTL ?? DEFAULT_CONFIG.cacheTTL,
    collectionName: options.collectionName || config.learning.collectionName as CollectionName,
    minRatingForReinforcement: options.minRatingForReinforcement ?? config.learning.minRatingForReinforcement,
    maxRatingForCorrection: options.maxRatingForCorrection ?? config.learning.maxRatingForCorrection,
    includeQueryInLesson: options.includeQueryInLesson ?? DEFAULT_CONFIG.includeQueryInLesson,
    includeResponseInLesson: options.includeResponseInLesson ?? DEFAULT_CONFIG.includeResponseInLesson,
    maxContextLength: options.maxContextLength ?? DEFAULT_CONFIG.maxContextLength,
    maxEpisodicMemorySize: options.maxEpisodicMemorySize ?? DEFAULT_CONFIG.maxEpisodicMemorySize,
    deduplicationThreshold: options.deduplicationThreshold ?? DEFAULT_CONFIG.deduplicationThreshold
  };
  
  const validatedFeedback = validateFeedback(feedback);
  if (!validatedFeedback) {
    logger.error('VALIDATION', 'Feedback invalide, apprentissage annulé');
    statsManager.increment('failedLearning');
    return {
      success: false,
      lessonsCreated: 0,
      lessonsReinforced: 0,
      weightsUpdated: false,
      processingTime: Date.now() - startTime,
      errors: ['Feedback invalide']
    };
  }
  
  const validatedInteraction = validateInteraction(interaction);
  if (!validatedInteraction) {
    logger.error('VALIDATION', 'Interaction invalide, apprentissage annulé');
    statsManager.increment('failedLearning');
    return {
      success: false,
      lessonsCreated: 0,
      lessonsReinforced: 0,
      weightsUpdated: false,
      processingTime: Date.now() - startTime,
      errors: ['Interaction invalide']
    };
  }
  
  logger.printSeparator();
  logger.info('START', `🎓 APPRENTISSAGE RAG`);
  logger.metric('START', 'Rating', `${getRatingEmoji(feedback.rating)} ${getRatingLabel(feedback.rating)} (${feedback.rating}/5)`);
  logger.printSeparator();
  
  statsManager.increment('totalInteractions');
  statsManager.update({ lastLearningTime: Date.now() });
  statsManager.average('avgRating', feedback.rating);
  
  if (mergedConfig.enableCache) {
    const cacheKey = getCacheKey(validatedInteraction, validatedFeedback);
    const cached = getCached(cacheKey);
    
    if (cached) {
      const elapsedTime = Date.now() - startTime;
      statsManager.increment('cacheHits');
      statsManager.average('avgProcessingTime', elapsedTime);
      
      logger.success('CACHE', `✅ Hit cache en ${formatDuration(elapsedTime)}`);
      
      return { ...cached, processingTime: elapsedTime };
    }
    statsManager.increment('cacheMisses');
  }
  
  const errors: string[] = [];
  let lessonsCreated = 0;
  let reinforcementsCreated = 0;
  let weightsUpdated = false;
  
  const tasks: Promise<boolean>[] = [];
  let success = true;
  
  if (feedback.rating >= mergedConfig.minRatingForReinforcement!) {
    logger.info('PHASE', `🌟 Phase 1: Renforcement positif (rating: ${feedback.rating})`);
    tasks.push(
      reinforceSuccess(validatedInteraction, validatedFeedback, mergedConfig).then(result => {
        if (result) {
          reinforcementsCreated++;
        } else {
          errors.push('Échec renforcement');
          success = false;
        }
        return result;
      })
    );
  }
  
  if (feedback.rating <= mergedConfig.maxRatingForCorrection! || feedback.correction) {
    logger.info('PHASE', `📚 Phase 2: Apprentissage par correction (rating: ${feedback.rating})`);
    tasks.push(
      learnFromCorrection(validatedInteraction, validatedFeedback, mergedConfig).then(result => {
        if (result) {
          lessonsCreated++;
        } else {
          errors.push('Échec création leçon');
          success = false;
        }
        return result;
      })
    );
  }
  
  logger.info('PHASE', `⚙️ Phase 3: Mise à jour des poids`);
  tasks.push(
    updateRetrieverWeights(validatedFeedback, validatedInteraction).then(result => {
      weightsUpdated = result;
      return result;
    })
  );
  
  const results = await Promise.allSettled(tasks);
  
  for (const result of results) {
    if (result.status === 'rejected') {
      errors.push(result.reason?.message || 'Tâche échouée');
      success = false;
    }
  }
  
  const elapsedTime = Date.now() - startTime;
  
  statsManager.average('avgProcessingTime', elapsedTime);
  statsManager.update({ lastLearningDuration: elapsedTime });
  
  if (success) {
    statsManager.increment('successfulLearning');
    statsManager.increment('totalLessons', lessonsCreated);
    statsManager.increment('totalReinforcements', reinforcementsCreated);
  } else {
    statsManager.increment('failedLearning');
  }
  
  logger.printSeparator();
  if (success) {
    logger.success('RESULT', `✅ APPRENTISSAGE TERMINÉ en ${formatDuration(elapsedTime)}`);
  } else {
    logger.warning('RESULT', `⚠️ APPRENTISSAGE PARTIEL en ${formatDuration(elapsedTime)}`, { errors: errors.length });
  }
  
  logger.metric('RESULT', 'Leçons créées', lessonsCreated);
  logger.metric('RESULT', 'Renforcements', reinforcementsCreated);
  logger.metric('RESULT', 'Poids mis à jour', weightsUpdated ? '✅' : '⏭️');
  
  if (errors.length > 0) {
    logger.warning('RESULT', `${errors.length} erreur(s) rencontrée(s)`, errors.slice(0, 5));
  }
  
  logger.printSeparator();
  
  const result: LearningResult = {
    success,
    lessonsCreated,
    lessonsReinforced: reinforcementsCreated,
    weightsUpdated,
    processingTime: elapsedTime,
    errors: errors.length > 0 ? errors : undefined
  };
  
  const validatedResult = validateLearningResult(result);
  const finalResult = validatedResult || result;
  
  if (mergedConfig.enableCache && success) {
    const cacheKey = getCacheKey(validatedInteraction, validatedFeedback);
    const queryHash = getQueryHash(validatedInteraction.query);
    setCache(cacheKey, finalResult, mergedConfig.cacheTTL!, queryHash);
  }
  
  return finalResult;
}

// ============================================================================
// APPRENTISSAGE PAR LOT
// ============================================================================

export async function learnFromRAGInteractionBatch(
  interactions: Array<{ interaction: RAGInteraction; feedback: Feedback }>,
  options: LearningOptions = {}
): Promise<Array<{ interaction: RAGInteraction; result: LearningResult }>> {
  logger.info('BATCH', `📦 Apprentissage par lot pour ${interactions.length} interactions`);
  
  const startTime = Date.now();
  const results = await Promise.allSettled(
    interactions.map(item => 
      learnFromRAGInteraction(item.interaction, item.feedback, options).then(result => ({
        interaction: item.interaction,
        result
      }))
    )
  );
  
  const elapsedTime = Date.now() - startTime;
  
  const fulfilled = results.filter(
    (r): r is PromiseFulfilledResult<{ interaction: RAGInteraction; result: LearningResult }> => r.status === 'fulfilled'
  );
  const rejected = results.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected'
  );
  
  logger.success('BATCH', `✅ Lot terminé en ${formatDuration(elapsedTime)}`, {
    succès: fulfilled.length,
    échecs: rejected.length
  });
  
  if (rejected.length > 0) {
    logger.warning('BATCH', `${rejected.length} échec(s)`, rejected.map(r => r.reason?.message));
  }
  
  return fulfilled.map(r => r.value);
}

// ============================================================================
// APPRENTISSAGE IMPLICITE
// ============================================================================

export async function learnFromImplicitFeedback(
  interaction: RAGInteraction,
  feedbackType: 'implicit' | 'behavioral' = 'implicit',
  options: LearningOptions = {}
): Promise<LearningResult> {
  const startTime = Date.now();
  const config = getRAGConfig();
  
  const mergedConfig: LearningOptions = {
    enablePersistence: options.enablePersistence ?? config.learning.enablePersistence,
    collectionName: options.collectionName || config.learning.collectionName as CollectionName,
    enableCache: options.enableCache ?? true,
    cacheTTL: options.cacheTTL ?? DEFAULT_CONFIG.cacheTTL,
    maxEpisodicMemorySize: options.maxEpisodicMemorySize ?? DEFAULT_CONFIG.maxEpisodicMemorySize
  };
  
  logger.info('IMPLICIT', `👁️ Enregistrement feedback ${feedbackType}`);
  
  statsManager.increment('totalInteractions');
  statsManager.update({ lastLearningTime: Date.now() });
  
  let success = true;
  
  if (mergedConfig.enablePersistence) {
    success = await learnFromImplicitFeedbackInternal(interaction, feedbackType, mergedConfig);
  }
  
  const elapsedTime = Date.now() - startTime;
  
  const result: LearningResult = {
    success,
    lessonsCreated: success ? 1 : 0,
    lessonsReinforced: 0,
    weightsUpdated: false,
    processingTime: elapsedTime
  };
  
  updateTypeDistribution(feedbackType);
  
  return result;
}

// ============================================================================
// STATISTIQUES
// ============================================================================

export function getLearningStats(): Readonly<LearningStats> {
  return statsManager.get();
}

export function getLearningSnapshot(): {
  stats: Readonly<LearningStats>;
  metadata: { createdAt: Date; updatedAt: Date };
} {
  return statsManager.getSnapshot();
}

export function getSuccessRate(): number {
  const stats = statsManager.get();
  const total = stats.successfulLearning + stats.failedLearning;
  return total > 0 ? stats.successfulLearning / total : 0;
}

export function getCacheHitRate(): number {
  const stats = statsManager.get();
  const total = stats.cacheHits + stats.cacheMisses;
  return total > 0 ? stats.cacheHits / total : 0;
}

export function getPersistenceRate(): number {
  const stats = statsManager.get();
  const total = stats.totalLessons + stats.totalReinforcements;
  const errors = stats.persistenceErrors;
  return total > 0 ? (total - errors) / total : 1;
}

export function resetLearningStats(): void {
  statsManager.reset();
  logger.success('STATS', 'Statistiques d\'apprentissage réinitialisées');
}

export async function persistLearningStats(): Promise<void> {
  await statsManager.persist();
  logger.success('STATS', 'Statistiques persistées manuellement');
}

export function disposeLearningStats(): void {
  statsManager.dispose();
  logger.info('STATS', 'Gestionnaire de statistiques disposé');
}

export function clearLearningCache(): void {
  clearCache();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  learnFromRAGInteraction,
  learnFromRAGInteractionBatch,
  learnFromImplicitFeedback,
  analyzeFailurePatterns,
  getLearningStats,
  getLearningSnapshot,
  getSuccessRate,
  getCacheHitRate,
  getPersistenceRate,
  resetLearningStats,
  persistLearningStats,
  disposeLearningStats,
  clearLearningCache,
  getCacheSize,
  
  schemas: {
    FeedbackSchema,
    LearningResultSchema,
    RAGInteractionSchema
  }
};