/**
 * @fileOverview CrossUserLearning - Innovation 32.2.
 * Apprentissage des patterns communs entre utilisateurs via clustering anonymisé.
 * Version corrigée avec Core SQLite - Persistance définitive.
 * 
 * @version 4.0.0
 * @lastUpdated 2026-04-24
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { crossUserLogger } from './utils/logger';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// INTERFACES
// ============================================================================

export interface CommunityPattern {
  id: string;
  description: string;
  domain: string;
  confidence: number;
  usageCount: number;
  applicability: string;
  timestamp?: number;
  tags?: string[];
}

export interface DetectionResult {
  patterns: CommunityPattern[];
  processingTime: number;
  insightsAnalyzed: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const MIN_INSIGHTS_FOR_DETECTION = 3;

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

function generatePatternId(): string {
  return `cp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function generateTags(description: string, domain: string): string[] {
  const tags: string[] = [domain];
  const lowerDesc = description.toLowerCase();
  
  const keywordMap: Record<string, string[]> = {
    'maintenance': ['maintenance', 'entretien', 'réparation'],
    'sécurité': ['sécurité', 'safety', 'danger', 'risque'],
    'performance': ['performance', 'rendement', 'efficacité'],
    'procédure': ['procédure', 'étape', 'guide'],
    'urgence': ['urgence', 'incident', 'alarme'],
    'formation': ['formation', 'apprentissage', 'guide']
  };
  
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(k => lowerDesc.includes(k))) {
      tags.push(category);
    }
  }
  
  return [...new Set(tags)];
}

async function updateDetectionStats(
  success: boolean,
  processingTime: number,
  patternsCount: number,
  domains: string[]
): Promise<void> {
  await ensureInitialized();
  await db.recordMetric('cross_user_learning', 'detection', success ? 1 : 0);
  await db.recordMetric('cross_user_learning', 'detection_duration', processingTime);
  await db.recordMetric('cross_user_learning', 'patterns_detected', patternsCount);
  
  for (const domain of domains) {
    await db.recordMetric('cross_user_learning', `domain_${domain}`, 1);
  }
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
// DÉTECTION DE PATTERNS
// ============================================================================

export async function detectCommunityPatterns(allUserInsights: Record<string, any>[]): Promise<CommunityPattern[]> {
  await ensureInitialized();
  
  const startTime = Date.now();
  const patterns: CommunityPattern[] = [];
  
  crossUserLogger.info('DETECT', `🔍 Analyse de patterns sur ${allUserInsights.length} insights anonymisés...`);
  
  if (allUserInsights.length < MIN_INSIGHTS_FOR_DETECTION) {
    crossUserLogger.info('DETECT', `Insights insuffisants (${allUserInsights.length} < ${MIN_INSIGHTS_FOR_DETECTION}), détection ignorée`);
    await updateDetectionStats(true, Date.now() - startTime, 0, []);
    return patterns;
  }
  
  const insightsData = allUserInsights.map(insight => ({
    domain: insight.domain,
    pattern: insight.pattern,
    instruction: insight.instruction?.substring(0, 200),
    confidence: insight.confidence
  }));
  
  try {
    const userPrompt = `Analyse ces données utilisateurs et identifie des patterns communs:

Données: ${JSON.stringify(insightsData, null, 2)}

Format JSON STRICT:
[
  {
    "description": "Description du pattern",
    "domain": "maintenance|sécurité|performance|procédure|formation",
    "confidence": 0.85,
    "applicability": "Cas d'usage recommandé"
  }
]`;

    const response = await callOllama(userPrompt, {
      model: 'phi:2.7b',
      temperature: 0.3,
      maxTokens: 800,
      timeout: 30000
    });
    
    const elapsedTime = Date.now() - startTime;
    
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      const patternsData = Array.isArray(data) ? data : [data];
      
      for (const patternData of patternsData) {
        if (patternData.description && patternData.domain) {
          patterns.push({
            id: generatePatternId(),
            description: patternData.description,
            domain: patternData.domain,
            confidence: Math.min(0.95, patternData.confidence || 0.7),
            usageCount: allUserInsights.length,
            applicability: patternData.applicability || 'Usage général',
            timestamp: Date.now(),
            tags: generateTags(patternData.description, patternData.domain)
          });
        }
      }
    }
    
    const domains = patterns.map(p => p.domain);
    await updateDetectionStats(patterns.length > 0, elapsedTime, patterns.length, domains);
    
    if (patterns.length > 0) {
      // Sauvegarder les patterns en SQLite
      const dbInstance = db.getDB();
      for (const pattern of patterns) {
        dbInstance.prepare(`
          INSERT OR REPLACE INTO learning_patterns (id, description, domain, confidence, usageCount, applicability, timestamp, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(pattern.id, pattern.description, pattern.domain, pattern.confidence, pattern.usageCount, pattern.applicability, pattern.timestamp, JSON.stringify(pattern.tags || []));
      }
      
      crossUserLogger.success('DETECT', `${patterns.length} patterns détectés en ${formatDuration(elapsedTime)}`);
      patterns.forEach((p, i) => {
        crossUserLogger.metric('DETECT', `Pattern ${i + 1}`, `${p.domain} (conf: ${Math.round(p.confidence * 100)}%)`);
      });
    } else {
      crossUserLogger.info('DETECT', `Aucun pattern détecté en ${formatDuration(elapsedTime)}`);
    }
    
  } catch (error: unknown) {
    const err = error as Error;
    const elapsedTime = Date.now() - startTime;
    await updateDetectionStats(false, elapsedTime, 0, []);
    crossUserLogger.error('DETECT', `❌ Échec détection après ${formatDuration(elapsedTime)}`, { error: err.message });
  }
  
  return patterns;
}

export async function formatCommunityContext(patterns: CommunityPattern[]): Promise<string> {
  const startTime = Date.now();
  
  if (patterns.length === 0) {
    return "";
  }
  
  crossUserLogger.info('FORMAT', `📝 Formatage de ${patterns.length} patterns communautaires`);
  
  let output = "\n[INTELLIGENCE COLLECTIVE (INNOVATION 32.2)] : \n";
  
  for (const pattern of patterns) {
    output += `\n📊 **Pattern** (${Math.round(pattern.confidence * 100)}% confiance)\n`;
    output += `   📍 Domaine: ${pattern.domain}\n`;
    output += `   📝 ${pattern.description}\n`;
    output += `   🎯 Applicabilité: ${pattern.applicability}\n`;
    if (pattern.tags && pattern.tags.length > 0) {
      output += `   🏷️ Tags: ${pattern.tags.slice(0, 5).join(', ')}\n`;
    }
    output += `   👥 Basé sur ${pattern.usageCount} utilisateurs\n`;
  }
  
  const elapsedTime = Date.now() - startTime;
  crossUserLogger.success('FORMAT', `Patterns formatés en ${formatDuration(elapsedTime)} - ${patterns.length} patterns, ${output.length} caractères`);
  
  return output;
}

export async function aggregatePatternsByDomain(): Promise<Map<string, CommunityPattern[]>> {
  await ensureInitialized();
  
  const allPatterns = await getAllPatterns();
  const aggregated = new Map<string, CommunityPattern[]>();
  
  for (const pattern of allPatterns) {
    if (!aggregated.has(pattern.domain)) {
      aggregated.set(pattern.domain, []);
    }
    aggregated.get(pattern.domain)!.push(pattern);
  }
  
  crossUserLogger.metric('AGGREGATE', 'Domaines', aggregated.size);
  for (const [domain, domainPatterns] of aggregated.entries()) {
    crossUserLogger.metric('AGGREGATE', domain, `${domainPatterns.length} patterns`);
  }
  
  return aggregated;
}

export async function filterPatternsByConfidence(minConfidence: number = 0.6): Promise<CommunityPattern[]> {
  await ensureInitialized();
  
  const allPatterns = await getAllPatterns();
  const filtered = allPatterns.filter(p => p.confidence >= minConfidence);
  
  crossUserLogger.metric('FILTER', `Confiance ≥ ${minConfidence * 100}%`, `${filtered.length}/${allPatterns.length} patterns`);
  return filtered;
}

export async function sortPatternsByConfidence(): Promise<CommunityPattern[]> {
  await ensureInitialized();
  
  const allPatterns = await getAllPatterns();
  const sorted = [...allPatterns].sort((a, b) => b.confidence - a.confidence);
  
  if (sorted.length > 0) {
    crossUserLogger.metric('SORT', 'Meilleur pattern', `${sorted[0].domain} (${Math.round(sorted[0].confidence * 100)}%)`);
  }
  
  return sorted;
}

export async function getAllPatterns(): Promise<CommunityPattern[]> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  const rows = dbInstance.prepare(`SELECT * FROM learning_patterns ORDER BY confidence DESC`).all() as any[];
  return rows.map(toCommunityPattern);
}

export async function deletePattern(id: string): Promise<boolean> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  const result = dbInstance.prepare(`DELETE FROM learning_patterns WHERE id = ?`).run(id);
  return result.changes > 0;
}

export async function getPatternsByDomain(domain: string): Promise<CommunityPattern[]> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  const rows = dbInstance.prepare(`
    SELECT * FROM learning_patterns WHERE domain = ? ORDER BY confidence DESC
  `).all(domain) as any[];
  return rows.map(toCommunityPattern);
}

export async function incrementPatternUsage(patternId: string): Promise<void> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  dbInstance.prepare(`UPDATE learning_patterns SET usageCount = usageCount + 1 WHERE id = ?`).run(patternId);
}

export async function getCrossUserStats(): Promise<{
  totalDetections: number;
  successfulDetections: number;
  failedDetections: number;
  successRate: number;
  totalPatternsDetected: number;
  avgPatternsPerDetection: number;
  avgProcessingTime: number;
  lastDetectionTime: number | null;
  lastDetectionDuration: number | null;
  domainDistribution: Record<string, number>;
}> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  
  // Récupérer les métriques depuis la table metrics
  const detections = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'cross_user_learning' AND metricName = 'detection'
  `).all() as any[];
  
  const durations = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'cross_user_learning' AND metricName = 'detection_duration'
  `).all() as any[];
  
  const patternsDetected = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'cross_user_learning' AND metricName = 'patterns_detected'
  `).all() as any[];
  
  const domainMetrics = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'cross_user_learning' AND metricName LIKE 'domain_%'
  `).all() as any[];
  
  const totalDetections = detections.length;
  const successfulDetections = detections.filter((m: { metricValue: number }) => m.metricValue === 1).length;
  const failedDetections = totalDetections - successfulDetections;
  const successRate = totalDetections > 0 ? successfulDetections / totalDetections : 0;
  
  const totalPatternsDetected = patternsDetected.reduce((sum: number, m: { metricValue: number }) => sum + m.metricValue, 0);
  const avgPatternsPerDetection = totalDetections > 0 ? totalPatternsDetected / totalDetections : 0;
  
  const avgProcessingTime = durations.length > 0
    ? durations.reduce((sum: number, m: { metricValue: number }) => sum + m.metricValue, 0) / durations.length
    : 0;
  
  const domainDistribution: Record<string, number> = {};
  for (const metric of domainMetrics) {
    const domain = metric.metricName.replace('domain_', '');
    domainDistribution[domain] = (domainDistribution[domain] || 0) + metric.metricValue;
  }
  
  const lastDetection = detections[detections.length - 1];
  const lastDetectionTime = lastDetection?.timestamp || null;
  const lastDetectionDuration = durations[durations.length - 1]?.metricValue || null;
  
  return {
    totalDetections,
    successfulDetections,
    failedDetections,
    successRate: Math.round(successRate * 100) / 100,
    totalPatternsDetected,
    avgPatternsPerDetection: Math.round(avgPatternsPerDetection * 100) / 100,
    avgProcessingTime: Math.round(avgProcessingTime),
    lastDetectionTime,
    lastDetectionDuration,
    domainDistribution
  };
}

export async function resetCrossUserStats(): Promise<void> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  dbInstance.prepare(`DELETE FROM learning_patterns`).run();
  
  crossUserLogger.success('STATS', 'Statistiques cross-user réinitialisées');
}

export default {
  detectCommunityPatterns,
  formatCommunityContext,
  aggregatePatternsByDomain,
  filterPatternsByConfidence,
  sortPatternsByConfidence,
  getAllPatterns,
  deletePattern,
  getPatternsByDomain,
  incrementPatternUsage,
  getCrossUserStats,
  resetCrossUserStats
};