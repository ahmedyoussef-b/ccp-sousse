/**
 * @fileOverview DemonstrationLearner - Innovation 22.
 * L'IA apprend des actions de l'utilisateur pour suggérer des workflows automatisés.
 * 
 * @version 5.0.0
 * @author Équipe Agentic
 * @copyright 2026
 * @changes Migration vers Core SQLite - Infrastructure unifiée
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { episodicMemory } from '../memory/episodic-memory';
import { aiEventBus } from './event-bus';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// LOGGER SIMPLIFIÉ
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  policyId?: string;
  demonstrationId?: string;
  [key: string]: any;
}

class SimpleLogger {
  private level: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  private logToConsole = true;
  private fileStream?: any;
  private logToFile = false;

  constructor() {
    if (process.env.LOG_TO_FILE === 'true') {
      try {
        const fs = require('fs');
        const path = require('path');
        const logDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir);
        }
        this.fileStream = fs.createWriteStream(
          path.join(logDir, `demonstration-${new Date().toISOString().split('T')[0]}.log`),
          { flags: 'a' }
        );
        this.logToFile = true;
      } catch (e) {
        // Ignorer
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.level];
  }

  private format(entry: LogEntry): string {
    const { timestamp, level, module, message, ...meta } = entry;
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()} [${module}] ${message}${metaStr}`;
  }

  private write(entry: LogEntry): void {
    const formatted = this.format(entry);
    
    if (this.logToConsole) {
      const colors: Record<LogLevel, string> = {
        debug: '\x1b[36m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m'
      };
      console.log(`${colors[entry.level]}${formatted}\x1b[0m`);
    }
    
    if (this.logToFile && this.fileStream) {
      this.fileStream.write(formatted + '\n');
    }
  }

  debug(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('debug')) {
      this.write({ timestamp: new Date().toISOString(), level: 'debug', module: 'DemonstrationLearner', message, ...meta });
    }
  }

  info(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('info')) {
      this.write({ timestamp: new Date().toISOString(), level: 'info', module: 'DemonstrationLearner', message, ...meta });
    }
  }

  warn(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('warn')) {
      this.write({ timestamp: new Date().toISOString(), level: 'warn', module: 'DemonstrationLearner', message, ...meta });
    }
  }

  error(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('error')) {
      this.write({ timestamp: new Date().toISOString(), level: 'error', module: 'DemonstrationLearner', message, ...meta });
    }
  }

  close(): void {
    if (this.fileStream) {
      this.fileStream.end();
    }
  }
}

const demoLogger = new SimpleLogger();

// ============================================================================
// TYPES ET INTERFACES
// ============================================================================

export interface Demonstration {
  id?: string;
  timestamp: number;
  context: any;
  action: any;
  result: any;
  userId?: string;
  sessionId?: string;
  duration?: number;
  success?: boolean;
  tags?: string[];
}

export interface Policy {
  id: string;
  contextPattern: string;
  actionTemplate: any;
  confidence: number;
  demonstrationCount: number;
  createdAt?: number;
  updatedAt?: number;
  lastUsed?: number;
  successRate?: number;
  tags?: string[];
}

export interface LearningMetrics {
  totalDemonstrations: number;
  totalPolicies: number;
  averageConfidence: number;
  policiesByConfidence: { high: number; medium: number; low: number };
  mostUsedPolicies: Array<{ id: string; usageCount: number }>;
  demonstrationsByTime: { lastHour: number; lastDay: number; lastWeek: number };
  successRate: number;
}

export interface SuggestionResult {
  action: any | null;
  policyId?: string;
  confidence?: number;
  matchType?: 'exact' | 'partial' | 'semantic';
  suggestionTime?: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const MIN_DEMONSTRATIONS_FOR_POLICY = 2;
const MAX_HISTORY_ANALYSIS = 20;
const CONFIDENCE_DECAY_RATE = 0.05;
const SUGGESTION_CACHE_TTL = 10 * 60 * 1000;

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

function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// CLASSE PRINCIPALE - Version Core SQLite
// ============================================================================

class DemonstrationStore {
  private suggestionCache: Map<string, SuggestionResult> = new Map();
  private metrics: LearningMetrics;
  private demonstrationsCache: Demonstration[] = [];

  constructor() {
    this.metrics = this.initMetrics();
    demoLogger.info('Initialisation du DemonstrationStore (Core SQLite)');
  }

  private initMetrics(): LearningMetrics {
    return {
      totalDemonstrations: 0,
      totalPolicies: 0,
      averageConfidence: 0,
      policiesByConfidence: { high: 0, medium: 0, low: 0 },
      mostUsedPolicies: [],
      demonstrationsByTime: { lastHour: 0, lastDay: 0, lastWeek: 0 },
      successRate: 100
    };
  }
async addDemonstration(demo: Demonstration): Promise<void> {
  await ensureInitialized();
  
  const demoId = demo.id || generateId('demo');
  const now = Date.now();
  
  const demonstration: Demonstration = {
    id: demoId,
    timestamp: demo.timestamp || now,
    context: demo.context,
    action: demo.action,
    result: demo.result,
    userId: demo.userId,
    sessionId: demo.sessionId,
    success: demo.success !== false,
    tags: demo.tags || [],
    duration: demo.duration || 0
  };
  
  // 🔥 PERSISTANCE SQLITE
  const dbInstance = db.getDB();
  dbInstance.prepare(`
    INSERT OR REPLACE INTO actions_demonstrations 
    (id, timestamp, context, action, result, userId, sessionId, success, tags, duration)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    demonstration.id,
    demonstration.timestamp,
    JSON.stringify(demonstration.context),
    JSON.stringify(demonstration.action),
    JSON.stringify(demonstration.result),
    demonstration.userId || null,
    demonstration.sessionId || null,
    demonstration.success ? 1 : 0,
    JSON.stringify(demonstration.tags),
    demonstration.duration
  );
  
  // Cache mémoire pour accès rapide
  this.demonstrationsCache.unshift(demonstration);
  if (this.demonstrationsCache.length > 10000) {
    this.demonstrationsCache.pop();
  }
  
  demoLogger.info('Démonstration ajoutée', {
    demonstrationId: demoId,
    totalDemonstrations: this.demonstrationsCache.length,
    actionType: demo.action?.type,
    success: demonstration.success
  });

  aiEventBus.emitAction({
    id: demoId,
    module: 'Learner',
    type: 'EXPERIENCE_LEARNED',
    status: 'complete',
    message: `Nouvelle expérience acquise : ${demo.action?.type || 'action'}`,
    timestamp: Date.now(),
    data: { success: demo.success }
  });
  
  await this.updateMetrics();
  
  const recentHistory = this.getDemonstrations(MAX_HISTORY_ANALYSIS);
  if (recentHistory.length >= MIN_DEMONSTRATIONS_FOR_POLICY) {
    extractPoliciesFromHistory(recentHistory).catch(error => {
      demoLogger.error('Erreur extraction post-démonstration', {
        error: error instanceof Error ? error.message : 'Unknown',
        demonstrationId: demoId
      });
    });
  }
}
  getDemonstrations(limit?: number, userId?: string): Demonstration[] {
    let result = this.demonstrationsCache;
    
    if (userId) {
      result = result.filter(d => d.userId === userId);
    }
    
    if (limit && limit > 0) {
      result = result.slice(0, limit);
    }
    
    return result;
  }

  async addPolicy(policy: Policy): Promise<void> {
    await ensureInitialized();
    
    const existing = await db.actions.getPolicy(policy.id);
    const now = Date.now();
    
    if (existing) {
      const updatedPolicy = {
        id: existing.id,
        contextPattern: policy.contextPattern,
        actionTemplate: policy.actionTemplate,
        confidence: Math.min(0.95, existing.confidence + 0.05),
        demonstrationCount: existing.demonstrationCount + 1,
        successRate: existing.successRate || 100,
        createdAt: existing.createdAt,
        updatedAt: now,
        lastUsed: now,
        tags: policy.tags || existing.tags || []
      };
      db.actions.savePolicy(updatedPolicy);
      demoLogger.info('Politique mise à jour', {
        policyId: policy.id,
        oldConfidence: existing.confidence,
        newConfidence: updatedPolicy.confidence
      });
    } else {
      const newPolicy = {
        id: policy.id,
        contextPattern: policy.contextPattern,
        actionTemplate: policy.actionTemplate,
        confidence: policy.confidence,
        demonstrationCount: policy.demonstrationCount || 1,
        successRate: policy.successRate || 100,
        createdAt: now,
        updatedAt: now,
        lastUsed: now,
        tags: policy.tags || []
      };
      db.actions.savePolicy(newPolicy);
      demoLogger.info('Nouvelle politique créée', { 
        policyId: policy.id, 
        confidence: policy.confidence 
      });
    }
    await this.updateMetrics();
  }

  async getPolicies(filter?: { minConfidence?: number }): Promise<Policy[]> {
    await ensureInitialized();
    const minConfidence = filter?.minConfidence ?? 0;
    return db.actions.getAllPolicies(minConfidence);
  }

  async getPolicy(id: string): Promise<Policy | undefined> {
    await ensureInitialized();
    return db.actions.getPolicy(id) as Policy | undefined;
  }

  async updatePolicyUsage(policyId: string, success: boolean): Promise<void> {
    await ensureInitialized();
    const policy = await db.actions.getPolicy(policyId);
    if (policy) {
      const newCount = policy.demonstrationCount + 1;
      const newRate = ((policy.successRate * policy.demonstrationCount) + (success ? 100 : 0)) / newCount;
      const newConfidence = Math.min(0.95, Math.max(0.1, policy.confidence + (success ? 0.02 : -0.05)));
      
      const updatedPolicy = {
        ...policy,
        demonstrationCount: newCount,
        successRate: newRate,
        confidence: newConfidence,
        lastUsed: Date.now(),
        updatedAt: Date.now()
      };
      db.actions.savePolicy(updatedPolicy);
    }
    
    await this.updateMetrics();
    
    demoLogger.debug('Utilisation politique enregistrée', {
      policyId,
      success
    });
  }

  async deletePolicy(policyId: string): Promise<boolean> {
    await ensureInitialized();
    const deleted = db.actions.deletePolicy(policyId);
    if (deleted) {
      demoLogger.info('Politique supprimée', { policyId });
      await this.updateMetrics();
    }
    return deleted;
  }

  getSuggestionCache(key: string): SuggestionResult | undefined {
    const cached = this.suggestionCache.get(key);
    if (cached && cached.suggestionTime && Date.now() - cached.suggestionTime < SUGGESTION_CACHE_TTL) {
      return cached;
    }
    return undefined;
  }

  setSuggestionCache(key: string, suggestion: SuggestionResult): void {
    this.suggestionCache.set(key, { ...suggestion, suggestionTime: Date.now() });
    if (this.suggestionCache.size > 1000) {
      const oldestKey = Array.from(this.suggestionCache.keys())[0];
      this.suggestionCache.delete(oldestKey);
    }
  }

  clearSuggestionCache(): void {
    const size = this.suggestionCache.size;
    this.suggestionCache.clear();
    demoLogger.info('Cache de suggestions nettoyé', { clearedCount: size });
  }

  private async updateMetrics(): Promise<void> {
    const policies = await this.getPolicies();
    const demonstrations = this.getDemonstrations(10000);
    const now = Date.now();
    
    this.metrics.totalPolicies = policies.length;
    this.metrics.totalDemonstrations = demonstrations.length;
    
    if (policies.length > 0) {
      const totalConfidence = policies.reduce((sum, p) => sum + p.confidence, 0);
      this.metrics.averageConfidence = totalConfidence / policies.length;
    }
    
    this.metrics.policiesByConfidence = {
      high: policies.filter(p => p.confidence > 0.7).length,
      medium: policies.filter(p => p.confidence > 0.4 && p.confidence <= 0.7).length,
      low: policies.filter(p => p.confidence <= 0.4).length
    };
    
    this.metrics.mostUsedPolicies = policies
      .map(p => ({ id: p.id, usageCount: p.demonstrationCount }))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 5);
    
    const hourAgo = now - 3600000;
    const dayAgo = now - 86400000;
    const weekAgo = now - 604800000;
    
    this.metrics.demonstrationsByTime = {
      lastHour: demonstrations.filter(d => d.timestamp > hourAgo).length,
      lastDay: demonstrations.filter(d => d.timestamp > dayAgo).length,
      lastWeek: demonstrations.filter(d => d.timestamp > weekAgo).length
    };
    
    const policiesWithSuccess = policies.filter(p => p.successRate !== undefined);
    if (policiesWithSuccess.length > 0) {
      const avgSuccessRate = policiesWithSuccess.reduce((sum, p) => sum + (p.successRate || 0), 0) / policiesWithSuccess.length;
      this.metrics.successRate = avgSuccessRate;
    }
  }

  async getMetrics(): Promise<LearningMetrics> {
    await this.updateMetrics();
    return { ...this.metrics };
  }
}

const demonstrationStore = new DemonstrationStore();

// ============================================================================
// FONCTIONS PRINCIPALES
// ============================================================================

export async function extractPoliciesFromHistory(
  history: Demonstration[],
  options?: { minConfidence?: number; maxPolicies?: number }
): Promise<Policy[]> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  demoLogger.info('Extraction de politiques', {
    historyLength: history.length,
    minRequired: MIN_DEMONSTRATIONS_FOR_POLICY,
    options
  });
  
  if (history.length < MIN_DEMONSTRATIONS_FOR_POLICY) {
    return [];
  }

  try {
    const recentHistory = history.slice(-MAX_HISTORY_ANALYSIS);
    
    const prompt = `Tu es un Expert en Apprentissage par Démonstration. Identifie des patterns réutilisables dans les actions utilisateur.
    
    Règles d'extraction:
    - Ne génère une politique que si le pattern apparaît au moins 2 fois
    - La confiance doit refléter la fréquence et la cohérence du pattern
    - Limite à ${options?.maxPolicies || 3} politiques maximum.
    
    Historique des actions (${recentHistory.length} démonstrations récentes):
    ${JSON.stringify(recentHistory.map(d => ({
      context: d.context,
      action: d.action,
      result: d.result,
      success: d.success
    })), null, 2)}
    
    Génère des règles (Policy) pour les patterns répétés.
    Format JSON ARRAY: [
      {
        "pattern": "description concise du contexte",
        "action": { "type": "...", "params": {} },
        "confidence": 0.X,
        "tags": ["tag1", "tag2"]
      }
    ]`;

    const response = await callOllama(prompt, {
      model: 'phi:2.7b',
      temperature: 0.3,
      maxTokens: 1000,
      timeout: 15000
    });
    
    const match = response.match(/\[[\s\S]*\]/);
    if (match) {
      const policies = JSON.parse(match[0]);
      
      if (!Array.isArray(policies)) {
        return [];
      }
      
      const minConfidence = options?.minConfidence || 0.6;
      const validPolicies = policies
        .filter(p => p.pattern && p.action && p.confidence >= minConfidence)
        .map(p => ({
          id: generateId('policy'),
          contextPattern: p.pattern,
          actionTemplate: p.action,
          confidence: Math.min(0.95, Math.max(0.3, p.confidence)),
          demonstrationCount: recentHistory.filter(h => 
            JSON.stringify(h.context).toLowerCase().includes(p.pattern.toLowerCase())
          ).length,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastUsed: 0,
          successRate: 100,
          tags: p.tags || []
        }));
      
      demoLogger.info('Extraction terminée', {
        policiesExtracted: validPolicies.length,
        duration: Date.now() - startTime
      });
      
      for (const policy of validPolicies) {
        await demonstrationStore.addPolicy(policy);
      }
      return validPolicies;
    }
    
    return [];
    
  } catch (error) {
    demoLogger.error('Échec extraction politiques', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return [];
  }
}

export async function suggestActionFromPolicy(
  query: string, 
  context: string, 
  policies: Policy[],
  options?: { useCache?: boolean; minConfidence?: number; useEpisodicMemory?: boolean }
): Promise<SuggestionResult> {
  await ensureInitialized();
  
  const cacheKey = `${query}-${context.substring(0, 100)}`;
  
  if (options?.useCache !== false) {
    const cached = demonstrationStore.getSuggestionCache(cacheKey);
    if (cached) return cached;
  }

  let bestMatch: SuggestionResult = { action: null };
  const minConfidence = options?.minConfidence ?? 0.5;
  const relevantPolicies = policies.filter(p => p.confidence >= minConfidence);

  let episodicContext = '';
  if (options?.useEpisodicMemory !== false) {
    demoLogger.info('Recherche dans la mémoire épisodique...', { query });
    try {
      const episodes = await episodicMemory.recallSimilarEpisodes(`${query} ${context}`, 2);
      if (episodes.length > 0) {
        episodicContext = `\nEXPÉRIENCES PASSÉES SIMILAIRES :\n${episodes.map(e => 
          `- [${e.success ? 'SUCCÈS' : 'ÉCHEC'}] Situé le ${new Date(e.timestamp).toLocaleDateString()}: ${e.context}`
        ).join('\n')}`;
      }
    } catch (err) {
      demoLogger.warn('Erreur lors de la recherche épisodique', { error: err });
    }
  }
  
  if (episodicContext && relevantPolicies.length === 0) {
    demoLogger.info('Adaptation via LLM basée sur la mémoire épisodique');
    try {
      const adaptationPrompt = `Tu es un Expert en Copilote Industriel. En te basant sur les expériences passées, suggère l'action la plus appropriée.
      
      CONTEXTE ACTUEL : ${context}
      TÂCHE : ${query}
      ${episodicContext}
      
      RÈGLE : Si une expérience passée est un ÉCHEC, ne suggère PAS la même action. Si c'est un SUCCÈS, adapte-la.
      
      Format JSON ATTENDU : { "action": { "type": "...", "params": {} }, "confidence": 0.X }`;

      const response = await callOllama(adaptationPrompt, { 
        model: 'phi3.5:latest', 
        temperature: 0.1 
      });
      const match = response.match(/\{.*\}/s);
      if (match) {
        const data = JSON.parse(match[0]);
        bestMatch = {
          action: data.action,
          confidence: data.confidence,
          matchType: 'semantic',
          suggestionTime: Date.now()
        };
      }
    } catch (e) {
      demoLogger.error('Erreur adaptation sémantique', { error: e });
    }
  }

  if (!bestMatch.action) {
    for (const policy of relevantPolicies) {
      const queryLower = query.toLowerCase();
      const contextLower = context.toLowerCase();
      const patternLower = policy.contextPattern.toLowerCase();
      
      let matchType: 'exact' | 'partial' | 'semantic' = 'partial';
      let matched = false;
      
      if (queryLower.includes(patternLower) || contextLower.includes(patternLower)) {
        matched = true;
        matchType = 'exact';
      } else {
        const patternWords = patternLower.split(' ').filter(w => w.length > 3);
        const matchedWords = patternWords.filter(word => 
          queryLower.includes(word) || contextLower.includes(word)
        );
        if (patternWords.length > 0 && matchedWords.length >= patternWords.length * 0.6) {
          matched = true;
          matchType = 'partial';
        }
      }
      
      if (matched && (!bestMatch.action || (policy.confidence > (bestMatch.confidence || 0)))) {
        bestMatch = {
          action: policy.actionTemplate,
          policyId: policy.id,
          confidence: policy.confidence,
          matchType,
          suggestionTime: Date.now()
        };
        
        await demonstrationStore.updatePolicyUsage(policy.id, true);
      }
    }
  }
  
  if (bestMatch.action && options?.useCache !== false) {
    demonstrationStore.setSuggestionCache(cacheKey, bestMatch);
  }
  
  return bestMatch;
}

export async function recordDemonstration(
  context: any,
  action: any,
  result: any,
  metadata?: {
    userId?: string;
    sessionId?: string;
    success?: boolean;
    tags?: string[];
  }
): Promise<string> {
  await ensureInitialized();
  
  const demonstrationId = generateId('demo');
  
  const demonstration: Demonstration = {
    id: demonstrationId,
    timestamp: Date.now(),
    context,
    action,
    result,
    userId: metadata?.userId,
    sessionId: metadata?.sessionId,
    success: metadata?.success !== false,
    tags: metadata?.tags || [],
    duration: 0
  };
  
  await demonstrationStore.addDemonstration(demonstration);
  
  try {
    await episodicMemory.saveEpisode({
      timestamp: demonstration.timestamp,
      context: JSON.stringify(context),
      action,
      result,
      success: demonstration.success || true,
      metadata: { sessionId: metadata?.sessionId, userId: metadata?.userId }
    });
  } catch (e) {
    demoLogger.error('Erreur sauvegarde mémoire épisodique', { error: e });
  }
  
  demonstration.duration = Date.now() - demonstration.timestamp;
  demoLogger.info('Démonstration enregistrée', { demonstrationId, success: demonstration.success });
  
  return demonstrationId;
}

export async function recordSuggestionFeedback(
  suggestionId: string,
  policyId: string,
  wasUsed: boolean,
  wasSuccessful: boolean
): Promise<void> {
  await ensureInitialized();
  
  demoLogger.info('Enregistrement du feedback', { suggestionId, policyId, wasUsed, wasSuccessful });
  
  if (wasUsed) {
    await demonstrationStore.updatePolicyUsage(policyId, wasSuccessful);
  }
}

export async function getLearningMetrics(): Promise<LearningMetrics> {
  await ensureInitialized();
  return demonstrationStore.getMetrics();
}

export async function getAllPolicies(filter?: { minConfidence?: number }): Promise<Policy[]> {
  await ensureInitialized();
  return demonstrationStore.getPolicies(filter);
}

export async function deletePolicy(policyId: string): Promise<boolean> {
  await ensureInitialized();
  return demonstrationStore.deletePolicy(policyId);
}

export function clearSuggestionCache(): void {
  demonstrationStore.clearSuggestionCache();
}

// ============================================================================
// EXPORT POUR TESTING
// ============================================================================

export const __testables__ = {
  demonstrationStore,
  MIN_DEMONSTRATIONS_FOR_POLICY,
  MAX_HISTORY_ANALYSIS,
  CONFIDENCE_DECAY_RATE,
  SUGGESTION_CACHE_TTL,
  generateId,
  ensureInitialized
};

// ============================================================================
// GESTION DES SIGNAUX
// ============================================================================

if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    demoLogger.info('Signal SIGTERM reçu, fermeture propre');
    demonstrationStore.clearSuggestionCache();
    demoLogger.close();
  });
  process.on('SIGINT', () => {
    demoLogger.info('Signal SIGINT reçu, fermeture propre');
    demonstrationStore.clearSuggestionCache();
    demoLogger.close();
  });
}