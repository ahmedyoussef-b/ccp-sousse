// src/ai/flows/agent-flow.ts
/**
 * @fileOverview Agent Flow - Orchestration des missions agentiques
 * @version 3.0.0
 */

import { processAgentMission } from '../agent/agent-core';
import { callOllama } from '@/ai/providers/ollama-client';
import { selectModel } from '@/ai/config/models.config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class SimpleLogger {
  private level: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  private logToConsole = true;
  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.level];
  }
  private format(level: LogLevel, module: string, message: string, meta?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()} [${module}] ${message}${metaStr}`;
  }
  debug(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('debug') && this.logToConsole) console.log(`\x1b[36m${this.format('debug', 'AgentFlow', message, meta)}\x1b[0m`);
  }
  info(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('info') && this.logToConsole) console.log(`\x1b[32m${this.format('info', 'AgentFlow', message, meta)}\x1b[0m`);
  }
  warn(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('warn') && this.logToConsole) console.log(`\x1b[33m${this.format('warn', 'AgentFlow', message, meta)}\x1b[0m`);
  }
  error(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('error') && this.logToConsole) console.log(`\x1b[31m${this.format('error', 'AgentFlow', message, meta)}\x1b[0m`);
  }
}
const logger = new SimpleLogger();

export interface AgentInput {
  text: string;
  context?: string;
  userId?: string;
  options?: { enableLearning?: boolean; enableUndo?: boolean; minConfidence?: number; timeout?: number };
}

export interface AgentOutput {
  answer: string;
  missionStatus: 'COMPLETED' | 'FAILED' | 'REJECTED';
  steps: Array<{ description: string; status: string; result?: any; duration?: number }>;
  patternsLearned: number;
  confidence: number;
  executionTime?: number;
  missionId?: string;
}

export async function runAgentMission(input: AgentInput): Promise<AgentOutput> {
  const startTime = Date.now();
  logger.info('🎯 Mission reçue', { textLength: input.text.length, textPreview: input.text.substring(0, 100), hasContext: !!input.context, userId: input.userId, options: input.options });
  
  try {
    if (!input.text || input.text.trim().length === 0) {
      logger.warn('Mission rejetée: texte vide');
      return { answer: "Veuillez fournir une demande valide pour que l'agent puisse vous assister.", missionStatus: 'REJECTED', steps: [], patternsLearned: 0, confidence: 0, executionTime: Date.now() - startTime };
    }
    
    logger.debug('Appel de l\'agent core', { userId: input.userId });
    const result = await processAgentMission(input.text, input.userId || 'anonymous', {
      enableLearning: input.options?.enableLearning !== false,
      enableUndo: input.options?.enableUndo !== false,
      minConfidence: input.options?.minConfidence || 0.7,
      timeout: input.options?.timeout || 30000
    });
    
    const executionTime = Date.now() - startTime;
    logger.info('Mission terminée avec succès', { missionId: result.missionId, status: 'COMPLETED', stepsCount: result.steps.length, patternsLearned: result.patternsLearned, confidence: result.confidence, canUndo: result.canUndo, executionTime: `${executionTime}ms` });
    
    return {
      answer: formatAnswer(result),
      missionStatus: 'COMPLETED',
      steps: result.steps.map((step: any) => ({ description: step.description, status: step.status, result: step.result, duration: step.completedAt && step.startedAt ? step.completedAt - step.startedAt : undefined })),
      patternsLearned: result.patternsLearned,
      confidence: result.confidence,
      executionTime,
      missionId: result.missionId
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    const executionTime = Date.now() - startTime;
    logger.error('Échec de la mission', { error: errorMessage, stack: error instanceof Error ? error.stack : undefined, executionTime: `${executionTime}ms`, userId: input.userId });
    return { answer: `Désolé, je n'ai pas pu traiter votre demande. Erreur: ${errorMessage.substring(0, 200)}`, missionStatus: 'FAILED', steps: [], patternsLearned: 0, confidence: 0, executionTime, missionId: `error_${Date.now()}` };
  }
}

function formatAnswer(agentResult: any): string {
  const parts: string[] = [];
  parts.push(agentResult.summary || 'Mission exécutée avec succès.');
  if (agentResult.steps && agentResult.steps.length > 0) {
    const successfulSteps = agentResult.steps.filter((s: any) => s.status === 'completed').length;
    const failedSteps = agentResult.steps.filter((s: any) => s.status === 'failed').length;
    if (failedSteps > 0) parts.push(`\n📋 Exécution: ${successfulSteps} étapes réussies, ${failedSteps} étapes en échec.`);
    if (process.env.LOG_LEVEL === 'debug') {
      parts.push('\n🔧 Détails des étapes:');
      agentResult.steps.forEach((step: any, index: number) => {
        const statusIcon = step.status === 'completed' ? '✅' : step.status === 'failed' ? '❌' : '⏳';
        parts.push(`  ${statusIcon} ${index + 1}. ${step.description}`);
      });
    }
  }
  if (agentResult.suggestions && agentResult.suggestions.length > 0) {
    parts.push('\n💡 Suggestions:');
    agentResult.suggestions.forEach((suggestion: string) => parts.push(`  • ${suggestion}`));
  }
  if (agentResult.patternsLearned > 0) parts.push(`\n📚 ${agentResult.patternsLearned} nouveau(x) pattern(s) d'apprentissage identifié(s).`);
  if (agentResult.canUndo) parts.push(`\n🔄 Cette opération peut être annulée si nécessaire.`);
  if (agentResult.confidence) parts.push(`\n🎯 Niveau de confiance: ${(agentResult.confidence * 100).toFixed(0)}%`);
  return parts.join('\n');
}

export async function runAgentMissionSimple(input: AgentInput): Promise<AgentOutput> {
  const startTime = Date.now();
  logger.info('🎯 Mission simple (fallback)', { textLength: input.text.length, textPreview: input.text.substring(0, 100) });
  try {
    const systemPrompt = "Tu es un assistant technique expert. Réponds de manière concise et précise.";
    const fullPrompt = `${systemPrompt}\n\n${input.text}`;
    
    const chatModel = selectModel('text').name;
    const response = await callOllama(fullPrompt, { 
      model: chatModel, 
      temperature: 0.3, 
      maxTokens: 500 
    });
    const executionTime = Date.now() - startTime;
    logger.info('Mission simple terminée', { executionTime: `${executionTime}ms`, responseLength: response.length });
    return { answer: response, missionStatus: 'COMPLETED', steps: [{ description: 'Analyse de la demande', status: 'completed', duration: 0 }, { description: 'Génération de la réponse', status: 'completed', duration: 0 }], patternsLearned: 0, confidence: 0.85, executionTime };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    logger.error('Échec mission simple', { error: errorMessage, executionTime: Date.now() - startTime });
    return { answer: `Désolé, une erreur est survenue: ${errorMessage}`, missionStatus: 'FAILED', steps: [], patternsLearned: 0, confidence: 0, executionTime: Date.now() - startTime };
  }
}

export const __testables__ = { formatAnswer };