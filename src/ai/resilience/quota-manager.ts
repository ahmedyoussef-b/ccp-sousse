/**
 * Quota Manager - Gestionnaire de quotas pour les APIs Cloud
 * @version 1.0.0
 * @description Suit la consommation des APIs (Gemini, Groq) et gère le basculement vers le local
 */

import { getSQLiteCore } from '../core/sqlite/manager';

export interface QuotaStatus {
  provider: string;
  limit: number;
  consumed: number;
  remaining: number;
  resetDate: string;
  isExceeded: boolean;
}

export class QuotaManager {
  private static instance: QuotaManager;
  private db = getSQLiteCore();

  private readonly QUOTAS = {
    gemini: {
      daily_limit: 1500, // Limite gratuite généreuse
      reset_hour: 0 // Minuit UTC
    },
    groq: {
      daily_limit: 500,
      reset_hour: 0
    }
  };

  private constructor() {
    this.initTable();
  }

  public static getInstance(): QuotaManager {
    if (!QuotaManager.instance) {
      QuotaManager.instance = new QuotaManager();
    }
    return QuotaManager.instance;
  }

  private initTable() {
    try {
      this.db.getDB().exec(`
        CREATE TABLE IF NOT EXISTS cloud_api_quotas (
          provider TEXT PRIMARY KEY,
          consumed INTEGER DEFAULT 0,
          last_reset INTEGER DEFAULT 0
        )
      `);
    } catch (error) {
      console.error('[QuotaManager] Erreur init table:', error);
    }
  }

  private async checkReset(provider: string): Promise<void> {
    const now = Date.now();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const resetTimestamp = today.getTime();

    const row = this.db.getDB().prepare('SELECT last_reset FROM cloud_api_quotas WHERE provider = ?').get(provider) as { last_reset: number } | undefined;

    if (!row || row.last_reset < resetTimestamp) {
      this.db.getDB().prepare(`
        INSERT OR REPLACE INTO cloud_api_quotas (provider, consumed, last_reset)
        VALUES (?, 0, ?)
      `).run(provider, now);
      console.log(`[QuotaManager] Quota réinitialisé pour ${provider}`);
    }
  }

  /**
   * Enregistre une utilisation de l'API
   */
  public async recordUsage(provider: string, units: number = 1): Promise<void> {
    await this.checkReset(provider);
    this.db.getDB().prepare(`
      UPDATE cloud_api_quotas 
      SET consumed = consumed + ? 
      WHERE provider = ?
    `).run(units, provider);
  }

  /**
   * Vérifie si le quota est disponible
   */
  public async isAvailable(provider: string): Promise<boolean> {
    await this.checkReset(provider);
    const config = (this.QUOTAS as any)[provider];
    if (!config) return true;

    const row = this.db.getDB().prepare('SELECT consumed FROM cloud_api_quotas WHERE provider = ?').get(provider) as { consumed: number } | undefined;
    const consumed = row?.consumed || 0;

    return consumed < config.daily_limit;
  }

  /**
   * Récupère l'état complet des quotas
   */
  public async getStatus(provider: string): Promise<QuotaStatus> {
    await this.checkReset(provider);
    const config = (this.QUOTAS as any)[provider];
    
    const row = this.db.getDB().prepare('SELECT consumed FROM cloud_api_quotas WHERE provider = ?').get(provider) as { consumed: number } | undefined;
    const consumed = row?.consumed || 0;
    const limit = config?.daily_limit || 0;

    return {
      provider,
      limit,
      consumed,
      remaining: Math.max(0, limit - consumed),
      resetDate: new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString(),
      isExceeded: consumed >= limit
    };
  }
}

export const quotaManager = QuotaManager.getInstance();
