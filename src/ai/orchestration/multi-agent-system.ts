/**
 * @fileOverview MultiAgentSystem - Innovation 20.
 * Orchestration de plusieurs agents IA spécialisés collaborant sur une tâche.
 * @version 3.0.0
 * @lastUpdated 2026-04-25
 * @changes Migration vers SQLite Core pour statistiques persistantes
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

// ============================================================================
// STATISTIQUES SQLITE
// ============================================================================

const db = getSQLiteCore();

async function recordOrchestrationStats(
  success: boolean,
  duration: number,
  consensusScore: number,
  agentCount: number,
  successfulAgents: number,
  failedAgents: number
): Promise<void> {
  await db.orchestration.stats.record('multi_agent', 'orchestration', {
    success,
    duration,
    consensusScore,
    agentCount,
    successfulAgents,
    failedAgents,
    timestamp: Date.now()
  });
  
  await db.recordMetric('orchestration', 'multi_agent_duration', duration);
  await db.recordMetric('orchestration', 'multi_agent_success', success ? 1 : 0);
  await db.recordMetric('orchestration', 'multi_agent_consensus', consensusScore);
}

async function recordAgentCallStats(
  agentName: string,
  model: string,
  success: boolean,
  duration: number,
  tokensUsed: number
): Promise<void> {
  await db.orchestration.stats.record('multi_agent', 'agent_call', {
    agentName,
    model,
    success,
    duration,
    tokensUsed,
    timestamp: Date.now()
  });
  
  await db.orchestration.stats.record('agent_usage', agentName, { model, success, duration });
}

// ============================================================================
// FONCTIONS STATISTIQUES (REMPLACEMENT)
// ============================================================================

export async function getMultiAgentStats(): Promise<{
  totalOrchestrations: number;
  successfulOrchestrations: number;
  failedOrchestrations: number;
  successRate: number;
  totalAgentCalls: number;
  successfulAgentCalls: number;
  failedAgentCalls: number;
  agentSuccessRate: number;
  avgOrchestrationTime: number;
  avgConsensusScore: number;
  agentUsage: Record<string, number>;
  lastOrchestrationTime: number | null;
  lastOrchestrationDuration: number | null;
}> {
  // Récupérer les stats depuis SQLite
  const orchestrationStats = await db.orchestration.stats.getByComponent('multi_agent', 1000);
  const agentUsageRaw = await db.orchestration.stats.getByComponent('agent_usage', 1000);
  
  // Filtrer les orchestrations
  const orchestrations = orchestrationStats.filter(s => s.statType === 'orchestration');
  const agentCalls = orchestrationStats.filter(s => s.statType === 'agent_call');
  
  const totalOrchestrations = orchestrations.length;
  const successfulOrchestrations = orchestrations.filter(s => s.statValue.success === true).length;
  const orchestrationSuccessRate = totalOrchestrations > 0 ? successfulOrchestrations / totalOrchestrations : 0;
  
  const totalAgentCalls = agentCalls.length;
  const successfulAgentCalls = agentCalls.filter(s => s.statValue.success === true).length;
  const agentSuccessRate = totalAgentCalls > 0 ? successfulAgentCalls / totalAgentCalls : 0;
  
  const avgOrchestrationTime = orchestrations.reduce((sum, s) => sum + (s.statValue.duration || 0), 0) / (totalOrchestrations || 1);
  const avgConsensusScore = orchestrations.reduce((sum, s) => sum + (s.statValue.consensusScore || 0), 0) / (totalOrchestrations || 1);
  
  // Calculer l'utilisation des agents
  const agentUsage: Record<string, number> = {};
  for (const stat of agentUsageRaw) {
    const agentName = stat.component;
    agentUsage[agentName] = (agentUsage[agentName] || 0) + 1;
  }
  
  const lastOrchestration = orchestrations.sort((a, b) => b.timestamp - a.timestamp)[0];
  
  return {
    totalOrchestrations,
    successfulOrchestrations,
    failedOrchestrations: totalOrchestrations - successfulOrchestrations,
    successRate: Math.round(orchestrationSuccessRate * 100) / 100,
    totalAgentCalls,
    successfulAgentCalls,
    failedAgentCalls: totalAgentCalls - successfulAgentCalls,
    agentSuccessRate: Math.round(agentSuccessRate * 100) / 100,
    avgOrchestrationTime: Math.round(avgOrchestrationTime),
    avgConsensusScore: Math.round(avgConsensusScore * 100) / 100,
    agentUsage,
    lastOrchestrationTime: lastOrchestration?.timestamp || null,
    lastOrchestrationDuration: lastOrchestration?.statValue.duration || null
  };
}

export async function resetMultiAgentStats(): Promise<void> {
  // Nettoyer les anciennes stats du module multi_agent
  const allStats = await db.orchestration.stats.getByComponent('multi_agent', 10000);
  for (const stat of allStats) {
    // Supprimer via cleanup n'est pas précis, on utilise une méthode directe
    db.getDB().prepare(`DELETE FROM orchestration_stats WHERE id = ?`).run(stat.id);
  }
  logSuccess('STATS', 'Statistiques du système multi-agents réinitialisées');
}

// ============================================================================
// CONFIGURATION DES LOGS
// ============================================================================

const LOG_PREFIX = '[MULTI-AGENT]';
const LOG_SEPARATOR = '═'.repeat(70);
const LOG_SUBSEPARATOR = '─'.repeat(50);

function logInfo(step: string, message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 [${step}] ${message}`);
  if (data) {
    console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
  }
}

function logSuccess(step: string, message: string, data?: any): void {
  console.log(`${LOG_PREFIX} ✅ [${step}] ${message}`);
  if (data) {
    console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
  }
}

function logWarning(step: string, message: string, data?: any): void {
  console.warn(`${LOG_PREFIX} ⚠️ [${step}] ${message}`);
  if (data) {
    console.warn(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
  }
}

function logError(step: string, message: string, error?: any): void {
  console.error(`${LOG_PREFIX} ❌ [${step}] ${message}`);
  if (error) {
    console.error(`${LOG_PREFIX} 🔥 ${error.message || error}`);
  }
}

function logMetric(step: string, metric: string, value: any): void {
  console.log(`${LOG_PREFIX} 📈 [${step}] ${metric}: ${value}`);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface Agent {
  name: string;
  role: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface AgentResponse {
  agent: string;
  role: string;
  output: string;
  confidence: number;
  processingTime?: number;
  tokensUsed?: number;
  error?: string;
}

export interface OrchestrationResult {
  finalAnswer: string;
  agentContributions: AgentResponse[];
  consensusScore: number;
  totalProcessingTime?: number;
  successfulAgents?: number;
  failedAgents?: number;
}

export interface OrchestrationOptions {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  consensusThreshold?: number;
  fallbackToSingleAgent?: boolean;
}

// ============================================================================
// CONFIGURATION DES AGENTS
// ============================================================================

const DEFAULT_AGENTS: Agent[] = [
  {
    name: 'Analyste',
    role: 'Expert RAG & Extraction de Contexte',
    model: 'phi:2.7b',
    temperature: 0.3,
    maxTokens: 500,
    timeout: 30000
  },
  {
    name: 'Technicien',
    role: 'Expert Maintenance & Procédures',
    model: 'gemma:2b',
    temperature: 0.4,
    maxTokens: 600,
    timeout: 45000
  },
  {
    name: 'Sécurité',
    role: 'Contrôleur des Risques & Conformité',
    model: 'tinyllama:1.1b',
    temperature: 0.2,
    maxTokens: 400,
    timeout: 20000
  }
];

// ============================================================================
// VALIDATION DES ENTRÉES
// ============================================================================

function validateQuery(query: string): void {
  if (!query || typeof query !== 'string') {
    throw new Error('La requête doit être une chaîne de caractères non vide');
  }
  if (query.trim().length === 0) {
    throw new Error('La requête ne peut pas être vide');
  }
  if (query.length > 10000) {
    throw new Error('La requête est trop longue (max 10000 caractères)');
  }
}

function validateAgents(agents: Agent[]): void {
  if (!agents || agents.length === 0) {
    throw new Error('Au moins un agent est requis');
  }
  for (const agent of agents) {
    if (!agent.name || !agent.role || !agent.model) {
      throw new Error(`Agent invalide: ${JSON.stringify(agent)}`);
    }
  }
}

// ============================================================================
// EXÉCUTION D'UN AGENT
// ============================================================================

async function executeAgentTask(
  agent: Agent,
  query: string,
  context: string
): Promise<AgentResponse> {
  const startTime = Date.now();
  const { name, role, model, temperature = 0.3, maxTokens = 500, timeout = 30000 } = agent;
  
  logInfo('AGENT', `🤖 Exécution de l'agent "${name}" (${role})`);
  logMetric('AGENT', 'Modèle', model);
  logMetric('AGENT', 'Temperature', temperature);
  
  const systemPrompt = `Tu es l'agent "${name}", un ${role}. 
Analyse la requête de ton point de vue d'expert uniquement.
Sois concis et précis. Ne réponds que sur ton domaine de compétence.`;

  const userPrompt = `Contexte technique: ${context.substring(0, 1000)}
Requête: ${query}

Ton analyse d'expert (concise):`;

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  try {
    const response = await callOllama(fullPrompt, {
      model,
      temperature,
      maxTokens,
      timeout
    });
    
    const elapsedTime = Date.now() - startTime;
    const tokensUsed = Math.ceil(response.length / 4);
    
    // Enregistrer les stats de l'appel agent
    await recordAgentCallStats(name, model, true, elapsedTime, tokensUsed);
    
    logSuccess('AGENT', `✅ Agent "${name}" terminé en ${formatDuration(elapsedTime)}`, {
      réponse: `${response.length} caractères`,
      tokens: tokensUsed
    });
    
    return {
      agent: name,
      role,
      output: response,
      confidence: 0.85,
      processingTime: elapsedTime,
      tokensUsed
    };
    
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    
    // Enregistrer l'échec
    await recordAgentCallStats(name, model, false, elapsedTime, 0);
    
    logError('AGENT', `❌ Agent "${name}" échoué après ${formatDuration(elapsedTime)}`, error);
    
    return {
      agent: name,
      role,
      output: `[Erreur: ${errorMessage}]`,
      confidence: 0,
      processingTime: elapsedTime,
      error: errorMessage
    };
  }
}

// ============================================================================
// SYNTHÈSE DES CONTRIBUTIONS
// ============================================================================

async function synthesizeContributions(
  query: string,
  contributions: AgentResponse[],
  context: string,
  options: OrchestrationOptions = {}
): Promise<string> {
  const startTime = Date.now();
  const { temperature = 0.3, maxTokens = 800, timeout = 30000 } = options;
  
  logInfo('SYNTHESIS', `📝 Synthèse des ${contributions.length} contributions...`);
  
  // Filtrer les contributions valides (avec confiance > 0)
  const validContributions = contributions.filter(c => c.confidence > 0 && !c.error);
  
  if (validContributions.length === 0) {
    logWarning('SYNTHESIS', 'Aucune contribution valide, utilisation du fallback');
    return "Désolé, je n'ai pas pu obtenir d'analyses suffisantes pour répondre à votre question.";
  }
  
  const report = validContributions.map(c => 
    `[${c.agent} - ${c.role}]: ${c.output}`
  ).join('\n\n');
  
  const systemPrompt = `Tu es le Modérateur Principal. Synthétise les analyses de tes experts pour produire la réponse technique la plus fiable et complète possible.
Structure ta réponse en sections claires.
Si les experts sont en désaccord, mentionne les points de divergence.
Cite les experts qui ont contribué à chaque point.`;

  const userPrompt = `Requête utilisateur: ${query}

Contexte technique: ${context.substring(0, 500)}

Analyses des experts:
${report}

Synthèse finale structurée (en français):`;

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  try {
    const response = await callOllama(fullPrompt, {
      model: 'phi:2.7b',
      temperature,
      maxTokens,
      timeout
    });
    
    const elapsedTime = Date.now() - startTime;
    logSuccess('SYNTHESIS', `Synthèse générée en ${formatDuration(elapsedTime)}`, {
      longueur: `${response.length} caractères`
    });
    
    return response;
    
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    
    logError('SYNTHESIS', `Échec de synthèse après ${formatDuration(elapsedTime)}`, error);
    return `[Erreur de synthèse] ${errorMessage}`;
  }
}

// ============================================================================
// CALCUL DU CONSENSUS
// ============================================================================

function calculateConsensus(contributions: AgentResponse[]): number {
  const validContributions = contributions.filter(c => c.confidence > 0 && !c.error);
  
  if (validContributions.length === 0) return 0;
  
  // 1. Score moyen de confiance
  const avgConfidence = validContributions.reduce((acc, c) => acc + c.confidence, 0) / validContributions.length;
  
  // 2. Bonus pour le nombre d'agents (plus d'agents = consensus plus robuste)
  const agentBonus = Math.min(validContributions.length / DEFAULT_AGENTS.length, 0.3);
  
  // 3. Pénalité pour les agents en erreur
  const errorCount = contributions.filter(c => c.error).length;
  const errorPenalty = (errorCount / contributions.length) * 0.2;
  
  let consensus = avgConfidence + agentBonus - errorPenalty;
  consensus = Math.min(0.95, Math.max(0, consensus));
  
  logMetric('CONSENSUS', 'Score', `${(consensus * 100).toFixed(0)}%`);
  logMetric('CONSENSUS', 'Confiance moyenne', `${(avgConfidence * 100).toFixed(0)}%`);
  logMetric('CONSENSUS', 'Bonus agents', `${(agentBonus * 100).toFixed(0)}%`);
  logMetric('CONSENSUS', 'Pénalité erreurs', `${(errorPenalty * 100).toFixed(0)}%`);
  
  return consensus;
}

// ============================================================================
// ORCHESTRATION PRINCIPALE
// ============================================================================

/**
 * Orchestre une équipe d'agents spécialisés pour résoudre une requête complexe.
 */
