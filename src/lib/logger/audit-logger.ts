// src/lib/logger/audit-logger.ts
// Journal d'audit pour tracer toutes les actions importantes de l'application

import * as fs from 'fs';
import * as path from 'path';
import { getLogBasePath, isCloudMode } from '../config/env-mode';

// ============================================
// TYPES
// ============================================

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  userId: string;
  userRole?: string;
  details: Record<string, any>;
  ipAddress?: string;
  sessionId?: string;
  success: boolean;
  errorMessage?: string;
  duration?: number;
}

export type AuditAction = 
  | 'CHAT_QUERY'
  | 'FEEDBACK_SUBMIT'
  | 'DOCUMENT_UPLOAD'
  | 'DOCUMENT_DELETE'
  | 'TRAINING_EXAMPLE_ADD'
  | 'TRAINING_EXAMPLE_EDIT'
  | 'TRAINING_EXAMPLE_DELETE'
  | 'TRAINING_IMPORT'
  | 'TRAINING_EXPORT'
  | 'MODEL_IMPORT'
  | 'MODEL_SWITCH'
  | 'COLAB_PREPARE'
  | 'COLAB_EXPORT'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'CONFIG_CHANGE'
  | 'SYSTEM_START'
  | 'SYSTEM_STOP'
  | 'ERROR_OCCURRED';

export interface AuditStats {
  total: number;
  byAction: Record<AuditAction, number>;
  byUser: Record<string, number>;
  successRate: number;
  last24h: number;
  averageDuration: number;
  errors: { action: AuditAction; error: string; timestamp: string }[];
}

// ============================================
// CLASSE PRINCIPALE
// ============================================

class AuditLogger {
  private static instance: AuditLogger;
  private auditPath: string;
  private buffer: AuditEntry[] = [];
  private bufferSize: number = 100;
  private flushInterval: NodeJS.Timeout | null = null;
  private enabled: boolean = true;

  private constructor() {
    // Désactiver sur Vercel
    if (isCloudMode() || process.env.VERCEL === '1') {
      console.log('[AuditLogger] Désactivé sur Vercel (mode read-only)');
      this.enabled = false;
      this.auditPath = '';
      return;
    }
    
    this.auditPath = getLogBasePath('audit');
    this.ensureDirectory();
    this.startAutoFlush();
  }

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  private ensureDirectory(): void {
    if (!this.enabled) return;
    if (!fs.existsSync(this.auditPath)) {
      fs.mkdirSync(this.auditPath, { recursive: true });
    }
  }

