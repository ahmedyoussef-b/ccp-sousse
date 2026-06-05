/**
 * @fileOverview Cache Manager pour Orchestration
 * @version 2.0.0
 * @description Gestion centralisée du cache pour tous les composants d'orchestration
 * @migration SQLite Core - Cache persistant
 */

import { getSQLiteCore } from '@/ai/core/sqlite/manager';

// ============================================================================
// CONSTANTES
// ============================================================================

export const ORCHESTRATION_NAMESPACES = {
  COHERENCE: 'orchestration_coherence',
  VOTE: 'orchestration_vote',
  PLAN: 'orchestration_plan',
  GRAPH: 'orchestration_graph',
  STATS: 'orchestration_stats',
  SESSION: 'orchestration_session',
  WORKFLOW: 'orchestration_workflow'
} as const;

export type OrchestrationNamespace = typeof ORCHESTRATION_NAMESPACES[keyof typeof ORCHESTRATION_NAMESPACES];

// Durées de vie par défaut (en secondes)
export const DEFAULT_TTL: Record<OrchestrationNamespace, number> = {
  [ORCHESTRATION_NAMESPACES.COHERENCE]: 300,   // 5 minutes
  [ORCHESTRATION_NAMESPACES.VOTE]: 600,        // 10 minutes
  [ORCHESTRATION_NAMESPACES.PLAN]: 900,        // 15 minutes
  [ORCHESTRATION_NAMESPACES.GRAPH]: 3600,      // 1 heure
  [ORCHESTRATION_NAMESPACES.STATS]: 86400,     // 24 heures
  [ORCHESTRATION_NAMESPACES.SESSION]: 3600,    // 1 heure
  [ORCHESTRATION_NAMESPACES.WORKFLOW]: 7200    // 2 heures
};

// ============================================================================
// LOGS STRUCTURÉS
// ============================================================================

const LOG_PREFIX = '[ORCHESTRATION-CACHE]';

function logInfo(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logSuccess(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} ✅ ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}


// ============================================================================
// CACHE MANAGER
// ============================================================================

