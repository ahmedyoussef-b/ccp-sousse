// src/ai/semantic-cache.ts - VERSION CORRIGÉE
// + seuil dynamique (95% pour requêtes longues) + logs détaillés

export interface CacheEntry {
  embedding: number[];
  response: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface CacheStats {
  size: number;
  oldestEntry: number;
  newestEntry: number;
  hitRate?: number;
  hits?: number;
  misses?: number;
}

export class SemanticCache {
  static cache: any;
  static get(_get: any) {
    throw new Error('Method not implemented.');
  }
  static set(_set: any) {
    throw new Error('Method not implemented.');
  }
  private cache: Map<string, CacheEntry> = new Map();
  private similarityThreshold = 0.85;
  private maxCacheSize = 1000;
  private timer: NodeJS.Timeout | null = null;
  private hits = 0;
  private misses = 0;
  private ollamaUrl: string;
  private embeddingModel: string;

  constructor(options?: {
    similarityThreshold?: number;
    maxCacheSize?: number;
    ttl?: number;
  }) {
    if (options?.similarityThreshold) {
      this.similarityThreshold = options.similarityThreshold;
    }
    if (options?.maxCacheSize) {
      this.maxCacheSize = options.maxCacheSize;
    }

    this.ollamaUrl = process.env.OLLAMA_URL || 'https://ilse-counterpaned-disruptively.ngrok-free.dev';
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'nomic-embed-text';

    console.log(`[CACHE] Initialisé avec Ollama: ${this.ollamaUrl}, modèle embedding: ${this.embeddingModel}`);

    if (typeof setInterval !== 'undefined') {
      this.timer = setInterval(() => this.cleanCache(), 60 * 60 * 1000);
      if (this.timer && typeof this.timer.unref === 'function') {
        this.timer.unref();
      }
    }
  }

  async getOrCompute(
    text: string,
    computeFn: () => Promise<string>
  ): Promise<string> {
    const startTime = Date.now();
    const isLongQuery = text.length > 30;
    const effectiveThreshold = isLongQuery ? 0.95 : this.similarityThreshold;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💾 SECTION 3.5 – Cache Sémantique');
    console.log('📝 Question :', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
    console.log('🎯 Seuil de similarité :', (effectiveThreshold * 100) + '%');

    try {
      const embeddingStart = Date.now();
      const embedding = await this.getEmbedding(text);
      const embeddingTime = Date.now() - embeddingStart;

      const searchStart = Date.now();
      const similar = await this.findSimilar(embedding);
      const searchTime = Date.now() - searchStart;

      if (similar && similar.similarity > effectiveThreshold) {
        const entry = this.cache.get(similar.id);
        if (entry) {
          entry.timestamp = Date.now();
        }
        this.hits++;
        const totalTime = Date.now() - startTime;

        console.log('✅ RÉSULTAT : HIT – Réponse trouvée dans le cache');
        console.log('📊 Similarité :', (similar.similarity * 100).toFixed(1) + '%');
        console.log('🔑 ID de l\'entrée :', similar.id);
        console.log('⏱️ Temps embedding :', embeddingTime + 'ms');
        console.log('⏱️ Temps recherche :', searchTime + 'ms');
        console.log('⏱️ Temps total :', totalTime + 'ms');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return similar.response;
      }

      this.misses++;

      console.log('❌ RÉSULTAT : MISS – Poursuite du pipeline');
      if (similar) {
        console.log('📊 Meilleure similarité :', (similar.similarity * 100).toFixed(1) + '% (sous le seuil)');
      } else {
        console.log('📊 Aucune entrée similaire trouvée');
      }
      console.log('⏱️ Temps embedding :', embeddingTime + 'ms');
      console.log('⏱️ Temps recherche :', searchTime + 'ms');
      console.log('🔄 Poursuite vers le RAG...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      const computeStart = Date.now();
      const response = await computeFn();
      const computeTime = Date.now() - computeStart;

      const storeStart = Date.now();
      await this.store(text, embedding, response);
      const storeTime = Date.now() - storeStart;

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('💾 SECTION 3.5 – Cache Sémantique (Stockage)');
      console.log('✅ Réponse stockée dans le cache');
      console.log('⏱️ Temps calcul RAG :', computeTime + 'ms');
      console.log('⏱️ Temps stockage :', storeTime + 'ms');
      console.log('📊 Taille du cache :', this.cache.size, '/', this.maxCacheSize);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return response;
    } catch (error) {
      console.error('❌ Erreur cache:', error);
      console.log('[CACHE] ⚠️ Fallback – Calcul direct sans cache');
      return computeFn();
    }
  }

  private async getEmbedding(text: string): Promise<number[]> {
    if (process.env.NODE_ENV === 'test') {
      return this.generateStableEmbedding(text);
    }

    try {
      const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: text
        }),
        signal: AbortSignal.timeout(60000)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid embedding response format');
      }

      return data.embedding;

    } catch (error: any) {
      console.error('[CACHE] Erreur embedding:', error.message);
      return this.generateStableEmbedding(text);
    }
  }

