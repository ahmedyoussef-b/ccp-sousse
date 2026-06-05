/**
 * @fileOverview SemanticRAGStrategy - RAG sémantique multi-niveau
 * @version 1.0.0
 * @description Adapte la stratégie RAG selon le type de réponse attendue
 * @innovation 4/7
 */

// ============================================================================
// TYPES
// ============================================================================export type RAGStrategy = 
  | 'list'           // Recherche orientée énumération
  | 'step'           // Recherche orientée séquence (maintient l'ordre)
  | 'definition'     // Recherche orientée concept/définition
  | 'detail'         // Recherche standard détaillée
  | 'comparison'     // Recherche orientée comparaison
  | 'cause_effect'   // Recherche orientée cause à effet
  | 'full_document'; // 🔥 NOUVEAU : Récupération intégrale du document court

export type ExpectedResponseType = 'list' | 'step' | 'definition' | 'detail' | 'comparison' | 'cause_effect' | 'full_document';

export interface RAGStrategyConfig {
  name: RAGStrategy;
  chunkSize: number;
  chunkOverlap: number;
  nResults: number;
  minConfidence: number;
  rerankingEnabled: boolean;
  preserveOrder: boolean;
  includeMetadata: boolean;
}

export interface RAGResult {
  content: string;
  confidence: number;
  metadata: Record<string, any>;
  order?: number;      // Pour les stratégies step/comparison
  section?: string;    // Pour les stratégies list/definition
}

// ============================================================================
// CONFIGURATION DES STRATÉGIES
// ============================================================================

const STRATEGY_CONFIGS: Record<RAGStrategy, RAGStrategyConfig> = {
  list: {
    name: 'list',
    chunkSize: 1500,
    chunkOverlap: 100,
    nResults: 15,
    minConfidence: 0.3,
    rerankingEnabled: true,
    preserveOrder: false,
    includeMetadata: true
  },
  step: {
    name: 'step',
    chunkSize: 800,
    chunkOverlap: 200,
    nResults: 20,
    minConfidence: 0.35,
    rerankingEnabled: true,
    preserveOrder: true,
    includeMetadata: true
  },
  definition: {
    name: 'definition',
    chunkSize: 2000,
    chunkOverlap: 100,
    nResults: 10,
    minConfidence: 0.4,
    rerankingEnabled: false,
    preserveOrder: false,
    includeMetadata: true
  },
  detail: {
    name: 'detail',
    chunkSize: 2500,
    chunkOverlap: 300,
    nResults: 8,
    minConfidence: 0.3,
    rerankingEnabled: true,
    preserveOrder: false,
    includeMetadata: true
  },
  comparison: {
    name: 'comparison',
    chunkSize: 2000,
    chunkOverlap: 200,
    nResults: 12,
    minConfidence: 0.35,
    rerankingEnabled: true,
    preserveOrder: false,
    includeMetadata: true
  },
  cause_effect: {
    name: 'cause_effect',
    chunkSize: 1800,
    chunkOverlap: 150,
    nResults: 15,
    minConfidence: 0.35,
    rerankingEnabled: true,
    preserveOrder: false,
    includeMetadata: true
  },
  full_document: {
    name: 'full_document',
    chunkSize: 4000,
    chunkOverlap: 0,
    nResults: 5,
    minConfidence: 0.3,
    rerankingEnabled: false,
    preserveOrder: true,
    includeMetadata: true
  }
};

// ============================================================================
// LOGS
// ============================================================================

const LOG_PREFIX = '[SEMANTIC-RAG]';

function logInfo(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logSuccess(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} ✅ ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}


// ============================================================================
// SERVICE
// ============================================================================

export class SemanticRAGStrategy {
  private stats = {
    totalQueries: 0,
    strategyDistribution: {} as Record<RAGStrategy, number>,
    avgResultsPerQuery: 0
  };

