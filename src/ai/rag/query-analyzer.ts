/**
 * @fileOverview QueryAnalyzer - Intelligence sémantique de la Phase 1.
 * Analyse et structure les demandes utilisateur pour optimiser le processus RAG.
 * @version 3.0.0
 * @lastUpdated 2026-03-31
 * @description Version refactorisée avec logger/stats centralisés, configuration externalisée,
 *              validation Zod, cache sémantique et gestion robuste des erreurs
 */

import { createRAGLogger } from './utils/logger';
import { StatsManager } from './utils/stats-manager';
import { getRAGConfig } from './config/rag.config';
import { z } from 'zod';

// ============================================================================
// INITIALISATION DES UTILITAIRES
// ============================================================================

const logger = createRAGLogger('[QUERY-ANALYZER]', {
  maxDataLength: 300,
  enableStructured: process.env.NODE_ENV === 'production'
});

interface AnalyzerStats {
  totalAnalyses: number;
  llmAnalyses: number;
  fallbackAnalyses: number;
  avgComplexity: number;
  avgProcessingTime: number;
  lastAnalysisTime: number | null;
  lastAnalysisDuration: number | null;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
  typeDistribution: Record<string, number>;
  intentDistribution: Record<string, number>;
}

const statsManager = new StatsManager<AnalyzerStats>({
  initial: {
    totalAnalyses: 0,
    llmAnalyses: 0,
    fallbackAnalyses: 0,
    avgComplexity: 0,
    avgProcessingTime: 0,
    lastAnalysisTime: null,
    lastAnalysisDuration: null,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0,
    typeDistribution: {},
    intentDistribution: {}
  },
  persistIntervalMs: 60000,
  onPersist: async (stats, timestamp) => {
    logger.structured('STATS_PERSIST', { 
      module: 'query-analyzer', 
      stats, 
      timestamp: timestamp.toISOString() 
    });
  }
});

// ============================================================================
// SCHÉMAS DE VALIDATION ZOD
// ============================================================================

const QueryTypeSchema = z.enum(['factual', 'procedural', 'comparative', 'explanatory', 'action', 'general']);
const IntentSchema = z.enum(['inform', 'help', 'explain', 'summarize', 'calculate']);

const QueryAnalysisSchema = z.object({
  type: QueryTypeSchema,
  intent: IntentSchema,
  concepts: z.array(z.string().min(1).max(100)),
  entities: z.array(z.string().min(1).max(100)),
  complexity: z.number().min(0).max(1),
  original: z.string().min(1).max(2000),
  processingTime: z.number().min(0).optional(),
  analysisMethod: z.enum(['llm', 'fallback', 'cache']).optional(),
  confidence: z.number().min(0).max(1).optional()
});

export type QueryType = z.infer<typeof QueryTypeSchema>;
export type Intent = z.infer<typeof IntentSchema>;
export type QueryAnalysis = z.infer<typeof QueryAnalysisSchema>;

// ============================================================================
// INTERFACES
// ============================================================================

export interface AnalysisOptions {
  useLLM?: boolean;
  enableCache?: boolean;
  cacheTTL?: number;
  timeout?: number;
  model?: string;
}

export interface AnalysisResult {
  analysis: QueryAnalysis;
  cached: boolean;
  processingTime: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
  analysisTimeout: 60000,
  cacheTTL: 3600, // 1 heure
  maxCacheSize: 1000,
  fallbackConfidence: 0.6,
  llmConfidence: 0.85
};

// ============================================================================
// CACHE MÉMOIRE (Pour les requêtes fréquentes)
// ============================================================================

interface CacheEntry {
  analysis: QueryAnalysis;
  timestamp: number;
  queryHash: string;
  ttl: number;
}

const analysisCache = new Map<string, CacheEntry>();

