/**
 * @fileOverview AmbiguityDetector - Détection et résolution des ambiguïtés
 * @version 1.0.0
 * @description Identifie les questions ambiguës et génère des clarifications intelligentes
 * @innovation 5/7
 */

// ============================================================================
// TYPES
// ============================================================================

export interface Ambiguity {
  type: AmbiguityType;
  message: string;
  options?: string[];
  resolved: boolean;
  resolvedValue?: string;
  confidence: number;
}

export type AmbiguityType = 
  | 'MULTIPLE_ENTITIES'      // Plusieurs entités possibles
  | 'AMBIGUOUS_ACTION'       // Action ambiguë
  | 'MISSING_ATTRIBUTE'      // Attribut manquant
  | 'VAGUE_REFERENCE'        // Référence vague (ex: "ça", "cette chose")
  | 'CONTRADICTION'          // Contradiction dans la question
  | 'INCOMPLETE_SPECIFICATION' // Spécification incomplète
  | 'TEMPORAL_AMBIGUITY'     // Ambiguïté temporelle (ex: "récemment", "bientôt")
  | 'SCOPE_AMBIGUITY';       // Ambiguïté de périmètre

export interface AmbiguityResult {
  ambiguities: Ambiguity[];
  needsClarification: boolean;
  clarificationQuestion?: string;
  originalQuery: string;
  resolvedQuery?: string;
  confidence: number;
  processingTime?: number;
}

export interface QueryContext {
  userId?: string;
  sessionId?: string;
  history?: QueryHistoryEntry[];
  userProfile?: string;
  currentZone?: string;
}

export interface QueryHistoryEntry {
  query: string;
  timestamp: number;
  resolved?: boolean;
  clarificationUsed?: string;
}

// ============================================================================
// PATTERNS DE DÉTECTION
// ============================================================================

