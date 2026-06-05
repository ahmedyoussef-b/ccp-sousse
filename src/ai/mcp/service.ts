/**
 * @fileOverview MCP Service - Service d'exécution des outils MCP
 * Version Core SQLite - Persistance cache et métriques
 * 
 * @version 3.0.0
 * @lastUpdated 2026-04-24
 */

import ReversibleExecutor from '@/ai/actions/reversible-executor';
import { SQLiteCore } from '@/ai/core/sqlite';
import { createHash } from 'crypto';

// ============================================================================
// LOGGER SIMPLIFIÉ
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class SimpleLogger {
  private level: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  private logToConsole = true;

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.level];
  }

  private format(level: LogLevel, module: string, message: string, meta?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()} [${module}] ${message}${metaStr}`;
  }

  debug(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('debug')) {
      const formatted = this.format('debug', 'MCPService', message, meta);
      if (this.logToConsole) console.log(`\x1b[36m${formatted}\x1b[0m`);
    }
  }

  info(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('info')) {
      const formatted = this.format('info', 'MCPService', message, meta);
      if (this.logToConsole) console.log(`\x1b[32m${formatted}\x1b[0m`);
    }
  }

  warn(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('warn')) {
      const formatted = this.format('warn', 'MCPService', message, meta);
      if (this.logToConsole) console.log(`\x1b[33m${formatted}\x1b[0m`);
    }
  }

  error(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('error')) {
      const formatted = this.format('error', 'MCPService', message, meta);
      if (this.logToConsole) console.log(`\x1b[31m${formatted}\x1b[0m`);
    }
  }
}

const logger = new SimpleLogger();

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
// TYPES ET INTERFACES
// ============================================================================

export type MCPTool = 
  | 'calendar'
  | 'email'
  | 'search'
  | 'documents'
  | 'calculator'
  | 'notification'
  | 'rag'
  | 'memory';

export interface MCPToolParams {
  tool: MCPTool;
  action: string;
  parameters: Record<string, any>;
  userId?: string;
  sessionId?: string;
  options?: {
    reversible?: boolean;
    timeout?: number;
    retryCount?: number;
    skipCache?: boolean;
  };
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime: number;
  tool: MCPTool;
  action: string;
  requestId?: string;
  fromCache?: boolean;
}

export interface MCPServiceMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  toolsUsage: Map<string, number>;
  actionsUsage: Map<string, number>;
  errorRate: number;
  cacheHitRate: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 2;
const METRICS_UPDATE_INTERVAL = 60000;
const MCP_CACHE_NAMESPACE = 'mcp_cache';
const MCP_CACHE_TTL_SECONDS = 300;

// ============================================================================
// TOOL CACHE AVEC SQLITE
// ============================================================================

class ToolCacheSQLite {
  async getKey(tool: MCPTool, action: string, params: Record<string, any>): Promise<string> {
    return createHash('md5')
      .update(`${tool}:${action}:${JSON.stringify(params)}`)
      .digest('hex');
  }

  async get(key: string): Promise<unknown | null> {
    await ensureInitialized();
    return db.get(MCP_CACHE_NAMESPACE, key);
  }

  async set(key: string, data: unknown, ttlSeconds: number = MCP_CACHE_TTL_SECONDS): Promise<void> {
    await ensureInitialized();
    db.set(MCP_CACHE_NAMESPACE, key, data, ttlSeconds);
    logger.debug('Cache SET SQLite', { key, ttl: `${ttlSeconds}s` });
  }

  async clear(): Promise<void> {
    await ensureInitialized();
    const count = db.clearNamespace(MCP_CACHE_NAMESPACE);
    logger.info('Cache vidé', { clearedCount: count });
  }

  async getStats(): Promise<{ size: number; hitRate: number }> {
    await ensureInitialized();
    const stats = db.getStats();
    const mcpStats = stats.find((s: { namespace: string; }) => s.namespace === MCP_CACHE_NAMESPACE);
    return { 
      size: mcpStats?.size || 0,
      hitRate: mcpStats?.hitRate || 0
    };
  }
}

const toolCache = new ToolCacheSQLite();

// ============================================================================
// MÉTRIQUES SQLITE
// ============================================================================

async function updateMetrics(tool: MCPTool, action: string, success: boolean, executionTime: number): Promise<void> {
  await ensureInitialized();
  await db.recordMetric('mcp', 'total_executions', 1);
  await db.recordMetric('mcp', success ? 'successful_executions' : 'failed_executions', 1);
  await db.recordMetric('mcp', 'execution_time', executionTime);
  await db.recordMetric('mcp', `tool_${tool}`, 1);
  await db.recordMetric('mcp', `action_${tool}_${action}`, 1);
}

// Mise à jour périodique des logs
if (typeof setInterval !== 'undefined') {
  setInterval(async () => {
    const metrics = await getMetrics();
    if (metrics.totalExecutions > 0) {
      logger.info('Métriques MCP (périodiques)', {
        totalExecutions: metrics.totalExecutions,
        successRate: ((metrics.successfulExecutions / metrics.totalExecutions) * 100).toFixed(2) + '%',
        avgTime: metrics.averageExecutionTime.toFixed(2) + 'ms',
        errorRate: metrics.errorRate.toFixed(2) + '%',
        cacheHitRate: metrics.cacheHitRate.toFixed(2) + '%'
      });
    }
  }, METRICS_UPDATE_INTERVAL);
}

// ============================================================================
// READ-ONLY ACTIONS (pour cache automatique)
// ============================================================================

const readOnlyActions: Record<MCPTool, string[]> = {
  calendar: ['read', 'checkAvailability', 'listEvents'],
  email: ['read', 'list'],
  search: ['web', 'documents'],
  documents: ['read', 'list'],
  calculator: ['calculate'],
  notification: [],
  rag: ['search'],
  memory: ['retrieve']
};

// ============================================================================
// FONCTION PRINCIPALE D'EXÉCUTION
// ============================================================================

export async function executeMCPTool(params: MCPToolParams): Promise<MCPToolResult> {
  await ensureInitialized();
  
  const startTime = Date.now();
  const requestId = `${params.tool}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  
  logger.info('Exécution outil MCP', {
    requestId,
    tool: params.tool,
    action: params.action,
    userId: params.userId,
    sessionId: params.sessionId,
    hasParams: Object.keys(params.parameters).length
  });
  
  const isReadOnly = readOnlyActions[params.tool]?.includes(params.action) || false;
  const skipCache = params.options?.skipCache === true;
  
  if (isReadOnly && !skipCache) {
    const cacheKey = await toolCache.getKey(params.tool, params.action, params.parameters);
    const cached = await toolCache.get(cacheKey);
    if (cached) {
      const executionTime = Date.now() - startTime;
      logger.debug('Résultat retourné depuis le cache SQLite', { requestId, tool: params.tool });
      
      return {
        success: true,
        data: cached,
        executionTime,
        tool: params.tool,
        action: params.action,
        requestId,
        fromCache: true
      };
    }
  }
  
  try {
    const executor = new ReversibleExecutor();
    
    const action = {
      type: `mcp_${params.tool}`,
      description: `Exécution de ${params.tool}.${params.action}`,
      execute: async () => {
        return await executeToolAction(params.tool, params.action, params.parameters);
      }
    };
    
    const timeout = params.options?.timeout || DEFAULT_TIMEOUT;
    const retryCount = params.options?.retryCount || MAX_RETRIES;
    
    let lastError: Error | null = null;
    let result: unknown = null;
    
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        if (attempt > 0) {
          const waitTime = Math.pow(2, attempt - 1) * 1000;
          logger.debug('Tentative de réexécution', {
            requestId,
            attempt,
            waitTime: `${waitTime}ms`
          });
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        const executionPromise = executor.execute(action, params.parameters, { 
          reversible: params.options?.reversible !== false,
          timeout 
        });
        
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout après ${timeout}ms`)), timeout);
        });
        
        const executionResult = await Promise.race([executionPromise, timeoutPromise]);
        result = executionResult.result;
        lastError = null;
        break;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn('Tentative échouée', {
          requestId,
          attempt,
          error: lastError.message
        });
      }
    }
    
    if (lastError) throw lastError;
    
    const executionTime = Date.now() - startTime;
    
    if (isReadOnly && result && !skipCache) {
      const cacheKey = await toolCache.getKey(params.tool, params.action, params.parameters);
      await toolCache.set(cacheKey, result);
    }
    
    await updateMetrics(params.tool, params.action, true, executionTime);
    
    logger.info('Outil exécuté avec succès', {
      requestId,
      tool: params.tool,
      action: params.action,
      executionTime: `${executionTime}ms`
    });
    
    return {
      success: true,
      data: result,
      executionTime,
      tool: params.tool,
      action: params.action,
      requestId,
      fromCache: false
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    const executionTime = Date.now() - startTime;
    
    logger.error('Échec exécution outil', {
      requestId,
      tool: params.tool,
      action: params.action,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      executionTime: `${executionTime}ms`
    });
    
    await updateMetrics(params.tool, params.action, false, executionTime);
    
    return {
      success: false,
      error: errorMessage,
      executionTime,
      tool: params.tool,
      action: params.action,
      requestId
    };
  }
}

// ============================================================================
// EXÉCUTION SPÉCIFIQUE DES OUTILS
// ============================================================================

async function executeToolAction(tool: MCPTool, action: string, parameters: Record<string, any>): Promise<unknown> {
  switch (tool) {
    case 'calendar':
      return await executeCalendarAction(action, parameters);
    case 'email':
      return await executeEmailAction(action, parameters);
    case 'search':
      return await executeSearchAction(action, parameters);
    case 'documents':
      return await executeDocumentAction(action, parameters);
    case 'calculator':
      return await executeCalculatorAction(action, parameters);
    case 'notification':
      return await executeNotificationAction(action, parameters);
    case 'rag':
      return await executeRAGAction(action, parameters);
    case 'memory':
      return await executeMemoryAction(action, parameters);
    default:
      throw new Error(`Outil non supporté: ${tool}`);
  }
}

// ============================================================================
// IMPLÉMENTATIONS SPÉCIFIQUES DES OUTILS
// ============================================================================

async function executeCalendarAction(action: string, params: Record<string, any>): Promise<unknown> {
  switch (action) {
    case 'createEvent':
      logger.debug('Création événement calendrier', { 
        title: params.title?.substring(0, 50),
        start: params.start,
        end: params.end
      });
      return { 
        eventId: `evt_${Date.now()}`, 
        ...params,
        createdAt: new Date().toISOString()
      };
      
    case 'checkAvailability':
      logger.debug('Vérification disponibilité', { date: params.date });
      return { 
        available: true, 
        slots: ['10:00', '14:00', '16:00'],
        date: params.date || new Date().toISOString()
      };
      
    case 'listEvents':
      logger.debug('Liste des événements', { startDate: params.startDate, endDate: params.endDate });
      return {
        events: [
          { id: '1', title: 'Maintenance TG1', start: '2026-03-29T10:00:00', end: '2026-03-29T12:00:00' }
        ]
      };
      
    default:
      logger.warn('Action calendaire non reconnue', { action });
      return { success: true, action, params };
  }
}

async function executeEmailAction(action: string, params: Record<string, any>): Promise<unknown> {
  switch (action) {
    case 'send':
      if (!params.to) {
        throw new Error('Destinataire requis pour l\'envoi d\'email');
      }
      logger.info('Envoi email', { 
        to: params.to, 
        subject: params.subject?.substring(0, 50),
        hasBody: !!params.body
      });
      return { 
        messageId: `msg_${Date.now()}`, 
        sent: true,
        timestamp: new Date().toISOString()
      };
      
    case 'draft':
      logger.debug('Création brouillon email', { subject: params.subject?.substring(0, 50) });
      return { 
        draftId: `dft_${Date.now()}`, 
        content: params.content,
        createdAt: new Date().toISOString()
      };
      
    default:
      logger.warn('Action email non reconnue', { action });
      return { success: true, action, params };
  }
}

async function executeSearchAction(action: string, params: Record<string, any>): Promise<unknown> {
  switch (action) {
    case 'web':
      if (!params.query) {
        throw new Error('Requête de recherche web requise');
      }
      logger.debug('Recherche web', { query: params.query.substring(0, 100) });
      return { 
        results: [
          { title: `Résultat pour: ${params.query}`, relevance: 0.95, url: '#' }
        ],
        totalResults: 1,
        query: params.query
      };
      
    case 'documents':
      if (!params.query) {
        throw new Error('Requête de recherche documents requise');
      }
      logger.debug('Recherche documents', { query: params.query.substring(0, 100) });
      return { 
        results: [
          { id: 'doc1', title: `Document trouvé: ${params.query}`, type: 'pdf' }
        ],
        totalResults: 1
      };
      
    default:
      logger.warn('Action recherche non reconnue', { action });
      return { success: true, action, params };
  }
}

async function executeDocumentAction(action: string, params: Record<string, any>): Promise<unknown> {
  switch (action) {
    case 'create':
      if (!params.title) {
        throw new Error('Titre requis pour la création de document');
      }
      logger.info('Création document', { 
        title: params.title?.substring(0, 50),
        contentLength: params.content?.length || 0
      });
      return { 
        documentId: `doc_${Date.now()}`,
        ...params,
        createdAt: new Date().toISOString()
      };
      
    case 'read':
      if (!params.documentId) {
        throw new Error('ID du document requis');
      }
      logger.debug('Lecture document', { documentId: params.documentId });
      return { 
        content: `Contenu du document ${params.documentId}`,
        metadata: { version: '1.0', lastModified: new Date().toISOString() }
      };
      
    case 'update':
      if (!params.documentId) {
        throw new Error('ID du document requis');
      }
      logger.info('Mise à jour document', { documentId: params.documentId });
      return { 
        success: true,
        documentId: params.documentId,
        updatedAt: new Date().toISOString()
      };
      
    default:
      logger.warn('Action document non reconnue', { action });
      return { success: true, action, params };
  }
}

async function executeCalculatorAction(action: string, params: Record<string, any>): Promise<unknown> {
  if (action !== 'calculate') {
    logger.warn('Action calculatrice non reconnue', { action });
    return { success: true, action, params };
  }
  
  const expression = params.expression;
  
  if (!expression || typeof expression !== 'string') {
    throw new Error('Expression invalide: expression requise');
  }
  
  const allowedChars = /^[0-9+\-*/%().\s]+$/;
  if (!allowedChars.test(expression)) {
    throw new Error('Caractères non autorisés dans l\'expression');
  }
  
  if (expression.length > 200) {
    throw new Error('Expression trop longue (max 200 caractères)');
  }
  
  try {
    const result = new Function(`return (${expression})`)();
    
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error('Résultat de calcul invalide');
    }
    
    logger.debug('Calcul effectué', { expression, result });
    return { result, expression };
    
  } catch (error) {
    throw new Error(`Erreur de calcul: ${error instanceof Error ? error.message : 'Expression invalide'}`);
  }
}

async function executeNotificationAction(action: string, params: Record<string, any>): Promise<unknown> {
  if (action !== 'send') {
    logger.warn('Action notification non reconnue', { action });
    return { success: true, action, params };
  }
  
  if (!params.message) {
    throw new Error('Message requis pour la notification');
  }
  
  logger.info('Notification envoyée', { 
    message: params.message?.substring(0, 100),
    priority: params.priority || 'normal'
  });
  
  return { 
    notificationId: `notif_${Date.now()}`,
    sent: true,
    timestamp: new Date().toISOString()
  };
}

async function executeRAGAction(action: string, params: Record<string, any>): Promise<unknown> {
  if (action !== 'search') {
    logger.warn('Action RAG non reconnue', { action });
    return { success: true, action, params };
  }
  
  if (!params.query) {
    throw new Error('Requête de recherche RAG requise');
  }
  
  logger.debug('Recherche RAG', { 
    query: params.query.substring(0, 100), 
    collection: params.collection 
  });
  
  return {
    results: [
      { content: `Résultat RAG pour: ${params.query}`, relevance: 0.92, source: params.collection || 'default' }
    ]
  };
}

async function executeMemoryAction(action: string, params: Record<string, any>): Promise<unknown> {
  switch (action) {
    case 'store':
      if (!params.key) {
        throw new Error('Clé requise pour le stockage mémoire');
      }
      logger.debug('Stockage mémoire', { key: params.key });
      // Persister en SQLite
      await ensureInitialized();
      db.set('mcp_memory', params.key, params.value || { stored: true }, 3600);
      return { success: true, stored: true, key: params.key };
      
    case 'retrieve':
      if (!params.key) {
        throw new Error('Clé requise pour la récupération mémoire');
      }
      logger.debug('Récupération mémoire', { key: params.key });
      await ensureInitialized();
      const value = db.get('mcp_memory', params.key);
      return { data: value || `Aucune donnée pour: ${params.key}`, key: params.key };
      
    default:
      logger.warn('Action mémoire non reconnue', { action });
      return { success: true, action, params };
  }
}

// ============================================================================
// FONCTIONS D'HISTORIQUE
// ============================================================================

export async function recordAction(
  type: string,
  params: Record<string, any>,
  userId?: string
): Promise<string> {
  const startTime = Date.now();
  
  logger.info('Enregistrement action', { type, userId });
  
  const executor = new ReversibleExecutor();
  
  const action = {
    type,
    description: `Action ${type}`,
    execute: async () => {
      logger.debug('Exécution action enregistrée', { type, params });
      return { success: true, timestamp: Date.now() };
    }
  };
  
  const result = await executor.execute(action, { ...params, userId });
  
  logger.debug('Action enregistrée', {
    actionId: result.actionId,
    duration: Date.now() - startTime
  });
  
  return result.actionId;
}

export async function getActionHistory(
  filter?: { userId?: string; type?: string }
): Promise<unknown> {
  logger.debug('Récupération historique', filter);
  const executor = new ReversibleExecutor();
  return executor.getHistory(filter);
}

export async function undoLastAction(): Promise<boolean> {
  logger.info('Annulation dernière action');
  const executor = new ReversibleExecutor();
  const result = await executor.undo(1);
  logger.debug('Annulation effectuée', { success: result });
  return result;
}

export async function redoLastAction(): Promise<boolean> {
  logger.info('Rétablissement dernière action');
  const executor = new ReversibleExecutor();
  const result = await executor.redo(1);
  logger.debug('Rétablissement effectué', { success: result });
  return result;
}

// ============================================================================
// FONCTIONS DE GESTION
// ============================================================================

export async function clearToolCache(): Promise<void> {
  await toolCache.clear();
}

export async function getMetrics(): Promise<{
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  errorRate: number;
  cacheHitRate: number;
}> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  
  // Récupérer les métriques depuis la table metrics
  const total = dbInstance.prepare(`
    SELECT COUNT(*) as count FROM metrics WHERE module = 'mcp' AND metricName = 'total_executions'
  `).get() as { count: number };
  
  const successful = dbInstance.prepare(`
    SELECT COUNT(*) as count FROM metrics WHERE module = 'mcp' AND metricName = 'successful_executions'
  `).get() as { count: number };
  
  const times = dbInstance.prepare(`
    SELECT metricValue FROM metrics WHERE module = 'mcp' AND metricName = 'execution_time'
    ORDER BY timestamp DESC LIMIT 1000
  `).all() as { metricValue: number }[];
  
  const totalExecutions = total?.count || 0;
  const successfulExecutions = successful?.count || 0;
  const failedExecutions = totalExecutions - successfulExecutions;
  const averageExecutionTime = times.length > 0 
    ? times.reduce((s: number, m: { metricValue: number }) => s + m.metricValue, 0) / times.length 
    : 0;
  
  const cacheStats = await toolCache.getStats();
  
  return {
    totalExecutions,
    successfulExecutions,
    failedExecutions,
    averageExecutionTime: Math.round(averageExecutionTime),
    errorRate: totalExecutions > 0 ? (failedExecutions / totalExecutions) * 100 : 0,
    cacheHitRate: cacheStats.hitRate
  };
}
export async function getCacheStats(): Promise<{ size: number; hitRate: number }> {
  return toolCache.getStats();
}

export function resetMetrics(): void {
  logger.info('Réinitialisation des métriques');
  // Les métriques restent en base, reset est juste logique
}

// ============================================================================
// EXPORT
// ============================================================================

export { toolCache };