/**
 * @fileOverview TaskPlanner - Phase 2 de l'Architecture Agentic.
 * Version corrigée avec appels logger corrects.
 * 
 * @version 3.1.0
 * @lastUpdated 2026-04-01
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { getAgentConfig } from './config/agent.config';
import { plannerLogger } from './utils/logger';
import { StatsManager } from '@/ai/rag/utils/stats-manager';
import { Intention, AgentContext } from './mcp';

// ============================================================================
// TYPES ET INTERFACES
// ============================================================================

export interface TaskStep {
  id: string;
  description: string;
  tool: string;
  params: any;
  dependencies: string[];
  critical: boolean;
  estimatedTime?: number;
  successProbability?: number;
  status?: 'pending' | 'executing' | 'completed' | 'failed';
  result?: any;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface TaskPlan {
  steps: TaskStep[];
  totalEstimatedTime: number;
  criticalPath: string[];
  estimatedDuration?: number;
  planId?: string;
  createdAt?: number;
  metrics?: {
    atomicSteps: number;
    compositeSteps: number;
    avgSuccessProbability: number;
    criticalStepsCount: number;
  };
}

export interface PlanningMetrics {
  totalPlans: number;
  totalStepsGenerated: number;
  averageStepsPerPlan: number;
  averageEstimatedTime: number;
  averageSuccessProbability: number;
  toolsUsage: Map<string, number>;
  decompositionTime: number;
  successRate: number;
}

export interface PlanningOptions {
  maxSteps?: number;
  minConfidence?: number;
  useCache?: boolean;
  timeout?: number;
}

// ============================================================================
// STATISTIQUES ET CACHE
// ============================================================================

const statsManager = new StatsManager<PlanningMetrics>({
  initial: {
    totalPlans: 0,
    totalStepsGenerated: 0,
    averageStepsPerPlan: 0,
    averageEstimatedTime: 0,
    averageSuccessProbability: 0,
    toolsUsage: new Map(),
    decompositionTime: 0,
    successRate: 100
  },
  persistIntervalMs: 60000,
  onPersist: async (stats, timestamp) => {
    plannerLogger.structured('STATS_PERSIST', { 
      module: 'task-planner', 
      stats: {
        ...stats,
        toolsUsage: Object.fromEntries(stats.toolsUsage)
      },
      timestamp: timestamp.toISOString() 
    });
  }
});

const config = getAgentConfig();
const SUPPORTED_TOOLS = config.tools.supportedTools;
const DEFAULT_OPTIONS: PlanningOptions = {
  maxSteps: config.planner.maxSteps,
  minConfidence: config.planner.minConfidence,
  useCache: true,
  timeout: config.planner.timeout
};

// Cache des décompositions
const decompositionCache = new Map<string, { steps: TaskStep[]; timestamp: number }>();
const CACHE_TTL = config.planner.cacheTTL;

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function generatePlanId(): string {
  return `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateStepId(index: number): string {
  return `step_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`;
}

function updateMetrics(plan: TaskPlan, decompositionTime: number): void {
  statsManager.increment('totalPlans');
  statsManager.increment('totalStepsGenerated', plan.steps.length);
  statsManager.average('averageStepsPerPlan', plan.steps.length);
  statsManager.average('averageEstimatedTime', plan.totalEstimatedTime);
  
  const avgProb = plan.steps.reduce((sum, s) => sum + (s.successProbability || 0.8), 0) / plan.steps.length;
  statsManager.average('averageSuccessProbability', avgProb);
  
  for (const step of plan.steps) {
    const toolsUsage = statsManager.get().toolsUsage;
    toolsUsage.set(step.tool, (toolsUsage.get(step.tool) || 0) + 1);
    statsManager.update({ toolsUsage });
  }
  
  statsManager.average('decompositionTime', decompositionTime);
}

function cleanupCache(): void {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, entry] of decompositionCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      decompositionCache.delete(key);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    plannerLogger.debug('CACHE', `Cache nettoyé - ${cleanedCount} entrées supprimées, reste ${decompositionCache.size}`);
  }
}

// Nettoyage périodique
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupCache, CACHE_TTL);
}

// ============================================================================
// FONCTIONS PRINCIPALES
// ============================================================================

export async function decomposeIntention(
  intention: Intention,
  _context: AgentContext,
  options?: PlanningOptions
): Promise<TaskStep[]> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  plannerLogger.info('DECOMPOSE', `Décomposition - Type: ${intention.type}, Complexité: ${intention.complexity}, Description: ${intention.description.substring(0, 50)}`);
  
  const cacheKey = `${intention.type}_${intention.complexity}_${intention.description.substring(0, 100)}`;
  if (opts.useCache) {
    const cached = decompositionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      plannerLogger.debug('CACHE', `Cache hit - ${cached.steps.length} étapes`);
      return cached.steps;
    }
  }

  try {
    const prompt = `Tu es un Planificateur de Tâches expert. Décompose l'intention en étapes atomiques exécutables.
    
    Règles de décomposition:
    - Chaque étape doit être atomique (action unique exécutable par un seul outil)
    - Utilise uniquement les outils disponibles: ${SUPPORTED_TOOLS.join(', ')}
    - Définis les dépendances entre étapes
    - Identifie les étapes critiques
    - Estime le temps d'exécution en secondes
    
    Intention: ${intention.description}
    Sous-tâches: ${intention.subTasks.join(', ')}
    Outils disponibles: ${intention.tools.join(', ')}
    
    Réponds UNIQUEMENT en JSON ARRAY.`;

    const response = await callOllama(prompt, {
      model: 'phi:2.7b',
      temperature: 0.3,
      maxTokens: 1000,
      timeout: opts.timeout
    });

    const match = response.match(/\[[\s\S]*\]/);
    if (!match) {
      throw new Error('Aucun JSON trouvé');
    }
    
    const stepsData = JSON.parse(match[0]);
    if (!Array.isArray(stepsData)) {
      throw new Error('La réponse n\'est pas un tableau');
    }
    
    const steps: TaskStep[] = stepsData.map((step: any, index: number) => ({
      id: generateStepId(index),
      description: step.description,
      tool: SUPPORTED_TOOLS.includes(step.tool) ? step.tool : 'search',
      params: step.params || { query: step.description },
      dependencies: step.dependencies || [],
      critical: step.critical !== false,
      estimatedTime: Math.min(300, Math.max(5, step.estimatedTime || 30)),
      successProbability: 0.85
    }));
    
    // Valider les dépendances
    const stepIds = new Set(steps.map(s => s.id));
    for (const step of steps) {
      step.dependencies = step.dependencies.filter(dep => stepIds.has(dep));
    }
    
    const limitedSteps = steps.slice(0, opts.maxSteps);
    const duration = Date.now() - startTime;
    
    plannerLogger.success('DECOMPOSE', `${limitedSteps.length} étapes générées - Durée: ${formatDuration(duration)}`);
    
    if (opts.useCache) {
      decompositionCache.set(cacheKey, { steps: limitedSteps, timestamp: Date.now() });
    }
    
    return limitedSteps;
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    plannerLogger.warning('DECOMPOSE', `Échec - Erreur: ${error.message}, Durée: ${formatDuration(duration)}`);
    
    const fallbackStep: TaskStep = {
      id: generateStepId(0),
      description: intention.description,
      tool: intention.tools[0] || 'search',
      params: { query: intention.description },
      dependencies: [],
      critical: true,
      estimatedTime: 60,
      successProbability: 0.8
    };
    
    return [fallbackStep];
  }
}

export async function createTaskPlan(
  steps: TaskStep[],
  _context: AgentContext,
  _options?: PlanningOptions
): Promise<TaskPlan> {
  const startTime = Date.now();
  const planId = generatePlanId();
  
  plannerLogger.info('CREATE', `Création du plan - ID: ${planId}, ${steps.length} étapes, ${steps.filter(s => s.critical).length} critiques`);
  
  if (steps.length === 0) {
    return {
      steps: [],
      totalEstimatedTime: 0,
      criticalPath: [],
      planId,
      createdAt: Date.now(),
      metrics: {
        atomicSteps: 0,
        compositeSteps: 0,
        avgSuccessProbability: 0,
        criticalStepsCount: 0
      }
    };
  }
  
  // Enrichir les étapes
  const enrichedSteps = steps.map(step => ({
    ...step,
    successProbability: step.successProbability || 0.85,
    estimatedTime: step.estimatedTime || 30
  }));
  
  // Calculer le chemin critique
  const criticalPath = calculateCriticalPath(enrichedSteps);
  
  // Calculer les métriques
  const totalEstimatedTime = enrichedSteps.reduce((acc, s) => acc + (s.estimatedTime || 30), 0);
  const avgSuccessProbability = enrichedSteps.reduce((acc, s) => acc + (s.successProbability || 0.8), 0) / enrichedSteps.length;
  
  const plan: TaskPlan = {
    steps: enrichedSteps,
    totalEstimatedTime,
    criticalPath,
    estimatedDuration: totalEstimatedTime,
    planId,
    createdAt: Date.now(),
    metrics: {
      atomicSteps: enrichedSteps.length,
      compositeSteps: enrichedSteps.filter(s => s.dependencies.length > 0).length,
      avgSuccessProbability,
      criticalStepsCount: criticalPath.length
    }
  };
  
  const duration = Date.now() - startTime;
  plannerLogger.success('CREATE', `Plan créé - ID: ${planId}, Durée totale: ${plan.totalEstimatedTime}s, Chemin critique: ${plan.criticalPath.length} étapes, Durée: ${formatDuration(duration)}`);
  
  updateMetrics(plan, duration);
  return plan;
}

function calculateCriticalPath(steps: TaskStep[]): string[] {
  const criticalSteps: string[] = [];
  const criticalWithoutDeps = steps.filter(s => s.critical && s.dependencies.length === 0);
  
  for (const step of criticalWithoutDeps) {
    criticalSteps.push(step.id);
    const dependents = steps.filter(s => s.critical && s.dependencies.includes(step.id));
    for (const dependent of dependents) {
      if (!criticalSteps.includes(dependent.id)) {
        criticalSteps.push(dependent.id);
      }
    }
  }
  
  return criticalSteps;
}

export function validatePlan(plan: TaskPlan): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!plan.steps || plan.steps.length === 0) {
    errors.push('Le plan ne contient aucune étape');
  }
  
  const stepIds = new Set<string>();
  for (const step of plan.steps) {
    if (!step.id) errors.push('Étape sans ID');
    if (stepIds.has(step.id)) errors.push(`ID dupliqué: ${step.id}`);
    stepIds.add(step.id);
    
    if (!step.tool) errors.push(`Étape ${step.id} sans outil`);
    if (!SUPPORTED_TOOLS.includes(step.tool)) {
      errors.push(`Étape ${step.id} utilise un outil non supporté: ${step.tool}`);
    }
    
    for (const depId of step.dependencies) {
      if (!stepIds.has(depId)) {
        errors.push(`Étape ${step.id} dépend d'étape inexistante: ${depId}`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

export function getPlanningMetrics(): PlanningMetrics {
  return statsManager.get();
}

export function resetPlanningMetrics(): void {
  statsManager.reset();
  plannerLogger.success('STATS', 'Statistiques du planificateur réinitialisées');
}

export function clearDecompositionCache(): void {
  const size = decompositionCache.size;
  decompositionCache.clear();
  plannerLogger.info('CACHE', `Cache nettoyé - ${size} entrées supprimées`);
}

export default {
  decomposeIntention,
  createTaskPlan,
  validatePlan,
  getPlanningMetrics,
  resetPlanningMetrics,
  clearDecompositionCache
};