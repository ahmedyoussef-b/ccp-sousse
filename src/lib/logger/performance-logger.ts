// src/lib/logger/performance-logger.ts
// Logger spécialisé pour les métriques de performance et l'optimisation

import * as fs from 'fs';
import * as path from 'path';
import { getLogBasePath, isCloudMode } from '../config/env-mode';

// ============================================
// TYPES
// ============================================

export interface PerformanceMetric {
  id: string;
  timestamp: string;
  type: MetricType;
  duration: number;
  success: boolean;
  details: Record<string, any>;
  traceId?: string;
  threshold?: number;
  exceeded?: boolean;
}

export type MetricType = 
  | 'CHAT_TOTAL'
  | 'INTENT_ANALYSIS'
  | 'CHROMADB_SEARCH'
  | 'CONTEXT_BUILDING'
  | 'PROMPT_GENERATION'
  | 'OLLAMA_CALL'
  | 'RESPONSE_PROCESSING'
  | 'FEEDBACK_SAVE'
  | 'DOCUMENT_INGESTION'
  | 'TRAINING_PREPARE'
  | 'MODEL_IMPORT';

export interface PerformanceStats {
  metricType: MetricType;
  count: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  successRate: number;
  thresholdExceededCount: number;
}

export interface PerformanceAlert {
  id: string;
  timestamp: string;
  metricType: MetricType;
  duration: number;
  threshold: number;
  traceId?: string;
  details: Record<string, any>;
}

// ============================================
// CONFIGURATION DES SEUILS (ms)
// ============================================

const THRESHOLDS: Record<MetricType, { warning: number; critical: number }> = {
  CHAT_TOTAL: { warning: 30000, critical: 60000 },      // 30s / 60s
  INTENT_ANALYSIS: { warning: 1000, critical: 3000 },    // 1s / 3s
  CHROMADB_SEARCH: { warning: 500, critical: 2000 },     // 0.5s / 2s
  CONTEXT_BUILDING: { warning: 500, critical: 1500 },    // 0.5s / 1.5s
  PROMPT_GENERATION: { warning: 500, critical: 1500 },   // 0.5s / 1.5s
  OLLAMA_CALL: { warning: 30000, critical: 60000 },      // 30s / 60s
  RESPONSE_PROCESSING: { warning: 500, critical: 1500 }, // 0.5s / 1.5s
  FEEDBACK_SAVE: { warning: 200, critical: 500 },        // 0.2s / 0.5s
  DOCUMENT_INGESTION: { warning: 5000, critical: 15000 }, // 5s / 15s
  TRAINING_PREPARE: { warning: 10000, critical: 30000 },  // 10s / 30s
  MODEL_IMPORT: { warning: 60000, critical: 180000 }      // 60s / 180s
};

// ============================================
// CLASSE PRINCIPALE
// ============================================

class PerformanceLogger {
  private static instance: PerformanceLogger;
  private metricsPath: string;
  private alertsPath: string;
  private metrics: PerformanceMetric[] = [];
  private alerts: PerformanceAlert[] = [];
  private maxMetrics: number = 10000;
  private alertCallbacks: ((alert: PerformanceAlert) => void)[] = [];
  private enabled: boolean = true;

  private constructor() {
    // Désactiver sur Vercel
    if (isCloudMode() || process.env.VERCEL === '1') {
      console.log('[PerformanceLogger] Désactivé sur Vercel (mode read-only)');
      this.enabled = false;
      this.metricsPath = '';
      this.alertsPath = '';
      return;
    }
    
    this.metricsPath = path.join(getLogBasePath('performance'), 'metrics.jsonl');
    this.alertsPath = path.join(getLogBasePath('performance'), 'alerts.jsonl');
    this.ensureDirectory();
    this.loadExistingMetrics();
  }

  static getInstance(): PerformanceLogger {
    if (!PerformanceLogger.instance) {
      PerformanceLogger.instance = new PerformanceLogger();
    }
    return PerformanceLogger.instance;
  }

