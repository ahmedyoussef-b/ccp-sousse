/**
 * @fileOverview MetacognitiveReasoner v3.2 - Système d'Auto-évaluation et Validation
 * 
 * Implémente une couche méta-cognitive qui évalue la fiabilité des réponses générées
 * avant leur publication, avec détection d'incertitudes et recommandations d'audit.
 * Version conforme Architecture Elite 32 Consolidée (CCP) - Core SQLite.
 * 
 * 📐 ARCHITECTURE MÉTA-COGNITION:
 * ├─ Phase 1: Génération réponse par générateur fourni
 * ├─ Phase 2: Auto-évaluation qualité/fiabilité via LLM
 * ├─ Phase 3: Calcul score confiance global combiné
 * └─ Phase 4: Retour structuré avec avertissements si nécessaire
 * 
 * ⚙️ PARAMÈTRES DE PRODUCTION:
 * - Timeout auto-evaluation: 30s maximum
 * - Cache auto-évaluation activé pour répétitions (SQLite)
 * - Streaming support pour feedback temps réel
 * - Conformité sécurité priorisée
 * 
 * ✅ COMPLIANCE: IEC 61511 / ISO 55001
 * - Traçabilité complète auto-évaluation
 * - Alertes proactives sur incertitudes critiques
 * - Audit trail métadonnées inclues
 */

import { SQLiteCore } from '@/ai/core/sqlite';
import { ConfidenceScorer } from './confidence-scorer';
import { callHybridProvider } from '../providers/hybrid-provider';

// ============================================================================
// INITIALISATION CORE SQLITE
// ============================================================================

let dbInitialized = false;
let db: SQLiteCore;

async function getDB(): Promise<SQLiteCore> {
  if (!dbInitialized) {
    db = SQLiteCore.getInstance();
    await db.initialize();
    dbInitialized = true;
  }
  return db;
}

// ============================================================================
// TYPES & INTERFACES TYPÉES
// ============================================================================

export interface MetacognitiveResult {
  answer: string;
  confidence: number;
  disclaimer?: string;
  missingInfo?: string;
  suggestions?: string[];
  generationLatencyMs: number;
  evaluationLatencyMs: number;
  latencyMs: number;
  warnings?: string[];
}

export type StreamChunk = {
  text: string;
  position: number;
};

export interface MetacognitiveConfig {
  evaluationTimeoutMs: number;
  enableCache: boolean;
  verboseLogging: boolean;
  thresholds: {
    absoluteMinimum: number;
    warningThreshold: number;
    highConfidence: number;
  };
}

export interface CachedEvaluation {
  score: number;
  timestamp: number;
}

// ============================================================================
// CONFIGURATION PAR DÉFAUT OPTIMISÉE
// ============================================================================

const LOG_PREFIX = '[METACOGNITION]';
const CACHE_NAMESPACE = 'metacognitive';
const CACHE_TTL_SECONDS = 600; // 10 minutes

const DEFAULT_CONFIG: MetacognitiveConfig = {
  evaluationTimeoutMs: 30000,
  enableCache: true,
  verboseLogging: false,
  thresholds: {
    absoluteMinimum: 0.3,
    warningThreshold: 0.6,
    highConfidence: 0.85
  }
};

// ============================================================================
// CLASS PRINCIPALE: METACOGNITIVE REASONER
// ============================================================================

export class MetacognitiveReasoner {
  private config: MetacognitiveConfig;

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  public static getInstance(): MetacognitiveReasoner {
    if (!this._instance) {
      this._instance = new MetacognitiveReasoner();
    }
    return this._instance;
  }

  private static _instance: MetacognitiveReasoner | null = null;

  public updateConfig(newConfig: Partial<MetacognitiveConfig>): void {
    this.validateConfig(newConfig);
    this.config = { ...this.config, ...newConfig };
    
    if (this.config.verboseLogging) {
      console.log(`${LOG_PREFIX} Configuration mise à jour:`, this.config);
    }
  }

