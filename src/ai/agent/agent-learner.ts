/**
 * @fileOverview AgentLearner - Phase 4 de l'Architecture Agentic.
 * Version corrigée avec appels logger corrects (step + message).
 * 
 * @version 3.1.0
 * @lastUpdated 2026-04-01
 */

import { learnerLogger } from './utils/logger';
import { Intention, AgentContext } from './mcp';
import { TaskPlan } from './task-planner';
import { ExecutionResult } from './task-executor';
import { learnPattern } from '@/ai/actions/predictive-engine';

export interface AgentExperience {
  request: string;
  intention: Intention;
  plan: TaskPlan;
  result: ExecutionResult;
  userId: string;
  context: AgentContext;
}

export interface LearningResult {
  successRate: number;
  patternsLearned: number;
  embeddingsGenerated?: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

export async function learnFromExecution(exp: AgentExperience): Promise<LearningResult> {
  const startTime = Date.now();
  
  learnerLogger.info('ANALYSIS', `Analyse de la mission - User: ${exp.userId} - Type: ${exp.intention.type} - Steps: ${exp.plan.steps.length}`);
  
  const successRate = exp.result.steps.filter(s => s.success).length / (exp.result.steps.length || 1);
  let patternsLearned = 0;
  let embeddingsGenerated = 0;
  
  if (successRate > 0.8) {
    try {
      const tools = exp.plan.steps.map(s => s.tool).join('->');
      const patternDescription = `Succès pour l'intention '${exp.intention.type}' via la séquence d'outils : ${tools}`;
      
      // Persistance via le Predictive Engine (Innovation 24)
      await learnPattern(
        exp.request, // Le trigger est la requête utilisateur
        { type: exp.intention.type, tools: exp.plan.steps.map(s => s.tool) }, // L'action apprise
        patternDescription,
        successRate // La confiance est basée sur le taux de succès réel
      );
      
      patternsLearned++;
      
      learnerLogger.debug('PATTERN', `Pattern appris et persisté: ${patternDescription}`);
    } catch (error: any) {
      learnerLogger.warning('LEARNING_SAVE', `Échec de sauvegarde du pattern - Erreur: ${error.message}`);
    }
  }
  
  const duration = Date.now() - startTime;
  learnerLogger.success('RESULT', `Apprentissage consolidé - Taux: ${(successRate * 100).toFixed(0)}% - Patterns: ${patternsLearned} - Embeddings: ${embeddingsGenerated} - Durée: ${formatDuration(duration)}`);
  
  return { successRate, patternsLearned, embeddingsGenerated };
}

export default { learnFromExecution };