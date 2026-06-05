// src/lib/logger/ai-logger.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { getSessionId } from './request-context';
import { aiEventBus, ActionEvent, ActionStatus } from '../../ai/actions/event-bus';
import { v4 as uuidv4 } from 'uuid';

const BASE_LOG_DIR = path.join(process.cwd(), 'data', 'logs', 'ai');
const SESSION_DIR = path.join(BASE_LOG_DIR, 'sessions');
const PIPELINE_DIR = path.join(BASE_LOG_DIR, 'pipeline');
const ERROR_DIR = path.join(BASE_LOG_DIR, 'errors');

// Nomenclature distinctive par module
const MODULE_LABELS: Record<string, string> = {
  'INTENT': '🔍 [INTENT-ANALYZER]',
  'ROUTER': '🚦 [SMART-ROUTER]',
  'RAG':    '📚 [RAG-RETRIEVER]',
  'CONTEXT':'🧪 [CONTEXT-ASSEMBLER]',
  'LLM':    '🤖 [LLM-INFERENCE]',
  'FLOW':   '🌊 [CHART-FLOW-ORCH]',
  'VALID':  '✅ [VALIDATION-AI]',
  'CACHE':  '💾 [CACHE-ENGINE]'
};

// Couleurs ANSI pour console (si supporté)
const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  blue: "\x1b[34m"
};

class AiLogger {
  private initialized = false;

  private async ensureDirs() {
    if (this.initialized) return;
    try {
      await fs.mkdir(SESSION_DIR, { recursive: true });
      await fs.mkdir(PIPELINE_DIR, { recursive: true });
      await fs.mkdir(ERROR_DIR, { recursive: true });
      this.initialized = true;
    } catch (err) {
      console.error('Failed to initialize AI Logger directories', err);
    }
  }

  private getToday(): string {
    return new Date().toISOString().split('T')[0];
  }

  private async appendJsonl(filePath: string, data: any) {
    await this.ensureDirs();
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...data
    }) + '\n';
    try {
      await fs.appendFile(filePath, line, 'utf8');
    } catch (err) {
      console.error(`Failed to write log to ${filePath}`, err);
    }
  }

  /**
   * Log une étape du pipeline
   * @param section Numéro de section (1-8)
   * @param module Code du module (INTENT, RAG, etc.)
   * @param name Nom de l'étape
   * @param data Données associées
   */
  async logStep(section: number, module: string, name: string, data: any = {}) {
    const sessionId = getSessionId();
    const today = this.getToday();
    const timestamp = Date.now();
    
    const logEntry = {
      sessionId,
      section,
      module,
      name,
      data
    };

    // 1. Log Console (Distinctif)
    const label = MODULE_LABELS[module] || `[${module}]`;
    const color = this.getModuleColor(module);
    console.log(`${color}${label}${COLORS.reset} Section ${section} | ${COLORS.bright}${name}${COLORS.reset}`, data);

    // 2. Log Session
    const sessionPath = path.join(SESSION_DIR, `${sessionId}-${today}.jsonl`);
    await this.appendJsonl(sessionPath, logEntry);

    // 3. Log Pipeline Global
    const pipelinePath = path.join(PIPELINE_DIR, `${today}.jsonl`);
    await this.appendJsonl(pipelinePath, logEntry);

    // 4. 🔥 Diffusion vers l'Event Bus pour la Console d'Activité
    try {
      const event: ActionEvent = {
        id: uuidv4(),
        module: module.charAt(0).toUpperCase() + module.slice(1).toLowerCase(), // Normalisation pour l'UI
        type: name,
        status: this.mapModuleToStatus(module, name),
        message: `${name}: ${data.message || 'Exécution de l\'étape'}`,
        timestamp,
        data,
        duration: data.processingTime || data.duration || undefined
      };
      
      aiEventBus.emitAction(event);
    } catch (busError) {
      console.warn('[AI-LOGGER] Erreur lors de l\'émission vers l\'EventBus', busError);
    }
  }

  /**
   * Mappe un module et un nom d'étape vers un statut ActionEvent
   */
  private mapModuleToStatus(_module: string, name: string): ActionStatus {
    const n = name.toLowerCase();
    if (n.includes('error') || n.includes('fail')) return 'error';
    if (n.includes('block')) return 'blocked';
    if (n.includes('complete') || n.includes('finish') || n.includes('success')) return 'complete';
    if (n.includes('start') || n.includes('init')) return 'start';
    if (n.includes('predict')) return 'prediction';
    if (n.includes('snapshot')) return 'snapshot';
    return 'progress';
  }

  /**
   * Log une erreur dédiée
   */
  async logError(error: Error, context: any = {}) {
    const sessionId = getSessionId();
    const today = this.getToday();
    const timestamp = Date.now();
    
    const errorEntry = {
      sessionId,
      error: error.message,
      stack: error.stack,
      context
    };

    // console.log
    console.error(`${COLORS.red}${COLORS.bright}❌ [AI-ERROR]${COLORS.reset} Session: ${sessionId}`, {
      message: error.message,
      ...context
    });

    const errorPath = path.join(ERROR_DIR, `${today}.jsonl`);
    await this.appendJsonl(errorPath, errorEntry);

    // Diffusion de l'erreur vers la console
    aiEventBus.emitAction({
      id: uuidv4(),
      module: 'Global',
      type: 'ERROR',
      status: 'error',
      message: error.message,
      timestamp,
      data: context
    });
  }

  private getModuleColor(module: string): string {
    switch (module) {
      case 'INTENT': return COLORS.cyan;
      case 'ROUTER': return COLORS.magenta;
      case 'RAG':    return COLORS.blue;
      case 'CONTEXT':return COLORS.yellow;
      case 'LLM':    return COLORS.green;
      case 'FLOW':   return COLORS.bright;
      case 'VALID':  return COLORS.dim;
      case 'CACHE':  return COLORS.yellow;
      default: return COLORS.reset;
    }
  }
}

export const aiLogger = new AiLogger();

