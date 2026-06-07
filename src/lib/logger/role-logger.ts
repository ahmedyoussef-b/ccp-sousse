// src/lib/logger/role-logger.ts
// Logger spécialisé pour tracer les rôles distincts : APP, CHROMADB, OLLAMA

import * as fs from 'fs';
import * as path from 'path';
import { getLogBasePath } from '../config/env-mode';

// ============================================
// TYPES
// ============================================

export type RoleType = 'APP' | 'CHROMADB' | 'OLLAMA';

export interface RoleLogEntry {
  id: string;
  timestamp: string;
  role: RoleType;
  action: string;
  status: 'START' | 'IN_PROGRESS' | 'COMPLETED' | 'ERROR' | 'TIMEOUT';
  duration?: number;
  details: Record<string, any>;
  error?: string;
  traceId?: string;
}

export interface RolePerformance {
  role: RoleType;
  totalCalls: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  errorRate: number;
  lastCall: string | null;
}

// ============================================
// CLASSE PRINCIPALE
// ============================================

class RoleLogger {
  private static instance: RoleLogger;
  private logPath: string;
  private currentActionStart: number = 0;
  private sessionId: string;

  private constructor() {
    this.logPath = getLogBasePath('roles');
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.ensureDirectory();
    this.logSystemStart();
  }

