/**
 * @fileOverview ToolformerLocal - Innovation 17.
 * Capacité d'auto-apprentissage et d'utilisation d'outils sans fine-tuning.
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
import { searchIntelligent } from '@/ai/rag/intelligent-retriever';
import { workflowOrchestrator, TaskGraph } from '../orchestration/workflow-orchestrator';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// CONFIGURATION DU LOGGER STRUCTURÉ
// ============================================================================

const toolformerLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.json(),
    format.printf(({ timestamp, level, message, module, toolName, actionId, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        module: 'ToolformerLocal',
        toolName,
        actionId,
        message,
        ...meta
      });
    })
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, toolName, actionId, ...meta }) => {
          const prefix = `[${timestamp}] ${level}`;
          const tool = toolName ? `[tool:${toolName}]` : '';
          const action = actionId ? `[action:${actionId}]` : '';
          return `${prefix} ${tool} ${action} ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    }),
    new DailyRotateFile({
      filename: 'logs/toolformer-%DATE%.log',
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

export interface Tool {
  name: string;
  description: string;
  parameters: string[];
  examples: { query: string; params: any }[];
  dangerous?: boolean;
  usageCount?: number;
  successCount?: number;
  lastUsed?: number;
}

export interface Action {
  type: 'respond' | 'use_tool';
  tool?: string;
  params?: any;
  expectedOutcome?: string;
  confidence?: number;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
}

export interface ToolMetrics {
  totalDecisions: number;
  toolUsageCount: number;
  responseCount: number;
  toolSuccessRate: number;
  averageDecisionTime: number;
  toolUsage: Map<string, ToolStats>;
}

export interface ToolStats {
  name: string;
  usageCount: number;
  successCount: number;
  successRate: number;
  avgExecutionTime: number;
  lastUsed: number;
}

export interface DecisionOptions {
  timeout?: number;
  forceTool?: string;
  minConfidence?: number;
  recordMetrics?: boolean;
  useCache?: boolean;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const DEFAULT_TIMEOUT = 5000;
const MIN_CONFIDENCE = 0.6;
const CACHE_NAMESPACE = 'decision';
const CACHE_TTL_SECONDS = 300;

const HEURISTIC_PATTERNS = {
  calculate: /calcul[e]?|combien|total[e]?|moyenne|pourcentage|somme|\d+\s*[\+\-\*\/\.]|\%|fois|multiplié|divisé/i,
  summarize: /résum[e]?|synth[èe]se|court|condens[e]?|essentiel|récapitul/i,
  search: /recherch[e]?|trouv[e]?|fichiers?|docs?|document|manuel|procédur[e]?|info/i,
  analyze: /analys[e]?|étudi[e]?|examin[e]?|vérifi[e]?|contrôl[e]?|diagnost/i
};

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
// CLASSE PRINCIPALE
// ============================================================================

export class ToolformerLocal {
  private tools: Map<string, Tool> = new Map();
  private metrics: ToolMetrics = {
    totalDecisions: 0,
    toolUsageCount: 0,
    responseCount: 0,
    toolSuccessRate: 0,
    averageDecisionTime: 0,
    toolUsage: new Map()
  };
  private decisionCache: Map<string, Action> = new Map();

  constructor() {
    toolformerLogger.info('Initialisation du ToolformerLocal (Core SQLite)');
    this.initializeTools();
    this.startMetricsLogger();
    this.loadCachedDecisions();
  }

  private async loadCachedDecisions(): Promise<void> {
    await ensureInitialized();
    const stats = db.getStats();
    const decisionStats = stats.find((s: { namespace: string; }) => s.namespace === CACHE_NAMESPACE);
    if (decisionStats && decisionStats.size > 0) {
      toolformerLogger.info('Décisions chargées depuis SQLite', { count: decisionStats.size });
    }
  }
  
  private initializeTools() {
    this.tools.set('search', {
      name: 'search',
      description: 'Rechercher des informations techniques précises dans la base locale.',
      parameters: ['query: string', 'limit: number'],
      examples: [{ query: 'pression max chaudière', params: { query: 'seuil pression', limit: 3 } }],
      usageCount: 0,
      successCount: 0,
      lastUsed: 0
    });

    this.tools.set('calculate', {
      name: 'calculate',
      description: 'Calculs mathématiques, conversions d\'unités et statistiques.',
      parameters: ['expression: string'],
      examples: [{ query: '20% de 500', params: { expression: '500 * 0.2' } }],
      usageCount: 0,
      successCount: 0,
      lastUsed: 0
    });

    this.tools.set('summarize', {
      name: 'summarize',
      description: 'Synthétiser un long document technique ou un rapport.',
      parameters: ['text: string', 'format: "bullet" | "paragraph"'],
      examples: [{ query: 'résume ce log', params: { text: '...', format: 'bullet' } }],
      usageCount: 0,
      successCount: 0,
      lastUsed: 0
    });

    this.tools.set('analyze', {
      name: 'analyze',
      description: 'Analyser des données techniques et identifier des anomalies.',
      parameters: ['data: any', 'metric: string'],
      examples: [{ query: 'analyse les performances', params: { data: {}, metric: 'performance' } }],
      usageCount: 0,
      successCount: 0,
      lastUsed: 0
    });

    toolformerLogger.info('Outils initialisés', { toolsCount: this.tools.size });
  }

  async planWorkflow(query: string, context: string): Promise<TaskGraph> {
    toolformerLogger.info('Planification de workflow multi-agents', { query });
    
    const toolList = Array.from(this.tools.values())
        .map(t => `- ${t.name}: ${t.description} (Params: ${t.parameters.join(', ')})`)
        .join('\n');

    const prompt = `Tu es un Architecte de Workflows IA. Décompose la requête suivante en un graphe de tâches (DAG) utilisant les outils disponibles.
    
    OUTILS DISPONIBLES:
    ${toolList}
    
    RÈGLES:
    - Utilise des dépendances (dependencies) si une tâche a besoin du résultat d'une autre.
    - Utilise {{task_id.result.xxx}} pour injecter un résultat dans les paramètres d'une tâche suivante.
    - Favorise le parallélisme pour les tâches indépendantes.
    
    REQUÊTE: "${query}"
    CONTEXTE: ${context.substring(0, 500)}
    
    Génère un JSON STRICT:
    {
      "tasks": [
        { "id": "t1", "toolName": "search", "params": {"query": "..."}, "dependencies": [], "outputKey": "docs" },
        { "id": "t2", "toolName": "summarize", "params": {"text": "{{t1.result.results[0].content}}"}, "dependencies": ["t1"], "outputKey": "summary" }
      ]
    }`;

    try {
        const response = await callOllama(prompt, { model: 'phi3.5:latest', temperature: 0.1 });
        const match = response.match(/\{.*\}/s);
        if (match) {
            const data = JSON.parse(match[0]);
            return {
                id: uuidv4(),
                tasks: data.tasks.map((t: any) => ({ ...t, status: 'pending' }))
            };
        }
    } catch (error) {
        toolformerLogger.error('Échec planification workflow', { error });
    }
    
    return { id: uuidv4(), tasks: [{ id: 't1', toolName: 'search', params: { query }, dependencies: [], status: 'pending' }] };
  }

  async executeWorkflow(graph: TaskGraph): Promise<Record<string, any>> {
    toolformerLogger.info('Début exécution workflow', { graphId: graph.id, taskCount: graph.tasks.length });
    
    const startTime = Date.now();
    try {
        const results = await workflowOrchestrator.executeWorkflow(graph, async (name, params) => {
            const res = await this.executeTool(name, params);
            if (!res.success) throw new Error(res.error);
            return res.result;
        });

        toolformerLogger.info('Workflow terminé avec succès', { 
            graphId: graph.id, 
            duration: `${Date.now() - startTime}ms` 
        });
        return results;
    } catch (error) {
        toolformerLogger.error('Échec exécution workflow', { graphId: graph.id, error });
        throw error;
    }
  }

  async decideAction(query: string, context: string, options?: DecisionOptions): Promise<Action> {
    await ensureInitialized();
    
    const startTime = Date.now();
    const actionId = uuidv4();
    const opts = { ...options, timeout: options?.timeout || DEFAULT_TIMEOUT };
    
    toolformerLogger.info('Analyse d\'intention', {
      actionId,
      query: query.substring(0, 100),
      contextLength: context.length,
      forceTool: opts.forceTool
    });
    
    this.metrics.totalDecisions++;
    
    const cacheKey = `${query}-${context.substring(0, 100)}`;
    
    if (opts.useCache !== false) {
      const cached = db.get<Action>(CACHE_NAMESPACE, cacheKey);
      if (cached && !opts.forceTool) {
        toolformerLogger.debug('Décision récupérée du cache', { actionId, tool: cached.tool });
        return cached;
      }
    }

    try {
      const decisionPromise = this.performDecision(query, context, opts, actionId);
      const timeoutPromise = new Promise<Action>((_, reject) => {
        setTimeout(() => reject(new Error(`Décision timeout après ${opts.timeout}ms`)), opts.timeout);
      });
      
      const action = await Promise.race([decisionPromise, timeoutPromise]);
      
      const decisionTime = Date.now() - startTime;
      this.metrics.averageDecisionTime = 
        (this.metrics.averageDecisionTime * (this.metrics.totalDecisions - 1) + decisionTime) / this.metrics.totalDecisions;
      
      if (action.type === 'use_tool' && opts.useCache !== false) {
        db.set(CACHE_NAMESPACE, cacheKey, action, CACHE_TTL_SECONDS);
        this.decisionCache.set(cacheKey, action);
        if (this.decisionCache.size > 100) this.cleanupMemoryCache();
      }
      
      toolformerLogger.info('Décision prise', {
        actionId,
        actionType: action.type,
        tool: action.tool,
        confidence: action.confidence,
        decisionTime: `${decisionTime}ms`
      });
      
      return action;
      
    } catch (error) {
      toolformerLogger.error('Échec décision d\'action', {
        actionId,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      });
      this.metrics.responseCount++;
      return { type: 'respond' };
    }
  }

  private async performDecision(
    query: string, 
    _context: string, 
    options: DecisionOptions,
    actionId: string
  ): Promise<Action> {
    if (options.forceTool && this.tools.has(options.forceTool)) {
      const tool = this.tools.get(options.forceTool)!;
      const params = await this.generateParams(query, tool, actionId);
      const outcome = await this.predictOutcome(tool, params);
      return { type: 'use_tool', tool: tool.name, params, expectedOutcome: outcome, confidence: 0.95 };
    }
    
    const needsTool = await this.shouldUseTool(query, actionId);
    if (!needsTool) {
      this.metrics.responseCount++;
      return { type: 'respond' };
    }

    const tool = await this.selectTool(query, actionId);
    if (!tool) {
      this.metrics.responseCount++;
      return { type: 'respond' };
    }

    const params = await this.generateParams(query, tool, actionId);
    if (!this.validateParams(tool, params)) {
      toolformerLogger.warn('Paramètres invalides', { actionId, toolName: tool.name, params });
      return { type: 'respond' };
    }
    
    const outcome = await this.predictOutcome(tool, params);
    const confidence = this.calculateConfidence(tool, params, query);
    
    tool.usageCount = (tool.usageCount || 0) + 1;
    tool.lastUsed = Date.now();
    this.updateToolMetrics(tool);

    return { type: 'use_tool', tool: tool.name, params, expectedOutcome: outcome, confidence };
  }

  async executeTool(toolName: string, params: any): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const tool = this.tools.get(toolName);
    
    toolformerLogger.info('Exécution d\'outil', { toolName, params });
    
    if (!tool) {
      return { success: false, error: `Outil "${toolName}" non trouvé`, executionTime: Date.now() - startTime };
    }
    
    try {
      const result = await this.executeToolReal(tool, params);
      const executionTime = Date.now() - startTime;
      
      tool.successCount = (tool.successCount || 0) + 1;
      this.updateToolMetrics(tool);
      
      toolformerLogger.info('Outil exécuté avec succès', { toolName, executionTime: `${executionTime}ms` });
      return { success: true, result, executionTime };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toolformerLogger.error('Échec exécution outil', { toolName, error: errorMessage });
      return { success: false, error: errorMessage, executionTime: Date.now() - startTime };
    }
  }

  private async executeToolReal(tool: Tool, params: any): Promise<any> {
    switch (tool.name) {
      case 'search':
        try {
          const results = await searchIntelligent(params.query, { nResults: params.limit || 3 });
          return { results: results.map(r => ({
            title: r.citations[0] || 'Source technique',
            content: r.content.substring(0, 200) + '...',
            relevance: r.score
          })) };
        } catch (error) {
          toolformerLogger.error('Erreur recherche', error);
          return { error: 'Échec de la recherche vectorielle' };
        }
        
      case 'calculate':
        if (params.expression) {
          try {
            const expr = params.expression.trim();
            
            if (!/^[\d\s\+\-\*\/\.\(\)%]+$/.test(expr)) {
              return { error: 'Expression mathématique invalide' };
            }
            
            const result = new Function(`return (${expr})`)();
            
            if (typeof result !== 'number' || !isFinite(result)) {
              return { error: 'Résultat de calcul invalide' };
            }
            
            return { result };
          } catch {
            return { error: 'Expression mathématique invalide' };
          }
        }
        return { error: 'Aucune expression fournie' };
        
      case 'summarize':
        try {
          const prompt = `Résume de manière concise et technique le texte suivant (format: ${params.format || 'bullet'}):\n\n${params.text}`;
          const summary = await callOllama(prompt, { 
            model: 'phi:2.7b', 
            temperature: 0.3, 
            maxTokens: 500 
          });
          return { summary };
        } catch (error) {
          return { error: 'Échec de la synthèse IA' };
        }
        
      case 'analyze':
        try {
          const prompt = `Analyse ces données techniques pour la métrique "${params.metric}":\n\n${JSON.stringify(params.data)}\n\nIdentifie les anomalies et donne un score de performance.`;
          const analysis = await callOllama(prompt, { 
            model: 'phi:2.7b', 
            temperature: 0.3, 
            maxTokens: 500 
          });
          return { analysis };
        } catch (error) {
          return { error: 'Échec de l\'analyse technique' };
        }
        
      default:
        return { message: `L'outil ${tool.name} a été appelé.` };
    }
  }

  private async shouldUseTool(query: string, _actionId?: string): Promise<boolean> {
    const q = query.toLowerCase();
    
    if (Object.values(HEURISTIC_PATTERNS).some(pattern => pattern.test(q))) {
      return true;
    }
    
    if (q.match(/bonjour|salut|merci|au revoir|help/i)) {
      return false;
    }
    
    try {
      const prompt = `Réponds UNIQUEMENT par YES ou NO. La requête "${query}" nécessite-t-elle un outil technique (calcul, recherche, analyse, synthèse) ?`;
      
      const response = await callOllama(prompt, { 
        model: 'tinyllama:latest', 
        temperature: 0.1, 
        maxTokens: 10 
      });
      return response.trim().toUpperCase().includes('YES');
      
    } catch (error) {
      return Object.values(HEURISTIC_PATTERNS).some(pattern => pattern.test(q));
    }
  }
  
  private async selectTool(query: string, actionId?: string): Promise<Tool | null> {
    const q = query.toLowerCase();
    
    if (HEURISTIC_PATTERNS.calculate.test(q)) return this.tools.get('calculate') || null;
    if (HEURISTIC_PATTERNS.summarize.test(q)) return this.tools.get('summarize') || null;
    if (HEURISTIC_PATTERNS.search.test(q)) return this.tools.get('search') || null;
    if (HEURISTIC_PATTERNS.analyze.test(q)) return this.tools.get('analyze') || null;
    
    try {
      const toolList = Array.from(this.tools.values()).map(t => `${t.name}: ${t.description}`).join('\n');
      const prompt = `Tu es un assistant qui sélectionne l'outil le plus approprié pour une requête.
      
      Requête utilisateur: "${query}"
      Outils disponibles:\n${toolList}
      Sélectionne l'outil le plus approprié. Réponds UNIQUEMENT par le nom de l'outil.`;
      
      const response = await callOllama(prompt, { 
        model: 'phi:2.7b', 
        temperature: 0.1, 
        maxTokens: 20 
      });
      const toolName = response.trim().toLowerCase();
      return this.tools.get(toolName) || null;
      
    } catch (error) {
      toolformerLogger.warn('Échec sélection LLM', { actionId });
      return null;
    }
  }

  private async generateParams(query: string, tool: Tool, actionId?: string): Promise<any> {
    try {
      const prompt = `Tu es un extracteur de paramètres JSON pour l'outil: ${tool.name}.
      Extrais UNIQUEMENT les paramètres suivants: ${tool.parameters.join(', ')}
      Réponds en JSON STRICT.
      
      Question: "${query}"
      Exemple: ${JSON.stringify(tool.examples[0]?.params || {})}`;
      
      const response = await callOllama(prompt, { 
        model: 'tinyllama:latest', 
        temperature: 0.1, 
        maxTokens: 200 
      });
      const match = response.match(/\{.*\}/s);
      if (match) return JSON.parse(match[0]);
      
    } catch (error) {
      toolformerLogger.warn('Échec génération paramètres', { actionId, toolName: tool.name });
    }
    return {};
  }

  private validateParams(tool: Tool, params: any): boolean {
    for (const param of tool.parameters) {
      const paramName = param.split(':')[0].trim();
      if (!params[paramName]) return false;
    }
    return true;
  }

  private async predictOutcome(tool: Tool, params: any): Promise<string> {
    return `L'outil ${tool.name} va traiter la demande avec les paramètres ${JSON.stringify(params)}.`;
  }

  private calculateConfidence(tool: Tool, params: any, query: string): number {
    let confidence = MIN_CONFIDENCE;
    
    if (tool.successCount && tool.usageCount) {
      confidence += (tool.successCount / tool.usageCount) * 0.2;
    }
    
    if (Object.keys(params).length >= tool.parameters.length) {
      confidence += 0.1;
    }
    
    if (tool.examples.some(ex => query.toLowerCase().includes(ex.query.toLowerCase()))) {
      confidence += 0.1;
    }
    
    return Math.min(0.95, confidence);
  }

  private updateToolMetrics(tool: Tool): void {
    const stats: ToolStats = {
      name: tool.name,
      usageCount: tool.usageCount || 0,
      successCount: tool.successCount || 0,
      successRate: tool.usageCount ? ((tool.successCount || 0) / tool.usageCount) * 100 : 0,
      avgExecutionTime: 0,
      lastUsed: tool.lastUsed || 0
    };
    
    this.metrics.toolUsage.set(tool.name, stats);
    
    const totalToolUses = Array.from(this.metrics.toolUsage.values())
      .reduce((sum, s) => sum + (s.usageCount || 0), 0);
    
    const totalSuccesses = Array.from(this.metrics.toolUsage.values())
      .reduce((sum, s) => sum + (s.successCount || 0), 0);
      
    this.metrics.toolSuccessRate = totalToolUses > 0 ? (totalSuccesses / totalToolUses) * 100 : 0;
    this.metrics.toolUsageCount = totalToolUses;
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key] of this.decisionCache.entries()) {
      const timestamp = parseInt(key.split('-')[1] || '0');
      if (now - timestamp > CACHE_TTL_SECONDS * 1000) {
        this.decisionCache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      toolformerLogger.debug('Cache mémoire nettoyé', { cleanedCount, remainingSize: this.decisionCache.size });
    }
  }

  private startMetricsLogger(): void {
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        toolformerLogger.info('Métriques périodiques', {
          totalDecisions: this.metrics.totalDecisions,
          toolUsageCount: this.metrics.toolUsageCount,
          responseCount: this.metrics.responseCount,
          toolSuccessRate: this.metrics.toolSuccessRate.toFixed(2) + '%',
          avgDecisionTime: this.metrics.averageDecisionTime.toFixed(2) + 'ms'
        });
      }, 5 * 60 * 1000);
    }
  }

  getMetrics(): ToolMetrics {
    return {
      ...this.metrics,
      toolUsage: new Map(this.metrics.toolUsage)
    };
  }

  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  registerTool(tool: Tool): void {
    toolformerLogger.info('Enregistrement d\'un nouvel outil', { toolName: tool.name });
    this.tools.set(tool.name, { ...tool, usageCount: 0, successCount: 0, lastUsed: 0 });
  }

  cleanup(): void {
    this.decisionCache.clear();
    toolformerLogger.info('Toolformer nettoyé');
  }
}

export const toolformer = new ToolformerLocal();

// ============================================================================
// EXPORT POUR TESTING
// ============================================================================

export const __testables__ = {
  HEURISTIC_PATTERNS,
  DEFAULT_TIMEOUT,
  MIN_CONFIDENCE,
  CACHE_NAMESPACE,
  ensureInitialized
};

// ============================================================================
// GESTION DES SIGNAUX
// ============================================================================

if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    toolformerLogger.info('Signal SIGTERM reçu, fermeture propre');
    toolformer.cleanup();
  });
  process.on('SIGINT', () => {
    toolformerLogger.info('Signal SIGINT reçu, fermeture propre');
    toolformer.cleanup();
  });
}