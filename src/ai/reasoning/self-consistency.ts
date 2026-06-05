/**
 * @fileOverview SelfConsistencyReasoner v3.2 - Multi-Path Consensus Engine
 * 
 * Implémente une vérification auto-consistante par exploration de multiples
 * chemins de raisonnement et vote majoritaire des conclusions.
 * Version conforme Architecture Elite 32 Consolidée - Core SQLite.
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

export interface ReasoningPath {
  pathId: number;
  approach: string;
  content: string;
  latencyMs: number;
  timestamp: number;
  confidence?: number;
}

export interface SelfConsistencyResult {
  answer: string;
  confidence: number;
  pathsExplored: number;
  agreementLevel: 'high' | 'medium' | 'low' | 'conflict';
  latencyMs: number;
  paths?: ReasoningPath[];
  warnings?: string[];
  source: 'consensus' | 'majority' | 'fallback';
}

export interface SelfConsistencyConfig {
  numPaths: number;
  baseTemperature: number;
  temperatureIncrement: number;
  timeoutMs: number;
  enableCache: boolean;
  verboseLogging: boolean;
}

// ============================================================================
// CONFIGURATION PAR DÉFAUT OPTIMISÉE
// ============================================================================

const LOG_PREFIX = '[SELF-CONSISTENCY]';
const CACHE_NAMESPACE = 'self_consistency';
const CACHE_TTL_SECONDS = 600; // 10 minutes

const DEFAULT_CONFIG: SelfConsistencyConfig = {
  numPaths: 3,
  baseTemperature: 0.5,
  temperatureIncrement: 0.15,
  timeoutMs: 90000,
  enableCache: true,
  verboseLogging: false,
};

const APPROACHES = [
  "Analyse les faits de manière purement logique et déductive.",
  "Vérifie d'abord les contraintes de sécurité et les seuils critiques.",
  "Décompose le problème technique en sous-composants indépendants.",
  "Identifie d'abord les relations causales avant la conclusion.",
  "Synthétise d'abord les aspects opérationnels concrets."
];

// ============================================================================
// CLASS PRINCIPALE: SELF-CONSISTENCY REASONER
// ============================================================================

export class SelfConsistencyReasoner {
  private config: SelfConsistencyConfig;
  private readonly synthesisModel = 'phi:2.7b';

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  public static getInstance(): SelfConsistencyReasoner {
    if (!this._instance) {
      this._instance = new SelfConsistencyReasoner();
    }
    return this._instance;
  }

  private static _instance: SelfConsistencyReasoner | null = null;

  public updateConfig(newConfig: Partial<SelfConsistencyConfig>): void {
    this.validateConfig(newConfig);
    this.config = { ...this.config, ...newConfig };
    console.log(`${LOG_PREFIX} Configuration mise à jour:`, this.config);
  }

  private validateConfig(newConfig: Partial<SelfConsistencyConfig>): void {
    if (newConfig.numPaths && (newConfig.numPaths < 2 || newConfig.numPaths > 10)) {
      throw new Error('numPaths doit être entre 2 et 10');
    }
    if (newConfig.timeoutMs && newConfig.timeoutMs < 10000) {
      throw new Error('timeoutMs minimum requis: 10s');
    }
  }

  public resetConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
  }

  async reason(
    question: string,
    context: string,
    config?: Partial<SelfConsistencyConfig>
  ): Promise<SelfConsistencyResult> {
    const startTime = Date.now();
    const currentConfig = { ...DEFAULT_CONFIG, ...config };
    const dbInstance = await getDB();

    if (currentConfig.verboseLogging) {
      console.log(`${LOG_PREFIX} 🎯 DÉMARRAGE RAISONNEMENT AUTO-CONSISTANT`);
    }

    try {
      // === Vérification Cache SQLite ===
      const cacheKey = this.buildResultKey(question);
      let cachedResult: SelfConsistencyResult | null = null;

      if (currentConfig.enableCache) {
        const cached = dbInstance.get<SelfConsistencyResult>(CACHE_NAMESPACE, cacheKey);
        if (cached) {
          cachedResult = cached;
        }
        
        if (cachedResult) {
          if (currentConfig.verboseLogging) {
            console.log(`${LOG_PREFIX}   ✓ Hit cache trouvé`);
          }
          return {
            ...cachedResult,
            latencyMs: Date.now() - startTime
          };
        }
      }

      // === PHASE 1: Exploration Multiple Chemins ===
      const paths = await this.generateReasoningPaths(
        question,
        context,
        currentConfig.numPaths,
        currentConfig
      );

      // === PHASE 2: Synthèse Consensus Majoritaire ===
      const consensusResult = await this.synthesizeConsensus(
        question,
        paths,
        context,
        this.synthesisModel,
        currentConfig.verboseLogging
      );

      const latencyMs = Date.now() - startTime;

      const agreementLevel = this.calculateAgreementLevel(paths);
      const finalConfidence = Math.min(1, (consensusResult.confidence + ConfidenceScorer.evaluate(question, context)) / 2);

      const result: SelfConsistencyResult = {
        answer: consensusResult.answer,
        confidence: Math.round(finalConfidence * 100) / 100,
        pathsExplored: paths.length,
        agreementLevel,
        latencyMs,
        paths: currentConfig.verboseLogging ? paths : undefined,
        warnings: this.detectWarnings(paths, consensusResult),
        source: this.determineSource(paths, consensusResult)
      };

      if (currentConfig.enableCache && finalConfidence > 0.6) {
        dbInstance.set(CACHE_NAMESPACE, cacheKey, result, CACHE_TTL_SECONDS);
      }

      if (currentConfig.verboseLogging) {
        console.log(`${LOG_PREFIX} ✅ PROCESSUS TERMINÉ en ${latencyMs}ms`);
        console.log(`${LOG_PREFIX}   • Confiance: ${(result.confidence * 100).toFixed(1)}%`);
      }

      return result;

    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      console.error(`${LOG_PREFIX} ❌ ÉCHEC:`, error.message);
      
      return {
        answer: "Désolé, une erreur est survenue lors de la vérification auto-consistante.",
        confidence: 0.1,
        pathsExplored: 0,
        agreementLevel: 'conflict',
        latencyMs,
        warnings: [error.message || "Erreur processus"],
        source: 'fallback'
      };
    }
  }

  // ==========================================================================
  // PHASE 1: GÉNÉRATION CHEMINS DE RAISONNEMENT
  // ==========================================================================

  private async generateReasoningPaths(
    question: string,
    context: string,
    numPaths: number,
    _config: SelfConsistencyConfig
  ): Promise<ReasoningPath[]> {
    const truncatedContext = this.truncateContext(context, 1500);

    const paths = await Promise.all(
      Array(numPaths).fill(null).map(async (_, index) => {
        const pathId = index + 1;
        const approachIndex = index % APPROACHES.length;
        const approach = APPROACHES[approachIndex];
        const startTime = Date.now();

        try {
          const prompt = this.buildPathPrompt(
            question,
            truncatedContext,
            pathId,
            numPaths,
            approach
          );

          const response = await callHybridProvider(prompt);
          
          return {
            pathId,
            approach,
            content: response.answer ?? `Réponse indisponible pour chemin ${pathId}`,
            latencyMs: Date.now() - startTime,
            timestamp: Date.now(),
            confidence: response.confidence ?? 0.5
          };
        } catch (error: any) {
          return {
            pathId,
            approach,
            content: `[ERREUR CHEMIN ${pathId}] ${error.message}`,
            latencyMs: Date.now() - startTime,
            timestamp: Date.now(),
            confidence: 0.1
          };
        }
      })
    );

    return paths;
  }

  private buildPathPrompt(
    question: string,
    context: string,
    _pathId: number,
    totalPaths: number,
    approach: string
  ): string {
    return `
Tu es l'UNE DES ${totalPaths} perspectives différentes.

APPROCHE: "${approach}"

QUESTION: ${question}
CONTEXTE: ${context}

Ton analyse (format structuré):`;
  }

  // ==========================================================================
  // PHASE 2: SYNTHÈSE CONSENSUS
  // ==========================================================================

  private async synthesizeConsensus(
    question: string,
    paths: ReasoningPath[],
    context: string,
    _model: string,
    verboseMode: boolean = false
  ): Promise<{ answer: string; confidence: number }> {
    const truncatedContext = this.truncateContext(context, 2000);

    const contributionsFormatted = paths.map((p) => 
      `## Chemin ${p.pathId}/${paths.length}\nApproche: ${p.approach}\nConfiance: ${(p.confidence ?? 0.5).toFixed(2)}\n\n${p.content}`
    ).join('\n\n---\n\n');

    const commonPointsSummary = this.identifyCommonPoints(paths);

    const prompt = `
SYNTHÉTISEUR AUTO-CONSISTANCE.

QUESTION: ${question}
CONTEXTE: ${truncatedContext}
POINTS COMMUNS: ${commonPointsSummary}

CHEMINS:
${contributionsFormatted}

Retourne FORMAT EXACT:
CONFIANCE: [0.0-1.0]
RÉPONSE: [ta synthèse]`;

    if (verboseMode) {
      console.log(`${LOG_PREFIX} 🔬 Synthèse consensus en cours...`);
    }

    try {
      const response = await callHybridProvider(prompt);
      return this.parseConsensusResponse(response.answer ?? '');
    } catch (error: any) {
      return {
        answer: this.extractMedianAnswer(paths),
        confidence: 0.5
      };
    }
  }

  private parseConsensusResponse(text: string): { answer: string; confidence: number } {
    try {
      const confidenceMatch = text.match(/CONF[IA]NCE[:\s]+([\d.]+)/i);
      const confidence = confidenceMatch ? Math.min(1, Math.max(0, parseFloat(confidenceMatch[1]))) : 0.7;

      const answerParts = text.split(/(?:R[EÉ]PONSE)[:\s\t]/i);
      const answer = answerParts.length > 1 ? answerParts[1].trim() : text;

      return { answer: answer ?? "Synthèse indisponible", confidence };
    } catch (error: any) {
      return { answer: "Synthèse par fallback", confidence: 0.5 };
    }
  }

  private identifyCommonPoints(paths: ReasoningPath[]): string {
    if (paths.length < 2) return "Aucun consensus possible.";
    
    const wordFrequency: Record<string, number> = {};
    
    paths.forEach(path => {
      const words = path.content.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 4) {
          wordFrequency[word] = (wordFrequency[word] ?? 0) + 1;
        }
      });
    });

    const commonWords = Object.entries(wordFrequency)
      .filter(([_, count]) => count >= paths.length - 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);

    return commonWords.length > 0 ? `Mots-clés récurrents: ${commonWords.join(', ')}` : "Aucun point commun significatif.";
  }

  private extractMedianAnswer(paths: ReasoningPath[]): string {
    const sorted = [...paths].sort((a, b) => a.content.length - b.content.length);
    const medianIndex = Math.floor(sorted.length / 2);
    return sorted[medianIndex]?.content ?? "Réponse indisponible";
  }

  private calculateAgreementLevel(paths: ReasoningPath[]): 'high' | 'medium' | 'low' | 'conflict' {
    if (paths.length < 2) return 'medium';

    const avgConfidence = paths.reduce((sum, p) => sum + (p.confidence ?? 0.5), 0) / paths.length;
    const lowConfidenceCount = paths.filter(p => (p.confidence ?? 0) < 0.3).length;
    
    if (avgConfidence > 0.8 && lowConfidenceCount === 0) return 'high';
    if (avgConfidence > 0.6 && lowConfidenceCount <= 1) return 'medium';
    if (avgConfidence > 0.4) return 'low';
    return 'conflict';
  }

  private detectWarnings(paths: ReasoningPath[], consensus: { answer: string; confidence: number }): string[] {
    const warnings: string[] = [];

    if (consensus.confidence < 0.5) {
      warnings.push("Faible confiance du consensus - vérification manuelle recommandée");
    }

    const errorPaths = paths.filter(p => p.content.includes('[ERREUR'));
    if (errorPaths.length > 0) {
      warnings.push(`${errorPaths.length} chemin(s) ont rencontré des erreurs`);
    }

    return warnings;
  }

  private determineSource(paths: ReasoningPath[], consensus: { answer: string; confidence: number }): 'consensus' | 'majority' | 'fallback' {
    const errorPaths = paths.filter(p => p.content.includes('[ERREUR')).length;

    if (errorPaths >= paths.length / 2 || consensus.confidence < 0.3) {
      return 'fallback';
    }
    return 'consensus';
  }

  private truncateContext(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text ?? '';
    return text.substring(0, maxLength) + '...';
  }

  private buildResultKey(question: string): string {
    const normalized = question.toLowerCase().trim();
    return `result:${normalized.substring(0, 150)}`;
  }
}

export const selfConsistencyReasoner = SelfConsistencyReasoner.getInstance();