  private generateStableEmbedding(text: string): number[] {
    const hash = this.simpleHash(text);
    const embedding = Array(384).fill(0);
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = Math.sin(hash + i) * 0.5 + 0.5;
    }
    return embedding;
  }

  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  private async findSimilar(
    queryEmbedding: number[]
  ): Promise<{ id: string; response: string; similarity: number } | null> {
    let bestMatch = null;
    let highestSimilarity = 0;

    const entries = Array.from(this.cache.entries());
    for (const [id, entry] of entries) {
      const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = {
          id,
          response: entry.response,
          similarity
        };
      }
    }
    return bestMatch;
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
      return 0;
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private async store(text: string, embedding: number[], response: string): Promise<void> {
    const id = this.generateId(text);
    this.cache.set(id, {
      embedding,
      response,
      timestamp: Date.now()
    });
    if (this.cache.size > this.maxCacheSize) {
      this.pruneCache();
    }
  }

  private generateId(text: string): string {
    return `cache_${this.simpleHash(text).toString(36)}`;
  }

  private cleanCache(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;
    let cleaned = 0;
    const entriesClean = Array.from(this.cache.entries());
    for (const [id, entry] of entriesClean) {
      if (now - entry.timestamp > maxAge) {
        this.cache.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[CACHE] 🧹 Nettoyage: ${cleaned} entrées expirées, ${this.cache.size} restantes`);
    }
  }

  private pruneCache(): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(0, entries.length - this.maxCacheSize);
    for (const [id] of toDelete) {
      this.cache.delete(id);
    }
    if (toDelete.length > 0) {
      console.log(`[CACHE] 📦 Pruning: ${toDelete.length} entrées supprimées (taille max atteinte)`);
    }
  }

  getStats(): CacheStats {
    let oldest = Date.now();
    let newest = 0;
    const values = Array.from(this.cache.values());
    for (const entry of values) {
      oldest = Math.min(oldest, entry.timestamp);
      newest = Math.max(newest, entry.timestamp);
    }
    const totalQueries = this.hits + this.misses;
    const hitRate = totalQueries > 0 ? this.hits / totalQueries : 0;
    return {
      size: this.cache.size,
      oldestEntry: oldest,
      newestEntry: newest,
      hits: this.hits,
      misses: this.misses,
      hitRate
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    console.log('[CACHE] Statistiques réinitialisées');
  }

  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.resetStats();
    console.log(`[CACHE] 🧹 Vidé (${size} entrées supprimées)`);
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  get(key: string): CacheEntry | undefined {
    return this.cache.get(key);
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`[CACHE] 🗑️ Entrée supprimée: ${key}`);
    }
    return deleted;
  }
}

export default SemanticCache;