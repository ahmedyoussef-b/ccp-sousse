// src/lib/logger/chromadb-audit.ts
// Audit spécialisé pour ChromaDB et ses relations

import * as fs from 'fs';
import * as path from 'path';
import { getLogBasePath, isCloudMode } from '../config/env-mode';

// ============================================
// TYPES
// ============================================

export type ChromaDBOperation = 
  | 'CREATE_COLLECTION'
  | 'GET_COLLECTION'
  | 'DELETE_COLLECTION'
  | 'ADD_DOCUMENTS'
  | 'QUERY'
  | 'UPDATE_DOCUMENTS'
  | 'DELETE_DOCUMENTS'
  | 'GET_EMBEDDING'
  | 'LIST_COLLECTIONS'
  | 'HEARTBEAT';

export type RelationType = 
  | 'APP_TO_CHROMADB'    // Application → ChromaDB
  | 'CHROMADB_TO_OLLAMA' // ChromaDB → Ollama (embedding)
  | 'CHROMADB_RESPONSE'; // ChromaDB → Application

export interface ChromaDBAuditEntry {
  id: string;
  timestamp: string;
  operation: ChromaDBOperation;
  relation: RelationType;
  collection?: string;
  query?: string;
  nResults?: number;
  documentsCount?: number;
  embeddingModel?: string;
  duration: number;
  success: boolean;
  error?: string;
  traceId?: string;
  details: Record<string, any>;
}

export interface ChromaDBStats {
  totalOperations: number;
  byOperation: Record<ChromaDBOperation, number>;
  successRate: number;
  avgDuration: number;
  p95Duration: number;
  lastHour: number;
  embeddingCalls: number;
  avgEmbeddingDuration: number;
}

// ============================================
// CLASSE PRINCIPALE
// ============================================

class ChromaDBAudit {
  private static instance: ChromaDBAudit;
  private auditPath: string;
  private entries: ChromaDBAuditEntry[] = [];
  private maxEntries: number = 10000;
  private enabled: boolean = true;

  private constructor() {
    // Désactiver sur Vercel
    if (isCloudMode() || process.env.VERCEL === '1') {
      console.log('[ChromaDBAudit] Désactivé sur Vercel (mode read-only)');
      this.enabled = false;
      this.auditPath = '';
      return;
    }
    
    this.auditPath = getLogBasePath('chromadb');
    this.ensureDirectory();
    this.loadExisting();
  }

  static getInstance(): ChromaDBAudit {
    if (!ChromaDBAudit.instance) {
      ChromaDBAudit.instance = new ChromaDBAudit();
    }
    return ChromaDBAudit.instance;
  }

  private ensureDirectory(): void {
    if (!this.enabled) return;
    if (!fs.existsSync(this.auditPath)) {
      fs.mkdirSync(this.auditPath, { recursive: true });
    }
  }

