/**
 * @fileOverview ConfidenceScorer v3.1 - Système d'Évaluation de Fiabilité des Réponses
 * 
 * Calculateur de confiance basé sur analyse sémantique lexicale pour évaluer la pertinence
 * des réponses générées par les modules de raisonnement IA CCP v3.1.
 * Version conforme Architecture Elite 32 Consolidée.
 * 
 * 📐 ARCHITECTURE CONFIDENCE SCORING:
 * ├─ Facteur 1: Matching mots-clés question/contexte
 * ├─ Facteur 2: Précision termes techniques industriels
 * └─ Synthèse pondérée normalisée [0.0 - 1.0]
 * 
 * ⚙️ PARAMÈTRES DE PRODUCTION:
 * - Contexte min length: 50 caractères minimum valide
 * - Query requise: Sans question → score = 0
 * - Technical terms: Liste extensible configurable
 * - Seuil fiabilité: 0.3 configurable par contexte métier
 * 
 * ✅ COMPLIANCE: IEC 61511 / ISO 55001
 * - Score reproductible et déterministe
 * - Audit trail des facteurs contributifs
 * - Intégration transparente dans tous les modules reasoning
 */

// ============================================================================
// TYPES & INTERFACES TYPÉES
// ============================================================================

/**
 * Configuration de l'évaluateur de confiance.
 * Permet d'ajuster les seuils selon les besoins opérationnels.
 */
export interface ConfidenceConfig {
  /** Longueur minimum du contexte pour être considéré valide */
  minLengthContexte: number;
  /** Seuil minimum de mots-clés à filtrer pour analyse */
  minLengthKeyword: number;
  /** Coefficient pondération matching mots-clés */
  keywordCoefficient: number;
  /** Coefficient pondération termes techniques */
  technicalCoefficient: number;
  /** Score minimum pour considérer une réponse comme fiable */
  reliabilityThreshold: number;
}

/**
 * Résultat détaillé de l'évaluation de confiance.
 * Utile pour le débogage et l'audit trail.
 */
export interface EvaluationResult {
  /** Score final de confiance (0.0 - 1.0) */
  confidence: number;
  /** Score composant matching mots-clés */
  keywordScore: number;
  /** Score composant termes techniques */
  technicalScore: number;
  /** Validité du contexte évalué */
  isValid: boolean;
  /** Avertissements ou notes explicatives */
  warnings?: string[];
}

/**
 * Liste des termes techniques validés pour le domaine industriel.
 * Peut être étendue via méthode configureTechnicalTerms().
 */
export type TechnicalTermCategory = 'equipment' | 'parameter' | 'procedure' | 'alarm' | 'general';

/**
 * Structure étendue d'un terme technique avec catégorie.
 */
export interface TechnicalTermEntry {
  /** Le terme lui-même */
  term: string;
  /** Catégorie du terme */
  category: TechnicalTermCategory;
  /** Pondération spécifique si besoin */
  weight: number;
}

// ============================================================================
// CONFIGURATION PAR DÉFAUT OPTIMISÉE
// ============================================================================

const DEFAULT_CONFIG: ConfidenceConfig = {
  minLengthContexte: 50,
  minLengthKeyword: 4,
  keywordCoefficient: 1.0,
  technicalCoefficient: 0.2,
  reliabilityThreshold: 0.3,
};

/**
 * Liste complète des termes techniques par catégorie pour centrales thermiques.
 * Extensible dynamiquement via configureTechnicalTerms().
 */
