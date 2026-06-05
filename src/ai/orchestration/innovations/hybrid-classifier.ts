/**
 * @fileOverview HybridClassifier - Classification hybride des requêtes
 * @version 1.0.0
 * @description Combine règles métier + embeddings + LLM pour une classification précise
 * @innovation 1/7
 */

// ============================================================================
// TYPES
// ============================================================================

export type QueryCategory = 
  | 'PROFILE_RH'           // Type 1: Profil, congés, qui est
  | 'PROCEDURE'            // Type 2: Démarrage, arrêt, étapes, manoeuvres
  | 'IMAGE_DIRECT'         // Type 3a: Affiche l'image
  | 'IMAGE_DESCRIBE'       // Type 3b: Décrit l'image
  | 'IMAGE_INFO'           // Type 3c: Infos + proposition image
  | 'GENERAL'              // Type 4: Autres

export type ExpectedResponseType = 'list' | 'step' | 'definition' | 'detail';

export interface ClassifiedQuery {
  original: string;
  category: QueryCategory;
  entity: string;           // Entité extraite (ex: "Ahmed Abbès", "TG1")
  subIntent?: string;       // Sous-intention (ex: "congé", "démarrage", "arrêt")
  expectedType: ExpectedResponseType;
  confidence: number;
  processingTime?: number;
  method?: 'rule' | 'embedding' | 'llm';
}

export interface ClassificationExample {
  text: string;
  category: QueryCategory;
  entity?: string;
  subIntent?: string;
  expectedType: ExpectedResponseType;
  embedding?: number[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIDENCE_THRESHOLDS = {
  RULE: 0.9,
  EMBEDDING: 0.7,
  LLM: 0.6
};

// Règles de classification (rapides)
const RULE_PATTERNS: Record<QueryCategory, {
  keywords: string[];
  patterns: RegExp[];
  extractEntity: (query: string) => string;
  extractSubIntent: (query: string) => string | undefined;
  getExpectedType: (query: string) => ExpectedResponseType;
}> = {
  PROFILE_RH: {
    keywords: ['profil', 'profile', 'qui est', 'état', 'congé', 'absence', 'coordonnées', 'email', 'téléphone', 'compétence', 'expérience', 'parcours', 'cv', 'employé', 'salarié', 'agent', 'personnel', 'collaborateur', 'ahmed', 'abbès', 'abbes', 'rh', 'ressource humaine'],
    patterns: [
      /(?:donne|affiche|montre|cherche|trouve)\s+(?:le\s+)?(?:profil|profile|cv|dossier)\s+(?:de\s+)?([A-Za-zÀ-ÿ\s]+)/i,
      /qui\s+est\s+([A-Za-zÀ-ÿ\s]+)/i,
      /état\s+(?:de\s+)?congé\s+(?:de\s+)?([A-Za-zÀ-ÿ\s]+)/i,
      /présente?\s+(?:le\s+)?(?:congé|absence)\s+(?:de\s+)?([A-Za-zÀ-ÿ\s]+)/i,
      /(?:profil|profile|cv|dossier)\s+(?:de\s+)?([A-Za-zÀ-ÿ\s]+)/i
    ],
    extractEntity: (query) => {
      const patterns = [
        /(?:profil de|profile de|cv de|dossier de|qui est|congé de|absence de|état de)\s+([A-Za-zÀ-ÿ\s]{2,})/i,
        /(?:de\s+)?([A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]{2,})/i
      ];
      for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match) return match[1].trim();
      }
      return 'personne';
    },
    extractSubIntent: (query) => {
      if (query.includes('congé') || query.includes('absence')) return 'congé';
      if (query.includes('compétence') || query.includes('expérience')) return 'compétences';
      if (query.includes('coordonnées') || query.includes('email')) return 'coordonnées';
      return 'profil';
    },
    getExpectedType: () => 'detail'
  },