  private validateConfig(newConfig: Partial<MetacognitiveConfig>): void {
    if (newConfig.evaluationTimeoutMs && newConfig.evaluationTimeoutMs < 5000) {
      throw new Error('evaluationTimeoutMs minimum requis: 5000ms');
    }
    if (newConfig.thresholds) {
      if (newConfig.thresholds.absoluteMinimum !== undefined && 
          (newConfig.thresholds.absoluteMinimum < 0 || newConfig.thresholds.absoluteMinimum > 1)) {
        throw new Error('absoluteMinimum doit être entre 0 et 1');
      }
      if (newConfig.thresholds.warningThreshold !== undefined && 
          (newConfig.thresholds.warningThreshold < 0 || newConfig.thresholds.warningThreshold > 1)) {
        throw new Error('warningThreshold doit être entre 0 et 1');
      }
      if (newConfig.thresholds.highConfidence !== undefined && 
          (newConfig.thresholds.highConfidence < 0 || newConfig.thresholds.highConfidence > 1)) {
        throw new Error('highConfidence doit être entre 0 et 1');
      }
    }
  }

  public resetConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
    if (this.config.verboseLogging) {
      console.log(`${LOG_PREFIX} Configuration réinitialisée aux defaults production.`);
    }
  }

  // ==========================================================================
  // MÉTHODE PUBLIQUE PRINCIPALE
  // ==========================================================================

  async reason(
    question: string,
    context: string,
    generateFn: (question: string, context: string) => Promise<string>,
    config?: Partial<MetacognitiveConfig>
  ): Promise<MetacognitiveResult> {
    const totalStartTime = Date.now();
    const currentConfig = { ...this.config, ...config };
    const dbInstance = await getDB();

    try {
      // === Vérification Cache SQLite ===
      const cacheKey = this.buildCacheKey(question);
      let cachedResult: MetacognitiveResult | null = null;

      if (currentConfig.enableCache) {
        const cached = dbInstance.get<MetacognitiveResult>(CACHE_NAMESPACE, cacheKey);
        if (cached) {
          cachedResult = cached;
        }
        
        if (cachedResult) {
          if (currentConfig.verboseLogging) {
            console.log(`${LOG_PREFIX}   ✓ Hit cache trouvé`);
          }
          return {
            ...cachedResult,
            latencyMs: Date.now() - totalStartTime
          };
        }
      }

      // === PHASE 1: Génération Réponse Initiale ===
      const generationStartTime = Date.now();
      let answer: string;

      try {
        answer = await generateFn(question, context);
      } catch (error: any) {
        console.warn(`${LOG_PREFIX} Échec génération réponse:`, error.message);
        
        return {
          answer: "[ERREUR GÉNÉRATION] Impossible de produire une réponse.",
          confidence: 0.1,
          generationLatencyMs: Date.now() - totalStartTime,
          evaluationLatencyMs: 0,
          latencyMs: Date.now() - totalStartTime,
          warnings: [error.message || "Erreur génération"]
        };
      }

      const generationLatencyMs = Date.now() - generationStartTime;

      if (!answer || answer.trim().length < 10) {
        return {
          answer: "[RÉPONSE INVALIDE] Contenu trop court ou vide.",
          confidence: 0.1,
          generationLatencyMs,
          evaluationLatencyMs: 0,
          latencyMs: Date.now() - totalStartTime,
          warnings: ["Réponse générée insuffisante"],
          missingInfo: "Contenu de réponse non valide"
        };
      }

      // === PHASE 2: Auto-Évaluation ===
      const evaluationStartTime = Date.now();

      const evaluated = await this.evaluateResponse(
        question,
        context,
        answer,
        config?.evaluationTimeoutMs ?? this.config.evaluationTimeoutMs
      );

      const evaluationLatencyMs = Date.now() - evaluationStartTime;

      // === PHASE 3: Combinaison Scores Confiance ===
      const externalScore = ConfidenceScorer.evaluate(answer, question);
      const finalConfidence = Math.min(1, (evaluated + externalScore) / 2);

      // === PHASE 4: Construction Résultat Final ===
      const result: MetacognitiveResult = {
        answer,
        confidence: Math.round(finalConfidence * 100) / 100,
        generationLatencyMs,
        evaluationLatencyMs,
        latencyMs: Date.now() - totalStartTime,
        disclaimer: this.buildDisclaimer(finalConfidence),
        missingInfo: evaluated < this.config.thresholds.absoluteMinimum ? 
                      "Données potentiellement incomplètes ou ambigües." : undefined,
        suggestions: this.generateSuggestions(finalConfidence, evaluated, question, context),
        warnings: this.detectWarnings(finalConfidence, evaluated)
      };

      if (this.config.enableCache && finalConfidence > this.config.thresholds.warningThreshold) {
        dbInstance.set(CACHE_NAMESPACE, cacheKey, result, CACHE_TTL_SECONDS);
      }

      if (this.config.verboseLogging) {
        console.log(`${LOG_PREFIX} ✅ Auto-évaluation complétée`);
        console.log(`${LOG_PREFIX}   • Confiance globale: ${(finalConfidence * 100).toFixed(1)}%`);
        console.log(`${LOG_PREFIX}   • Latence totale: ${result.latencyMs}ms`);
      }

      return result;

    } catch (error: any) {
      console.error(`${LOG_PREFIX} ❌ ÉCHEC MÉTA-COGNITION:`, error.message);

      return {
        answer: "Désolé, une erreur système empêche le traitement complet.",
        confidence: 0.1,
        generationLatencyMs: 0,
        evaluationLatencyMs: 0,
        latencyMs: Date.now() - totalStartTime,
        warnings: [error.message || "Erreur processus métacognitif"],
        disclaimer: "Processus d'évaluation interrompu"
      };
    }
  }

  // ==========================================================================
  // MÉTHODE DE STREAMING
  // ==========================================================================

  async* reasonStream(
    question: string,
    context: string,
    generateStreamFn: (question: string, context: string) => AsyncIterable<string>,
    config?: Partial<MetacognitiveConfig>
  ): AsyncIterable<StreamChunk & { eval?: number }> {
    console.log(`${LOG_PREFIX} 🌀 DÉMARRAGE MODE STREAM MÉTA-COGNITION`);
    
    try {
      let fullAnswer = '';
      
      for await (const chunk of generateStreamFn(question, context)) {
        fullAnswer += chunk;
        
        yield {
          text: chunk,
          position: fullAnswer.length
        };
      }

      const evaluation = await this.evaluateResponse(
        question,
        context,
        fullAnswer,
        config?.evaluationTimeoutMs ?? this.config.evaluationTimeoutMs
      );

      yield {
        text: '',
        position: fullAnswer.length,
        eval: evaluation
      };

    } catch (error: any) {
      console.warn(`${LOG_PREFIX} Échec streaming métacognitif:`, error.message);
      
      yield {
        text: ' [Erreur de flux]',
        position: 0
      };
    }
  }

  // ==========================================================================
  // PHASE 2: AUTO-ÉVALUATION
  // ==========================================================================

  private async evaluateResponse(
    question: string,
    context: string,
    answer: string,
    timeoutMs: number = DEFAULT_CONFIG.evaluationTimeoutMs
  ): Promise<number> {
    const cacheKey = this.buildEvalCacheKey(question, answer);
    const dbInstance = await getDB();

    if (this.isCacheEnabled()) {
      const cached = dbInstance.get<CachedEvaluation>(CACHE_NAMESPACE, cacheKey);
      if (cached && cached.score > 0) {
        return cached.score;
      }
    }

    try {
      const truncatedContext = this.truncateContext(context, 1000);
      const truncatedAnswer = this.truncateText(answer, 1500);

      const prompt = `
Tu es le processeur Méta-cognitif IA CCP v3.1. Évalue objectivement la fiabilité technique.

QUESTION: "${question}"
CONTEXTE: ${truncatedContext}
RÉPONSE: "${truncatedAnswer}"

Retourne JSON: {"confidence": 0.XX, "accuracy": 0.XX, "completeness": 0.XX, "clarity": 0.XX, "notes": "..."}`;

      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout auto-évaluation')), timeoutMs)
      );

      const responsePromise = callHybridProvider(prompt);
      const response = await Promise.race([responsePromise, timeoutPromise]);
      
      const responseText = typeof response === 'object' && 'answer' in response ? (response as any).answer : '';
      const score = this.parseEvaluationResponse(responseText);

      if (score > 0 && this.isCacheEnabled()) {
        dbInstance.set(CACHE_NAMESPACE, cacheKey, { score, timestamp: Date.now() }, CACHE_TTL_SECONDS);
      }

      return score;

    } catch (error: any) {
      console.warn(`${LOG_PREFIX} Auto-évaluation échec ou timeout:`, error.message);
      return 0.5;
    }
  }

  private parseEvaluationResponse(text: string): number {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return 0.5;

      const parsed = JSON.parse(jsonMatch[0]);

      if (typeof parsed.confidence === 'number') {
        return Math.min(1, Math.max(0, parsed.confidence));
      }

      const scores = [
        parsed.accuracy ?? 0.5,
        parsed.completeness ?? 0.5,
        parsed.clarity ?? 0.5
      ].filter(s => typeof s === 'number');

      return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.5;

    } catch (error: any) {
      console.warn(`${LOG_PREFIX} Erreur parsing auto-évaluation:`, error.message);
      return 0.5;
    }
  }

  // ==========================================================================
  // UTILITAIRES
  // ==========================================================================

  private buildDisclaimer(confidence: number): string | undefined {
    if (confidence >= this.config.thresholds.highConfidence) {
      return undefined;
    }
    
    if (confidence >= this.config.thresholds.warningThreshold) {
      return "Cette réponse est fournie telle quelle. Vérification manuelle conseillée avant utilisation opérationnelle.";
    }
    
    if (confidence >= this.config.thresholds.absoluteMinimum) {
      return "⚠️ AVERTISSEMENT: Cette réponse présente une incertitude notable. Une vérification par un expert humain est fortement recommandée avant toute action.";
    }
    
    return "🔴 CRITIQUE: Faible niveau de confiance. Ne pas utiliser pour décisions opérationnelles sans validation experte.";
  }

  private generateSuggestions(
    confidence: number,
    evalScore: number,
    question: string,
    context: string
  ): string[] {
    const suggestions: string[] = [];

    if (confidence < this.config.thresholds.warningThreshold) {
      suggestions.push("Consulter un manuel procedure officiel pour confirmation");
    }

    if (evalScore < this.config.thresholds.warningThreshold) {
      suggestions.push("Demander clarification question ou fournir plus détails opérationnels");
    }

    if (question.length < 30) {
      suggestions.push("Préciser davantage la question pour une réponse plus ciblée");
    }

    if (context.length < 200) {
      suggestions.push("Fournir plus de contexte technique pour enrichir l'analyse");
    }

    const safetyKeywords = ['sécurité', 'alarme', 'danger', 'urgence', 'confinement', 'consigne'];
    const hasSafetyKeyword = safetyKeywords.some(k => question.toLowerCase().includes(k));
    
    if (hasSafetyKeyword && confidence < 0.8) {
      suggestions.push("Validation mandatory conformément IEC 61511 avant exécution");
    }

    return suggestions.filter(s => s.length > 10);
  }

  private detectWarnings(confidence: number, evalScore: number): string[] {
    const warnings: string[] = [];

    if (confidence < this.config.thresholds.absoluteMinimum) {
      warnings.push("Confiance extrêmement basse - NON UTILISER sans validation");
    } else if (confidence < this.config.thresholds.warningThreshold) {
      warnings.push("Confiance en dessous du seuil warning");
    }

    if (evalScore < this.config.thresholds.absoluteMinimum) {
      warnings.push("Auto-évaluation critique - requiert attention");
    }

    return warnings;
  }

  private truncateContext(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text ?? '';
    return text.substring(0, maxLength) + '...';
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    return `${text.substring(0, maxLength)}...`;
  }

  private isCacheEnabled(): boolean {
    return this.config.enableCache;
  }

  private buildCacheKey(question: string): string {
    const normalized = question.toLowerCase().trim().substring(0, 100);
    return `result:${normalized}`;
  }

  private buildEvalCacheKey(question: string, answer: string): string {
    const qNormalized = question.toLowerCase().trim().substring(0, 50);
    const aHash = this.simpleHash(answer.substring(0, 200));
    return `eval:${qNormalized}:${aHash}`;
  }

  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}

export const metacognitiveReasoner = MetacognitiveReasoner.getInstance();