  private ensureDirectory(): void {
    if (!this.enabled) return;
    const dir = path.dirname(this.metricsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadExistingMetrics(): void {
    if (!this.enabled) return;
    try {
      if (fs.existsSync(this.metricsPath)) {
        const content = fs.readFileSync(this.metricsPath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        for (const line of lines.slice(-this.maxMetrics)) {
          this.metrics.push(JSON.parse(line));
        }
      }
      if (fs.existsSync(this.alertsPath)) {
        const content = fs.readFileSync(this.alertsPath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        for (const line of lines) {
          this.alerts.push(JSON.parse(line));
        }
      }
    } catch (error) {
      console.error('[PERF] Erreur chargement:', error);
    }
  }

  private saveMetric(metric: PerformanceMetric): void {
    if (!this.enabled) return;
    try {
      fs.appendFileSync(this.metricsPath, JSON.stringify(metric) + '\n');
    } catch (error) {
      console.error('[PERF] Erreur sauvegarde:', error);
    }
  }

  private saveAlert(alert: PerformanceAlert): void {
    if (!this.enabled) return;
    try {
      fs.appendFileSync(this.alertsPath, JSON.stringify(alert) + '\n');
    } catch (error) {
      console.error('[PERF] Erreur sauvegarde alerte:', error);
    }
  }

  private checkThreshold(metric: PerformanceMetric): PerformanceAlert | null {
    if (!this.enabled) return null;
    
    const threshold = THRESHOLDS[metric.type];
    if (!threshold) return null;
    
    let level: 'warning' | 'critical' | null = null;
    if (metric.duration >= threshold.critical) {
      level = 'critical';
    } else if (metric.duration >= threshold.warning) {
      level = 'warning';
    }
    
    if (level) {
      const alert: PerformanceAlert = {
        id: `perf_alert_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        metricType: metric.type,
        duration: metric.duration,
        threshold: threshold[level],
        traceId: metric.traceId,
        details: metric.details
      };
      
      this.alerts.unshift(alert);
      if (this.alerts.length > 1000) this.alerts.pop();
      this.saveAlert(alert);
      
      // Notification console
      const icon = level === 'critical' ? '🔴' : '🟡';
      console.log(`[PERF] ${icon} ALERTE: ${metric.type} - ${metric.duration}ms (seuil: ${threshold[level]}ms)`);
      
      // Appeler les callbacks
      this.alertCallbacks.forEach(cb => cb(alert));
      
      return alert;
    }
    
    return null;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // ============================================
  // MÉTHODES PUBLIQUES
  // ============================================

  record(metric: Omit<PerformanceMetric, 'id' | 'timestamp'>): PerformanceAlert | null {
    if (!this.enabled) return null;
    
    const id = `perf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const metricWithId: PerformanceMetric = {
      ...metric,
      id,
      timestamp: new Date().toISOString()
    };
    
    this.metrics.unshift(metricWithId);
    if (this.metrics.length > this.maxMetrics) this.metrics.pop();
    
    this.saveMetric(metricWithId);
    
    // Log console
    const statusIcon = metric.success ? '✅' : '❌';
    const thresholdIcon = this.checkThreshold(metricWithId) ? '⚠️' : '';
    console.log(`[PERF] ${statusIcon} ${thresholdIcon} ${metric.type}: ${this.formatDuration(metric.duration)}`);
    
    return this.checkThreshold(metricWithId);
  }

  // ============================================
  // MÉTHODES SPÉCIFIQUES
  // ============================================

  recordChatTotal(duration: number, success: boolean, traceId?: string, details?: Record<string, any>): PerformanceAlert | null {
    if (!this.enabled) return null;
    return this.record({
      type: 'CHAT_TOTAL',
      duration,
      success,
      details: details || {},
      traceId
    });
  }

  recordIntentAnalysis(duration: number, success: boolean, traceId?: string, intent?: string): PerformanceAlert | null {
    if (!this.enabled) return null;
    return this.record({
      type: 'INTENT_ANALYSIS',
      duration,
      success,
      details: { intent },
      traceId
    });
  }

  recordChromaDBSearch(duration: number, success: boolean, resultsCount: number, collection: string, traceId?: string): PerformanceAlert | null {
    if (!this.enabled) return null;
    return this.record({
      type: 'CHROMADB_SEARCH',
      duration,
      success,
      details: { resultsCount, collection },
      traceId
    });
  }

  recordContextBuilding(duration: number, success: boolean, contextLength: number, traceId?: string): PerformanceAlert | null {
    if (!this.enabled) return null;
    return this.record({
      type: 'CONTEXT_BUILDING',
      duration,
      success,
      details: { contextLength },
      traceId
    });
  }

  recordPromptGeneration(duration: number, success: boolean, promptLength: number, traceId?: string): PerformanceAlert | null {
    if (!this.enabled) return null;
    return this.record({
      type: 'PROMPT_GENERATION',
      duration,
      success,
      details: { promptLength },
      traceId
    });
  }

  recordOllamaCall(duration: number, success: boolean, model: string, responseLength: number, tokensPerSecond: number, traceId?: string): PerformanceAlert | null {
    if (!this.enabled) return null;
    return this.record({
      type: 'OLLAMA_CALL',
      duration,
      success,
      details: { model, responseLength, tokensPerSecond },
      traceId
    });
  }

  recordResponseProcessing(duration: number, success: boolean, answerLength: number, traceId?: string): PerformanceAlert | null {
    if (!this.enabled) return null;
    return this.record({
      type: 'RESPONSE_PROCESSING',
      duration,
      success,
      details: { answerLength },
      traceId
    });
  }

  recordFeedbackSave(duration: number, success: boolean, rating: number, traceId?: string): PerformanceAlert | null {
    if (!this.enabled) return null;
    return this.record({
      type: 'FEEDBACK_SAVE',
      duration,
      success,
      details: { rating },
      traceId
    });
  }

  recordDocumentIngestion(duration: number, success: boolean, filename: string, fileSize: number): PerformanceAlert | null {
    if (!this.enabled) return null;
    return this.record({
      type: 'DOCUMENT_INGESTION',
      duration,
      success,
      details: { filename, fileSizeKB: Math.round(fileSize / 1024) }
    });
  }

  recordTrainingPrepare(duration: number, success: boolean, examplesCount: number): PerformanceAlert | null {
    if (!this.enabled) return null;
    return this.record({
      type: 'TRAINING_PREPARE',
      duration,
      success,
      details: { examplesCount }
    });
  }

  recordModelImport(duration: number, success: boolean, modelName: string): PerformanceAlert | null {
    if (!this.enabled) return null;
    return this.record({
      type: 'MODEL_IMPORT',
      duration,
      success,
      details: { modelName }
    });
  }

  // ============================================
  // STATISTIQUES
  // ============================================

  getStatistics(metricType?: MetricType, hours?: number): PerformanceStats[] {
    if (!this.enabled) return [];
    
    const cutoff = hours ? Date.now() - (hours * 60 * 60 * 1000) : 0;
    const filtered = this.metrics.filter(m => 
      (!metricType || m.type === metricType) &&
      (!cutoff || new Date(m.timestamp).getTime() > cutoff)
    );
    
    const grouped = new Map<MetricType, PerformanceMetric[]>();
    for (const metric of filtered) {
      if (!grouped.has(metric.type)) grouped.set(metric.type, []);
      grouped.get(metric.type)!.push(metric);
    }
    
    const stats: PerformanceStats[] = [];
    for (const [type, metrics] of grouped) {
      const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
      const successCount = metrics.filter(m => m.success).length;
      
      stats.push({
        metricType: type,
        count: metrics.length,
        avgDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
        minDuration: durations[0],
        maxDuration: durations[durations.length - 1],
        p50: durations[Math.floor(durations.length * 0.5)],
        p90: durations[Math.floor(durations.length * 0.9)],
        p95: durations[Math.floor(durations.length * 0.95)],
        p99: durations[Math.floor(durations.length * 0.99)],
        successRate: (successCount / metrics.length) * 100,
        thresholdExceededCount: metrics.filter(m => {
          const t = THRESHOLDS[m.type];
          return t && m.duration >= t.warning;
        }).length
      });
    }
    
    return stats.sort((a, b) => a.avgDuration - b.avgDuration);
  }

  getAlerts(limit: number = 50, _acknowledged?: boolean): PerformanceAlert[] {
    if (!this.enabled) return [];
    return this.alerts.slice(0, limit);
  }

  getSlowestQueries(limit: number = 10): PerformanceMetric[] {
    if (!this.enabled) return [];
    return this.metrics
      .filter(m => m.type === 'CHAT_TOTAL')
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  onAlert(callback: (alert: PerformanceAlert) => void): void {
    if (!this.enabled) return;
    this.alertCallbacks.push(callback);
  }

  printSummary(): void {
    if (!this.enabled) return;
    
    const stats = this.getStatistics();
    const totalQueries = this.metrics.filter(m => m.type === 'CHAT_TOTAL').length;
    const avgResponse = stats.find(s => s.metricType === 'CHAT_TOTAL')?.avgDuration || 0;
    const successRate = stats.find(s => s.metricType === 'CHAT_TOTAL')?.successRate || 0;
    const alerts = this.alerts.filter(a => new Date(a.timestamp).getTime() > Date.now() - 86400000).length;
    
    console.log('\n' + '═'.repeat(60));
    console.log('\x1b[1m📈 RÉSUMÉ DES PERFORMANCES\x1b[0m');
    console.log('═'.repeat(60));
    console.log(`\n📊 Vue d'ensemble:`);
    console.log(`  ├─ Requêtes traitées: ${totalQueries}`);
    console.log(`  ├─ Temps moyen: ${this.formatDuration(avgResponse)}`);
    console.log(`  ├─ Taux de succès: ${successRate.toFixed(1)}%`);
    console.log(`  └─ Alertes 24h: ${alerts}`);
    
    console.log(`\n⏱️ Détail par étape:`);
    for (const s of stats.slice(0, 8)) {
      const barLength = Math.min(40, Math.floor(s.avgDuration / 1000));
      const bar = '█'.repeat(barLength) + '░'.repeat(40 - barLength);
      console.log(`  ${s.metricType.padEnd(20)} ${bar} ${this.formatDuration(s.avgDuration)}`);
    }
    
    const slowest = this.getSlowestQueries(3);
    if (slowest.length > 0) {
      console.log(`\n🐌 Requêtes les plus lentes:`);
      for (const slow of slowest) {
        console.log(`  └─ ${this.formatDuration(slow.duration)} - ${slow.details?.query?.substring(0, 50) || 'N/A'}...`);
      }
    }
    
    console.log('\n' + '═'.repeat(60) + '\n');
  }

  // Export CSV
  exportToCSV(hours?: number): string {
    if (!this.enabled) return '';
    
    const cutoff = hours ? Date.now() - (hours * 60 * 60 * 1000) : 0;
    const filtered = this.metrics.filter(m => !cutoff || new Date(m.timestamp).getTime() > cutoff);
    
    const headers = ['Timestamp', 'Type', 'Duration(ms)', 'Success', 'Details'];
    const rows = filtered.map(m => [
      m.timestamp,
      m.type,
      m.duration.toString(),
      m.success ? '1' : '0',
      JSON.stringify(m.details)
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
}

// Export de l'instance unique
export const performanceLogger = PerformanceLogger.getInstance();

// Auto-print summary every hour (seulement si enabled)
if (process.env.VERCEL !== '1') {
  setInterval(() => {
    performanceLogger.printSummary();
  }, 3600000);
}