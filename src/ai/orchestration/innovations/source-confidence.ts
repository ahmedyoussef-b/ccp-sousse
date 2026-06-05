/**
 * @fileOverview SourceConfidence - Matrice de confiance par source
 * @version 1.0.0
 * @description Définit les scores de confiance, poids et seuils pour chaque source
 * @innovation 2/3 (Amélioration 2)
 */

// ============================================================================
// TYPES
// ============================================================================

export type SourceType = 'qr_index' | 'cache' | 'nominal' | 'rag' | 'inverted' | 'vision' | 'training';

export interface SourceConfidenceConfig {
  source: SourceType;
  baseWeight: number;           // Poids de base de la source (0-2)
  minScore: number;             // Score minimum pour être considéré (0-1)
  maxScore: number;             // Score maximum (0-1)
  confidenceBoost: number;      // Bonus de confiance pour cette source
  relevanceBoost: Record<string, number>; // Bonus par catégorie de question
  penaltyFactors: {
    timeout: number;            // Pénalité si timeout
    retryCount: number;         // Pénalité par tentative
    staleData: number;          // Pénalité si données obsolètes
  };
  thresholds: {
    high: number;               // Seuil haute confiance (≥)
    medium: number;             // Seuil confiance moyenne (≥)
    low: number;                // Seuil basse confiance (≥)
  };
}

export interface SourceScore {
  source: SourceType;
  rawScore: number;             // Score brut (0-1)
  weightedScore: number;        // Score pondéré
  confidence: number;           // Confiance finale (0-1)
  reliability: number;          // Fiabilité de la source (0-1)
  recommendation: 'high' | 'medium' | 'low' | 'reject';
  metadata: Record<string, any>;
}

export interface SourceResultWithConfidence {
  sourceId: string;
  sourceType: SourceType;
  content: string;
  originalScore: number;
  weightedScore: number;
  confidence: number;
  reliability: number;
  metadata: Record<string, any>;
}

// ============================================================================
// CONFIGURATION DES SOURCES
// ============================================================================

const SOURCE_CONFIGS: Record<SourceType, SourceConfidenceConfig> = {
  qr_index: {
    source: 'qr_index',
    baseWeight: 1.8,
    minScore: 0.70,
    maxScore: 0.98,
    confidenceBoost: 0.15,
    relevanceBoost: {
      'PROCEDURE': 0.2,
      'PROFILE_RH': 0.15,
      'DEFINITION': 0.1,
      'GENERAL': 0.05
    },
    penaltyFactors: {
      timeout: 0.3,
      retryCount: 0.05,
      staleData: 0.1
    },
    thresholds: {
      high: 0.85,
      medium: 0.70,
      low: 0.60
    }
  },
  cache: {
    source: 'cache',
    baseWeight: 1.5,
    minScore: 0.75,
    maxScore: 0.95,
    confidenceBoost: 0.1,
    relevanceBoost: {
      'PROCEDURE': 0.1,
      'DEFINITION': 0.1,
      'GENERAL': 0.05
    },
    penaltyFactors: {
      timeout: 0.2,
      retryCount: 0.03,
      staleData: 0.15
    },
    thresholds: {
      high: 0.85,
      medium: 0.70,
      low: 0.60
    }
  },
  nominal: {
    source: 'nominal',
    baseWeight: 1.3,
    minScore: 0.65,
    maxScore: 0.90,
    confidenceBoost: 0.1,
    relevanceBoost: {
      'PROCEDURE': 0.25,
      'PROFILE_RH': 0.2,
      'DEFINITION': 0.1
    },
    penaltyFactors: {
      timeout: 0.25,
      retryCount: 0.04,
      staleData: 0.12
    },
    thresholds: {
      high: 0.80,
      medium: 0.65,
      low: 0.55
    }
  },
  rag: {
    source: 'rag',
    baseWeight: 1.0,
    minScore: 0.45,
    maxScore: 0.85,
    confidenceBoost: 0.05,
    relevanceBoost: {
      'GENERAL': 0.15,
      'DEFINITION': 0.1,
      'COMPARISON': 0.1,
      'PROFILE_RH': 0.15,
      'PROCEDURE': 0.15
    },
    penaltyFactors: {
      timeout: 0.35,
      retryCount: 0.06,
      staleData: 0.1
    },
    thresholds: {
      high: 0.70,
      medium: 0.50,
      low: 0.38
    }
  },
  inverted: {
    source: 'inverted',
    baseWeight: 0.7,
    minScore: 0.45,
    maxScore: 0.75,
    confidenceBoost: 0.02,
    relevanceBoost: {
      'LIST': 0.1,
      'DEFINITION': 0.05
    },
    penaltyFactors: {
      timeout: 0.4,
      retryCount: 0.07,
      staleData: 0.15
    },
    thresholds: {
      high: 0.65,
      medium: 0.50,
      low: 0.40
    }
  },
  vision: {
    source: 'vision',
    baseWeight: 0.5,
    minScore: 0.40,
    maxScore: 0.70,
    confidenceBoost: 0.02,
    relevanceBoost: {
      'IMAGE_DIRECT': 0.3,
      'IMAGE_DESCRIBE': 0.25,
      'IMAGE_INFO': 0.2
    },
    penaltyFactors: {
      timeout: 0.45,
      retryCount: 0.08,
      staleData: 0.2
    },
    thresholds: {
      high: 0.60,
      medium: 0.45,
      low: 0.35
    }
  },
  training: {
    source: 'training',
    baseWeight: 2.0,
    minScore: 0.35,
    maxScore: 1.0,
    confidenceBoost: 0.12,
    relevanceBoost: {
      'PROCEDURE': 0.2,
      'DEFINITION': 0.15,
      'GENERAL': 0.1,
      'PROFILE_RH': 0.1
    },
    penaltyFactors: {
      timeout: 0.1,
      retryCount: 0.02,
      staleData: 0.05
    },
    thresholds: {
      high: 0.80,
      medium: 0.60,
      low: 0.40
    }
  }
};

