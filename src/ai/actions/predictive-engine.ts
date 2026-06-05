/**
 * @fileOverview PredictiveActionEngine - Innovation 24 (Bonus).
 * Analyse les patterns pour suggérer des actions proactives à l'utilisateur.
 * 
 * @version 5.0.0
 * @author Équipe Agentic
 * @copyright 2026
 * @changes Migration vers Core SQLite - Infrastructure unifiée
 */

import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { v4 as uuidv4 } from 'uuid';
import { callOllama } from '@/ai/providers/ollama-client';
import { Demonstration } from './demonstration-learner';
import { healthMonitor, SystemMode } from '../resilience/health-monitor';
import { aiEventBus } from './event-bus';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// CONFIGURATION DU LOGGER STRUCTURÉ
// ============================================================================

const predictiveLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.json(),
    format.printf(({ timestamp, level, message, module, suggestionId, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        module: 'PredictiveEngine',
        suggestionId,
        message,
        ...meta
      });
    })
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, suggestionId, ...meta }) => {
          const prefix = `[${timestamp}] ${level}`;
          const suggestion = suggestionId ? `[suggestion:${suggestionId}]` : '';
          return `${prefix} ${suggestion} ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    }),
    new DailyRotateFile({
      filename: 'logs/predictive-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: format.json()
    })
  ]
});

// ============================================================================
// TYPES ET INTERFACES
// ============================================================================

export interface ActionSuggestion {
  id: string;
  description: string;
  action: any;
  confidence: number;
  type: 'temporal' | 'contextual' | 'behavioral' | 'predictive';
  metadata?: {
    matchedPattern?: string;
    historicalCount?: number;
    timestamp?: number;
    category?: string;
  };
}

export interface PredictionMetrics {
  totalPredictions: number;
  acceptedSuggestions: number;
  rejectedSuggestions: number;
  acceptanceRate: number;
  averageConfidence: number;
  suggestionsByType: {
    contextual: number;
    temporal: number;
    behavioral: number;
    predictive: number;
  };
  topPatterns: Array<{ pattern: string; count: number }>;
  lastHourPredictions: number;
}

export interface PredictionOptions {
  minConfidence?: number;
  maxSuggestions?: number;
  enableTemporal?: boolean;
  enableContextual?: boolean;
  enableBehavioral?: boolean;
  useCache?: boolean;
  timeout?: number;
}

export interface Pattern {
  id: string;
  description: string;
  trigger: string;
  action: any;
  confidence: number;
  occurrences: number;
  lastUsed: number;
  type: ActionSuggestion['type'];
}

// ============================================================================
// CONSTANTES
// ============================================================================

const DEFAULT_OPTIONS: PredictionOptions = {
  minConfidence: 0.7,
  maxSuggestions: 2,
  enableTemporal: true,
  enableContextual: true,
  enableBehavioral: true,
  useCache: true,
  timeout: 5000
};

const MIN_HISTORY_LENGTH = 3;
const MAX_SUGGESTIONS = 5;
const CONFIDENCE_THRESHOLDS = { high: 0.85, medium: 0.7, low: 0.5 };

const CONTEXTUAL_PATTERNS = [
  {
    keywords: ['panne', 'erreur', 'problème', 'bug', 'crash', 'dysfonctionnement'],
    suggestion: {
      description: "Rechercher les procédures de dépannage dans la base ?",
      action: { type: 'use_tool', tool: 'search', params: { query: 'dépannage maintenance' } },
      confidence: 0.88
    }
  },
  {
    keywords: ['long', 'beaucoup', 'plusieurs', 'volume'],
    suggestion: {
      description: "Générer une synthèse technique des documents chargés ?",
      action: { type: 'use_tool', tool: 'summarize', params: { format: 'bullet' } },
      confidence: 0.92
    }
  },
  {
    keywords: ['maintenance', 'réparation', 'intervention', 'changement'],
    suggestion: {
      description: "Vérifier les procédures de maintenance associées ?",
      action: { type: 'use_tool', tool: 'search', params: { query: 'procédures maintenance' } },
      confidence: 0.85
    }
  },
  {
    keywords: ['analyse', 'performance', 'optimisation', 'amélioration'],
    suggestion: {
      description: "Analyser les données de performance pour optimisations ?",
      action: { type: 'use_tool', tool: 'analyze', params: { metric: 'performance' } },
      confidence: 0.82
    }
  }
];

const TEMPORAL_PATTERNS = [
  {
    hourRange: [16, 18],
    suggestion: {
      description: "Préparer le rapport final de session ?",
      action: { type: 'PLANIFICATION', task: "Générer un rapport de synthèse des actions effectuées" },
      confidence: 0.75
    }
  },
  {
    hourRange: [9, 11],
    suggestion: {
      description: "Vérifier les tâches prioritaires du jour ?",
      action: { type: 'use_tool', tool: 'list_tasks', params: { priority: 'high' } },
      confidence: 0.78
    }
  }
];

// Core SQLite
const db = SQLiteCore.getInstance();
let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await db.initialize();
    initialized = true;
  }
}

// ============================================================================
// CLASSE PATTERN STORE - Version Core SQLite
// ============================================================================

class PatternStore {
  private suggestionCache: Map<string, ActionSuggestion[]> = new Map();
  private metrics: PredictionMetrics;
  private lastMetricsReset = Date.now();

  constructor() {
    this.metrics = this.initMetrics();
    predictiveLogger.info('Initialisation du PatternStore (Core SQLite)');
    this.loadPatternsFromDB();
  }

  private initMetrics(): PredictionMetrics {
    return {
      totalPredictions: 0,
      acceptedSuggestions: 0,
      rejectedSuggestions: 0,
      acceptanceRate: 0,
      averageConfidence: 0,
      suggestionsByType: { contextual: 0, temporal: 0, behavioral: 0, predictive: 0 },
      topPatterns: [],
      lastHourPredictions: 0
    };
  }

  private async loadPatternsFromDB(): Promise<void> {
    await ensureInitialized();
    try {
      const patterns = await db.actions.getAllPolicies();
      predictiveLogger.info('Patterns chargés depuis SQLite', { count: patterns.length });
    } catch (error) {
      predictiveLogger.warn('Erreur chargement patterns', { error });
    }
  }

  async addPattern(pattern: Pattern): Promise<void> {
    await ensureInitialized();
    
    const existing = await db.actions.getPolicy(pattern.id);
    
    if (existing) {
      const updatedPattern = {
        id: existing.id,
        contextPattern: pattern.trigger,
        actionTemplate: pattern.action,
        confidence: Math.min(0.95, existing.confidence + 0.05),
        demonstrationCount: (existing.demonstrationCount || 0) + 1,
        successRate: existing.successRate || 100,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
        lastUsed: Date.now(),
        tags: [pattern.type]
      };
      db.actions.savePolicy(updatedPattern);
      predictiveLogger.debug('Pattern mis à jour', {
        patternId: pattern.id,
        occurrences: updatedPattern.demonstrationCount,
        confidence: updatedPattern.confidence
      });
    } else {
      const newPattern = {
        id: pattern.id,
        contextPattern: pattern.trigger,
        actionTemplate: pattern.action,
        confidence: pattern.confidence,
        demonstrationCount: pattern.occurrences || 1,
        successRate: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastUsed: Date.now(),
        tags: [pattern.type]
      };
      db.actions.savePolicy(newPattern);
      predictiveLogger.info('Nouveau pattern enregistré', {
        patternId: pattern.id,
        type: pattern.type,
        trigger: pattern.trigger,
        confidence: pattern.confidence
      });
    }
    await this.updateMetrics();
  }

  async getPatterns(): Promise<Pattern[]> {
    await ensureInitialized();
    const policies = await db.actions.getAllPolicies();
    
    return policies.map(p => ({
      id: p.id,
      description: p.contextPattern,
      trigger: p.contextPattern,
      action: p.actionTemplate,
      confidence: p.confidence,
      occurrences: p.demonstrationCount,
      lastUsed: p.lastUsed || 0,
      type: (p.tags?.[0] as Pattern['type']) || 'behavioral'
    }));
  }

  async getPattern(id: string): Promise<Pattern | undefined> {
    await ensureInitialized();
    const policy = await db.actions.getPolicy(id);
    if (!policy) return undefined;
    
    return {
      id: policy.id,
      description: policy.contextPattern,
      trigger: policy.contextPattern,
      action: policy.actionTemplate,
      confidence: policy.confidence,
      occurrences: policy.demonstrationCount,
      lastUsed: policy.lastUsed || 0,
      type: (policy.tags?.[0] as Pattern['type']) || 'behavioral'
    };
  }

  getSuggestionCache(key: string): ActionSuggestion[] | undefined {
    return this.suggestionCache.get(key);
  }

  setSuggestionCache(key: string, suggestions: ActionSuggestion[]): void {
    this.suggestionCache.set(key, suggestions);
    if (this.suggestionCache.size > 500) {
      const oldestKey = Array.from(this.suggestionCache.keys())[0];
      this.suggestionCache.delete(oldestKey);
    }
  }

  clearCache(): void {
    const size = this.suggestionCache.size;
    this.suggestionCache.clear();
    predictiveLogger.info('Cache des prédictions nettoyé', { clearedCount: size });
  }

  private async updateMetrics(): Promise<void> {
    const patterns = await this.getPatterns();
    
    if (patterns.length === 0) return;
    
    const totalConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0);
    this.metrics.averageConfidence = totalConfidence / patterns.length;
    
    this.metrics.topPatterns = patterns
      .map(p => ({ pattern: p.trigger, count: p.occurrences }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  recordPrediction(suggestion: ActionSuggestion, accepted: boolean): void {
    this.metrics.totalPredictions++;
    
    const now = Date.now();
    if (now - this.lastMetricsReset > 3600000) {
      this.metrics.lastHourPredictions = 0;
      this.lastMetricsReset = now;
    }
    this.metrics.lastHourPredictions++;
    
    if (accepted) {
      this.metrics.acceptedSuggestions++;
    } else {
      this.metrics.rejectedSuggestions++;
    }
    
    this.metrics.acceptanceRate = (this.metrics.acceptedSuggestions / this.metrics.totalPredictions) * 100;
    this.metrics.suggestionsByType[suggestion.type]++;
  }

  getMetrics(): PredictionMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    predictiveLogger.info('Réinitialisation des métriques');
    this.metrics = this.initMetrics();
    this.lastMetricsReset = Date.now();
  }
}

const patternStore = new PatternStore();

// ============================================================================
// FONCTIONS PRINCIPALES
// ============================================================================

export async function predictNextActions(
  history: Demonstration[], 
  currentContext: string,
  options?: PredictionOptions
): Promise<ActionSuggestion[]> {
  await ensureInitialized();
  
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  predictiveLogger.info('Début prédiction d\'actions', {
    historyLength: history?.length || 0,
    contextLength: currentContext.length,
    options: opts
  });
  
  if (!history || history.length < MIN_HISTORY_LENGTH) {
    return [];
  }
  
  const cacheKey = `${history.length}-${currentContext.substring(0, 200)}`;
  if (opts.useCache) {
    const cached = patternStore.getSuggestionCache(cacheKey);
    if (cached) {
      return cached;
    }
  }
  
  try {
    const timeout = opts.timeout || 5000;
    const predictionPromise = performPrediction(history, currentContext, opts);
    const timeoutPromise = new Promise<ActionSuggestion[]>((_, reject) => {
      setTimeout(() => reject(new Error(`Prédiction timeout après ${timeout}ms`)), timeout);
    });
    
    const suggestions = await Promise.race([predictionPromise, timeoutPromise]);
    
    const filteredSuggestions = suggestions
      .filter(s => s.confidence >= (opts.minConfidence || 0.7))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, opts.maxSuggestions || MAX_SUGGESTIONS);
    
    if (opts.useCache) {
      patternStore.setSuggestionCache(cacheKey, filteredSuggestions);
    }
    
    predictiveLogger.info('Prédictions générées', {
      totalGenerated: suggestions.length,
      filteredCount: filteredSuggestions.length,
      duration: Date.now() - startTime
    });
    
    return filteredSuggestions;
    
  } catch (error) {
    predictiveLogger.error('Échec prédiction', {
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
    return [];
  }
}

async function performPrediction(
  history: Demonstration[],
  currentContext: string,
  options: PredictionOptions
): Promise<ActionSuggestion[]> {
  const suggestions: ActionSuggestion[] = [];
  
  if (options.enableContextual) {
    const contextual = await analyzeContextualPatterns(history, currentContext);
    suggestions.push(...contextual);
  }
  
  if (options.enableTemporal) {
    const temporal = analyzeTemporalPatterns(history);
    suggestions.push(...temporal);
  }
  
  if (options.enableBehavioral) {
    const behavioral = await analyzeBehavioralPatterns(history, currentContext, options);
    suggestions.push(...behavioral);
  }
  
  const advanced = await analyzeAdvancedPatterns(history, currentContext);
  suggestions.push(...advanced);
  
  const healthSuggestions = await analyzeSystemHealth();
  suggestions.push(...healthSuggestions);
  
  return deduplicateSuggestions(suggestions);
}

async function analyzeSystemHealth(): Promise<ActionSuggestion[]> {
  const suggestions: ActionSuggestion[] = [];
  
  try {
    const health = await healthMonitor.checkHealth();
    
    const hasAnomaly = health.mode === SystemMode.DEGRADED || 
                       health.mode === SystemMode.OFFLINE ||
                       health.mode === SystemMode.MAINTENANCE;
    
    const details: string[] = [];
    
    if (health.mode === SystemMode.DEGRADED) {
      details.push(`Groq API indisponible (${health.consecutiveFailures} échecs consécutifs)`);
    } else if (health.mode === SystemMode.OFFLINE) {
      details.push(`Pas de connexion Internet détectée`);
    } else if (health.mode === SystemMode.MAINTENANCE) {
      details.push(`Mode maintenance actif`);
    }
    
    const score = health.mode === SystemMode.NOMINAL ? 0.9 :
                  health.mode === SystemMode.DEGRADED ? 0.3 :
                  health.mode === SystemMode.OFFLINE ? 0.1 : 0.5;
    
    if (hasAnomaly) {
      predictiveLogger.warn('Anomalie système détectée lors de la prédiction', { 
        mode: health.mode,
        consecutiveFailures: health.consecutiveFailures,
        groqAvailable: health.groqAvailable,
        internetAvailable: health.internetAvailable
      });
      
      const healthSuggestion: ActionSuggestion = {
        id: uuidv4(),
        description: `Risque d'instabilité détecté : ${details[0] || 'anomalie système'}. Souhaitez-vous basculer sur le modèle de secours ?`,
        action: { type: 'LLM_FALLBACK', mode: 'proactive', details },
        confidence: Math.min(0.95, 0.4 + score),
        type: 'predictive',
        metadata: { 
          matchedPattern: 'system_health_anomaly', 
          timestamp: Date.now(), 
          category: 'system_integrity' 
        }
      };
      
      suggestions.push(healthSuggestion);

      aiEventBus.emitAction({
        id: healthSuggestion.id,
        module: 'Predictive',
        type: 'HEALTH_ALERT',
        status: 'prediction',
        message: `Alerte Système : ${healthSuggestion.description.substring(0, 50)}...`,
        timestamp: Date.now(),
        data: { mode: health.mode, score }
      });
    }
  } catch (error) {
    predictiveLogger.warn('Erreur analyse santé système', { 
      error: error instanceof Error ? error.message : 'Unknown' 
    });
  }
  
  return suggestions;
}

