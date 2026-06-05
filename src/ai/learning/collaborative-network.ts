/**
 * @fileOverview CollaborativeLearningNetwork - Innovation 32.
 * Permet le partage de connaissances anonymisées entre instances pour une intelligence collective.
 * Version corrigée avec Core SQLite - Persistance définitive.
 * 
 * @version 4.0.0
 * @lastUpdated 2026-04-24
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { DistilledRule } from './knowledge-distillation';
import { detectCommunityPatterns, formatCommunityContext, type CommunityPattern } from './cross-user-learning';
import { collaborativeLogger } from './utils/logger';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// INTERFACES
// ============================================================================

export interface SharedInsight {
  id: string;
  instanceId: string;
  domain: string;
  pattern: string;
  instruction: string;
  confidence: number;
  timestamp: number;
  originalRule?: string;
}

export interface NetworkStats {
  totalInsights: number;
  totalPatterns: number;
  lastShareTime: number | null;
  lastPatternDetectionTime: number | null;
  topDomains: Record<string, number>;
  avgConfidence: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const PATTERN_DETECTION_INTERVAL = 5;

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

function generateInsightId(): string {
  return `insight_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

async function updateShareStats(success: boolean, domain: string, confidence: number): Promise<void> {
  await ensureInitialized();
  await db.recordMetric('collaborative_network', 'share', success ? 1 : 0);
  await db.recordMetric('collaborative_network', `share_domain_${domain}`, 1);
  await db.recordMetric('collaborative_network', 'share_confidence', confidence);
}

async function updatePatternStats(patternsCount: number): Promise<void> {
  await ensureInitialized();
  await db.recordMetric('collaborative_network', 'pattern_detection', 1);
  await db.recordMetric('collaborative_network', 'patterns_detected', patternsCount);
}

// Helper pour convertir les résultats SQLite en SharedInsight
function toSharedInsight(row: Record<string, any>): SharedInsight {
  return {
    id: row.id,
    instanceId: row.instanceId,
    domain: row.domain,
    pattern: row.pattern,
    instruction: row.instruction,
    confidence: row.confidence,
    timestamp: row.timestamp,
    originalRule: row.originalRule
  };
}

// Helper pour convertir en CommunityPattern
function toCommunityPattern(row: Record<string, any>): CommunityPattern {
  return {
    id: row.id,
    description: row.description,
    domain: row.domain,
    confidence: row.confidence,
    usageCount: row.usageCount || 1,
    applicability: row.applicability || 'Usage général',
    timestamp: row.timestamp,
    tags: row.tags ? JSON.parse(row.tags) : []
  };
}

// ============================================================================
// FONCTIONS PRINCIPALES
// ============================================================================

export async function shareKnowledge(instanceId: string, rule: DistilledRule): Promise<boolean> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  collaborativeLogger.info('SHARE', `📤 Partage de connaissance depuis l'instance: ${instanceId}, Domaine: ${rule.domain}, Confiance: ${Math.round(rule.confidence * 100)}%`);
  
  try {
    collaborativeLogger.info('ANONYM', '🔒 Anonymisation de la règle...');
    
    const anonymizationPrompt = `Tu es un Expert en Anonymisation. Récris la règle technique de manière universelle sans aucune donnée nominative ou spécifique.
    
Règle originale: "${rule.instruction}"
Domaine: "${rule.domain}"

Réponds UNIQUEMENT avec la version anonymisée de la règle, sans texte supplémentaire.`;
    
    let anonymizedInstruction: string;
    
    try {
      const response = await callOllama(anonymizationPrompt, {
        model: 'tinyllama:1.1b',
        temperature: 0.3,
        maxTokens: 200,
        timeout: 10000
      });
      
      anonymizedInstruction = response.trim();
      collaborativeLogger.info('ANONYM', `Anonymisation réussie: "${anonymizedInstruction.substring(0, 50)}..."`);
      
    } catch (error: unknown) {
      const err = error as Error;
      collaborativeLogger.warning('ANONYM', `Échec anonymisation, utilisation de la règle originale: ${err.message}`);
      anonymizedInstruction = rule.instruction;
    }
    
    const insight: SharedInsight = {
      id: generateInsightId(),
      instanceId,
      domain: rule.domain,
      pattern: rule.pattern || 'general',
      instruction: anonymizedInstruction,
      confidence: rule.confidence,
      timestamp: Date.now(),
      originalRule: rule.instruction !== anonymizedInstruction ? rule.instruction : undefined
    };
    
    // Sauvegarde directe en SQLite via db.learning.saveInsight
    const dbInstance = db.getDB();
    dbInstance.prepare(`
      INSERT OR REPLACE INTO learning_insights (id, instanceId, domain, pattern, instruction, confidence, timestamp, originalRule)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(insight.id, insight.instanceId, insight.domain, insight.pattern, insight.instruction, insight.confidence, insight.timestamp, insight.originalRule || null);
    
    await updateShareStats(true, rule.domain, rule.confidence);
    
    const elapsedTime = Date.now() - startTime;
    
    // Compter les insights
    const countResult = dbInstance.prepare(`SELECT COUNT(*) as count FROM learning_insights`).get() as { count: number };
    const totalInsights = countResult?.count || 0;
    
    collaborativeLogger.success('SHARE', `✅ Connaissance partagée en ${formatDuration(elapsedTime)} - Pool: ${totalInsights} insights`);
    
    // Déclenchement périodique de la détection de patterns
    if (totalInsights % PATTERN_DETECTION_INTERVAL === 0 && totalInsights > 0) {
      collaborativeLogger.info('PATTERN', `🔄 Déclenchement de la détection de patterns (${totalInsights} insights)`);
      
      try {
        const insightsRows = dbInstance.prepare(`SELECT * FROM learning_insights ORDER BY timestamp DESC LIMIT 10`).all() as Record<string, any>[];
        const recentInsights = insightsRows.map(toSharedInsight);
        
        const newPatterns = await detectCommunityPatterns(recentInsights);
        
        if (newPatterns.length > 0) {
          for (const pattern of newPatterns) {
            dbInstance.prepare(`
              INSERT OR REPLACE INTO learning_patterns (id, description, domain, confidence, usageCount, applicability, timestamp, tags)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(pattern.id, pattern.description, pattern.domain, pattern.confidence, pattern.usageCount || 1, pattern.applicability || 'Usage général', pattern.timestamp || Date.now(), JSON.stringify(pattern.tags || []));
          }
          await updatePatternStats(newPatterns.length);
          collaborativeLogger.success('PATTERN', `${newPatterns.length} nouveaux patterns communautaires détectés`);
        } else {
          collaborativeLogger.info('PATTERN', 'Aucun nouveau pattern détecté');
        }
      } catch (error: unknown) {
        const err = error as Error;
        collaborativeLogger.warning('PATTERN', `Échec détection de patterns: ${err.message}`);
      }
    }
    
    return true;
    
  } catch (error: unknown) {
    const err = error as Error;
    const elapsedTime = Date.now() - startTime;
    await updateShareStats(false, rule.domain, rule.confidence);
    collaborativeLogger.error('SHARE', `❌ Échec partage après ${formatDuration(elapsedTime)}`, { error: err.message });
    
    return false;
  }
}

export async function learnFromNetwork(query: string): Promise<string> {
  await ensureInitialized();
  
  const startTime = Date.now();
  const q = query.toLowerCase();
  let result = "";
  
  const dbInstance = db.getDB();
  
  const insightsRows = dbInstance.prepare(`SELECT * FROM learning_insights ORDER BY timestamp DESC`).all() as Record<string, any>[];
  const patternsRows = dbInstance.prepare(`SELECT * FROM learning_patterns ORDER BY confidence DESC`).all() as Record<string, any>[];
  
  const allInsights = insightsRows.map(toSharedInsight);
  const allPatterns = patternsRows.map(toCommunityPattern);
  
  collaborativeLogger.info('LEARN', `🔍 Recherche de connaissances réseau pour: "${query.substring(0, 50)}..."`);
  collaborativeLogger.metric('LEARN', 'Insights', allInsights.length);
  collaborativeLogger.metric('LEARN', 'Patterns', allPatterns.length);
  
  const relevantInsights = allInsights
    .filter(insight => q.includes(insight.domain.toLowerCase()) || insight.instruction.toLowerCase().includes(q))
    .slice(0, 2);
  
  if (relevantInsights.length > 0) {
    collaborativeLogger.metric('LEARN', 'Insights pertinents', relevantInsights.length);
    
    for (const insight of relevantInsights) {
      result += `\n[RECOMMANDATION RÉSEAU] : ${insight.instruction}`;
      collaborativeLogger.info('LEARN', `Insight trouvé (confiance: ${Math.round(insight.confidence * 100)}%)`);
    }
  }
  
  const relevantPatterns = allPatterns
    .filter(p => q.includes(p.domain.toLowerCase()) || p.description.toLowerCase().includes(q))
    .slice(0, 2);
  
  if (relevantPatterns.length > 0) {
    collaborativeLogger.metric('LEARN', 'Patterns pertinents', relevantPatterns.length);
    
    try {
      const formattedPatterns = await formatCommunityContext(relevantPatterns);
      result += formattedPatterns;
      collaborativeLogger.success('LEARN', `${relevantPatterns.length} patterns communautaires ajoutés`);
    } catch (error: unknown) {
      const err = error as Error;
      collaborativeLogger.warning('NETWORK', `Erreur envoi broadcast: ${err.message}`);
      result += `\n[PATTERNS COMMUNAUTAIRES] : ${relevantPatterns.map(p => p.description).join('; ')}`;
    }
  }
  
  const elapsedTime = Date.now() - startTime;
  
  if (result.length > 0) {
    collaborativeLogger.success('LEARN', `Réseau consulté en ${formatDuration(elapsedTime)} - ${relevantInsights.length} insights, ${relevantPatterns.length} patterns`);
  } else {
    collaborativeLogger.info('LEARN', `Aucune connaissance réseau trouvée (${formatDuration(elapsedTime)})`);
  }
  
  return result;
}

export async function getNetworkStats(): Promise<NetworkStats> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  
  const insightsRows = dbInstance.prepare(`SELECT * FROM learning_insights`).all() as Record<string, any>[];
  const patternsRows = dbInstance.prepare(`SELECT * FROM learning_patterns`).all() as Record<string, any>[];
  
  const allInsights = insightsRows.map(toSharedInsight);
  const allPatterns = patternsRows.map(toCommunityPattern);
  
  const topDomains: Record<string, number> = {};
  let totalConfidence = 0;
  
  for (const insight of allInsights) {
    topDomains[insight.domain] = (topDomains[insight.domain] || 0) + 1;
    totalConfidence += insight.confidence;
  }
  
  const avgConfidence = allInsights.length > 0 ? totalConfidence / allInsights.length : 0;
  
  const lastShareTime = allInsights.length > 0 ? allInsights[allInsights.length - 1]?.timestamp || null : null;
  const lastPatternDetectionTime = allPatterns.length > 0 ? allPatterns[allPatterns.length - 1]?.timestamp || null : null;
  
  return {
    totalInsights: allInsights.length,
    totalPatterns: allPatterns.length,
    lastShareTime,
    lastPatternDetectionTime,
    topDomains,
    avgConfidence: Math.round(avgConfidence * 100) / 100
  };
}

export async function getAllInsights(): Promise<SharedInsight[]> {
  await ensureInitialized();
  const dbInstance = db.getDB();
  const rows = dbInstance.prepare(`SELECT * FROM learning_insights ORDER BY timestamp DESC`).all() as Record<string, any>[];
  return rows.map(toSharedInsight);
}

export async function getAllPatterns(): Promise<CommunityPattern[]> {
  await ensureInitialized();
  const dbInstance = db.getDB();
  const rows = dbInstance.prepare(`SELECT * FROM learning_patterns ORDER BY confidence DESC`).all() as Record<string, any>[];
  return rows.map(toCommunityPattern);
}

export async function resetNetwork(): Promise<void> {
  await ensureInitialized();
  const dbInstance = db.getDB();
  dbInstance.prepare(`DELETE FROM learning_insights`).run();
  dbInstance.prepare(`DELETE FROM learning_patterns`).run();
  collaborativeLogger.success('RESET', 'Réseau collaboratif réinitialisé');
}

export default {
  shareKnowledge,
  learnFromNetwork,
  getNetworkStats,
  getAllInsights,
  getAllPatterns,
  resetNetwork
};