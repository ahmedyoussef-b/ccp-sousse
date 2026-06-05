/**
 * @fileOverview TaskExecutor - Phase 3 de l'Architecture Agentic.
 * Version corrigée avec appels logger corrects.
 * 
 * @version 3.1.0
 * @lastUpdated 2026-04-01
 */

import { AgentContext, executeMCPTool } from './mcp';
import { TaskPlan, TaskStep } from './task-planner';
import { getAgentConfig } from './config/agent.config';
import { executorLogger } from './utils/logger';
import { StatsManager } from '@/ai/rag/utils/stats-manager';

// ============================================================================
// TYPES ET INTERFACES
// ============================================================================

export interface StepResult {
  stepId: string;
  success: boolean;
  output?: any;
  error?: string;
  duration: number;
  retries?: number;
  timestamp?: number;
}

export interface ExecutionResult {
  stepsExecuted: number;
  failedSteps: number;
  success: boolean;
  steps: StepResult[];
  summary: string;
  details: string;
  reversible: boolean;
  executionTime?: number;
  planId?: string;
}

export interface ExecutionOptions {
  maxRetries?: number;
  retryDelay?: number;
  failFast?: boolean;
  timeout?: number;
  continueOnNonCritical?: boolean;
}

export interface ExecutionMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageStepTime: number;
  averagePlanTime: number;
  successRate: number;
  stepsByTool: Map<string, number>;
  failuresByTool: Map<string, number>;
}

// ============================================================================
// STATISTIQUES
// ============================================================================

const statsManager = new StatsManager<ExecutionMetrics>({
  initial: {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageStepTime: 0,
    averagePlanTime: 0,
    successRate: 100,
    stepsByTool: new Map(),
    failuresByTool: new Map()
  },
  persistIntervalMs: 60000,
  onPersist: async (stats, timestamp) => {
    executorLogger.structured('STATS_PERSIST', { 
      module: 'task-executor', 
      stats: {
        ...stats,
        stepsByTool: Object.fromEntries(stats.stepsByTool),
        failuresByTool: Object.fromEntries(stats.failuresByTool)
      },
      timestamp: timestamp.toISOString() 
    });
  }
});

const config = getAgentConfig();
const DEFAULT_OPTIONS: ExecutionOptions = {
  maxRetries: config.executor.maxRetries,
  retryDelay: config.executor.retryDelay,
  failFast: config.executor.failFast,
  timeout: config.tools.timeout,
  continueOnNonCritical: config.executor.continueOnNonCritical
};

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

function updateMetrics(
  executionTime: number,
  stepCount: number,
  success: boolean,
  steps: StepResult[]
): void {
  statsManager.increment('totalExecutions');
  
  if (success) {
    statsManager.increment('successfulExecutions');
  } else {
    statsManager.increment('failedExecutions');
  }
  
  const total = statsManager.get().totalExecutions;
  const successRate = (statsManager.get().successfulExecutions / total) * 100;
  statsManager.update({ successRate });
  
  statsManager.average('averagePlanTime', executionTime);
  
  const totalStepTime = steps.reduce((sum, s) => sum + s.duration, 0);
  const avgStepTime = totalStepTime / (stepCount || 1);
  statsManager.average('averageStepTime', avgStepTime);
  
  for (const step of steps) {
    const toolName = step.stepId.split('-')[0] || 'unknown';
    const stepsByTool = statsManager.get().stepsByTool;
    stepsByTool.set(toolName, (stepsByTool.get(toolName) || 0) + 1);
    statsManager.update({ stepsByTool });
    
    if (!step.success) {
      const failuresByTool = statsManager.get().failuresByTool;
      failuresByTool.set(toolName, (failuresByTool.get(toolName) || 0) + 1);
      statsManager.update({ failuresByTool });
    }
  }
}

// ============================================================================
// FONCTIONS PRINCIPALES
// ============================================================================

