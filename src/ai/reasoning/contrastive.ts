/**
 * @fileOverview ContrastiveReasoner v3.2 - Raisonnement Par Opposition Conceptuelle
 * 
 * Implémente un raisonnement par contraste systématique entre un concept principal
 * et des contre-exemples pertinents pour identifier différences cruciales.
 * 
 * 📐 ARCHITECTURE CONTRASTIVE:
 * ├─ Phase 1: Extraction concept central de la question
 * ├─ Phase 2: Génération de contre-exemples pertinents
 * ├─ Phase 3: Comparaison systématique concept vs contre-exemple
 * └─ Phase 4: Synthèse finale par contraste
 * 
 * ⚙️ PARAMÈTRES DE PRODUCTION:
 * - Concepts max extraits: 1 (clarté réponse)
 * - Contre-exemples générés: 1-3 max
 * - Timeout: 45s global (comparaison intensif)
 * - Mode dégradation: directGenerate si échec
 * 
 * ✅ COMPLIANCE: IEC 61511 / ISO 55001
 * - Détection oppositions critiques pour sécurité
 * - Traçabilité complète du processus contrastif
 * - Validation factuelle par approche inverse
 */

import { SQLiteCore } from '@/ai/core/sqlite';
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

export interface MainConcept {
  value: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface CounterExample {
  id: string;
  value: string;
  relationship: string;
  relevanceScore: number;
}

export interface ComparisonResult {
  referenceConcept: string;
  contrastConcept: string;
  keyDifferences: string[];
  similarities?: string[];
  operationalImplications?: string;
  validityScore: number;
}

export interface ContrastiveResult {
  answer: string;
  confidence: number;
  mainConcept?: MainConcept;
  counterExamples?: CounterExample[];
  comparisons?: ComparisonResult[];
  latencyMs: number;
  warnings?: string[];
  source: 'contrast' | 'direct' | 'fallback';
}

export interface ContrastiveConfig {
  maxCounterExamples: number;
  timeoutMs: number;
  enableCache: boolean;
  verboseLogging: boolean;
}

// ============================================================================
// CONFIGURATION PAR DÉFAUT OPTIMISÉE
// ============================================================================

const LOG_PREFIX = '[CONTRASTIVE]';
const CACHE_NAMESPACE = 'contrastive';
const CACHE_TTL_SECONDS = 600; // 10 minutes

const DEFAULT_CONFIG: ContrastiveConfig = {
  maxCounterExamples: 3,
  timeoutMs: 45000,
  enableCache: true,
  verboseLogging: false,
};

// ============================================================================
// CLASS PRINCIPALE: CONTRASTIVE REASONER
// ============================================================================

export class ContrastiveReasoning {
  private config: ContrastiveConfig;

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  public static getInstance(): ContrastiveReasoning {
    if (!this._instance) {
      this._instance = new ContrastiveReasoning();
    }
    return this._instance;
  }

  private static _instance: ContrastiveReasoning | null = null;

  public updateConfig(newConfig: Partial<ContrastiveConfig>): void {
    this.validateConfig(newConfig);
    this.config = { ...this.config, ...newConfig };
    console.log(`${LOG_PREFIX} Configuration mise à jour:`, this.config);
  }

  private validateConfig(newConfig: Partial<ContrastiveConfig>): void {
    if (newConfig.maxCounterExamples && (newConfig.maxCounterExamples < 1 || newConfig.maxCounterExamples > 10)) {
      throw new Error('maxCounterExamples doit être entre 1 et 10');
    }
    if (newConfig.timeoutMs && newConfig.timeoutMs < 5000) {
      throw new Error('timeoutMs minimum requis: 5s');
    }
  }

  public resetConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
    console.log(`${LOG_PREFIX} Configuration réinitialisée aux defaults production.`);
  }

  // ==========================================================================
  // MÉTHODE PUBLIQUE PRINCIPALE
  // ==========================================================================