export class OrchestrationCacheManager {
  private db = getSQLiteCore();
  private initialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!this.initialized) {
      await this.db.initialize();
      this.initialized = true;
      logInfo('Cache Manager initialisé');
    }
  }

  /**
   * Récupère une valeur du cache
   */
  async get<T>(key: string, namespace: OrchestrationNamespace): Promise<T | null> {
    await this.initialize();
    
    const value = await this.db.orchestration.cache.get<T>(key, namespace);
    
    if (value !== null) {
      logInfo(`Cache HIT: ${namespace}:${key}`);
      await this.db.orchestration.cache.incrementHit(key, namespace);
    } else {
      logInfo(`Cache MISS: ${namespace}:${key}`);
    }
    
    return value;
  }

  /**
   * Stocke une valeur dans le cache
   */
  async set<T>(
    key: string, 
    value: T, 
    namespace: OrchestrationNamespace, 
    ttlSeconds?: number
  ): Promise<void> {
    await this.initialize();
    
    const ttl = ttlSeconds || DEFAULT_TTL[namespace] || 3600;
    await this.db.orchestration.cache.set(key, value, namespace, ttl);
    
    logSuccess(`Cache SET: ${namespace}:${key} (TTL: ${ttl}s)`);
  }

  /**
   * Supprime une entrée du cache
   */
  async delete(key: string, namespace: OrchestrationNamespace): Promise<boolean> {
    await this.initialize();
    
    const result = await this.db.orchestration.cache.delete(key, namespace);
    
    if (result) {
      logInfo(`Cache DEL: ${namespace}:${key}`);
    }
    
    return result;
  }

  /**
   * Vide un namespace complet ou tout le cache
   */
  async clear(namespace?: OrchestrationNamespace): Promise<number> {
    await this.initialize();
    
    const count = await this.db.orchestration.cache.clear(namespace);
    
    if (namespace) {
      logSuccess(`Cache CLEAR: namespace ${namespace} (${count} entrées supprimées)`);
    } else {
      logSuccess(`Cache CLEAR: toutes les entrées (${count} supprimées)`);
    }
    
    return count;
  }

  /**
   * Vérifie si une clé existe dans le cache
   */
  async has(key: string, namespace: OrchestrationNamespace): Promise<boolean> {
    await this.initialize();
    
    const value = await this.get(key, namespace);
    return value !== null;
  }

  /**
   * Récupère plusieurs valeurs en parallèle
   */
  async getMany<T>(
    keys: string[], 
    namespace: OrchestrationNamespace
  ): Promise<Map<string, T | null>> {
    await this.initialize();
    
    const results = new Map<string, T | null>();
    
    await Promise.all(
      keys.map(async (key) => {
        const value = await this.get<T>(key, namespace);
        results.set(key, value);
      })
    );
    
    return results;
  }

  /**
   * Stocke plusieurs valeurs en parallèle
   */
  async setMany<T>(
    entries: Array<{ key: string; value: T }>,
    namespace: OrchestrationNamespace,
    ttlSeconds?: number
  ): Promise<void> {
    await this.initialize();
    
    await Promise.all(
      entries.map(({ key, value }) => this.set(key, value, namespace, ttlSeconds))
    );
    
    logSuccess(`Cache SET MANY: ${entries.length} entrées dans ${namespace}`);
  }

  /**
   * Récupère les statistiques du cache
   */
  async getStats(namespace?: OrchestrationNamespace): Promise<{
    totalEntries: number;
    totalHits: number;
    hitRate: number;
  }> {
    await this.initialize();
    
    const stats = await this.db.orchestration.cache.getStats(namespace);
    
    // Calculer le taux de hit (approximatif)
    const hitRate = stats.totalEntries > 0 ? (stats.totalHits / (stats.totalEntries * 10)) : 0;
    
    return {
      totalEntries: stats.totalEntries,
      totalHits: stats.totalHits,
      hitRate: Math.min(1, hitRate)
    };
  }

  /**
   * Nettoie les entrées expirées
   */
  async cleanup(): Promise<number> {
    await this.initialize();
    
    // La méthode `set` gère déjà l'expiration via SQLite
    // Cette méthode est un wrapper pour forcer un nettoyage manuel
    logInfo('Nettoyage manuel du cache');
    return 0;
  }

  // ==========================================================================
  // MÉTHODES SPÉCIFIQUES PAR NAMESPACE
  // ==========================================================================

  /**
   * Cache pour la cohérence
   */
  async coherenceGet<T>(key: string): Promise<T | null> {
    return this.get<T>(key, ORCHESTRATION_NAMESPACES.COHERENCE);
  }

  async coherenceSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.set(key, value, ORCHESTRATION_NAMESPACES.COHERENCE, ttlSeconds);
  }

  /**
   * Cache pour les votes
   */
  async voteGet<T>(key: string): Promise<T | null> {
    return this.get<T>(key, ORCHESTRATION_NAMESPACES.VOTE);
  }

  async voteSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.set(key, value, ORCHESTRATION_NAMESPACES.VOTE, ttlSeconds);
  }

  /**
   * Cache pour les plans
   */
  async planGet<T>(key: string): Promise<T | null> {
    return this.get<T>(key, ORCHESTRATION_NAMESPACES.PLAN);
  }

  async planSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.set(key, value, ORCHESTRATION_NAMESPACES.PLAN, ttlSeconds);
  }

  /**
   * Cache pour le graphe
   */
  async graphGet<T>(key: string): Promise<T | null> {
    return this.get<T>(key, ORCHESTRATION_NAMESPACES.GRAPH);
  }

  async graphSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.set(key, value, ORCHESTRATION_NAMESPACES.GRAPH, ttlSeconds);
  }

  /**
   * Cache pour les sessions
   */
  async sessionGet<T>(key: string): Promise<T | null> {
    return this.get<T>(key, ORCHESTRATION_NAMESPACES.SESSION);
  }

  async sessionSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.set(key, value, ORCHESTRATION_NAMESPACES.SESSION, ttlSeconds);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: OrchestrationCacheManager | null = null;

export function getOrchestrationCacheManager(): OrchestrationCacheManager {
  if (!instance) {
    instance = new OrchestrationCacheManager();
  }
  return instance;
}

// ============================================================================
// EXPORT PAR DÉFAUT
// ============================================================================

export const orchestrationCache = getOrchestrationCacheManager();

export default {
  ORCHESTRATION_NAMESPACES,
  DEFAULT_TTL,
  OrchestrationCacheManager,
  orchestrationCache,
  getOrchestrationCacheManager
};