  private startAutoFlush(): void {
    if (!this.enabled) return;
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushInterval = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, 60000); // Toutes les minutes
  }

  private getCurrentLogFile(): string {
    if (!this.enabled) return '';
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.auditPath, `audit_${date}.jsonl`);
  }

  private flush(): void {
    if (!this.enabled) return;
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    const logFile = this.getCurrentLogFile();
    const lines = entries.map(entry => JSON.stringify(entry)).join('\n');
    
    try {
      fs.appendFileSync(logFile, lines + '\n');
      
      // Nettoyer les anciens fichiers (garder 30 jours)
      this.cleanupOldLogs();
    } catch (error) {
      console.error('[AUDIT] Erreur lors de l\'écriture:', error);
      // Remettre dans le buffer pour réessayer plus tard
      this.buffer.unshift(...entries);
    }
  }

  private cleanupOldLogs(): void {
    if (!this.enabled) return;
    try {
      const files = fs.readdirSync(this.auditPath);
      const now = Date.now();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.auditPath, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > thirtyDays) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      console.error('[AUDIT] Erreur nettoyage logs:', error);
    }
  }

  // ============================================
  // MÉTHODES PUBLIQUES
  // ============================================

  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): string {
    if (!this.enabled) return '';

    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const fullEntry: AuditEntry = {
      ...entry,
      id,
      timestamp: new Date().toISOString()
    };

    this.buffer.push(fullEntry);

    // Log immédiat dans la console pour les actions critiques
    const statusIcon = entry.success ? '✅' : '❌';
    console.log(`[AUDIT] ${statusIcon} ${entry.action} - User: ${entry.userId} - ${entry.success ? 'Succès' : 'Échec'}`);

    // Si buffer trop grand, flush immédiat
    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }

    return id;
  }

  async getEntries(options?: {
    startDate?: Date;
    endDate?: Date;
    action?: AuditAction;
    userId?: string;
    success?: boolean;
    limit?: number;
  }): Promise<AuditEntry[]> {
    if (!this.enabled) return [];

    const entries: AuditEntry[] = [];

    try {
      const files = fs.readdirSync(this.auditPath).sort().reverse();

      for (const file of files) {
        const filePath = path.join(this.auditPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        
        for (const line of lines) {
          const entry = JSON.parse(line) as AuditEntry;
          
          if (options?.startDate && new Date(entry.timestamp) < options.startDate) continue;
          if (options?.endDate && new Date(entry.timestamp) > options.endDate) continue;
          if (options?.action && entry.action !== options.action) continue;
          if (options?.userId && entry.userId !== options.userId) continue;
          if (options?.success !== undefined && entry.success !== options.success) continue;
          
          entries.push(entry);
          
          if (options?.limit && entries.length >= options.limit) break;
        }
        
        if (options?.limit && entries.length >= options.limit) break;
      }
    } catch (err) {
      console.error('[AUDIT] Erreur lecture entrées fichiers:', err);
    }

    // Ajouter les entrées du buffer
    for (const entry of this.buffer) {
      if (options?.startDate && new Date(entry.timestamp) < options.startDate) continue;
      if (options?.endDate && new Date(entry.timestamp) > options.endDate) continue;
      if (options?.action && entry.action !== options.action) continue;
      if (options?.userId && entry.userId !== options.userId) continue;
      if (options?.success !== undefined && entry.success !== options.success) continue;
      
      entries.unshift(entry);
      if (options?.limit && entries.length >= options.limit) break;
    }

    return entries.slice(0, options?.limit || 1000);
  }

  getStats(): AuditStats {
    if (!this.enabled) {
      return {
        total: 0,
        byAction: {} as Record<AuditAction, number>,
        byUser: {},
        successRate: 100,
        last24h: 0,
        averageDuration: 0,
        errors: []
      };
    }

    const stats: AuditStats = {
      total: 0,
      byAction: {} as Record<AuditAction, number>,
      byUser: {},
      successRate: 0,
      last24h: 0,
      averageDuration: 0,
      errors: []
    };

    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    let totalDuration = 0;
    let durationCount = 0;

    try {
      const files = fs.readdirSync(this.auditPath);

      for (const file of files) {
        const filePath = path.join(this.auditPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        
        for (const line of lines) {
          const entry = JSON.parse(line) as AuditEntry;
          stats.total++;
          
          // Par action
          stats.byAction[entry.action] = (stats.byAction[entry.action] || 0) + 1;
          
          // Par utilisateur
          stats.byUser[entry.userId] = (stats.byUser[entry.userId] || 0) + 1;
          
          // Dernières 24h
          if (new Date(entry.timestamp).getTime() > last24h) {
            stats.last24h++;
          }
          
          // Durée moyenne
          if (entry.duration) {
            totalDuration += entry.duration;
            durationCount++;
          }
          
          // Erreurs
          if (!entry.success && entry.errorMessage) {
            stats.errors.push({
              action: entry.action,
              error: entry.errorMessage,
              timestamp: entry.timestamp
            });
          }
        }
      }
    } catch (err) {
      console.error('[AUDIT] Erreur lecture stats fichiers:', err);
    }

    // Ajouter les entrées du buffer
    for (const entry of this.buffer) {
      stats.total++;
      stats.byAction[entry.action] = (stats.byAction[entry.action] || 0) + 1;
      stats.byUser[entry.userId] = (stats.byUser[entry.userId] || 0) + 1;
      if (new Date(entry.timestamp).getTime() > last24h) stats.last24h++;
      if (entry.duration) {
        totalDuration += entry.duration;
        durationCount++;
      }
      if (!entry.success && entry.errorMessage) {
        stats.errors.push({
          action: entry.action,
          error: entry.errorMessage,
          timestamp: entry.timestamp
        });
      }
    }

    stats.successRate = stats.total > 0 
      ? (stats.total - stats.errors.length) / stats.total * 100 
      : 100;
    stats.averageDuration = durationCount > 0 ? totalDuration / durationCount : 0;
    stats.errors = stats.errors.slice(-50); // Garder les 50 dernières erreurs

    return stats;
  }

  // ============================================
  // MÉTHODES SPÉCIFIQUES PAR ACTION
  // ============================================

  chatQuery(userId: string, question: string, answerLength: number, duration: number, success: boolean, error?: string): string {
    if (!this.enabled) return '';
    
    return this.log({
      action: 'CHAT_QUERY',
      userId,
      details: {
        question: question.substring(0, 200),
        answerLength,
        modelUsed: 'phi:2.7b'
      },
      success,
      errorMessage: error,
      duration
    });
  }

  feedbackSubmit(userId: string, messageId: string, rating: number, question: string): string {
    if (!this.enabled) return '';
    
    return this.log({
      action: 'FEEDBACK_SUBMIT',
      userId,
      details: {
        messageId,
        rating,
        question: question.substring(0, 100)
      },
      success: true
    });
  }

  documentUpload(userId: string, filename: string, fileSize: number, success: boolean, error?: string): string {
    if (!this.enabled) return '';
    
    return this.log({
      action: 'DOCUMENT_UPLOAD',
      userId,
      details: {
        filename,
        fileSizeKB: Math.round(fileSize / 1024)
      },
      success,
      errorMessage: error
    });
  }

  trainingExampleAdd(userId: string, question: string, answerLength: number): string {
    if (!this.enabled) return '';
    
    return this.log({
      action: 'TRAINING_EXAMPLE_ADD',
      userId,
      details: {
        question: question.substring(0, 100),
        answerLength
      },
      success: true
    });
  }

  trainingImport(userId: string, filename: string, examplesCount: number): string {
    if (!this.enabled) return '';
    
    return this.log({
      action: 'TRAINING_IMPORT',
      userId,
      details: {
        filename,
        examplesCount
      },
      success: true
    });
  }

  modelImport(userId: string, modelName: string, success: boolean, error?: string): string {
    if (!this.enabled) return '';
    
    return this.log({
      action: 'MODEL_IMPORT',
      userId,
      details: { modelName },
      success,
      errorMessage: error
    });
  }

  modelSwitch(userId: string, oldModel: string, newModel: string): string {
    if (!this.enabled) return '';
    
    return this.log({
      action: 'MODEL_SWITCH',
      userId,
      details: { oldModel, newModel },
      success: true
    });
  }

  colabExport(userId: string, examplesCount: number): string {
    if (!this.enabled) return '';
    
    return this.log({
      action: 'COLAB_EXPORT',
      userId,
      details: { examplesCount },
      success: true
    });
  }

  systemEvent(action: 'SYSTEM_START' | 'SYSTEM_STOP', details?: Record<string, any>): string {
    if (!this.enabled) return '';
    
    return this.log({
      action,
      userId: 'system',
      details: details || {},
      success: true
    });
  }

  errorOccurred(error: string, context?: Record<string, any>): string {
    if (!this.enabled) return '';
    
    return this.log({
      action: 'ERROR_OCCURRED',
      userId: 'system',
      details: context || {},
      success: false,
      errorMessage: error
    });
  }

  // Nettoyage
  shutdown(): void {
    if (!this.enabled) return;
    
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }
}

// Export de l'instance unique
export const auditLogger = AuditLogger.getInstance();

// Gestion de l'arrêt propre (seulement si enabled)
if (process.env.VERCEL !== '1') {
  process.on('beforeExit', () => {
    auditLogger.shutdown();
  });

  process.on('SIGINT', () => {
    auditLogger.shutdown();
    process.exit();
  });
}