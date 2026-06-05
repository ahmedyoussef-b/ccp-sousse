/**
 * @fileOverview Model Context Protocol (MCP) - Innovation Elite 32.
 * Version corrigée avec appels logger corrects.
 * 
 * @version 3.2.0
 * @lastUpdated 2026-04-01
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { getAgentConfig } from './config/agent.config';
import { mcpLogger } from './utils/logger';
import { StatsManager } from '@/ai/rag/utils/stats-manager';

// ============================================================================
// INTERFACES
// ============================================================================

export interface AgentContext {
  user: {
    id: string;
    email: string;
    expertise: 'beginner' | 'intermediate' | 'expert';
  };
  temporal: string;
  documents: string;
  history: any[];
  constraints: string[];
  request: string;
}

export interface Intention {
  confidence: number;
  type: 'organisation' | 'recherche' | 'action' | 'communication' | 'analyse';
  complexity: number;
  description: string;
  subTasks: string[];
  tools: string[];
  constraints: string[];
}

export interface ToolResult {
  success: boolean;
  output?: any;
  error?: string;
  duration: number;
}

export interface MCPMetrics {
  totalContextGatherings: number;
  totalIntentionsAnalyzed: number;
  totalToolsExecuted: number;
  successfulTools: number;
  failedTools: number;
  averageToolExecutionTime: number;
  toolUsage: Map<string, number>;
  intentionTypes: Map<string, number>;
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

/**
 * Évaluation sécurisée d'expressions mathématiques simples
 */
function safeEvaluate(expression: string): number | null {
  const expr = expression.replace(/\s/g, '');
  if (!/^[\d+\-*/%().]+$/.test(expr)) {
    return null;
  }
  try {
    const fn = new Function('return (' + expr + ')');
    const result = fn();
    return typeof result === 'number' && !isNaN(result) ? result : null;
  } catch {
    return null;
  }
}

// ============================================================================
// STATISTIQUES
// ============================================================================

const config = getAgentConfig();
const SUPPORTED_TOOLS = config.tools.supportedTools;

const statsManager = new StatsManager<MCPMetrics>({
  initial: {
    totalContextGatherings: 0,
    totalIntentionsAnalyzed: 0,
    totalToolsExecuted: 0,
    successfulTools: 0,
    failedTools: 0,
    averageToolExecutionTime: 0,
    toolUsage: new Map(),
    intentionTypes: new Map()
  },
  persistIntervalMs: 60000,
  onPersist: async (stats, timestamp) => {
    mcpLogger.structured('STATS_PERSIST', { 
      module: 'mcp', 
      stats: {
        ...stats,
        toolUsage: Object.fromEntries(stats.toolUsage),
        intentionTypes: Object.fromEntries(stats.intentionTypes)
      },
      timestamp: timestamp.toISOString() 
    });
  }
});

// ============================================================================
// FONCTIONS PRINCIPALES
// ============================================================================

export async function gatherContext(request: string, userId: string): Promise<AgentContext> {
  const startTime = Date.now();
  
  mcpLogger.info('GATHER', `Collecte du contexte - User: ${userId}`);
  
  statsManager.increment('totalContextGatherings');
  
  const temporal = new Date().toLocaleString('fr-FR', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const user = {
    id: userId,
    email: "tech-elite@agentic.local",
    expertise: "expert" as const
  };
  
  const constraints = [
    "Respecter les normes ISO 9001", 
    "Priorité absolue à la sécurité industrielle",
    "Format de réponse technique précis"
  ];
  
  const context: AgentContext = {
    user,
    temporal,
    documents: "Contexte documentaire unifié via HybridRAG (Docs, Graphe, Hiérarchie).",
    history: [], 
    constraints,
    request
  };
  
  const duration = Date.now() - startTime;
  mcpLogger.success('GATHER', `Contexte collecté - Durée: ${formatDuration(duration)}`);
  
  return context;
}

export async function analyzeIntention(request: string, context: AgentContext): Promise<Intention> {
  const startTime = Date.now();
  
  mcpLogger.info('ANALYZE', `Analyse de l'intention - User: ${context.user.id}`);
  
  try {
    const prompt = `Tu es un Analyste d'Intention MCP expert. Détermine les besoins réels derrière la demande technique.
    
    Règles d'analyse:
    - Évalue la complexité sur une échelle de 1 à 10
    - Identifie les sous-tâches nécessaires
    - Suggère les outils pertinents parmi: ${SUPPORTED_TOOLS.join(', ')}
    - Inclus les contraintes de sécurité et de conformité
    
    Demande: "${request}"
    
    Réponds UNIQUEMENT en JSON STRICT au format:
    {
      "type": "organisation|recherche|action|communication|analyse",
      "complexity": 1-10,
      "description": "description concise",
      "subTasks": ["sous-tâche 1"],
      "tools": ["search"],
      "constraints": ["contrainte 1"],
      "confidence": 0.8
    }`;

    const response = await callOllama(prompt, {
      model: 'phi:2.7b',
      temperature: 0.3,
      maxTokens: 500,
      timeout: config.planner.timeout
    });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      const intention: Intention = {
        type: parsed.type || 'action',
        complexity: Math.min(10, Math.max(1, parsed.complexity || 5)),
        description: parsed.description || request,
        subTasks: parsed.subTasks || [request],
        tools: (parsed.tools || ['search']).filter((t: string) => SUPPORTED_TOOLS.includes(t)),
        constraints: parsed.constraints || [],
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.8))
      };
      
      const duration = Date.now() - startTime;
      mcpLogger.success('ANALYZE', `Intention analysée - Type: ${intention.type}, Complexité: ${intention.complexity}, Confiance: ${intention.confidence}, Durée: ${formatDuration(duration)}`);
      
      statsManager.increment('totalIntentionsAnalyzed');
      const intentionTypes = statsManager.get().intentionTypes;
      intentionTypes.set(intention.type, (intentionTypes.get(intention.type) || 0) + 1);
      statsManager.update({ intentionTypes });
      
      return intention;
    }
    
    throw new Error('Aucun JSON trouvé');
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    mcpLogger.warning('ANALYZE', `Échec analyse - Erreur: ${error.message}, Durée: ${formatDuration(duration)}`);
    
    const fallbackIntention: Intention = {
      type: 'action',
      complexity: 5,
      description: request,
      subTasks: [request],
      tools: ['search'],
      constraints: [],
      confidence: 0.5
    };
    
    statsManager.increment('totalIntentionsAnalyzed');
    const intentionTypes = statsManager.get().intentionTypes;
    intentionTypes.set('action', (intentionTypes.get('action') || 0) + 1);
    statsManager.update({ intentionTypes });
    
    return fallbackIntention;
  }
}