function getQueryHash(query: string): string {
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function getCacheKey(query: string, options: AnalysisOptions): string {
  const hash = getQueryHash(query.toLowerCase().trim());
  return `${hash}:${options.useLLM ?? true}:${options.enableCache ?? true}`;
}

function getCached(key: string): QueryAnalysis | null {
  const entry = analysisCache.get(key);
  if (!entry) return null;
  
  const age = Date.now() - entry.timestamp;
  if (age > entry.ttl * 1000) {
    analysisCache.delete(key);
    return null;
  }
  
  return entry.analysis;
}

function setCache(key: string, analysis: QueryAnalysis, ttl: number, queryHash: string): void {
  analysisCache.set(key, {
    analysis,
    timestamp: Date.now(),
    queryHash,
    ttl
  });
  
  // Nettoyer le cache si trop grand
  if (analysisCache.size > DEFAULT_CONFIG.maxCacheSize) {
    const entries = Array.from(analysisCache.entries());
    const oldest = entries.sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) analysisCache.delete(oldest[0]);
  }
}

function clearCache(): void {
  analysisCache.clear();
  logger.info('CACHE', 'Cache d\'analyse vidé');
}


// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function sanitizeQuery(query: string): string {
  return query.replace(/^["']|["']$/g, '').trim();
}

function updateTypeDistribution(type: QueryType): void {
  const current = statsManager.get().typeDistribution;
  statsManager.update({
    typeDistribution: {
      ...current,
      [type]: (current[type] || 0) + 1
    }
  });
}

function updateIntentDistribution(intent: Intent): void {
  const current = statsManager.get().intentDistribution;
  statsManager.update({
    intentDistribution: {
      ...current,
      [intent]: (current[intent] || 0) + 1
    }
  });
}

// ============================================================================
// VALIDATION DES ENTRÉES/SORTIES
// ============================================================================

function validateQueryAnalysis(analysis: unknown): QueryAnalysis | null {
  try {
    return QueryAnalysisSchema.parse(analysis);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      logger.warning('VALIDATION', `Analyse invalide: ${error.errors.map((e: any) => e.message).join('; ')}`);
    }
    return null;
  }
}


// ============================================================================
// ÉVALUATION DE LA COMPLEXITÉ
// ============================================================================

function assessComplexity(query: string, concepts: string[]): number {
  let score = 0.2;
  
  // Longueur de la requête
  score += Math.min(query.length / 300, 0.3);
  
  // Nombre de concepts
  score += Math.min(concepts.length * 0.15, 0.4);
  
  // Mots-clés de complexité
  if (query.match(/si|alors|pourquoi|comment|différence|comparer|analyse|calcul|optimiser|diagnostiquer/i)) {
    score += 0.1;
  }
  
  // Mots-clés techniques
  const technicalTerms = [
    'turbine', 'chaudière', 'pression', 'température', 'débit', 'rendement',
    'compresseur', 'alternateur', 'transformateur', 'condenseur', 'vapeur',
    'combustion', 'échangeur', 'pompe', 'vanne', 'capteur', 'automate'
  ];
  const technicalCount = technicalTerms.filter(term => query.toLowerCase().includes(term)).length;
  score += Math.min(technicalCount * 0.05, 0.2);
  
  // Présence de multiples entités
  if (concepts.length > 2) {
    score += 0.1;
  }
  
  return Math.min(score, 1.0);
}

// ============================================================================
// ANALYSE PAR LLM
// ============================================================================

