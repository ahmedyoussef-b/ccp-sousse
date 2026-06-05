/**
 * @fileOverview WorkflowOrchestrator - Orchestration de tâches multi-agents.
 * @version 1.1.0
 * @description Exécute des graphes de tâches avec gestion des dépendances et piping
 * @note Stateless - Aucune donnée persistante
 */

// ============================================================================
// TYPES
// ============================================================================

export interface WorkflowTask {
  id: string;
  toolName: string;
  params: Record<string, any>;
  dependencies: string[];      // Liste des IDs de tâches dont dépend cette tâche
  outputKey?: string;          // Nom de la variable pour stocker le résultat
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  timeout?: number;            // Timeout en ms pour la tâche
  retryCount?: number;         // Nombre de tentatives en cas d'échec
}

export interface TaskGraph {
  id: string;
  tasks: WorkflowTask[];
  options?: {
    stopOnError?: boolean;     // Arrêter l'exécution à la première erreur
    maxConcurrent?: number;    // Nombre max de tâches parallèles (0 = illimité)
  };
}

export interface WorkflowResult {
  results: Record<string, any>;
  completedTasks: string[];
  failedTasks: string[];
  totalDuration: number;
}

// ============================================================================
// LOGS
// ============================================================================

const LOG_PREFIX = '[WORKFLOW]';

