/**
 * @fileOverview PredictiveCache - Cache prédictif par profil utilisateur
 * @version 2.0.0
 * @description Préchauffe le cache avec les requêtes probables selon le profil et l'historique
 * @innovation 6/7
 * @migration SQLite - Stockage persistant
 */

import { getSQLiteCore } from '@/ai/core/sqlite/manager';

// ============================================================================
// TYPES
// ============================================================================

export interface CachedResponse {
  query: string;
  answer: string;
  strategy: string;
  confidence: number;
  category: string;
  displayMode: string;
  timestamp: number;
  expiresAt: number;
  hits: number;
  lastAccess: number;
}

export interface CachedResponseEntry extends CachedResponse {
  hash: string;
  userId: string;
}

export interface UserProfile {
  id: string;
  role: string;
  preferredZones: string[];
  frequentQueries: string[];
  lastActive: number;
  queryPatterns: QueryPattern[];
}

export interface QueryPattern {
  pattern: string;
  frequency: number;
  lastUsed: number;
  category: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_CONFIG = {
  defaultTTL: 3600,           // 1 heure
  maxCacheSize: 10000,
  preloadLimit: 20,
  hitBoost: 0.1,
  decayFactor: 0.95
};

const PROFILE_PATTERNS: Record<string, string[]> = {
  chef_quart: [
    "Quel est le planning aujourd'hui ?",
    "Y a-t-il des consignes particulières ?",
    "État des équipements critiques",
    "Qui est de garde ?",
    "Consommation du jour"
  ],
  maintenance: [
    "Interventions en cours",
    "Prochaines maintenances préventives",
    "Stock pièces détachées critiques",
    "Historique pannes TG1",
    "État des équipements"
  ],
  operateur: [
    "Procédure de démarrage TG1",
    "Valeurs nominales TG2",
    "Alarmes actives",
    "Paramètres de consigne",
    "Dernières modifications"
  ],
  superviseur: [
    "Rapport de production",
    "Performance hebdomadaire",
    "Alertes sécurité",
    "Bilan énergétique",
    "Plan de charge"
  ]
};

const TIME_PATTERNS: Record<number, string[]> = {
  8: ["Quel est le programme du jour ?", "Consignes matinales", "État des équipements"],
  12: ["Avancement de la production", "Point mi-journée", "Consommation"],
  16: ["Bilan de la journée", "Préparation relève", "Point équipe soir"],
  20: ["Consignes nuit", "Surveillance particulière", "Équipements critiques"]
};

// ============================================================================
// LOGS
// ============================================================================

const LOG_PREFIX = '[PREDICTIVE-CACHE]';

function logInfo(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logSuccess(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} ✅ ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}


// ============================================================================
// SERVICE AVEC SQLITE
// ============================================================================

export class PredictiveCache {
  private db = getSQLiteCore();
  private memoryCache = new Map<string, CachedResponseEntry>(); // Cache L1
  private userHistoryCache = new Map<string, UserProfile>();   // Cache mémoire
  private stats = {
    totalHits: 0,
    totalMisses: 0,
    predictiveHits: 0,
    preloadCount: 0,
    hitRate: 0,
    avgPreloadLatency: 0
  };

  private async ensureTables(): Promise<void> {
    await this.db.initialize();
    // Vérifier que la table existe (créée dans schemas.ts)
    this.db.getDB().exec(`
      CREATE TABLE IF NOT EXISTS predictive_cache (
        hash TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        query TEXT NOT NULL,
        answer TEXT NOT NULL,
        strategy TEXT NOT NULL,
        confidence REAL NOT NULL,
        category TEXT NOT NULL,
        displayMode TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL,
        hits INTEGER DEFAULT 0,
        lastAccess INTEGER NOT NULL
      )
    `);
    this.db.getDB().exec(`
      CREATE INDEX IF NOT EXISTS idx_predictive_user ON predictive_cache(userId)
    `);
    this.db.getDB().exec(`
      CREATE INDEX IF NOT EXISTS idx_predictive_expires ON predictive_cache(expiresAt)
    `);
  }

