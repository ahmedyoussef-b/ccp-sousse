/**
 * @fileOverview AdaptiveCurriculum - Innovation 27.
 * Gère la progression pédagogique de l'utilisateur du simple au complexe.
 * Version corrigée avec Core SQLite - Persistance définitive.
 * 
 * @version 4.0.0
 * @lastUpdated 2026-04-24
 */

import { curriculumLogger } from './utils/logger';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// INTERFACES
// ============================================================================

export interface TopicProgress {
  topicId: string;
  mastery: number;
  interactions: number;
  lastAccessed?: number;
  tags?: string[];
}

export interface CurriculumState {
  currentLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  progress: Record<string, TopicProgress>;
  history: string[];
  lastEvaluation: number;
}

export interface EvaluationResult {
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  confidence: number;
  factors: {
    technicalTerms: number;
    queryLength: number;
    historyLength: number;
    previousConfidence: number;
  };
  processingTime: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const TECHNICAL_TERMS = [
  'pression', 'flux', 'circuit', 'étalonnage', 'vibration', 'harmonique', 
  'impédance', 'maintenance', 'hydraulique', 'disjoncteur', 'turbine', 
  'chaudière', 'compresseur', 'condenseur', 'alternateur', 'rendement',
  'débit', 'température', 'courant', 'tension', 'fréquence', 'puissance',
  'cogénération', 'cycle combiné', 'vapeur', 'gaz', 'combustion'
];

const TECHNICAL_PATTERN = new RegExp(TECHNICAL_TERMS.join('|'), 'gi');

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

function countTechnicalTerms(text: string): number {
  const matches = text.match(TECHNICAL_PATTERN);
  return matches ? matches.length : 0;
}

function getLevelEmoji(level: string): string {
  switch (level) {
    case 'BEGINNER': return '🌱';
    case 'INTERMEDIATE': return '📚';
    case 'ADVANCED': return '🎓';
    default: return '📖';
  }
}

function getLevelLabel(level: string): string {
  switch (level) {
    case 'BEGINNER': return 'Débutant';
    case 'INTERMEDIATE': return 'Intermédiaire';
    case 'ADVANCED': return 'Expert';
    default: return 'Inconnu';
  }
}

async function updateEvaluationStats(level: string, confidence: number): Promise<void> {
  await ensureInitialized();
  await db.recordMetric('curriculum', 'evaluation', 1);
  await db.recordMetric('curriculum', `level_${level}`, 1);
  await db.recordMetric('curriculum', 'evaluation_confidence', confidence);
}

async function updateSuggestionStats(topic: string): Promise<void> {
  await ensureInitialized();
  await db.recordMetric('curriculum', 'suggestion', 1);
  await db.recordMetric('curriculum', `suggestion_${topic}`, 1);
}

// ============================================================================
// ÉVALUATION DU NIVEAU
// ============================================================================

export async function evaluatePedagogicalLevel(
  query: string, 
  confidence: number, 
  historyLength: number
): Promise<EvaluationResult> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  curriculumLogger.info('EVALUATE', `🎯 Évaluation du niveau pédagogique - Requête: "${query.substring(0, 50)}...", Confiance: ${Math.round(confidence * 100)}%, Historique: ${historyLength}`);
  
  const technicalTermsCount = countTechnicalTerms(query);
  const queryLength = query.length;
  
  curriculumLogger.metric('EVALUATE', 'Termes techniques', technicalTermsCount);
  curriculumLogger.metric('EVALUATE', 'Longueur requête', `${queryLength} caractères`);
  
  let level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' = 'INTERMEDIATE';
  let levelConfidence = 0.7;
  
  if (technicalTermsCount > 2 && confidence > 0.8) {
    level = 'ADVANCED';
    levelConfidence = Math.min(0.95, 0.7 + (technicalTermsCount - 2) * 0.05);
  } else if (queryLength > 100 || technicalTermsCount > 0 || historyLength > 5) {
    level = 'INTERMEDIATE';
    levelConfidence = 0.6 + Math.min(0.2, (technicalTermsCount * 0.05) + (Math.min(queryLength, 200) / 1000));
  } else {
    level = 'BEGINNER';
    levelConfidence = 0.8;
  }
  
  if (confidence < 0.5) {
    level = 'BEGINNER';
    levelConfidence = 0.6;
  }
  
  const factors = {
    technicalTerms: technicalTermsCount,
    queryLength,
    historyLength,
    previousConfidence: confidence
  };
  
  const elapsedTime = Date.now() - startTime;
  
  await updateEvaluationStats(level, levelConfidence);
  
  curriculumLogger.success('EVALUATE', `Niveau déterminé: ${getLevelEmoji(level)} ${getLevelLabel(level)} (${Math.round(levelConfidence * 100)}%) en ${formatDuration(elapsedTime)}`);
  curriculumLogger.metric('EVALUATE', 'Facteurs', JSON.stringify(factors));
  
