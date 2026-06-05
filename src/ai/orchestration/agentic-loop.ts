/**
 * @fileOverview Boucle Agentique - Orchestration des outils MCP
 * @version 3.0.0
 * @lastUpdated 2026-04-25
 * @changes Migration vers SQLite pour statistiques persistantes
 */

import { executeMCPTool, type MCPTool } from '@/ai/mcp/service';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

// ============================================================================
// STATISTIQUES SQLITE
// ============================================================================

const db = getSQLiteCore();

async function recordLoopStats(success: boolean, duration: number, stepsCount: number, successfulSteps: number, failedSteps: number): Promise<void> {
  await db.orchestration.stats.record('agentic_loop', 'loop_complete', {
    success,
    duration,
    stepsCount,
    successfulSteps,
    failedSteps,
    timestamp: Date.now()
  });
  
  // Enregistrer métrique globale
  await db.recordMetric('orchestration', 'agentic_loop_duration', duration);
  await db.recordMetric('orchestration', 'agentic_loop_success', success ? 1 : 0);
}

async function recordStepStats(tool: string, action: string, success: boolean, duration: number): Promise<void> {
  await db.orchestration.stats.record('agentic_step', 'step_execution', {
    tool,
    action,
    success,
    duration,
    timestamp: Date.now()
  });
  
  // Incrémenter compteur d'utilisation de l'outil
  await db.orchestration.stats.record('tool_usage', tool, { action, success });
}

// ============================================================================
// FONCTIONS STATISTIQUES (REMPLACEMENT)
// ============================================================================

export async function getAgenticLoopStats(): Promise<{
  totalLoops: number;
  successfulLoops: number;
  failedLoops: number;
  successRate: number;
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  stepSuccessRate: number;
  avgLoopDuration: number;
  toolUsage: Record<string, number>;
  lastLoopTime: number | null;
  lastLoopDuration: number | null;
}> {
  // Récupérer les stats depuis SQLite
  const loopStats = await db.orchestration.stats.getByComponent('agentic_loop', 1000);
  const stepStats = await db.orchestration.stats.getByComponent('agentic_step', 1000);
  const toolUsageRaw = await db.orchestration.stats.getByComponent('tool_usage', 1000);
  
  // Calculer les totaux
  const totalLoops = loopStats.length;
  const successfulLoops = loopStats.filter(s => s.statValue.success === true).length;
  const loopSuccessRate = totalLoops > 0 ? successfulLoops / totalLoops : 0;
  
  const totalSteps = stepStats.length;
  const successfulSteps = stepStats.filter(s => s.statValue.success === true).length;
  const stepSuccessRate = totalSteps > 0 ? successfulSteps / totalSteps : 0;
  
  const avgLoopDuration = loopStats.reduce((sum, s) => sum + (s.statValue.duration || 0), 0) / (totalLoops || 1);
  
  // Calculer l'utilisation des outils
  const toolUsage: Record<string, number> = {};
  for (const stat of toolUsageRaw) {
    const toolName = stat.component;
    toolUsage[toolName] = (toolUsage[toolName] || 0) + 1;
  }
  
  const lastLoop = loopStats.sort((a, b) => b.timestamp - a.timestamp)[0];
  
  return {
    totalLoops,
    successfulLoops,
    failedLoops: totalLoops - successfulLoops,
    successRate: Math.round(loopSuccessRate * 100) / 100,
    totalSteps,
    successfulSteps,
    failedSteps: totalSteps - successfulSteps,
    stepSuccessRate: Math.round(stepSuccessRate * 100) / 100,
    avgLoopDuration: Math.round(avgLoopDuration),
    toolUsage,
    lastLoopTime: lastLoop?.timestamp || null,
    lastLoopDuration: lastLoop?.statValue.duration || null
  };
}

// ============================================================================
// CONFIGURATION DES LOGS
// ============================================================================

const LOG_PREFIX = '[AGENTIC-LOOP]';
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
// GESTIONNAIRE DE MODÈLES LOURDS (CHARGEMENT UNIQUE)
// ============================================================================

/**
 * Types de modèles lourds
 */
type HeavyModel = 'gemma' | 'qwen3-vl' | 'none';

