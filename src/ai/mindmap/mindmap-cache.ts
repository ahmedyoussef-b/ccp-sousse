// src/ai/mindmap/mindmap-cache.ts
/**
 * Cache centralisé pour les Mind Maps
 * 
 * Évite les requêtes DB redondantes et accélère le RAG.
 * Implémente un pattern Singleton avec TTL (Time-To-Live) par entrée.
 * Supporte l'invalidation sélective par préfixe de clé.
 * 
 * Caractéristiques :
 * - TTL configurable par entrée
 * - Éviction automatique des entrées expirées
 * - Limite de taille configurable (MINDMAP_CACHE_MAX_SIZE, défaut: 1000)
 * - Éviction FIFO quand la capacité maximale est atteinte
 * 
 * @example
 * ```typescript
 * const cache = MindMapCache.getInstance();
 * cache.set('user:123', data, 60000); // TTL 1 minute
 * const cached = cache.get('user:123');
 * cache.invalidate('user:'); // Vide toutes les clés commençant par "user:"
 * ```
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Durée de vie en millisecondes
}

class MindMapCache {
  private cache = new Map<string, CacheEntry<any>>();
  private static instance: MindMapCache;
  private maxSize: number;

  private constructor() {
    this.maxSize = parseInt(process.env.MINDMAP_CACHE_MAX_SIZE || '1000', 10);
  }

  /**
   * Retourne l'instance unique du cache (pattern Singleton)
   */
  static getInstance(): MindMapCache {
    if (!MindMapCache.instance) {
      MindMapCache.instance = new MindMapCache();
    }
    return MindMapCache.instance;
  }

  /**
   * Stocke une valeur dans le cache avec une durée de vie.
   * Si le cache dépasse la taille maximale, les entrées expirées sont supprimées
   * puis l'entrée la plus ancienne est évincée si nécessaire.
   * 
   * @param key - Clé unique d'identification
   * @param data - Données à mettre en cache
   * @param ttlMs - Durée de vie en millisecondes (défaut: 60000 = 1 minute)
   */
  set<T>(key: string, data: T, ttlMs = 60000): void {
    // Si la clé existe déjà, on met à jour sans vérifier la taille
    if (this.cache.has(key)) {
      this.cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
      return;
    }

    // Éviction des entrées expirées avant d'ajouter
    this.evictExpired();

    // Si toujours plein après éviction, supprimer la plus ancienne
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
  }

  /**
   * Récupère une valeur du cache si elle existe et n'a pas expiré
   * @param key - Clé de l'entrée à récupérer
   * @returns La valeur cachée ou null si absente/expirée
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  /**
   * Invalide les entrées du cache
   * @param prefix - Si fourni, seules les clés commençant par ce préfixe sont supprimées.
   *                 Si absent, tout le cache est vidé.
   */
  invalidate(prefix?: string): void {
    if (!prefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  /**
   * Supprime toutes les entrées expirées du cache
   */
  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Supprime l'entrée la plus ancienne du cache (FIFO)
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Retourne le nombre d'entrées actuellement dans le cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Retourne la capacité maximale configurée du cache
   */
  get maxCapacity(): number {
    return this.maxSize;
  }
}

export const mindMapCache = MindMapCache.getInstance();
export default mindMapCache;