// ============================================================================
// LOGS
// ============================================================================

const LOG_PREFIX = '[SOURCE-CONFIDENCE]';

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

export class SourceConfidence {
  private stats = {
    totalCalculations: 0,
    highConfidenceCount: 0,
    mediumConfidenceCount: 0,
    lowConfidenceCount: 0,
    rejectedCount: 0,
    avgConfidence: 0
  };

  /**
   * Calcule la confiance pour un résultat de source
   */
  calculate(
    sourceType: SourceType,
    rawScore: number,
    category?: string,
    penaltyFactors?: { timeout?: number; retryCount?: number; staleData?: boolean }
  ): SourceScore {
    this.stats.totalCalculations++;
    
    const config = SOURCE_CONFIGS[sourceType];
    if (!config) {
      logInfo(`Source inconnue: ${sourceType}, utilisation defaults`);
      return this.defaultScore(sourceType, rawScore);
    }
    
    // 1. Normaliser le score brut
    const normalizedScore = Math.min(config.maxScore, Math.max(config.minScore, rawScore));
    
    // 2. Appliquer le poids de base
    let weightedScore = normalizedScore * config.baseWeight;
    
    // 3. Appliquer le boost de confiance
    let confidence = normalizedScore + config.confidenceBoost;
    
    // 4. Appliquer les boosts par catégorie
    if (category && config.relevanceBoost[category]) {
      confidence += config.relevanceBoost[category];
      weightedScore += config.relevanceBoost[category];
    }
    
    // 5. Appliquer les pénalités
    if (penaltyFactors) {
      if (penaltyFactors.timeout) {
        confidence -= config.penaltyFactors.timeout * penaltyFactors.timeout;
        weightedScore -= config.penaltyFactors.timeout * penaltyFactors.timeout;
      }
      if (penaltyFactors.retryCount) {
        confidence -= config.penaltyFactors.retryCount * penaltyFactors.retryCount;
        weightedScore -= config.penaltyFactors.retryCount * penaltyFactors.retryCount;
      }
      if (penaltyFactors.staleData) {
        confidence -= config.penaltyFactors.staleData;
        weightedScore -= config.penaltyFactors.staleData;
      }
    }
    
    // 6. Calculer la fiabilité (basée sur l'historique de la source)
    const reliability = this.calculateReliability(sourceType);
    
    // 7. Ajuster la confiance par la fiabilité
    confidence = confidence * reliability;
    
    // 8. Normaliser entre 0 et 1
    confidence = Math.min(0.98, Math.max(0, confidence));
    weightedScore = Math.min(config.maxScore * config.baseWeight, Math.max(0, weightedScore));
    
    // 9. Déterminer la recommandation
    let recommendation: SourceScore['recommendation'] = 'reject';
    if (confidence >= config.thresholds.high) {
      recommendation = 'high';
      this.stats.highConfidenceCount++;
    } else if (confidence >= config.thresholds.medium) {
      recommendation = 'medium';
      this.stats.mediumConfidenceCount++;
    } else if (confidence >= config.thresholds.low) {
      recommendation = 'low';
      this.stats.lowConfidenceCount++;
    } else {
      recommendation = 'reject';
      this.stats.rejectedCount++;
    }
    
    // Mettre à jour la confiance moyenne
    this.stats.avgConfidence = (this.stats.avgConfidence * (this.stats.totalCalculations - 1) + confidence) / this.stats.totalCalculations;
    
    logInfo(`${sourceType}: score=${rawScore.toFixed(2)} → conf=${confidence.toFixed(2)} (${recommendation})`);
    
    return {
      source: sourceType,
      rawScore: normalizedScore,
      weightedScore,
      confidence,
      reliability,
      recommendation,
      metadata: {
        config,
        categoryBoost: category && config.relevanceBoost[category] ? config.relevanceBoost[category] : 0,
        penaltiesApplied: penaltyFactors
      }
    };
  }

