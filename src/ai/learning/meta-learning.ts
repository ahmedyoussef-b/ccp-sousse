/**
 * @fileOverview MetaLearning - Innovation 31.
 * L'IA apprend à optimiser son propre processus d'apprentissage.
 * Version corrigée avec Core SQLite - Persistance définitive.
 * 
 * @version 4.0.0
 * @lastUpdated 2026-04-24
 */

import { metaLogger } from './utils/logger';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// INTERFACES
// ============================================================================

export interface TaskFeatures {
  complexity: number;
  novelty: number;
  type: 'analytical' | 'creative' | 'practical';
  dependencies: number;
  ambiguity: number;
  queryLength: number;
  contextLength: number;
}

export interface LearningStrategy {
  id: string;
  name: string;
  applicability: string[];
  confidence: number;
  metaParameters: Record<string, any>;
  description?: string;
}

export interface PerformanceMetrics {
  strategyId: string;
  success: boolean;
  quality: number;
  timeSpent: number;
  timestamp: number;
  query?: string;
  confidence?: number;
}

export interface LearningCurveResult {
  slope: number;
  status: string;
  successRate: number;
  totalAttempts: number;
  recentSuccessRate: number;
  trend: 'improving' | 'stable' | 'declining';
}

export interface StrategyStats {
  totalUsage: number;
  successCount: number;
  successRate: number;
  avgQuality: number;
  avgTimeSpent: number;
  lastUsed: number | null;
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

function getComplexityScore(query: string, context: string): number {
  let score = 0;
  score += Math.min(query.length / 300, 0.5);
  score += Math.min(context.length / 3000, 0.3);
  if (query.match(/et|ou|si|alors|parce que|donc/g)) score += 0.2;
  return Math.min(score, 1.0);
}

function getNoveltyScore(query: string, complexity: number): number {
  const noveltyKeywords = ['nouveau', 'inconnu', 'jamais', 'appliquer', 'découvrir', 'innover', 'changer', 'explorer', 'expérimenter'];
  const noveltyCount = noveltyKeywords.filter(w => query.toLowerCase().includes(w)).length;
  let score = Math.min(noveltyCount * 0.2, 0.6);
  if (complexity > 0.7) score += 0.2;
  return Math.min(score, 1.0);
}

function getDependenciesScore(query: string): number {
  const depKeywords = ['et', 'ensuite', 'puis', 'après', 'conséquence', 'donc', 'alors', 'par conséquent'];
  return depKeywords.filter(w => query.toLowerCase().includes(w)).length;
}

function getAmbiguityScore(query: string): number {
  if (query.length < 40) return 0.8;
  if (query.includes('?') && query.length < 60) return 0.6;
  return 0.2;
}

function getTaskType(query: string): 'analytical' | 'creative' | 'practical' {
  const q = query.toLowerCase();
  if (q.match(/crée|imaginer|inventer|rédiger|synthèse|résumer|générer|proposer/i)) return 'creative';
  if (q.match(/comment|faire|étape|procédure|réparer|tester|mesurer|installer|configurer/i)) return 'practical';
  return 'analytical';
}

// ============================================================================
// STRATÉGIES PRÉDÉFINIES
// ============================================================================

const STRATEGIES: LearningStrategy[] = [
  {
    id: 'transfer_learning',
    name: 'Transfert Cross-Domaine',
    applicability: ['innovation', 'nouveaux_concepts'],
    confidence: 0.92,
    metaParameters: { abstractionLevel: 'high', dynamicMapping: true },
    description: 'Utilise des analogies et transferts de connaissances depuis d\'autres domaines'
  },
  {
    id: 'hierarchical_decomposition',
    name: 'Décomposition Hiérarchique',
    applicability: ['problèmes_complexes', 'multi-étapes'],
    confidence: 0.88,
    metaParameters: { maxDepth: 3, validationCheck: true },
    description: 'Décompose le problème en sous-objectifs atomiques'
  },
  {
    id: 'knowledge_distillation',
    name: 'Distillation Créative',
    applicability: ['synthèse', 'résumé', 'rédaction'],
    confidence: 0.95,
    metaParameters: { compressionRatio: 0.4 },
    description: 'Synthétise l\'information pour ne garder que les points critiques'
  },
  {
    id: 'exploratory_learning',
    name: 'Apprentissage Exploratoire',
    applicability: ['questions_ouvertes', 'exploration'],
    confidence: 0.85,
    metaParameters: { explorationRate: 0.3, breadthFirst: true },
    description: 'Explore plusieurs pistes avant de synthétiser'
  },
  {
    id: 'pattern_recognition',
    name: 'Reconnaissance de Motifs',
    applicability: ['routine', 'données_connues', 'précision'],
    confidence: 0.98,
    metaParameters: { threshold: 0.85 },
    description: 'Utilise les motifs techniques identifiés dans les interactions passées'
  }
];

// ============================================================================
// EXTRACTION DES CARACTÉRISTIQUES
// ============================================================================

export async function extractTaskFeatures(query: string, context: string): Promise<TaskFeatures> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  metaLogger.info('EXTRACT', `🔍 Extraction des caractéristiques de la tâche - Requête: "${query.substring(0, 50)}...", Contexte: ${context.length} caractères`);
  