/**
 * Gestionnaire garantissant qu'un seul modèle lourd est chargé à la fois
 */
class LoadedModelManager {
  private currentModel: HeavyModel = 'none';
  private modelLoadTime: number = 0;

  /**
   * Tente de charger un modèle lourd
   * @returns true si le chargement est autorisé, false si un autre modèle est déjà chargé
   */
  canLoadModel(model: HeavyModel): boolean {
    if (this.currentModel === 'none') {
      return true;
    }
    
    if (this.currentModel === model) {
      logInfo('MODEL_MGR', `✅ Modèle ${model} déjà chargé (depuis ${formatDuration(Date.now() - this.modelLoadTime)})`);
      return true;
    }
    
    logWarning('MODEL_MGR', `❌ Bloqué: ${model} ne peut pas être chargé car ${this.currentModel} est actif`);
    logWarning('MODEL_MGR', `   Solution: Décharger ${this.currentModel} d'abord avec unloadModel()`);
    return false;
  }

  /**
   * Charge un modèle (enregistre l'état)
   */
  loadModel(model: HeavyModel): void {
    if (this.currentModel !== 'none' && this.currentModel !== model) {
      logWarning('MODEL_MGR', `⚠️ Chargement forcé de ${model} alors que ${this.currentModel} était actif`);
      logWarning('MODEL_MGR', `   Ancien modèle sera déchargé automatiquement`);
    }
    
    this.currentModel = model;
    this.modelLoadTime = Date.now();
    logSuccess('MODEL_MGR', `🔒 Modèle chargé: ${model}`);
  }

  /**
   * Décharge le modèle actuel
   */
  unloadModel(): void {
    if (this.currentModel !== 'none') {
      const duration = Date.now() - this.modelLoadTime;
      logSuccess('MODEL_MGR', `🔓 Modèle déchargé: ${this.currentModel} (utilisé pendant ${formatDuration(duration)})`);
      this.currentModel = 'none';
      this.modelLoadTime = 0;
    }
  }

  /**
   * Retourne le modèle actuellement chargé
   */
  getCurrentModel(): HeavyModel {
    return this.currentModel;
  }

  /**
   * Vérifie si un modèle lourd est chargé
   */
  isHeavyModelLoaded(): boolean {
    return this.currentModel !== 'none';
  }

  /**
   * Force le déchargement avant de charger un nouveau modèle
   */
  switchTo(model: HeavyModel): boolean {
    if (this.currentModel === model) {
      return true;
    }
    
    // Décharger l'ancien
    this.unloadModel();
    
    // Charger le nouveau
    this.loadModel(model);
    return true;
  }
}

// Instance unique du gestionnaire
const modelManager = new LoadedModelManager();

// Export pour usage externe
export { modelManager };

// ============================================================================
// INTERFACES
// ============================================================================

export interface Step {
  id: string;
  tool: MCPTool;
  action: string;
  params: Record<string, any>;
  description?: string;
  timeout?: number;
  retryCount?: number;
}

export interface LoopContext {
  userId: string;
  request: string;
  [key: string]: any;
}

export interface StepResult {
  stepId: string;
  tool: MCPTool;
  action: string;
  success: boolean;
  result?: any;
  error?: string;
  timestamp: number;
  duration?: number;
  retryCount?: number;
}

export interface LoopResult {
  success: boolean;
  request: string;
  results: StepResult[];
  summary: string;
  error?: string;
  totalDuration?: number;
  stepsCount?: number;
  successfulSteps?: number;
  failedSteps?: number;
}

export interface StepExecutionOptions {
  timeout?: number;
  retry?: number;
  continueOnError?: boolean;
}

// ============================================================================
// DÉCOMPOSITION DE LA REQUÊTE
// ============================================================================