  /**
   * Détermine la stratégie RAG à utiliser
   */
  async getStrategy(
    query: string,
    expectedType: ExpectedResponseType
  ): Promise<RAGStrategy> {
    const queryLower = query.toLowerCase();

    // Détection de profil RH / document court / full_document
    if (expectedType === 'full_document' || 
        queryLower.includes('profil') || 
        queryLower.includes('profile') || 
        queryLower.includes('salarié') || 
        queryLower.includes('employé') || 
        queryLower.includes('qui est') || 
        queryLower.includes('cv')) {
      logInfo(`Stratégie détectée: full_document (Profil RH / Document complet)`);
      return 'full_document';
    }
    
    // Détection par mots-clés
    if (expectedType === 'list' || queryLower.includes('liste') || queryLower.includes('énumération')) {
      logInfo(`Stratégie détectée: list`);
      return 'list';
    }
    
    if (expectedType === 'step' || 
        queryLower.includes('étape') || 
        queryLower.includes('procédure') ||
        queryLower.includes('séquence') ||
        queryLower.includes('ordre')) {
      logInfo(`Stratégie détectée: step`);
      return 'step';
    }
    
    if (expectedType === 'definition' || 
        queryLower.includes('définition') ||
        queryLower.includes('qu\'est-ce') ||
        queryLower.includes('signification')) {
      logInfo(`Stratégie détectée: definition`);
      return 'definition';
    }
    
    if (queryLower.includes('compar') || 
        queryLower.includes('différence') ||
        queryLower.includes('versus') ||
        queryLower.includes('vs')) {
      logInfo(`Stratégie détectée: comparison`);
      return 'comparison';
    }
    
    if (queryLower.includes('cause') || 
        queryLower.includes('conséquence') ||
        queryLower.includes('pourquoi') ||
        queryLower.includes('entraîne')) {
      logInfo(`Stratégie détectée: cause_effect`);
      return 'cause_effect';
    }
    
    logInfo(`Stratégie par défaut: detail`);
    return 'detail';
  }

  /**
   * Récupère la configuration pour une stratégie
   */
  getConfig(strategy: RAGStrategy): RAGStrategyConfig {
    return { ...STRATEGY_CONFIGS[strategy] };
  }

  /**
   * Post-traite les résultats selon la stratégie
   */
  async postProcessResults(
    results: RAGResult[],
    strategy: RAGStrategy,
    query: string
  ): Promise<RAGResult[]> {
    this.stats.totalQueries++;
    this.stats.strategyDistribution[strategy] = (this.stats.strategyDistribution[strategy] || 0) + 1;
    
    logInfo(`Post-traitement avec stratégie: ${strategy} (${results.length} résultats initiaux)`);
    
    let processed: RAGResult[];
    
    switch (strategy) {
      case 'full_document':
        processed = await this.processFullDocumentResults(results, query);
        break;
      case 'step':
        processed = this.processStepResults(results, query);
        break;
      case 'list':
        processed = this.processListResults(results, query);
        break;
      case 'definition':
        processed = this.processDefinitionResults(results, query);
        break;
      case 'comparison':
        processed = this.processComparisonResults(results, query);
        break;
      case 'cause_effect':
        processed = this.processCauseEffectResults(results, query);
        break;
      default:
        processed = this.processDetailResults(results, query);
    }
    
    this.stats.avgResultsPerQuery = (this.stats.avgResultsPerQuery * (this.stats.totalQueries - 1) + processed.length) / this.stats.totalQueries;
    
    logSuccess(`${processed.length} résultats après post-traitement`);
    return processed;
  }

