/**
 * @fileOverview AsyncWorkflow - Innovation 23.
 * Gestion des tâches longues en arrière-plan avec suivi de progression.
 * 
 * @version 3.0.0
 * @author Équipe Agentic
 * @copyright 2026
 * @changes Correction: utilisation de setImmediate pour différer l'exécution
 */

// ============================================================================
// IMPORTS ET CONFIGURATION DES LOGS
// ============================================================================

import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { etaPredictor } from '../workflow/eta-predictor';
import { aiEventBus } from './event-bus';

// Configuration du logger structuré
const workflowLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.json(),
    format.printf(({ timestamp, level, message, module, workflowId, stepId, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        module: 'AsyncWorkflow',
        workflowId,
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
        format.printf(({ timestamp, level, message, workflowId, stepId, ...meta }) => {
          const prefix = `[${timestamp}] ${level}`;
          const context = workflowId ? `[${workflowId}]` : '';
          const step = stepId ? `[step:${stepId}]` : '';
          return `${prefix} ${context} ${step} ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    }),
    new DailyRotateFile({
      filename: 'logs/workflow-%DATE%.log',
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

export interface WorkflowStep {
  id: string;
  label: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  result?: any;
  error?: WorkflowError;
  startedAt?: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface WorkflowError {
  code: string;
  message: string;
  stepId?: string;
  retryable: boolean;
  details?: Record<string, unknown>;
  timestamp: number;
}

export interface WorkflowMetadata {
  userId?: string;
  source: 'chat' | 'agent' | 'procedure' | 'system';
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  estimatedDuration?: number;
  callbackUrl?: string;
}

export type WorkflowStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

export interface Workflow {
  id: string;
  type: string;
  task: string;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  progress: number;
  startedAt?: number;
  completedAt?: number;
  error?: WorkflowError;
  metadata: WorkflowMetadata;
  createdAt: number;
  updatedAt: number;
  timeout?: number;
  eta?: number;           // Fin estimée (timestamp)
  confidence?: number;    // Score de confiance (0-1)
}

export interface WorkflowMetrics {
  totalWorkflows: number;
  activeWorkflows: number;
  queuedWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  cancelledWorkflows: number;
  pausedWorkflows: number;
  averageCompletionTime: number;
  successRate: number;
}

export interface WorkflowFilter {
  status?: WorkflowStatus;
  type?: string;
  userId?: string;
  fromDate?: number;
  toDate?: number;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface WorkflowUpdate {
  status?: WorkflowStatus;
  progress?: number;
  steps?: WorkflowStep[];
  error?: WorkflowError;
  metadata?: Partial<WorkflowMetadata>;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const DEFAULT_TIMEOUT = 30 * 60 * 1000;
const MAX_CONCURRENT_WORKFLOWS = 10;
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const MAX_AGE_KEEP = 24 * 60 * 60 * 1000;

// ============================================================================
// FONCTIONS UTILITAIRES POUR LES VÉRIFICATIONS DE STATUT
// ============================================================================

/**
 * Vérifie si un workflow est dans un état qui permet l'exécution
 */
function isWorkflowActive(status: WorkflowStatus): boolean {
  const isActive = status === 'running' || status === 'queued';
  workflowLogger.debug('Vérification état actif', { status, isActive });
  return isActive;
}

/**
 * Vérifie si un workflow est terminé (avec succès ou échec)
 */
function isWorkflowCompleted(status: WorkflowStatus): boolean {
  const isCompleted = status === 'completed' || status === 'failed' || status === 'cancelled';
  workflowLogger.debug('Vérification état terminé', { status, isCompleted });
  return isCompleted;
}

/**
 * Vérifie si un workflow peut être annulé
 */
function canCancelWorkflow(status: WorkflowStatus): boolean {
  const canCancel = status === 'queued' || status === 'running' || status === 'paused';
  workflowLogger.debug('Vérification annulation possible', { status, canCancel });
  return canCancel;
}

/**
 * Vérifie si un workflow peut être mis en pause
 */
function canPauseWorkflow(status: WorkflowStatus): boolean {
  const canPause = status === 'running';
  workflowLogger.debug('Vérification pause possible', { status, canPause });
  return canPause;
}

/**
 * Vérifie si un workflow peut être repris
 */
function canResumeWorkflow(status: WorkflowStatus): boolean {
  const canResume = status === 'paused';
  workflowLogger.debug('Vérification reprise possible', { status, canResume });
  return canResume;
}

// ============================================================================
// REGISTRE DES WORKFLOWS
// ============================================================================

class WorkflowRegistry {
  private workflows: Map<string, Workflow> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private activeCount = 0;

  constructor() {
    workflowLogger.info('Initialisation du registre des workflows');
    this.startCleanupTimer();
  }

  set(id: string, workflow: Workflow): void {
    const oldWorkflow = this.workflows.get(id);
    const wasActive = oldWorkflow ? isWorkflowActive(oldWorkflow.status) : false;
    const isActive = isWorkflowActive(workflow.status);
    
    workflow.updatedAt = Date.now();
    
    if (!wasActive && isActive) {
      this.activeCount++;
      workflowLogger.info('Workflow activé', {
        workflowId: id,
        status: workflow.status,
        activeCount: this.activeCount,
        progress: workflow.progress
      });
    }
    
    if (wasActive && !isActive) {
      this.activeCount--;
      workflowLogger.info('Workflow désactivé', {
        workflowId: id,
        status: workflow.status,
        activeCount: this.activeCount,
        duration: workflow.completedAt ? workflow.completedAt - (workflow.startedAt || workflow.createdAt) : undefined
      });
    }
    
    this.workflows.set(id, workflow);
    
    workflowLogger.debug('Workflow enregistré', {
      workflowId: id,
      type: workflow.type,
      status: workflow.status,
      progress: workflow.progress,
      totalWorkflows: this.workflows.size
    });
  }

  get(id: string): Workflow | undefined {
    const workflow = this.workflows.get(id);
    
    if (workflow) {
      workflowLogger.debug('Workflow récupéré', {
        workflowId: id,
        status: workflow.status,
        progress: workflow.progress
      });
    } else {
      workflowLogger.warn('Workflow non trouvé', { workflowId: id });
    }
    
    return workflow;
  }

  delete(id: string): boolean {
    const workflow = this.workflows.get(id);
    const deleted = this.workflows.delete(id);
    
    if (deleted && workflow) {
      if (isWorkflowActive(workflow.status)) {
        this.activeCount--;
      }
      
      workflowLogger.info('Workflow supprimé', {
        workflowId: id,
        status: workflow.status,
        age: Date.now() - workflow.createdAt,
        activeCount: this.activeCount
      });
    }
    
    return deleted;
  }

  getAll(filter?: WorkflowFilter): Workflow[] {
    let workflows = Array.from(this.workflows.values());
    
    workflowLogger.debug('Récupération de tous les workflows', {
      total: workflows.length,
      filterApplied: !!filter
    });

    if (filter) {
      const beforeCount = workflows.length;
      
      workflows = workflows.filter(w => {
        if (filter.status && w.status !== filter.status) return false;
        if (filter.type && w.type !== filter.type) return false;
        if (filter.userId && w.metadata.userId !== filter.userId) return false;
        if (filter.fromDate && w.createdAt < filter.fromDate) return false;
        if (filter.toDate && w.createdAt > filter.toDate) return false;
        if (filter.tags && !filter.tags.every(t => w.metadata.tags.includes(t))) return false;
        return true;
      });
      
      workflowLogger.debug('Filtrage des workflows', {
        beforeCount,
        afterCount: workflows.length,
        filter
      });
    }

    workflows.sort((a, b) => b.createdAt - a.createdAt);

    if (filter?.offset || filter?.limit) {
      const offset = filter?.offset || 0;
      const limit = filter?.limit || workflows.length;
      const beforeSlice = workflows.length;
      workflows = workflows.slice(offset, offset + limit);
      
      workflowLogger.debug('Pagination des workflows', {
        offset,
        limit,
        beforeCount: beforeSlice,
        afterCount: workflows.length
      });
    }

    return workflows;
  }

  getActiveCount(): number {
    workflowLogger.debug('Récupération du nombre de workflows actifs', {
      activeCount: this.activeCount,
      maxConcurrent: MAX_CONCURRENT_WORKFLOWS,
      availableSlots: MAX_CONCURRENT_WORKFLOWS - this.activeCount
    });
    
    return this.activeCount;
  }

  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    
    workflowLogger.info('Début du nettoyage automatique', {
      totalWorkflows: this.workflows.size,
      activeCount: this.activeCount
    });

    this.workflows.forEach((workflow, id) => {
      if (isWorkflowCompleted(workflow.status)) {
        const age = now - (workflow.completedAt || workflow.updatedAt);
        if (age > MAX_AGE_KEEP) {
          toDelete.push(id);
          workflowLogger.info('Workflow marqué pour suppression', {
            workflowId: id,
            status: workflow.status,
            age,
            maxAge: MAX_AGE_KEEP
          });
        }
      }
    });

    toDelete.forEach(id => {
      this.workflows.delete(id);
    });
    
    workflowLogger.info('Nettoyage terminé', {
      deletedCount: toDelete.length,
      remainingWorkflows: this.workflows.size
    });
  }

  private startCleanupTimer(): void {
    if (typeof setInterval !== 'undefined') {
      this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
      if (this.cleanupTimer?.unref) {
        this.cleanupTimer.unref();
      }
      
      workflowLogger.info('Timer de nettoyage démarré', {
        interval: CLEANUP_INTERVAL,
        maxAgeKeep: MAX_AGE_KEEP
      });
    }
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      workflowLogger.info('Timer de nettoyage arrêté');
    }
  }
}

const workflowRegistry = new WorkflowRegistry();

// ============================================================================
// FONCTIONS PRINCIPALES
// ============================================================================

export async function submitWorkflow(
  type: string, 
  task: string,
  metadata?: Partial<WorkflowMetadata>
): Promise<string> {
  const startTime = Date.now();
  
  workflowLogger.info('Soumission d\'un nouveau workflow', {
    type,
    taskLength: task.length,
    metadata
  });
  
  const activeCount = workflowRegistry.getActiveCount();
  
  if (activeCount >= MAX_CONCURRENT_WORKFLOWS) {
    workflowLogger.error('Limite de workflows concurrents atteinte', {
      activeCount,
      maxConcurrent: MAX_CONCURRENT_WORKFLOWS,
      type,
      task
    });
    
    throw new Error(`Limite de workflows concurrents atteinte (${MAX_CONCURRENT_WORKFLOWS})`);
  }

  const workflowId = `wf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  const workflow: Workflow = {
    id: workflowId,
    type,
    task,
    status: 'queued',
    progress: 0,
    steps: [
      { 
        id: '1', 
        label: 'Analyse initiale', 
        description: 'Compréhension de la tâche et planification',
        status: 'pending', 
        progress: 0 
      },
      { 
        id: '2', 
        label: 'Traitement des données', 
        description: 'Exécution des actions nécessaires',
        status: 'pending', 
        progress: 0 
      },
      { 
        id: '3', 
        label: 'Synthèse finale', 
        description: 'Génération du résultat et validation',
        status: 'pending', 
        progress: 0 
      }
    ],
    metadata: {
      userId: metadata?.userId,
      source: metadata?.source || 'system',
      priority: metadata?.priority || 'medium',
      tags: metadata?.tags || [],
      estimatedDuration: metadata?.estimatedDuration,
      callbackUrl: metadata?.callbackUrl
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    timeout: DEFAULT_TIMEOUT,
    eta: Date.now() + (metadata?.estimatedDuration || 15000), // ETA initial
    confidence: metadata?.estimatedDuration ? 0.5 : 0.1
  };

  workflowRegistry.set(workflowId, workflow);
  
  workflowLogger.info('Workflow soumis avec succès', {
    workflowId,
    type,
    status: workflow.status,
    submissionTime: Date.now() - startTime,
    queuePosition: activeCount + 1
  });

  aiEventBus.emitAction({
    id: workflowId,
    module: 'Workflow',
    type: 'WORKFLOW_STARTED',
    status: 'start',
    message: `Démarrage de la tâche : ${type}`,
    timestamp: Date.now(),
    data: { type, eta: workflow.eta }
  });
  
  // CORRECTION: Utiliser setImmediate pour différer l'exécution
  // Cela permet aux tests de vérifier l'état 'queued' avant le début du traitement
  const startProcessing = () => {
    processWorkflow(workflowId, task).catch(error => {
      workflowLogger.error('Erreur lors du traitement du workflow', {
        workflowId,
        error: error.message,
        stack: error.stack
      });
      
      updateWorkflowError(workflowId, {
        code: 'PROCESS_ERROR',
        message: error.message,
        retryable: false,
        timestamp: Date.now()
      });
    });
  };

  // Utiliser setImmediate si disponible, sinon setTimeout
  if (typeof setImmediate !== 'undefined') {
    setImmediate(startProcessing);
  } else {
    setTimeout(startProcessing, 0);
  }
  
  return workflowId;
}

export async function getWorkflowStatus(workflowId: string): Promise<Workflow | null> {
  const startTime = Date.now();
  
  workflowLogger.debug('Récupération du statut du workflow', { workflowId });
  
  const workflow = workflowRegistry.get(workflowId);
  
  if (workflow) {
    workflowLogger.debug('Statut du workflow récupéré', {
      workflowId,
      status: workflow.status,
      progress: workflow.progress,
      duration: Date.now() - startTime
    });
  }
  
  return workflow || null;
}

export async function getWorkflows(filter?: WorkflowFilter): Promise<Workflow[]> {
  const startTime = Date.now();
  
  workflowLogger.info('Récupération des workflows', { filter });
  
  const workflows = workflowRegistry.getAll(filter);
  
  workflowLogger.info('Workflows récupérés', {
    count: workflows.length,
    filter,
    duration: Date.now() - startTime
  });
  
  return workflows;
}

export async function updateWorkflow(
  workflowId: string, 
  update: WorkflowUpdate
): Promise<Workflow | null> {
  const startTime = Date.now();
  
  workflowLogger.info('Mise à jour du workflow', {
    workflowId,
    updateFields: Object.keys(update)
  });
  
  const workflow = workflowRegistry.get(workflowId);
  if (!workflow) {
    workflowLogger.warn('Workflow non trouvé pour mise à jour', { workflowId });
    return null;
  }

  const previousStatus = workflow.status;
  const previousProgress = workflow.progress;

  if (update.status) workflow.status = update.status;
  if (update.progress !== undefined) workflow.progress = update.progress;
  if (update.steps) workflow.steps = update.steps;
  if (update.error) workflow.error = update.error;
  if (update.metadata) {
    workflow.metadata = { ...workflow.metadata, ...update.metadata };
  }

  workflow.updatedAt = Date.now();
  workflowRegistry.set(workflowId, workflow);

  workflowLogger.info('Workflow mis à jour', {
    workflowId,
    previousStatus,
    newStatus: workflow.status,
    previousProgress,
    newProgress: workflow.progress,
    duration: Date.now() - startTime
  });

  return workflow;
}

export async function updateWorkflowError(
  workflowId: string,
  error: WorkflowError
): Promise<void> {
  workflowLogger.error('Enregistrement d\'erreur workflow', {
    workflowId,
    errorCode: error.code,
    errorMessage: error.message,
    retryable: error.retryable,
    stepId: error.stepId
  });
  
  const workflow = workflowRegistry.get(workflowId);
  if (workflow) {
    workflow.error = error;
    workflow.status = 'failed';
    workflow.updatedAt = Date.now();
    workflowRegistry.set(workflowId, workflow);
    
    workflowLogger.error('Workflow marqué comme échoué', {
      workflowId,
      errorCode: error.code,
      duration: workflow.startedAt ? Date.now() - workflow.startedAt : undefined
    });
  }
}

export async function cancelWorkflow(workflowId: string): Promise<boolean> {
  workflowLogger.info('Tentative d\'annulation du workflow', { workflowId });
  
  const workflow = workflowRegistry.get(workflowId);
  
  if (workflow && canCancelWorkflow(workflow.status)) {
    workflow.status = 'cancelled';
    workflow.updatedAt = Date.now();
    workflowRegistry.set(workflowId, workflow);
    
    workflowLogger.info('Workflow annulé avec succès', {
      workflowId,
      previousStatus: workflow.status,
      progressAtCancel: workflow.progress
    });
    
    return true;
  }
  
  workflowLogger.warn('Impossible d\'annuler le workflow', {
    workflowId,
    currentStatus: workflow?.status,
    canCancel: workflow ? canCancelWorkflow(workflow.status) : false
  });
  
  return false;
}

export async function pauseWorkflow(workflowId: string): Promise<boolean> {
  workflowLogger.info('Tentative de mise en pause du workflow', { workflowId });
  
  const workflow = workflowRegistry.get(workflowId);
  
  if (workflow && canPauseWorkflow(workflow.status)) {
    workflow.status = 'paused';
    workflow.updatedAt = Date.now();
    workflowRegistry.set(workflowId, workflow);
    
    workflowLogger.info('Workflow mis en pause', {
      workflowId,
      progressAtPause: workflow.progress,
      currentStep: workflow.steps.find(s => s.status === 'running')?.label
    });
    
    return true;
  }
  
  workflowLogger.warn('Impossible de mettre en pause le workflow', {
    workflowId,
    currentStatus: workflow?.status,
    canPause: workflow ? canPauseWorkflow(workflow.status) : false
  });
  
  return false;
}

export async function resumeWorkflow(workflowId: string): Promise<boolean> {
  workflowLogger.info('Tentative de reprise du workflow', { workflowId });
  
  const workflow = workflowRegistry.get(workflowId);
  
  if (workflow && canResumeWorkflow(workflow.status)) {
    workflow.status = 'running';
    workflow.updatedAt = Date.now();
    workflowRegistry.set(workflowId, workflow);
    
    workflowLogger.info('Workflow repris', {
      workflowId,
      pausedDuration: Date.now() - workflow.updatedAt,
      remainingProgress: 100 - workflow.progress
    });
    
    processWorkflow(workflowId, workflow.task).catch(error => {
      workflowLogger.error('Erreur lors de la reprise du workflow', {
        workflowId,
        error: error.message
      });
    });
    
    return true;
  }
  
  workflowLogger.warn('Impossible de reprendre le workflow', {
    workflowId,
    currentStatus: workflow?.status,
    canResume: workflow ? canResumeWorkflow(workflow.status) : false
  });
  
  return false;
}

export async function deleteWorkflow(workflowId: string): Promise<boolean> {
  workflowLogger.info('Suppression du workflow', { workflowId });
  
  const deleted = workflowRegistry.delete(workflowId);
  
  if (deleted) {
    workflowLogger.info('Workflow supprimé avec succès', { workflowId });
  } else {
    workflowLogger.warn('Workflow non trouvé pour suppression', { workflowId });
  }
  
  return deleted;
}

export async function getWorkflowMetrics(): Promise<WorkflowMetrics> {
  const startTime = Date.now();
  
  workflowLogger.info('Calcul des métriques des workflows');
  
  const workflows = workflowRegistry.getAll();
  const now = Date.now();
  
  const completed = workflows.filter(w => w.status === 'completed');
  const totalCompleted = completed.length;
  
  const avgTime = completed.reduce((sum, w) => {
    const duration = (w.completedAt || now) - (w.startedAt || w.createdAt);
    return sum + duration;
  }, 0) / (totalCompleted || 1);
  
  const failed = workflows.filter(w => w.status === 'failed').length;
  const totalFinished = totalCompleted + failed;
  const successRate = totalFinished > 0 ? (totalCompleted / totalFinished) * 100 : 100;
  
  const metrics: WorkflowMetrics = {
    totalWorkflows: workflows.length,
    activeWorkflows: workflows.filter(w => isWorkflowActive(w.status)).length,
    queuedWorkflows: workflows.filter(w => w.status === 'queued').length,
    completedWorkflows: totalCompleted,
    failedWorkflows: failed,
    cancelledWorkflows: workflows.filter(w => w.status === 'cancelled').length,
    pausedWorkflows: workflows.filter(w => w.status === 'paused').length,
    averageCompletionTime: avgTime,
    successRate
  };
  
  workflowLogger.info('Métriques calculées', {
    ...metrics,
    computationTime: Date.now() - startTime
  });
  
  return metrics;
}

// ============================================================================
// LOGIQUE INTERNE
// ============================================================================

async function processWorkflow(id: string, task: string): Promise<void> {
  const startTime = Date.now();
  
  workflowLogger.info('Début du traitement du workflow', {
    workflowId: id,
    taskLength: task.length
  });
  
  const workflow = workflowRegistry.get(id);
  if (!workflow) {
    workflowLogger.warn('Workflow non trouvé pour traitement', { workflowId: id });
    return;
  }

  if (!isWorkflowActive(workflow.status)) {
    workflowLogger.warn('Workflow non actif, traitement ignoré', {
      workflowId: id,
      status: workflow.status
    });
    return;
  }

  workflow.status = 'running';
  workflow.startedAt = Date.now();
  workflowRegistry.set(id, workflow);
  
  workflowLogger.info('Workflow démarré', {
    workflowId: id,
    stepsCount: workflow.steps.length,
    estimatedDuration: workflow.metadata.estimatedDuration
  });
  
  // Facteur de performance actuel (basé sur les étapes précédentes)
  let perfFactor = 1.0;

  try {
    for (let i = 0; i < workflow.steps.length; i++) {
      const stepStartTime = Date.now();
      const currentWorkflow = workflowRegistry.get(id);
      
      if (!currentWorkflow) {
        workflowLogger.warn('Workflow disparu pendant l\'exécution', { workflowId: id, stepIndex: i });
        break;
      }
      
      if (currentWorkflow.status === 'cancelled') {
        workflowLogger.info('Workflow annulé pendant l\'exécution', {
          workflowId: id,
          stepIndex: i,
          cancelledAt: Date.now() - startTime
        });
        break;
      }
      
      if (currentWorkflow.status === 'paused') {
        workflowLogger.info('Workflow en pause', {
          workflowId: id,
          stepIndex: i,
          pausedAt: Date.now() - startTime
        });
        
        await waitForResume(id);
        
        const afterPause = workflowRegistry.get(id);
        if (!afterPause || afterPause.status === 'cancelled') {
          workflowLogger.info('Workflow annulé pendant la pause', { workflowId: id });
          break;
        }
      }

      const step = workflow.steps[i];
      step.status = 'running';
      step.startedAt = Date.now();
      
      workflowLogger.info('Début de l\'étape', {
        workflowId: id,
        stepId: step.id,
        stepLabel: step.label,
        stepIndex: i + 1,
        totalSteps: workflow.steps.length
      });
      
      
      // Ajustement de la priorité (Innovation 23)
      const baseInterval = 250;
      const stepInterval = workflow.metadata.priority === 'high' ? Math.max(50, baseInterval / 2) : baseInterval;
      const stepDuration = 2000;
      const steps = stepDuration / stepInterval;
      
      for (let p = 1; p <= steps; p++) {
        const current = workflowRegistry.get(id);
        if (!current) break;
        
        if (current.status === 'cancelled') {
          step.status = 'cancelled';
          workflowLogger.info('Étape annulée', {
            workflowId: id,
            stepId: step.id,
            progressAtCancel: step.progress
          });
          break;
        }
        
        if (current.status === 'paused') {
          workflowLogger.info('Pause pendant l\'étape', {
            workflowId: id,
            stepId: step.id,
            progressAtPause: step.progress
          });
          
          await waitForResume(id);
          
          const afterPause = workflowRegistry.get(id);
          if (!afterPause || afterPause.status === 'cancelled') {
            step.status = 'cancelled';
            workflowLogger.info('Étape annulée après pause', { workflowId: id, stepId: step.id });
            break;
          }
        }

        step.progress = Math.round((p / steps) * 100);
        workflow.progress = Math.round(
          ((i * 100) + step.progress) / workflow.steps.length
        );
        
        workflowRegistry.set(id, workflow);
        
        if (p % Math.ceil(steps / 10) === 0 || p === steps) {
          workflowLogger.debug('Progression de l\'étape', {
            workflowId: id,
            stepId: step.id,
            stepProgress: step.progress,
            globalProgress: workflow.progress,
            iteration: p,
            totalIterations: steps
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, stepInterval));
      }

      if (step.status !== 'cancelled') {
        step.status = 'completed';
        step.completedAt = Date.now();
        step.progress = 100;
        
        
        // 📊 Enregistrement des métriques et mise à jour de l'ETA (Innovation 23)
        const duration = Date.now() - stepStartTime;
        etaPredictor.recordStepDuration(step.label, duration);
        
        perfFactor = etaPredictor.calculatePerformanceFactor(step.label, duration);
        const remainingSteps = workflow.steps.slice(i + 1);
        const remainingTime = etaPredictor.predictRemainingTime(remainingSteps, perfFactor);
        
        workflow.eta = Date.now() + remainingTime;
        workflow.confidence = etaPredictor.getConfidenceScore(workflow.steps);

        workflowLogger.info('Étape terminée', {
          workflowId: id,
          stepId: step.id,
          stepLabel: step.label,
          stepDuration: duration,
          perfFactor: perfFactor.toFixed(2),
          newETA: new Date(workflow.eta).toLocaleTimeString(),
          confidence: (workflow.confidence * 100).toFixed(0) + '%'
        });
      }
    }

    const finalWorkflow = workflowRegistry.get(id);
    if (finalWorkflow && 
        finalWorkflow.status !== 'cancelled' && 
        finalWorkflow.status !== 'failed') {
      finalWorkflow.status = 'completed';
      finalWorkflow.completedAt = Date.now();
      finalWorkflow.progress = 100;
      workflowRegistry.set(id, finalWorkflow);
      
      const totalDuration = Date.now() - startTime;
      
      workflowLogger.info('Workflow terminé avec succès', {
        workflowId: id,
        totalDuration,
        stepsCompleted: finalWorkflow.steps.filter(s => s.status === 'completed').length,
        totalSteps: finalWorkflow.steps.length,
        estimatedDuration: finalWorkflow.metadata.estimatedDuration,
        durationVariance: finalWorkflow.metadata.estimatedDuration ? 
          totalDuration - finalWorkflow.metadata.estimatedDuration : undefined
      });
      
      if (finalWorkflow.metadata.callbackUrl) {
        workflowLogger.info('Notification de fin de workflow', {
          workflowId: id,
          callbackUrl: finalWorkflow.metadata.callbackUrl
        });
        
        await notifyCompletion(finalWorkflow);
      }
    }

  } catch (error) {
    const failedWorkflow = workflowRegistry.get(id);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    
    workflowLogger.error('Erreur lors de l\'exécution du workflow', {
      workflowId: id,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      duration: Date.now() - startTime
    });
    
    if (failedWorkflow) {
      failedWorkflow.status = 'failed';
      failedWorkflow.error = {
        code: 'EXECUTION_ERROR',
        message: errorMessage,
        retryable: true,
        timestamp: Date.now()
      };
      failedWorkflow.completedAt = Date.now();
      failedWorkflow.updatedAt = Date.now();
      workflowRegistry.set(id, failedWorkflow);
      
      workflowLogger.info('Workflow marqué comme échoué', {
        workflowId: id,
        errorCode: 'EXECUTION_ERROR',
        duration: Date.now() - startTime
      });
    }
  }
}

async function waitForResume(workflowId: string): Promise<void> {
  const waitStartTime = Date.now();
  
  workflowLogger.debug('Attente de reprise', { workflowId });
  
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      const workflow = workflowRegistry.get(workflowId);
      if (!workflow) {
        workflowLogger.debug('Workflow disparu pendant l\'attente', { workflowId });
        clearInterval(checkInterval);
        resolve();
        return;
      }
      
      if (workflow.status === 'running' || workflow.status === 'cancelled') {
        const waitDuration = Date.now() - waitStartTime;
        
        workflowLogger.debug('Reprise détectée', {
          workflowId,
          status: workflow.status,
          waitDuration
        });
        
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);
  });
}

async function notifyCompletion(workflow: Workflow): Promise<void> {
  if (!workflow.metadata.callbackUrl) {
    workflowLogger.debug('Pas de callback URL configuré', { workflowId: workflow.id });
    return;
  }
  
  const startTime = Date.now();
  
  workflowLogger.info('Envoi de la notification de fin', {
    workflowId: workflow.id,
    callbackUrl: workflow.metadata.callbackUrl,
    status: workflow.status
  });
  
  try {
    await fetch(workflow.metadata.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: workflow.id,
        status: workflow.status,
        progress: workflow.progress,
        completedAt: workflow.completedAt,
        error: workflow.error
      })
    });
    
    workflowLogger.info('Notification envoyée avec succès', {
      workflowId: workflow.id,
      duration: Date.now() - startTime
    });
    
  } catch (error) {
    workflowLogger.error('Erreur lors de l\'envoi de la notification', {
      workflowId: workflow.id,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      callbackUrl: workflow.metadata.callbackUrl,
      duration: Date.now() - startTime
    });
  }
}

export function shutdown(): void {
  workflowLogger.info('Arrêt du gestionnaire de workflows');
  workflowRegistry.stopCleanupTimer();
}

if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    workflowLogger.info('Signal SIGTERM reçu');
    console.log('🛑 Arrêt du gestionnaire de workflows...');
    shutdown();
  });
  
  process.on('SIGINT', () => {
    workflowLogger.info('Signal SIGINT reçu');
    console.log('🛑 Arrêt du gestionnaire de workflows...');
    shutdown();
  });
}

// ============================================================================
// EXPORT POUR TESTING
// ============================================================================

export const __testables__ = {
  workflowRegistry,
  isWorkflowActive,
  isWorkflowCompleted,
  canCancelWorkflow,
  canPauseWorkflow,
  canResumeWorkflow,
  processWorkflow,
  waitForResume,
  notifyCompletion
};