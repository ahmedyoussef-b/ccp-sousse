// src/ai/vector/embeddings.ts
// Version avec auto-détection de dimension
// Dimension détectée automatiquement au démarrage

import type { IEmbeddingFunction } from 'chromadb';

// ============================================
// CONFIGURATION EMBEDDING - AUTO-DÉTECTION
// ============================================

export const EMBEDDING_CONFIG = {
  defaultDimension: 768,
  defaultModel: 'nomic-embed-text',
  dimensionDetected: false,
  strictMode: false,
  supportedDimensions: [384, 512, 768, 1024, 1536, 3072],
  modelDimensions: {
    'nomic-embed-text': 768,
    'all-MiniLM-L6-v2': 384,
    'all-mpnet-base-v2': 768,
    'text-embedding-3-small': 1024,
    'text-embedding-3-large': 3072,
    'bge-small-en': 384,
    'bge-base-en': 768,
    'bge-large-en': 1024
  } as Record<string, number>
};

// ============================================
// FONCTIONS DE GESTION DE DIMENSION
// ============================================

export async function detectEmbeddingDimension(): Promise<number> {
  try {
    const testText = "Test de dimension d'embedding";
    const tempProvider = new OllamaEmbeddingFunction();
    const embeddings = await tempProvider.generate([testText]);
    const dimension = embeddings[0]?.length || 768;
    
    console.log(`[EMBEDDING] 📊 Dimension détectée: ${dimension}`);
    
    EMBEDDING_CONFIG.defaultDimension = dimension;
    EMBEDDING_CONFIG.dimensionDetected = true;
    
    return dimension;
  } catch (error) {
    console.error('[EMBEDDING] ❌ Échec détection dimension:', error);
    return EMBEDDING_CONFIG.defaultDimension;
  }
}

export function validateEmbeddingDimension(dimension: number): boolean {
  if (!EMBEDDING_CONFIG.dimensionDetected) {
    return true;
  }
  
  const isSupported = EMBEDDING_CONFIG.supportedDimensions.includes(dimension);
  
  if (!isSupported) {
    console.error(`[EMBEDDING] ❌ Dimension non supportée: ${dimension}`);
    return false;
  }
  
  const isValid = dimension === EMBEDDING_CONFIG.defaultDimension;
  
  if (!isValid && !EMBEDDING_CONFIG.strictMode) {
    console.warn(`[EMBEDDING] ⚠️ Dimension inattendue: ${dimension} (attendu: ${EMBEDDING_CONFIG.defaultDimension})`);
    console.warn(`[EMBEDDING] 🔄 Mode auto: adaptation à ${dimension}`);
    EMBEDDING_CONFIG.defaultDimension = dimension;
    return true;
  }
  
  return isValid;
}

export function getDimensionForModel(model: string): number {
  return EMBEDDING_CONFIG.modelDimensions[model] || EMBEDDING_CONFIG.defaultDimension;
}

export function areDimensionsCompatible(dim1: number, dim2: number): boolean {
  if (EMBEDDING_CONFIG.strictMode) {
    return dim1 === EMBEDDING_CONFIG.defaultDimension && dim2 === EMBEDDING_CONFIG.defaultDimension;
  }
  return dim1 === dim2;
}

export function getCurrentDimension(): number {
  return EMBEDDING_CONFIG.defaultDimension;
}

export function getDefaultModel(): string {
  return EMBEDDING_CONFIG.defaultModel;
}

export function isDimensionDetected(): boolean {
  return EMBEDDING_CONFIG.dimensionDetected;
}

// ============================================
// IMPLÉMENTATION OLLAMA
// ============================================

export class OllamaEmbeddingFunction implements IEmbeddingFunction {
  private model: string;
  private url: string;
  private headers: Record<string, string>;
  private expectedDimension: number;

  constructor(
    model: string = process.env.EMBEDDING_MODEL || EMBEDDING_CONFIG.defaultModel,
    url: string = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
  ) {
    this.model = model;
    this.url = url;
    this.expectedDimension = getDimensionForModel(model);
    
    this.headers = {
      'Content-Type': 'application/json'
    };
    
    if (this.url.includes('ngrok-free.dev')) {
      this.headers['ngrok-skip-browser-warning'] = 'true';
    }
    
    console.log(`[EMBEDDING] Initialisé: modèle=${this.model}, dimension attendue=${this.expectedDimension}`);
  }

  /**
   * Retourne la dimension actuelle
   */
  getDimension(): number {
    return this.expectedDimension;
  }