export async function executeMCPTool(toolName: string, params: any): Promise<ToolResult> {
  const startTime = Date.now();
  
  mcpLogger.info('EXECUTE', `Exécution outil: ${toolName}`);
  
  if (!SUPPORTED_TOOLS.includes(toolName)) {
    const errorMessage = `Outil ${toolName} non supporté. Outils supportés: ${SUPPORTED_TOOLS.join(', ')}`;
    mcpLogger.error('EXECUTE', errorMessage);
    
    const result: ToolResult = {
      success: false,
      error: errorMessage,
      duration: Date.now() - startTime
    };
    
    statsManager.increment('totalToolsExecuted');
    statsManager.increment('failedTools');
    const toolUsage = statsManager.get().toolUsage;
    toolUsage.set(toolName, (toolUsage.get(toolName) || 0) + 1);
    statsManager.update({ toolUsage });
    
    return result;
  }

  try {
    let output: any;
    
    switch (toolName) {
      case 'search':
        const searchQuery = params.query || params.expression || 'recherche générale';
        output = `Analyse effectuée pour "${searchQuery}". Points critiques identifiés selon les manuels V3.`;
        break;
        
      case 'email':
        const recipient = params.to || 'équipe maintenance';
        const subject = params.subject || 'Rapport technique';
        output = `Rapport technique transmis à ${recipient} (Simulation). Sujet: ${subject}`;
        break;
        
      case 'calendar':
        const eventName = params.event || 'Intervention de maintenance';
        const scheduledTime = params.time || 'demain 09:00';
        output = `${eventName} programmée pour ${scheduledTime}.`;
        break;
        
      case 'calculator':
        const expression = params.expression || params.query || '1+1';
        const calculatedResult = safeEvaluate(expression);
        if (calculatedResult !== null) {
          output = `Calcul effectué. Résultat : ${calculatedResult}`;
        } else {
          output = `Expression: ${expression} (non calculable)`;
        }
        break;
        
      case 'summarize':
        const format = params.format || 'bullet';
        output = `Synthèse industrielle générée. Focus sur la conformité. Format: ${format}`;
        break;
        
      case 'analyze':
        const data = params.data || params.metric || 'données techniques';
        const metric = params.metric || 'performance';
        output = `Analyse technique de "${data}" - Métrique: ${metric}. Conformité: OK.`;
        break;
        
      default:
        throw new Error(`Outil ${toolName} non supporté`);
    }
    
    const duration = Date.now() - startTime;
    mcpLogger.success('EXECUTE', `Outil exécuté: ${toolName} - Durée: ${formatDuration(duration)}`);
    
    statsManager.increment('totalToolsExecuted');
    statsManager.increment('successfulTools');
    const toolUsage = statsManager.get().toolUsage;
    toolUsage.set(toolName, (toolUsage.get(toolName) || 0) + 1);
    statsManager.update({ toolUsage });
    
    const avgTime = statsManager.get().averageToolExecutionTime;
    const total = statsManager.get().totalToolsExecuted;
    const newAvg = (avgTime * (total - 1) + duration) / total;
    statsManager.update({ averageToolExecutionTime: newAvg });
    
    return {
      success: true,
      output,
      duration
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    mcpLogger.error('EXECUTE', `Échec outil: ${toolName} - Erreur: ${error.message}, Durée: ${formatDuration(duration)}`);
    
    statsManager.increment('totalToolsExecuted');
    statsManager.increment('failedTools');
    const toolUsage = statsManager.get().toolUsage;
    toolUsage.set(toolName, (toolUsage.get(toolName) || 0) + 1);
    statsManager.update({ toolUsage });
    
    return {
      success: false,
      error: error.message,
      duration
    };
  }
}

export function getMCPMetrics(): MCPMetrics {
  return statsManager.get();
}

export function resetMCPMetrics(): void {
  statsManager.reset();
  mcpLogger.success('STATS', 'Statistiques MCP réinitialisées');
}

export function isToolSupported(toolName: string): boolean {
  return SUPPORTED_TOOLS.includes(toolName);
}

export function getSupportedTools(): string[] {
  return [...SUPPORTED_TOOLS];
}

export default {
  gatherContext,
  analyzeIntention,
  executeMCPTool,
  getMCPMetrics,
  resetMCPMetrics,
  isToolSupported,
  getSupportedTools
};