export async function executeTaskPlan(
plan: TaskPlan, _context: AgentContext, _executionOptions: { useFallback: boolean; }, options?: ExecutionOptions): Promise<ExecutionResult> {
  const startTime = Date.now();
  const planId = generatePlanId();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  executorLogger.info('START', `Exécution du plan - ID: ${planId}, ${plan.steps.length} étapes, ${plan.steps.filter(s => s.critical).length} critiques`);
  
  const validation = validatePlan(plan);
  if (!validation.valid) {
    executorLogger.error('VALIDATION', `Plan invalide - ID: ${planId}, Erreurs: ${validation.errors.join(', ')}`);
    
    return {
      stepsExecuted: 0,
      failedSteps: 0,
      success: false,
      steps: [],
      summary: `Échec: Plan invalide - ${validation.errors.join(', ')}`,
      details: validation.errors.join('\n'),
      reversible: false,
      executionTime: Date.now() - startTime,
      planId
    };
  }
  
  const results: StepResult[] = [];
  const executedIds = new Set<string>();
  let hasCriticalFailure = false;
  
  const sortedSteps = topologicalSort(plan.steps);
  
  for (const step of sortedSteps) {
    const dependenciesMet = step.dependencies.every(id => executedIds.has(id));
    if (!dependenciesMet) continue;
    
    const result = await executeWithRetry(step, opts);
    results.push(result);
    
    step.status = result.success ? 'completed' : 'failed';
    step.result = result.output || result.error;
    
    executorLogger.info('STEP', `Étape ${step.id} - Succès: ${result.success}, Durée: ${formatDuration(result.duration)}, Retries: ${result.retries || 0}`);
    
    if (result.success) {
      executedIds.add(step.id);
    } else {
      if (step.critical) {
        executorLogger.error('CRITICAL', `Échec critique - Étape ${step.id}`);
        hasCriticalFailure = true;
        if (opts.failFast) break;
      } else if (!opts.continueOnNonCritical) {
        break;
      }
    }
  }
  
  const criticalSteps = plan.steps.filter(s => s.critical);
  const allCriticalOk = criticalSteps.every(s => executedIds.has(s.id));
  const success = !hasCriticalFailure && allCriticalOk;
  
  const stepsExecuted = results.length;
  const failedSteps = results.filter(r => !r.success).length;
  const executionTime = Date.now() - startTime;
  
  const summary = generateSummary(success, stepsExecuted, failedSteps, plan.steps.length);
  const details = generateDetails(results);
  
  const executionResult: ExecutionResult = {
    stepsExecuted,
    failedSteps,
    success,
    steps: results,
    summary,
    details,
    reversible: success && allCriticalOk,
    executionTime,
    planId
  };
  
  updateMetrics(executionTime, plan.steps.length, success, results);
  
  executorLogger.success('COMPLETE', `Plan exécuté - ID: ${planId}, Succès: ${success}, Étapes: ${stepsExecuted}/${plan.steps.length}, Durée: ${formatDuration(executionTime)}`);
  
  return executionResult;
}

async function executeWithRetry(
  step: TaskStep,
  options: ExecutionOptions
): Promise<StepResult> {
  const start = Date.now();
  let lastError: string | undefined;
  const maxRetries = options.maxRetries || 0;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = (options.retryDelay || 1000) * Math.pow(2, attempt - 1);
      executorLogger.debug('RETRY', `Tentative ${attempt} pour étape ${step.id} - Attente: ${formatDuration(delay)}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    try {
      const toolResult = await executeMCPTool(step.tool, step.params);
      
      if (toolResult.success) {
        const duration = Date.now() - start;
        return {
          stepId: step.id,
          success: true,
          output: toolResult.output,
          duration,
          retries: attempt,
          timestamp: Date.now()
        };
      }
      lastError = toolResult.error;
    } catch (error: any) {
      lastError = error.message;
    }
  }
  
  const duration = Date.now() - start;
  executorLogger.error('FAIL', `Échec définitif étape ${step.id} - Erreur: ${lastError}, Durée: ${formatDuration(duration)}`);
  
  return {
    stepId: step.id,
    success: false,
    error: lastError || 'Échec après toutes les tentatives',
    duration,
    retries: maxRetries,
    timestamp: Date.now()
  };
}

function validatePlan(plan: TaskPlan): { valid: boolean; errors: string[] } {
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
    
    for (const depId of step.dependencies) {
      if (!stepIds.has(depId)) {
        errors.push(`Étape ${step.id} dépend d'étape inexistante: ${depId}`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

function topologicalSort(steps: TaskStep[]): TaskStep[] {
  const sorted: TaskStep[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const stepMap = new Map(steps.map(s => [s.id, s]));
  
  function visit(stepId: string): boolean {
    if (visited.has(stepId)) return true;
    if (visiting.has(stepId)) return false;
    
    visiting.add(stepId);
    const step = stepMap.get(stepId);
    if (step?.dependencies) {
      for (const depId of step.dependencies) {
        if (!visit(depId)) return false;
      }
    }
    
    visiting.delete(stepId);
    visited.add(stepId);
    sorted.push(step!);
    return true;
  }
  
  for (const step of steps) {
    if (!visited.has(step.id)) visit(step.id);
  }
  
  return sorted;
}

function generateSummary(success: boolean, stepsExecuted: number, failedSteps: number, totalSteps: number): string {
  if (success) {
    return `Mission accomplie. ${stepsExecuted}/${totalSteps} étapes exécutées.`;
  }
  if (failedSteps > 0) {
    return `Échec: ${failedSteps} étape(s) échouée(s) sur ${stepsExecuted} exécutées.`;
  }
  return `Échec: aucune étape exécutée.`;
}

function generateDetails(results: StepResult[]): string {
  return results.map(r => {
    const status = r.success ? '✅' : '❌';
    const duration = formatDuration(r.duration);
    const retries = r.retries ? ` (retries: ${r.retries})` : '';
    if (r.success) {
      return `${status} [${r.stepId}] - ${duration}${retries}`;
    }
    return `${status} [${r.stepId}] - ${duration}${retries} - Erreur: ${r.error}`;
  }).join('\n');
}

export function getExecutorMetrics(): ExecutionMetrics {
  return statsManager.get();
}

export function resetExecutorMetrics(): void {
  statsManager.reset();
  executorLogger.success('STATS', 'Statistiques de l\'exécuteur réinitialisées');
}

export default {
  executeTaskPlan,
  getExecutorMetrics,
  resetExecutorMetrics
};