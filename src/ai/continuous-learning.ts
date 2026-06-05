/**
 * @fileOverview ContinuousLearning - Apprentissage local basé sur les corrections utilisateur.
 * Gère la persistance des règles apprises et l'application du post-traitement.
 */

export interface CorrectionEntry {
  original: string;
  corrected: string;
  count: number;
}

export interface LearningRule {
  pattern: string;
  replacement: string;
}

const LEARNING_STORAGE_KEY = 'AGENTIC_LEARNING_DATA_V1';

export class ContinuousLearningEngine {
  private corrections: Map<string, CorrectionEntry> = new Map();
  private rules: LearningRule[] = [];
  private threshold = 3; // Nombre de corrections identiques avant création d'une règle

  constructor() {
    this.load();
  }

  /**
   * Enregistre une correction utilisateur.
   */
  async recordCorrection(original: string, corrected: string): Promise<boolean> {
    const key = original.trim().toLowerCase();
    const existing = this.corrections.get(key);

    if (existing && existing.corrected === corrected) {
      existing.count++;
      if (existing.count >= this.threshold) {
        this.addRule(original, corrected);
      }
    } else {
      this.corrections.set(key, { original, corrected, count: 1 });
    }

    this.save();
    return true;
  }

  /**
   * Applique les règles apprises sur un texte.
   */
  applyRules(text: string): string {
    let result = text;
    this.rules.forEach(rule => {
      // Simple remplacement pour l'instant (peut être étendu à du Regex)
      if (result.includes(rule.pattern)) {
        result = result.split(rule.pattern).join(rule.replacement);
      }
    });
    return result;
  }

  private addRule(pattern: string, replacement: string) {
    if (!this.rules.some(r => r.pattern === pattern)) {
      this.rules.push({ pattern, replacement });
      console.log(`[AI][LEARNING] Nouvelle règle apprise : "${pattern}" -> "${replacement}"`);
    }
  }

  private save() {
    if (typeof window === 'undefined') return;
    const data = {
      corrections: Array.from(this.corrections.entries()),
      rules: this.rules
    };
    localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(data));
  }

  private load() {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(LEARNING_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.corrections = new Map(parsed.corrections || []);
        this.rules = parsed.rules || [];
      }
    } catch (e) {
      console.error("[AI][LEARNING] Erreur chargement apprentissage :", e);
    }
  }

  getRulesCount(): number {
    return this.rules.length;
  }
}

export const continuousLearning = new ContinuousLearningEngine();
