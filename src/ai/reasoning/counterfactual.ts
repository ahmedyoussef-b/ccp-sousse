/**
 * @fileOverview CounterfactualReasoner v3.2 - Raisonnement Contrefactuel Avancé
 * 
 * Implémente un raisonnement "Et si" pour l'analyse causale profonde et l'identification
 * des causes racines dans les systèmes industriels complexes.
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

export interface KeyVariable {
  id: string;
  name: string;
  description: string;
  importance: number;
  type: 'pressure' | 'temperature' | 'flow' | 'time' | 'equipment' | 'operator' | 'procedure' | 'other';
}

export interface CounterfactualScenario {
  id: string;
  variableId: string;
  variableName: string;
  description: string;
  scenarioType: 'increase' | 'decrease' | 'absent' | 'changed' | 'delayed' | 'alternative';
  relevanceScore: number;
}

export interface SimulationResult {
  scenario: CounterfactualScenario;
  simulatedImpact: string;
  differenceFromReality: string;
  plausibilityScore: number;
  operationalImplications?: string;
  recommendations?: string[];
}

export interface CounterfactualResult {
  question: string;
  answer: string;
  confidence: number;
  keyVariables: KeyVariable[];
  scenarios: CounterfactualScenario[];
  simulations: SimulationResult[];
  latencyMs: number;
  causalInsights: string[];
  warnings?: string[];
  source: 'counterfactual' | 'direct' | 'fallback';
}

export interface CounterfactualConfig {
  maxVariables: number;
  maxSimulations: number;
  timeoutMs: number;
  enableCache: boolean;
  verboseLogging: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[COUNTERFACTUAL]';
const CACHE_NAMESPACE = 'counterfactual';
const CACHE_TTL_SECONDS = 900; // 15 minutes

const DEFAULT_CONFIG: CounterfactualConfig = {
  maxVariables: 3,
  maxSimulations: 3,
  timeoutMs: 90000,
  enableCache: true,
  verboseLogging: false,
};

const VARIABLE_TYPE_MAP: Record<string, KeyVariable['type']> = {
  pression: 'pressure', température: 'temperature', débit: 'flow',
  temps: 'time', équipement: 'equipment', opérateur: 'operator',
  procédure: 'procedure'
};

// ============================================================================
// CLASS PRINCIPALE: COUNTERFACTUAL REASONER
// ============================================================================

export class CounterfactualReasoning {
  private config: CounterfactualConfig;

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  public static getInstance(): CounterfactualReasoning {
    if (!this._instance) {
      this._instance = new CounterfactualReasoning();
    }
    return this._instance;
  }

  private static _instance: CounterfactualReasoning | null = null;

  public updateConfig(newConfig: Partial<CounterfactualConfig>): void {
    this.validateConfig(newConfig);
    this.config = { ...this.config, ...newConfig };
  }

  private validateConfig(newConfig: Partial<CounterfactualConfig>): void {
    if (newConfig.maxVariables && (newConfig.maxVariables < 1 || newConfig.maxVariables > 10)) {
      throw new Error('maxVariables doit être entre 1 et 10');
    }
    if (newConfig.maxSimulations && (newConfig.maxSimulations < 1 || newConfig.maxSimulations > 10)) {
      throw new Error('maxSimulations doit être entre 1 et 10');
    }
    if (newConfig.timeoutMs && newConfig.timeoutMs < 10000) {
      throw new Error('timeoutMs minimum requis: 10s');
    }
  }

  public resetConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Exécute le processus complet de raisonnement contrefactuel.
   */
  async reason(
    question: string,
    context: string,
    config?: Partial<CounterfactualConfig>
  ): Promise<CounterfactualResult> {
    const startTime = Date.now();
    const currentConfig = { ...DEFAULT_CONFIG, ...config };
    const dbInstance = await getDB();

    try {
      // === Vérification Cache SQLite ===
      const cacheKey = this.buildCacheKey(question, 'result');
      let cachedResult: CounterfactualResult | null = null;

      if (currentConfig.enableCache) {
        const cached = dbInstance.get<CounterfactualResult>(CACHE_NAMESPACE, cacheKey);
        if (cached) {
          cachedResult = cached;
        }
        
        if (cachedResult) {
          return {
            ...cachedResult,
            latencyMs: Date.now() - startTime
          };
        }
      }

      let keyVariables = await this.extractKeyVariables(question, context);
      
      if (keyVariables.length === 0) {
        return await this.directGenerate(question, context, startTime);
      }

      let counterExamples = await this.generateScenarios(keyVariables, context, currentConfig.maxSimulations);

      const simulations = await this.simulateAllScenarios(
        counterExamples,
        context,
        Math.min(currentConfig.maxSimulations, counterExamples.length)
      );

      const finalAnswer = await this.synthesizeInsights(
        question,
        simulations,
        keyVariables,
        context,
        currentConfig.verboseLogging
      );

      const latencyMs = Date.now() - startTime;

      const avgPlausibility = simulations.reduce(
        (sum, s) => sum + s.plausibilityScore, 0
      ) / Math.max(simulations.length, 1);

      const result: CounterfactualResult = {
        question,
        answer: finalAnswer,
        confidence: Math.min(1, (avgPlausibility + 0.7) / 2),
        keyVariables,
        scenarios: counterExamples,
        simulations,
        latencyMs,
        causalInsights: this.extractCausalInsights(simulations, keyVariables),
        warnings: this.detectWarnings(simulations, keyVariables),
        source: 'counterfactual'
      };

      if (currentConfig.enableCache && result.confidence > 0.5) {
        dbInstance.set(CACHE_NAMESPACE, cacheKey, result, CACHE_TTL_SECONDS);
      }

      return result;

    } catch (error: any) {
      return await this.directGenerate(
        question,
        context,
        Date.now() - startTime,
        error
      );
    }
  }

  // ==========================================================================
  // PHASE 1: EXTRACTION VARIABLES CRITIQUES
  // ==========================================================================

  private async extractKeyVariables(
    question: string,
    context: string
  ): Promise<KeyVariable[]> {
    const truncatedContext = this.truncateContext(context, 1200);
    const cacheKey = this.buildCacheKey(question, 'variables');
    const dbInstance = await getDB();
    
    if (this.isCacheEnabled()) {
      const cached = dbInstance.get<{ variables: KeyVariable[]; timestamp: number }>(CACHE_NAMESPACE, cacheKey);
      if (cached && cached.variables && cached.variables.length > 0) {
        return cached.variables.slice(0, this.config.maxVariables);
      }
    }

    try {
      const prompt = `
Tu es un expert en analyse causale industrielle.

QUESTION: "${question}"

CONTEXTE TECHNIQUE:
${truncatedContext}

Identifie maximum ${this.config.maxVariables} variables critiques. Retourne JSON seulement:
[{"id": "1", "name": "nom_variable", "description": "rôle_exact", "importance": 0.XX, "type": "type"}]`;

      const response = await callHybridProvider(prompt);
      const parsed = this.parseVariables(response.answer);
      
      if (parsed.length > 0 && this.isCacheEnabled()) {
        dbInstance.set(CACHE_NAMESPACE, cacheKey, { variables: parsed, timestamp: Date.now() }, CACHE_TTL_SECONDS);
      }

      return parsed.slice(0, this.config.maxVariables);
    } catch (error: any) {
      console.warn(`${LOG_PREFIX} Échec extraction variables:`, error.message);
      return [];
    }
  }

  private parseVariables(text: string): KeyVariable[] {
    try {
      const jsonMatch = text.match(/(\[.*\])/s);
      if (!jsonMatch) return [];

      const parsed: any[] = JSON.parse(jsonMatch[1]);
      
      return parsed
        .filter(item => item && typeof item.name === 'string')
        .map((item, index) => ({
          id: String(index + 1),
          name: item.name.substring(0, 100),
          description: item.description || 'Description non fournie',
          importance: Math.min(1, Math.max(0, parseFloat(item.importance || '0.5'))),
          type: this.mapToVariableType(item.type) || 'other'
        }))
        .sort((a, b) => b.importance - a.importance)
        .slice(0, this.config.maxVariables);
    } catch (error: any) {
      console.warn(`${LOG_PREFIX} Erreur parsing JSON variables:`, error.message);
      return [];
    }
  }

  private mapToVariableType(input: string): KeyVariable['type'] {
    if (!input) return 'other';
    const normalized = input.toLowerCase();
    for (const [key, value] of Object.entries(VARIABLE_TYPE_MAP)) {
      if (normalized.includes(key)) return value;
    }
    return 'other';
  }

  // ==========================================================================
  // PHASE 2: GÉNÉRATION SCÉNARIOS CONTREFACTUELS
  // ==========================================================================

  private async generateScenarios(
    variables: KeyVariable[],
    context: string,
    maxCount: number
  ): Promise<CounterfactualScenario[]> {
    const truncatedContext = this.truncateContext(context, 1500);
    const cacheKey = this.buildCacheKey(JSON.stringify(variables.map(v => v.id)), 'scenarios');
    const dbInstance = await getDB();
    
    if (this.isCacheEnabled()) {
      const cached = dbInstance.get<{ scenarios: CounterfactualScenario[]; timestamp: number }>(CACHE_NAMESPACE, cacheKey);
      if (cached && cached.scenarios && cached.scenarios.length > 0) {
        return cached.scenarios.slice(0, maxCount);
      }
    }

    try {
      const prompts = variables.map((v, idx) => `VARIABLE ${idx + 1}: ${v.name} (${v.type}) - ${v.description}`).join('\n');

      const prompt = `
CONTEXTE:
${truncatedContext}

VARIABLES CRITIQUES:
${prompts}

Génère ${maxCount} scénarios "ET SI..." format JSON strict:
[{"id": "1", "variableId": "1", "variableName": "...", "description": "Si... alors...", "scenarioType": "increase/decrease/etc.", "relevanceScore": 0.XX}]`;

      const response = await callHybridProvider(prompt);
      const parsed = this.parseScenarios(response.answer, maxCount, variables);
      
      if (parsed.length > 0 && this.isCacheEnabled()) {
        dbInstance.set(CACHE_NAMESPACE, cacheKey, { scenarios: parsed, timestamp: Date.now() }, CACHE_TTL_SECONDS);
      }

      return parsed;
    } catch (error: any) {
      console.warn(`${LOG_PREFIX} Échec génération scénarios:`, error.message);
      return [];
    }
  }

  private parseScenarios(
    text: string,
    maxCount: number,
    _availableVariables: KeyVariable[]
  ): CounterfactualScenario[] {
    try {
      const jsonMatch = text.match(/(\[.*\])/s);
      if (!jsonMatch) return [];

      const parsed: any[] = JSON.parse(jsonMatch[1]);
      
      return parsed
        .filter(item => item && typeof item.variableName === 'string')
        .map((item, index) => ({
          id: String(index + 1),
          variableId: item.variableId || String(index + 1),
          variableName: item.variableName.substring(0, 100),
          description: item.description?.substring(0, 300) || 'Scénario contrefactuel',
          scenarioType: this.validateScenarioType(item.scenarioType) || 'changed',
          relevanceScore: Math.min(1, Math.max(0, parseFloat(item.relevanceScore || '0.7')))
        }))
        .slice(0, maxCount);
    } catch (error: any) {
      console.warn(`${LOG_PREFIX} Erreur parsing JSON scénarios:`, error.message);
      return [];
    }
  }

  private validateScenarioType(input: string): CounterfactualScenario['scenarioType'] {
    const validTypes: CounterfactualScenario['scenarioType'][] = ['increase', 'decrease', 'absent', 'changed', 'delayed', 'alternative'];
    if (input && validTypes.includes(input as CounterfactualScenario['scenarioType'])) {
      return input as CounterfactualScenario['scenarioType'];
    }
    return 'changed';
  }

  // ==========================================================================
  // PHASE 3: SIMULATION IMPACT
  // ==========================================================================

  private async simulateAllScenarios(
    scenarios: CounterfactualScenario[],
    context: string,
    limit: number
  ): Promise<SimulationResult[]> {
    const truncatedContext = this.truncateContext(context, 2000);

    const simulations = await Promise.all(
      scenarios.slice(0, limit).map(async (scenario) => {
        try {
          const prompt = `
CONTEXTE RÉEL:
${truncatedContext}

SCÉNARIO: Variable "${scenario.variableName}" - "${scenario.description}"
TYPE: ${scenario.scenarioType}

Simule l'impact de ce scénario vs réalité:
1. Impact simulé
2. Différence réelle
3. Implications opérationnelles
4. Plausibilité (0-1)`;

          const response = await callHybridProvider(prompt);
          
          return this.parseSimulationResult(response.answer, scenario);
        } catch (error: any) {
          return {
            scenario,
            simulatedImpact: `[ERREUR]: ${error.message}`,
            differenceFromReality: 'Indisponible',
            plausibilityScore: 0.1,
            operationalImplications: '',
            recommendations: []
          };
        }
      })
    );

    return simulations;
  }

  private parseSimulationResult(text: string, scenario: CounterfactualScenario): SimulationResult {
    try {
      const lines = text.split(/\n+/);
      
      let impact = '';
      let diff = '';
      let implications = '';
      let plausibility = 0.7;
      let recommendations: string[] = [];

      let currentSection = '';
      for (const line of lines) {
        const lowerLine = line.toLowerCase();
        
        if (lowerLine.includes('impact') || lowerLine.includes('résultat')) currentSection = 'impact';
        else if (lowerLine.includes('différence')) currentSection = 'diff';
        else if (lowerLine.includes('conséquence') || lowerLine.includes('implication')) currentSection = 'implications';
        else if (lowerLine.includes('plausibil') || lowerLine.includes('réalis')) {
          const match = lowerLine.match(/([\d.]+)/);
          if (match) plausibility = Math.min(1, Math.max(0, parseFloat(match[1])));
        } else if (lowerLine.includes('recommand')) currentSection = 'recommendations';

        switch (currentSection) {
          case 'impact': impact += line + '\n'; break;
          case 'diff': diff += line + '\n'; break;
          case 'implications': implications += line + '\n'; break;
          case 'recommendations': recommendations.push(line.trim()); break;
        }
      }

      return {
        scenario,
        simulatedImpact: impact.trim() || 'Analyse indisponible',
        differenceFromReality: diff.trim() || 'Non spécifiée',
        plausibilityScore: plausibility,
        operationalImplications: implications.trim(),
        recommendations: recommendations.filter(r => r.length > 10)
      };
    } catch (error: any) {
      return {
        scenario,
        simulatedImpact: text.substring(0, 500),
        differenceFromReality: '',
        plausibilityScore: 0.5,
        operationalImplications: '',
        recommendations: []
      };
    }
  }

  // ==========================================================================
  // PHASE 4: SYNTHÈSE CAUSALE
  // ==========================================================================

  private async synthesizeInsights(
    question: string,
    simulations: SimulationResult[],
    variables: KeyVariable[],
    context: string,
    _verboseMode: boolean
  ): Promise<string> {
    const truncatedContext = this.truncateContext(context, 2000);

    const simulationsFormatted = simulations.map((s, i) => 
      `### Scénario ${i + 1}\n**Variable:** ${s.scenario.variableName}\n**Description:** ${s.scenario.description}\n**Impact:** ${s.simulatedImpact}\n**(Plausibilité: ${(s.plausibilityScore * 100).toFixed(0)}%)**`
    ).join('\n\n---\n\n');

    const variablesSummary = variables.map(v => `• **${v.name}**: ${v.description}`).join('\n');

    const prompt = `
QUESTION: ${question}

CONTEXTE:
${truncatedContext}

VARIABLES CRITIQUES:
${variablesSummary}

SIMULATIONS:
${simulationsFormatted}

Synthèse finale structurée (Markdown, priorités sécurité IEC 61511):`;

    try {
      const response = await callHybridProvider(prompt);
      return response.answer;
    } catch (error: any) {
      return simulations.length > 0 ? simulations[0].simulatedImpact : "Analyse indisponible.";
    }
  }

  private extractCausalInsights(
    simulations: SimulationResult[],
    variables: KeyVariable[]
  ): string[] {
    const insights: string[] = [];

    const topScenarios = [...simulations].sort((a, b) => b.plausibilityScore - a.plausibilityScore).slice(0, 3);
    topScenarios.forEach(s => {
      insights.push(`• Impact majeur: ${s.scenario.variableName} → ${s.simulatedImpact.substring(0, 150)}...`);
    });

    const topVariables = [...variables].sort((a, b) => b.importance - a.importance).slice(0, 3);
    topVariables.forEach(v => {
      insights.push(`• Priorité haute: ${v.name} (${(v.importance * 100).toFixed(0)}%)`);
    });

    return insights.length > 0 ? insights : ["Aucun enseignement significatif."];
  }

  private async directGenerate(
    question: string,
    context: string,
    startTime: number,
    error?: Error
  ): Promise<CounterfactualResult> {
    const truncatedContext = this.truncateContext(context, 2000);

    try {
      const prompt = `MODE DÉGRADÉ: Assistant technique expert.
QUESTION: ${question}
CONTEXTE: ${truncatedContext}
Répondre factuellement avec causes possibles.`;

      const response = await callHybridProvider(prompt);
      
      return {
        question,
        answer: response.answer,
        confidence: response.confidence || 0.6,
        keyVariables: [],
        scenarios: [],
        simulations: [],
        latencyMs: Date.now() - startTime,
        causalInsights: [],
        warnings: error ? [`Mode dégradé: ${error.message}`] : undefined,
        source: 'direct'
      };
    } catch (err: any) {
      return {
        question,
        answer: "Erreur technique empêchant la réponse.",
        confidence: 0.1,
        keyVariables: [],
        scenarios: [],
        simulations: [],
        latencyMs: Date.now() - startTime,
        causalInsights: [],
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
    const words = text.split(/\s+/);
    if (words.length <= Math.ceil(maxLength / 7)) return text;
    const halfMiddle = Math.floor((maxLength - 100) / 14);
    const startWords = words.slice(0, halfMiddle);
    const endWords = words.slice(-halfMiddle);
    return [...startWords, '\n\n[CONTINUATION...]'.padEnd(20), ...endWords].join(' ');
  }

  private isCacheEnabled(): boolean { return this.config.enableCache; }

  private buildCacheKey(identifier: string, type: 'variables' | 'scenarios' | 'result'): string {
    return `${type}:${identifier.toLowerCase().trim().substring(0, 100)}`;
  }

  private detectWarnings(
    simulations: SimulationResult[],
    variables: KeyVariable[]
  ): string[] {
    const warnings: string[] = [];

    const avgPlausibility = simulations.reduce((sum, s) => sum + s.plausibilityScore, 0) / Math.max(simulations.length, 1);
    if (avgPlausibility < 0.5) warnings.push("Faible plausibilité - vérification manuelle recommandée");

    const errorSimulations = simulations.filter(s => s.simulatedImpact.includes('[ERREUR'));
    if (errorSimulations.length > 0) warnings.push(`${errorSimulations.length} erreur(s) de simulation`);

    if (variables.length < 2) warnings.push("Peu de variables identifiées - analyse limitée");
    if (simulations.length < 2) warnings.push("Peu de simulations - précision réduite");

    return warnings;
  }
}

export const counterfactualReasoner = CounterfactualReasoning.getInstance();