  const complexity = getComplexityScore(query, context);
  const novelty = getNoveltyScore(query, complexity);
  const type = getTaskType(query);
  const dependencies = getDependenciesScore(query);
  const ambiguity = getAmbiguityScore(query);
  
  const features: TaskFeatures = {
    complexity,
    novelty,
    type,
    dependencies,
    ambiguity,
    queryLength: query.length,
    contextLength: context.length
  };
  
  await db.recordMetric('meta_learning', 'feature_extraction', 1);
  
  const elapsedTime = Date.now() - startTime;
  metaLogger.success('EXTRACT', `Caractéristiques extraites en ${formatDuration(elapsedTime)} - Complexité: ${Math.round(complexity * 100)}%, Nouveauté: ${Math.round(novelty * 100)}%, Type: ${type}`);
  
  return features;
}

export async function selectOptimalStrategy(features: TaskFeatures): Promise<LearningStrategy> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  metaLogger.info('SELECT', `🎯 Sélection de la stratégie optimale - Complexité: ${Math.round(features.complexity * 100)}%, Nouveauté: ${Math.round(features.novelty * 100)}%, Type: ${features.type}`);
  
  let strategy: LearningStrategy;
  
  if (features.novelty > 0.6 && features.type === 'analytical') {
    strategy = STRATEGIES.find(s => s.id === 'transfer_learning')!;
    metaLogger.info('SELECT', 'Stratégie choisie: Transfert Cross-Domaine (haute nouveauté)');
  } else if (features.complexity > 0.7 || features.dependencies > 3) {
    strategy = STRATEGIES.find(s => s.id === 'hierarchical_decomposition')!;
    metaLogger.info('SELECT', 'Stratégie choisie: Décomposition Hiérarchique (haute complexité)');
  } else if (features.type === 'creative') {
    strategy = STRATEGIES.find(s => s.id === 'knowledge_distillation')!;
    metaLogger.info('SELECT', 'Stratégie choisie: Distillation Créative (tâche créative)');
  } else if (features.ambiguity > 0.6) {
    strategy = STRATEGIES.find(s => s.id === 'exploratory_learning')!;
    metaLogger.info('SELECT', 'Stratégie choisie: Apprentissage Exploratoire (haute ambiguïté)');
  } else {
    strategy = STRATEGIES.find(s => s.id === 'pattern_recognition')!;
    metaLogger.info('SELECT', 'Stratégie choisie: Reconnaissance de Motifs (par défaut)');
  }
  
  await db.recordMetric('meta_learning', 'strategy_selected', 1);
  await db.recordMetric('meta_learning', `strategy_${strategy.id}`, 1);
  
  const elapsedTime = Date.now() - startTime;
  metaLogger.success('SELECT', `Stratégie sélectionnée en ${formatDuration(elapsedTime)} - ${strategy.name} (conf: ${Math.round(strategy.confidence * 100)}%)`);
  
  return strategy;
}

export async function getMetaLearningDirective(strategy: LearningStrategy): Promise<string> {
  const startTime = Date.now();
  
  metaLogger.info('DIRECTIVE', `📋 Génération de directive pour stratégie: ${strategy.name}`);
  
  const base = `\n[MÉTA-APPRENTISSAGE (INNOVATION 31)] : Stratégie activée "${strategy.name}". `;
  
  let directive: string;
  
  switch (strategy.id) {
    case 'transfer_learning':
      directive = base + "Focalise-toi sur l'essence abstraite du concept et cherche des analogies dans d'autres domaines techniques pour enrichir la réponse.";
      break;
    case 'hierarchical_decomposition':
      directive = base + "Décompose rigoureusement la réponse en sous-objectifs atomiques et valide chaque étape avant de passer à la suivante.";
      break;
    case 'knowledge_distillation':
      directive = base + "Synthétise l'information pour ne garder que les points critiques. Évite les répétitions et structure la réponse pour une mémorisation rapide.";
      break;
    case 'exploratory_learning':
      directive = base + "Explore plusieurs perspectives avant de synthétiser. Présente différentes approches possibles puis recommande la plus adaptée.";
      break;
    default:
      directive = base + "Utilise les motifs techniques identifiés dans les interactions passées pour garantir une précision maximale.";
  }
  
  const elapsedTime = Date.now() - startTime;
  metaLogger.success('DIRECTIVE', `Directive générée en ${formatDuration(elapsedTime)} - ${directive.length} caractères`);
  
  return directive;
}

