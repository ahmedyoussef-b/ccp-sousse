/**
 * @fileOverview ModularReasoner v3.2 - Raisonnement Modulaire Optimisé
 * Décomposition du raisonnement en modules spécialisés interconnectés.
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
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[MODULAR]';
const CACHE_NAMESPACE = 'modular';
const CACHE_TTL_SECONDS = 300; // 5 minutes
const MAX_MODULES = 3;
const GLOBAL_TIMEOUT = 30000; // 30 secondes max pour tout le processus

export type ReasoningModuleType = 
  | 'logic' 
  | 'temporal' 
  | 'causal' 
  | 'mathematical' 
  | 'technical'
  | 'security'
  | 'performance';

export interface ReasoningResult {
  answer: string;
  confidence: number;
  latencyMs: number;
  modulesUsed: string[];
  cacheHit?: boolean;
  errors?: string[];
}

export interface ModuleInput {
  question: string;
  context: string;
  previousResults: string[];
}

// ============================================================================
// DÉTECTION DES MODULES
// ============================================================================

function identifyRequiredModules(question: string): ReasoningModuleType[] {
  const q = question.toLowerCase();
  const modules: ReasoningModuleType[] = [];

  if (q.match(/calcul|combien|total|moyenne|seuil|mesure|valeur|pression|température|chiffre/i)) {
    modules.push('mathematical');
  }
  
  if (q.match(/quand|depuis|pendant|durée|historique|récent|nouveau|évolution|temps/i)) {
    modules.push('temporal');
  }
  
  if (q.match(/pourquoi|cause|raison|si on|origine|conséquence|affecte|impact/i)) {
    modules.push('causal');
  }
  
  if (q.match(/comment|étape|procédure|faire|réparer|logique|processus|méthode/i)) {
    modules.push('logic');
  }

  if (q.match(/sécurité|safety|consigne|alarme|urgence|danger|risque|protection/i)) {
    modules.push('security');
  }

  if (q.match(/performance|rendement|efficacité|optimisation|puissance|charge/i)) {
    modules.push('performance');
  }

  if (modules.length === 0) modules.push('technical');
  
  return modules.slice(0, MAX_MODULES);
}

// ============================================================================
// EXECUTION DES MODULES
// ============================================================================

async function executeModule(module: ReasoningModuleType, input: ModuleInput): Promise<{ type: string; insight: string; confidence: number }> {
  let prompt = '';
  let systemPrompt = '';

  switch (module) {
    case 'mathematical':
      systemPrompt = "Expert en calculs techniques industriels. Répondez uniquement avec le résultat chiffré ou l'explication du calcul.";
      prompt = `Question: ${input.question}\n\nContexte:\n${input.context}\n\nCalculez/expliquez précisément:`;
      break;

    case 'temporal':
      systemPrompt = "Expert en analyse temporelle industrielle. Identifiez chronologies et séquences d'événements.";
      prompt = `Question: ${input.question}\n\nChronologie des événements décrite:\n${input.context}\n\nAnalysez la dimension temporelle:`;
      break;

    case 'causal':
      systemPrompt = "Expert en analyse causale et racines profondes. Identifiez relations cause-effet systématiques.";
      prompt = `Question: ${input.question}\n\nDonnées contextuelles:\n${input.context}\n\nDécomposez les causes et conséquences:`;
      break;

    case 'logic':
      systemPrompt = "Expert en procédures logiques industrielles. Décrivez étapes séquentielles clairement.";
      prompt = `Question: ${input.question}\n\nProcédure/donnée contextuelle:\n${input.context}\n\nExpliquez la démarche logique étape par étape:`;
      break;

    case 'security':
      systemPrompt = "Expert en sécurité industrielle IEC 61511. Priorisez les consignes de sécurité et seuils critiques.";
      prompt = `Question: ${input.question}\n\nContexte opérationnel:\n${input.context}\n\nRéponse centrée sur conformité sécurité et protection:`;
      break;

    case 'performance':
      systemPrompt = "Expert en optimisation performance industrielle. Analysez indicateurs d'efficacité énergétique.";
      prompt = `Question: ${input.question}\n\nParamètres de performance:\n${input.context}\n\nOptimisation recommandée:`;
      break;

    default:
      systemPrompt = "Expert technique généraliste en centrales thermiques. Répondez de manière précise et factuelle.";
      prompt = `Question: ${input.question}\n\nContexte technique:\n${input.context}\n\nRéponse détaillée:`;
  }

  try {
    const response = await callHybridProvider(`${systemPrompt}\n\n${prompt}`);
    
    const confidence = ConfidenceScorer.evaluate(response.answer, input.question);
    
    return {
      type: module,
      insight: response.answer,
      confidence: response.confidence || confidence
    };
  } catch (error: any) {
    console.warn(`${LOG_PREFIX} Erreur module ${module}:`, error.message);
    return {
      type: module,
      insight: `[ERREUR Module ${module.toUpperCase()}]: ${error.message}`,
      confidence: 0.1
    };
  }
}

// ============================================================================
// INTÉGRATION DES RÉSULTATS
// ============================================================================

async function integrateResults(question: string, results: any[]): Promise<string> {
  const contextList = results.map(r => `**[${r.type.toUpperCase()}]**\n${r.insight.substring(0, 500)}...`).join('\n\n');
  
  const prompt = `
QUESTION INITIALE: ${question}

ANALYSES MODULAIRES:
${contextList}

SYNTHÈSE FINALE STRUCTURÉE (en français, format Markdown):`;

  try {
    const response = await callHybridProvider(prompt);
    return response.answer;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Erreur intégration:`, error);
    return results[0]?.insight || "Erreur lors de la synthèse modulaire.";
  }
}

// ============================================================================
// CACHE OPTIMISÉ (SQLite)
// ============================================================================

function buildCacheKey(question: string, modules: ReasoningModuleType[]): string {
  const normalized = question.toLowerCase().trim();
  return `result:${normalized}:${modules.sort().join(',')}`;
}

async function getCachedResult(cacheKey: string): Promise<ReasoningResult | null> {
  const dbInstance = await getDB();
  return dbInstance.get<ReasoningResult>(CACHE_NAMESPACE, cacheKey) || null;
}

async function storeResult(cacheKey: string, result: ReasoningResult): Promise<void> {
  if (result.confidence > 0.5) {
    const dbInstance = await getDB();
    dbInstance.set(CACHE_NAMESPACE, cacheKey, result, CACHE_TTL_SECONDS);
  }
}

// ============================================================================
// RAISONNEUR PRINCIPAL
// ============================================================================

export class ModularReasoner {
  private static instance: ModularReasoner;

  private constructor() {}

  public static getInstance(): ModularReasoner {
    if (!ModularReasoner.instance) {
      ModularReasoner.instance = new ModularReasoner();
    }
    return ModularReasoner.instance;
  }

  async reason(question: string, context: string): Promise<ReasoningResult> {
    const startTime = Date.now();
    const cacheKey = buildCacheKey(question, []);
    
    // Vérifier cache SQLite
    const cached = await getCachedResult(cacheKey);
    if (cached) {
      return { ...cached, cacheHit: true, latencyMs: Date.now() - startTime };
    }

    const requiredModules = identifyRequiredModules(question);
    
    if (requiredModules.length <= 1) {
      const result = await this.directDispatch(question, context, requiredModules[0] || 'technical');
      await storeResult(cacheKey, result);
      return { ...result, latencyMs: Date.now() - startTime };
    }

    // Exécution parallèle contrôlée
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT);

    try {
      console.log(`${LOG_PREFIX} Modules activés: ${requiredModules.join(', ')}`);
      
      const inputs: ModuleInput[] = requiredModules.map(() => ({
        question,
        context,
        previousResults: []
      }));

      const results = await Promise.all(
        inputs.map(input => {
          const module = requiredModules[inputs.indexOf(input)];
          return executeModule(module, input);
        })
      );

      clearTimeout(timeoutId);
      const finalAnswer = await integrateResults(question, results);
      
      const confidence = results.reduce((acc, r) => acc + r.confidence, 0) / results.length;

      const result: ReasoningResult = {
        answer: finalAnswer,
        confidence: Math.min(1, confidence * 0.9),
        latencyMs: Date.now() - startTime,
        modulesUsed: requiredModules,
        errors: results.filter(r => r.confidence < 0.3).map(r => `${r.type}: ${r.insight}`)
      };

      await storeResult(cacheKey, result);
      return result;

    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error(`${LOG_PREFIX} Timeout ou erreur globale:`, error);
      
      return {
        answer: "Désolé, le temps maximal de traitement a été atteint. Veuillez reformuler votre question.",
        confidence: 0.1,
        latencyMs: Date.now() - startTime,
        modulesUsed: requiredModules,
        errors: [error.message || "Timeout global"]
      };
    }
  }

  private async directDispatch(question: string, context: string, type: ReasoningModuleType): Promise<ReasoningResult> {
    const result = await executeModule(type, { question, context, previousResults: [] });
    
    return {
      answer: result.insight,
      confidence: result.confidence,
      latencyMs: 0,
      modulesUsed: [type]
    };
  }
}

export const modularReasoner = ModularReasoner.getInstance();