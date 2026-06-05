/**
 * @fileOverview IntelligentAgent Core - Orchestrateur central Elite 32.
 * Unifie les phases : Comprendre -> Raisonner -> Agir -> Apprendre.
 * Version corrigée avec appels logger corrects (step + message).
 * AJOUT: Monitor RAM + Fallback TinyLlama (Point 6)
 * 
 * @version 3.6.0
 * @lastUpdated 2026-04-07
 */

import { gatherContext, analyzeIntention } from './mcp';
import { decomposeIntention, createTaskPlan } from './task-planner';
import { executeTaskPlan } from './task-executor';
import { learnFromExecution } from './agent-learner';
import { getAgentConfig } from './config/agent.config';
import { agentLogger } from './utils/logger';
import { StatsManager } from '@/ai/rag/utils/stats-manager';
import ReversibleExecutor from '@/ai/actions/reversible-executor';

const reversibleExecutor = new ReversibleExecutor();

// ============================================================================
// MONITOR RAM (NOUVEAU)
// ============================================================================

/**
 * Seuil critique de RAM libre (2 Go)
 * En dessous de ce seuil, bascule automatique sur TinyLlama
 */
const RAM_CRITICAL_THRESHOLD_MB = 2048; // 2 Go

/**
 * Vérifie la RAM disponible et retourne true si critique
 * Sous Windows, utilise wmic ou Get-Counter
 */
async function isRAMCritical(): Promise<{ critical: boolean; freeMB: number; totalMB: number }> {
  try {
    let freeMB = 0;
    let totalMB = 0;
    
    // Détection de l'OS
    if (process.platform === 'win32') {
      // Windows: utiliser wmic
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Récupérer la mémoire libre
      const { stdout: freeStdout } = await execAsync('wmic OS get FreePhysicalMemory /value');
      const freeMatch = freeStdout.match(/FreePhysicalMemory=(\d+)/);
      if (freeMatch) {
        freeMB = Math.round(parseInt(freeMatch[1]) / 1024);
      }
      
      // Récupérer la mémoire totale
      const { stdout: totalStdout } = await execAsync('wmic ComputerSystem get TotalPhysicalMemory /value');
      const totalMatch = totalStdout.match(/TotalPhysicalMemory=(\d+)/);
      if (totalMatch) {
        totalMB = Math.round(parseInt(totalMatch[1]) / (1024 * 1024));
      }
    } else if (process.platform === 'linux') {
      // Linux: lire /proc/meminfo
      const { readFileSync } = await import('fs');
      const meminfo = readFileSync('/proc/meminfo', 'utf8');
      const freeMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
      const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
      if (freeMatch) freeMB = Math.round(parseInt(freeMatch[1]) / 1024);
      if (totalMatch) totalMB = Math.round(parseInt(totalMatch[1]) / 1024);
    } else if (process.platform === 'darwin') {
      // macOS: utiliser vm_stat
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      const { stdout } = await execAsync('vm_stat | grep "Pages free"');
      const match = stdout.match(/Pages free:\s+(\d+)/);
      if (match) {
        const pageSize = 4096;
        freeMB = Math.round((parseInt(match[1]) * pageSize) / (1024 * 1024));
      }
    }
    
    const critical = freeMB < RAM_CRITICAL_THRESHOLD_MB;
    
    if (critical) {
      agentLogger.warning('RAM_MONITOR', `⚠️ RAM CRITIQUE: ${freeMB} MB libre (seuil: ${RAM_CRITICAL_THRESHOLD_MB} MB) - Bascule TinyLlama`);
    } else {
      agentLogger.metric('RAM_MONITOR', 'RAM libre', `${freeMB} MB / ${totalMB} MB`);
    }
    
    return { critical, freeMB, totalMB };
    
  } catch (error: any) {
    agentLogger.warning('RAM_MONITOR', `Impossible de vérifier la RAM: ${error.message} - Mode sécurisé`);
    return { critical: false, freeMB: 9999, totalMB: 0 };
  }
}