async function analyzeContextualPatterns(
  _history: Demonstration[],
  context: string
): Promise<ActionSuggestion[]> {
  const suggestions: ActionSuggestion[] = [];
  const contextLower = context.toLowerCase();
  
  for (const pattern of CONTEXTUAL_PATTERNS) {
    const matched = pattern.keywords.some(keyword => contextLower.includes(keyword));
    
    if (matched) {
      suggestions.push({
        id: uuidv4(),
        description: pattern.suggestion.description,
        action: pattern.suggestion.action,
        confidence: pattern.suggestion.confidence,
        type: 'contextual',
        metadata: {
          matchedPattern: pattern.keywords.join(', '),
          timestamp: Date.now(),
          category: 'heuristic'
        }
      });
    }
  }
  
  if (suggestions.length === 0 && context.length > 200) {
    try {
      const prompt = `Tu es un assistant prédictif. Analyse le contexte et suggère une action proactive utile.
      
      Contexte utilisateur: ${context.substring(0, 500)}
      
      Suggère une action proactive (max 1 suggestion).
      Format JSON: { "description": "...", "action": { "type": "...", "params": {} }, "confidence": 0.X }`;

      const response = await callOllama(prompt, {
        model: 'phi:2.7b',
        temperature: 0.3,
        maxTokens: 1000,
        timeout: 15000
      });
      
      const match = response.match(/\{.*\}/s);
      if (match) {
        const data = JSON.parse(match[0]);
        suggestions.push({
          id: uuidv4(),
          description: data.description,
          action: data.action,
          confidence: Math.min(0.9, data.confidence || 0.7),
          type: 'contextual',
          metadata: { matchedPattern: 'llm_analysis', timestamp: Date.now(), category: 'llm' }
        });
      }
    } catch (error) {
      predictiveLogger.warn('Échec analyse contextuelle LLM', {
        error: error instanceof Error ? error.message : 'Unknown'
      });
    }
  }
  
  return suggestions;
}

