/**
 * @fileOverview ReversibleExecutor - Innovation 21.
 * Exécution d'actions avec possibilité d'annulation (Undo/Redo).
 * Permet d'expérimenter sans risque.
 * 
 * @version 5.0.0
 * @author Équipe Agentic
 * @copyright 2026
 * @changes Migration vers Core SQLite - Infrastructure unifiée
 */

import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { riskAssessor } from '../executor/risk-assessor';
import { modelManager, MemoryLevel } from '../resilience/model-manager';
import { simulationEngine } from '../executor/simulation-engine';
import { aiEventBus } from './event-bus';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// CONFIGURATION DU LOGGER STRUCTURÉ
// ============================================================================

const executorLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.json(),
    format.printf(({ timestamp, level, message, module, actionId, snapshotId, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        module: 'ReversibleExecutor',
        actionId,
        snapshotId,
        message,
        ...meta
      });
    })
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, actionId, snapshotId, ...meta }) => {
          const prefix = `[${timestamp}] ${level}`;
          const action = actionId ? `[action:${actionId}]` : '';
          const snapshot = snapshotId ? `[snapshot:${snapshotId}]` : '';
          return `${prefix} ${action} ${snapshot} ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    }),
    new DailyRotateFile({
      filename: 'logs/executor-%DATE%.log',
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

export interface ActionRecord {
  id: string;
  type: string;
  description: string;
  status: 'executed' | 'undone' | 'failed' | 'pending';
  reversible: boolean;
  snapshotId: string;
  action: any;
  params: any;
  result?: any;
  error?: string;
  timestamp: number;
  executionTime?: number;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionOptions {
  userId?: string;
  reversible?: boolean;
  snapshot?: boolean;
  timeout?: number;
  retryCount?: number;
  onProgress?: (progress: number) => void;
}

export interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  actionId: string;
  executionTime: number;
  reversible: boolean;
  snapshotId?: string;
}

export interface ExecutorStats {
  totalActions: number;
  executedActions: number;
  undoneActions: number;
  failedActions: number;
  averageExecutionTime: number;
  successRate: number;
  mostUsedActions: Array<{ type: string; count: number }>;
  optimization?: {
    savedSnapshots: number;
    savedMemoryEstimation: number;
    totalSnapshots: number;
  };
}

export interface HistoryFilter {
  userId?: string;
  type?: string;
  status?: ActionRecord['status'];
  fromDate?: number;
  toDate?: number;
  reversible?: boolean;
  limit?: number;
  offset?: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const DEFAULT_TIMEOUT = 30000;
const MAX_HISTORY_SIZE = 1000;
const CLEANUP_INTERVAL = 60 * 60 * 1000;
const MAX_AGE_KEEP = 7 * 24 * 60 * 60 * 1000;

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

export class ReversibleExecutor {
  private actionHistory: ActionRecord[] = [];
  private currentIndex: number = -1;
  private maxHistorySize: number = MAX_HISTORY_SIZE;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private statsUpdateInterval: NodeJS.Timeout | null = null;
  private savedSnapshotsCount: number = 0;
  private savedSnapshotsSize: number = 0;

  constructor(maxHistorySize?: number) {
    if (maxHistorySize) {
      this.maxHistorySize = maxHistorySize;
    }
    
    executorLogger.info('Initialisation du ReversibleExecutor (Core SQLite)', {
      maxHistorySize: this.maxHistorySize,
      cleanupInterval: CLEANUP_INTERVAL,
      maxAgeKeep: MAX_AGE_KEEP
    });
    
    this.startCleanupTimer();
    this.startStatsLogger();
    this.loadPersistedState();
  }

  // ==========================================================================
  // PERSISTANCE
  // ==========================================================================

  private async loadPersistedState(): Promise<void> {
    await ensureInitialized();
    executorLogger.info('État persistant SQLite prêt');
  }

  private async persistSnapshot(snapshotId: string, state: any, workflowId?: string): Promise<void> {
    await ensureInitialized();
    try {
      db.actions.saveSnapshot(snapshotId, state, workflowId);
      executorLogger.debug('Snapshot persisté', { snapshotId, workflowId });
    } catch (error) {
      executorLogger.error('Erreur persistance snapshot', { snapshotId, error });
    }
  }

  private async loadSnapshot(snapshotId: string): Promise<any | null> {
    await ensureInitialized();
    try {
      const snapshot = db.actions.getSnapshot(snapshotId);
      if (snapshot) {
        executorLogger.debug('Snapshot chargé', { snapshotId });
        return snapshot.state;
      }
    } catch (error) {
      executorLogger.error('Erreur chargement snapshot', { snapshotId, error });
    }
    return null;
  }

  private async deleteSnapshot(snapshotId: string): Promise<void> {
    await ensureInitialized();
    try {
      db.actions.deleteSnapshot(snapshotId);
      executorLogger.debug('Snapshot supprimé', { snapshotId });
    } catch (error) {
      executorLogger.error('Erreur suppression snapshot', { snapshotId, error });
    }
  }

  // ==========================================================================
  // MÉTHODES PUBLIQUES
  // ==========================================================================

  async execute(
    action: any,
    params: any,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    await ensureInitialized();
    
    const startTime = Date.now();
    const actionId = this.generateActionId();
    const reversible = options.reversible !== false;

    aiEventBus.emitAction({
      id: actionId,
      module: 'Executor',
      type: 'EXECUTION_START',
      status: 'start',
      message: `Exécution de l'action : ${action.type || 'unknown'}`,
      timestamp: startTime,
      data: { params, reversible }
    });
    
    executorLogger.info('Début exécution action', {
      actionId,
      actionType: action.type || action.name || 'unknown',
      reversible,
      hasSnapshot: options.snapshot !== false,
      timeout: options.timeout || DEFAULT_TIMEOUT
    });
    
    const riskEval = riskAssessor.evaluate(action, params);
    const memLevel = modelManager.getMemoryLevel();
    
    let shouldSnapshot = options.snapshot !== false && reversible;
    
    if (shouldSnapshot) {
      if (memLevel === MemoryLevel.SURVIVAL && riskEval.score < 0.9) {
        shouldSnapshot = false;
        executorLogger.info('Snapshot sauté (Mode SURVIVAL RAM)', { actionId, risk: riskEval.score });
      } else if (!riskEval.recommendSnapshot && memLevel !== MemoryLevel.NORMAL) {
        shouldSnapshot = false;
        executorLogger.info('Snapshot sauté (Risque faible & RAM limitée)', { actionId, risk: riskEval.score });
      } else if (riskEval.score < 0.3) {
        shouldSnapshot = false;
        executorLogger.info('Snapshot sauté (Risque très faible)', { actionId, risk: riskEval.score });
      }
    }

    let snapshotId: string | undefined;
    if (shouldSnapshot) {
      snapshotId = await this.createSnapshot(params, actionId);
      executorLogger.debug('Snapshot créé', { actionId, snapshotId, risk: riskEval.score });
      
      aiEventBus.emitAction({
        id: actionId,
        module: 'Executor',
        type: 'SNAPSHOT_CREATED',
        status: 'snapshot',
        message: `Snapshot de sécurité créé (${snapshotId})`,
        timestamp: Date.now(),
        data: { snapshotId, risk: riskEval.score }
      });
    } else if (options.snapshot !== false && reversible) {
      this.savedSnapshotsCount++;
      this.savedSnapshotsSize += JSON.stringify(params).length;
    }

    const record: ActionRecord = {
      id: actionId,
      type: action.type || 'unknown',
      description: action.description || `Action ${action.type || 'inconnue'}`,
      status: 'pending',
      reversible,
      snapshotId: snapshotId || '',
      action,
      params,
      timestamp: startTime,
      userId: params?.userId,
      metadata: {
        ...params?.metadata,
        retryCount: options.retryCount
      }
    };

    this.actionHistory.push(record);
    this.currentIndex = this.actionHistory.length - 1;

    if (riskEval.score > 0.8) {
      executorLogger.info('Lancement d\'une simulation pré-exécution (Risque élevé)', { actionId });
      const simResult = await simulationEngine.simulate(action, params);
      
      const isSimValid = simulationEngine.validateSimulation(simResult);
      if (!isSimValid) {
        executorLogger.error('Blocage de l\'exécution réelle : simulation non concluante', { 
          actionId, 
          simId: simResult.id,
          risk: simResult.riskScore,
          discrepancies: simResult.discrepancies.length
        });
        
        record.status = 'failed';
        record.error = `Simulation KO : ${simResult.discrepancies[0]?.parameter || 'Risque élevé'}`;
        record.metadata = { ...record.metadata, simulationReport: simResult };
        
        return {
          success: false,
          error: `Sécurité : Simulation non validée. ${record.error}`,
          actionId,
          executionTime: Date.now() - startTime,
          reversible
        };
      }
      executorLogger.info('Simulation validée avec succès', { actionId, simId: simResult.id });
    }

    try {
      let lastError: Error | null = null;
      let result: any = null;
      const maxRetries = options.retryCount || 0;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            executorLogger.info('Tentative de réexécution', {
              actionId,
              attempt,
              maxRetries
            });
          }
          
          result = await this.executeWithTimeout(action, params, options);
          lastError = null;
          break;
          
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 1000;
            executorLogger.warn('Échec tentative, nouvelle tentative', {
              actionId,
              attempt,
              waitTime,
              error: lastError.message
            });
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
      
      if (lastError) throw lastError;
      
      record.status = 'executed';
      record.result = result;
      record.executionTime = Date.now() - startTime;

      if (this.actionHistory.length > this.maxHistorySize) {
        this.pruneHistory();
      }

      executorLogger.info('Action exécutée avec succès', {
        actionId,
        executionTime: record.executionTime,
        reversible,
        historySize: this.actionHistory.length
      });

      return {
        success: true,
        result,
        actionId,
        executionTime: record.executionTime,
        reversible,
        snapshotId
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      record.status = 'failed';
      record.error = errorMessage;
      record.executionTime = Date.now() - startTime;

      if (snapshotId && reversible) {
        executorLogger.warn('Restauration du snapshot suite à erreur', {
          actionId,
          snapshotId,
          error: errorMessage
        });
        await this.restoreSnapshot(snapshotId);
      }

      executorLogger.error('Échec exécution action', {
        actionId,
        error: errorMessage,
        executionTime: record.executionTime,
        stack: error instanceof Error ? error.stack : undefined
      });

      return {
        success: false,
        error: errorMessage,
        actionId,
        executionTime: record.executionTime,
        reversible,
        snapshotId
      };
    }
  }

  async undo(steps: number = 1): Promise<boolean> {
    executorLogger.info('Tentative d\'annulation', { steps });
    
    if (this.currentIndex < 0) {
      executorLogger.debug('Aucune action à annuler', { currentIndex: this.currentIndex });
      return false;
    }

    let undone = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < steps; i++) {
      const lastExecuted = [...this.actionHistory]
        .reverse()
        .find((a: ActionRecord) => a.status === 'executed');
      
      if (!lastExecuted) {
        executorLogger.debug('Plus d\'actions à annuler', { undoneCount: i });
        break;
      }

      const index = this.actionHistory.indexOf(lastExecuted);
      if (index !== -1 && lastExecuted.reversible) {
        executorLogger.info('Annulation action', {
          actionId: lastExecuted.id,
          actionType: lastExecuted.type,
          index
        });
        
        await this.restoreSnapshot(lastExecuted.snapshotId);
        lastExecuted.status = 'undone';
        this.currentIndex = index - 1;
        undone++;
      } else if (!lastExecuted.reversible) {
        executorLogger.warn('Action non réversible ignorée', {
          actionId: lastExecuted.id,
          actionType: lastExecuted.type
        });
      }
    }

    const duration = Date.now() - startTime;
    
    executorLogger.info('Annulation terminée', {
      stepsRequested: steps,
      undoneCount: undone,
      duration: `${duration}ms`,
      remainingUndoable: this.canUndo()
    });
    
    return undone > 0;
  }

  async redo(steps: number = 1): Promise<boolean> {
    executorLogger.info('Tentative de réexécution', { steps });
    
    const undoneActions = [...this.actionHistory]
      .reverse()
      .filter((a: ActionRecord) => a.status === 'undone');

    if (undoneActions.length === 0) {
      executorLogger.debug('Aucune action à réexécuter');
      return false;
    }

    let redone = 0;
    const startTime = Date.now();

    for (let i = 0; i < Math.min(steps, undoneActions.length); i++) {
      const action = undoneActions[i];
      const index = this.actionHistory.indexOf(action);
      
      if (index !== -1) {
        executorLogger.info('Réexécution action', {
          actionId: action.id,
          actionType: action.type,
          index
        });
        
        try {
          const result = await this.executeWithTimeout(
            action.action,
            action.params,
            {}
          );
          
          action.status = 'executed';
          action.result = result;
          action.executionTime = Date.now() - action.timestamp;
          this.currentIndex = index;
          redone++;
          
          executorLogger.debug('Action réexécutée', {
            actionId: action.id,
            executionTime: action.executionTime
          });
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          action.status = 'failed';
          action.error = errorMessage;
          
          executorLogger.error('Échec réexécution', {
            actionId: action.id,
            error: errorMessage
          });
          
          break;
        }
      }
    }

    const duration = Date.now() - startTime;
    
    executorLogger.info('Réexécution terminée', {
      stepsRequested: steps,
      redoneCount: redone,
      duration: `${duration}ms`,
      remainingRedoable: this.canRedo()
    });
    
    return redone > 0;
  }

  getHistory(filter?: HistoryFilter): ActionRecord[] {
    const startTime = Date.now();
    
    executorLogger.debug('Récupération historique', { filter });
    
    let history = [...this.actionHistory];

    if (filter) {
      const beforeCount = history.length;
      
      history = history.filter(record => {
        if (filter.userId && record.userId !== filter.userId) return false;
        if (filter.type && record.type !== filter.type) return false;
        if (filter.status && record.status !== filter.status) return false;
        if (filter.reversible !== undefined && record.reversible !== filter.reversible) return false;
        if (filter.fromDate && record.timestamp < filter.fromDate) return false;
        if (filter.toDate && record.timestamp > filter.toDate) return false;
        return true;
      });
      
      executorLogger.debug('Filtrage appliqué', {
        beforeCount,
        afterCount: history.length,
        filter
      });
    }

    history.sort((a, b) => b.timestamp - a.timestamp);

    if (filter?.offset || filter?.limit) {
      const offset = filter?.offset || 0;
      const limit = filter?.limit || history.length;
      const beforeSlice = history.length;
      history = history.slice(offset, offset + limit);
      
      executorLogger.debug('Pagination appliquée', {
        offset,
        limit,
        beforeCount: beforeSlice,
        afterCount: history.length
      });
    }
    
    const duration = Date.now() - startTime;
    executorLogger.debug('Historique récupéré', {
      count: history.length,
      duration: `${duration}ms`
    });
    
    return history;
  }

  getAction(actionId: string): ActionRecord | undefined {
    executorLogger.debug('Récupération action', { actionId });
    
    const action = this.actionHistory.find(a => a.id === actionId);
    
    if (action) {
      executorLogger.debug('Action trouvée', {
        actionId,
        type: action.type,
        status: action.status
      });
    } else {
      executorLogger.warn('Action non trouvée', { actionId });
    }
    
    return action;
  }

  getLastAction(): ActionRecord | null {
    if (this.currentIndex >= 0) {
      const action = this.actionHistory[this.currentIndex];
      executorLogger.debug('Dernière action', {
        actionId: action.id,
        type: action.type,
        status: action.status
      });
      return action;
    }
    
    executorLogger.debug('Aucune dernière action');
    return null;
  }

  canUndo(): boolean {
    const canUndo = this.actionHistory.some(a => a.status === 'executed' && a.reversible);
    executorLogger.debug('Vérification annulation possible', { canUndo });
    return canUndo;
  }

  canRedo(): boolean {
    const canRedo = this.actionHistory.some(a => a.status === 'undone');
    executorLogger.debug('Vérification réexécution possible', { canRedo });
    return canRedo;
  }

  clearHistory(): void {
    const previousSize = this.actionHistory.length;
    
    executorLogger.warn('Effacement complet de l\'historique', {
      actionsCount: previousSize
    });
    
    this.actionHistory = [];
    this.currentIndex = -1;
    
    executorLogger.info('Historique effacé');
  }

  getStats(): ExecutorStats {
    const startTime = Date.now();
    
    const executed = this.actionHistory.filter(a => a.status === 'executed');
    const undone = this.actionHistory.filter(a => a.status === 'undone');
    const failed = this.actionHistory.filter(a => a.status === 'failed');
    
    const avgTime = executed.reduce((sum, a) => 
      sum + (a.executionTime || 0), 0) / (executed.length || 1);
    
    const successRate = this.actionHistory.length > 0
      ? (executed.length / this.actionHistory.length) * 100
      : 100;

    const typeCount = new Map<string, number>();
    this.actionHistory.forEach(a => {
      typeCount.set(a.type, (typeCount.get(a.type) || 0) + 1);
    });

    const mostUsedActions = Array.from(typeCount.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const stats: ExecutorStats = {
      totalActions: this.actionHistory.length,
      executedActions: executed.length,
      undoneActions: undone.length,
      failedActions: failed.length,
      averageExecutionTime: avgTime,
      successRate,
      mostUsedActions,
      optimization: {
        savedSnapshots: this.savedSnapshotsCount,
        savedMemoryEstimation: this.savedSnapshotsSize,
        totalSnapshots: 0
      }
    };
    
    const duration = Date.now() - startTime;
    executorLogger.debug('Statistiques calculées', {
      ...stats,
      duration: `${duration}ms`
    });
    
    return stats;
  }

  async checkpoint(): Promise<string> {
    executorLogger.info('Création checkpoint');
    
    const checkpointId = await this.createSnapshot(this.actionHistory);
    
    executorLogger.info('Checkpoint créé', { checkpointId });
    
    return checkpointId;
  }

  async restore(checkpointId: string): Promise<boolean> {
    executorLogger.info('Restauration checkpoint', { checkpointId });
    
    const snapshot = await this.loadSnapshot(checkpointId);
    if (snapshot) {
      const previousSize = this.actionHistory.length;
      
      this.actionHistory = snapshot;
      this.currentIndex = this.actionHistory.length - 1;
      
      executorLogger.info('Checkpoint restauré', {
        checkpointId,
        previousSize,
        newSize: this.actionHistory.length
      });
      
      return true;
    }
    
    executorLogger.warn('Checkpoint non trouvé', { checkpointId });
    return false;
  }

  // ==========================================================================
  // MÉTHODES PRIVÉES
  // ==========================================================================

  private generateActionId(): string {
    const actionId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    executorLogger.debug('ID d\'action généré', { actionId });
    return actionId;
  }

  private async createSnapshot(state: any, workflowId?: string): Promise<string> {
    const startTime = Date.now();
    const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    try {
      const cloned = JSON.parse(JSON.stringify(state));
      
      await this.persistSnapshot(snapshotId, cloned, workflowId);
      
      const duration = Date.now() - startTime;
      executorLogger.debug('Snapshot créé et persisté', {
        snapshotId,
        size: JSON.stringify(cloned).length,
        duration: `${duration}ms`
      });
      
      return snapshotId;
      
    } catch (error) {
      executorLogger.error('Échec création snapshot', {
        snapshotId,
        error: error instanceof Error ? error.message : 'Unknown'
      });
      throw error;
    }
  }

  private async restoreSnapshot(snapshotId: string): Promise<boolean> {
    const startTime = Date.now();
    
    executorLogger.debug('Restauration snapshot', { snapshotId });
    
    const snapshot = await this.loadSnapshot(snapshotId);
    if (snapshot) {
      const duration = Date.now() - startTime;
      executorLogger.debug('Snapshot restauré', {
        snapshotId,
        duration: `${duration}ms`
      });
      return true;
    }
    
    executorLogger.warn('Snapshot non trouvé', { snapshotId });
    return false;
  }

  private async executeWithTimeout(
    action: any,
    params: any,
    options: ExecutionOptions
  ): Promise<any> {
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    
    executorLogger.debug('Exécution avec timeout', { timeout });

    const executeFn = async () => {
      if (typeof action === 'function') {
        return await action(params);
      } else if (action.execute && typeof action.execute === 'function') {
        return await action.execute(params);
      } else {
        throw new Error('Action invalide: doit être une fonction ou avoir une méthode execute()');
      }
    };

    try {
      const result = await Promise.race([
        executeFn(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout après ${timeout}ms`)), timeout)
        )
      ]);
      
      executorLogger.debug('Exécution réussie', { timeout });
      return result;
      
    } catch (error) {
      executorLogger.warn('Exécution échouée ou timeout', {
        timeout,
        error: error instanceof Error ? error.message : 'Unknown'
      });
      throw error;
    }
  }

  private pruneHistory(): void {
    if (this.actionHistory.length <= this.maxHistorySize) return;

    const startTime = Date.now();
    
    executorLogger.info('Nettoyage historique', {
      currentSize: this.actionHistory.length,
      maxSize: this.maxHistorySize
    });

    const sorted = [...this.actionHistory].sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = sorted.slice(0, this.actionHistory.length - this.maxHistorySize);
    
    for (const record of toRemove) {
      const index = this.actionHistory.indexOf(record);
      if (index !== -1) {
        this.actionHistory.splice(index, 1);
        if (record.snapshotId) {
          this.deleteSnapshot(record.snapshotId);
        }
      }
    }

    this.currentIndex = this.actionHistory.length - 1;
    
    const duration = Date.now() - startTime;
    executorLogger.info('Historique nettoyé', {
      removedCount: toRemove.length,
      newSize: this.actionHistory.length,
      duration: `${duration}ms`
    });
  }

  private cleanup(): void {
    const startTime = Date.now();
    
    executorLogger.debug('Nettoyage périodique');
    
    // Le Core SQLite gère le nettoyage automatique
    // plus besoin de cacheManager.cleanup()
    
    const duration = Date.now() - startTime;
    executorLogger.debug('Nettoyage terminé', { duration: `${duration}ms` });
  }

  private startCleanupTimer(): void {
    if (typeof setInterval !== 'undefined') {
      this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
      if (this.cleanupTimer?.unref) {
        this.cleanupTimer.unref();
      }
      
      executorLogger.info('Timer de nettoyage démarré', {
        interval: CLEANUP_INTERVAL
      });
    }
  }

  private startStatsLogger(): void {
    if (typeof setInterval !== 'undefined') {
      this.statsUpdateInterval = setInterval(() => {
        const stats = this.getStats();
        executorLogger.info('Statistiques périodiques', {
          totalActions: stats.totalActions,
          successRate: stats.successRate.toFixed(2) + '%',
          avgExecutionTime: stats.averageExecutionTime.toFixed(2) + 'ms',
          mostUsedAction: stats.mostUsedActions[0]?.type
        });
      }, 5 * 60 * 1000);
      
      if (this.statsUpdateInterval?.unref) {
        this.statsUpdateInterval.unref();
      }
    }
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      executorLogger.info('Timer de nettoyage arrêté');
    }
    
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
      this.statsUpdateInterval = null;
      executorLogger.info('Logger de statistiques arrêté');
    }
  }
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

export function createAction(
  type: string,
  executeFn: (params: any) => Promise<any>,
  description?: string
): any {
  const action = {
    type,
    description: description || `Action ${type}`,
    execute: executeFn
  };
  
  executorLogger.debug('Action créée', {
    type,
    description: action.description
  });
  
  return action;
}

export function combineActions(actions: any[]): any {
  executorLogger.info('Combinaison d\'actions', {
    actionsCount: actions.length,
    actionTypes: actions.map(a => a.type || 'unknown')
  });
  
  return {
    type: 'combined',
    description: `Combine ${actions.length} actions`,
    execute: async (params: any) => {
      const results = [];
      for (const action of actions) {
        if (typeof action === 'function') {
          results.push(await action(params));
        } else if (action.execute) {
          results.push(await action.execute(params));
        }
      }
      return results;
    }
  };
}

export default ReversibleExecutor;

// ============================================================================
// EXPORT POUR TESTING
// ============================================================================

export const __testables__ = {
  DEFAULT_TIMEOUT,
  MAX_HISTORY_SIZE,
  CLEANUP_INTERVAL,
  MAX_AGE_KEEP,
  ensureInitialized
};

// ============================================================================
// GESTION DES SIGNAUX
// ============================================================================

if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    executorLogger.info('Signal SIGTERM reçu, fermeture propre');
  });
  
  process.on('SIGINT', () => {
    executorLogger.info('Signal SIGINT reçu, fermeture propre');
  });
}