interface IntentPattern {
  keywords: string[];
  steps: Omit<Step, 'id'>[];
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    keywords: ['recherche', 'trouve', 'cherche', 'trouver', 'rechercher'],
    steps: [{
      tool: 'search',
      action: 'web',
      params: { query: '' },
      description: 'Recherche d\'information'
    }]
  },
  {
    keywords: ['email', 'envoie', 'mail', 'courriel', 'message'],
    steps: [{
      tool: 'email',
      action: 'draft',
      params: { content: '' },
      description: 'Préparation d\'email'
    }]
  },
  {
    keywords: ['document', 'fichier', 'doc', 'pdf', 'manuel'],
    steps: [{
      tool: 'documents',
      action: 'read',
      params: { query: '' },
      description: 'Consultation de document'
    }]
  },
  {
    keywords: ['calendrier', 'rendez-vous', 'agenda', 'meeting', 'réunion'],
    steps: [{
      tool: 'calendar',
      action: 'checkAvailability',
      params: { query: '' },
      description: 'Vérification calendrier'
    }]
  },
  {
    keywords: ['calcul', 'math', 'addition', 'soustraction', 'multiplie', 'divise'],
    steps: [{
      tool: 'calculator',
      action: 'calculate',
      params: { expression: '' },
      description: 'Calcul mathématique'
    }]
  },
  {
    keywords: ['profil', 'ahmed', 'abbes', 'compétence', 'expérience'],
    steps: [{
      tool: 'documents',
      action: 'search',
      params: { collection: 'centrale_gestion_equipes_humain', query: '' },
      description: 'Recherche de profil'
    }]
  },
  {
    keywords: ['procédure', 'démarrage', 'arrêt', 'urgence', 'maintenance'],
    steps: [{
      tool: 'documents',
      action: 'search',
      params: { collection: 'centrale_procedures', query: '' },
      description: 'Recherche de procédure'
    }]
  }
];

const DEFAULT_STEP: Omit<Step, 'id'> = {
  tool: 'search',
  action: 'web',
  params: { query: '' },
  description: 'Traitement général'
};

/**
 * Décompose une requête en étapes exécutables
 */
async function decomposeRequest(request: string): Promise<Step[]> {
  const startTime = Date.now();
  const lowerRequest = request.toLowerCase();
  const steps: Step[] = [];
  const usedPatterns = new Set<string>();
  
  logInfo('DECOMPOSE', `🔍 Décomposition de la requête: "${request.substring(0, 80)}${request.length > 80 ? '...' : ''}"`);
  
  for (const pattern of INTENT_PATTERNS) {
    const matched = pattern.keywords.some(keyword => lowerRequest.includes(keyword));
    if (matched && !usedPatterns.has(pattern.steps[0].tool)) {
      const stepId = `${pattern.steps[0].tool}_${Date.now()}_${steps.length}`;
      steps.push({
        id: stepId,
        ...pattern.steps[0],
        params: {
          ...pattern.steps[0].params,
          query: request,
          expression: request.replace(/calcul|math/g, '').trim()
        }
      });
      usedPatterns.add(pattern.steps[0].tool);
      logMetric('DECOMPOSE', `Étape ${steps.length}`, `${pattern.steps[0].tool} - ${pattern.steps[0].description}`);
    }
  }
  
  if (steps.length === 0) {
    steps.push({
      id: `default_${Date.now()}_0`,
      ...DEFAULT_STEP,
      params: { ...DEFAULT_STEP.params, query: request }
    });
    logInfo('DECOMPOSE', `Aucun pattern trouvé, étape par défaut ajoutée`);
  }
  
  const elapsedTime = Date.now() - startTime;
  logSuccess('DECOMPOSE', `${steps.length} étape(s) générée(s) en ${formatDuration(elapsedTime)}`);
  
  return steps;
}

// ============================================================================
// EXÉCUTION D'UNE ÉTAPE
// ============================================================================

/**
 * Exécute une étape avec gestion des retries et timeout
 */