  /**
   * Calcule la fiabilité d'une source
   */
  private calculateReliability(sourceType: SourceType): number {
    // TODO: Implémenter avec historique SQLite
    // Pour l'instant, valeurs statiques
    const reliabilityMap: Record<SourceType, number> = {
      qr_index: 0.95,
      cache: 0.92,
      nominal: 0.88,
      rag: 0.80,
      inverted: 0.70,
      vision: 0.65,
      training: 0.93   // 📚🎓 Données pré-préparées et vérifiées manuellement
    };
    
    return reliabilityMap[sourceType] || 0.7;
  }

  /**
   * Score par défaut pour une source inconnue
   */
  private defaultScore(sourceType: SourceType, rawScore: number): SourceScore {
    return {
      source: sourceType,
      rawScore,
      weightedScore: rawScore,
      confidence: rawScore * 0.7,
      reliability: 0.6,
      recommendation: rawScore > 0.6 ? 'low' : 'reject',
      metadata: { isDefault: true }
    };
  }

  /**
   * Filtre les résultats par seuil de confiance
   */
  filterByConfidence<T extends { sourceType: SourceType; confidence?: number }>(
    results: T[],
    minConfidence: number = 0.5
  ): T[] {
    return results.filter(r => (r.confidence || 0) >= minConfidence);
  }

  /**
   * Trie les résultats par confiance décroissante
   */
  sortByConfidence<T extends { confidence?: number }>(results: T[]): T[] {
    return [...results].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }

  /**
   * Récupère la configuration d'une source
   */
  getConfig(sourceType: SourceType): SourceConfidenceConfig | undefined {
    return SOURCE_CONFIGS[sourceType];
  }

  /**
   * Met à jour dynamiquement la configuration d'une source
   */
  updateConfig(sourceType: SourceType, updates: Partial<SourceConfidenceConfig>): void {
    if (SOURCE_CONFIGS[sourceType]) {
      Object.assign(SOURCE_CONFIGS[sourceType], updates);
      logSuccess(`Configuration mise à jour pour ${sourceType}`);
    }
  }

  /**
   * Retourne l'ordre de priorité recommandé des sources
   */
  getPriorityOrder(category?: string): SourceType[] {
    const allSources: SourceType[] = ['qr_index', 'training', 'cache', 'nominal', 'rag', 'inverted', 'vision'];

    if (category === 'PROCEDURE') {
      return ['qr_index', 'training', 'nominal', 'cache', 'rag', 'inverted', 'vision'];
    }

    if (category === 'PROFILE_RH') {
      return ['qr_index', 'training', 'nominal', 'cache', 'rag', 'inverted', 'vision'];
    }

    if (category?.startsWith('IMAGE')) {
      return ['vision', 'qr_index', 'rag', 'cache', 'nominal', 'training', 'inverted'];
    }

    // Ordre par défaut (poids décroissant)
    return allSources;
  }

  /**
   * Calcule le score maximum possible pour une source
   */
  getMaxPossibleScore(sourceType: SourceType, category?: string): number {
    const config = SOURCE_CONFIGS[sourceType];
    if (!config) return 1.0;
    
    let maxScore = config.maxScore;
    if (category && config.relevanceBoost[category]) {
      maxScore += config.relevanceBoost[category];
    }
    maxScore += config.confidenceBoost;
    
    return Math.min(0.98, maxScore);
  }

  /**
   * Évalue la fiabilité globale de toutes les sources
   */
  getOverallReliability(): Record<SourceType, number> {
    const reliability: Partial<Record<SourceType, number>> = {};
    for (const source of Object.keys(SOURCE_CONFIGS) as SourceType[]) {
      reliability[source] = this.calculateReliability(source);
    }
    return reliability as Record<SourceType, number>;
  }

  /**
   * Récupère les statistiques
   */
  getStats(): {
    totalCalculations: number;
    highConfidenceRate: number;
    mediumConfidenceRate: number;
    lowConfidenceRate: number;
    rejectionRate: number;
    avgConfidence: number;
  } {
    const total = this.stats.totalCalculations;
    return {
      totalCalculations: total,
      highConfidenceRate: total > 0 ? this.stats.highConfidenceCount / total : 0,
      mediumConfidenceRate: total > 0 ? this.stats.mediumConfidenceCount / total : 0,
      lowConfidenceRate: total > 0 ? this.stats.lowConfidenceCount / total : 0,
      rejectionRate: total > 0 ? this.stats.rejectedCount / total : 0,
      avgConfidence: Math.round(this.stats.avgConfidence * 100) / 100
    };
  }

  /**
   * Réinitialise les statistiques
   */
  resetStats(): void {
    this.stats = {
      totalCalculations: 0,
      highConfidenceCount: 0,
      mediumConfidenceCount: 0,
      lowConfidenceCount: 0,
      rejectedCount: 0,
      avgConfidence: 0
    };
    logSuccess('Statistiques réinitialisées');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const sourceConfidence = new SourceConfidence();
export default sourceConfidence;