  return {
    level,
    confidence: levelConfidence,
    factors,
    processingTime: elapsedTime
  };
}

export async function getCurriculumDirective(level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'): Promise<string> {
  const startTime = Date.now();
  
  curriculumLogger.info('DIRECTIVE', `📋 Génération de directive pour niveau: ${getLevelLabel(level)}`);
  
  const base = "\n[CURRICULUM ADAPTATIF (INNOVATION 27)] : ";
  
  let directive: string;
  
  switch (level) {
    case 'BEGINNER':
      directive = base + "L'utilisateur est en phase d'initiation. Utilise des analogies de la vie courante, décompose les étapes au maximum, et évite absolument le jargon non expliqué. Sois très encourageant et patient.";
      break;
    case 'INTERMEDIATE':
      directive = base + "L'utilisateur a des bases solides. Utilise la terminologie technique standard, fournis des explications sur le 'pourquoi' technique et commence à introduire des concepts corrélés.";
      break;
    case 'ADVANCED':
      directive = base + "L'utilisateur est expert. Va droit au but technique, fournis des paramètres précis, des schémas de données ou des références aux normes industrielles (ISO/AFNOR) sans vulgarisation inutile.";
      break;
    default:
      directive = "";
  }
  
  const elapsedTime = Date.now() - startTime;
  curriculumLogger.success('DIRECTIVE', `Directive générée en ${formatDuration(elapsedTime)} - ${directive.length} caractères`);
  
  return directive;
}

export async function suggestNextTopic(context: string): Promise<string | null> {
  const startTime = Date.now();
  const c = context.toLowerCase();
  
  curriculumLogger.info('SUGGEST', `💡 Suggestion de prochain sujet basée sur: "${context.substring(0, 50)}..."`);
  
  let suggestion: string | null = null;
  let topic = '';
  
  if (c.includes('chaudière') && !c.includes('sécurité')) {
    suggestion = "Suggestion pédagogique : Souhaitez-vous aborder les protocoles de sécurité gaz spécifiques à ce modèle ?";
    topic = 'sécurité gaz chaudière';
  } else if (c.includes('gaz') && c.includes('sécurité')) {
    suggestion = "Prochaine étape recommandée : La maintenance préventive du brûleur et l'étalonnage des sondes.";
    topic = 'maintenance brûleur';
  } else if (c.includes('électrique') || c.includes('disjoncteur')) {
    suggestion = "Suggestion : Nous pourrions explorer le schéma de câblage de la centrale de commande.";
    topic = 'schéma électrique';
  } else if (c.includes('turbine') && !c.includes('maintenance')) {
    suggestion = "Suggestion : Voulez-vous en savoir plus sur la maintenance prédictive des turbines à gaz ?";
    topic = 'maintenance turbine';
  } else if (c.includes('pression') && !c.includes('réglage')) {
    suggestion = "Suggestion : Les procédures de réglage de pression pourraient vous intéresser.";
    topic = 'réglage pression';
  } else if (c.includes('rendement') || c.includes('performance')) {
    suggestion = "Suggestion : Pour aller plus loin, découvrez les techniques d'optimisation énergétique.";
    topic = 'optimisation énergétique';
  } else if (c.includes('urgence') || c.includes('incident')) {
    suggestion = "Suggestion : Nous pouvons approfondir les protocoles d'arrêt d'urgence et les procédures de reprise.";
    topic = 'procédures urgence';
  }
  
  if (suggestion) {
    await updateSuggestionStats(topic);
    const elapsedTime = Date.now() - startTime;
    curriculumLogger.success('SUGGEST', `Suggestion générée en ${formatDuration(elapsedTime)}: "${suggestion.substring(0, 60)}..."`);
  } else {
    const elapsedTime = Date.now() - startTime;
    curriculumLogger.info('SUGGEST', `Aucune suggestion pertinente (${formatDuration(elapsedTime)})`);
  }
  
  return suggestion;
}

export function calculateMasteryScore(interactions: number, correctAnswers: number, timeSpent: number): number {
  let score = 0;
  score += Math.min(interactions * 0.05, 0.3);
  
  if (interactions > 0) {
    const successRate = correctAnswers / interactions;
    score += successRate * 0.5;
  }
  
  score += Math.min(timeSpent / 60000, 0.2);
  
  return Math.min(score, 1.0);
}

