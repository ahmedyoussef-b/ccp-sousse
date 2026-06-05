/**
 * @fileOverview RiskAssessor - Évaluation du risque pour exécution adaptative.
 * @version 1.0.0
 */

export enum RiskLevel {
  LOW = 0.2,      // Actions de lecture, vérification simple
  MEDIUM = 0.5,   // Actions de configuration mineure
  HIGH = 0.8,     // Actions sur vannes, pompes, turbines
  CRITICAL = 1.0  // Actions de sécurité, arrêt d'urgence, purge
}

export interface RiskEvaluation {
  score: number;
  reason: string;
  recommendSnapshot: boolean;
}

class RiskAssessor {
  // Mots-clés classés par danger
  private readonly CRITICAL_KEYWORDS = ['arret', 'stop', 'purge', 'urgence', 'shutdown', 'trip', 'consignation'];
  private readonly HIGH_KEYWORDS = ['ouvrir', 'fermer', 'demarrer', 'start', 'vanne', 'pompe', 'allumer', 'bypass'];
  private readonly MEDIUM_KEYWORDS = ['configurer', 'set', 'ajuster', 'limite', 'seuil', 'alarm', 'reset'];

  /**
   * Évalue le risque d'une action basée sur son type et sa description
   */
  public evaluate(action: any, _params: any): RiskEvaluation {
    const description = (action.description || action.type || '').toLowerCase();
    const type = (action.type || '').toLowerCase();
    const combined = `${type} ${description}`;

    let score = RiskLevel.LOW;
    let reason = "Action jugée comme faible risque par défaut.";

    // Détection des niveaux de risque
    if (this.CRITICAL_KEYWORDS.some(kw => combined.includes(kw))) {
      score = RiskLevel.CRITICAL;
      reason = "Mot-clé critique de sécurité détecté.";
    } else if (this.HIGH_KEYWORDS.some(kw => combined.includes(kw))) {
      score = RiskLevel.HIGH;
      reason = "Action physique sur organe haute pression/puissance détectée.";
    } else if (this.MEDIUM_KEYWORDS.some(kw => combined.includes(kw))) {
      score = RiskLevel.MEDIUM;
      reason = "Modification de paramètre système détectée.";
    }

    // Un snapshot est recommandé si le score dépasse 0.4
    return {
      score,
      reason,
      recommendSnapshot: score > 0.4
    };
  }

  /**
   * Calcule un score hybride prenant en compte l'historique (simulé)
   * @param failureRate Taux d'échec historique de cette action (0.0 - 1.0)
   */
  public getWeightedScore(baseScore: number, failureRate: number): number {
    // Si une action échoue souvent, on augmente son risque
    return Math.min(1.0, baseScore + (failureRate * 0.3));
  }
}

export const riskAssessor = new RiskAssessor();