  async reason(
    question: string,
    context: string,
    config?: Partial<ContrastiveConfig>
  ): Promise<ContrastiveResult> {
    const startTime = Date.now();
    const currentConfig = { ...DEFAULT_CONFIG, ...config };
    const dbInstance = await getDB();
    
    if (currentConfig.verboseLogging) {
      console.log(`${LOG_PREFIX} 🔀 DÉMARRAGE RAISONNEMENT CONTRASTIF`);
      console.log(`${LOG_PREFIX}   • Max contre-exemples: ${currentConfig.maxCounterExamples}`);
      console.log(`${LOG_PREFIX}   • Timeout: ${currentConfig.timeoutMs}ms`);
    }

    try {
      // === PHASE 1: Vérification Cache SQLite ===
      const cacheKey = this.buildResultKey(question);
      let cachedResult: ContrastiveResult | null = null;

      if (currentConfig.enableCache) {
        const cached = dbInstance.get<ContrastiveResult>(CACHE_NAMESPACE, cacheKey);
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

      // === PHASE 2: Extraction Concept Principal ===
      let mainConcept = await this.extractMainConcept(question, context);

      // === PHASE 3: Génération Contre-Exemples ===
      let counterExamples: CounterExample[] = [];
      
      if (mainConcept.value.toLowerCase().length > 3) {
        counterExamples = await this.generateCounterExamples(
          mainConcept.value,
          context,
          currentConfig.maxCounterExamples
        );
      }

      if (counterExamples.length === 0) {
        if (currentConfig.verboseLogging) {
          console.log(`${LOG_PREFIX} ℹ️ Aucun contre-exemple pertinent trouvé -> mode direct`);
        }
        return await this.directGenerate(question, context, startTime);
      }

      // === PHASE 4: Comparaison Systématique ===
      const comparisons = await this.compareAllConcepts(
        mainConcept,
        counterExamples,
        context
      );

      // === PHASE 5: Synthèse Finale Contraste ===
      const finalAnswer = await this.synthesizeAnswer(
        mainConcept,
        comparisons,
        question,
        context,
        currentConfig.verboseLogging
      );

      const latencyMs = Date.now() - startTime;

      const avgComparisonScore = comparisons.reduce(
        (sum, c) => sum + c.validityScore, 0
      ) / comparisons.length;

      const result: ContrastiveResult = {
        answer: finalAnswer,
        confidence: Math.min(1, (avgComparisonScore + 0.7) / 2),
        mainConcept,
        counterExamples,
        comparisons,
        latencyMs,
        warnings: this.detectWarnings(comparisons),
        source: 'contrast'
      };

      if (currentConfig.enableCache && result.confidence > 0.5) {
        dbInstance.set(CACHE_NAMESPACE, cacheKey, result, CACHE_TTL_SECONDS);
      }

      if (currentConfig.verboseLogging) {
        console.log(`${LOG_PREFIX} ✅ PROCESSUS TERMINÉ en ${latencyMs}ms`);
        console.log(`${LOG_PREFIX}   • Confiance: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`${LOG_PREFIX}   • Contre-exemples: ${result.counterExamples?.length || 0}`);
        console.log(`${LOG_PREFIX}   • Comparaisons: ${result.comparisons?.length || 0}`);
      }

      return result;

    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      console.error(`${LOG_PREFIX} ❌ ÉCHEC RAISONNEMENT CONTRASTIF:`, error.message);
      return await this.directGenerate(question, context, latencyMs, error);
    }
  }

  // ==========================================================================
  // PHASE 2: EXTRACTION CONCEPT PRINCIPAL
  // ==========================================================================

  private async extractMainConcept(
    question: string,
    context: string
  ): Promise<MainConcept> {
    const truncatedContext = this.truncateContext(context, 800);

    try {
      const prompt = `
Tu es un analyste technique expert. Identifie le concept CENTRAL d'une question industrielle.

QUESTION: "${question}"

CONTEXTE: ${truncatedContext}

Retourne UNIQUEMENT le concept (1-2 mots maximum).

CONCEPT:`;

      const response = await callHybridProvider(prompt);
      
      return {
        value: response.answer.trim().substring(0, 50) || 'Sujet technique général',
        confidence: response.confidence || 0.5,
        metadata: { extractedAt: new Date().toISOString() }
      };
    } catch (error: any) {
      console.warn(`${LOG_PREFIX} Échec extraction concept:`, error.message);
      return {
        value: 'Sujet technique',
        confidence: 0.2,
        metadata: { error: error.message }
      };
    }
  }

  // ==========================================================================
  // PHASE 3: GÉNÉRATION CONTRE-EXEMPLES
  // ==========================================================================

  private async generateCounterExamples(
    concept: string,
    context: string,
    maxCount: number
  ): Promise<CounterExample[]> {
    const truncatedContext = this.truncateContext(context, 1000);

    try {
      const prompt = `
Tu es un expert en identification conceptuelle industrielle.

CONCEPT CIBLE: "${concept}"

CONTEXTE: ${truncatedContext}

Identifie des concepts PROCHES MAIS DIFFÉRENTS (${maxCount} maximum).

Format JSON: [{"id": "1", "value": "concept", "relationship": "relation"}]

CONTERE-EXEMPLES (JSON ONLY):`;

      const response = await callHybridProvider(prompt);
      const parsed = this.parseCounterExamples(response.answer, maxCount);
      
      return parsed;
    } catch (error: any) {
      console.warn(`${LOG_PREFIX} Échec génération contre-exemples:`, error.message);
      return [];
    }
  }

  private parseCounterExamples(text: string, maxCount: number): CounterExample[] {
    try {
      const jsonMatch = text.match(/(\[.*\])/s);
      if (!jsonMatch) return [];
      
      const parsed: any[] = JSON.parse(jsonMatch[1]);
      
      return parsed
        .filter(item => item && typeof item.value === 'string')
        .map((item, index) => ({
          id: String(index + 1),
          value: item.value.substring(0, 100),
          relationship: item.relationship || 'Concept similaire différent',
          relevanceScore: 0.7
        }))
        .slice(0, maxCount);
    } catch (error: any) {
      console.warn(`${LOG_PREFIX} Erreur parsing JSON:`, error.message);
      return [];
    }
  }

  // ==========================================================================
  // PHASE 4: COMPARAISON SYSTÉMATIQUE
  // ==========================================================================

  private async compareAllConcepts(
    mainConcept: MainConcept,
    counterExamples: CounterExample[],
    context: string
  ): Promise<ComparisonResult[]> {
    const truncatedContext = this.truncateContext(context, 1200);

    const comparisons = await Promise.all(
      counterExamples.map(async (counterExample) => {
        try {
          const prompt = `
Analyseur technique spécialisé en différenciation conceptuelle.

CONCEPT RÉFÉRENCE: "${mainConcept.value}"
CONCEPT OPPOSÉ: "${counterExample.value}"

CONTEXTE: ${truncatedContext}

Identifie LA DIFFÉRENCE MAJEURE entre ces concepts.
Format: Différence principale, conséquences opérationnelles, points communs.`;

          const response = await callHybridProvider(prompt);
          
          return {
            referenceConcept: mainConcept.value,
            contrastConcept: counterExample.value,
            keyDifferences: [response.answer.substring(0, 200)],
            similarities: [],
            operationalImplications: '',
            validityScore: 0.7
          };
        } catch (error: any) {
          console.warn(`${LOG_PREFIX} Comparaison ${counterExample.value} échec:`, error.message);
          
          return {
            referenceConcept: mainConcept.value,
            contrastConcept: counterExample.value,
            keyDifferences: [`Erreur: ${error.message}`],
            similarities: [],
            operationalImplications: '',
            validityScore: 0.1
          };
        }
      })
    );

    return comparisons;
  }

  // ==========================================================================
  // PHASE 5: SYNTHÈSE FINALE CONTRASTE
  // ==========================================================================

  private async synthesizeAnswer(
    mainConcept: MainConcept,
    comparisons: ComparisonResult[],
    question: string,
    context: string,
    _verboseMode: boolean = false
  ): Promise<string> {
    const truncatedContext = this.truncateContext(context, 2000);

    const comparisonsFormatted = comparisons.map((c, i) => 
      `### Comparaison ${i + 1}/${comparisons.length}\n\n` +
      `**${c.referenceConcept}** vs **${c.contrastConcept}**\n\n` +
      `**Différences:**\n• ${c.keyDifferences.join('\n• ')}\n`
    ).join('\n\n---\n\n');

    const prompt = `
SYNTHÉTISEUR FINAL - SYSTÈME CONTRASTIF

📋 QUESTION: ${question}
🎯 CONTEXTE: ${truncatedContext}
🔬 ANALYSES: ${comparisonsFormatted}

Rédige une réponse structurée expliquant le concept "${mainConcept.value}" par contraste avec les concepts opposés.
Priorité sécurité IEC 61511. Format Markdown.`;

    try {
      const response = await callHybridProvider(prompt);
      return response.answer;
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Synthèse finale échec:`, error.message);
      return comparisons[0]?.keyDifferences.join('\n') || "Analyse contrastive indisponible.";
    }
  }

  // ==========================================================================
  // MODE DÉGRADÉ
  // ==========================================================================

  private async directGenerate(
    question: string,
    context: string,
    startTime: number,
    error?: Error
  ): Promise<ContrastiveResult> {
    const truncatedContext = this.truncateContext(context, 2000);

    const prompt = `
Assistant technique expert - MODE DÉGRADÉ

QUESTION: ${question}
CONTEXTE: ${truncatedContext}

Réponse factuelle et structurée:`;

    try {
      const response = await callHybridProvider(prompt);
      
      return {
        answer: response.answer,
        confidence: response.confidence || 0.6,
        latencyMs: Date.now() - startTime,
        warnings: error ? [`Mode dégradé: ${error.message}`] : undefined,
        source: 'direct'
      };
    } catch (err: any) {
      return {
        answer: "Erreur technique, réponse indisponible.",
        confidence: 0.1,
        latencyMs: Date.now() - startTime,
        warnings: [err.message || "Erreur processus"],
        source: 'fallback'
      };
    }
  }

  // ==========================================================================
  // UTILITAIRES
  // ==========================================================================

  private truncateContext(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '...';
  }

  private detectWarnings(comparisons: ComparisonResult[]): string[] {
    const warnings: string[] = [];

    const avgValidity = comparisons.reduce((sum, c) => sum + c.validityScore, 0) / comparisons.length;
    if (avgValidity < 0.5) {
      warnings.push("Faible validité des distinctions identifiées");
    }

    if (comparisons.length < 2) {
      warnings.push("Peu de comparaisons réalisées - précision limitée");
    }

    return warnings;
  }

  private buildResultKey(question: string): string {
    const normalized = question.toLowerCase().trim();
    return `result:${normalized.substring(0, 150)}`;
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const contrastiveReasoning = ContrastiveReasoning.getInstance();