const AMBIGUITY_PATTERNS = {
  vagueReference: [
    /\b(ça|ceci|cela|cette chose|le truc)\b/i,
    /\b(il|elle|ils|elles)\s+(?:est|sont)\b/i
  ],
  ambiguousAction: [
    /\b(configurer|régler|modifier|changer|mettre à jour)\b/i,
    /\b(optimiser|améliorer|corriger|réparer)\b/i
  ],
  missingAttribute: [
    /(?:pression|température|débit|vitesse)\s+(?:de\s+)?$/i,
    /combien\s+(?:de|d')\s+(\w+)\s*$/i
  ],
  temporalAmbiguity: [
    /\b(récemment|bientôt|rapidement|plus tard|tout de suite)\b/i,
    /\b(avant|après|pendant)\s+(\w+)\s*$/i
  ],
  scopeAmbiguity: [
    /\b(tous|chaque|aucun|quelques)\s+(\w+)\s*$/i,
    /\b(dans|sur|pour)\s+(\w+)\s*$/i
  ]
};

const ENTITIES_BY_CATEGORY: Record<string, string[]> = {
  equipement: ['TG1', 'TG2', 'turbine', 'compresseur', 'alternateur', 'condenseur', 'pompe', 'vanne'],
  personne: ['Ahmed Abbès', 'Jean Dupont', 'chef de quart', 'technicien', 'opérateur', 'superviseur'],
  document: ['procédure', 'manuel', 'schéma', 'plan', 'notice', 'documentation'],
  action: ['démarrage', 'arrêt', 'inspection', 'maintenance', 'réparation', 'nettoyage']
};

// ============================================================================
// LOGS
// ============================================================================

const LOG_PREFIX = '[AMBIGUITY-DETECTOR]';

function logInfo(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}


// ============================================================================
// SERVICE
// ============================================================================

export class AmbiguityDetector {
  private stats = {
    totalQueries: 0,
    ambiguousQueries: 0,
    resolvedQueries: 0,
    avgAmbiguitiesPerQuery: 0,
    ambiguityTypeDistribution: {} as Record<AmbiguityType, number>
  };

  async analyze(query: string, context?: QueryContext): Promise<AmbiguityResult> {
    const startTime = Date.now();
    this.stats.totalQueries++;
    
    logInfo(`🔍 Analyse d'ambiguïté: "${query.substring(0, 60)}..."`);
    
    const ambiguities: Ambiguity[] = [];
    
    // 1. Détection multi-entités
    const multiEntity = await this.detectMultipleEntities(query, context);
    if (multiEntity) ambiguities.push(multiEntity);
    
    // 2. Détection action ambiguë
    const ambiguousAction = await this.detectAmbiguousAction(query);
    if (ambiguousAction) ambiguities.push(ambiguousAction);
    
    // 3. Détection attribut manquant
    const missingAttr = this.detectMissingAttribute(query);
    if (missingAttr) ambiguities.push(missingAttr);
    
    // 4. Détection référence vague
    const vagueRef = this.detectVagueReference(query);
    if (vagueRef) ambiguities.push(vagueRef);
    
    // 5. Détection contradiction
    const contradiction = await this.detectContradiction(query);
    if (contradiction) ambiguities.push(contradiction);
    
    // 6. Détection ambiguïté temporelle
    const temporal = this.detectTemporalAmbiguity(query);
    if (temporal) ambiguities.push(temporal);
    
    // 7. Détection ambiguïté de périmètre
    const scope = this.detectScopeAmbiguity(query);
    if (scope) ambiguities.push(scope);
    
    if (ambiguities.length > 0) {
      this.stats.ambiguousQueries++;
      this.stats.avgAmbiguitiesPerQuery = 
        (this.stats.avgAmbiguitiesPerQuery * (this.stats.ambiguousQueries - 1) + ambiguities.length) / this.stats.ambiguousQueries;
      
      for (const amb of ambiguities) {
        this.stats.ambiguityTypeDistribution[amb.type] = (this.stats.ambiguityTypeDistribution[amb.type] || 0) + 1;
      }
    }
    
    const needsClarification = ambiguities.length > 0;
    let clarificationQuestion: string | undefined;
    
    if (needsClarification) {
      clarificationQuestion = this.generateClarification(ambiguities, context);
      logInfo(`❓ Clarification générée: ${clarificationQuestion.substring(0, 80)}...`);
    }
    
    const processingTime = Date.now() - startTime;
    
    return {
      ambiguities,
      needsClarification,
      clarificationQuestion,
      originalQuery: query,
      confidence: needsClarification ? 0.8 : 1.0,
      processingTime
    };
  }

  private async detectMultipleEntities(query: string, _context?: QueryContext): Promise<Ambiguity | null> {
    const entities: string[] = [];
    
    for (const [, items] of Object.entries(ENTITIES_BY_CATEGORY)) {
      for (const item of items) {
        if (query.toLowerCase().includes(item.toLowerCase())) {
          entities.push(item);
        }
      }
    }
    
    const uniqueEntities = [...new Set(entities)];
    if (uniqueEntities.length >= 2 && !this.hasRelationDefined(query)) {
      return {
        type: 'MULTIPLE_ENTITIES',
        message: `Lequel de ces éléments vous intéresse ?`,
        options: uniqueEntities,
        resolved: false,
        confidence: 0.9
      };
    }
    
    return null;
  }

  private async detectAmbiguousAction(query: string): Promise<Ambiguity | null> {
    for (const pattern of AMBIGUITY_PATTERNS.ambiguousAction) {
      if (pattern.test(query)) {
        const hasObject = query.match(/(?:configurer|régler|modifier)\s+(?:le|la|les?)\s+(\w+)/i);
        if (!hasObject) {
          return {
            type: 'AMBIGUOUS_ACTION',
            message: `Souhaitez-vous la procédure, la documentation ou une aide sur cette action ?`,
            options: ['Procédure détaillée', 'Documentation technique', 'Aide rapide', 'Vidéo tutorielle'],
            resolved: false,
            confidence: 0.85
          };
        }
      }
    }
    return null;
  }

  private detectMissingAttribute(query: string): Ambiguity | null {
    for (const pattern of AMBIGUITY_PATTERNS.missingAttribute) {
      const match = query.match(pattern);
      if (match) {
        const attribute = match[1] || 'information';
        return {
          type: 'MISSING_ATTRIBUTE',
          message: `Pour quel équipement souhaitez-vous ${attribute} ?`,
          options: ENTITIES_BY_CATEGORY.equipement.slice(0, 5),
          resolved: false,
          confidence: 0.85
        };
      }
    }
    return null;
  }

  private detectVagueReference(query: string): Ambiguity | null {
    for (const pattern of AMBIGUITY_PATTERNS.vagueReference) {
      if (pattern.test(query)) {
        return {
          type: 'VAGUE_REFERENCE',
          message: `Pouvez-vous préciser à quoi vous faites référence ?`,
          options: ['Un équipement', 'Une personne', 'Un document', 'Une procédure'],
          resolved: false,
          confidence: 0.8
        };
      }
    }
    return null;
  }

  private async detectContradiction(query: string): Promise<Ambiguity | null> {
    const contradictoryPairs = [
      { a: 'démarrer', b: 'arrêter' },
      { a: 'augmenter', b: 'diminuer' },
      { a: 'ouvert', b: 'fermé' },
      { a: 'chaud', b: 'froid' },
      { a: 'haut', b: 'bas' }
    ];
    
    let contradictions = 0;
    for (const pair of contradictoryPairs) {
      if (query.toLowerCase().includes(pair.a) && query.toLowerCase().includes(pair.b)) {
        contradictions++;
      }
    }
    
    if (contradictions > 0) {
      return {
        type: 'CONTRADICTION',
        message: `Votre question semble contenir des instructions contradictoires. Pouvez-vous clarifier ?`,
        options: ['Corriger la question', 'Ignorer la contradiction'],
        resolved: false,
        confidence: 0.9
      };
    }
    
    return null;
  }

  private detectTemporalAmbiguity(query: string): Ambiguity | null {
    for (const pattern of AMBIGUITY_PATTERNS.temporalAmbiguity) {
      if (pattern.test(query)) {
        return {
          type: 'TEMPORAL_AMBIGUITY',
          message: `Pouvez-vous préciser la période ?`,
          options: ['Immédiatement', 'Dans la journée', 'Cette semaine', 'À programmer'],
          resolved: false,
          confidence: 0.75
        };
      }
    }
    return null;
  }

  private detectScopeAmbiguity(query: string): Ambiguity | null {
    for (const pattern of AMBIGUITY_PATTERNS.scopeAmbiguity) {
      const match = query.match(pattern);
      if (match && match[2]) {
        const target = match[2];
        return {
          type: 'SCOPE_AMBIGUITY',
          message: `Souhaitez-vous des informations sur ${target} ?`,
          options: [`Tous les ${target}`, `Un ${target} spécifique`, `La documentation sur ${target}`],
          resolved: false,
          confidence: 0.8
        };
      }
    }
    return null;
  }

  private hasRelationDefined(query: string): boolean {
    const relationPatterns = [
      /\b(et|vs|versus|contre|avec|pour)\b/i,
      /\b(comparer|différence|similitude)\b/i,
      /\b(relation|lien|association)\b/i
    ];
    
    return relationPatterns.some(p => p.test(query));
  }

  generateClarification(ambiguities: Ambiguity[], _context?: QueryContext): string {
    if (ambiguities.length === 1) {
      return this.formatSingleClarification(ambiguities[0]);
    }
    
    if (ambiguities.length === 2) {
      return this.formatDoubleClarification(ambiguities);
    }
    
    return this.formatMultiClarification(ambiguities);
  }

  private formatSingleClarification(ambiguity: Ambiguity): string {
    switch (ambiguity.type) {
      case 'MULTIPLE_ENTITIES':
        return `${ambiguity.message}\n\nOptions: ${ambiguity.options?.join(', ')}`;
      case 'AMBIGUOUS_ACTION':
        return `${ambiguity.message}\n\nOptions: ${ambiguity.options?.join(', ')}`;
      case 'MISSING_ATTRIBUTE':
        return `${ambiguity.message}\n\nExemples: ${ambiguity.options?.slice(0, 3).join(', ')}...`;
      case 'VAGUE_REFERENCE':
        return `${ambiguity.message}\n\nCatégories: ${ambiguity.options?.join(', ')}`;
      case 'TEMPORAL_AMBIGUITY':
        return `${ambiguity.message}\n\nOptions: ${ambiguity.options?.join(', ')}`;
      default:
        return ambiguity.message;
    }
  }

  private formatDoubleClarification(ambiguities: Ambiguity[]): string {
    return `Pour mieux vous aider, précisez :\n\n1. ${ambiguities[0].message}\n2. ${ambiguities[1].message}`;
  }

  private formatMultiClarification(ambiguities: Ambiguity[]): string {
    let message = "J'ai besoin de précisions pour bien répondre :\n\n";
    ambiguities.forEach((amb, idx) => {
      message += `${idx + 1}. ${amb.message}\n`;
      if (amb.options && amb.options.length > 0) {
        message += `   Options: ${amb.options.slice(0, 3).join(', ')}\n`;
      }
    });
    return message;
  }

  resolveAmbiguity(originalQuery: string, ambiguities: Ambiguity[], userResponse: string): string {
    this.stats.resolvedQueries++;
    
    let resolvedQuery = originalQuery;
    
    for (const amb of ambiguities) {
      if (!amb.resolved && amb.options) {
        const matched = amb.options.find(opt => 
          userResponse.toLowerCase().includes(opt.toLowerCase())
        );
        
        if (matched) {
          amb.resolved = true;
          amb.resolvedValue = matched;
          resolvedQuery = this.applyResolution(resolvedQuery, amb, matched);
        }
      }
    }
    
    logInfo(`✅ Requête résolue: "${resolvedQuery}"`);
    return resolvedQuery;
  }

  private applyResolution(query: string, ambiguity: Ambiguity, resolved: string): string {
    switch (ambiguity.type) {
      case 'MISSING_ATTRIBUTE':
        return `${query} ${resolved}`;
      case 'VAGUE_REFERENCE':
        return query.replace(/\b(ça|ceci|cela)\b/i, resolved);
      default:
        return query;
    }
  }

  async getSessionHistory(_sessionId: string): Promise<QueryHistoryEntry[]> {
    return [];
  }

  getStats(): {
    totalQueries: number;
    ambiguousQueries: number;
    ambiguityRate: number;
    resolvedQueries: number;
    resolutionRate: number;
    avgAmbiguitiesPerQuery: number;
    ambiguityTypeDistribution: Record<AmbiguityType, number>;
  } {
    return {
      totalQueries: this.stats.totalQueries,
      ambiguousQueries: this.stats.ambiguousQueries,
      ambiguityRate: this.stats.totalQueries > 0 ? this.stats.ambiguousQueries / this.stats.totalQueries : 0,
      resolvedQueries: this.stats.resolvedQueries,
      resolutionRate: this.stats.ambiguousQueries > 0 ? this.stats.resolvedQueries / this.stats.ambiguousQueries : 0,
      avgAmbiguitiesPerQuery: Math.round(this.stats.avgAmbiguitiesPerQuery * 100) / 100,
      ambiguityTypeDistribution: { ...this.stats.ambiguityTypeDistribution }
    };
  }

  resetStats(): void {
    this.stats = {
      totalQueries: 0,
      ambiguousQueries: 0,
      resolvedQueries: 0,
      avgAmbiguitiesPerQuery: 0,
      ambiguityTypeDistribution: {} as Record<AmbiguityType, number>
    };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const ambiguityDetector = new AmbiguityDetector();
export default ambiguityDetector;