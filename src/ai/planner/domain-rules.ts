/**
 * @fileOverview Domain Rules for Neuro-Symbolic Planning
 * Définit les contrats pour la validation déterministe des plans industriels.
 */

export type PredicateType = 'vanne' | 'pression' | 'temperature' | 'consignation' | 'vibration' | 'electricite' | 'general';

export interface SymbolicRule {
  id: string;
  description: string;
  type: PredicateType;
  ifActionMatches: string[]; // Keywords ou Regex pour l'action
  preConditions: string[];   // Ce qui doit être vrai avant (ID d'autres règles ou entités)
  postConditions: string[];  // Ce qui devient vrai après
  safetyMessage: string;     // Message d'erreur si la règle est violée
  severity: 'critical' | 'warning';
}

export interface DomainDomain {
  "@context": string;
  "@type": string;
  name: string;
  rules: SymbolicRule[];
}

export interface ValidationViolation {
  stepId: string;
  description: string;
  ruleId: string;
  message: string;
  severity: 'critical' | 'warning';
}
