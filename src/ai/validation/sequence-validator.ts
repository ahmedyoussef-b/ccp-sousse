/**
 * @fileOverview SequenceValidator - Détection de trajectoires dangereuses.
 * @version 1.0.0
 */

import { Step } from '../actions/hierarchical-planner';

export interface PlantState {
  valves: Record<string, 'OPEN' | 'CLOSED'>;
  pumps: Record<string, 'RUNNING' | 'STOPPED'>;
  pressure: number;
  temperature: number;
}

export interface SequenceViolation {
  startIndex: number;
  endIndex: number;
  message: string;
  severity: 'medium' | 'high' | 'critical';
}

class SequenceValidator {
  /**
   * Valide une séquence d'actions (fenêtre glissante)
   * @param steps Les étapes à valider
   * @param _initialState État initial théorique
   */
  public validateSequence(steps: Step[], _initialState?: PlantState): SequenceViolation[] {
    const violations: SequenceViolation[] = [];

    // Analyse lookahead (Fenêtre de 3)
    let lastViolationIndex = -1;
    for (let i = 0; i < steps.length; i++) {
        const window = steps.slice(i, i + 3);
        const windowViolation = this.checkWindow(window, i);
        
        // Anti-doublon : Si on a déjà reporté une violation commençant ici ou juste avant
        if (windowViolation && i > lastViolationIndex) {
            violations.push(windowViolation);
            lastViolationIndex = i + window.length - 2; // Évite de re-déclencher sur la même fin
        }
    }

    return violations;
  }

  /**
   * Vérifie une fenêtre spécifique d'actions pour des patterns HAZOP interdits
   */
  private checkWindow(window: Step[], startIndex: number): SequenceViolation | null {
    const descriptions = window.map(s => s.description.toLowerCase());
    
    // Pattern 1: Ouverture purge PUIS fermeture admission sans vérification
    // Risque: Surpression par coup de bélier ou accumulation
    if (this.matchesPattern(descriptions, ['purge', 'fermer admission'])) {
        return {
            startIndex,
            endIndex: startIndex + descriptions.length - 1,
            message: "Séquence dangereuse détectée : Une Purge basse ne doit pas être suivie immédiatement d'une fermeture d'admission sans équilibrage.",
            severity: 'high'
        };
    }

    // Pattern 2: Démarrage pompe PUIS fermeture vanne refoulement
    // Risque: Cavitation ou éclatement conduite
    if (this.matchesPattern(descriptions, ['demarrer pompe', 'fermer vanne refoulement'])) {
        return {
            startIndex,
            endIndex: startIndex + descriptions.length - 1,
            message: "Risque de cavitation/surpression : Fermer le refoulement juste après avoir démarré la pompe est interdit.",
            severity: 'critical'
        };
    }

    // Pattern 3: Montée en température PUIS arrêt lubrification
    // Risque: Grippage turbine/moteur
    if (this.matchesPattern(descriptions, ['temperature', 'lubrification'])) {
        if (descriptions[0].includes('montee') && descriptions[1].includes('arret')) {
             return {
                startIndex,
                endIndex: startIndex + descriptions.length - 1,
                message: "Alerte Thermique : L'arrêt de la lubrification pendant ou juste après une montée en température est une violation critique.",
                severity: 'critical'
            };
        }
    }

    return null;
  }

  private matchesPattern(descriptions: string[], patterns: string[]): boolean {
    if (descriptions.length < patterns.length) return false;
    
    // Vérifie si les patterns apparaissent dans l'ordre dans la fenêtre
    let lastIndex = -1;
    for (const pattern of patterns) {
        const foundIndex = descriptions.findIndex((d, idx) => idx > lastIndex && d.includes(pattern));
        if (foundIndex === -1) return false;
        lastIndex = foundIndex;
    }
    return true;
  }

}

export const sequenceValidator = new SequenceValidator();