function analyzeTemporalPatterns(history: Demonstration[]): ActionSuggestion[] {
  const suggestions: ActionSuggestion[] = [];
  const currentHour = new Date().getHours();
  
  for (const pattern of TEMPORAL_PATTERNS) {
    if (currentHour >= pattern.hourRange[0] && currentHour <= pattern.hourRange[1]) {
      suggestions.push({
        id: uuidv4(),
        description: pattern.suggestion.description,
        action: pattern.suggestion.action,
        confidence: pattern.suggestion.confidence,
        type: 'temporal',
        metadata: {
          matchedPattern: `hour_${pattern.hourRange[0]}-${pattern.hourRange[1]}`,
          timestamp: Date.now(),
          category: 'temporal'
        }
      });
    }
  }
  
  if (history.length > 10) {
    const sessionDuration = Date.now() - (history[0]?.timestamp || Date.now());
    if (sessionDuration > 30 * 60 * 1000) {
      suggestions.push({
        id: uuidv4(),
        description: "Session prolongée détectée. Voulez-vous sauvegarder l'état actuel ?",
        action: { type: 'use_tool', tool: 'save_session', params: { auto: true } },
        confidence: 0.82,
        type: 'temporal',
        metadata: { matchedPattern: 'long_session', timestamp: Date.now(), category: 'session' }
      });
    }
  }
  
  return suggestions;
}