// ============================================================================
// TYPES ET INTERFACES
// ============================================================================

export interface AgentStep {
  description: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: any;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface AgentResponse {
  summary: string;
  details: string;
  steps: AgentStep[];
  suggestions: string[];
  canUndo: boolean;
  patternsLearned: number;
  confidence: number;
  missionId?: string;
  executionTime?: number;
  phasesTiming?: {
    comprehend: number;
    reason: number;
    act: number;
    learn: number;
  };
  ramFallbackUsed?: boolean;  // Nouveau: indique si fallback TinyLlama a été utilisé
}

export interface MissionMetrics {
  totalMissions: number;
  successfulMissions: number;
  failedMissions: number;
  averageExecutionTime: number;
  averageConfidence: number;
  averagePatternsLearned: number;
  successRate: number;
  missionsByHour: Map<string, number>;
  ramFallbackCount: number;  // Nouveau: compteur de fallbacks
}

export interface AgentOptions {
  enableLearning?: boolean;
  enableUndo?: boolean;
  minConfidence?: number;
  timeout?: number;
  forceFallback?: boolean;  // Nouveau: forcer l'utilisation de TinyLlama
}

// ============================================================================
// STATISTIQUES
// ============================================================================

const config = getAgentConfig();
const DEFAULT_OPTIONS: AgentOptions = {
  enableLearning: true,
  enableUndo: true,
  minConfidence: 0.7,
  timeout: config.tools.timeout,
  forceFallback: false
};

const statsManager = new StatsManager<MissionMetrics>({
  initial: {
    totalMissions: 0,
    successfulMissions: 0,
    failedMissions: 0,
    averageExecutionTime: 0,
    averageConfidence: 0,
    averagePatternsLearned: 0,
    successRate: 100,
    missionsByHour: new Map(),
    ramFallbackCount: 0
  },
  persistIntervalMs: 60000,
  onPersist: async (stats, timestamp) => {
    agentLogger.structured('STATS_PERSIST', { 
      module: 'agent-core', 
      stats: {
        ...stats,
        missionsByHour: Object.fromEntries(stats.missionsByHour)
      },
      timestamp: timestamp.toISOString() 
    });
  }
});

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function generateMissionId(): string {
  return `mission_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function updateMetrics(
  success: boolean,
  executionTime: number,
  confidence: number,
  patternsLearned: number,
  ramFallbackUsed: boolean = false
): void {
  statsManager.increment('totalMissions');
  
  if (success) {
    statsManager.increment('successfulMissions');
  } else {
    statsManager.increment('failedMissions');
  }
  
  if (ramFallbackUsed) {
    statsManager.increment('ramFallbackCount');
  }
  
  const total = statsManager.get().totalMissions;
  const successRate = (statsManager.get().successfulMissions / total) * 100;
  statsManager.update({ successRate });
  
  statsManager.average('averageExecutionTime', executionTime);
  statsManager.average('averageConfidence', confidence);
  statsManager.average('averagePatternsLearned', patternsLearned);
  
  const hour = new Date().toISOString().slice(0, 13);
  const missionsByHour = statsManager.get().missionsByHour;
  missionsByHour.set(hour, (missionsByHour.get(hour) || 0) + 1);
  statsManager.update({ missionsByHour });
}

function generateSuggestions(executionResult: any, plan: any, patternsLearned: number, ramFallbackUsed: boolean): string[] {
  const suggestions: string[] = [];
  
  if (ramFallbackUsed) {
    suggestions.push("⚠️ Mode économie d'énergie activé (RAM faible). Les performances sont réduites.");
  }
  
  if (executionResult.success) {
    suggestions.push("Souhaitez-vous archiver le rapport d'exécution ?");
    if (patternsLearned > 0) {
      suggestions.push(`${patternsLearned} nouveau(x) pattern(s) appris. Voulez-vous les consulter ?`);
    }
    if (executionResult.reversible) {
      suggestions.push("Cette opération peut être annulée si nécessaire.");
    }
  } else if (executionResult.failedSteps > 0) {
    suggestions.push("Voulez-vous voir les détails des étapes ayant échoué ?");
  }
  
  const completedSteps = plan.steps?.filter((s: any) => s.status === 'completed').length || 0;
  if (completedSteps > 3) {
    suggestions.push("Créer une macro pour automatiser cette séquence d'actions ?");
  }
  
  suggestions.push("Vérifier les contraintes de sécurité associées ?");
  return suggestions.slice(0, 4);
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

export async function processAgentMission(
  request: string, 
  userId: string,
  options?: AgentOptions
): Promise<AgentResponse> {
  const startTime = Date.now();
  const missionId = generateMissionId();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  agentLogger.info('START', `🚀 DÉBUT MISSION - ID: ${missionId} - User: ${userId}`);
  
  // Vérification RAM avant tout traitement
  const ramStatus = await isRAMCritical();
  const useFallback = opts.forceFallback || ramStatus.critical;
  
  if (useFallback) {
    agentLogger.warning('FALLBACK', `🔄 Bascule sur TinyLlama (mode survie) - RAM: ${ramStatus.freeMB} MB libre`);
  } else {
    agentLogger.info('RAM', `✅ RAM suffisante: ${ramStatus.freeMB} MB libre`);
  }
  
  const phasesTiming = { comprehend: 0, reason: 0, act: 0, learn: 0 };
  
  try {
    // PHASE 1: COMPRENDRE
    const phase1Start = Date.now();
    agentLogger.info('PHASE-1', `Compréhension - Mission ${missionId}`);
    
    const context = await gatherContext(request, userId);
    const intention = await analyzeIntention(request, context);
    phasesTiming.comprehend = Date.now() - phase1Start;
    
    // Si fallback actif, forcer le mode simple
    if (useFallback) {
      intention.complexity = 0.3;
      intention.confidence = Math.min(intention.confidence, 0.7);
      agentLogger.info('FALLBACK', `Complexité forcée à 'simple' pour économie RAM`);
    }
    
    agentLogger.info('INTENTION', `Type: ${intention.type}, Complexité: ${intention.complexity}, Confiance: ${intention.confidence} - Durée: ${formatDuration(phasesTiming.comprehend)}`);
    
    // PHASE 2: RAISONNER
    const phase2Start = Date.now();
    agentLogger.info('PHASE-2', `Planification - Mission ${missionId}`);
    
    const steps = await decomposeIntention(intention, context);
    const plan = await createTaskPlan(steps, context);
    phasesTiming.reason = Date.now() - phase2Start;
    
    agentLogger.info('PLAN', `${plan.steps.length} étapes, Durée estimée: ${plan.totalEstimatedTime}s - Durée: ${formatDuration(phasesTiming.reason)}`);
    
    // PHASE 3: AGIR
    const phase3Start = Date.now();
    agentLogger.info('PHASE-3', `Exécution - Mission ${missionId}`);
    
    // Utilisation du ReversibleExecutor (Innovation 25) pour sécuriser l'exécution
    // et permettre l'annulation (undo) si nécessaire.
    const missionExecution = await reversibleExecutor.execute(
      async (p: any) => {
        return await executeTaskPlan(p.plan, p.context, { useFallback: p.useFallback });
      },
      { plan, context, useFallback },
      { 
        userId,
        reversible: true,
        snapshot: true
      }
    );

    const executionResult = missionExecution.result;
    phasesTiming.act = missionExecution.executionTime || (Date.now() - phase3Start);
    
    agentLogger.info('EXECUTION', `Succès: ${executionResult.success}, Étapes exécutées: ${executionResult.stepsExecuted} - Durée: ${formatDuration(phasesTiming.act)}`);
    
    // PHASE 4: APPRENDRE (désactivé en mode fallback pour économiser RAM)
    let patternsLearned = 0;
    if (opts.enableLearning && !useFallback) {
      const phase4Start = Date.now();
      agentLogger.info('PHASE-4', `Apprentissage - Mission ${missionId}`);
      
      const learningResults = await learnFromExecution({
        request,
        intention,
        plan,
        result: executionResult,
        userId,
        context
      });
      patternsLearned = learningResults.patternsLearned;
      phasesTiming.learn = Date.now() - phase4Start;
      
      agentLogger.info('LEARNING', `Patterns appris: ${patternsLearned} - Durée: ${formatDuration(phasesTiming.learn)}`);
    } else if (useFallback) {
      agentLogger.info('PHASE-4', `Apprentissage désactivé (mode fallback - économie RAM)`);
    }
    
    // SYNTHÈSE
    const totalExecutionTime = Date.now() - startTime;
    updateMetrics(executionResult.success, totalExecutionTime, intention.confidence, patternsLearned, useFallback);
    
    const suggestions = generateSuggestions(executionResult, plan, patternsLearned, useFallback);
    const canUndo = opts.enableUndo === true && (executionResult.reversible === true);
    
    const response: AgentResponse = {
      summary: useFallback 
        ? `⚠️ Mode survie (RAM faible) - ${executionResult.summary || "Mission accomplie avec succès."}`
        : executionResult.summary || "Mission accomplie avec succès.",
      details: executionResult.details || "Toutes les étapes ont été validées.",
      steps: plan.steps.map((s: any) => ({
        description: s.description,
        status: s.status || 'pending',
        result: s.result,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        error: s.error
      })),
      suggestions,
      canUndo,
      patternsLearned,
      confidence: intention.confidence,
      missionId,
      executionTime: totalExecutionTime,
      phasesTiming,
      ramFallbackUsed: useFallback
    };
    
    if (useFallback) {
      agentLogger.warning('MISSION', `⚠️ MISSION AVEC FALLBACK - ID: ${missionId} - ${plan.steps.length} étapes - RAM: ${ramStatus.freeMB} MB - Durée: ${formatDuration(totalExecutionTime)}`);
    } else {
      agentLogger.success('MISSION', `ACCOMPLIE - ID: ${missionId} - ${plan.steps.length} étapes - ${patternsLearned} patterns appris - Durée: ${formatDuration(totalExecutionTime)}`);
    }
    
    return response;
    
  } catch (error: any) {
    const totalExecutionTime = Date.now() - startTime;
    agentLogger.error('MISSION', `ÉCHEC - ID: ${missionId} - Erreur: ${error.message} - Durée: ${formatDuration(totalExecutionTime)}`);
    
    updateMetrics(false, totalExecutionTime, 0, 0, useFallback);
    throw new Error(`Échec de l'agent: ${error.message}`);
  }
}

export function getAgentMetrics(): MissionMetrics {
  return statsManager.get();
}

export function resetAgentMetrics(): void {
  statsManager.reset();
  agentLogger.success('STATS', 'Statistiques de l\'agent réinitialisées');
}

export async function undoLastMission(missionId: string): Promise<boolean> {
  agentLogger.info('UNDO', `Annulation de mission - ID: ${missionId}`);
  try {
    // Utilisation du ReversibleExecutor pour annuler la dernière action enregistrée
    const success = await reversibleExecutor.undo(1);
    if (success) {
      agentLogger.success('UNDO', `Mission ${missionId} annulée avec succès via ReversibleExecutor`);
    } else {
      agentLogger.warning('UNDO', `Impossible d'annuler la mission ${missionId} : aucune action réversible trouvée`);
    }
    return success;
  } catch (error: any) {
    agentLogger.error('UNDO', `Erreur lors de l'annulation de la mission ${missionId}: ${error.message}`);
    return false;
  }
}

export function getRAMFallbackCount(): number {
  return statsManager.get().ramFallbackCount;
}

export default {
  processAgentMission,
  getAgentMetrics,
  resetAgentMetrics,
  undoLastMission,
  getRAMFallbackCount
};