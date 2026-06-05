/**
 * @fileOverview KnowledgeDistillation - Innovation 28.
 * Synthétise les interactions passées en règles compactes et modèles par domaine.
 * Version corrigée avec Core SQLite - Persistance définitive.
 * 
 * @version 4.0.0
 * @lastUpdated 2026-04-24
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { Episode } from './episodic-memory';
import { distillationLogger } from './utils/logger';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// INTERFACES
// ============================================================================

export interface DistilledRule {
  id: string;
  domain: string;
  pattern: string;
  instruction: string;
  confidence: number;
  timestamp?: number;
  usageCount?: number;
  tags?: string[];
}

export interface DistillationResult {
  rules: DistilledRule[];
  summary: string;
  compressionRatio: number;
  processingTime: number;
  episodesAnalyzed: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const MIN_EPISODES_FOR_DISTILLATION = 5;
const MAX_RULES_PER_DISTILLATION = 10;

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

function generateRuleId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

async function updateDistillationStats(
  success: boolean,
  processingTime: number,
  rulesCount: number,
  compressionRatio: number
): Promise<void> {
  await ensureInitialized();
  await db.recordMetric('knowledge_distillation', 'distillation', success ? 1 : 0);
  await db.recordMetric('knowledge_distillation', 'distillation_duration', processingTime);
  await db.recordMetric('knowledge_distillation', 'rules_extracted', rulesCount);
  await db.recordMetric('knowledge_distillation', 'compression_ratio', compressionRatio);
}

// Helper pour convertir en DistilledRule
function toDistilledRule(row: Record<string, any>): DistilledRule {
  return {
    id: row.id,
    domain: row.domain,
    pattern: row.pattern,
    instruction: row.instruction,
    confidence: row.confidence,
    timestamp: row.timestamp,
    usageCount: row.usageCount || 0,
    tags: row.tags ? JSON.parse(row.tags) : []
  };
}

// ============================================================================
// DISTILLATION DES INTERACTIONS
// ============================================================================

export async function distillInteractions(episodes: Episode[]): Promise<DistillationResult> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  distillationLogger.info('START', `🔍 Distillation de ${episodes.length} épisodes pour extraction de patterns...`);
  
  if (episodes.length < MIN_EPISODES_FOR_DISTILLATION) {
    distillationLogger.warning('START', `Pas assez de données (${episodes.length} < ${MIN_EPISODES_FOR_DISTILLATION}) pour la distillation`);
    return {
      rules: [],
      summary: "Pas assez de données pour la distillation.",
      compressionRatio: 1,
      processingTime: Date.now() - startTime,
      episodesAnalyzed: episodes.length
    };
  }
  
  const recentEpisodes = episodes.slice(-20);
  const episodesContent = recentEpisodes.map(e => ({
    type: e.type,
    content: e.content.substring(0, 300),
    importance: e.importance,
    tags: e.tags
  }));
  
  distillationLogger.metric('START', 'Épisodes analysés', recentEpisodes.length);
  
  try {
    const userPrompt = `Logs d'interactions récentes:
${JSON.stringify(episodesContent, null, 2)}

Génère des règles distillées.
Format JSON STRICT:
{
  "rules": [
    {
      "domain": "maintenance|sécurité|performance|procédure|formation",
      "pattern": "situation détectée",
      "instruction": "conseil technique précis",
      "confidence": 0.85
    }
  ],
  "summary": "Résumé concis de la distillation"
}`;

    const response = await callOllama(userPrompt, {
      model: 'phi:2.7b',
      temperature: 0.3,
      maxTokens: 1000,
      timeout: 30000
    });
    
    const elapsedTime = Date.now() - startTime;
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Aucun JSON trouvé dans la réponse');
    }
    
    const data = JSON.parse(jsonMatch[0]);
    
    const rules: DistilledRule[] = (data.rules || []).slice(0, MAX_RULES_PER_DISTILLATION).map((r: Record<string, any>) => ({
      id: generateRuleId(),
      domain: r.domain || 'Général',
      pattern: r.pattern || 'Pattern inconnu',
      instruction: r.instruction,
      confidence: Math.min(0.95, r.confidence || 0.7),
      timestamp: Date.now(),
      usageCount: 0,
      tags: [r.domain || 'general']
    }));
    
    const summary = data.summary || `Distillation terminée : ${rules.length} règles extraites.`;
    const compressionRatio = episodes.length / (rules.length || 1);
    
    await updateDistillationStats(true, elapsedTime, rules.length, compressionRatio);
    
    // Sauvegarder les règles en SQLite
    const dbInstance = db.getDB();
    for (const rule of rules) {
      dbInstance.prepare(`
        INSERT OR REPLACE INTO learning_rules (id, domain, pattern, instruction, confidence, timestamp, usageCount, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(rule.id, rule.domain, rule.pattern, rule.instruction, rule.confidence, rule.timestamp, rule.usageCount || 0, JSON.stringify(rule.tags || []));
    }
    
    distillationLogger.success('DISTILL', `✅ Distillation terminée en ${formatDuration(elapsedTime)} - ${rules.length} règles, compression ${compressionRatio.toFixed(1)}:1`);
    
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      distillationLogger.metric('DISTILL', `Règle ${i + 1}`, `${rule.domain} (conf: ${Math.round(rule.confidence * 100)}%)`);
      distillationLogger.info('DISTILL', `   Pattern: ${rule.pattern}`);
      distillationLogger.info('DISTILL', `   Instruction: ${rule.instruction.substring(0, 80)}...`);
    }
    
    return {
      rules,
      summary,
      compressionRatio,
      processingTime: elapsedTime,
      episodesAnalyzed: episodes.length
    };
    
  } catch (error: unknown) {
    const err = error as Error;
    const elapsedTime = Date.now() - startTime;
    await updateDistillationStats(false, elapsedTime, 0, 1);
    distillationLogger.error('DISTILL', `❌ Échec distillation après ${formatDuration(elapsedTime)}`, { error: err.message });
    
    return {
      rules: [],
      summary: "Échec du processus de distillation.",
      compressionRatio: 1,
      processingTime: elapsedTime,
      episodesAnalyzed: episodes.length
    };
  }
}

export async function getApplicableRules(query: string): Promise<string> {
  await ensureInitialized();
  
  const startTime = Date.now();
  const q = query.toLowerCase();
  
  const dbInstance = db.getDB();
  const rulesRows = dbInstance.prepare(`SELECT * FROM learning_rules ORDER BY confidence DESC`).all() as Record<string, any>[];
  const rules = rulesRows.map(toDistilledRule);
  
  distillationLogger.info('APPLY', `🔍 Recherche de règles applicables pour: "${query.substring(0, 50)}..." - ${rules.length} règles disponibles`);
  
  const applicable = rules.filter(r => {
    const domainMatch = r.domain && q.includes(r.domain.toLowerCase());
    const patternMatch = r.pattern && q.includes(r.pattern.toLowerCase());
    const contentMatch = r.instruction && q.includes(r.instruction.toLowerCase().substring(0, 30));
    return domainMatch || patternMatch || contentMatch;
  });
  
  distillationLogger.metric('APPLY', 'Règles applicables', applicable.length);
  
  if (applicable.length === 0) {
    distillationLogger.info('APPLY', 'Aucune règle applicable trouvée');
    return "";
  }
  
  // Incrémenter les compteurs d'utilisation
  for (const rule of applicable) {
    dbInstance.prepare(`UPDATE learning_rules SET usageCount = usageCount + 1 WHERE id = ?`).run(rule.id);
  }
  
  let output = `\n[CONNAISSANCES DISTILLÉES (INNOVATION 28)] : \n`;
  
  for (const rule of applicable) {
    const confidenceEmoji = rule.confidence > 0.8 ? '🔴' : rule.confidence > 0.6 ? '🟠' : '🟡';
    output += `${confidenceEmoji} **${rule.domain}** : ${rule.instruction}\n`;
  }
  
  const elapsedTime = Date.now() - startTime;
  distillationLogger.success('APPLY', `${applicable.length} règles appliquées en ${formatDuration(elapsedTime)}`);
  
  return output;
}

export async function getAllRules(): Promise<DistilledRule[]> {
  await ensureInitialized();
  const dbInstance = db.getDB();
  const rows = dbInstance.prepare(`SELECT * FROM learning_rules ORDER BY confidence DESC`).all() as Record<string, any>[];
  return rows.map(toDistilledRule);
}

export async function getRulesByDomain(domain: string): Promise<DistilledRule[]> {
  await ensureInitialized();
  const dbInstance = db.getDB();
  const rows = dbInstance.prepare(`SELECT * FROM learning_rules WHERE domain = ? ORDER BY confidence DESC`).all(domain) as Record<string, any>[];
  return rows.map(toDistilledRule);
}

export async function deleteRule(id: string): Promise<boolean> {
  await ensureInitialized();
  const dbInstance = db.getDB();
  const result = dbInstance.prepare(`DELETE FROM learning_rules WHERE id = ?`).run(id);
  return result.changes > 0;
}

export async function clearAllRules(): Promise<void> {
  await ensureInitialized();
  const dbInstance = db.getDB();
  dbInstance.prepare(`DELETE FROM learning_rules`).run();
  distillationLogger.success('CLEAR', 'Toutes les règles ont été supprimées');
}

export async function getDistillationStats(): Promise<{
  totalDistillations: number;
  successfulDistillations: number;
  failedDistillations: number;
  successRate: number;
  totalRulesExtracted: number;
  avgRulesPerDistillation: number;
  avgCompressionRatio: number;
  avgProcessingTime: number;
  domainDistribution: Record<string, number>;
  lastDistillationTime: number | null;
  lastDistillationDuration: number | null;
}> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  
  // Compter les règles par domaine
  const domainRows = dbInstance.prepare(`SELECT domain, COUNT(*) as count FROM learning_rules GROUP BY domain`).all() as Record<string, any>[];
  const domainDistribution: Record<string, number> = {};
  for (const row of domainRows) {
    domainDistribution[row.domain] = row.count;
  }
  
  // Récupérer les métriques depuis la table metrics
  const distillations = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'knowledge_distillation' AND metricName = 'distillation'
  `).all() as { metricValue: number; timestamp: number }[];
  
  const durations = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'knowledge_distillation' AND metricName = 'distillation_duration'
  `).all() as { metricValue: number; timestamp: number }[];
  
  const rulesExtracted = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'knowledge_distillation' AND metricName = 'rules_extracted'
  `).all() as { metricValue: number; timestamp: number }[];
  
  const compressionRatios = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'knowledge_distillation' AND metricName = 'compression_ratio'
  `).all() as { metricValue: number; timestamp: number }[];
  
  const totalDistillations = distillations.length;
  const successfulDistillations = distillations.filter((m: { metricValue: number }) => m.metricValue === 1).length;
  const failedDistillations = totalDistillations - successfulDistillations;
  const successRate = totalDistillations > 0 ? successfulDistillations / totalDistillations : 0;
  
  const totalRulesExtracted = rulesExtracted.reduce((sum: number, m: { metricValue: number }) => sum + m.metricValue, 0);
  const avgRulesPerDistillation = totalDistillations > 0 ? totalRulesExtracted / totalDistillations : 0;
  
  const avgCompressionRatio = compressionRatios.length > 0
    ? compressionRatios.reduce((sum: number, m: { metricValue: number }) => sum + m.metricValue, 0) / compressionRatios.length
    : 0;
  
  const avgProcessingTime = durations.length > 0
    ? durations.reduce((sum: number, m: { metricValue: number }) => sum + m.metricValue, 0) / durations.length
    : 0;
  
  const lastDistillation = distillations[distillations.length - 1];
  const lastDistillationTime = lastDistillation?.timestamp || null;
  const lastDistillationDuration = durations[durations.length - 1]?.metricValue || null;
  
  return {
    totalDistillations,
    successfulDistillations,
    failedDistillations,
    successRate: Math.round(successRate * 100) / 100,
    totalRulesExtracted,
    avgRulesPerDistillation: Math.round(avgRulesPerDistillation * 100) / 100,
    avgCompressionRatio: Math.round(avgCompressionRatio * 100) / 100,
    avgProcessingTime: Math.round(avgProcessingTime),
    domainDistribution,
    lastDistillationTime,
    lastDistillationDuration
  };
}

export default {
  distillInteractions,
  getApplicableRules,
  getAllRules,
  getRulesByDomain,
  deleteRule,
  clearAllRules,
  getDistillationStats
};