async function analyzeBehavioralPatterns(
  _history: Demonstration[],
  currentContext: string,
  options: PredictionOptions
): Promise<ActionSuggestion[]> {
  const suggestions: ActionSuggestion[] = [];
  const learnedPatterns = await patternStore.getPatterns();
  const filtered = learnedPatterns
    .filter(p => p.confidence >= (options.minConfidence || 0.7))
    .slice(0, 3);
  
  for (const pattern of filtered) {
    if (currentContext.toLowerCase().includes(pattern.trigger.toLowerCase())) {
      suggestions.push({
        id: uuidv4(),
        description: pattern.description,
        action: pattern.action,
        confidence: pattern.confidence,
        type: 'behavioral',
        metadata: {
          matchedPattern: pattern.trigger,
          historicalCount: pattern.occurrences,
          timestamp: Date.now(),
          category: 'learned'
        }
      });
    }
  }
  
  return suggestions;
}

async function analyzeAdvancedPatterns(
  history: Demonstration[],
  currentContext: string
): Promise<ActionSuggestion[]> {
  const suggestions: ActionSuggestion[] = [];
  
  if (history.length < 5) return suggestions;
  
  try {
    const recentActions = history.slice(-5).map(h => ({
      type: h.action?.type,
      timestamp: h.timestamp,
      success: h.success
    }));
    
    const prompt = `Tu es un assistant prédictif avancé. Analyse les patterns d'utilisation et suggère la prochaine action probable.
    
    Historique récent des actions: ${JSON.stringify(recentActions)}
    Contexte actuel: ${currentContext.substring(0, 300)}
    
    Suggère 1-2 actions proactives pertinentes basées sur les patterns observés.
    Format JSON ARRAY: [
      { "description": "...", "action": { "type": "...", "params": {} }, "confidence": 0.X }
    ]`;

    const response = await callOllama(prompt, {
      model: 'phi:2.7b',
      temperature: 0.3,
      maxTokens: 1000,
      timeout: 15000
    });
    
    const match = response.match(/\[[\s\S]*\]/);
    if (match) {
      const data = JSON.parse(match[0]);
      for (const item of data) {
        suggestions.push({
          id: uuidv4(),
          description: item.description,
          action: item.action,
          confidence: Math.min(0.95, item.confidence || 0.75),
          type: 'predictive',
          metadata: { matchedPattern: 'llm_advanced', timestamp: Date.now(), category: 'llm_predictive' }
        });
      }
    }
  } catch (error) {
    predictiveLogger.warn('Échec analyse prédictive avancée', {
      error: error instanceof Error ? error.message : 'Unknown'
    });
  }
  
  return suggestions;
}

