/**
 * @fileOverview SymbolicValidator - Le moteur de vérification déterministe.
 * @version 1.0.0
 */

import fs from 'fs';
import path from 'path';
import { DomainDomain, SymbolicRule, ValidationViolation } from './domain-rules';
import { Step } from '../actions/hierarchical-planner';

export class SymbolicValidator {
  private rules: SymbolicRule[] = [];
  private state: Set<string> = new Set();

  constructor(rulesPath: string = 'data/rules/industrial-safety.json-ld') {
    this.loadRules(rulesPath);
  }

  private loadRules(rulesPath: string) {
    try {
      const fullPath = path.resolve(process.cwd(), rulesPath);
      if (fs.existsSync(fullPath)) {
        const data: DomainDomain = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        this.rules = data.rules;
        console.log(`[SYMBOLIC-VALIDATOR] ${this.rules.length} règles chargées.`);
      }
    } catch (error) {
      console.error('[SYMBOLIC-VALIDATOR] Erreur de chargement des règles:', error);
    }
  }

  /**
   * Valide un plan complet
   */
  public async validatePlan(steps: Step[]): Promise<ValidationViolation[]> {
    const violations: ValidationViolation[] = [];
    this.state.clear(); // Réinitialise l'état universel pour ce plan

    // Extraction récursive pour avoir une liste plate chronologique
    const flattenedSteps = this.flattenSteps(steps);

    for (const step of flattenedSteps) {
      const stepViolations = this.checkStep(step);
      violations.push(...stepViolations);
      
      // Mise à jour de l'état symbolique après l'étape (PostConditions)
      this.updateState(step);
    }

    return violations;
  }

  private flattenSteps(steps: Step[]): Step[] {
    let flattened: Step[] = [];
    for (const step of steps) {
      if (step.subSteps && step.subSteps.length > 0) {
        flattened.push(...this.flattenSteps(step.subSteps));
      } else {
        flattened.push(step);
      }
    }
    return flattened;
  }

  private checkStep(step: Step): ValidationViolation[] {
    const stepViolations: ValidationViolation[] = [];
    const desc = step.description.toLowerCase();

    for (const rule of this.rules) {
      // Si l'action correspond à une règle
      if (rule.ifActionMatches.some(k => desc.includes(k.toLowerCase()))) {
        // Vérifier les Pré-conditions
        for (const pre of rule.preConditions) {
          if (!this.state.has(pre)) {
            stepViolations.push({
              stepId: step.id,
              description: step.description,
              ruleId: rule.id,
              message: rule.safetyMessage,
              severity: rule.severity
            });
          }
        }
      }
    }

    return stepViolations;
  }

  private updateState(step: Step) {
    const desc = step.description.toLowerCase();
    
    // Détection heuristique simplifiée des faits accomplis
    // Dans une version avancée, on utiliserait un extracteur LLM pour les PostConditions
    for (const rule of this.rules) {
        // Si l'action ressemble à une étape de préparation
        if (desc.includes('verifier') || desc.includes('check') || desc.includes('activer') || desc.includes('consignation')) {
            // On regarde si on peut déduire une post-condition
            // Idéalement, on cherche des mots-clés spécifiques aux conditions
            if (desc.includes('pression')) this.state.add('pression_basse_verifiee');
            if (desc.includes('consignation')) this.state.add('consignation_active');
            if (desc.includes('capteur') || desc.includes('monitoring')) this.state.add('capteurs_actifs');
            if (desc.includes('vibration')) this.state.add('monitoring_vibration_ok');
            if (desc.includes('niveau') && desc.includes('eau')) this.state.add('niveau_eau_ok');
        }
        
        // PostConditions explicites si l'action correspond à la règle
        if (rule.ifActionMatches.some(k => desc.includes(k.toLowerCase()))) {
            rule.postConditions.forEach(pc => this.state.add(pc));
        }
    }
  }
}

export const symbolicValidator = new SymbolicValidator();
