/**
 * @fileOverview HierarchicalPlanner - Innovation 18.
 * Décomposition des tâches complexes en sous-actions exécutables avec validation multi-niveaux.
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
import { symbolicValidator } from '../planner/symbolic-validator';
import { sequenceValidator } from '../validation/sequence-validator';
import { aiEventBus } from './event-bus';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// CONFIGURATION DU LOGGER STRUCTURÉ
// ============================================================================

const plannerLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.json(),
    format.printf(({ timestamp, level, message, module, planId, stepId, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        module: 'HierarchicalPlanner',
        planId,
        stepId,
        message,
        ...meta
      });
    })
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, planId, stepId, ...meta }) => {
          const prefix = `[${timestamp}] ${level}`;
          const plan = planId ? `[plan:${planId}]` : '';
          const step = stepId ? `[step:${stepId}]` : '';
          return `${prefix} ${plan} ${step} ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    }),
    new DailyRotateFile({
      filename: 'logs/planner-%DATE%.log',
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

export interface Step {
  id: string;
  description: string;
  subSteps: Step[];
  status: 'pending' | 'executing' | 'completed' | 'failed';
  type: 'atomic' | 'composite';
  validationCriteria?: string;
  estimatedDuration?: number;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface Plan {
  id?: string;
  task: string;
  steps: Step[];
  metadata?: {
    createdAt: number;
    updatedAt: number;
    totalSteps: number;
    atomicSteps: number;
    compositeSteps: number;
    estimatedDuration?: number;
    context?: string;
    warnings?: string[];
  };
}

export interface PlanningMetrics {
  totalPlans: number;
  totalStepsGenerated: number;
  averageStepsPerPlan: number;
  averageDepth: number;
  atomicVsComposite: {
    atomic: number;
    composite: number;
    ratio: number;
  };
  successRate: number;
  averagePlanningTime: number;
  decompositionLevels: Record<number, number>;
}

export interface PlanningOptions {
  maxDepth?: number;
  minConfidence?: number;
  useCache?: boolean;
  timeout?: number;
  enableMetrics?: boolean;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_TIMEOUT = 30000;
const ATOMIC_HEURISTIC_THRESHOLD = 40;
const ATOMIC_KEYWORDS = ['calculer', 'chercher', 'lire', 'écrire', 'trouver', 'afficher', 'notifier'];
const COMPOSITE_INDICATORS = ['analyser', 'planifier', 'coordonner', 'gérer', 'superviser', 'organiser'];

const CACHE_NAMESPACE = 'plan';
const CACHE_TTL_SECONDS = 300;

// Core SQLite
const db = SQLiteCore.getInstance();
let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await db.initialize();
    initialized = true;
  }
}

let metrics: PlanningMetrics = {
  totalPlans: 0,
  totalStepsGenerated: 0,
  averageStepsPerPlan: 0,
  averageDepth: 0,
  atomicVsComposite: { atomic: 0, composite: 0, ratio: 0 },
  successRate: 100,
  averagePlanningTime: 0,
  decompositionLevels: {}
};

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function updateMetrics(plan: Plan, planningTime: number, success: boolean): void {
  if (!plan.metadata) return;
  
  metrics.totalPlans++;
  metrics.totalStepsGenerated += plan.metadata.totalSteps;
  metrics.averageStepsPerPlan = metrics.totalStepsGenerated / metrics.totalPlans;
  metrics.averageDepth = (metrics.averageDepth * (metrics.totalPlans - 1) + plan.metadata.totalSteps) / metrics.totalPlans;
  metrics.atomicVsComposite.atomic += plan.metadata.atomicSteps;
  metrics.atomicVsComposite.composite += plan.metadata.compositeSteps;
  metrics.atomicVsComposite.ratio = metrics.atomicVsComposite.atomic / (metrics.atomicVsComposite.composite || 1);
  metrics.averagePlanningTime = (metrics.averagePlanningTime * (metrics.totalPlans - 1) + planningTime) / metrics.totalPlans;
  
  const successRate = (metrics.successRate * (metrics.totalPlans - 1) + (success ? 100 : 0)) / metrics.totalPlans;
  metrics.successRate = successRate;
  
  const depth = Math.max(...plan.steps.map(step => getStepDepth(step)));
  metrics.decompositionLevels[depth] = (metrics.decompositionLevels[depth] || 0) + 1;
}

function getStepDepth(step: Step, currentDepth: number = 0): number {
  if (step.subSteps.length === 0) return currentDepth;
  return Math.max(...step.subSteps.map(subStep => getStepDepth(subStep, currentDepth + 1)));
}

// ============================================================================
// FONCTIONS PRINCIPALES
// ============================================================================

export async function getHierarchicalPlan(
  task: string, 
  context: string,
  options?: PlanningOptions
): Promise<Plan> {
  await ensureInitialized();
  
  const startTime = Date.now();
  const planId = uuidv4();

  aiEventBus.emitAction({
    id: planId,
    module: 'Planner',
    type: 'PLANNING_START',
    status: 'start',
    message: `Planification hiérarchique : "${task.substring(0, 40)}..."`,
    timestamp: startTime,
    data: { task, options }
  });

  const maxDepth = options?.maxDepth || DEFAULT_MAX_DEPTH;
  
  plannerLogger.info('Début planification hiérarchique', {
    planId,
    task: task.substring(0, 100),
    contextLength: context.length,
    maxDepth
  });
  
  if (options?.useCache !== false) {
    const cacheKey = `${task}-${context.substring(0, 200)}`;
    const cached = db.get<Plan>(CACHE_NAMESPACE, cacheKey);
    if (cached) {
      plannerLogger.info('Plan récupéré du cache', { planId, stepsCount: cached.steps.length });
      return { ...cached, id: planId };
    }
  }
  
  try {
    const timeout = options?.timeout || DEFAULT_TIMEOUT;
    const planningPromise = performPlanning(task, context, maxDepth, planId);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Planification timeout après ${timeout}ms`)), timeout);
    });
    
    const plan = await Promise.race([planningPromise, timeoutPromise]);
    
    const planningTime = Date.now() - startTime;
    plan.id = planId;
    
    plannerLogger.info('Validation multi-niveaux du plan...', { planId });
    
    let symbolicViolations = await symbolicValidator.validatePlan(plan.steps);
    let sequenceViolations = sequenceValidator.validateSequence(plan.steps);
    
    let allViolations = [
        ...symbolicViolations,
        ...sequenceViolations.map(v => ({ 
            message: v.message, 
            description: plan.steps[v.startIndex]?.description || 'Séquence',
            severity: v.severity as any 
        }))
    ];

    let attempts = 0;
    const MAX_REVISION_ATTEMPTS = 2;

    while (allViolations.length > 0 && attempts < MAX_REVISION_ATTEMPTS) {
      plannerLogger.warn(`Violations détectées (${allViolations.length}). Tentative de révision ${attempts + 1}/${MAX_REVISION_ATTEMPTS}`, { planId });
      
      aiEventBus.emitAction({
        id: planId,
        module: 'Planner',
        type: 'SAFETY_VIOLATION',
        status: 'blocked',
        message: `${allViolations.length} violations de sécurité détectées. Lancement auto-correction...`,
        timestamp: Date.now(),
        data: { violations: allViolations }
      });
      
      const revisionPrompt = `Tu es un Expert en Sécurité Industrielle. Le plan suivant contient des violations de sécurité critiques (logique et séquence HAZOP). 
      Réécris le plan pour corriger ces erreurs tout en conservant l'objectif final.
      
      TÂCHE : ${task}
      PLAN ACTUEL : ${JSON.stringify(plan.steps)}
      
      VIOLATIONS DÉTECTÉES :
      ${allViolations.map(v => `- ${v.message} (Problème détecté vers: "${v.description}")`).join('\n')}
      
      RÈGLE D'OR : Ajoute des étapes de préparation (vérification, consignation, monitoring) AVANT les actions dangereuses. Respecte les séquences de sécurité (ex: Purge -> Attente -> Fermeture).
      
      Format JSON ATTENDU: { "steps": [...] } (Même structure que précédemment)`;

      try {
        const revisedResponse = await callOllama(revisionPrompt, {
          model: 'phi3.5:latest',
          temperature: 0.2,
          maxTokens: 2000
        });

        const match = revisedResponse.match(/\{.*\}/s);
        if (match) {
          const data = JSON.parse(match[0]);
          plan.steps = (data.steps || []).map((s: any) => ({
            id: uuidv4(),
            description: s.description || s.desc,
            subSteps: s.subSteps || [],
            status: 'pending' as const,
            type: s.subSteps?.length > 0 ? 'composite' : 'atomic',
            validationCriteria: s.validationCriteria || s.validation
          }));
          
          symbolicViolations = await symbolicValidator.validatePlan(plan.steps);
          sequenceViolations = sequenceValidator.validateSequence(plan.steps);
          
          allViolations = [
            ...symbolicViolations,
            ...sequenceViolations.map(v => ({ 
                message: v.message, 
                description: plan.steps[v.startIndex]?.description || 'Séquence',
                severity: v.severity as any 
            }))
          ];
        }
      } catch (revError) {
        plannerLogger.error('Erreur lors de la révision du plan', { planId, error: revError });
      }
      
      attempts++;
    }

    if (allViolations.length > 0) {
      plannerLogger.error('Le plan reste invalide après révision. Injection d\'avertissements.', { planId });
      plan.metadata = { ...plan.metadata, warnings: allViolations.map(v => v.message) } as any;
    }

    plan.metadata = {
      ...plan.metadata,
      createdAt: startTime,
      updatedAt: Date.now(),
      context: context.substring(0, 200),
      totalSteps: plan.steps.length,
      atomicSteps: plan.steps.filter(s => s.type === 'atomic').length,
      compositeSteps: plan.steps.filter(s => s.type === 'composite').length,
      estimatedDuration: estimatePlanDuration(plan.steps)
    };
    
    if (options?.useCache !== false) {
      const cacheKey = `${task}-${context.substring(0, 200)}`;
      db.set(CACHE_NAMESPACE, cacheKey, plan, CACHE_TTL_SECONDS);
    }
    
    if (options?.enableMetrics !== false) {
      updateMetrics(plan, planningTime, true);
    }
    
    plannerLogger.info('Planification terminée et validée', {
      planId,
      stepsCount: plan.steps.length,
      violationsCount: allViolations.length,
      planningTime: `${Date.now() - startTime}ms`
    });
    
    return plan;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    const planningTime = Date.now() - startTime;
    
    plannerLogger.error('Échec de la planification', {
      planId,
      error: errorMessage,
      planningTime: `${planningTime}ms`
    });
    
    const fallbackPlan: Plan = {
      id: planId,
      task,
      steps: [{
        id: uuidv4(),
        description: task,
        subSteps: [],
        status: 'pending',
        type: 'atomic',
        validationCriteria: 'Tâche exécutée avec succès'
      }],
      metadata: {
        createdAt: startTime,
        updatedAt: Date.now(),
        totalSteps: 1,
        atomicSteps: 1,
        compositeSteps: 0,
        estimatedDuration: 0,
        context: context.substring(0, 200)
      }
    };
    
    if (options?.enableMetrics !== false) {
      updateMetrics(fallbackPlan, planningTime, false);
    }
    
    return fallbackPlan;
  }
}

async function performPlanning(
  task: string,
  context: string,
  maxDepth: number,
  planId: string
): Promise<Plan> {
  plannerLogger.debug('Décomposition initiale', { planId, task });
  
  const mainSteps = await decomposeTask(task, context, planId);
  const fullSteps = await expandSteps(mainSteps, context, 0, maxDepth, planId);
  
  const countSteps = (steps: Step[]): { total: number; atomic: number; composite: number } => {
    let total = steps.length;
    let atomic = steps.filter(s => s.type === 'atomic').length;
    let composite = steps.filter(s => s.type === 'composite').length;
    
    for (const step of steps) {
      if (step.subSteps.length > 0) {
        const subCounts = countSteps(step.subSteps);
        total += subCounts.total;
        atomic += subCounts.atomic;
        composite += subCounts.composite;
      }
    }
    return { total, atomic, composite };
  };
  
  const counts = countSteps(fullSteps);
  
  return {
    task,
    steps: fullSteps,
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalSteps: counts.total,
      atomicSteps: counts.atomic,
      compositeSteps: counts.composite,
      estimatedDuration: estimatePlanDuration(fullSteps)
    }
  };
}

async function decomposeTask(task: string, context: string, planId?: string): Promise<Step[]> {
  const startTime = Date.now();
  
  plannerLogger.debug('Décomposition de tâche', { planId, task: task.substring(0, 100) });
  
  try {
    const prompt = `Tu es un Planificateur Technique Expert. Décompose la tâche en 2-3 étapes concrètes et logiques.
    
    Règles de décomposition:
    - Chaque étape doit être claire et actionnable
    - Inclure des critères de validation mesurables
    - Respecter l'ordre logique d'exécution
    
    Tâche: "${task}"
    Contexte: ${context.substring(0, 500)}
    
    Génère un plan d'action en étapes.
    Format JSON: { "steps": [{"desc": "Description de l'étape", "validation": "Critère de réussite", "estimated": "Durée estimée en secondes"}] }`;

    const response = await callOllama(prompt, {
      model: 'phi:2.7b',
      temperature: 0.3,
      maxTokens: 1000,
      timeout: 15000
    });

    const match = response.match(/\{.*\}/s);
    if (match) {
      const data = JSON.parse(match[0]);
      const steps = (data.steps || []).map((s: any) => ({
        id: uuidv4(),
        description: s.desc,
        subSteps: [],
        status: 'pending' as const,
        type: 'composite' as const,
        validationCriteria: s.validation,
        estimatedDuration: s.estimated ? parseInt(s.estimated) : undefined
      }));
      
      plannerLogger.debug('Décomposition réussie', {
        planId,
        stepsCount: steps.length,
        duration: Date.now() - startTime
      });
      
      return steps;
    }
    
    throw new Error('No valid JSON in response');
    
  } catch (error) {
    plannerLogger.error('Échec décomposition', { planId, error: error instanceof Error ? error.message : 'Unknown' });
    return [{
      id: uuidv4(),
      description: task,
      subSteps: [],
      status: 'pending',
      type: 'atomic',
      validationCriteria: 'Tâche complétée avec succès'
    }];
  }
}

async function expandSteps(
  steps: Step[],
  context: string,
  depth: number,
  maxDepth: number,
  planId?: string
): Promise<Step[]> {
  if (depth >= maxDepth) {
    return steps.map(step => ({ ...step, type: 'atomic' as const, subSteps: [] }));
  }

  const expanded: Step[] = [];
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const isAtomic = await checkIsStepAtomic(step.description, planId);
    
    if (isAtomic) {
      expanded.push({ ...step, type: 'atomic', subSteps: [] });
    } else {
      const subSteps = await decomposeTask(step.description, context, planId);
      const expandedSub = await expandSteps(subSteps, context, depth + 1, maxDepth, planId);
      expanded.push({ ...step, subSteps: expandedSub, type: 'composite' });
    }
  }
  
  return expanded;
}

async function checkIsStepAtomic(step: string, planId?: string): Promise<boolean> {
  const q = step.toLowerCase();
  
  if (q.length < ATOMIC_HEURISTIC_THRESHOLD) {
    return true;
  }
  
  if (ATOMIC_KEYWORDS.some(keyword => q.includes(keyword))) {
    return true;
  }
  
  if (COMPOSITE_INDICATORS.some(indicator => q.includes(indicator))) {
    return false;
  }
  
  try {
    const prompt = `Tu es un expert en analyse de tâches. Détermine si une action est atomique (simple, ne peut être décomposée) ou complexe (nécessite plusieurs sous-étapes). Réponds uniquement par 'ATOMIC' ou 'COMPOSITE'.
    
    Analyse cette action: "${step}"`;

    const response = await callOllama(prompt, {
      model: 'phi:2.7b',
      temperature: 0.3,
      maxTokens: 1000,
      timeout: 15000
    });
    return response.toUpperCase().includes('ATOMIC');
    
  } catch (error) {
    plannerLogger.warn('Échec vérification LLM, fallback sur atomique', {
      planId,
      step: step.substring(0, 50),
      error: error instanceof Error ? error.message : 'Unknown'
    });
    return true;
  }
}

function estimatePlanDuration(steps: Step[]): number {
  let total = 0;
  
  for (const step of steps) {
    if (step.estimatedDuration) {
      total += step.estimatedDuration;
    } else if (step.type === 'composite' && step.subSteps.length > 0) {
      total += estimatePlanDuration(step.subSteps);
    } else {
      total += 30;
    }
  }
  
  return total;
}

export async function formatHierarchicalPlan(plan: Plan): Promise<string> {
  let output = `### 📋 Plan d'exécution : ${plan.task}\n\n`;
  
  if (plan.metadata) {
    output += `**Métriques du plan:**\n`;
    output += `- 📊 ${plan.metadata.totalSteps} étapes totales\n`;
    output += `- ⚡ ${plan.metadata.atomicSteps} actions atomiques\n`;
    output += `- 🔄 ${plan.metadata.compositeSteps} tâches composées\n`;
    if (plan.metadata.estimatedDuration) {
      const minutes = Math.floor(plan.metadata.estimatedDuration / 60);
      const seconds = plan.metadata.estimatedDuration % 60;
      output += `- ⏱️ Durée estimée: ${minutes}m ${seconds}s\n`;
    }
    output += `\n`;
  }
  
  const renderSteps = (steps: Step[], level: number) => {
    steps.forEach((s, i) => {
      const indent = "  ".repeat(level);
      const prefix = level === 0 ? `**${i + 1}.**` : `  -`;
      const statusIcon = {
        pending: '⏳',
        executing: '🔄',
        completed: '✅',
        failed: '❌'
      }[s.status];
      
      output += `${indent}${prefix} ${statusIcon} ${s.description}\n`;
      
      if (s.validationCriteria) {
        output += `${indent}   *Critère: ${s.validationCriteria}*\n`;
      }
      
      if (s.subSteps.length > 0) {
        renderSteps(s.subSteps, level + 1);
      }
    });
  };

  renderSteps(plan.steps, 0);
  output += `\n*Plan ID: ${plan.id}*`;
  
  return output;
}

export function getPlanningMetrics(): PlanningMetrics {
  return { ...metrics };
}

export function resetPlanningMetrics(): void {
  plannerLogger.info('Réinitialisation des métriques');
  metrics = {
    totalPlans: 0,
    totalStepsGenerated: 0,
    averageStepsPerPlan: 0,
    averageDepth: 0,
    atomicVsComposite: { atomic: 0, composite: 0, ratio: 0 },
    successRate: 100,
    averagePlanningTime: 0,
    decompositionLevels: {}
  };
}

export async function validatePlan(plan: Plan): Promise<{
  isValid: boolean;
  issues: string[];
  suggestions: string[];
}> {
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  const validateSteps = (steps: Step[], path: string[] = []) => {
    for (const step of steps) {
      if (!step.validationCriteria) {
        issues.push(`Étape "${step.description}" sans critère de validation`);
        suggestions.push(`Ajouter un critère de validation pour: ${step.description}`);
      }
      
      if (step.subSteps.length > 0) {
        validateSteps(step.subSteps, [...path, step.description]);
      }
    }
  };
  
  validateSteps(plan.steps);
  
  const allStepIds = new Set<string>();
  const collectIds = (steps: Step[]) => {
    for (const step of steps) {
      if (allStepIds.has(step.id)) {
        issues.push(`ID d'étape dupliqué: ${step.id}`);
      }
      allStepIds.add(step.id);
      if (step.subSteps.length > 0) collectIds(step.subSteps);
    }
  };
  
  collectIds(plan.steps);
  
  return { isValid: issues.length === 0, issues, suggestions };
}

// ============================================================================
// EXPORT POUR TESTING
// ============================================================================

export const __testables__ = {
  decomposeTask,
  expandSteps,
  checkIsStepAtomic,
  estimatePlanDuration,
  validatePlan: validatePlan,
  updateMetrics,
  ATOMIC_KEYWORDS,
  COMPOSITE_INDICATORS,
  ATOMIC_HEURISTIC_THRESHOLD,
  CACHE_NAMESPACE,
  ensureInitialized
};

// ============================================================================
// GESTION DES SIGNAUX
// ============================================================================

if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    plannerLogger.info('Signal SIGTERM reçu, fermeture propre');
  });
  process.on('SIGINT', () => {
    plannerLogger.info('Signal SIGINT reçu, fermeture propre');
  });
}