  PROCEDURE: {
    keywords: ['procédure', 'démarrage', 'arrêt', 'étape', 'manoeuvre', 'mise en marche', 'mise à l\'arrêt', 'stop', 'start', 'manipulation', 'commande'],
    patterns: [
      /(?:procédure|étapes|manoeuvres)\s+(?:de\s+)?(démarrage|arrêt|mise en marche|mise à l'arrêt|start|stop)\s+(?:de\s+)?([A-Z0-9_]+)/i,
      /(?:démarrage|arrêt|start|stop)\s+(?:de\s+)?([A-Z0-9_]+)/i,
      /comment\s+(?:démarrer|arrêter)\s+([A-Z0-9_]+)/i,
      /quelles?\s+sont\s+(?:les\s+)?étapes\s+(?:de\s+)?(démarrage|arrêt)\s+(?:de\s+)?([A-Z0-9_]+)/i
    ],
    extractEntity: (query) => {
      const patterns = [
        /(?:de\s+)?([A-Z0-9_]{2,}(?:\s+[A-Za-z]+)?)(?:\s|$)/i,
        /(?:démarrer|arrêter)\s+([A-Z0-9_]+)/i
      ];
      for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match && match[1] && !match[1].match(/démarrage|arrêt|procédure|étapes/i)) {
          return match[1].trim().toUpperCase();
        }
      }
      return 'équipement';
    },
    extractSubIntent: (query) => {
      if (query.includes('démarrage') || query.includes('mise en marche') || query.includes('start')) return 'démarrage';
      if (query.includes('arrêt') || query.includes('mise à l\'arrêt') || query.includes('stop')) return 'arrêt';
      return 'procédure';
    },
    getExpectedType: (query) => {
      if (query.includes('liste') || query.includes('quelles')) return 'list';
      if (query.includes('étape')) return 'step';
      return 'list';
    }
  },

  IMAGE_DIRECT: {
    keywords: ['affiche', 'montre', 'voir', 'visualise'],
    patterns: [
      /(?:affiche|montre|voir)\s+(?:l'|la|les?\s+)?image\s+(?:de\s+)?([A-Za-z0-9_]+)/i,
      /image\s+(?:de\s+)?([A-Za-z0-9_]+)/i,
      /(?:photo|schéma)\s+(?:de\s+)?([A-Za-z0-9_]+)/i
    ],
    extractEntity: (query) => {
      const match = query.match(/image\s+(?:de\s+)?([A-Za-z0-9_]+)/i);
      return match ? match[1].trim() : 'image';
    },
    extractSubIntent: () => undefined,
    getExpectedType: () => 'detail'
  },

  IMAGE_DESCRIBE: {
    keywords: ['décrit', 'description', 'décris', 'explique', 'analyse'],
    patterns: [
      /(?:décrit|décris|description|analyse)\s+(?:de\s+)?(?:l'|la\s+)?image\s+(?:de\s+)?([A-Za-z0-9_]+)/i,
      /(?:décris|décrit)-moi\s+(?:l'|la\s+)?image\s+(?:de\s+)?([A-Za-z0-9_]+)/i
    ],
    extractEntity: (query) => {
      const match = query.match(/image\s+(?:de\s+)?([A-Za-z0-9_]+)/i);
      return match ? match[1].trim() : 'image';
    },
    extractSubIntent: () => 'description',
    getExpectedType: () => 'detail'
  },

  IMAGE_INFO: {
    keywords: ['informations', 'info', 'renseignement', 'documentation'],
    patterns: [
      /(?:donne|info|informations|documentation)\s+(?:des?\s+)?(?:sur\s+)?([A-Za-z0-9_]+)/i,
      /qu(?:'est-ce|oi)\s+(?:qu'|que)?\s*([A-Za-z0-9_]+)/i
    ],
    extractEntity: (query) => {
      const patterns = [
        /sur\s+([A-Za-z0-9_]+)/i,
        /informations?\s+(?:sur\s+)?([A-Za-z0-9_]+)/i,
        /qu'est-ce\s+qu'?\s*([A-Za-z0-9_]+)/i
      ];
      for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match) return match[1].trim();
      }
      return 'général';
    },
    extractSubIntent: () => 'informations',
    getExpectedType: () => 'detail'
  },

  GENERAL: {
    keywords: [],
    patterns: [],
    extractEntity: () => 'general',
    extractSubIntent: () => undefined,
    getExpectedType: (query) => {
      if (query.includes('liste') || query.includes('quels') || query.includes('quelles')) return 'list';
      if (query.includes('étape') || query.includes('comment faire') || query.includes('procédure')) return 'step';
      if (query.includes('définition') || query.includes("qu'est-ce")) return 'definition';
      return 'detail';
    }
  }
};

// Exemples pour la classification par embedding
const EMBEDDING_EXAMPLES: ClassificationExample[] = [
  { text: "donne profil de ahmed", category: "PROFILE_RH", entity: "ahmed", expectedType: "detail" },
  { text: "donne profile de ahmed abbes", category: "PROFILE_RH", entity: "ahmed abbes", expectedType: "detail" },
  { text: "qui est jean dupont", category: "PROFILE_RH", entity: "jean dupont", expectedType: "detail" },
  { text: "cherche cv ou profil de ahmed", category: "PROFILE_RH", entity: "ahmed", expectedType: "detail" },
  { text: "procédure de démarrage de TG1", category: "PROCEDURE", entity: "TG1", subIntent: "démarrage", expectedType: "list" },
  { text: "étapes d'arrêt de la turbine", category: "PROCEDURE", entity: "turbine", subIntent: "arrêt", expectedType: "step" },
  { text: "affiche l'image du condenseur", category: "IMAGE_DIRECT", entity: "condenseur", expectedType: "detail" },
  { text: "décris-moi la photo du compresseur", category: "IMAGE_DESCRIBE", entity: "compresseur", expectedType: "detail" },
  { text: "donne des informations sur TG2", category: "IMAGE_INFO", entity: "TG2", expectedType: "detail" },
];

