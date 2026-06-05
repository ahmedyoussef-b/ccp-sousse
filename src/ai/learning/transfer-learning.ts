/**
 * @fileOverview CrossDomainTransfer - Innovation 30.
 * Permet d'appliquer des connaissances d'un domaine source à un domaine cible.
 * Version corrigée avec Core SQLite - Persistance définitive.
 * 
 * @version 4.0.0
 * @lastUpdated 2026-04-24
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { transferLogger } from './utils/logger';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// INTERFACES
// ============================================================================

export interface TransferResult {
  sourceDomain: string;
  targetDomain: string;
  abstractConcept: string;
  adaptedConcept: string;
  adaptations: string[];
  confidence: number;
  processingTime?: number;
  mappings?: Array<{ from: string; to: string }>;
}

export interface TransferNeed {
  source: string;
  target: string;
  concept: string;
  confidence: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

export const DOMAINS = {
  CENTRALE: 'centrale_électrique',
  AUTOMOBILE: 'automobile',
  AERONAUTIQUE: 'aéronautique',
  INFORMATIQUE: 'informatique',
  MECANIQUE: 'mécanique',
  ELECTRIQUE: 'électrique',
  CHIMIE: 'chimie',
  GENERAL: 'général'
} as const;

const DOMAIN_MAPPINGS: Record<string, string[]> = {
  'centrale_électrique': ['turbine', 'chaudière', 'alternateur', 'condenseur'],
  'automobile': ['moteur', 'transmission', 'échappement', 'refroidissement'],
  'aéronautique': ['réacteur', 'fuselage', 'aileron', 'turboréacteur'],
  'informatique': ['processeur', 'mémoire', 'réseau', 'algorithme'],
  'mécanique': ['engrenage', 'roulement', 'arbre', 'poulie'],
  'électrique': ['transformateur', 'disjoncteur', 'câble', 'relais']
};

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

function getDomainSpecificTerms(domain: string): string[] {
  for (const [key, terms] of Object.entries(DOMAIN_MAPPINGS)) {
    if (domain.includes(key) || key.includes(domain)) {
      return terms;
    }
  }
  return ['concept', 'principe', 'mécanisme', 'fonction'];
}

async function updateTransferStats(
  success: boolean,
  processingTime: number,
  confidence: number,
  sourceDomain: string,
  targetDomain: string
): Promise<void> {
  await ensureInitialized();
  await db.recordMetric('transfer_learning', 'transfer', success ? 1 : 0);
  await db.recordMetric('transfer_learning', 'transfer_duration', processingTime);
  await db.recordMetric('transfer_learning', 'transfer_confidence', confidence);
  await db.recordMetric('transfer_learning', `transfer_${sourceDomain}_to_${targetDomain}`, 1);
}

// ============================================================================
// TRANSFERT DE CONNAISSANCES
// ============================================================================

export async function transferKnowledge(
  concept: string,
  sourceDomain: string,
  targetDomain: string
): Promise<TransferResult> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  transferLogger.info('TRANSFER', `🎯 Transfert de connaissances: "${concept}" (${sourceDomain} → ${targetDomain})`);
  
  try {
    // 1. Abstraction du concept via LLM
    transferLogger.info('ABSTRACT', '🔍 Extraction de l\'essence abstraite du concept...');
    
    const abstractionPrompt = `Concept: "${concept}"
Domaine source: "${sourceDomain}"

Questions:
1. Quelle est l'essence abstraite de ce concept ?
2. Quel problème fondamental résout-il ?
3. Quels sont les principes sous-jacents ?

Réponds par une description courte et universelle (max 100 mots).`;

    const abstractionResponse = await callOllama(abstractionPrompt, {
      model: 'phi:2.7b',
      temperature: 0.4,
      maxTokens: 300,
      timeout: 20000
    });
    
    const essence = abstractionResponse.trim();
    
    transferLogger.info('ABSTRACT', `Essence extraite: "${essence.substring(0, 100)}${essence.length > 100 ? '...' : ''}"`);
    
    // 2. Adaptation au domaine cible
    transferLogger.info('ADAPT', '🔄 Adaptation au domaine cible...');
    
    const sourceTerms = getDomainSpecificTerms(sourceDomain);
    const targetTerms = getDomainSpecificTerms(targetDomain);
    
    const adaptationPrompt = `Essence abstraite: "${essence}"
Domaine source: "${sourceDomain}" (termes: ${sourceTerms.join(', ')})
Domaine cible: "${targetDomain}" (termes: ${targetTerms.join(', ')})

Transpose ce concept dans le domaine cible.

Réponds UNIQUEMENT au format JSON STRICT:
{
  "adaptedName": "nom du concept adapté",
  "description": "explication détaillée",
  "adaptations": ["terme source → terme cible"],
  "mappings": [{"from": "concept source", "to": "concept cible"}],
  "confidence": 0.85
}`;

    const adaptationResponse = await callOllama(adaptationPrompt, {
      model: 'phi:2.7b',
      temperature: 0.5,
      maxTokens: 600,
      timeout: 25000
    });
    
    const jsonMatch = adaptationResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Aucun JSON trouvé dans la réponse');
    }
    
    const data = JSON.parse(jsonMatch[0]);
    
    const processingTime = Date.now() - startTime;
    
    const result: TransferResult = {
      sourceDomain,
      targetDomain,
      abstractConcept: essence,
      adaptedConcept: data.adaptedName || concept,
      adaptations: data.adaptations || [],
      confidence: Math.min(0.95, data.confidence || 0.85),
      processingTime,
      mappings: data.mappings || []
    };
    
    await updateTransferStats(true, processingTime, result.confidence, sourceDomain, targetDomain);
    
    // Sauvegarder le mapping en SQLite
    const dbInstance = db.getDB();
    for (const mapping of result.mappings || []) {
      dbInstance.prepare(`
        INSERT OR REPLACE INTO learning_domain_mappings (sourceDomain, targetDomain, conceptFrom, conceptTo, confidence, usageCount, lastUsed)
        VALUES (?, ?, ?, ?, ?, COALESCE((SELECT usageCount + 1 FROM learning_domain_mappings WHERE sourceDomain = ? AND targetDomain = ? AND conceptFrom = ?), 1), ?)
      `).run(
        sourceDomain, targetDomain, mapping.from, mapping.to, result.confidence,
        sourceDomain, targetDomain, mapping.from, Date.now()
      );
    }
    
    const elapsedTime = Date.now() - startTime;
    transferLogger.success('TRANSFER', `✅ Transfert réussi en ${formatDuration(elapsedTime)} - Adapté: ${result.adaptedConcept}, Confiance: ${Math.round(result.confidence * 100)}%`);
    
    return result;
    
  } catch (error: unknown) {
    const err = error as Error;
    const elapsedTime = Date.now() - startTime;
    await updateTransferStats(false, elapsedTime, 0, sourceDomain, targetDomain);
    transferLogger.error('TRANSFER', `❌ Échec transfert après ${formatDuration(elapsedTime)}`, { error: err.message });
    
    throw new Error(`Cross-domain transfer failed: ${err.message}`);
  }
}

export async function detectTransferNeed(query: string): Promise<TransferNeed | null> {
  await ensureInitialized();
  
  const startTime = Date.now();
  const q = query.toLowerCase();
  
  transferLogger.info('DETECT', `🔍 Détection de besoin de transfert: "${query.substring(0, 50)}..."`);
  
  const patterns = [
    { pattern: /appliquer\s+([^dans]+)\s+dans\s+le\s+domaine\s+de\s+([^\s]+)/i, source: 'Général' },
    { pattern: /transposer\s+([^dans]+)\s+(?:du|de)\s+domaine\s+([^\s]+)\s+(?:au|vers)\s+([^\s]+)/i },
    { pattern: /comment\s+adapter\s+([^dans]+)\s+de\s+([^\s]+)\s+(?:à|au|vers)\s+([^\s]+)/i },
    { pattern: /utiliser\s+([^dans]+)\s+du\s+domaine\s+([^\s]+)\s+dans\s+([^\s]+)/i }
  ];
  
  for (const pattern of patterns) {
    const match = q.match(pattern.pattern);
    if (match) {
      let concept: string, source: string, target: string;
      
      if ((pattern as any).source === 'Général') {
        concept = match[1].trim();
        target = match[2].trim();
        source = (pattern as any).source;
      } else if (match.length === 4) {
        concept = match[1].trim();
        source = match[2].trim();
        target = match[3].trim();
      } else if (match.length === 3) {
        concept = match[1].trim();
        target = match[2].trim();
        source = 'général';
      } else {
        continue;
      }
      
      const result: TransferNeed = {
        source,
        target,
        concept,
        confidence: 0.85
      };
      
      const elapsedTime = Date.now() - startTime;
      transferLogger.success('DETECT', `Besoin de transfert détecté en ${formatDuration(elapsedTime)} - Concept: ${concept}, Source: ${source}, Cible: ${target}`);
      
      return result;
    }
  }
  
  const elapsedTime = Date.now() - startTime;
  transferLogger.info('DETECT', `Aucun besoin de transfert détecté (${formatDuration(elapsedTime)})`);
  
  return null;
}

export async function analyzeTransferNeed(query: string): Promise<{
  needsTransfer: boolean;
  suggestion?: TransferResult;
  confidence: number;
}> {
  const need = await detectTransferNeed(query);
  
  if (!need) {
    return { needsTransfer: false, confidence: 0 };
  }
  
  try {
    const result = await transferKnowledge(need.concept, need.source, need.target);
    return {
      needsTransfer: true,
      suggestion: result,
      confidence: result.confidence
    };
  } catch (error: unknown) {
    const err = error as Error;
    transferLogger.warning('ANALYZE', `Échec analyse: ${err.message}`);
    return { needsTransfer: true, confidence: 0.5 };
  }
}

export async function getTransferStats(): Promise<{
  totalTransfers: number;
  successfulTransfers: number;
  failedTransfers: number;
  successRate: number;
  avgConfidence: number;
  avgProcessingTime: number;
  domainPairs: Record<string, number>;
  lastTransferTime: number | null;
  lastTransferDuration: number | null;
}> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  
  // Récupérer les métriques depuis la table metrics
  const transfers = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'transfer_learning' AND metricName = 'transfer'
  `).all() as any[];
  
  const durations = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'transfer_learning' AND metricName = 'transfer_duration'
  `).all() as any[];
  
  const confidences = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'transfer_learning' AND metricName = 'transfer_confidence'
  `).all() as any[];
  
  const domainTransferMetrics = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'transfer_learning' AND metricName LIKE 'transfer_%_to_%'
  `).all() as any[];
  
  const totalTransfers = transfers.length;
  const successfulTransfers = transfers.filter((m: { metricValue: number }) => m.metricValue === 1).length;
  const failedTransfers = totalTransfers - successfulTransfers;
  const successRate = totalTransfers > 0 ? successfulTransfers / totalTransfers : 0;
  
  const avgConfidence = confidences.length > 0
    ? confidences.reduce((sum: number, m: { metricValue: number }) => sum + m.metricValue, 0) / confidences.length
    : 0;
  
  const avgProcessingTime = durations.length > 0
    ? durations.reduce((sum: number, m: { metricValue: number }) => sum + m.metricValue, 0) / durations.length
    : 0;
  
  const domainPairs: Record<string, number> = {};
  for (const metric of domainTransferMetrics) {
    const pairName = metric.metricName.replace('transfer_', '').replace(/_/g, ' → ');
    domainPairs[pairName] = (domainPairs[pairName] || 0) + metric.metricValue;
  }
  
  const lastTransfer = transfers[transfers.length - 1];
  const lastTransferTime = lastTransfer?.timestamp || null;
  const lastTransferDuration = durations[durations.length - 1]?.metricValue || null;
  
  return {
    totalTransfers,
    successfulTransfers,
    failedTransfers,
    successRate: Math.round(successRate * 100) / 100,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    avgProcessingTime: Math.round(avgProcessingTime),
    domainPairs,
    lastTransferTime,
    lastTransferDuration
  };
}

export async function getDomainMappings(sourceDomain?: string, targetDomain?: string): Promise<any[]> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  let sql = `SELECT * FROM learning_domain_mappings`;
  const params: unknown[] = [];
  
  if (sourceDomain && targetDomain) {
    sql += ` WHERE sourceDomain = ? AND targetDomain = ?`;
    params.push(sourceDomain, targetDomain);
  } else if (sourceDomain) {
    sql += ` WHERE sourceDomain = ?`;
    params.push(sourceDomain);
  } else if (targetDomain) {
    sql += ` WHERE targetDomain = ?`;
    params.push(targetDomain);
  }
  
  sql += ` ORDER BY confidence DESC`;
  
  return dbInstance.prepare(sql).all(...params);
}

export async function resetTransferStats(): Promise<void> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  dbInstance.prepare(`DELETE FROM learning_domain_mappings`).run();
  
  transferLogger.success('STATS', 'Statistiques de transfert cross-domaine réinitialisées');
}

export default {
  transferKnowledge,
  detectTransferNeed,
  analyzeTransferNeed,
  getTransferStats,
  getDomainMappings,
  resetTransferStats,
  DOMAINS
};