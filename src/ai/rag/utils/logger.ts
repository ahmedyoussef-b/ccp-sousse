/**
 * @fileOverview Logger centralisé pour le module RAG
 * @version 1.0.0
 * @description Réduit la duplication de code de logging dans tous les modules RAG
 */

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'metric' | 'structured';

export interface LogOptions {
  prefix: string;
  separator?: string;
  maxDataLength?: number;
  enableStructured?: boolean;
}

export class RAGLogger {
  debug(_arg0: string, _arg1: string) {
    throw new Error('Method not implemented.');
  }
  private readonly prefix: string;
  private readonly separator: string;
  private readonly maxDataLength: number;
  private readonly enableStructured: boolean;

  constructor(options: LogOptions) {
    this.prefix = options.prefix;
    this.separator = options.separator || '─'.repeat(50);
    this.maxDataLength = options.maxDataLength || 300;
    this.enableStructured = options.enableStructured ?? false;
  }

  private formatData(data: any): string {
    if (!data) return '';
    try {
      const json = JSON.stringify(data, null, 2);
      return json.length > this.maxDataLength 
        ? json.substring(0, this.maxDataLength) + '...' 
        : json;
    } catch {
      return String(data);
    }
  }

  private log(level: string, emoji: string, step: string, message: string, data?: any): void {
    const base = `${this.prefix} ${emoji} [${step}] ${message}`;
    
    if (this.enableStructured && level !== 'metric') {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        module: this.prefix.replace(/\[|\]/g, ''),
        level,
        step,
        message,
        data: data ? JSON.parse(this.formatData(data)) : undefined
      }, null, 2));
    } else {
      console.log(base);
      if (data) console.log(`${this.prefix} 📊 ${this.formatData(data)}`);
    }
  }

  public info(step: string, message: string, data?: any): void {
    this.log('info', '📍', step, message, data);
  }

  public success(step: string, message: string, data?: any): void {
    this.log('success', '✅', step, message, data);
  }

  public warning(step: string, message: string, data?: any): void {
    this.log('warning', '⚠️', step, message, data);
  }

  public error(step: string, message: string, error?: any): void {
    this.log('error', '❌', step, message, error);
    if (error?.stack) console.error(`${this.prefix} 🔥 ${error.stack}`);
  }

  public metric(step: string, metric: string, value: any): void {
    console.log(`${this.prefix} 📈 [${step}] ${metric}: ${value}`);
  }

  public structured(step: string, data: Record<string, any>): void {
    if (this.enableStructured) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        module: this.prefix.replace(/\[|\]/g, ''),
        step,
        ...data
      }, null, 2));
    }
  }

  public printSeparator(): void {
    console.log(this.separator);
  }

  public formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  }
}

// Factory pour créer des loggers pré-configurés
export const createRAGLogger = (prefix: string, options?: Partial<LogOptions>): RAGLogger => {
  return new RAGLogger({
    prefix,
    enableStructured: typeof process !== 'undefined' && process.env?.NODE_ENV === 'production',
    ...options
  });
};

export default RAGLogger;