  private getCurrentLogFile(): string {
    if (!this.enabled) return '';
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.auditPath, `chromadb_audit_${date}.jsonl`);
  }

  private loadExisting(): void {
    if (!this.enabled) return;
    try {
      const logFile = this.getCurrentLogFile();
      if (fs.existsSync(logFile)) {
        const content = fs.readFileSync(logFile, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        for (const line of lines.slice(-this.maxEntries)) {
          this.entries.push(JSON.parse(line));
        }
      }
    } catch (error) {
      console.error('[CHROMADB-AUDIT] Erreur chargement:', error);
    }
  }

  private save(entry: ChromaDBAuditEntry): void {
    if (!this.enabled) return;
    
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) this.entries.pop();

    const logFile = this.getCurrentLogFile();
    try {
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    } catch (error) {
      console.error('[CHROMADB-AUDIT] Erreur sauvegarde:', error);
    }

    this.printConsoleLog(entry);
  }

  private printConsoleLog(entry: ChromaDBAuditEntry): void {
    if (!this.enabled) return;
    
    const statusIcon = entry.success ? '✅' : '❌';
    const durationStr = entry.duration < 1000 ? `${entry.duration}ms` : `${(entry.duration / 1000).toFixed(2)}s`;
    
    let relationIcon = '';
    if (entry.relation === 'APP_TO_CHROMADB') relationIcon = '📤';
    if (entry.relation === 'CHROMADB_TO_OLLAMA') relationIcon = '🔄';
    if (entry.relation === 'CHROMADB_RESPONSE') relationIcon = '📥';
    
    console.log(
      `[CHROMADB-AUDIT] ${relationIcon} ${statusIcon} ${entry.operation} ` +
      `- ${durationStr} - Collection: ${entry.collection || 'N/A'}`
    );
    
    if (!entry.success && entry.error) {
      console.log(`  └─ ❌ Erreur: ${entry.error.substring(0, 100)}`);
    }
  }

  // ============================================
  // MÉTHODES D'AUDIT
  // ============================================

  // APP → ChromaDB
  appToChromaDB(
    operation: ChromaDBOperation,
    duration: number,
    success: boolean,
    options: {
      collection?: string;
      query?: string;
      nResults?: number;
      documentsCount?: number;
      traceId?: string;
      error?: string;
      dimension?: number;
    }
  ): void {
    if (!this.enabled) return;
    
    this.save({
      id: `chroma_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      operation,
      relation: 'APP_TO_CHROMADB',
      collection: options.collection,
      query: options.query,
      nResults: options.nResults,
      documentsCount: options.documentsCount,
      duration,
      success,
      error: options.error,
      traceId: options.traceId,
      details: options.dimension ? { dimension: options.dimension } : {}
    });
  }

  // ChromaDB → Ollama (embedding)
  chromaDBToOllama(
    duration: number,
    success: boolean,
    options: {
      textLength?: number;
      model?: string;
      traceId?: string;
      error?: string;
    }
  ): void {
    if (!this.enabled) return;
    
    this.save({
      id: `chroma_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      operation: 'GET_EMBEDDING',
      relation: 'CHROMADB_TO_OLLAMA',
      embeddingModel: options.model || 'nomic-embed-text',
      duration,
      success,
      error: options.error,
      traceId: options.traceId,
      details: { textLength: options.textLength }
    });
  }

  // ChromaDB → APP (réponse)
  chromaDBResponse(
    operation: ChromaDBOperation,
    duration: number,
    success: boolean,
    options: {
      collection?: string;
      resultsCount?: number;
      traceId?: string;
      error?: string;
    }
  ): void {
    if (!this.enabled) return;
    
    this.save({
      id: `chroma_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      operation,
      relation: 'CHROMADB_RESPONSE',
      collection: options.collection,
      documentsCount: options.resultsCount,
      duration,
      success,
      error: options.error,
      traceId: options.traceId,
      details: {}
    });
  }

  // ============================================
  // STATISTIQUES
  // ============================================

  getStats(hours?: number): ChromaDBStats {
    if (!this.enabled) {
      return {
        totalOperations: 0,
        byOperation: {} as Record<ChromaDBOperation, number>,
        successRate: 100,
        avgDuration: 0,
        p95Duration: 0,
        lastHour: 0,
        embeddingCalls: 0,
        avgEmbeddingDuration: 0
      };
    }
    
    const cutoff = hours ? Date.now() - (hours * 60 * 60 * 1000) : 0;
    const filtered = this.entries.filter(e => new Date(e.timestamp).getTime() > cutoff);
    
    const byOperation: Record<ChromaDBOperation, number> = {} as any;
    let successCount = 0;
    let totalDuration = 0;
    let embeddingCount = 0;
    let embeddingDuration = 0;
    const durations: number[] = [];

    for (const entry of filtered) {
      byOperation[entry.operation] = (byOperation[entry.operation] || 0) + 1;
      if (entry.success) successCount++;
      totalDuration += entry.duration;
      durations.push(entry.duration);
      
      if (entry.operation === 'GET_EMBEDDING') {
        embeddingCount++;
        embeddingDuration += entry.duration;
      }
    }

    durations.sort((a, b) => a - b);
    const p95Index = Math.floor(durations.length * 0.95);
    const p95Duration = durations[p95Index] || 0;

    const lastHour = this.entries.filter(e => 
      new Date(e.timestamp).getTime() > Date.now() - 3600000
    ).length;

    return {
      totalOperations: filtered.length,
      byOperation,
      successRate: filtered.length > 0 ? (successCount / filtered.length) * 100 : 100,
      avgDuration: filtered.length > 0 ? totalDuration / filtered.length : 0,
      p95Duration,
      lastHour,
      embeddingCalls: embeddingCount,
      avgEmbeddingDuration: embeddingCount > 0 ? embeddingDuration / embeddingCount : 0
    };
  }

  getSlowOperations(minDurationMs: number = 1000, limit: number = 20): ChromaDBAuditEntry[] {
    if (!this.enabled) return [];
    return this.entries
      .filter(e => e.duration >= minDurationMs)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  getErrors(limit: number = 50): ChromaDBAuditEntry[] {
    if (!this.enabled) return [];
    return this.entries
      .filter(e => !e.success)
      .slice(0, limit);
  }

  getOperationsByCollection(collection: string, limit: number = 100): ChromaDBAuditEntry[] {
    if (!this.enabled) return [];
    return this.entries
      .filter(e => e.collection === collection)
      .slice(0, limit);
  }

  printSummary(): void {
    if (!this.enabled) return;
    
    const stats = this.getStats(24);
    
    console.log('\n' + '═'.repeat(60));
    console.log('\x1b[35m📊 CHROMADB - RAPPORT D\'AUDIT\x1b[0m');
    console.log('═'.repeat(60));
    
    console.log(`\n📈 Vue d'ensemble (24h):`);
    console.log(`  ├─ Total opérations: ${stats.totalOperations}`);
    console.log(`  ├─ Taux de succès: ${stats.successRate.toFixed(1)}%`);
    console.log(`  ├─ Durée moyenne: ${stats.avgDuration.toFixed(0)}ms`);
    console.log(`  ├─ P95: ${stats.p95Duration.toFixed(0)}ms`);
    console.log(`  └─ Dernière heure: ${stats.lastHour}`);
    
    console.log(`\n🔄 Relations:`);
    console.log(`  ├─ APP → ChromaDB: ${this.entries.filter(e => e.relation === 'APP_TO_CHROMADB' && new Date(e.timestamp).getTime() > Date.now() - 86400000).length}`);
    console.log(`  ├─ ChromaDB → Ollama: ${stats.embeddingCalls}`);
    console.log(`  └─ ChromaDB → APP: ${this.entries.filter(e => e.relation === 'CHROMADB_RESPONSE' && new Date(e.timestamp).getTime() > Date.now() - 86400000).length}`);
    
    console.log(`\n⚡ Performances par opération:`);
    for (const [op, count] of Object.entries(stats.byOperation)) {
      const ops = this.entries.filter(e => e.operation === op && new Date(e.timestamp).getTime() > Date.now() - 86400000);
      const avgDur = ops.length > 0 ? ops.reduce((a, b) => a + b.duration, 0) / ops.length : 0;
      console.log(`  ${op.padEnd(20)} ${count.toString().padStart(5)} appels - ${avgDur.toFixed(0)}ms en moyenne`);
    }
    
    const errors = this.getErrors(5);
    if (errors.length > 0) {
      console.log(`\n❌ Dernières erreurs:`);
      for (const err of errors.slice(0, 5)) {
        console.log(`  └─ ${err.operation}: ${err.error?.substring(0, 80)}`);
      }
    }
    
    console.log('\n' + '═'.repeat(60) + '\n');
  }
}

export const chromaDBAudit = ChromaDBAudit.getInstance();

// Auto-print summary every hour (seulement si enabled)
if (process.env.VERCEL !== '1') {
  setInterval(() => {
    chromaDBAudit.printSummary();
  }, 3600000);
}