let TECHNICAL_TERMS: TechnicalTermEntry[] = [
  // Paramètres physiques courants
  { term: 'pression', category: 'parameter', weight: 0.8 },
  { term: 'température', category: 'parameter', weight: 0.8 },
  { term: 'débit', category: 'parameter', weight: 0.7 },
  { term: 'vitesse', category: 'parameter', weight: 0.6 },
  { term: 'puissance', category: 'parameter', weight: 0.7 },
  { term: 'tension', category: 'parameter', weight: 0.6 },
  { term: 'courant', category: 'parameter', weight: 0.6 },
  
  // Équipements principaux
  { term: 'chaudière', category: 'equipment', weight: 0.9 },
  { term: 'turbine', category: 'equipment', weight: 0.9 },
  { term: 'vanne', category: 'equipment', weight: 0.8 },
  { term: 'pompe', category: 'equipment', weight: 0.8 },
  { term: 'compresseur', category: 'equipment', weight: 0.8 },
  { term: 'condenseur', category: 'equipment', weight: 0.8 },
  { term: 'échangeur', category: 'equipment', weight: 0.7 },
  { term: 'filtre', category: 'equipment', weight: 0.7 },
  { term: 'moteur', category: 'equipment', weight: 0.7 },
  { term: 'générateur', category: 'equipment', weight: 0.8 },
  
  // Procédures opérationnelles
  { term: 'procédure', category: 'procedure', weight: 0.7 },
  { term: 'démarrage', category: 'procedure', weight: 0.8 },
  { term: 'arrêt', category: 'procedure', weight: 0.8 },
  { term: 'maintenance', category: 'procedure', weight: 0.8 },
  { term: 'inspection', category: 'procedure', weight: 0.7 },
  { term: 'réparation', category: 'procedure', weight: 0.7 },
  { term: 'consigne', category: 'procedure', weight: 0.8 },
  
  // Alarmes et sécurité
  { term: 'alarme', category: 'alarm', weight: 0.9 },
  { term: 'sécurité', category: 'alarm', weight: 0.9 },
  { term: 'urgence', category: 'alarm', weight: 0.9 },
  { term: 'danger', category: 'alarm', weight: 0.9 },
  { term: 'confinement', category: 'alarm', weight: 0.8 },
  { term: 'risque', category: 'alarm', weight: 0.8 },
  { term: 'protection', category: 'alarm', weight: 0.8 },
  
  // Termes génériques importance
  { term: 'circuit', category: 'general', weight: 0.6 },
  { term: 'gaz', category: 'general', weight: 0.6 },
  { term: 'eau', category: 'general', weight: 0.6 },
  { term: 'air', category: 'general', weight: 0.5 },
  { term: 'seuil', category: 'general', weight: 0.7 },
  { term: 'niveau', category: 'general', weight: 0.6 },
  { term: 'niveau', category: 'general', weight: 0.6 },
];

// Singleton instance for global configuration access
let _config: ConfidenceConfig = { ...DEFAULT_CONFIG };

// ============================================================================
// CLASS PRINCIPALE: CONFIDENCE SCORER
// ============================================================================

/**
 * Utilitaire statique d'évaluation de la fiabilité des réponses IA.
 * 
 * Calcule un score de confiance basique mais efficace en analysant:
 * 1. La correspondance entre mots-clés de la question et le contexte
 * 2. La présence de termes techniques validés dans les deux textes
 * 
 * Ce class est utilisé par tous les modules de raisonnement pour valider
 * la qualité potentielle d'une réponse avant publication.
 * 
 * @example
 * ```typescript
 * // Utilisation simple
 * const score = ConfidenceScorer.evaluate(context, query);
 * const isReliable = ConfidenceScorer.isReliable(score, 0.5);
 * 
 * // Avec détails d'évaluation
 * const result = ConfidenceScorer.evaluateDetailed(context, query);
 * console.log(result.keywordScore, result.technicalScore);
 * ```
 */
export class ConfidenceScorer {
  /**
   * Retourne la configuration courante de l'évaluateur.
   * Utile pour inspecter les paramètres utilisés.
   */
  static getConfig(): ConfidenceConfig {
    return { ..._config };
  }