  /**
   * Traitement pour stratégie FULL_DOCUMENT (reconstruction intégrale)
   */
  private async processFullDocumentResults(results: RAGResult[], _query: string): Promise<RAGResult[]> {
    const { getEnrichedDocumentContent } = await import('../../rag/intelligent-retriever');
    const uniqueDocs = new Map<string, RAGResult>();

    for (const r of results) {
      const docId = r.metadata?.parent_id || r.metadata?.id || r.metadata?.document_id || r.metadata?.source;
      const zone = r.metadata?.zone || 'RH';

      if (docId) {
        if (!uniqueDocs.has(docId)) {
          try {
            const fullContent = await getEnrichedDocumentContent(docId, zone);
            if (fullContent && fullContent.length > 0) {
              uniqueDocs.set(docId, {
                ...r,
                content: fullContent,
                metadata: { ...r.metadata, is_full_document: true }
              });
              logSuccess(`Document complet reconstruit pour: ${docId} (${fullContent.length} chars)`);
            } else {
              uniqueDocs.set(docId, r);
            }
          } catch (err) {
            uniqueDocs.set(docId, r);
          }
        }
      } else {
        const hash = r.content.substring(0, 200);
        if (!uniqueDocs.has(hash)) {
          uniqueDocs.set(hash, r);
        }
      }
    }

    return Array.from(uniqueDocs.values()).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Traitement pour stratégie STEP (maintient l'ordre)
   */
  private processStepResults(results: RAGResult[], _query: string): RAGResult[] {
    // 1. Extraire les numéros d'étape
    const withOrder = results.map(r => {
      let order = r.order || 999;
      
      // Extraire le numéro depuis le contenu
      const stepMatch = r.content.match(/^(?:Étape|Etape|STEP)\s*(\d+)/i);
      if (stepMatch) {
        order = parseInt(stepMatch[1], 10);
      }
      
      // Extraire le numéro depuis les métadonnées
      if (r.metadata?.step_number) {
        order = parseInt(r.metadata.step_number, 10);
      }
      
      return { ...r, order };
    });
    
    // 2. Trier par ordre
    const sorted = withOrder.sort((a, b) => (a.order || 999) - (b.order || 999));
    
    // 3. Vérifier la complétude de la séquence
    const sequence = this.checkSequenceCompleteness(sorted);
    if (!sequence.isComplete) {
      logInfo(`Séquence incomplète: trouvé ${sequence.found}/${sequence.total} étapes`);
      
      // Ajouter un avertissement
      if (sorted.length > 0) {
        sorted[0].metadata = {
          ...sorted[0].metadata,
          warning: `Séquence incomplète: ${sequence.missingSteps.join(', ')} manquantes`
        };
      }
    }
    
    // 4. Supprimer les doublons (garder la meilleure confiance)
    const uniqueByOrder = new Map<number, RAGResult>();
    for (const r of sorted) {
      const order = r.order || 0;
      if (!uniqueByOrder.has(order) || (r.confidence > (uniqueByOrder.get(order)?.confidence || 0))) {
        uniqueByOrder.set(order, r);
      }
    }
    
    return Array.from(uniqueByOrder.values());
  }

  /**
   * Traitement pour stratégie LIST (regroupement par catégorie)
   */
  private processListResults(results: RAGResult[], _query: string): RAGResult[] {
    const grouped = new Map<string, RAGResult[]>();
    
    for (const r of results) {
      const section = r.section || this.extractSection(r.content);
      if (!grouped.has(section)) {
        grouped.set(section, []);
      }
      grouped.get(section)!.push(r);
    }
    
    const processed: RAGResult[] = [];
    for (const [section, items] of grouped) {
      const best = items.reduce((a, b) => a.confidence > b.confidence ? a : b);
      processed.push({
        ...best,
        metadata: { ...best.metadata, section }
      });
    }
    
    return processed.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Traitement pour stratégie DEFINITION
   */
  private processDefinitionResults(results: RAGResult[], _query: string): RAGResult[] {
    const definitionPatterns = [
      /(?:est|sont)\s+(?:un|une|des)\s+(\w+)/i,
      /définition\s*:?\s*(.+)/i,
      /(?:correspond|représente)\s+à\s+(.+)/i,
      /(?:désigne|appelle)\s+(\w+)/i
    ];
    
    const scored = results.map(r => {
      let score = r.confidence;
      
      for (const pattern of definitionPatterns) {
        if (pattern.test(r.content)) {
          score += 0.15;
          break;
        }
      }
      
      if (r.content.length < 500) {
        score += 0.1;
      }
      
      return { ...r, confidence: Math.min(0.95, score) };
    });
    
    return scored.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Traitement pour stratégie COMPARISON
   */
  private processComparisonResults(results: RAGResult[], query: string): RAGResult[] {
    const comparePattern = /(?:entre|vs|versus)\s+([^\s]+)\s+(?:et|vs|versus|and)\s+([^\s]+)/i;
    const match = query.match(comparePattern);
    const entities = match ? [match[1], match[2]] : [];
    
    const entityResults = new Map<string, RAGResult[]>();
    
    for (const r of results) {
      for (const entity of entities) {
        if (r.content.toLowerCase().includes(entity.toLowerCase())) {
          if (!entityResults.has(entity)) {
            entityResults.set(entity, []);
          }
          entityResults.get(entity)!.push(r);
        }
      }
    }
    
    const processed: RAGResult[] = [];
    for (const [entity, items] of entityResults) {
      const best = items.reduce((a, b) => a.confidence > b.confidence ? a : b);
      processed.push({
        ...best,
        metadata: { ...best.metadata, entity, comparisonEntity: entities.find(e => e !== entity) }
      });
    }
    
    return processed;
  }

  /**
   * Traitement pour stratégie CAUSE_EFFECT
   */
  private processCauseEffectResults(results: RAGResult[], _query: string): RAGResult[] {
    const causePatterns = [
      /(?:provoque|entraîne|cause|crée)\s+(.+)/i,
      /(?:conséquence|résultat|effet)\s+(?:de|d')\s+(.+)/i,
      /(?:si|quand)\s+(.+?)\s+(?:alors|donc)\s+(.+)/i
    ];
    
    const scored = results.map(r => {
      let score = r.confidence;
      let cause = null;
      let effect = null;
      
      for (const pattern of causePatterns) {
        const match = r.content.match(pattern);
        if (match) {
          score += 0.2;
          if (!cause && match[1]) cause = match[1];
          if (!effect && match[2]) effect = match[2];
          break;
        }
      }
      
      return {
        ...r,
        confidence: Math.min(0.95, score),
        metadata: { ...r.metadata, cause, effect }
      };
    });
    
    return scored.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Traitement standard pour stratégie DETAIL
   */
  private processDetailResults(results: RAGResult[], _query: string): RAGResult[] {
    const unique = new Map<string, RAGResult>();
    for (const r of results) {
      const hash = r.content.substring(0, 200);
      if (!unique.has(hash) || r.confidence > unique.get(hash)!.confidence) {
        unique.set(hash, r);
      }
    }
    
    return Array.from(unique.values()).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Vérifie la complétude d'une séquence d'étapes
   */
  private checkSequenceCompleteness(results: RAGResult[]): {
    isComplete: boolean;
    total: number;
    found: number;
    missingSteps: number[];
  } {
    const orders = results.map(r => r.order || 0).filter(o => o > 0);
    if (orders.length === 0) {
      return { isComplete: true, total: 0, found: 0, missingSteps: [] };
    }
    
    const maxOrder = Math.max(...orders);
    const expected = Array.from({ length: maxOrder }, (_, i) => i + 1);
    const found = new Set(orders);
    const missingSteps = expected.filter(o => !found.has(o));
    
    return {
      isComplete: missingSteps.length === 0,
      total: maxOrder,
      found: orders.length,
      missingSteps
    };
  }

  /**
   * Extrait la section à partir du contenu
   */
  private extractSection(content: string): string {
    const sectionMatch = content.match(/^#+\s*(.+)/m);
    if (sectionMatch) {
      return sectionMatch[1].trim();
    }
    
    const categoryMatch = content.match(/CATEGORY[:\s]+(.+)/i);
    if (categoryMatch) {
      return categoryMatch[1].trim();
    }
    
    return 'Général';
  }

  /**
   * Détecte automatiquement la stratégie à partir des résultats
   */
  autoDetectStrategy(results: RAGResult[]): RAGStrategy {
    if (results.length === 0) return 'detail';
    
    const hasSteps = results.some(r => 
      r.content.match(/^(?:Étape|Etape|STEP)\s*\d+/i) || 
      r.metadata?.step_number
    );
    if (hasSteps) return 'step';
    
    const hasDefinitions = results.some(r => 
      r.content.match(/définition|est un|est une|correspond à/i)
    );
    if (hasDefinitions) return 'definition';
    
    const hasLists = results.some(r => 
      r.content.match(/^\s*[-*•]\s/m) || 
      r.content.match(/^\d+\.\s/m)
    );
    if (hasLists) return 'list';
    
    return 'detail';
  }

  /**
   * Récupère les statistiques
   */
  getStats(): {
    totalQueries: number;
    strategyDistribution: Record<RAGStrategy, number>;
    avgResultsPerQuery: number;
  } {
    return {
      totalQueries: this.stats.totalQueries,
      strategyDistribution: { ...this.stats.strategyDistribution },
      avgResultsPerQuery: Math.round(this.stats.avgResultsPerQuery * 10) / 10
    };
  }

  /**
   * Réinitialise les statistiques
   */
  resetStats(): void {
    this.stats = {
      totalQueries: 0,
      strategyDistribution: {} as Record<RAGStrategy, number>,
      avgResultsPerQuery: 0
    };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const semanticRAGStrategy = new SemanticRAGStrategy();
export default semanticRAGStrategy;