export async function orchestrateMultiAgents(
  query: string,
  context: string,
  customAgents?: Agent[],
  options: OrchestrationOptions = {}
): Promise<OrchestrationResult> {
  const startTime = Date.now();
  const agents = customAgents || DEFAULT_AGENTS;
  const { consensusThreshold = 0.5, fallbackToSingleAgent = true } = options;
  
  // Validation des entrées
  validateQuery(query);
  validateAgents(agents);
  
  console.log(`\n${LOG_SEPARATOR}`);
  logInfo('ORCHESTRATE', `🚀 ORCHESTRATION MULTI-AGENTS`);
  logMetric('ORCHESTRATE', 'Requête', `"${query.substring(0, 80)}${query.length > 80 ? '...' : ''}"`);
  logMetric('ORCHESTRATE', 'Agents', agents.length);
  logMetric('ORCHESTRATE', 'Contexte', `${context.length} caractères`);
  console.log(LOG_SUBSEPARATOR);
  
  try {
    // 1. Exécution parallèle des agents
    logInfo('ORCHESTRATE', `🎭 Lancement de l'équipe d'intervention...`);
    
    const agentPromises = agents.map(agent => executeAgentTask(agent, query, context));
    const contributions = await Promise.all(agentPromises);
    
    const successfulAgents = contributions.filter(c => c.confidence > 0 && !c.error).length;
    const failedAgents = agents.length - successfulAgents;
    
    logSuccess('ORCHESTRATE', `${successfulAgents}/${agents.length} agents exécutés avec succès`, {
      échecs: failedAgents
    });
    
    // 2. Calcul du consensus
    const consensusScore = calculateConsensus(contributions);
    
    // 3. Vérification du seuil de consensus
    if (consensusScore < consensusThreshold) {
      logWarning('ORCHESTRATE', `Consensus faible (${(consensusScore * 100).toFixed(0)}% < ${(consensusThreshold * 100).toFixed(0)}%)`);
      
      if (fallbackToSingleAgent && successfulAgents > 0) {
        const bestAgent = contributions
          .filter(c => c.confidence > 0 && !c.error)
          .sort((a, b) => b.confidence - a.confidence)[0];
        
        logInfo('ORCHESTRATE', `Fallback vers le meilleur agent: ${bestAgent.agent}`);
        
        const elapsedTime = Date.now() - startTime;
        await recordOrchestrationStats(true, elapsedTime, consensusScore, agents.length, successfulAgents, failedAgents);
        
        console.log(LOG_SUBSEPARATOR);
        logSuccess('ORCHESTRATE', `🏁 ORCHESTRATION TERMINÉE en ${formatDuration(elapsedTime)} (fallback)`);
        logMetric('ORCHESTRATE', 'Consensus', `${(consensusScore * 100).toFixed(0)}%`);
        console.log(LOG_SEPARATOR);
        
        return {
          finalAnswer: bestAgent.output,
          agentContributions: contributions,
          consensusScore,
          totalProcessingTime: elapsedTime,
          successfulAgents,
          failedAgents
        };
      }
    }
    
    // 4. Synthèse des contributions
    const finalAnswer = await synthesizeContributions(query, contributions, context, options);
    
    const elapsedTime = Date.now() - startTime;
    await recordOrchestrationStats(true, elapsedTime, consensusScore, agents.length, successfulAgents, failedAgents);
    
    console.log(LOG_SUBSEPARATOR);
    logSuccess('ORCHESTRATE', `🏁 ORCHESTRATION TERMINÉE en ${formatDuration(elapsedTime)}`);
    logMetric('ORCHESTRATE', 'Consensus', `${(consensusScore * 100).toFixed(0)}%`);
    logMetric('ORCHESTRATE', 'Réponse', `${finalAnswer.length} caractères`);
    console.log(LOG_SEPARATOR);
    
    return {
      finalAnswer,
      agentContributions: contributions,
      consensusScore,
      totalProcessingTime: elapsedTime,
      successfulAgents,
      failedAgents
    };
    
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    
    await recordOrchestrationStats(false, elapsedTime, 0, agents.length, 0, agents.length);
    
    console.log(LOG_SUBSEPARATOR);
    logError('ORCHESTRATE', `❌ ORCHESTRATION ÉCHOUÉE après ${formatDuration(elapsedTime)}`, error);
    console.log(LOG_SEPARATOR);
    
    throw new Error(`Échec de l'orchestration multi-agents: ${errorMessage}`);
  }
}

// ============================================================================
// ORCHESTRATION AVEC AGENTS PERSONNALISÉS
// ============================================================================

/**
 * Orchestre une équipe d'agents avec configuration personnalisée
 */
export async function orchestrateWithAgents(
  query: string,
  context: string,
  agents: Agent[],
  options: OrchestrationOptions = {}
): Promise<OrchestrationResult> {
  logInfo('CUSTOM', `🎭 Orchestration avec ${agents.length} agents personnalisés`);
  return orchestrateMultiAgents(query, context, agents, options);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  orchestrateMultiAgents,
  orchestrateWithAgents,
  getMultiAgentStats,
  resetMultiAgentStats,
  DEFAULT_AGENTS
};