// ============================================================================
// LOGS
// ============================================================================

const LOG_PREFIX = '[HYBRID-CLASSIFIER]';

function logInfo(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logSuccess(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} ✅ ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logWarning(message: string, data?: any): void {
  console.warn(`${LOG_PREFIX} ⚠️ ${message}`);
  if (data) console.warn(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

// ============================================================================
// SERVICE
// ============================================================================

export class HybridClassifier {
  private stats = {
    totalClassifications: 0,
    ruleBased: 0,
    embeddingBased: 0,
    llmBased: 0,
    avgConfidence: 0
  };

  /**
   * Classification principale (3 niveaux)
   */
  async classify(query: string): Promise<ClassifiedQuery> {
    const startTime = Date.now();
    this.stats.totalClassifications++;
    
    logInfo(`🔍 Classification de: "${query.substring(0, 80)}..."`);
    
    // NIVEAU 1: Règles (ultra-rapide)
    const ruleResult = this.ruleBasedClassify(query);
    if (ruleResult.confidence >= CONFIDENCE_THRESHOLDS.RULE) {
      this.stats.ruleBased++;
      this.stats.avgConfidence = (this.stats.avgConfidence * (this.stats.totalClassifications - 1) + ruleResult.confidence) / this.stats.totalClassifications;
      logSuccess(`Classification par règles: ${ruleResult.category} (${(ruleResult.confidence * 100).toFixed(0)}%)`);
      return { ...ruleResult, processingTime: Date.now() - startTime, method: 'rule' };
    }
    
    // NIVEAU 2: Embedding (compare avec exemples)
    const embeddingResult = await this.embeddingBasedClassify(query);
    if (embeddingResult.confidence >= CONFIDENCE_THRESHOLDS.EMBEDDING) {
      this.stats.embeddingBased++;
      this.stats.avgConfidence = (this.stats.avgConfidence * (this.stats.totalClassifications - 1) + embeddingResult.confidence) / this.stats.totalClassifications;
      logSuccess(`Classification par embedding: ${embeddingResult.category} (${(embeddingResult.confidence * 100).toFixed(0)}%)`);
      return { ...embeddingResult, processingTime: Date.now() - startTime, method: 'embedding' };
    }
    
    // NIVEAU 3: LLM (fallback)
    const llmResult = await this.llmBasedClassify(query);
    this.stats.llmBased++;
    this.stats.avgConfidence = (this.stats.avgConfidence * (this.stats.totalClassifications - 1) + llmResult.confidence) / this.stats.totalClassifications;
    logSuccess(`Classification par LLM: ${llmResult.category} (${(llmResult.confidence * 100).toFixed(0)}%)`);
    return { ...llmResult, processingTime: Date.now() - startTime, method: 'llm' };
  }

  /**
   * NIVEAU 1: Classification par règles
   */
  private ruleBasedClassify(query: string): ClassifiedQuery {
    const queryLower = query.toLowerCase();
    
    for (const [category, config] of Object.entries(RULE_PATTERNS)) {
      // Vérification par mots-clés
      for (const keyword of config.keywords) {
        if (queryLower.includes(keyword)) {
          return {
            original: query,
            category: category as QueryCategory,
            entity: config.extractEntity(query),
            subIntent: config.extractSubIntent(query),
            expectedType: config.getExpectedType(query),
            confidence: 0.85
          };
        }
      }
      
      // Vérification par patterns regex
      for (const pattern of config.patterns) {
        if (pattern.test(query)) {
          return {
            original: query,
            category: category as QueryCategory,
            entity: config.extractEntity(query),
            subIntent: config.extractSubIntent(query),
            expectedType: config.getExpectedType(query),
            confidence: 0.95
          };
        }
      }
    }
    
    // Default
    return {
      original: query,
      category: 'GENERAL',
      entity: RULE_PATTERNS.GENERAL.extractEntity(query),
      expectedType: RULE_PATTERNS.GENERAL.getExpectedType(query),
      confidence: 0.5
    };
  }

  /**
   * NIVEAU 2: Classification par embedding (similarité cosinus)
   */
  private async embeddingBasedClassify(query: string): Promise<ClassifiedQuery> {
    try {
      const queryEmbedding = await this.getEmbedding(query);
      
      let bestMatch = { category: 'GENERAL' as QueryCategory, similarity: 0, example: null as ClassificationExample | null };
      
      for (const example of EMBEDDING_EXAMPLES) {
        if (!example.embedding) {
          example.embedding = await this.getEmbedding(example.text);
        }
        
        const similarity = this.cosineSimilarity(queryEmbedding, example.embedding);
        if (similarity > bestMatch.similarity) {
          bestMatch = { category: example.category, similarity, example };
        }
      }
      
      if (bestMatch.example) {
        return {
          original: query,
          category: bestMatch.category,
          entity: bestMatch.example.entity || this.extractEntityGeneric(query, bestMatch.category),
          subIntent: bestMatch.example.subIntent,
          expectedType: bestMatch.example.expectedType,
          confidence: Math.min(0.95, bestMatch.similarity + 0.2)
        };
      }
      
      return this.ruleBasedClassify(query);
      
    } catch (error) {
      logWarning(`Embedding échoué, fallback sur règles: ${error}`);
      return this.ruleBasedClassify(query);
    }
  }

  /**
   * Calcule l'embedding d'un texte
   */
  private async getEmbedding(text: string): Promise<number[]> {
    const words = text.toLowerCase().split(/\s+/);
    const vector = new Array(384).fill(0);
    
    for (let i = 0; i < words.length && i < 384; i++) {
      const hash = this.hashCode(words[i]);
      vector[i % 384] = (hash % 1000) / 1000;
    }
    
    return vector;
  }

  /**
   * Hash simple pour embedding basique
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /**
   * Similarité cosinus entre deux vecteurs
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  /**
   * NIVEAU 3: Classification par LLM (Groq)
   */
  private async llmBasedClassify(query: string): Promise<ClassifiedQuery> {
    try {
      const { callGroq } = await import('@/ai/providers/groq-provider');
      
      const prompt = `Classe la requête suivante en une des catégories: PROFILE_RH, PROCEDURE, IMAGE_DIRECT, IMAGE_DESCRIBE, IMAGE_INFO, GENERAL.

Requête: "${query}"

Réponds UNIQUEMENT au format JSON:
{
  "category": "PROFILE_RH|PROCEDURE|IMAGE_DIRECT|IMAGE_DESCRIBE|IMAGE_INFO|GENERAL",
  "entity": "entité extraite",
  "subIntent": "sous-intention ou null",
  "expectedType": "list|step|definition|detail",
  "confidence": 0-1
}`;

      const response = await callGroq(prompt, {
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        maxTokens: 200,
        timeout: 5000
      });
      
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          original: query,
          category: parsed.category || 'GENERAL',
          entity: parsed.entity || 'general',
          subIntent: parsed.subIntent,
          expectedType: parsed.expectedType || 'detail',
          confidence: Math.min(0.9, parsed.confidence || 0.7)
        };
      }
      
      return this.ruleBasedClassify(query);
      
    } catch (error) {
      logWarning(`LLM échoué, fallback sur règles: ${error}`);
      return this.ruleBasedClassify(query);
    }
  }

  /**
   * Extraction générique d'entité
   */
  private extractEntityGeneric(query: string, category: QueryCategory): string {
    const patterns: Record<QueryCategory, RegExp[]> = {
      PROFILE_RH: [/(?:de\s+)?([A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]{2,})/i],
      PROCEDURE: [/(?:de\s+)?([A-Z0-9_]{2,})/i],
      IMAGE_DIRECT: [/(?:de\s+)?([A-Za-z0-9_]+)/i],
      IMAGE_DESCRIBE: [/(?:de\s+)?([A-Za-z0-9_]+)/i],
      IMAGE_INFO: [/(?:sur\s+)?([A-Za-z0-9_]+)/i],
      GENERAL: []
    };
    
    const categoryPatterns = patterns[category] || [];
    for (const pattern of categoryPatterns) {
      const match = query.match(pattern);
      if (match && match[1] && !match[1].match(/^(le|la|les|des|du|de)$/i)) {
        return match[1].trim();
      }
    }
    
    return 'general';
  }

  /**
   * Récupère les statistiques
   */
  getStats(): {
    totalClassifications: number;
    ruleBased: number;
    embeddingBased: number;
    llmBased: number;
    avgConfidence: number;
  } {
    return { ...this.stats };
  }

  /**
   * Réinitialise les statistiques
   */
  resetStats(): void {
    this.stats = {
      totalClassifications: 0,
      ruleBased: 0,
      embeddingBased: 0,
      llmBased: 0,
      avgConfidence: 0
    };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const hybridClassifier = new HybridClassifier();
export default hybridClassifier;