  async get(userId: string, query: string): Promise<CachedResponse | null> {
    await this.ensureTables();
    const hash = this.generateHash(query);
    
    // 1. Vérifier cache mémoire (L1)
    if (this.memoryCache.has(hash)) {
      const cached = this.memoryCache.get(hash)!;
      if (cached.expiresAt > Date.now() && cached.userId === userId) {
        this.stats.totalHits++;
        this.updateHitRate();
        
        // Mettre à jour les hits en SQLite
        this.db.getDB().prepare(`
          UPDATE predictive_cache SET hits = hits + 1, lastAccess = ? WHERE hash = ?
        `).run(Date.now(), hash);
        
        logInfo(`Cache HIT (L1): "${query.substring(0, 50)}..." (hits: ${cached.hits + 1})`);
        return cached;
      }
      this.memoryCache.delete(hash);
    }
    
    // 2. Vérifier SQLite (L2)
    const row = this.db.getDB().prepare(`
      SELECT * FROM predictive_cache WHERE hash = ? AND userId = ? AND expiresAt > ?
    `).get(hash, userId, Date.now()) as any;
    
    if (row) {
      const entry: CachedResponseEntry = {
        hash: row.hash,
        userId: row.userId,
        query: row.query,
        answer: row.answer,
        strategy: row.strategy,
        confidence: row.confidence,
        category: row.category,
        displayMode: row.displayMode,
        timestamp: row.timestamp,
        expiresAt: row.expiresAt,
        hits: row.hits,
        lastAccess: row.lastAccess
      };
      
      // Mettre en cache mémoire
      this.memoryCache.set(hash, entry);
      this.stats.totalHits++;
      this.updateHitRate();
      
      // Incrémenter les hits
      this.db.getDB().prepare(`
        UPDATE predictive_cache SET hits = hits + 1, lastAccess = ? WHERE hash = ?
      `).run(Date.now(), hash);
      
      logInfo(`Cache HIT (L2): "${query.substring(0, 50)}..." (hits: ${entry.hits + 1})`);
      return entry;
    }
    
    this.stats.totalMisses++;
    this.updateHitRate();
    logInfo(`Cache MISS: "${query.substring(0, 50)}..."`);
    return null;
  }