export async function updateProgress(
  userId: string,
  topicId: string,
  masteryDelta: number
): Promise<TopicProgress> {
  await ensureInitialized();
  
  curriculumLogger.info('PROGRESS', `📈 Mise à jour progression pour ${userId} - ${topicId}, Delta: ${Math.round(masteryDelta * 100)}%`);
  
  // Récupérer la progression existante ou créer une nouvelle
  const dbInstance = db.getDB();
  let progress: TopicProgress;
  
  const existing = dbInstance.prepare(`
    SELECT * FROM learning_profiles WHERE userId = ?
  `).get(userId) as any;
  
  if (existing) {
    const profile = JSON.parse(existing.memory);
    const existingProgress = profile.progress?.[topicId];
    
    const newMastery = Math.min(1.0, Math.max(0, (existingProgress?.mastery || 0) + masteryDelta));
    progress = {
      topicId,
      mastery: newMastery,
      interactions: (existingProgress?.interactions || 0) + 1,
      lastAccessed: Date.now(),
      tags: [topicId]
    };
    
    // Mettre à jour le profil
    if (!profile.progress) profile.progress = {};
    profile.progress[topicId] = progress;
    
    dbInstance.prepare(`
      UPDATE learning_profiles SET memory = ?, lastUpdated = ? WHERE userId = ?
    `).run(JSON.stringify(profile), Date.now(), userId);
  } else {
    progress = {
      topicId,
      mastery: Math.min(1.0, Math.max(0, masteryDelta)),
      interactions: 1,
      lastAccessed: Date.now(),
      tags: [topicId]
    };
    
    // Créer un nouveau profil
    const newProfile = {
      conciseness: 0.5,
      technicality: 0.7,
      formality: 0.6,
      creativity: 0.4,
      lastUpdated: Date.now(),
      adaptationCount: 0,
      progress: { [topicId]: progress }
    };
    
    dbInstance.prepare(`
      INSERT OR REPLACE INTO learning_profiles (userId, conciseness, technicality, formality, creativity, lastUpdated, adaptationCount, memory)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, 0.5, 0.7, 0.6, 0.4, Date.now(), 0, JSON.stringify(newProfile));
  }
  
  curriculumLogger.success('PROGRESS', `Niveau de maîtrise: ${Math.round(progress.mastery * 100)}%`);
  
  return progress;
}

export async function getUserProgress(userId: string, topicId?: string): Promise<TopicProgress | null | Record<string, TopicProgress>> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  const existing = dbInstance.prepare(`
    SELECT memory FROM learning_profiles WHERE userId = ?
  `).get(userId) as any;
  
  if (!existing) return topicId ? null : {};
  
  const profile = JSON.parse(existing.memory);
  const progress = profile.progress || {};
  
  if (topicId) {
    return progress[topicId] || null;
  }
  
  return progress;
}

export async function getCurriculumStats(): Promise<{
  totalEvaluations: number;
  levelDistribution: Record<string, number>;
  avgConfidence: number;
  lastEvaluationTime: number | null;
  lastLevel: string | null;
  topSuggestions: Record<string, number>;
}> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  
  // Récupérer les métriques depuis la table metrics
  const evaluations = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'curriculum' AND metricName = 'evaluation'
  `).all() as any[];
  
  const levels = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'curriculum' AND metricName LIKE 'level_%'
  `).all() as any[];
  
  const confidences = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'curriculum' AND metricName = 'evaluation_confidence'
  `).all() as any[];
  
  const suggestions = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'curriculum' AND metricName LIKE 'suggestion_%'
  `).all() as any[];
  
  const totalEvaluations = evaluations.length;
  
  const levelDistribution: Record<string, number> = {};
  for (const metric of levels) {
    const level = metric.metricName.replace('level_', '');
    levelDistribution[level] = (levelDistribution[level] || 0) + metric.metricValue;
  }
  
  const avgConfidence = confidences.length > 0
    ? confidences.reduce((sum: number, m: { metricValue: number }) => sum + m.metricValue, 0) / confidences.length
    : 0;
  
  const lastEvaluation = evaluations[evaluations.length - 1];
  const lastEvaluationTime = lastEvaluation?.timestamp || null;
  
  // Dernier niveau évalué
  let lastLevel: string | null = null;
  if (levels.length > 0) {
    const lastLevelMetric = levels[levels.length - 1];
    lastLevel = lastLevelMetric.metricName.replace('level_', '');
  }
  
  const topSuggestions: Record<string, number> = {};
  for (const metric of suggestions) {
    const topic = metric.metricName.replace('suggestion_', '');
    topSuggestions[topic] = (topSuggestions[topic] || 0) + metric.metricValue;
  }
  
  return {
    totalEvaluations,
    levelDistribution,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    lastEvaluationTime,
    lastLevel,
    topSuggestions
  };
}

export async function resetCurriculumStats(): Promise<void> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  dbInstance.prepare(`DELETE FROM learning_profiles`).run();
  
  curriculumLogger.success('STATS', 'Statistiques du curriculum réinitialisées');
}

export default {
  evaluatePedagogicalLevel,
  getCurriculumDirective,
  suggestNextTopic,
  calculateMasteryScore,
  updateProgress,
  getUserProgress,
  getCurriculumStats,
  resetCurriculumStats
};