function deduplicateSuggestions(suggestions: ActionSuggestion[]): ActionSuggestion[] {
  const seen = new Map<string, ActionSuggestion>();
  
  for (const suggestion of suggestions) {
    const key = `${suggestion.action.type}-${JSON.stringify(suggestion.action.params)}`;
    if (!seen.has(key) || seen.get(key)!.confidence < suggestion.confidence) {
      seen.set(key, suggestion);
    }
  }
  
  return Array.from(seen.values());
}

export async function recordSuggestionFeedback(
  suggestionId: string,
  accepted: boolean,
  actionExecuted?: boolean,
  success?: boolean
): Promise<void> {
  predictiveLogger.info('Enregistrement feedback suggestion', {
    suggestionId,
    accepted,
    actionExecuted,
    success
  });
}

export async function learnPattern(
  trigger: string,
  action: any,
  description: string,
  confidence: number = 0.6
): Promise<void> {
  const pattern: Pattern = {
    id: uuidv4(),
    trigger,
    action,
    description,
    confidence,
    occurrences: 1,
    lastUsed: Date.now(),
    type: 'behavioral'
  };
  
  await patternStore.addPattern(pattern);
  predictiveLogger.info('Nouveau pattern appris', { patternId: pattern.id, trigger, confidence });
}

export async function getPredictionMetrics(): Promise<PredictionMetrics> {
  await ensureInitialized();
  return patternStore.getMetrics();
}

export function resetPredictionMetrics(): void {
  patternStore.resetMetrics();
}

export function clearPredictionCache(): void {
  patternStore.clearCache();
}

// ============================================================================
// EXPORT POUR TESTING
// ============================================================================

export const __testables__ = {
  patternStore,
  analyzeContextualPatterns,
  analyzeTemporalPatterns,
  analyzeBehavioralPatterns,
  analyzeAdvancedPatterns,
  deduplicateSuggestions,
  CONTEXTUAL_PATTERNS,
  TEMPORAL_PATTERNS,
  MIN_HISTORY_LENGTH,
  CONFIDENCE_THRESHOLDS,
  ensureInitialized
};

// ============================================================================
// GESTION DES SIGNAUX
// ============================================================================

if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    predictiveLogger.info('Signal SIGTERM reçu, fermeture propre');
    patternStore.clearCache();
  });
  process.on('SIGINT', () => {
    predictiveLogger.info('Signal SIGINT reçu, fermeture propre');
    patternStore.clearCache();
  });
}