async function performLLMAnalysis(
  query: string,
  config: { model: string; timeout: number; temperature: number }
): Promise<QueryAnalysis | null> {
  const startTime = Date.now();
  
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (ollamaUrl.includes('ngrok-free.dev')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  const prompt = `Tu es un Analyste Sémantique expert en maintenance industrielle de centrales thermiques.
Analyse la requête et extrait les informations au format JSON STRICT.

Requête: "${sanitizeQuery(query)}"

Réponds UNIQUEMENT en JSON (sans texte avant ou après, sans markdown):
{
  "type": "factual|procedural|comparative|explanatory|action|general",
  "intent": "inform|help|explain|summarize|calculate",
  "concepts": ["concept1", "concept2"],
  "entities": ["equipement1", "equipement2"]
}

Types possibles: factual, procedural, comparative, explanatory, action, general
Intents possibles: inform, help, explain, summarize, calculate
Complexité: 0-1 (basée sur la complexité technique)`;

  logger.info('LLM', `Appel à ${ollamaUrl}/api/generate avec modèle ${config.model}`);
  logger.metric('LLM', 'Longueur requête', `${query.length} caractères`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: config.temperature,
          num_predict: 300
        }
      })
    });

    clearTimeout(timeoutId);
    const elapsedTime = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    logger.metric('LLM', 'Réponse reçue', `${data.response?.length || 0} caractères en ${formatDuration(elapsedTime)}`);

    // Extraire le JSON de la réponse (gérer le markdown éventuel)
    const responseText = data.response || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Construire l'objet d'analyse complet
      const analysis: QueryAnalysis = {
        type: parsed.type || 'general',
        intent: parsed.intent || 'inform',
        concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
        entities: Array.isArray(parsed.entities) ? parsed.entities : [],
        complexity: assessComplexity(query, parsed.concepts || []),
        original: query,
        processingTime: elapsedTime,
        analysisMethod: 'llm',
        confidence: DEFAULT_CONFIG.llmConfidence
      };
      
      // Validation Zod
      const validated = validateQueryAnalysis(analysis);
      if (validated) {
        logger.success('LLM', `Analyse réussie`, {
          type: validated.type,
          intent: validated.intent,
          concepts: validated.concepts?.length || 0,
          entities: validated.entities?.length || 0,
          complexity: validated.complexity
        });
        return validated;
      }
      
      return analysis;
    }

    logger.warning('LLM', 'Aucun JSON trouvé dans la réponse');
    return null;

  } catch (error: any) {
    clearTimeout(timeoutId);
    const elapsedTime = Date.now() - startTime;
    
    if (error.name === 'AbortError') {
      logger.error('LLM', `Timeout après ${formatDuration(elapsedTime)}`);
    } else {
      logger.error('LLM', `Échec après ${formatDuration(elapsedTime)}`, error);
    }
    return null;
  }
}

// ============================================================================
// ANALYSE DE FALLBACK (HEURISTIQUES)
// ============================================================================

function fallbackAnalysis(query: string): QueryAnalysis {
  const startTime = Date.now();
  const q = query.toLowerCase();
  let type: QueryType = 'general';
  let intent: Intent = 'inform';
  const concepts: string[] = [];
  const entities: string[] = [];
  
  logger.info('FALLBACK', 'Analyse basique par heuristiques');
  
  // Détection du type
  if (q.includes('comment') || q.includes('étape') || q.includes('procédure') || 
      q.includes('démarrage') || q.includes('démarrer') || q.includes('arrêt') || q.includes('arrêter')) {
    type = 'procedural';
    intent = 'help';
  } else if (q.includes('pourquoi') || q.includes('explique') || q.includes('raison') || 
             q.includes('cause') || q.includes('effet')) {
    type = 'explanatory';
    intent = 'explain';
  } else if (q.includes('puissance') || q.includes('valeur') || q.includes('quel') || 
             q.includes('combien') || q.includes('quelle') || q.includes('quels')) {
    type = 'factual';
    intent = 'inform';
  } else if (q.includes('différence') || q.includes('comparer') || q.includes('versus') || 
             q.includes('vs') || q.includes('entre')) {
    type = 'comparative';
    intent = 'explain';
  } else if (q.includes('calcul') || q.includes('estimer') || q.includes('évaluer') || 
             q.includes('déterminer') || q.includes('mesurer')) {
    type = 'action';
    intent = 'calculate';
  }
  
  // Extraction basique d'entités (équipements)
  const equipmentTerms = [
    { term: 'tg1', name: 'TG1' },
    { term: 'tg2', name: 'TG2' },
    { term: 'tv', name: 'TV' },
    { term: 'cr1', name: 'CR1' },
    { term: 'cr2', name: 'CR2' },
    { term: 'chaudière', name: 'Chaudière' },
    { term: 'turbine', name: 'Turbine' },
    { term: 'pompe', name: 'Pompe' },
    { term: 'compresseur', name: 'Compresseur' },
    { term: 'alternateur', name: 'Alternateur' },
    { term: 'transformateur', name: 'Transformateur' },
    { term: 'condenseur', name: 'Condenseur' },
    { term: 'vanne', name: 'Vanne' },
    { term: 'capteur', name: 'Capteur' }
  ];
  
  for (const { term, name } of equipmentTerms) {
    if (q.includes(term)) {
      entities.push(name);
    }
  }
  
  // Extraction basique de concepts
  const conceptTerms = [
    'puissance', 'température', 'pression', 'débit', 'rendement', 'maintenance',
    'alarme', 'seuil', 'vibration', 'lubrification', 'combustion', 'synchronisation',
    'démarrage', 'arrêt', 'inspection', 'réparation', 'calibration'
  ];
  
  for (const term of conceptTerms) {
    if (q.includes(term)) {
      concepts.push(term);
    }
  }
  
  const complexity = assessComplexity(query, concepts);
  const elapsedTime = Date.now() - startTime;
  
  logger.success('FALLBACK', `Analyse terminée en ${formatDuration(elapsedTime)}`, {
    type,
    intent,
    entities: entities.length,
    concepts: concepts.length,
    complexity
  });
  
  const analysis: QueryAnalysis = {
    type,
    intent,
    concepts,
    entities,
    complexity,
    original: query,
    processingTime: elapsedTime,
    analysisMethod: 'fallback',
    confidence: DEFAULT_CONFIG.fallbackConfidence
  };
  
  return validateQueryAnalysis(analysis) || analysis;
}