  static getInstance(): RoleLogger {
    if (!RoleLogger.instance) {
      RoleLogger.instance = new RoleLogger();
    }
    return RoleLogger.instance;
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true });
    }
  }

  private getCurrentLogFile(): string {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logPath, `roles_${date}.jsonl`);
  }

  private writeLog(entry: RoleLogEntry): void {
    const logFile = this.getCurrentLogFile();
    try {
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    } catch (error) {
      console.error(`[ROLE-LOGGER] Erreur écriture:`, error);
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  private logSystemStart(): void {
    const entry: RoleLogEntry = {
      id: `role_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      role: 'APP',
      action: 'SYSTEM_START',
      status: 'COMPLETED',
      details: {
        sessionId: this.sessionId,
        version: '1.0.0'
      }
    };
    this.writeLog(entry);
    this.printColoredLog(entry);
  }

  private printColoredLog(entry: RoleLogEntry): void {
    const colors = {
      APP: '\x1b[36m',      // Cyan
      CHROMADB: '\x1b[35m', // Magenta
      OLLAMA: '\x1b[33m',   // Yellow
      reset: '\x1b[0m'
    };
    
    const statusColors = {
      START: '\x1b[90m',      // Gray
      IN_PROGRESS: '\x1b[94m', // Light Blue
      COMPLETED: '\x1b[92m',   // Green
      ERROR: '\x1b[91m',       // Red
      TIMEOUT: '\x1b[93m'      // Yellow
    };

    const color = colors[entry.role] || colors.APP;
    const statusColor = statusColors[entry.status] || statusColors.START;
    const durationStr = entry.duration ? ` (${this.formatDuration(entry.duration)})` : '';
    
    console.log(
      `${color}[${entry.role}]${statusColor} ${entry.action}${durationStr}${colors.reset}`
    );
    
    if (entry.status === 'ERROR' && entry.error) {
      console.log(`${colors.reset}  └─ ❌ ${entry.error}`);
    }
    
    if (Object.keys(entry.details).length > 0 && entry.status !== 'START') {
      const detailsStr = Object.entries(entry.details)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      if (detailsStr.length < 100) {
        console.log(`${colors.reset}  └─ 📊 ${detailsStr}`);
      }
    }
  }

  // ============================================
  // MÉTHODES PRINCIPALES
  // ============================================

  start(role: RoleType, action: string, traceId?: string, details?: Record<string, any>): string {
    const entryId = `role_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    
    const entry: RoleLogEntry = {
      id: entryId,
      timestamp: new Date().toISOString(),
      role,
      action,
      status: 'START',
      details: details || {},
      traceId
    };
    
    this.writeLog(entry);
    this.printColoredLog(entry);
    
    this.currentActionStart = Date.now();
    
    return entryId;
  }

  inProgress(role: RoleType, action: string, details?: Record<string, any>, traceId?: string): void {
    const entry: RoleLogEntry = {
      id: `role_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      role,
      action,
      status: 'IN_PROGRESS',
      details: details || {},
      traceId
    };
    
    this.writeLog(entry);
    this.printColoredLog(entry);
  }

  complete(role: RoleType, action: string, details?: Record<string, any>, traceId?: string): void {
    const duration = Date.now() - this.currentActionStart;
    
    const entry: RoleLogEntry = {
      id: `role_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      role,
      action,
      status: 'COMPLETED',
      duration,
      details: details || {},
      traceId
    };
    
    this.writeLog(entry);
    this.printColoredLog(entry);
    
    this.currentActionStart = 0;
  }

  error(role: RoleType, action: string, error: string, details?: Record<string, any>, traceId?: string): void {
    const duration = this.currentActionStart > 0 ? Date.now() - this.currentActionStart : undefined;
    
    const entry: RoleLogEntry = {
      id: `role_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      role,
      action,
      status: 'ERROR',
      duration,
      details: details || {},
      error,
      traceId
    };
    
    this.writeLog(entry);
    this.printColoredLog(entry);
    
    this.currentActionStart = 0;
  }

  timeout(role: RoleType, action: string, timeoutMs: number, details?: Record<string, any>, traceId?: string): void {
    const entry: RoleLogEntry = {
      id: `role_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      role,
      action,
      status: 'TIMEOUT',
      duration: timeoutMs,
      details: { ...details, timeoutMs },
      traceId
    };
    
    this.writeLog(entry);
    this.printColoredLog(entry);
    
    this.currentActionStart = 0;
  }

  // ============================================
  // MÉTHODES SPÉCIFIQUES PAR RÔLE
  // ============================================

  // APP
  appReceiveRequest(traceId: string, method: string, path: string, query?: string): void {
    this.start('APP', 'RECEIVE_REQUEST', traceId, { method, path, query: query?.substring(0, 100) });
  }

  appAnalyzeIntent(traceId: string, query: string, intent?: string): void {
    this.inProgress('APP', 'ANALYZE_INTENT', { query: query.substring(0, 100), intent }, traceId);
  }

  appBuildPrompt(traceId: string, contextLength: number, promptLength: number): void {
    this.inProgress('APP', 'BUILD_PROMPT', { contextLength, promptLength }, traceId);
  }

  appSendResponse(traceId: string, answerLength: number, totalDuration: number): void {
    this.complete('APP', 'SEND_RESPONSE', { answerLength, totalDuration }, traceId);
  }

  appError(traceId: string, error: string): void {
    this.error('APP', 'PROCESS_REQUEST', error, {}, traceId);
  }

  // CHROMADB
  chromadbSearch(traceId: string, collection: string, query: string, nResults: number): void {
    this.start('CHROMADB', 'SEARCH', traceId, { collection, query: query.substring(0, 100), nResults });
  }

  chromadbSearchComplete(traceId: string, resultsCount: number, duration: number): void {
    this.complete('CHROMADB', 'SEARCH', { resultsCount, duration }, traceId);
  }

  chromadbSearchError(traceId: string, error: string): void {
    this.error('CHROMADB', 'SEARCH', error, {}, traceId);
  }

  chromadbIndex(traceId: string, collection: string, documentCount: number): void {
    this.start('CHROMADB', 'INDEX', traceId, { collection, documentCount });
    this.complete('CHROMADB', 'INDEX', { collection, documentCount }, traceId);
  }

  chromadbCollection(traceId: string, action: 'CREATE' | 'GET' | 'DELETE', collection: string): void {
    this.start('CHROMADB', `COLLECTION_${action}`, traceId, { collection });
    this.complete('CHROMADB', `COLLECTION_${action}`, { collection }, traceId);
  }

  // OLLAMA
  ollamaCall(traceId: string, model: string, promptLength: number, temperature: number, maxTokens: number): void {
    this.start('OLLAMA', 'GENERATE', traceId, { model, promptLength, temperature, maxTokens });
  }

  ollamaCallInProgress(traceId: string, progress: number, tokensGenerated: number): void {
    this.inProgress('OLLAMA', 'GENERATE', { progress, tokensGenerated }, traceId);
  }

  ollamaCallComplete(traceId: string, responseLength: number, tokensPerSecond: number, duration: number): void {
    this.complete('OLLAMA', 'GENERATE', { responseLength, tokensPerSecond, duration }, traceId);
  }

  ollamaCallError(traceId: string, error: string): void {
    this.error('OLLAMA', 'GENERATE', error, {}, traceId);
  }

  ollamaCallTimeout(traceId: string, timeoutMs: number): void {
    this.timeout('OLLAMA', 'GENERATE', timeoutMs, {}, traceId);
  }

  ollamaEmbedding(traceId: string, textLength: number): void {
    this.start('OLLAMA', 'EMBEDDING', traceId, { textLength });
    this.complete('OLLAMA', 'EMBEDDING', { textLength }, traceId);
  }

  // ============================================
  // STATISTIQUES
  // ============================================

  getPerformanceStats(): RolePerformance[] {
    const stats: Map<string, RolePerformance> = new Map();
    
    try {
      const files = fs.readdirSync(this.logPath);
      for (const file of files) {
        const filePath = path.join(this.logPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        
        for (const line of lines) {
          const entry = JSON.parse(line) as RoleLogEntry;
          if (entry.status === 'COMPLETED' && entry.duration) {
            if (!stats.has(entry.role)) {
              stats.set(entry.role, {
                role: entry.role,
                totalCalls: 0,
                avgDuration: 0,
                minDuration: Infinity,
                maxDuration: 0,
                errorRate: 0,
                lastCall: null
              });
            }
            
            const stat = stats.get(entry.role)!;
            stat.totalCalls++;
            stat.avgDuration = (stat.avgDuration * (stat.totalCalls - 1) + entry.duration) / stat.totalCalls;
            stat.minDuration = Math.min(stat.minDuration, entry.duration);
            stat.maxDuration = Math.max(stat.maxDuration, entry.duration);
            stat.lastCall = entry.timestamp;
          }
          
          if (entry.status === 'ERROR') {
            const stat = stats.get(entry.role);
            if (stat) {
              const errors = stat.totalCalls > 0 ? stat.totalCalls * (stat.errorRate / 100) + 1 : 1;
              stat.errorRate = (errors / (stat.totalCalls + 1)) * 100;
            }
          }
        }
      }
    } catch (error) {
      console.error('[ROLE-LOGGER] Erreur stats:', error);
    }
    
    // Fixer les minDuration à 0 si Infinity
    const result = Array.from(stats.values());
    for (const r of result) {
      if (r.minDuration === Infinity) r.minDuration = 0;
      r.errorRate = Math.round(r.errorRate * 100) / 100;
      r.avgDuration = Math.round(r.avgDuration);
    }
    
    return result;
  }

  printSummary(): void {
    const stats = this.getPerformanceStats();
    
    console.log('\n' + '═'.repeat(60));
    console.log('\x1b[1m📊 RÉSUMÉ DES PERFORMANCES PAR RÔLE\x1b[0m');
    console.log('═'.repeat(60));
    
    for (const stat of stats) {
      const color = stat.role === 'APP' ? '\x1b[36m' : (stat.role === 'CHROMADB' ? '\x1b[35m' : '\x1b[33m');
      console.log(`\n${color}${stat.role}\x1b[0m`);
      console.log(`  ├─ Appels: ${stat.totalCalls}`);
      console.log(`  ├─ Durée moyenne: ${this.formatDuration(stat.avgDuration)}`);
      console.log(`  ├─ Min: ${this.formatDuration(stat.minDuration)} / Max: ${this.formatDuration(stat.maxDuration)}`);
      console.log(`  ├─ Taux d'erreur: ${stat.errorRate}%`);
      console.log(`  └─ Dernier appel: ${stat.lastCall ? new Date(stat.lastCall).toLocaleTimeString() : 'Jamais'}`);
    }
    
    console.log('\n' + '═'.repeat(60) + '\n');
  }

  // Nettoyage
  shutdown(): void {
    const entry: RoleLogEntry = {
      id: `role_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      role: 'APP',
      action: 'SYSTEM_STOP',
      status: 'COMPLETED',
      details: { sessionId: this.sessionId }
    };
    this.writeLog(entry);
    this.printColoredLog(entry);
  }
}

// Export de l'instance unique
export const roleLogger = RoleLogger.getInstance();

// Gestion de l'arrêt propre
process.on('beforeExit', () => {
  roleLogger.shutdown();
});

process.on('SIGINT', () => {
  roleLogger.shutdown();
  process.exit();
});