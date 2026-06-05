/**
 * @fileOverview Gestionnaire de statistiques centralisé pour le module RAG
 * @version 1.0.0
 * @description Remplace les objets stats volatiles par un gestionnaire typé et persistable
 */

export type StatsUpdate<T extends Record<string, any>> = Partial<T> | ((prev: T) => T);

export interface StatsManagerOptions<T extends Record<string, any>> {
  initial: T;
  onPersist?: (stats: T, timestamp: Date) => Promise<void> | void;
  persistIntervalMs?: number;
}

export class StatsManager<T extends Record<string, any>> {
  private stats: T;
  private lastPersistedStats: string;
  private readonly initial: T;
  private readonly onPersist?: (stats: T, timestamp: Date) => Promise<void> | void;
  private readonly persistIntervalMs?: number;
  private persistTimer?: NodeJS.Timeout;
  private readonly createdAt: Date;

  constructor(options: StatsManagerOptions<T>) {
    this.initial = { ...options.initial };
    this.stats = { ...this.initial };
    this.lastPersistedStats = JSON.stringify(this.stats);
    this.onPersist = options.onPersist;
    this.persistIntervalMs = options.persistIntervalMs || 300000; // 5 minutes par défaut
    this.createdAt = new Date();
    
    if (this.onPersist) {
      this.startAutoPersist();
    }
  }

  get(): Readonly<T> {
    return { ...this.stats };
  }

  update(updates: StatsUpdate<T>): void {
    const newStats = typeof updates === 'function' 
      ? updates(this.stats) 
      : { ...this.stats, ...updates };
    
    this.stats = newStats;
  }

  increment<K extends keyof T>(key: K, value: number = 1): void {
    const current = this.stats[key] as unknown as number;
    if (typeof current === 'number') {
      this.update({ [key]: current + value } as Partial<T>);
    }
  }

  average<K extends keyof T>(key: K, newValue: number, countKey?: keyof T): void {
    const current = this.stats[key] as unknown as number;
    const count = countKey 
      ? (this.stats[countKey] as unknown as number) || 1 
      : 1;
    
    if (typeof current === 'number') {
      const avg = (current * (count - 1) + newValue) / count;
      this.update({ [key]: avg } as Partial<T>);
    }
  }

  reset(): void {
    this.stats = { ...this.initial };
  }

  getSnapshot(): { stats: T; metadata: { createdAt: Date; updatedAt: Date } } {
    return {
      stats: { ...this.stats },
      metadata: {
        createdAt: this.createdAt,
        updatedAt: new Date()
      }
    };
  }

  async persist(): Promise<void> {
    if (!this.onPersist) return;

    const currentStatsStr = JSON.stringify(this.stats);
    if (currentStatsStr === this.lastPersistedStats) {
      return; // Rien à sauver
    }

    try {
      await this.onPersist(this.stats, new Date());
      this.lastPersistedStats = currentStatsStr;
    } catch (error) {
      console.error('[STATS] Persistence error:', error);
    }
  }

  private startAutoPersist(): void {
    if (this.persistTimer) clearInterval(this.persistTimer);
    this.persistTimer = setInterval(() => {
      this.persist().catch(() => {});
    }, this.persistIntervalMs);
  }

  dispose(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = undefined;
    }
    // Persist final state before disposal
    this.persist().catch(console.error);
  }

  // Utility pour calculer des taux
  static calculateRate(numerator: number, denominator: number): number {
    return denominator > 0 ? numerator / denominator : 0;
  }

  // Utility pour formater des pourcentages
  static formatPercent(value: number, decimals: number = 2): string {
    return `${(value * 100).toFixed(decimals)}%`;
  }
}

// Types utilitaires pour définir des stats
export type NumericStats = Record<string, number>;
export type TimestampStats = Record<string, number | null>;
export type CounterStats = Record<string, number>;

export default StatsManager;