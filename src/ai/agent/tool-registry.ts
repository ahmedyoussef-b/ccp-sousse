/**
 * @fileOverview ToolRegistry - Gestionnaire intelligent des outils.
 * Version corrigée - remplacement de debug par info.
 * 
 * @version 3.2.0
 * @lastUpdated 2026-04-01
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { getAgentConfig } from './config/agent.config';
import { toolRegistryLogger } from './utils/logger';

// ============================================================================
// TYPES ET INTERFACES
// ============================================================================

export interface ToolCapability {
  name: string;
  type: 'SEARCH' | 'CALC' | 'COMM' | 'DOC';
  reliability: number;
  version?: string;
  description?: string;
  isAvailable?: boolean;
  lastUsed?: number;
  usageCount?: number;
  successCount?: number;
  averageLatency?: number;
}

export interface ToolRecommendation {
  toolName: string;
  confidence: number;
  reason: string;
  alternatives?: string[];
}

export interface RegistryMetrics {
  totalTools: number;
  availableTools: number;
  averageReliability: number;
  mostUsedTool: string;
  leastUsedTool: string;
  toolsByType: Record<string, number>;
  toolsReliability: Record<string, number>;
  recommendationsCount: number;
  averageRecommendationTime: number;
}

export interface RecommendationOptions {
  minReliability?: number;
  preferAvailable?: boolean;
  useHistory?: boolean;
  timeout?: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const config = getAgentConfig();
const DEFAULT_OPTIONS: RecommendationOptions = {
  minReliability: config.tools.minReliability,
  preferAvailable: true,
  useHistory: true,
  timeout: config.planner.timeout
};

const TOOL_PATTERNS: Record<string, RegExp> = {
  calculator: /calcul|chiffre|nombre|math|formule|combien|total|moyenne|somme|\d+\s*[\+\-\*\/]/i,
  email: /envoie|mail|message|notifier|alerte|communiquer/i,
  summarize: /résum|synthèse|court|condensé|essentiel/i,
  search: /recherch|trouv|fichiers|docs|document|manuel|procédure|base|données/i
};

// ============================================================================
// REGISTRE DES OUTILS
// ============================================================================

class ToolRegistry {
  private tools: Map<string, ToolCapability> = new Map();
  private metrics: RegistryMetrics;
  private recommendationHistory: Map<string, string[]> = new Map();

  constructor() {
    this.metrics = {
      totalTools: 0,
      availableTools: 0,
      averageReliability: 0,
      mostUsedTool: '',
      leastUsedTool: '',
      toolsByType: { SEARCH: 0, CALC: 0, COMM: 0, DOC: 0 },
      toolsReliability: {},
      recommendationsCount: 0,
      averageRecommendationTime: 0
    };
    
    this.initializeTools();
    toolRegistryLogger.info('INIT', `ToolRegistry initialisé - ${this.tools.size} outils`);
  }

  private initializeTools(): void {
    const tools: ToolCapability[] = [
      { name: 'search', type: 'SEARCH', reliability: 0.98, version: '1.0.0', description: 'Recherche documentaire avancée', isAvailable: true, usageCount: 0, successCount: 0, averageLatency: 0 },
      { name: 'calculator', type: 'CALC', reliability: 0.95, version: '1.2.0', description: 'Calculs mathématiques et conversions', isAvailable: true, usageCount: 0, successCount: 0, averageLatency: 0 },
      { name: 'email', type: 'COMM', reliability: 0.92, version: '1.1.0', description: 'Communication et notifications', isAvailable: true, usageCount: 0, successCount: 0, averageLatency: 0 },
      { name: 'summarize', type: 'DOC', reliability: 0.88, version: '1.0.0', description: 'Synthèse et résumé documentaire', isAvailable: true, usageCount: 0, successCount: 0, averageLatency: 0 }
    ];

    for (const tool of tools) {
      this.tools.set(tool.name, tool);
      this.metrics.toolsByType[tool.type]++;
      this.metrics.toolsReliability[tool.name] = tool.reliability;
    }

    this.updateMetrics();
  }

  private updateMetrics(): void {
    this.metrics.totalTools = this.tools.size;
    this.metrics.availableTools = Array.from(this.tools.values()).filter(t => t.isAvailable !== false).length;
    
    const reliabilities = Array.from(this.tools.values()).map(t => t.reliability);
    this.metrics.averageReliability = reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length;
    
    const usageStats = Array.from(this.tools.values())
      .map(t => ({ name: t.name, count: t.usageCount || 0 }))
      .sort((a, b) => b.count - a.count);
    
    if (usageStats.length > 0) {
      this.metrics.mostUsedTool = usageStats[0].name;
      this.metrics.leastUsedTool = usageStats[usageStats.length - 1].name;
    }
  }

  getTool(name: string): ToolCapability | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolCapability[] {
    return Array.from(this.tools.values());
  }

  updateToolUsage(toolName: string, success: boolean, latency: number): void {
    const tool = this.tools.get(toolName);
    if (tool) {
      tool.usageCount = (tool.usageCount || 0) + 1;
      if (success) tool.successCount = (tool.successCount || 0) + 1;
      
      const currentAvg = tool.averageLatency || 0;
      const totalCalls = tool.usageCount;
      tool.averageLatency = (currentAvg * (totalCalls - 1) + latency) / totalCalls;
      
      if (tool.usageCount > 10) {
        const newReliability = (tool.successCount || 0) / tool.usageCount;
        tool.reliability = Math.min(0.99, Math.max(0.7, newReliability));
        this.metrics.toolsReliability[tool.name] = tool.reliability;
      }
      
      tool.lastUsed = Date.now();
      this.updateMetrics();
      
      // Utiliser info au lieu de debug
      toolRegistryLogger.info('USAGE', `Outil ${toolName} - Succès: ${success}, Latence: ${latency}ms`);
    }
  }

  recordRecommendation(task: string, recommendedTool: string, _alternatives: string[]): void {
    if (!this.recommendationHistory.has(task)) {
      this.recommendationHistory.set(task, []);
    }
    this.recommendationHistory.get(task)?.push(recommendedTool);
    
    if (this.recommendationHistory.size > 1000) {
      const oldestKey = Array.from(this.recommendationHistory.keys())[0];
      this.recommendationHistory.delete(oldestKey);
    }
  }

  getRecommendationHistory(task: string): string[] {
    return this.recommendationHistory.get(task) || [];
  }

  getMetrics(): RegistryMetrics {
    return { ...this.metrics };
  }
}

const toolRegistry = new ToolRegistry();

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function heuristicRecommendation(task: string): string | null {
  const taskLower = task.toLowerCase();
  for (const [toolName, pattern] of Object.entries(TOOL_PATTERNS)) {
    if (pattern.test(taskLower)) return toolName;
  }
  return null;
}

async function llmRecommendation(task: string, options: RecommendationOptions): Promise<string | null> {
  try {
    const toolsList = toolRegistry.getAllTools()
      .map(t => `${t.name} (${t.type}): ${t.description || 'Outil technique'}`)
      .join('\n');
    
    const prompt = `Tu es un expert en sélection d'outils techniques. Recommande le meilleur outil pour la tâche.
    
    Outils disponibles:
    ${toolsList}
    
    Tâche: "${task}"
    
    Réponds UNIQUEMENT par le nom de l'outil (search, calculator, email, summarize).`;

    const response = await callOllama(prompt, {
      model: 'tinyllama:1.1b',
      temperature: 0.1,
      maxTokens: 50,
      timeout: options.timeout
    });
    
    const recommendedTool = response.trim().toLowerCase();
    return toolRegistry.getTool(recommendedTool) ? recommendedTool : null;
    
  } catch (error) {
    toolRegistryLogger.warning('LLM', `Échec recommandation LLM: ${error}`);
    return null;
  }
}

function getAlternativeTools(type: string, minReliability: number): string[] {
  return toolRegistry.getAllTools()
    .filter(t => t.type === type && t.reliability >= minReliability)
    .sort((a, b) => b.reliability - a.reliability)
    .map(t => t.name);
}

// ============================================================================
// FONCTIONS PRINCIPALES
// ============================================================================

export async function recommendTool(
  task: string,
  options?: RecommendationOptions
): Promise<string> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  toolRegistryLogger.info('RECOMMEND', `Recommandation - Tâche: ${task.substring(0, 100)}`);
  
  try {
    let recommendedTool: string | null = heuristicRecommendation(task);
    let recommendationMethod = 'heuristic';
    
    if (!recommendedTool && opts.useHistory) {
      recommendationMethod = 'llm';
      recommendedTool = await llmRecommendation(task, opts);
    }
    
    if (!recommendedTool) {
      recommendedTool = 'search';
      recommendationMethod = 'fallback';
    }
    
    const tool = toolRegistry.getTool(recommendedTool);
    if (tool && tool.reliability < (opts.minReliability || 0.7)) {
      const alternatives = getAlternativeTools(tool.type, opts.minReliability || 0.7);
      if (alternatives.length > 0) {
        recommendedTool = alternatives[0];
        toolRegistryLogger.info('ALTERNATIVE', `Alternative sélectionnée - Original: ${tool.name}, Alternative: ${recommendedTool}`);
      }
    }
    
    const alternatives = getAlternativeTools(tool?.type || 'SEARCH', 0);
    toolRegistry.recordRecommendation(task, recommendedTool, alternatives);
    
    const duration = Date.now() - startTime;
    toolRegistryLogger.success('RECOMMEND', `Outil recommandé: ${recommendedTool} (${recommendationMethod}) - Durée: ${formatDuration(duration)}`);
    
    return recommendedTool;
    
  } catch (error: any) {
    toolRegistryLogger.error('RECOMMEND', `Échec recommandation: ${error.message}`);
    return 'search';
  }
}

export async function recordToolUsage(
  toolName: string,
  success: boolean,
  latency: number
): Promise<void> {
  toolRegistry.updateToolUsage(toolName, success, latency);
}

export async function getToolRegistryStats(): Promise<{
  tools: ToolCapability[];
  metrics: RegistryMetrics;
}> {
  return {
    tools: toolRegistry.getAllTools(),
    metrics: toolRegistry.getMetrics()
  };
}

export async function getToolDetails(toolName: string): Promise<ToolCapability | null> {
  return toolRegistry.getTool(toolName) || null;
}

export async function updateToolReliability(
  toolName: string,
  newReliability: number
): Promise<boolean> {
  const tool = toolRegistry.getTool(toolName);
  if (!tool) return false;
  
  tool.reliability = Math.min(0.99, Math.max(0.5, newReliability));
  toolRegistryLogger.info('RELIABILITY', `Fiabilité mise à jour - ${toolName}: ${tool.reliability.toFixed(2)}`);
  return true;
}

export async function getRecommendationHistory(task: string): Promise<string[]> {
  return toolRegistry.getRecommendationHistory(task);
}

export async function resetRegistryStats(): Promise<void> {
  toolRegistryLogger.info('RESET', 'Réinitialisation des statistiques');
}

export default {
  recommendTool,
  recordToolUsage,
  getToolRegistryStats,
  getToolDetails,
  updateToolReliability,
  getRecommendationHistory,
  resetRegistryStats
};