async function executeStepInternal(
  step: Step,
  loopContext: LoopContext,
  options: StepExecutionOptions = {}
): Promise<StepResult> {
  const startTime = Date.now();
  const { timeout = 30000, retry = 1 } = options;
  let lastError: Error | null = null;
  let result: any = null;
  
  logInfo('EXECUTE', `⚙️ Exécution de l'étape: ${step.id} (${step.tool}:${step.action})`);
  logMetric('EXECUTE', 'Tool', step.tool);
  logMetric('EXECUTE', 'Action', step.action);
  
  for (let attempt = 0; attempt <= retry; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
      });
      
      const executionPromise = executeMCPTool({
        tool: step.tool,
        action: step.action,
        parameters: {
          ...step.params,
          context: loopContext
        },
        userId: loopContext.userId
      });
      
      result = await Promise.race([executionPromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      
      logSuccess('EXECUTE', `✅ Étape ${step.id} exécutée en ${formatDuration(duration)}`);
      
      return {
        stepId: step.id,
        tool: step.tool,
        action: step.action,
        success: true,
        result,
        timestamp: Date.now(),
        duration,
        retryCount: attempt
      };
      
    } catch (error: any) {
      lastError = error;
      const duration = Date.now() - startTime;
      logWarning('EXECUTE', `Tentative ${attempt + 1}/${retry + 1} échouée après ${formatDuration(duration)}: ${error.message}`);
      
      if (attempt < retry) {
        const waitTime = Math.pow(2, attempt) * 1000;
        logInfo('EXECUTE', `⏳ Nouvelle tentative dans ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  const duration = Date.now() - startTime;
  logError('EXECUTE', `❌ Étape ${step.id} échouée après ${formatDuration(duration)}`, lastError || undefined);
  
  return {
    stepId: step.id,
    tool: step.tool,
    action: step.action,
    success: false,
    error: lastError?.message || 'Unknown error',
    timestamp: Date.now(),
    duration,
    retryCount: retry
  };
}

// ============================================================================
// BOUCLE AGENTIQUE PRINCIPALE
// ============================================================================

export class AgenticLoop {
  
  /**
   * Exécute une étape individuelle
   */
  async executeStep(step: Step, context: LoopContext, options?: StepExecutionOptions): Promise<StepResult> {
    const startTime = Date.now();
    const result = await executeStepInternal(step, context, options);
    const duration = Date.now() - startTime;
    
    // RECORD: Stat de l'étape
    await recordStepStats(step.tool, step.action, result.success, duration);
    
    return result;
  }

  /**
   * Exécute la boucle agentique complète
   */
  async runAgenticLoop(request: string, userId: string, options?: StepExecutionOptions): Promise<LoopResult> {
    const loopStartTime = Date.now();
    
    console.log(`\n${LOG_SEPARATOR}`);
    logInfo('RUN', `🚀 DÉMARRAGE DE LA BOUCLE AGENTIQUE`);
    logMetric('RUN', 'Utilisateur', userId);
    logMetric('RUN', 'Requête', `"${request.substring(0, 100)}${request.length > 100 ? '...' : ''}"`);
    console.log(LOG_SUBSEPARATOR);
    
    // Afficher l'état des modèles chargés au début
    const currentModel = modelManager.getCurrentModel();
    if (currentModel !== 'none') {
      logInfo('RUN', `📌 Modèle lourd actuellement chargé: ${currentModel}`);
    } else {
      logInfo('RUN', `📌 Aucun modèle lourd chargé (état propre)`);
    }
    
    try {
      // 1. Décomposer la requête en étapes
      const steps = await decomposeRequest(request);
      logMetric('RUN', 'Étapes générées', steps.length);
      
      const results: StepResult[] = [];
      const loopContext: LoopContext = { userId, request };
      let successfulSteps = 0;
      let failedSteps = 0;
      
      // 2. Exécuter les étapes séquentiellement
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        logInfo('RUN', `📌 Étape ${i + 1}/${steps.length}: ${step.description || step.tool}`);
        
        const stepResult = await this.executeStep(step, loopContext, options);
        results.push(stepResult);
        
        if (stepResult.success) {
          successfulSteps++;
          if (stepResult.result) {
            loopContext[`step_${step.id}`] = stepResult.result;
            logMetric('RUN', `Résultat étape ${i + 1}`, 'Succès');
          }
        } else {
          failedSteps++;
          logWarning('RUN', `Étape ${i + 1} échouée: ${stepResult.error}`);
          
          // Si l'option continueOnError est false, on arrête l'exécution
          if (!options?.continueOnError) {
            logWarning('RUN', `Arrêt de l'exécution suite à l'échec de l'étape ${i + 1}`);
            break;
          }
        }
      }
      
      // 3. Générer le résumé
      const totalDuration = Date.now() - loopStartTime;
      const success = failedSteps === 0;
      
      let summary = '';
      if (success) {
        summary = `✅ Traitement terminé avec succès en ${formatDuration(totalDuration)} (${successfulSteps}/${steps.length} étapes réussies)`;
      } else {
        summary = `⚠️ Traitement partiel: ${successfulSteps}/${steps.length} étapes réussies en ${formatDuration(totalDuration)}`;
      }
      
      // Mise à jour des statistiques SQLite
      await recordLoopStats(success, totalDuration, steps.length, successfulSteps, failedSteps);
      
      console.log(LOG_SUBSEPARATOR);
      logSuccess('RUN', `🏁 BOUCLE AGENTIQUE TERMINÉE en ${formatDuration(totalDuration)}`);
      logMetric('RUN', 'Étapes réussies', `${successfulSteps}/${steps.length}`);
      logMetric('RUN', 'Statut', success ? 'SUCCÈS' : 'PARTIEL');
      
      if (results.length > 0) {
        const lastResult = results[results.length - 1];
        if (lastResult.success && lastResult.result) {
          logMetric('RUN', 'Dernier résultat', `${JSON.stringify(lastResult.result).substring(0, 100)}...`);
        }
      }
      console.log(LOG_SEPARATOR);
      
      return {
        success,
        request,
        results,
        summary,
        totalDuration,
        stepsCount: steps.length,
        successfulSteps,
        failedSteps
      };
      
    } catch (error: any) {
      const totalDuration = Date.now() - loopStartTime;
      
      // Enregistrer l'erreur dans les stats SQLite
      await recordLoopStats(false, totalDuration, 0, 0, 0);
      
      console.log(LOG_SUBSEPARATOR);
      logError('RUN', `❌ BOUCLE AGENTIQUE ÉCHOUÉE après ${formatDuration(totalDuration)}`, error);
      console.log(LOG_SEPARATOR);
      
      return {
        success: false,
        request,
        results: [],
        summary: "Erreur lors de l'exécution de la boucle agentique",
        error: error.message || String(error),
        totalDuration
      };
    }
  }

  /**
   * Version simplifiée de la décomposition (pour usage externe)
   */
  async decomposeRequest(request: string): Promise<Step[]> {
    return decomposeRequest(request);
  }

  /**
   * Décharge le modèle lourd actuel (pour libérer la RAM)
   */
  async unloadHeavyModel(): Promise<void> {
    const previousModel = modelManager.getCurrentModel();
    modelManager.unloadModel();
    await db.orchestration.stats.record('agentic_loop', 'model_unload', {
      model: previousModel,
      timestamp: Date.now()
    });
    logSuccess('RUN', 'Modèle lourd déchargé sur demande');
  }

  /**
   * Bascule vers un modèle spécifique (décharge l'ancien, charge le nouveau)
   */
  async switchToModel(model: 'gemma' | 'qwen3-vl' | 'none'): Promise<boolean> {
    const previousModel = modelManager.getCurrentModel();
    const result = modelManager.switchTo(model);
    await db.orchestration.stats.record('agentic_loop', 'model_switch', {
      from: previousModel,
      to: model,
      timestamp: Date.now()
    });
    return result;
  }

  /**
   * Récupère les statistiques de la boucle agentique (alias async)
   */
  async getStats(): Promise<ReturnType<typeof getAgenticLoopStats>> {
    return getAgenticLoopStats();
  }
}

// ============================================================================
// STATISTIQUES ET EXPORTS
// ============================================================================

/**
 * Réinitialise les statistiques
 */
export async function resetAgenticLoopStats(): Promise<void> {
  // Nettoyer les anciennes stats (plus de 1ms = tout)
  await db.orchestration.stats.cleanup(1);
  logSuccess('STATS', 'Statistiques de la boucle agentique réinitialisées');
}

// ============================================================================
// EXPORT DE L'INSTANCE PAR DÉFAUT
// ============================================================================

export const agenticLoop = new AgenticLoop();

export default {
  AgenticLoop,
  agenticLoop,
  getAgenticLoopStats,
  resetAgenticLoopStats,
  modelManager
};