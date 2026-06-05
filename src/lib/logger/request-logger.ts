// src/lib/logger/request-logger.ts
// Trace pas à pas chaque étape du traitement d'une question

export interface RequestTrace {
  id: string;
  timestamp: string;
  question: string;
  steps: StepTrace[];
  totalDuration: number;
  success: boolean;
  answer?: string;
  error?: string;
}

interface StepTrace {
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  details?: any;
  error?: string;
}

class RequestLogger {
  private static instance: RequestLogger;
  private currentTrace: RequestTrace | null = null;
  private traces: RequestTrace[] = [];
  private maxTraces = 1000;

  static getInstance(): RequestLogger {
    if (!RequestLogger.instance) {
      RequestLogger.instance = new RequestLogger();
    }
    return RequestLogger.instance;
  }

  startTrace(question: string): string {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    this.currentTrace = {
      id: traceId,
      timestamp: new Date().toISOString(),
      question: question.substring(0, 200),
      steps: [],
      totalDuration: 0,
      success: true
    };
    
    console.log(`[TRACE:${traceId}] 🔍 DÉBUT - Question: "${question.substring(0, 50)}..."`);
    
    return traceId;
  }

  startStep(stepName: string, details?: any): void {
    if (!this.currentTrace) return;
    
    this.currentTrace.steps.push({
      name: stepName,
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      status: 'running',
      details
    });
    
    console.log(`[TRACE:${this.currentTrace.id}] 📍 ÉTAPE: ${stepName} - DÉBUT`);
  }

  endStep(stepName: string, details?: any, error?: string): void {
    if (!this.currentTrace) return;
    
    const step = this.currentTrace.steps.find(s => s.name === stepName && s.status === 'running');
    if (step) {
      step.endTime = Date.now();
      step.duration = step.endTime - step.startTime;
      step.status = error ? 'failed' : 'completed';
      if (details) step.details = { ...step.details, ...details };
      if (error) step.error = error;
      
      const statusIcon = error ? '❌' : '✅';
      console.log(`[TRACE:${this.currentTrace.id}] ${statusIcon} ÉTAPE: ${stepName} - FIN (${step.duration}ms)`);
    }
  }

  endTrace(answer?: string, error?: string): RequestTrace | null {
    if (!this.currentTrace) return null;
    
    this.currentTrace.totalDuration = Date.now() - new Date(this.currentTrace.timestamp).getTime();
    this.currentTrace.success = !error;
    if (answer) this.currentTrace.answer = answer.substring(0, 500);
    if (error) this.currentTrace.error = error;
    
    // Garder seulement les 1000 dernières traces
    this.traces.unshift(this.currentTrace);
    if (this.traces.length > this.maxTraces) {
      this.traces.pop();
    }
    
    const statusIcon = error ? '❌' : '✅';
    console.log(`[TRACE:${this.currentTrace.id}] ${statusIcon} FIN - Durée totale: ${this.currentTrace.totalDuration}ms`);
    
    // Sauvegarder dans un fichier
    this.saveToFile(this.currentTrace);
    
    const trace = this.currentTrace;
    this.currentTrace = null;
    
    return trace;
  }

  private saveToFile(trace: RequestTrace): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const logDir = path.join(process.cwd(), 'data', 'logs', 'traces');
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const date = new Date().toISOString().split('T')[0];
      const logFile = path.join(logDir, `traces_${date}.jsonl`);
      
      fs.appendFileSync(logFile, JSON.stringify(trace) + '\n');
    } catch (error) {
      console.error('[LOGGER] Erreur sauvegarde:', error);
    }
  }

  getTraces(limit: number = 100, filter?: { minDuration?: number; successOnly?: boolean }): RequestTrace[] {
    let traces = [...this.traces];
    
    if (filter?.minDuration) {
      traces = traces.filter(t => t.totalDuration >= filter.minDuration!);
    }
    if (filter?.successOnly) {
      traces = traces.filter(t => t.success);
    }
    
    return traces.slice(0, limit);
  }

  getStatistics(): TraceStatistics {
    const completed = this.traces.filter(t => t.success);
    const failed = this.traces.filter(t => !t.success);
    
    const durations = this.traces.map(t => t.totalDuration);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    
    // Analyse par étape
    const stepStats: Record<string, { count: number; avgDuration: number; totalDuration: number }> = {};
    
    for (const trace of this.traces) {
      for (const step of trace.steps) {
        if (!stepStats[step.name]) {
          stepStats[step.name] = { count: 0, avgDuration: 0, totalDuration: 0 };
        }
        stepStats[step.name].count++;
        stepStats[step.name].totalDuration += step.duration;
        stepStats[step.name].avgDuration = stepStats[step.name].totalDuration / stepStats[step.name].count;
      }
    }
    
    return {
      total: this.traces.length,
      success: completed.length,
      failed: failed.length,
      successRate: this.traces.length > 0 ? (completed.length / this.traces.length) * 100 : 0,
      avgTotalDuration: avgDuration,
      minDuration: Math.min(...durations, 0),
      maxDuration: Math.max(...durations, 0),
      stepStatistics: stepStats,
      lastHour: this.traces.filter(t => Date.now() - new Date(t.timestamp).getTime() < 3600000).length
    };
  }
}

interface TraceStatistics {
  total: number;
  success: number;
  failed: number;
  successRate: number;
  avgTotalDuration: number;
  minDuration: number;
  maxDuration: number;
  stepStatistics: Record<string, { count: number; avgDuration: number; totalDuration: number }>;
  lastHour: number;
}

export const requestLogger = RequestLogger.getInstance();