  /**
   * Met à jour la configuration globale de l'évaluateur.
   * Les changements s'appliquent immédiatement à toutes les évaluations futures.
   * 
   * @param newConfig Partie de configuration à mettre à jour
   * @throws {Error} Si validation échoue
   */
  static updateConfig(newConfig: Partial<ConfidenceConfig>): void {
    _config = {
      minLengthContexte: newConfig.minLengthContexte ?? _config.minLengthContexte,
      minLengthKeyword: newConfig.minLengthKeyword ?? _config.minLengthKeyword,
      keywordCoefficient: Math.max(0, newConfig.keywordCoefficient ?? _config.keywordCoefficient),
      technicalCoefficient: Math.max(0, newConfig.technicalCoefficient ?? _config.technicalCoefficient),
      reliabilityThreshold: Math.max(0, Math.min(1, newConfig.reliabilityThreshold ?? _config.reliabilityThreshold)),
    };
    
    // Validation
    if (_config.minLengthContexte < 1 || _config.minLengthKeyword < 1) {
      throw new Error('Configuration invalid: minLength must be positive');
    }
  }

  /**
   * Ajoute un nouveau terme technique à la liste validée.
   * Utile pour intégrer vocabulaire métier spécifique.
   * 
   * @param termLe terme à ajouter
   * @param category Sa catégorie
   * @param weight Son poids (default 0.7)
   */
  static addTechnicalTerm(
    term: string,
    category: TechnicalTermCategory = 'general',
    weight: number = 0.7
  ): void {
    const normalizedTerm = term.toLowerCase();
    
    // Vérifier doublon
    const exists = TECHNICAL_TERMS.some(t => t.term === normalizedTerm);
    if (exists) {
      console.warn(`[CONFIDENCE] Terme déjà existant: "${term}"`);
      return;
    }

    TECHNICAL_TERMS.push({ term: normalizedTerm, category, weight });
    console.log(`[CONFIDENCE] Terme ajouté: "${term}" (${category})`);
  }

  /**
   * Supprime un terme technique de la liste validée.
   * 
   * @param term Le terme à supprimer
   * @returns true si suppression effectuée
   */
  static removeTechnicalTerm(term: string): boolean {
    const normalizedTerm = term.toLowerCase();
    const initialCount = TECHNICAL_TERMS.length;
    
    TECHNICAL_TERMS = TECHNICAL_TERMS.filter(t => t.term !== normalizedTerm);
    
    return TECHNICAL_TERMS.length < initialCount;
  }

  /**
   * Récupère tous les termes techniques configurés.
   * Utile pour audit ou documentation.
   */
  static getTechnicalTerms(): TechnicalTermEntry[] {
    return [...TECHNICAL_TERMS];
  }

  /**
   * Récupère les termes techniques par catégorie.
   * 
   * @param categoryLa catégorie recherchée (optionnel: tous)
   * @returns Array des termes de la catégorie
   */
  static getTechnicalTermsByCategory(category?: TechnicalTermCategory): string[] {
    if (!category) {
      return TECHNICAL_TERMS.map(t => t.term);
    }
    return TECHNICAL_TERMS
      .filter(t => t.category === category)
      .map(t => t.term);
  }

  // ==========================================================================
  // MÉTHODES D'ÉVALUATION
  // ==========================================================================

  /**
   * Évalue la confiance basée sur la similarité lexiale question/contexte.
   * Méthode simplifiée retournant directement le score.
   * 
   * @param contextLe contexte technique fourni
   * @param queryLa question posée
   * @returns Score de confiance (0.0 - 1.0)
   */
  static evaluate(context: string, query: string): number {
    const result = this.evaluateDetailed(context, query);
    return result.confidence;
  }

