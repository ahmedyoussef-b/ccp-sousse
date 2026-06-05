/**
 * @fileOverview Détecteur de procédures techniques avec fallback LLM optionnel
 * @version 3.0.0
 * @lastUpdated 2026-03-31
 * @description Version refactorisée avec logger/stats centralisés, configuration externalisée,
 *              validation Zod et gestion robuste des erreurs
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { createRAGLogger } from './utils/logger';
import { StatsManager } from './utils/stats-manager';
import { z } from 'zod';

// ============================================================================
// INITIALISATION DES UTILITAIRES
// ============================================================================

const logger = createRAGLogger('[PROCEDURE-DETECTOR]', {
  maxDataLength: 200,
  enableStructured: typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'
});

interface DetectorStats {
  totalDetections: number;
  localDetections: number;
  llmDetections: number;
  quickDetections: number;
  avgConfidence: number;
  avgProcessingTime: number;
  lastDetectionTime: number | null;
  fallbackTriggered: number;
  cacheHits: number;
  cacheMisses: number;
}

const statsManager = new StatsManager<DetectorStats>({
  initial: {
    totalDetections: 0,
    localDetections: 0,
    llmDetections: 0,
    quickDetections: 0,
    avgConfidence: 0,
    avgProcessingTime: 0,
    lastDetectionTime: null,
    fallbackTriggered: 0,
    cacheHits: 0,
    cacheMisses: 0
  },
  persistIntervalMs: 60000,
  onPersist: async (stats, timestamp) => {
    logger.structured('STATS_PERSIST', { 
      module: 'procedure-detector', 
      stats, 
      timestamp: timestamp.toISOString() 
    });
  }
});

// ============================================================================
// SCHÉMAS DE VALIDATION ZOD
// ============================================================================

const ProcedureTypeSchema = z.enum(['demarrage', 'arret', 'inspection', 'maintenance', 'unknown']);

const ProcedureIntentSchema = z.object({
  isProcedure: z.boolean(),
  procedureType: ProcedureTypeSchema,
  procedureName: z.string().min(1).max(200),
  equipment: z.string().max(100).optional(),
  confidence: z.number().min(0).max(1),
  detectedSteps: z.array(z.string()).optional(),
  matchedKeywords: z.array(z.string()).optional(),
  processingTime: z.number().min(0).optional(),
  detectionMethod: z.enum(['local', 'llm', 'quick', 'cache']).optional()
});

export type ProcedureIntent = z.infer<typeof ProcedureIntentSchema>;
export type ProcedureType = z.infer<typeof ProcedureTypeSchema>;

// ============================================================================
// INTERFACES
// ============================================================================

export interface DetectionOptions {
  useLLMFallback?: boolean;
  localThreshold?: number;
  llmThreshold?: number;
  llmModel?: string;
  llmTimeout?: number;
}

export interface DetectionResult {
  intent: ProcedureIntent;
  cached: boolean;
  processingTime: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
  localConfidenceThreshold: 0.5,
  llmFallbackThreshold: 0.3,
  llmModel: 'tinyllama:1.1b',
  llmTimeout: 5000,
  cacheTTL: 3600,
  maxCacheSize: 1000
};

// ============================================================================
// MOTS-CLÉS ET PATTERNS
// ============================================================================

const procedureKeywords: Record<ProcedureType, string[]> = {
  demarrage: [
    'démarrer', 'démarrage', 'lancer', 'mise en route', 'start', 'démarre',
    'allumer', 'mettre en marche', 'initialiser', 'boot', 'startup',
    'pré-démarrage', 'predemarrage', 'init', 'enclencher', 'activer'
  ],
  arret: [
    'arrêter', 'arrêt', 'stop', 'couper', 'extinction', 'shutdown',
    'éteindre', 'mettre à l\'arrêt', 'stopper', 'terminer',
    'urgence', 'emergency', 'secours', 'désactiver', 'halt'
  ],
  inspection: [
    'inspecter', 'inspection', 'vérifier', 'contrôler', 'check', 'round',
    'tournée', 'visite', 'examiner', 'diagnostiquer', 'rondes',
    'visuel', 'visuelle', 'controle', 'surveiller', 'monitoring'
  ],
  maintenance: [
    'maintenir', 'maintenance', 'entretenir', 'réparer', 'fix', 'révision',
    'entretien', 'dépanner', 'dépannage', 'réparation', 'remplacer',
    'changer', 'remplacement', 'graissage', 'lubrification', 'nettoyer',
    'calibrer', 'étalonner', 'ajuster'
  ],
  unknown: []
};

const equipmentPatterns: Array<{ pattern: RegExp; name: string; confidence: number }> = [
  { pattern: /(TG1|tg1|turbine.*gaz.*1|turbine à gaz 1|GE 9E)/i, name: 'TG1', confidence: 0.9 },
  { pattern: /(TG2|tg2|turbine.*gaz.*2|turbine à gaz 2)/i, name: 'TG2', confidence: 0.9 },
  { pattern: /(TV|tv|turbine.*vapeur|turbine vapeur|steam turbine)/i, name: 'TV', confidence: 0.9 },
  { pattern: /(CR1|cr1|chaudière.*1|chaudière 1|boiler 1)/i, name: 'CR1', confidence: 0.9 },
  { pattern: /(CR2|cr2|chaudière.*2|chaudière 2|boiler 2)/i, name: 'CR2', confidence: 0.9 },
  { pattern: /(chaudière|chaudiere|boiler)/i, name: 'Chaudière', confidence: 0.7 },
  { pattern: /(condenseur|condensateur|condenser)/i, name: 'Condenseur', confidence: 0.7 },
  { pattern: /(pompe|pump)/i, name: 'Pompe', confidence: 0.6 },
  { pattern: /(vanne|valve)/i, name: 'Vanne', confidence: 0.6 },
  { pattern: /(alternateur|générateur|generator)/i, name: 'Alternateur', confidence: 0.7 },
  { pattern: /(compresseur|compressor)/i, name: 'Compresseur', confidence: 0.7 },
  { pattern: /(refroidisseur|cooler|échangeur)/i, name: 'Échangeur', confidence: 0.6 },
  { pattern: /(filtre|filter)/i, name: 'Filtre', confidence: 0.5 }
];

const implicitProcedurePatterns: Array<{ pattern: RegExp; type: ProcedureType; confidence: number }> = [
  { pattern: /comment (?:faire|réaliser|effectuer)/i, type: 'unknown', confidence: 0.4 },
  { pattern: /quelle est (?:la|les) procédure/i, type: 'unknown', confidence: 0.5 },
  { pattern: /(?:étapes|marches) (?:pour|de)/i, type: 'unknown', confidence: 0.4 },
  { pattern: /(?:guide|manuel) (?:de|d')/i, type: 'unknown', confidence: 0.3 },
  { pattern: /procédure (?:de|d')/i, type: 'unknown', confidence: 0.6 },
  { pattern: /(?:marche à suivre|mode opératoire)/i, type: 'unknown', confidence: 0.5 }
];

// ============================================================================
// CACHE MÉMOIRE
// ============================================================================

interface CacheEntry {
  intent: ProcedureIntent;
  timestamp: number;
  ttl: number;
}

const detectionCache = new Map<string, CacheEntry>();

function getCacheKey(query: string, options: DetectionOptions): string {
  return `${query.toLowerCase().trim()}:${JSON.stringify(options)}`;
}

function getCached(key: string): ProcedureIntent | null {
  const entry = detectionCache.get(key);
  if (!entry) return null;
  
  const age = Date.now() - entry.timestamp;
  if (age > entry.ttl * 1000) {
    detectionCache.delete(key);
    return null;
  }
  
  return entry.intent;
}

function setCache(key: string, intent: ProcedureIntent, ttl: number): void {
  detectionCache.set(key, {
    intent,
    timestamp: Date.now(),
    ttl
  });
  
  if (detectionCache.size > DEFAULT_CONFIG.maxCacheSize) {
    const entries = Array.from(detectionCache.entries());
    const oldest = entries.sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) detectionCache.delete(oldest[0]);
  }
}

function clearCache(): void {
  detectionCache.clear();
  logger.info('CACHE', 'Cache de détection vidé');
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

function formatProcedureName(
  procedureType: ProcedureType,
  equipment?: string
): string {
  const typeMap: Record<ProcedureType, string> = {
    demarrage: 'Démarrage',
    arret: 'Arrêt',
    inspection: 'Inspection',
    maintenance: 'Maintenance',
    unknown: 'Procédure'
  };
  
  const typeName = typeMap[procedureType] || 'Procédure';
  return equipment ? `${typeName} ${equipment}` : typeName;
}

// ============================================================================
// VALIDATION DES ENTRÉES
// ============================================================================

function validateProcedureIntent(intent: unknown): ProcedureIntent | null {
  try {
    return ProcedureIntentSchema.parse(intent);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      logger.warning('VALIDATION', `Intent invalide: ${error.errors.map((e: any) => e.message).join('; ')}`);
    }
    return null;
  }
}

// ============================================================================
// DÉTECTION LOCALE
// ============================================================================

function detectLocally(
  query: string,
  thresholds: { localConfidenceThreshold: number }
): {
  isProcedure: boolean;
  procedureType: ProcedureType;
  equipment?: string;
  confidence: number;
  matchedKeywords: string[];
  matchedEquipmentConfidence: number;
} {
  const queryLower = query.toLowerCase();
  let procedureType: ProcedureType = 'unknown';
  let maxTypeConfidence = 0;
  const matchedKeywords: string[] = [];
  
  for (const [type, keywords] of Object.entries(procedureKeywords)) {
    if (type === 'unknown') continue;
    
    for (const keyword of keywords) {
      if (queryLower.includes(keyword)) {
        matchedKeywords.push(keyword);
        const confidence = keyword.length > 5 ? 0.8 : 0.6;
        if (confidence > maxTypeConfidence) {
          maxTypeConfidence = confidence;
          procedureType = type as ProcedureType;
        }
      }
    }
  }
  
  for (const pattern of implicitProcedurePatterns) {
    if (pattern.pattern.test(query)) {
      if (pattern.confidence > maxTypeConfidence) {
        maxTypeConfidence = pattern.confidence;
        if (pattern.type !== 'unknown') {
          procedureType = pattern.type;
        }
      }
    }
  }
  
  let equipment: string | undefined;
  let matchedEquipmentConfidence = 0;
  for (const pattern of equipmentPatterns) {
    if (pattern.pattern.test(query)) {
      if (pattern.confidence > matchedEquipmentConfidence) {
        matchedEquipmentConfidence = pattern.confidence;
        equipment = pattern.name;
      }
    }
  }
  
  let confidence = maxTypeConfidence;
  if (equipment) {
    confidence = Math.min(confidence + 0.1, 0.95);
  }
  if (matchedKeywords.length > 1) {
    confidence = Math.min(confidence + 0.05 * matchedKeywords.length, 0.95);
  }
  
  const isProcedure = confidence >= thresholds.localConfidenceThreshold;
  
  return {
    isProcedure,
    procedureType,
    equipment,
    confidence,
    matchedKeywords,
    matchedEquipmentConfidence
  };
}

// ============================================================================
// FALLBACK LLM
// ============================================================================

async function detectWithLLM(
  query: string,
  config: { llmModel: string; llmTimeout: number }
): Promise<ProcedureIntent | null> {
  const startTime = Date.now();
  
  logger.info('LLM', `🔄 Tentative LLM fallback avec ${config.llmModel}`);
  
  try {
    const prompt = `Détermine si la question suivante concerne une procédure technique dans une centrale électrique.
Réponds UNIQUEMENT au format JSON: {"isProcedure": true/false, "type": "demarrage|arret|inspection|maintenance|unknown", "name": "nom de la procédure", "confidence": 0-1}

Question: "${sanitizeQuery(query)}"

Réponse JSON:`;

    const response = await callOllama(prompt, {
      model: config.llmModel,
      temperature: 0.1,
      maxTokens: 100,
      timeout: config.llmTimeout
    });
    
    const elapsedTime = Date.now() - startTime;
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      const intent: ProcedureIntent = {
        isProcedure: parsed.isProcedure || false,
        procedureType: (['demarrage', 'arret', 'inspection', 'maintenance', 'unknown'].includes(parsed.type) 
          ? parsed.type 
          : 'unknown') as ProcedureType,
        procedureName: parsed.name || formatProcedureName(parsed.type || 'unknown'),
        confidence: typeof parsed.confidence === 'number' ? Math.min(Math.max(parsed.confidence, 0), 1) : 0.5,
        detectedSteps: [],
        matchedKeywords: [],
        processingTime: elapsedTime,
        detectionMethod: 'llm'
      };
      
      const validated = validateProcedureIntent(intent);
      if (validated) {
        logger.metric('LLM', `Réponse en ${formatDuration(elapsedTime)}`, {
          isProcedure: validated.isProcedure,
          type: validated.procedureType,
          confidence: validated.confidence
        });
        return validated;
      }
    }
    
    logger.warning('LLM', 'Réponse LLM non parseable');
    return null;
    
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    logger.warning('LLM', `Échec fallback après ${formatDuration(elapsedTime)}: ${error.message}`);
    return null;
  }
}

// ============================================================================
// DÉTECTION RAPIDE
// ============================================================================

export function quickDetectProcedure(query: string): boolean {
  const startTime = Date.now();
  const cleanQuery = sanitizeQuery(query).toLowerCase();
  
  for (const keywords of Object.values(procedureKeywords)) {
    for (const keyword of keywords) {
      if (cleanQuery.includes(keyword)) {
        const elapsedTime = Date.now() - startTime;
        statsManager.increment('quickDetections');
        statsManager.increment('totalDetections');
        statsManager.average('avgProcessingTime', elapsedTime);
        statsManager.update({ lastDetectionTime: Date.now() });
        
        logger.metric('QUICK', `Match rapide en ${formatDuration(elapsedTime)}`, keyword);
        return true;
      }
    }
  }
  
  for (const pattern of implicitProcedurePatterns) {
    if (pattern.pattern.test(query)) {
      const elapsedTime = Date.now() - startTime;
      statsManager.increment('quickDetections');
      statsManager.increment('totalDetections');
      statsManager.average('avgProcessingTime', elapsedTime);
      statsManager.update({ lastDetectionTime: Date.now() });
      
      logger.metric('QUICK', `Pattern rapide en ${formatDuration(elapsedTime)}`, pattern.pattern.source);
      return true;
    }
  }
  
  const elapsedTime = Date.now() - startTime;
  logger.metric('QUICK', `Aucun match en ${formatDuration(elapsedTime)}`, {});
  return false;
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

export async function detectProcedureIntent(
  query: string,
  options: DetectionOptions = {}
): Promise<ProcedureIntent> {
  const startTime = Date.now();
  
  const mergedConfig = {
    localConfidenceThreshold: options.localThreshold ?? DEFAULT_CONFIG.localConfidenceThreshold,
    llmFallbackThreshold: options.llmThreshold ?? DEFAULT_CONFIG.llmFallbackThreshold,
    llmModel: options.llmModel ?? DEFAULT_CONFIG.llmModel,
    llmTimeout: options.llmTimeout ?? DEFAULT_CONFIG.llmTimeout,
    useLLMFallback: options.useLLMFallback ?? true
  };
  
  const cleanQuery = sanitizeQuery(query);
  
  logger.printSeparator();
  logger.info('START', `🔍 Analyse: "${cleanQuery.substring(0, 60)}${cleanQuery.length > 60 ? '...' : ''}"`);
  logger.printSeparator();
  
  statsManager.increment('totalDetections');
  statsManager.update({ lastDetectionTime: Date.now() });
  
  const cacheKey = getCacheKey(cleanQuery, options);
  const cached = getCached(cacheKey);
  
  if (cached) {
    const elapsedTime = Date.now() - startTime;
    statsManager.increment('cacheHits');
    statsManager.average('avgProcessingTime', elapsedTime);
    
    logger.success('CACHE', `✅ Hit cache en ${formatDuration(elapsedTime)}`);
    
    return { ...cached, processingTime: elapsedTime, detectionMethod: 'cache' };
  }
  statsManager.increment('cacheMisses');
  
  const localDetection = detectLocally(cleanQuery, {
    localConfidenceThreshold: mergedConfig.localConfidenceThreshold
  });
  
  logger.metric('LOCAL', 'Type', localDetection.procedureType);
  logger.metric('LOCAL', 'Confiance', `${Math.round(localDetection.confidence * 100)}%`);
  logger.metric('LOCAL', 'Mots-clés', localDetection.matchedKeywords.length);
  
  if (localDetection.confidence >= mergedConfig.localConfidenceThreshold) {
    const procedureName = formatProcedureName(localDetection.procedureType, localDetection.equipment);
    const elapsedTime = Date.now() - startTime;
    
    statsManager.increment('localDetections');
    statsManager.average('avgConfidence', localDetection.confidence);
    statsManager.average('avgProcessingTime', elapsedTime);
    
    const intent: ProcedureIntent = {
      isProcedure: localDetection.isProcedure,
      procedureType: localDetection.procedureType,
      procedureName,
      equipment: localDetection.equipment,
      confidence: localDetection.confidence,
      detectedSteps: [],
      matchedKeywords: localDetection.matchedKeywords,
      processingTime: elapsedTime,
      detectionMethod: 'local'
    };
    
    const validated = validateProcedureIntent(intent);
    if (validated) {
      logger.success('LOCAL', `✅ Détection locale validée (${formatDuration(elapsedTime)})`);
      
      setCache(cacheKey, validated, DEFAULT_CONFIG.cacheTTL);
      
      return validated;
    }
  }
  
  if (
    mergedConfig.useLLMFallback &&
    localDetection.confidence >= mergedConfig.llmFallbackThreshold
  ) {
    statsManager.increment('fallbackTriggered');
    
    logger.info('LLM', `🔄 Tentative LLM fallback (confiance locale: ${Math.round(localDetection.confidence * 100)}%)...`);
    
    const llmResult = await detectWithLLM(cleanQuery, {
      llmModel: mergedConfig.llmModel,
      llmTimeout: mergedConfig.llmTimeout
    });
    
    if (llmResult && llmResult.confidence > localDetection.confidence) {
      const elapsedTime = Date.now() - startTime;
      
      statsManager.increment('llmDetections');
      statsManager.average('avgConfidence', llmResult.confidence);
      statsManager.average('avgProcessingTime', elapsedTime);
      
      logger.success('LLM', `✅ LLM fallback réussi (${formatDuration(elapsedTime)})`);
      
      setCache(cacheKey, llmResult, DEFAULT_CONFIG.cacheTTL);
      
      return llmResult;
    }
  }
  
  const elapsedTime = Date.now() - startTime;
  const procedureName = formatProcedureName(localDetection.procedureType, localDetection.equipment);
  
  statsManager.increment('localDetections');
  statsManager.average('avgConfidence', localDetection.confidence);
  statsManager.average('avgProcessingTime', elapsedTime);
  
  const intent: ProcedureIntent = {
    isProcedure: localDetection.isProcedure,
    procedureType: localDetection.procedureType,
    procedureName,
    equipment: localDetection.equipment,
    confidence: localDetection.confidence,
    detectedSteps: [],
    matchedKeywords: localDetection.matchedKeywords,
    processingTime: elapsedTime,
    detectionMethod: 'local'
  };
  
  const validated = validateProcedureIntent(intent);
  const result = validated || intent;
  
  logger.warning('LOCAL', `⚠️ Détection locale par défaut (${formatDuration(elapsedTime)})`);
  
  setCache(cacheKey, result, DEFAULT_CONFIG.cacheTTL);
  
  return result;
}

// ============================================================================
// DÉTECTION PAR LOT
// ============================================================================

export async function detectProcedureIntentBatch(
  queries: string[],
  options: DetectionOptions = {}
): Promise<ProcedureIntent[]> {
  logger.info('BATCH', `📦 Détection par lot pour ${queries.length} requêtes`);
  
  const startTime = Date.now();
  const results = await Promise.allSettled(
    queries.map(query => detectProcedureIntent(query, options))
  );
  
  const elapsedTime = Date.now() - startTime;
  
  const fulfilled = results.filter(
    (r): r is PromiseFulfilledResult<ProcedureIntent> => r.status === 'fulfilled'
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
// STATISTIQUES
// ============================================================================

export function getDetectorStats(): Readonly<DetectorStats> {
  return statsManager.get();
}

export function getDetectorSnapshot(): {
  stats: Readonly<DetectorStats>;
  metadata: { createdAt: Date; updatedAt: Date };
} {
  return statsManager.getSnapshot();
}

export function getCacheHitRate(): number {
  const stats = statsManager.get();
  const total = stats.cacheHits + stats.cacheMisses;
  return total > 0 ? stats.cacheHits / total : 0;
}

export function getFallbackRate(): number {
  const stats = statsManager.get();
  const total = stats.totalDetections;
  return total > 0 ? stats.fallbackTriggered / total : 0;
}

export function resetDetectorStats(): void {
  statsManager.reset();
  logger.success('STATS', 'Statistiques du détecteur réinitialisées');
}

export async function persistDetectorStats(): Promise<void> {
  await statsManager.persist();
  logger.success('STATS', 'Statistiques persistées manuellement');
}

export function disposeDetectorStats(): void {
  statsManager.dispose();
  logger.info('STATS', 'Gestionnaire de statistiques disposé');
}

export function clearDetectionCache(): void {
  clearCache();
}

export function getCacheSize(): number {
  return detectionCache.size;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectProcedureIntent,
  detectProcedureIntentBatch,
  quickDetectProcedure,
  getDetectorStats,
  getDetectorSnapshot,
  getCacheHitRate,
  getFallbackRate,
  resetDetectorStats,
  persistDetectorStats,
  disposeDetectorStats,
  clearDetectionCache,
  getCacheSize,
  schemas: {
    ProcedureIntentSchema,
    ProcedureTypeSchema
  }
};