  async generate(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  const currentDim = this.expectedDimension;
  
  for (let i = 0; i < texts.length; i++) {
    let text = texts[i] as any; // 🔥 Cast temporaire pour éviter l'erreur TypeScript
    
    // 🔥 Conversion robuste en string (protection contre les objets/buffers)
    if (typeof text !== 'string') {
      if (text && typeof text === 'object') {
        // Vérifier si c'est un Buffer (Node.js)
        if (text.type === 'Buffer' && Array.isArray(text.data)) {
          text = Buffer.from(text.data).toString('utf-8');
        } else if (typeof text.toString === 'function') {
          text = text.toString();
        } else {
          text = text.content || text.text || JSON.stringify(text);
        }
      } else {
        text = String(text || '');
      }
    }
    
    // Vérifier que le texte n'est pas vide
    if (!text || text.trim().length === 0) {
      console.warn(`[EMBEDDING] ⚠️ Texte vide pour l'index ${i}, utilisation d'un vecteur nul`);
      results.push(new Array(currentDim).fill(0));
      continue;
    }
    
    try {
      const response = await fetch(`${this.url}/api/embeddings`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ model: this.model, prompt: text }),
        signal: AbortSignal.timeout(60000) // 🚀 Augmentation du timeout à 60s
      });

      if (!response.ok) {
        throw new Error(`Ollama error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }

      const embedding = data.embedding as number[];
      
      // Vérifier la dimension (auto-adaptatif)
      if (!validateEmbeddingDimension(embedding.length)) {
        console.warn(`[EMBEDDING] ⚠️ Dimension inattendue: ${embedding.length}`);
      }
      
      results.push(embedding);
      
    } catch (error) {
      const textPreview = typeof text === 'string' ? text.substring(0, 50) : String(text || '').substring(0, 50);
      console.error(`[EMBEDDING] ❌ Échec pour le texte: "${textPreview}..."`, error);
      results.push(new Array(currentDim).fill(0));
    }
  }
  
  return results;
}
}
// ============================================
// FACTORY
// ============================================

export function getEmbeddingFunction(): IEmbeddingFunction {
  const provider = process.env.EMBEDDING_PROVIDER || 'ollama';

  switch (provider) {
    case 'ollama':
      return new OllamaEmbeddingFunction();
    default:
      console.warn(`Provider ${provider} non supporté, repli sur Ollama`);
      return new OllamaEmbeddingFunction();
  }
}

// ============================================
// SERVICE D'EMBEDDING
// ============================================

export class EmbeddingService {
  private activeModel: string;
  private provider: IEmbeddingFunction;
  private dimension: number;

  constructor() {
    this.activeModel = process.env.EMBEDDING_MODEL || EMBEDDING_CONFIG.defaultModel;
    this.provider = getEmbeddingFunction();
    this.dimension = getDimensionForModel(this.activeModel);
    
    console.log(`[EMBEDDING-SERVICE] Actif: modèle=${this.activeModel}, dimension=${this.dimension}`);
  }
  
  async generateEmbedding(text: string, model?: string): Promise<number[]> {
    if (model && model !== this.activeModel) {
      const tempProvider = new OllamaEmbeddingFunction(model);
      const results = await tempProvider.generate([text]);
      return results[0];
    }

    const results = await this.provider.generate([text]);
    return results[0];
  }
  
  async batchEmbed(texts: string[], model?: string): Promise<number[][]> {
    if (model && model !== this.activeModel) {
      const tempProvider = new OllamaEmbeddingFunction(model);
      return await tempProvider.generate(texts);
    }
    return await this.provider.generate(texts);
  }
  
  getDimension(): number {
    return this.dimension;
  }
  
  getModel(): string {
    return this.activeModel;
  }
  
  isProductionMode(): boolean {
    return EMBEDDING_CONFIG.strictMode;
  }
  
  async autoDetectDimension(): Promise<number> {
    return detectEmbeddingDimension();
  }
}

export const embeddingService = new EmbeddingService();

// Auto-détection au chargement (côté serveur uniquement)
if (typeof window === 'undefined' && !EMBEDDING_CONFIG.dimensionDetected) {
  detectEmbeddingDimension().then(dim => {
    console.log(`[EMBEDDING] ✅ Auto-configuration: dimension ${dim}`);
  }).catch(err => {
    console.error('[EMBEDDING] ❌ Auto-configuration échouée:', err);
  });
}