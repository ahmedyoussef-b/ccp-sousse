// src/cache/llm-cache.ts
/**
 * Cache intelligent pour les réponses LLM
 * @version 1.1.3
 * @description Réduit la consommation API en mettant en cache les réponses fréquentes
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

interface CacheEntry {
  hash: string;
  prompt: string;
  response: string;
  provider: string;
  model: string;
  timestamp: number;
  ttl: number;
  hitCount: number;
  lastAccessed: number;
}


// Interface pour les options (interne, non exportée)
interface LLMCacheOptions {
  maxEntries?: number;
  defaultTTL?: number;
  minConfidenceToCache?: number;
  enabled?: boolean;
  persistToDisk?: boolean;
  persistencePath?: string;
}

const DEFAULT_CACHE_OPTIONS: LLMCacheOptions = {
  maxEntries: 500,
  defaultTTL: 7 * 24 * 60 * 60 * 1000, // 7 jours
  minConfidenceToCache: 0.7,
  enabled: true,
  persistToDisk: true,
  persistencePath: path.join(process.cwd(), 'data', 'cache', 'llm-cache.json')
};

class LLMCache {
  private static instance: LLMCache;
  private cache: Map<string, CacheEntry> = new Map();
  private options: LLMCacheOptions;
  private stats: {
    hits: number;
    misses: number;
  } = { hits: 0, misses: 0 };
  private isInitialized: boolean = false;

  private constructor(options?: LLMCacheOptions) {
    this.options = { ...DEFAULT_CACHE_OPTIONS, ...options };
  }

  static getInstance(options?: LLMCacheOptions): LLMCache {
    if (!LLMCache.instance) {
      LLMCache.instance = new LLMCache(options);
    }
    return LLMCache.instance;
  }

  /**
   * Initialise le cache (charge depuis le disque si persistance activée)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (this.options.persistToDisk) {
      await this.loadFromDisk();
    }

    this.isInitialized = true;
    console.log(`[LLM-CACHE] ✅ Initialisé (max: ${this.options.maxEntries} entrées, TTL: ${(this.options.defaultTTL || 604800000) / 86400000} jours)`);
  }

  /**
   * Génère un hash unique pour une requête
   */
  private generateHash(prompt: string, model: string, provider: string): string {
    const normalizedPrompt = this.normalizePrompt(prompt);
    const content = `${provider}|${model}|${normalizedPrompt}`;
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Normalise le prompt pour améliorer le cache hit
   */
  private normalizePrompt(prompt: string): string {
    return prompt
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  /**
   * Vérifie si une entrée est expirée
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Nettoie les entrées expirées et les moins utilisées
   */
  private async cleanup(): Promise<void> {
    let removedCount = 0;

    // Supprimer les entrées expirées
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    // Si encore trop d'entrées, supprimer les moins utilisées
    if (this.cache.size > (this.options.maxEntries || 500)) {
      const sortedEntries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].hitCount - b[1].hitCount);
      
      const toRemove = this.cache.size - (this.options.maxEntries || 500);
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(sortedEntries[i][0]);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[LLM-CACHE] 🧹 Nettoyage: ${removedCount} entrées supprimées`);
      await this.persist();
    }
  }

  /**
   * Récupère une réponse du cache
   */
  async get(prompt: string, type: string, provider: string): Promise<string | null> {
    if (!this.options.enabled) return null;

    const hash = this.generateHash(prompt, type, provider);
    const entry = this.cache.get(hash);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(hash);
      this.stats.misses++;
      await this.persist();
      return null;
    }

    // Mettre à jour les statistiques d'utilisation
    entry.hitCount++;
    entry.lastAccessed = Date.now();
    this.cache.set(hash, entry);
    this.stats.hits++;

    console.log(`[LLM-CACHE] ✅ Hit (${provider}/${type}) - hitCount: ${entry.hitCount}`);
    return entry.response;
  }

  /**
   * Stocke une réponse dans le cache
   */
  async set(
    prompt: string,
    type: string,
    provider: string,
    response: string,
    confidence?: number,
    customTTL?: number
  ): Promise<void> {
    if (!this.options.enabled) return;

    // Ne pas cacher les réponses de faible confiance
    if (confidence && confidence < (this.options.minConfidenceToCache || 0.7)) {
      console.log(`[LLM-CACHE] ⏭️ Non mis en cache (confiance: ${confidence} < ${this.options.minConfidenceToCache})`);
      return;
    }

    // Ne pas cacher les réponses trop courtes ou erreurs
    if (response.length < 20 || response.includes("Je ne trouve pas")) {
      return;
    }

    const hash = this.generateHash(prompt, type, provider);
    
    // Nettoyer avant d'ajouter
    if (this.cache.size >= (this.options.maxEntries || 500)) {
      await this.cleanup();
    }

    const entry: CacheEntry = {
      hash,
      prompt,
      response,
      provider,
      model: type,
      timestamp: Date.now(),
      ttl: customTTL || (this.options.defaultTTL || 604800000),
      hitCount: 0,
      lastAccessed: Date.now()
    };

    this.cache.set(hash, entry);
    console.log(`[LLM-CACHE] 💾 Mis en cache (${provider}/${type}) - TTL: ${entry.ttl / 86400000} jours`);
    
    await this.persist();
  }

  /**
   * Invalide une entrée spécifique
   */
  async invalidate(prompt: string, type: string, provider: string): Promise<void> {
    const hash = this.generateHash(prompt, type, provider);
    const deleted = this.cache.delete(hash);
    
    if (deleted) {
      console.log(`[LLM-CACHE] 🗑️ Entrée invalidée: ${hash}`);
      await this.persist();
    }
  }

  /**
   * Vide tout le cache
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
    console.log(`[LLM-CACHE] 🧹 Cache vidé`);
    await this.persist();
  }

  /**
   * Persiste le cache sur disque
   */
  private async persist(): Promise<void> {
    if (!this.options.persistToDisk) return;

    try {
      const dir = path.dirname(this.options.persistencePath || 'data/cache/llm-cache.json');
      await fs.mkdir(dir, { recursive: true });
      
      const data = JSON.stringify(Array.from(this.cache.values()));
      await fs.writeFile(this.options.persistencePath || 'data/cache/llm-cache.json', data, 'utf-8');
    } catch (error: any) {
      console.warn(`[LLM-CACHE] ⚠️ Échec persistance: ${error.message}`);
    }
  }

  /**
   * Charge le cache depuis le disque
   */
  private async loadFromDisk(): Promise<void> {
    try {
      const data = await fs.readFile(this.options.persistencePath || 'data/cache/llm-cache.json', 'utf-8');
      const entries: CacheEntry[] = JSON.parse(data);
      
      let loadedCount = 0;
      for (const entry of entries) {
        if (!this.isExpired(entry)) {
          this.cache.set(entry.hash, entry);
          loadedCount++;
        }
      }
      
      console.log(`[LLM-CACHE] 📂 Chargé ${loadedCount} entrées depuis le disque`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn(`[LLM-CACHE] ⚠️ Échec chargement: ${error.message}`);
      }
    }
  }

  /**
   * Récupère les statistiques du cache
   */
  getStats(): {
    totalEntries: number;
    totalHits: number;
    totalMisses: number;
    hitRate: number;
    oldestEntry: number;
    newestEntry: number;
    memoryUsageMB: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalHits = this.stats.hits + entries.reduce((sum, e) => sum + e.hitCount, 0);
    const totalAttempts = this.stats.hits + this.stats.misses;
    
    return {
      totalEntries: this.cache.size,
      totalHits: totalHits,
      totalMisses: this.stats.misses,
      hitRate: totalAttempts > 0 ? totalHits / totalAttempts : 0,
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.timestamp)) : 0,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.timestamp)) : 0,
      memoryUsageMB: Buffer.byteLength(JSON.stringify(entries), 'utf-8') / (1024 * 1024)
    };
  }

  /**
   * Affiche un rapport du cache
   */
  async printReport(): Promise<void> {
    const stats = this.getStats();
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 [LLM-CACHE] RAPPORT D'UTILISATION`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`📦 Entrées: ${stats.totalEntries}/${this.options.maxEntries}`);
    console.log(`🎯 Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
    console.log(`✅ Hits: ${stats.totalHits}`);
    console.log(`❌ Misses: ${stats.totalMisses}`);
    console.log(`💾 Mémoire: ${stats.memoryUsageMB.toFixed(2)} MB`);
    console.log(`${'═'.repeat(60)}\n`);
  }
}

// Export du singleton uniquement
export const llmCache = LLMCache.getInstance();
export default llmCache;