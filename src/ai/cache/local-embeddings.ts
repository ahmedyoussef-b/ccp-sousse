// src/ai/cache/local-embeddings.ts
import { pipeline } from '@xenova/transformers';

// Vérifier si les embeddings doivent être désactivés
const isEmbeddingsDisabled = (): boolean => {
  // Désactiver sur Vercel (les modèles sont trop lourds pour serverless)
  if (process.env.VERCEL === '1') return true;
  if (process.env.DISABLE_EMBEDDINGS === 'true') return true;
  if (process.env.NEXT_PUBLIC_DISABLE_EMBEDDINGS === 'true') return true;
  // Désactiver si on est en mode cloud (API externe)
  if (process.env.APP_MODE === 'cloud') return true;
  return false;
};

/**
 * Service d'embedding local optimisé CPU
 * Utilise all-MiniLM-L6-v2 (quantifié 8-bit) pour une latence < 30ms
 * 
 * ⚠️ Désactivé sur Vercel car trop lourd pour l'environnement serverless
 */
export class LocalEmbeddingService {
  private static instance: LocalEmbeddingService;
  private extractor: any = null;
  private modelName = 'Xenova/all-MiniLM-L6-v2';
  private enabled: boolean = true;

  private constructor() {
    // Vérifier si le service doit être désactivé
    if (isEmbeddingsDisabled()) {
      console.log('[LOCAL-EMBEDDING] ⚠️ Service désactivé sur Vercel');
      console.log('[LOCAL-EMBEDDING] 💡 Utilisation du fallback (simulated embeddings)');
      this.enabled = false;
    }
  }

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
    if (!this.enabled) return;
    if (this.extractor) return;
    
    console.log(`[LOCAL-EMBEDDING] 🚀 Chargement du modèle ${this.modelName}...`);
    try {
      this.extractor = await pipeline('feature-extraction', this.modelName, {
        quantized: true,
      });
      console.log(`[LOCAL-EMBEDDING] ✅ Modèle chargé et prêt.`);
    } catch (error) {
      console.error(`[LOCAL-EMBEDDING] ❌ Échec chargement modèle:`, error);
      this.enabled = false;
      throw error;
    }
  }

  /**
   * Génère un embedding pour un texte donné
   * Retourne un embedding simulé si désactivé (vecteur aléatoire)
   */
  public async generate(text: string): Promise<number[]> {
    // Si désactivé, retourner un embedding simulé (vecteur nul/dimension standard)
    if (!this.enabled) {
      // Simuler un embedding de dimension 768 (standard)
      // Utiliser un hash simple basé sur le texte pour avoir cohérence
      const hash = this.simpleHash(text);
      const embedding = new Array(768).fill(0);
      // Remplir avec des valeurs pseudo-aléatoires basées sur le hash
      for (let i = 0; i < 768; i++) {
        embedding[i] = (Math.sin(hash * (i + 1)) + 1) / 2; // Valeur entre 0 et 1
      }
      console.log(`[LOCAL-EMBEDDING] 🔄 Embedding simulé (désactivé) - Dim: 768`);
      return embedding;
    }
    
    await this.initialize();
    
    const startTime = Date.now();
    const output = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });
    
    const embedding = Array.from(output.data) as number[];
    const duration = Date.now() - startTime;
    
    console.log(`[LOCAL-EMBEDDING] ✅ Embedding généré en ${duration}ms (Dim: ${embedding.length})`);
    return embedding;
  }

  /**
   * Hash simple pour générer des embeddings cohérents en mode désactivé
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Vérifie si le service est actif
   */
  public isEnabled(): boolean {
    return this.enabled;
  }
}

export const localEmbeddingService = LocalEmbeddingService.getInstance();