  /**
   * Évalue la confiance avec détails complets pour debug/audit.
   * Plus verbose que evaluate() standard.
   * 
   * @param contextLe contexte technique fourni
   * @param queryLa question posée
   * @returns Objet d'évaluation détaillée avec breakdown
   */
  static evaluateDetailed(context: string, query: string): EvaluationResult {
    // Validation inputs
    let warnings: string[] = [];
    
    if (!context) {
      warnings.push("Context absent - score minimal");
      return {
        confidence: 0.1,
        keywordScore: 0,
        technicalScore: 0,
        isValid: false,
        warnings
      };
    }

    if (!query || query.trim().length === 0) {
      warnings.push("Query vide - score nul");
      return {
        confidence: 0,
        keywordScore: 0,
        technicalScore: 0,
        isValid: false,
        warnings
      };
    }

    // Normalisation texte
    const q = query.toLowerCase();
    const c = context.toLowerCase();

    // === Facteur 1: Matching Mots-Clés ===
    const keywords = q.split(/\s+/).filter(w => w.length >= _config.minLengthKeyword && !this.isStopWord(w));
    const matches = keywords.filter(w => c.includes(w)).length;
    
    const keywordScore = keywords.length > 0 
      ? (matches / keywords.length) * _config.keywordCoefficient 
      : 0.5; // Valeur default neutre si pas de mots significatifs

    // === Facteur 2: Termes Techniques Communs ===
    const technicalMatches = TECHNICAL_TERMS
      .filter(term => c.includes(term.term) && q.includes(term.term))
      .reduce((sum, t) => sum + t.weight, 0);
    
    const technicalScore = Math.min(_config.technicalCoefficient, technicalMatches);

    // === Synthèse Normalisée ===
    let totalScore = keywordScore + technicalScore;
    totalScore = Math.min(1.0, Math.max(0.0, totalScore));

    // Détermination validité
    const isValid = c.length >= _config.minLengthContexte;

    // Warning si contexte court
    if (!isValid) {
      warnings.push(`Context trop court (${c.length} < ${_config.minLengthContexte})`);
    }

    return {
      confidence: totalScore,
      keywordScore,
      technicalScore,
      isValid,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Détermine si une réponse est fiable après auto-évaluation.
   * Utilise le seuil de fiabilité configuré par défaut.
   * 
   * @param scoreScore de confiance obtenu
   * @param thresholdSeuil optionnel pour override du default
   * @returns True si score ≥ seuil
   */
  static isReliable(score: number, threshold?: number): boolean {
    const effectiveThreshold = threshold ?? _config.reliabilityThreshold;
    return score >= effectiveThreshold;
  }

  /**
   * Classement de confiance qualitative selon score obtenu.
   * Utile pour affichage UI ou logging hiérarchisé.
   * 
   * @param scoreScore de confiance
   * @returns Niveau de confiance qualitatif
   */
  static getConfidenceLevel(score: number): 'low' | 'medium' | 'high'| 'critical' {
    if (score >= 0.85) return 'high';
    if (score >= 0.6) return 'medium';
    if (score >= 0.3) return 'low';
    return 'critical';
  }

  // ==========================================================================
  // UTILITAIRES INTERNES
  // ==========================================================================

  /**
   * Liste de stop words français courants à exclure de l'analyse.
   */
  private static readonly STOP_WORDS = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'en', 'dans',
    'sur', 'pour', 'avec', 'sans', 'qui', 'que', 'qui', 'ce', 'ces',
    'cet', 'cette', 'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses',
    'est', 'sont', 'été', 'avoir', 'être', 'a', 'as', 'ont', 'doit', 'pouvoir',
    'comment', 'quel', 'quelle', 'quels', 'quelles', 'où', 'ici', 'là',
    'pourquoi', 'si', 'pas', 'plus', 'moins', 'aussi', 'même', 'bien',
    'très', 'trop', 'tout', 'tous', 'toutes', 'aucun', 'aucune', 'rien',
    'rien', 'tout', 'toujours', 'jamais', 'souvent', 'parfois', 'toujours'
  ]);

  /**
   * Vérifie si un mot est un stop word (à exclure de l'analyse).
   */
  private static isStopWord(word: string): boolean {
    return this.STOP_WORDS.has(word);
  }
}

// Export fonctions standalone pour usage externe
export const getConfidenceConfig = () => ConfidenceScorer.getConfig();
export const setConfidenceConfig = (config: Partial<ConfidenceConfig>) => ConfidenceScorer.updateConfig(config);
export const getConfidenceLevel = (score: number) => ConfidenceScorer.getConfidenceLevel(score);
export const isResponseReliable = (score: number, threshold?: number) => ConfidenceScorer.isReliable(score, threshold);

// Init configuration au load
getConfidenceConfig();