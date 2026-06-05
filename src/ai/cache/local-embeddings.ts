// src/ai/cache/local-embeddings.ts
import { pipeline } from '@xenova/transformers';

/**
 * Service d'embedding local optimisé CPU
 * Utilise all-MiniLM-L6-v2 (quantifié 8-bit) pour une latence < 30ms
 */
export class LocalEmbeddingService {
  private static instance: LocalEmbeddingService;
  private extractor: any = null;
  private modelName = 'Xenova/all-MiniLM-L6-v2';

  private constructor() {}

  public static getInstance(): LocalEmbeddingService {
    if (!LocalEmbeddingService.instance) {
      LocalEmbeddingService.instance = new LocalEmbeddingService();
    }
    return LocalEmbeddingService.instance;
  }

  /**
   * Initialise le pipeline au démarrage
   */
  public async initialize() {
    if (this.extractor) return;
    
    console.log(`[LOCAL-EMBEDDING] 🚀 Chargement du modèle ${this.modelName}...`);
    try {
      this.extractor = await pipeline('feature-extraction', this.modelName, {
        quantized: true,
      });
      console.log(`[LOCAL-EMBEDDING] ✅ Modèle chargé et prêt.`);
    } catch (error) {
      console.error(`[LOCAL-EMBEDDING] ❌ Échec chargement modèle:`, error);
      throw error;
    }
  }

  /**
   * Génère un embedding pour un texte donné
   */
  public async generate(text: string): Promise<number[]> {
    await this.initialize();
    
    const startTime = Date.now();
    const output = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });
    
    const embedding = Array.from(output.data) as number[];
    const duration = Date.now() - startTime;
    
    console.log(`[LOCAL-EMBEDDING] Embedding généré en ${duration}ms (Dim: ${embedding.length})`);
    return embedding;
  }
}

export const localEmbeddingService = LocalEmbeddingService.getInstance();