  async update(userId: string, response: CachedResponse): Promise<void> {
    await this.ensureTables();
    const hash = this.generateHash(response.query);
    
    const entry: CachedResponseEntry = {
      ...response,
      hash,
      userId,
      expiresAt: response.expiresAt || Date.now() + (CACHE_CONFIG.defaultTTL * 1000),
      hits: 0,
      lastAccess: Date.now()
    };
    
    // Sauvegarde SQLite
    this.db.getDB().prepare(`
      INSERT OR REPLACE INTO predictive_cache 
      (hash, userId, query, answer, strategy, confidence, category, displayMode, timestamp, expiresAt, hits, lastAccess)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.hash, entry.userId, entry.query, entry.answer, entry.strategy,
      entry.confidence, entry.category, entry.displayMode, entry.timestamp,
      entry.expiresAt, entry.hits, entry.lastAccess
    );
    
    // Cache mémoire
    this.memoryCache.set(hash, entry);
    
    // Mettre à jour l'historique utilisateur
    await this.updateUserHistory(userId, response.query);
    
    logInfo(`Cache UPDATE: "${response.query.substring(0, 50)}..."`);
  }

  async preloadForUser(userId: string, profile: string): Promise<number> {
    await this.ensureTables();
    const startTime = Date.now();
    
    logInfo(`🔄 Préchargement pour ${userId} (${profile})...`);
    
    const userHistory = await this.getUserHistory(userId);
    const predictions = await this.predictNextQueries(userId, profile, userHistory);
    
    const missingQueries: string[] = [];
    for (const query of predictions) {
      const hash = this.generateHash(query);
      const existing = this.db.getDB().prepare(`
        SELECT 1 FROM predictive_cache WHERE hash = ? AND userId = ? AND expiresAt > ?
      `).get(hash, userId, Date.now());
      if (!existing) {
        missingQueries.push(query);
      }
    }
    
    const preloadCount = Math.min(missingQueries.length, CACHE_CONFIG.preloadLimit);
    for (let i = 0; i < preloadCount; i++) {
      this.preloadInBackground(missingQueries[i], userId, profile);
    }
    
    const duration = Date.now() - startTime;
    this.stats.preloadCount += preloadCount;
    this.stats.avgPreloadLatency = (this.stats.avgPreloadLatency * (this.stats.preloadCount - preloadCount) + duration) / this.stats.preloadCount;
    
    logSuccess(`Préchargement terminé: ${preloadCount} requêtes en ${duration}ms`);
    
    return preloadCount;
  }

  async predictNextQueries(userId: string, profile: string, history?: UserProfile): Promise<string[]> {
    const predictions: string[] = [];
    const userHistory = history || await this.getUserHistory(userId);
    
    const profileQueries = PROFILE_PATTERNS[profile] || PROFILE_PATTERNS.operateur;
    predictions.push(...profileQueries);
    
    const currentHour = new Date().getHours();
    const timeQueries = TIME_PATTERNS[Math.floor(currentHour / 4) * 4] || [];
    predictions.push(...timeQueries);
    
    if (userHistory.queryPatterns.length > 0) {
      const lastQuery = userHistory.frequentQueries[0];
      if (lastQuery) {
        const sequentialPredictions = this.predictSequential(lastQuery, userHistory.queryPatterns);
        predictions.push(...sequentialPredictions);
      }
    }
    
    const frequentPredictions = userHistory.frequentQueries.slice(0, 5);
    predictions.push(...frequentPredictions);
    
    const unique = [...new Set(predictions)];
    
    logInfo(`📊 Prédictions: ${unique.length} requêtes candidates`);
    
    return unique.slice(0, CACHE_CONFIG.preloadLimit);
  }

  private predictSequential(lastQuery: string, patterns: QueryPattern[]): string[] {
    const predictions: string[] = [];
    
    const sequentialPatterns = patterns.filter(p => 
      p.pattern.toLowerCase().includes(lastQuery.toLowerCase())
    );
    
    for (const pattern of sequentialPatterns) {
      const nextQuery = pattern.pattern.replace(lastQuery, '').trim();
      if (nextQuery && nextQuery.length > 5) {
        predictions.push(nextQuery);
      }
    }
    
    return predictions;
  }

  private async preloadInBackground(query: string, userId: string, profile: string): Promise<void> {
    setTimeout(async () => {
      try {
        logInfo(`⏳ Préchargement: "${query.substring(0, 50)}..."`);
        
        const { orchestrateResponse } = await import('../index');
        
        const result = await orchestrateResponse({
          query,
          userProfile: profile,
          userId,
          options: { skipCache: true }
        });
        
        await this.update(userId, {
          query,
          answer: result.answer,
          strategy: result.strategy,
          confidence: result.confidence,
          category: result.metadata.category || 'GENERAL',
          displayMode: result.metadata.displayMode || 'TEXT',
          timestamp: Date.now(),
          expiresAt: Date.now() + CACHE_CONFIG.defaultTTL * 1000,
          hits: 0,
          lastAccess: Date.now()
        });
        
        logSuccess(`✅ Préchargé: "${query.substring(0, 50)}..."`);
        
      } catch (error) {
        logInfo(`Échec préchargement: "${query.substring(0, 50)}..."`);
      }
    }, 100);
  }

  async recordHit(userId: string, query: string): Promise<void> {
    await this.ensureTables();
    const hash = this.generateHash(query);
    
    this.stats.totalHits++;
    this.updateHitRate();
    
    this.db.getDB().prepare(`
      UPDATE predictive_cache SET hits = hits + 1, lastAccess = ? WHERE hash = ? AND userId = ?
    `).run(Date.now(), hash, userId);
    
    if (await this.isPredictiveQuery(userId, query)) {
      this.stats.predictiveHits++;
    }
  }

  async recordMiss(_userId: string, _query: string): Promise<void> {
    this.stats.totalMisses++;
    this.updateHitRate();
  }

  private async isPredictiveQuery(userId: string, query: string): Promise<boolean> {
    const userHistory = await this.getUserHistory(userId);
    const predictions = await this.predictNextQueries(userId, userHistory.role, userHistory);
    return predictions.some(p => this.normalizeText(p) === this.normalizeText(query));
  }

  private async updateUserHistory(userId: string, query: string): Promise<void> {
    let user = this.userHistoryCache.get(userId);
    
    if (!user) {
      user = {
        id: userId,
        role: 'operateur',
        preferredZones: ['SHARED'],
        frequentQueries: [],
        lastActive: Date.now(),
        queryPatterns: []
      };
    }
    
    const normalized = this.normalizeText(query);
    const existing = user.frequentQueries.find(q => this.normalizeText(q) === normalized);
    
    if (existing) {
      user.frequentQueries = [
        query,
        ...user.frequentQueries.filter(q => this.normalizeText(q) !== normalized)
      ];
    } else {
      user.frequentQueries.unshift(query);
      if (user.frequentQueries.length > 20) {
        user.frequentQueries.pop();
      }
    }
    
    if (user.queryPatterns.length > 0) {
      const lastPattern = user.queryPatterns[0];
      const newPattern: QueryPattern = {
        pattern: `${lastPattern.pattern} → ${query}`,
        frequency: lastPattern.frequency + 1,
        lastUsed: Date.now(),
        category: 'transition'
      };
      user.queryPatterns.unshift(newPattern);
    }
    
    if (user.queryPatterns.length > 50) {
      user.queryPatterns.pop();
    }
    
    user.lastActive = Date.now();
    this.userHistoryCache.set(userId, user);
  }

  private async getUserHistory(userId: string): Promise<UserProfile> {
    if (this.userHistoryCache.has(userId)) {
      return this.userHistoryCache.get(userId)!;
    }
    
    return {
      id: userId,
      role: 'operateur',
      preferredZones: ['SHARED'],
      frequentQueries: [],
      lastActive: Date.now(),
      queryPatterns: []
    };
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private generateHash(query: string): string {
    const normalized = this.normalizeText(query);
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
      hash |= 0;
    }
    return `pc_${Math.abs(hash).toString(36)}`;
  }

  private updateHitRate(): void {
    const total = this.stats.totalHits + this.stats.totalMisses;
    this.stats.hitRate = total > 0 ? this.stats.totalHits / total : 0;
  }

  async invalidate(query: string, userId: string = 'anonymous'): Promise<boolean> {
    await this.ensureTables();
    const hash = this.generateHash(query);
    
    const memoryDeleted = this.memoryCache.delete(hash);
    const result = this.db.getDB().prepare(`
      DELETE FROM predictive_cache WHERE hash = ? AND userId = ?
    `).run(hash, userId);
    
    const deleted = memoryDeleted || result.changes > 0;
    if (deleted) {
      logSuccess(`Cache invalidé pour la requête: "${query.substring(0, 50)}..."`);
    }
    return deleted;
  }

  async clear(userId?: string): Promise<number> {
    await this.ensureTables();
    
    let count: number;
    if (userId) {
      const result = this.db.getDB().prepare(`DELETE FROM predictive_cache WHERE userId = ?`).run(userId);
      count = result.changes;
    } else {
      const result = this.db.getDB().prepare(`DELETE FROM predictive_cache`).run();
      count = result.changes;
    }
    
    this.memoryCache.clear();
    if (userId) {
      this.userHistoryCache.delete(userId);
    } else {
      this.userHistoryCache.clear();
    }
    
    logInfo(`Cache vidé: ${count} entrées supprimées`);
    return count;
  }

  async cleanup(): Promise<number> {
    await this.ensureTables();
    const result = this.db.getDB().prepare(`DELETE FROM predictive_cache WHERE expiresAt < ?`).run(Date.now());
    logInfo(`Nettoyage: ${result.changes} entrées expirées supprimées`);
    return result.changes;
  }

  getStats(): {
    totalHits: number;
    totalMisses: number;
    hitRate: number;
    predictiveHits: number;
    predictiveHitRate: number;
    preloadCount: number;
    avgPreloadLatency: number;
    cacheSize: number;
  } {
    const total = this.stats.totalHits + this.stats.totalMisses;
    return {
      totalHits: this.stats.totalHits,
      totalMisses: this.stats.totalMisses,
      hitRate: Math.round(this.stats.hitRate * 100) / 100,
      predictiveHits: this.stats.predictiveHits,
      predictiveHitRate: total > 0 ? Math.round((this.stats.predictiveHits / total) * 100) / 100 : 0,
      preloadCount: this.stats.preloadCount,
      avgPreloadLatency: Math.round(this.stats.avgPreloadLatency),
      cacheSize: this.memoryCache.size
    };
  }

  resetStats(): void {
    this.stats = {
      totalHits: 0,
      totalMisses: 0,
      predictiveHits: 0,
      preloadCount: 0,
      hitRate: 0,
      avgPreloadLatency: 0
    };
  }
}

export const predictiveCache = new PredictiveCache();
export default predictiveCache;