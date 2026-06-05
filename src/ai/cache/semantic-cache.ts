// src/lib/ai/cache/semantic-cache.ts
import { localEmbeddingService } from './local-embeddings';
import { compressionEngine } from './compression-engine';
import { SQLiteCore } from '@/ai/core/sqlite/manager';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service de Cache Sémantique avec DragonMemory (Innovation 3)
 * Permet des réponses instantanées pour des requêtes similaires.
 */
export class SemanticCacheService {
  private static instance: SemanticCacheService;
  private sqlite = SQLiteCore.getInstance();
  private SIMILARITY_THRESHOLD = 0.92; // Seuil pour match sémantique

  private constructor() {}

  public static getInstance(): SemanticCacheService {
    if (!SemanticCacheService.instance) {
      SemanticCacheService.instance = new SemanticCacheService();
    }
    return SemanticCacheService.instance;
  }

  /**
   * Recherche une réponse dans le cache sémantique
   */
  public async find(query: string): Promise<string | null> {
    try {
      const startTime = Date.now();
      
      // 1. Générer l'embedding local (rapide < 30ms)
      const embedding = await localEmbeddingService.generate(query);
      
      // 2. Compresser via DragonMemory (Autoencodeur)
      const compressed = await compressionEngine.compress(embedding);
      
      // 3. Récupérer tous les éléments du cache (en mémoire pour recherche vectorielle simple)
      // Note: Pour une échelle industrielle, on utiliserait un index HNSW ou SQLite VSS
      const allEntries = this.sqlite.semanticCache.getAll();
      
      let bestMatch: { id: string, score: number } | null = null;
      
      for (const entry of allEntries) {
        // Déconvertir le Buffer en array de nombres
        const cachedCompressed = Array.from(new Float32Array(entry.embedding_compressed.buffer));
        const score = this.cosineSimilarity(compressed, cachedCompressed);
        
        if (score > this.SIMILARITY_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { id: entry.id, score };
        }
      }

      if (bestMatch) {
        const cached = this.sqlite.semanticCache.get(bestMatch.id);
        this.sqlite.semanticCache.updateUsage(bestMatch.id);
        
        const duration = Date.now() - startTime;
        console.log(`[SEMANTIC-CACHE] ✅ Hit! Score: ${bestMatch.score.toFixed(4)} - Durée: ${duration}ms`);
        return cached.response;
      }

      return null;
    } catch (error) {
      console.error('[SEMANTIC-CACHE] ❌ Erreur recherche:', error);
      return null;
    }
  }

  /**
   * Enregistre une réponse dans le cache
   */
  public async save(query: string, response: string, metadata: any = {}) {
    try {
      const embedding = await localEmbeddingService.generate(query);
      const compressed = await compressionEngine.compress(embedding);
      
      // Conversion en Buffer (Float32Array pour préserver la précision)
      const buffer = Buffer.from(new Float32Array(compressed).buffer);
      
      this.sqlite.semanticCache.set({
        id: uuidv4(),
        query,
        embedding_compressed: buffer,
        response,
        metadata
      });
      
      console.log(`[SEMANTIC-CACHE] 💾 Nouvelle entrée enregistrée pour: "${query.substring(0, 30)}..."`);
    } catch (error) {
      console.error('[SEMANTIC-CACHE] ❌ Erreur sauvegarde:', error);
    }
  }

  /**
   * Récupère une réponse du cache ou l'exécute via la fonction de calcul fournie
   */
  public async getOrCompute(query: string, compute: () => Promise<string>, metadata: any = {}): Promise<string> {
    const cached = await this.find(query);
    if (cached) return cached;

    const result = await compute();
    
    // On ne cache que les réponses de qualité (longueur minimale)
    if (result.length > 50) {
      await this.save(query, result, metadata);
    }
    
    return result;
  }

  /**
   * Calcule la similarité cosinus entre deux vecteurs
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
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

  /**
   * Vide le cache
   */
  public async clear(): Promise<void> {
    this.sqlite.getDB().prepare(`DELETE FROM semantic_cache`).run();
    console.log('[SEMANTIC-CACHE] 🧹 Cache vidé');
  }

  /**
   * Retourne les statistiques du cache
   */
  public getStats() {
    const total = this.sqlite.getDB().prepare(`SELECT COUNT(*) as count FROM semantic_cache`).get() as { count: number };
    const hits = this.sqlite.getDB().prepare(`SELECT SUM(usage_count) as hits FROM semantic_cache`).get() as { hits: number | null };
    
    return {
      size: total.count,
      hits: hits.hits || 0,
      engine: 'DragonMemory (Autoencoder)',
      compressionRatio: '6.0x'
    };
  }

  /**
   * Invalide une entrée du cache sémantique
   */
  public async invalidate(query: string): Promise<boolean> {
    try {
      const deleted = (this.sqlite.semanticCache as any).deleteByQuery(query);
      if (deleted) {
        console.log(`[SEMANTIC-CACHE] 🗑️ Entrée invalidée pour: "${query.substring(0, 50)}..."`);
      }
      return deleted;
    } catch (error) {
      console.error('[SEMANTIC-CACHE] ❌ Erreur invalidation:', error);
      return false;
    }
  }
}

export const semanticCacheService = SemanticCacheService.getInstance();