function logInfo(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logError(message: string, error?: any): void {
  console.error(`${LOG_PREFIX} ❌ ${message}`);
  if (error) console.error(`${LOG_PREFIX} 🔥 ${error.message || error}`);
}

// ============================================================================
// SERVICE
// ============================================================================

export class WorkflowOrchestrator {
  /**
  /**
 * Résout les dépendances et exécute le graphe de tâches
 */
public async executeWorkflow(
  graph: TaskGraph,
  toolExecutor: (toolName: string, params: any) => Promise<any>
): Promise<Record<string, any>> {
  const startTime = Date.now();
  const results: Record<string, any> = {};
  const pendingTasks = new Set(graph.tasks.map(t => t.id));
  const completedTasks = new Set<string>();
  const failedTasks = new Set<string>();
  const stopOnError = graph.options?.stopOnError ?? true;
  
  logInfo(`🚀 Démarrage du workflow "${graph.id}" avec ${graph.tasks.length} tâches`);
  
  // Copie des tâches avec le type complet
  const tasks: WorkflowTask[] = graph.tasks.map(t => ({ 
    ...t, 
    status: 'pending' as const 
  }));
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  while (pendingTasks.size > 0) {
    // 1. Identifier les tâches prêtes
    const readyTasks = tasks.filter(t => 
      pendingTasks.has(t.id) && 
      t.dependencies.every(depId => completedTasks.has(depId)) &&
      t.status === 'pending'
    );

    if (readyTasks.length === 0 && pendingTasks.size > 0) {
      const blockedTasks = Array.from(pendingTasks);
      logError(`Tâches bloquées: ${blockedTasks.join(', ')}`);
      throw new Error(`Dépendance circulaire ou bloquante détectée dans le graphe de tâches. Tâches bloquées: ${blockedTasks.join(', ')}`);
    }

    // 2. Exécution parallèle des tâches prêtes (avec limite de concurrence)
    const maxConcurrent = graph.options?.maxConcurrent || 0;
    
    if (maxConcurrent > 0 && readyTasks.length > maxConcurrent) {
      // Exécution par lots
      for (let i = 0; i < readyTasks.length; i += maxConcurrent) {
        const batch = readyTasks.slice(i, i + maxConcurrent);
        const batchPromises = batch.map(task => 
          this.executeTask(task, taskMap, results, toolExecutor, failedTasks)
        );
        await Promise.all(batchPromises);
      }
    } else {
      // Exécution parallèle complète
      const executionPromises = readyTasks.map(task => 
        this.executeTask(task, taskMap, results, toolExecutor, failedTasks)
      );
      await Promise.all(executionPromises);
    }

    // Vérifier si on doit arrêter en cas d'erreur
    if (stopOnError && failedTasks.size > 0) {
      const errorMessage = `Workflow arrêté: ${failedTasks.size} tâche(s) ont échoué. Tâches échouées: ${Array.from(failedTasks).join(', ')}`;
      logError(errorMessage);
      throw new Error(errorMessage);
    }

    // Mettre à jour les ensembles - Vérifier le statut via les tâches copiées
    for (const task of readyTasks) {
      // Récupérer la tâche à jour depuis taskMap
      const updatedTask = taskMap.get(task.id);
      if (updatedTask?.status === 'completed') {
        completedTasks.add(task.id);
        pendingTasks.delete(task.id);
      } else if (updatedTask?.status === 'failed') {
        pendingTasks.delete(task.id);
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  logInfo(`✅ Workflow "${graph.id}" terminé en ${totalDuration}ms, ${completedTasks.size}/${graph.tasks.length} tâches réussies`);

  return results;
}

  /**
   * Exécute une tâche individuelle avec gestion des retries et timeout
   */
  private async executeTask(
    task: WorkflowTask,
    taskMap: Map<string, WorkflowTask>,
    results: Record<string, any>,
    toolExecutor: (toolName: string, params: any) => Promise<any>,
    failedTasks: Set<string>
  ): Promise<void> {
    const maxRetries = task.retryCount ?? 0;
    const timeout = task.timeout ?? 30000;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        task.status = 'running';
        
        // Injection des résultats des dépendances
        const injectedParams = this.injectResults(task.params, results, taskMap);
        
        logInfo(`⚙️ Exécution tâche "${task.id}" (${task.toolName}), tentative ${attempt + 1}/${maxRetries + 1}`);
        
        // Exécution avec timeout
        const result = await this.executeWithTimeout(
          () => toolExecutor(task.toolName, injectedParams),
          timeout
        );
        
        task.result = result;
        task.status = 'completed';
        
        if (task.outputKey) {
          results[task.outputKey] = result;
        }
        
        logInfo(`✅ Tâche "${task.id}" terminée avec succès`);
        return;
        
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        logInfo(`⚠️ Tâche "${task.id}" échouée (tentative ${attempt + 1}/${maxRetries + 1}): ${errorMsg}`);
        
        if (attempt === maxRetries) {
          task.status = 'failed';
          failedTasks.add(task.id);
          throw new Error(`Échec de la tâche ${task.id} (${task.toolName}) après ${maxRetries + 1} tentatives: ${errorMsg}`);
        }
        
        // Attente exponentielle entre les tentatives
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Exécute une promesse avec timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout après ${timeoutMs}ms`)), timeoutMs);
    });
    
    return Promise.race([fn(), timeoutPromise]);
  }

  /**
   * Remplace les placeholders {{taskName.key}} par les résultats réels
   * Supporte également {{taskName}} pour l'objet complet
   */
  private injectResults(
    params: Record<string, any>, 
    results: Record<string, any>,
    taskMap?: Map<string, WorkflowTask>
  ): Record<string, any> {
    const injected = JSON.stringify(params);
    const parsed = JSON.parse(injected.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      // Vérifier si le chemin contient un point
      const parts = path.split('.');
      const taskId = parts[0];
      const keyPath = parts.slice(1).join('.');
      
      // Chercher d'abord dans les résultats
      let value = this.getValueByPath(results, path);
      
      // Sinon, chercher dans les résultats des tâches
      if (value === undefined && taskMap) {
        const task = taskMap.get(taskId);
        if (task?.result) {
          if (keyPath) {
            value = this.getValueByPath(task.result, keyPath);
          } else {
            value = task.result;
          }
        }
      }
      
      // Si toujours undefined, laisser le placeholder
      if (value === undefined) {
        console.warn(`${LOG_PREFIX} ⚠️ Placeholder non résolu: ${match}`);
        return match;
      }
      
      return typeof value === 'string' ? value : JSON.stringify(value);
    }));
    
    return parsed;
  }

  /**
   * Récupère une valeur par chemin (ex: "user.data.profile")
   */
  private getValueByPath(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((acc, part) => {
      if (acc === null || acc === undefined) return undefined;
      return acc[part];
    }, obj);
  }

  /**
   * Valide un graphe de tâches avant exécution
   */
  public validateGraph(graph: TaskGraph): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const taskIds = new Set(graph.tasks.map(t => t.id));
    
    // Vérifier les IDs uniques
    if (taskIds.size !== graph.tasks.length) {
      errors.push('Des IDs de tâches sont dupliqués');
    }
    
    // Vérifier les dépendances existantes
    for (const task of graph.tasks) {
      for (const depId of task.dependencies) {
        if (!taskIds.has(depId)) {
          errors.push(`Tâche "${task.id}" dépend de "${depId}" qui n'existe pas`);
        }
      }
    }
    
    // Vérifier les dépendances circulaires (simple détection)
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycle = (taskId: string, taskMap: Map<string, WorkflowTask>): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);
      
      const task = taskMap.get(taskId);
      if (task) {
        for (const depId of task.dependencies) {
          if (!visited.has(depId)) {
            if (hasCycle(depId, taskMap)) return true;
          } else if (recursionStack.has(depId)) {
            return true;
          }
        }
      }
      
      recursionStack.delete(taskId);
      return false;
    };
    
    const taskMap = new Map(graph.tasks.map(t => [t.id, t]));
    for (const task of graph.tasks) {
      if (!visited.has(task.id)) {
        if (hasCycle(task.id, taskMap)) {
          errors.push(`Dépendance circulaire détectée impliquant la tâche "${task.id}"`);
          break;
        }
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const workflowOrchestrator = new WorkflowOrchestrator();

// ============================================================================
// EXPORT PAR DÉFAUT
// ============================================================================

export default {
  WorkflowOrchestrator,
  workflowOrchestrator
};