// ============================================================================
// ANALYSE PAR LOT
// ============================================================================

/**
 * Analyse plusieurs requêtes en parallèle
 */
export async function analyzeQueryBatch(
  queries: string[],
  options: AnalysisOptions = {}
): Promise<QueryAnalysis[]> {
  logger.info('BATCH', `📦 Analyse par lot pour ${queries.length} requêtes`);
  
  const startTime = Date.now();
  const results = await Promise.allSettled(
    queries.map(query => analyzeQuery(query, options))
  );
  
  const elapsedTime = Date.now() - startTime;
  const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<QueryAnalysis>[];
  const rejected = results.filter(r => r.status === 'rejected');
  
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
// FONCTION PRINCIPALE
// ============================================================================

/**
 * Analyse complète d'une requête via LLM local et heuristiques.
 * @param query - La requête utilisateur à analyser
 * @param options - Options d'analyse
 * @returns L'analyse sémantique de la requête
 */
export async function analyzeQuery(
  query: string,
  options: AnalysisOptions = {}
): Promise<QueryAnalysis> {
  const startTime = Date.now();
  const config = getRAGConfig();
  
  // Configuration fusionnée
  const mergedConfig = {
    useLLM: options.useLLM ?? true,
    enableCache: options.enableCache ?? true,
    cacheTTL: options.cacheTTL ?? DEFAULT_CONFIG.cacheTTL,
    timeout: options.timeout ?? DEFAULT_CONFIG.analysisTimeout,
    model: options.model ?? config.llm.defaultModel,
    temperature: config.llm.temperature
  };
  
  const cleanQuery = sanitizeQuery(query);
  
  logger.printSeparator();
  logger.info('START', `🔍 Analyse sémantique: "${cleanQuery.substring(0, 80)}${cleanQuery.length > 80 ? '...' : ''}"`);
  logger.metric('START', 'Modèle', mergedConfig.model);
  logger.metric('START', 'LLM activé', mergedConfig.useLLM ? 'oui' : 'non');
  logger.metric('START', 'Cache activé', mergedConfig.enableCache ? 'oui' : 'non');
  logger.printSeparator();
  
  statsManager.increment('totalAnalyses');
  statsManager.update({ lastAnalysisTime: Date.now() });
  
  // 1. Vérifier le cache
  if (mergedConfig.enableCache) {
    const cacheKey = getCacheKey(cleanQuery, options);
    const cached = getCached(cacheKey);
    
    if (cached) {
      const elapsedTime = Date.now() - startTime;
      statsManager.increment('cacheHits');
      statsManager.average('avgProcessingTime', elapsedTime);
      
      logger.success('CACHE', `✅ Hit cache en ${formatDuration(elapsedTime)}`);
      logger.metric('RESULT', 'Type', cached.type);
      logger.metric('RESULT', 'Intention', cached.intent);
      
      return { ...cached, processingTime: elapsedTime, analysisMethod: 'cache' };
    }
    statsManager.increment('cacheMisses');
  }
  
  // 2. Analyse LLM (si activée)
  if (mergedConfig.useLLM) {
    const llmAnalysis = await performLLMAnalysis(cleanQuery, {
      model: mergedConfig.model,
      timeout: mergedConfig.timeout,
      temperature: mergedConfig.temperature
    });
    
    if (llmAnalysis) {
      const elapsedTime = Date.now() - startTime;
      
      statsManager.increment('llmAnalyses');
      statsManager.average('avgComplexity', llmAnalysis.complexity);
      statsManager.average('avgProcessingTime', elapsedTime);
      statsManager.update({ lastAnalysisDuration: elapsedTime });
      
      updateTypeDistribution(llmAnalysis.type);
      updateIntentDistribution(llmAnalysis.intent);
      
      logger.printSeparator();
      logger.success('RESULT', `✅ Analyse LLM terminée en ${formatDuration(elapsedTime)}`);
      logger.metric('RESULT', 'Type', llmAnalysis.type);
      logger.metric('RESULT', 'Intention', llmAnalysis.intent);
      logger.metric('RESULT', 'Complexité', `${Math.round(llmAnalysis.complexity * 100)}%`);
      logger.metric('RESULT', 'Concepts', llmAnalysis.concepts.length);
      logger.metric('RESULT', 'Entités', llmAnalysis.entities.length);
      logger.printSeparator();
      
      // Mettre en cache
      if (mergedConfig.enableCache) {
        const cacheKey = getCacheKey(cleanQuery, options);
        const queryHash = getQueryHash(cleanQuery);
        setCache(cacheKey, llmAnalysis, mergedConfig.cacheTTL, queryHash);
      }
      
      return llmAnalysis;
    }
  }
  
  // 3. Fallback heuristiques
  statsManager.increment('fallbackAnalyses');
  const fallback = fallbackAnalysis(cleanQuery);
  const elapsedTime = Date.now() - startTime;
  
  fallback.processingTime = elapsedTime;
  
  statsManager.average('avgComplexity', fallback.complexity);
  statsManager.average('avgProcessingTime', elapsedTime);
  statsManager.update({ lastAnalysisDuration: elapsedTime });
  
  updateTypeDistribution(fallback.type);
  updateIntentDistribution(fallback.intent);
  
  logger.printSeparator();
  logger.info('RESULT', `📋 Analyse fallback terminée en ${formatDuration(elapsedTime)}`);
  logger.metric('RESULT', 'Type', fallback.type);
  logger.metric('RESULT', 'Intention', fallback.intent);
  logger.metric('RESULT', 'Complexité', `${Math.round(fallback.complexity * 100)}%`);
  logger.printSeparator();
  
  // Mettre en cache même les résultats fallback
  if (mergedConfig.enableCache) {
    const cacheKey = getCacheKey(cleanQuery, options);
    const queryHash = getQueryHash(cleanQuery);
    setCache(cacheKey, fallback, mergedConfig.cacheTTL, queryHash);
  }
  
  return fallback;
}
// ============================================================================
// CLASSIFICATION DE REQUÊTES
// ============================================================================

/**
 * Classe une requête dans une catégorie métier
 */
export function classifyQuery(query: string): {
  category: 'maintenance' | 'operation' | 'safety' | 'training' | 'diagnostic' | 'general';
  confidence: number;
  keywords: string[];
} {
  const q = query.toLowerCase();
  
  const categories = {
    maintenance: ['maintenance', 'entretien', 'réparation', 'remplacer', 'graissage', 'révision'],
    operation: ['démarrage', 'arrêt', 'conduite', 'exploitation', 'manœuvre', 'synchronisation'],
    safety: ['sécurité', 'danger', 'alarme', 'urgence', 'EPI', 'protection', 'seuil'],
    training: ['formation', 'apprendre', 'cours', 'exercice', 'simulation'],
    diagnostic: ['panne', 'défaut', 'problème', 'cause', 'diagnostic', 'anomalie']
  } as const;
  
  let bestCategory: keyof typeof categories = 'general' as keyof typeof categories;
  let maxMatches = 0;
  const matchedKeywords: string[] = [];
  
  for (const [category, keywords] of Object.entries(categories)) {
    const matches = keywords.filter(k => q.includes(k));
    if (matches.length > maxMatches) {
      maxMatches = matches.length;
      bestCategory = category as keyof typeof categories;
      matchedKeywords.push(...matches);
    }
  }
  
  const confidence = maxMatches > 0 ? Math.min(0.5 + maxMatches * 0.15, 0.95) : 0.3;
  
  logger.info('CLASSIFY', `Catégorie: ${bestCategory} (confiance: ${Math.round(confidence * 100)}%)`);
  
  return {
    category: bestCategory,
    confidence,
    keywords: Array.from(new Set(matchedKeywords))
  };
}/**
 * Détecte le niveau d'urgence d'une requête
 */
export function detectUrgency(query: string): {
  level: 'critical' | 'high' | 'normal' | 'low';
  indicators: string[];
} {
  const q = query.toLowerCase();
  
  const critical = ['urgence', 'emergency', 'danger immédiat', 'arrêt d\'urgence', 'E-STOP'];
  const high = ['alarme', 'défaut critique', 'panne', 'seuil dépassé'];
  const normal = ['maintenance', 'inspection', 'vérification', 'contrôle'];
  
  const indicators: string[] = [];
  
  for (const term of critical) {
    if (q.includes(term)) {
      indicators.push(term);
    }
  }
  
  if (indicators.length > 0) {
    return { level: 'critical', indicators };
  }
  
  for (const term of high) {
    if (q.includes(term)) {
      indicators.push(term);
    }
  }
  
  if (indicators.length > 0) {
    return { level: 'high', indicators };
  }
  
  for (const term of normal) {
    if (q.includes(term)) {
      indicators.push(term);
    }
  }
  
  if (indicators.length > 0) {
    return { level: 'normal', indicators };
  }
  
  return { level: 'low', indicators: [] };
}
// ============================================================================
// STATISTIQUES
// ============================================================================

export function getAnalyzerStats(): Readonly<AnalyzerStats> {
  return statsManager.get();
}

export function getAnalyzerSnapshot(): {
  stats: Readonly<AnalyzerStats>;
  metadata: { createdAt: Date; updatedAt: Date };
} {
  return statsManager.getSnapshot();
}

export function getCacheHitRate(): number {
  const stats = statsManager.get();
  const total = stats.cacheHits + stats.cacheMisses;
  return total > 0 ? stats.cacheHits / total : 0;
}

export function getLLMUsageRate(): number {
  const stats = statsManager.get();
  const total = stats.totalAnalyses;
  return total > 0 ? stats.llmAnalyses / total : 0;
}

export function getErrorRate(): number {
  const stats = statsManager.get();
  const total = stats.totalAnalyses;
  return total > 0 ? stats.errors / total : 0;
}

export function resetAnalyzerStats(): void {
  statsManager.reset();
  logger.success('STATS', 'Statistiques de l\'analyseur réinitialisées');
}

export async function persistAnalyzerStats(): Promise<void> {
  await statsManager.persist();
  logger.success('STATS', 'Statistiques persistées manuellement');
}

export function disposeAnalyzerStats(): void {
  statsManager.dispose();
  logger.info('STATS', 'Gestionnaire de statistiques disposé');
}

export function clearAnalysisCache(): void {
  clearCache();
}

export function getCacheSize(): number {
  return analysisCache.size;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  analyzeQuery,
  analyzeQueryBatch,
  classifyQuery,
  detectUrgency,
  getAnalyzerStats,
  getAnalyzerSnapshot,
  getCacheHitRate,
  getLLMUsageRate,
  getErrorRate,
  resetAnalyzerStats,
  persistAnalyzerStats,
  disposeAnalyzerStats,
  clearAnalysisCache,
  getCacheSize,
  schemas: {
    QueryTypeSchema,
    IntentSchema,
    QueryAnalysisSchema
  }
};

// Export pour compatibilité avec l'ancien code
export { validateQueryAnalysis as safeParseQueryAnalysis };