export async function getLearningCurve(strategyId?: string): Promise<LearningCurveResult> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  metaLogger.info('CURVE', `📊 Analyse de la courbe d'apprentissage${strategyId ? ` pour ${strategyId}` : ''}`);
  
  const dbInstance = db.getDB();
  
  let performances: Array<{ success: number; timestamp: number; [key: string]: unknown }> = [];
  if (strategyId) {
    performances = dbInstance.prepare(`
      SELECT * FROM learning_performance_history 
      WHERE strategyId = ? 
      ORDER BY timestamp DESC LIMIT 20
    `).all(strategyId) as Array<{ success: number; timestamp: number; [key: string]: unknown }>;
  } else {
    performances = dbInstance.prepare(`
      SELECT * FROM learning_performance_history 
      ORDER BY timestamp DESC LIMIT 20
    `).all() as Array<{ success: number; timestamp: number; [key: string]: unknown }>;
  }
  
  if (performances.length < 5) {
    metaLogger.info('CURVE', 'Historique insuffisant (moins de 5 performances)');
    return {
      slope: 0,
      status: 'Initialisation de l\'IA',
      successRate: 0,
      totalAttempts: performances.length,
      recentSuccessRate: 0,
      trend: 'stable'
    };
  }
  
  const recent = performances.slice(0, 10);
  const totalSuccess = recent.filter((p: { success: number }) => p.success === 1).length;
  const successRate = totalSuccess / recent.length;
  
  const recent5 = performances.slice(0, 5);
  const previous5 = performances.slice(5, 10);
  const recentSuccessRate = recent5.filter((p: { success: number }) => p.success === 1).length / 5;
  const previousSuccessRate = previous5.length > 0 ? previous5.filter((p: { success: number }) => p.success === 1).length / previous5.length : recentSuccessRate;
  
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (recentSuccessRate > previousSuccessRate + 0.1) trend = 'improving';
  else if (recentSuccessRate < previousSuccessRate - 0.1) trend = 'declining';
  
  let status = 'En progression';
  if (successRate > 0.9) status = 'Méta-Optimisé';
  else if (successRate > 0.7) status = 'Performance stable';
  else if (successRate > 0.5) status = 'En apprentissage';
  else if (successRate > 0.3) status = 'Phase de Réajustement';
  else status = 'Nécessite optimisation';
  
  const result: LearningCurveResult = {
    slope: successRate,
    status,
    successRate: Math.round(successRate * 100) / 100,
    totalAttempts: performances.length,
    recentSuccessRate: Math.round(recentSuccessRate * 100) / 100,
    trend
  };
  
  const elapsedTime = Date.now() - startTime;
  metaLogger.success('CURVE', `Analyse terminée en ${formatDuration(elapsedTime)} - Status: ${status}, Tendance: ${trend}, Taux succès: ${Math.round(successRate * 100)}%`);
  
  return result;
}

export async function recordStrategyPerformance(metrics: PerformanceMetrics): Promise<void> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  
  dbInstance.prepare(`
    INSERT INTO learning_performance_history (timestamp, strategyId, success, quality, timeSpent, confidence, query)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(metrics.timestamp, metrics.strategyId, metrics.success ? 1 : 0, metrics.quality, metrics.timeSpent, metrics.confidence || null, metrics.query || null);
  
  await db.recordMetric('meta_learning', 'performance_recorded', 1);
  await db.recordMetric('meta_learning', `strategy_${metrics.strategyId}_${metrics.success ? 'success' : 'failure'}`, 1);
  
  metaLogger.info('PERFORMANCE', `Stratégie ${metrics.strategyId} enregistrée - Succès: ${metrics.success}, Qualité: ${Math.round(metrics.quality * 100)}%, Temps: ${formatDuration(metrics.timeSpent)}`);
}

export async function getStrategyStats(strategyId: string): Promise<StrategyStats> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  
  const stats = dbInstance.prepare(`
    SELECT 
      COUNT(*) as totalUsage,
      SUM(success) as successCount,
      AVG(quality) as avgQuality,
      AVG(timeSpent) as avgTimeSpent,
      MAX(timestamp) as lastUsed
    FROM learning_performance_history 
    WHERE strategyId = ?
  `).get(strategyId) as any;
  
  const totalUsage = stats?.totalUsage || 0;
  const successCount = stats?.successCount || 0;
  
  return {
    totalUsage,
    successCount,
    successRate: totalUsage > 0 ? successCount / totalUsage : 0,
    avgQuality: stats?.avgQuality || 0,
    avgTimeSpent: stats?.avgTimeSpent || 0,
    lastUsed: stats?.lastUsed || null
  };
}

export async function getAllStrategiesStats(): Promise<Record<string, StrategyStats>> {
  await ensureInitialized();
  
  const stats: Record<string, StrategyStats> = {};
  
  for (const strategy of STRATEGIES) {
    stats[strategy.id] = await getStrategyStats(strategy.id);
  }
  
  return stats;
}

export async function resetMetaLearningStats(): Promise<void> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  dbInstance.prepare(`DELETE FROM learning_performance_history`).run();
  
  metaLogger.success('STATS', 'Statistiques de méta-apprentissage réinitialisées');
}

export function getAvailableStrategies(): LearningStrategy[] {
  return [...STRATEGIES];
}

export default {
  extractTaskFeatures,
  selectOptimalStrategy,
  getMetaLearningDirective,
  getLearningCurve,
  recordStrategyPerformance,
  getStrategyStats,
  getAllStrategiesStats,
  resetMetaLearningStats,
  getAvailableStrategies
};