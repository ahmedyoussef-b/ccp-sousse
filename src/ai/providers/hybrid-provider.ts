/**
 * Provider hybride v3.1: RAG Multi-Collections + Cache + Sélection intelligente des modèles
 * @version 3.1.4
 * @lastUpdated 2026-04-24
 * @changes Migration Core SQLite - Remplacement du cache mémoire
 */

import { ChromaDBManager } from '@/ai/vector/chromadb-manager';
import { CollectionName } from '@/ai/vector/chromadb-schema';
import { detectProcedureIntent, type ProcedureIntent } from '@/ai/rag/procedure-detector';
import { callOllama } from './ollama-client';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// CONFIGURATION DES LOGS
// ============================================================================

const LOG_PREFIX = '[HYBRID-V3]';
const LOG_SEPARATOR = '═'.repeat(70);

function logInfo(step: string, message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 [${step}] ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logSuccess(step: string, message: string, data?: any): void {
  console.log(`${LOG_PREFIX} ✅ [${step}] ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logError(step: string, message: string, error?: any): void {
  console.error(`${LOG_PREFIX} ❌ [${step}] ${message}`);
  if (error) console.error(`${LOG_PREFIX} 🔥 ${error.message || error}`);
}

function logMetric(step: string, metric: string, value: any): void {
  console.log(`${LOG_PREFIX} 📈 [${step}] ${metric}: ${value}`);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .trim();
}

// ============================================================================
// INITIALISATION CORE SQLITE (remplace getCache)
// ============================================================================

let dbInitialized = false;
let db: SQLiteCore;

async function getDBCache() {
  if (!dbInitialized) {
    db = SQLiteCore.getInstance();
    await db.initialize();
    dbInitialized = true;
  }
  return db;
}

// ============================================================================
// TYPES ET INTERFACES
// ============================================================================

export interface HybridResponse {
  answer: string;
  source: 'rag' | 'fallback' | 'generic' | 'procedure' | 'llm';
  confidence: number;
  sources?: any[];
  processingTime?: number;
  procedure?: ProcedureIntent;
  modelUsed?: string;
  modelReason?: string;
  fromCache?: boolean;
  complexity?: 'simple' | 'medium' | 'complex';
  ragScores?: { collection: string; score: number; count: number }[];
}

export interface ModelConfig {
  name: string;
  type: 'embedding' | 'text' | 'thinking' | 'code' | 'math' | 'image';
  description: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  speed: 'fast' | 'medium' | 'slow';
  accuracy: number;
  useCases: string[];
}

interface SearchResult {
  documents: string[];
  metadatas: Record<string, any>[];
  distances: number[];
  ids: string[];
  collection: string;
  score: number;
  error?: string;
}

interface CollectionScore {
  collection: string;
  score: number;
  count: number;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const COLLECTION_PRIORITY: Record<string, string[]> = {
  profile: ['centrale_gestion_equipes_humain', 'centrale_documents_generaux', 'centrale_formation'],
  personnel: ['centrale_gestion_equipes_humain', 'centrale_documents_generaux', 'centrale_formation'],
  experience: ['centrale_gestion_equipes_humain', 'centrale_documents_generaux'],
  procedure: ['centrale_procedures', 'centrale_documents_generaux'],
  demarrage: ['centrale_procedures', 'centrale_documents_generaux'],
  arret: ['centrale_procedures', 'centrale_documents_generaux'],
  urgence: ['centrale_securite', 'centrale_procedures'],
  maintenance: ['centrale_maintenance', 'centrale_procedures'],
  inspection: ['centrale_maintenance', 'centrale_procedures'],
  reparation: ['centrale_maintenance'],
  equipement: ['centrale_equipements_principaux', 'centrale_procedures'],
  turbine: ['centrale_equipements_principaux', 'centrale_procedures'],
  chaudiere: ['centrale_equipements_principaux'],
  securite: ['centrale_securite', 'centrale_consignes_seuils'],
  hse: ['centrale_securite'],
  performance: ['centrale_analyse_performance', 'centrale_equipements_principaux'],
  rendement: ['centrale_analyse_performance'],
  general: ['centrale_documents_generaux', 'centrale_procedures']
};

const CACHE_CONFIG = {
  ttl: 300,
  namespace: 'hybrid_provider',
  minConfidence: 0.7
};

const MODELS_CONFIG: Record<string, ModelConfig> = {
  'tinyllama:1.1b': {
    name: 'tinyllama:1.1b',
    type: 'text',
    description: 'Ultra-rapide pour questions simples',
    maxTokens: 300,
    temperature: 0.3,
    timeout: 30000,
    speed: 'fast',
    accuracy: 0.75,
    useCases: ['questions_simples', 'réponses_rapides', 'chat_basique']
  },
  'phi:2.7b': {
    name: 'phi:2.7b',
    type: 'thinking',
    description: 'Précis pour questions techniques',
    maxTokens: 800,
    temperature: 0.5,
    timeout: 60000,
    speed: 'medium',
    accuracy: 0.85,
    useCases: ['analyse_technique', 'raisonnement', 'procédures']
  },
  'gemma:2b': {
    name: 'gemma:2b',
    type: 'thinking',
    description: 'Rapide et équilibré pour usage général',
    maxTokens: 800,
    temperature: 0.5,
    timeout: 45000,
    speed: 'medium',
    accuracy: 0.88,
    useCases: ['explications_détaillées', 'analyse_profonde']
  },
  'codellama:7b': {
    name: 'codellama:7b',
    type: 'code',
    description: 'Expert en génération de code',
    maxTokens: 2000,
    temperature: 0.3,
    timeout: 90000,
    speed: 'slow',
    accuracy: 0.91,
    useCases: ['génération_code', 'débogage', 'analyse_code']
  },
  'deepseek-coder:6.7b': {
    name: 'deepseek-coder:6.7b',
    type: 'math',
    description: 'Expert en calculs et mathématiques',
    maxTokens: 1500,
    temperature: 0.2,
    timeout: 90000,
    speed: 'slow',
    accuracy: 0.94,
    useCases: ['calculs_complexes', 'formules', 'optimisation']
  }
};

const DEFAULT_MODELS = {
  text: 'tinyllama:1.1b',
  thinking: 'phi:2.7b',
  code: 'codellama:7b',
  math: 'deepseek-coder:6.7b'
};

const FALLBACK_CHAIN = ['tinyllama:1.1b', 'phi:2.7b', 'gemma:2b'];

// ============================================================================
// DÉTECTION DE REQUÊTE
// ============================================================================

function detectComplexity(query: string): 'simple' | 'medium' | 'complex' {
  const normalizedQuery = normalizeText(query);
  const wordCount = normalizedQuery.split(/\s+/).length;
  
  logMetric('COMPLEXITY', 'Mots', wordCount);
  
  if (wordCount > 15) {
    logMetric('COMPLEXITY', 'Résultat', `complex (${wordCount} mots > 15)`);
    return 'complex';
  }
  if (wordCount <= 5) {
    logMetric('COMPLEXITY', 'Résultat', `simple (${wordCount} mots ≤ 5)`);
    return 'simple';
  }
  if (wordCount <= 12) {
    logMetric('COMPLEXITY', 'Résultat', `medium (${wordCount} mots)`);
    return 'medium';
  }
  return 'medium';
}

function isProfileQuery(query: string): boolean {
  const normalizedQuery = normalizeText(query);
  const profileIndicators = [
    'ahmed', 'abbes', 'profil', 'competence', 'experience', 'cv',
    'formation', 'certification', 'langue', 'parcours'
  ];
  const isProfile = profileIndicators.some(indicator => normalizedQuery.includes(indicator));
  
  if (isProfile) {
    logInfo('PROFILE', `🧑 Profil détecté: "${query.substring(0, 50)}"`);
  }
  
  return isProfile;
}

function detectQueryType(prompt: string): string {
  const normalizedPrompt = normalizeText(prompt);
  
  if (normalizedPrompt.includes('ahmed') || normalizedPrompt.includes('abbes') || 
      normalizedPrompt.includes('profil') || normalizedPrompt.includes('competence') ||
      normalizedPrompt.includes('experience') || normalizedPrompt.includes('cv')) {
    return 'profile';
  }
  if (normalizedPrompt.includes('demarrage') || normalizedPrompt.includes('startup')) return 'demarrage';
  if (normalizedPrompt.includes('arret') || normalizedPrompt.includes('shutdown')) return 'arret';
  if (normalizedPrompt.includes('procedure') || normalizedPrompt.includes('etape')) return 'procedure';
  if (normalizedPrompt.includes('maintenance') || normalizedPrompt.includes('entretien')) return 'maintenance';
  if (normalizedPrompt.includes('tg1') || normalizedPrompt.includes('tg2')) return 'turbine';
  if (normalizedPrompt.includes('chaudiere') || normalizedPrompt.includes('cr1')) return 'chaudiere';
  if (normalizedPrompt.includes('securite') || normalizedPrompt.includes('safety')) return 'securite';
  if (normalizedPrompt.includes('performance') || normalizedPrompt.includes('rendement')) return 'performance';
  
  return 'general';
}

// ============================================================================
// RECHERCHE MULTI-COLLECTIONS
// ============================================================================

function normalizeDistanceToScore(distance: number, index: number, total: number): number {
  if (distance === 0) return 1.0;
  const rankScore = Math.max(0.2, 1 - (index / total));
  let distanceScore = 0;
  
  if (distance < 1) {
    distanceScore = 1 - distance;
  } else if (distance < 100) {
    distanceScore = 1 - (distance / 100);
  } else if (distance < 500) {
    distanceScore = Math.max(0, 1 - ((distance - 100) / 400));
  } else {
    distanceScore = Math.max(0, Math.exp(-distance / 200));
  }
  
  let finalScore: number;
  if (distance > 300) {
    finalScore = (rankScore * 0.8) + (distanceScore * 0.2);
  } else if (distance > 100) {
    finalScore = (rankScore * 0.6) + (distanceScore * 0.4);
  } else {
    finalScore = (rankScore * 0.3) + (distanceScore * 0.7);
  }
  
  return Math.max(0, Math.min(1, finalScore));
}

async function searchMultiCollections(
  query: string, 
  queryType: string
): Promise<{ results: SearchResult[]; scores: CollectionScore[] }> {
  const startTime = Date.now();
  let collections = COLLECTION_PRIORITY[queryType] || COLLECTION_PRIORITY.general;
  
  if (queryType === 'profile' && !collections.includes('centrale_gestion_equipes_humain')) {
    collections = ['centrale_gestion_equipes_humain', ...collections];
  }
  
  logInfo('RAG', `🔍 Recherche dans ${collections.length} collection(s): ${collections.join(', ')}`);
  
  const chromaManager = ChromaDBManager.getInstance();
  const results: SearchResult[] = [];
  const scores: CollectionScore[] = [];
  
  for (const collectionName of collections) {
    try {
      const collection = collectionName as CollectionName;
      // ✅ CORRECTION: Ajout du paramètre 'SHARED' pour collectionExists
      const exists = await chromaManager.collectionExists(collection, 'SHARED');
      if (!exists) {
        await chromaManager.getOrCreateCollection(collection);
      }
      
      const searchResults = await chromaManager.search(collection, query, { nResults: 5 });
      
      if (searchResults.documents.length > 0) {
        const distances = searchResults.distances;
        const scoresList = distances.map((d: number, idx: number) => normalizeDistanceToScore(d, idx, distances.length));
        const avgScore = scoresList.reduce((a: any, b: any) => a + b, 0) / scoresList.length;
        
        results.push({ ...searchResults, collection: collectionName, score: avgScore });
        scores.push({ collection: collectionName, score: avgScore, count: searchResults.documents.length });
      } else {
        scores.push({ collection: collectionName, score: 0, count: 0 });
      }
    } catch (error: any) {
      logError('RAG', `Erreur sur ${collectionName}`, error);
      scores.push({ collection: collectionName, score: 0, count: 0, error: error.message });
    }
  }
  
  results.sort((a, b) => b.score - a.score);
  scores.sort((a, b) => b.score - a.score);
  
  logSuccess('RAG', `Recherche terminée en ${formatDuration(Date.now() - startTime)}`);
  return { results, scores };
}

function formatRAGResponse(results: SearchResult[], isProfile: boolean = false): string {
  if (results.length === 0) return '';
  let response = '';
  const usedSources = new Set<string>();
  
  for (const result of results) {
    if (result.score < 0.3) continue;
    
    for (let i = 0; i < result.documents.length && i < 3; i++) {
      const doc = result.documents[i];
      const meta = result.metadatas[i];
      const source = meta?.source || meta?.titre || result.collection;
      
      if (usedSources.has(source)) continue;
      usedSources.add(source);
      
      if (isProfile) {
        response = doc;
        break;
      } else {
        const excerpt = doc.length > 500 ? `${doc.substring(0, 500)}...` : doc;
        response += `\n\n**📄 ${source}**\n${excerpt}\n`;
      }
    }
    if (isProfile && response) break;
  }
  
  return response;
}

// ============================================================================
// SÉLECTION DE MODÈLE
// ============================================================================

async function selectOptimalModel(
  query: string, 
  queryType: string, 
  complexity: string, 
  isProfile: boolean
): Promise<{ model: string; config: ModelConfig; reason: string }> {
  const lowerQuery = query.toLowerCase();
  
  if (isProfile) {
    return { model: 'gemma:2b', config: MODELS_CONFIG['gemma:2b'], reason: 'Requête de profil utilisateur' };
  }
  
  const codeKeywords = ['code', 'fonction', 'programme', 'script', 'algorithme'];
  if (codeKeywords.some(k => lowerQuery.includes(k))) {
    return { model: 'codellama:7b', config: MODELS_CONFIG['codellama:7b'], reason: 'Requête de code détectée' };
  }
  
  const mathKeywords = ['calcul', 'formule', 'équation', 'addition', 'soustraction'];
  const hasMathExpression = /\d+[\+\-\*\/]\d+/.test(query);
  if (mathKeywords.some(k => lowerQuery.includes(k)) || hasMathExpression) {
    return { model: 'deepseek-coder:6.7b', config: MODELS_CONFIG['deepseek-coder:6.7b'], reason: 'Requête mathématique détectée' };
  }
  
  if (complexity === 'complex' || queryType === 'procedure' || query.length > 200) {
    return { model: 'phi:2.7b', config: MODELS_CONFIG['phi:2.7b'], reason: 'Requête complexe' };
  }
  
  if (complexity === 'simple' || query.length < 80) {
    return { model: 'tinyllama:1.1b', config: MODELS_CONFIG['tinyllama:1.1b'], reason: 'Requête simple - réponse rapide' };
  }
  
  return { model: DEFAULT_MODELS.thinking, config: MODELS_CONFIG[DEFAULT_MODELS.thinking], reason: 'Requête standard' };
}

async function getFallbackModel(failedModel: string): Promise<{ model: string; config: ModelConfig; reason: string }> {
  const currentIndex = FALLBACK_CHAIN.indexOf(failedModel);
  const nextModel = FALLBACK_CHAIN[currentIndex + 1];
  
  if (nextModel && MODELS_CONFIG[nextModel]) {
    return { model: nextModel, config: MODELS_CONFIG[nextModel], reason: `Fallback: ${failedModel} a échoué` };
  }
  
  return { model: DEFAULT_MODELS.text, config: MODELS_CONFIG[DEFAULT_MODELS.text], reason: 'Fallback ultime' };
}

async function generateLLMResponseWithModel(
  query: string,
  context: string,
  complexity: 'simple' | 'medium' | 'complex',
  isProfile: boolean,
  modelSelection: { model: string; config: ModelConfig; reason: string }
): Promise<{ response: string | null; modelUsed: string }> {
  const startTime = Date.now();
  const { model, config } = modelSelection;
  
  let generatedPrompt: string;
  
  if (isProfile) {
    generatedPrompt = `Extrais les informations sur la personne depuis le texte ci-dessous.

TEXTE:
${context}

Réponds UNIQUEMENT avec les informations trouvées, organisées comme suit:
- Nom
- Poste
- Compétences
- Expérience
- Formation

Si une information n'est pas présente, écris "Non spécifié".`;
  } else if (complexity === 'simple') {
    generatedPrompt = `Réponds brièvement (1 phrase) à la question en utilisant le contexte:

Contexte: ${context.substring(0, 1000)}

Question: ${query}

Réponse:`;
  } else {
    generatedPrompt = `Réponds à la question en utilisant UNIQUEMENT le contexte:

Contexte:
${context.substring(0, 2000)}

Question: ${query}

Réponse:`;
  }

  try {
    const response = await callOllama(generatedPrompt, {
      model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      timeout: config.timeout
    });
    
    logSuccess('LLM', `✅ Généré en ${formatDuration(Date.now() - startTime)} avec ${model}`);
    return { response, modelUsed: model };
    
  } catch (error: any) {
    logError('LLM', `Erreur avec ${model}: ${error.message}`);
    const fallback = await getFallbackModel(model);
    return generateLLMResponseWithModel(query, context, complexity, isProfile, fallback);
  }
}

// ============================================================================
// PROVIDER PRINCIPAL
// ============================================================================

export async function callHybridProvider(prompt: string): Promise<HybridResponse> {
  const startTime = Date.now();
  const normalizedPrompt = prompt.trim();
  const dbCache = await getDBCache();
  
  console.log(`\n${LOG_SEPARATOR}`);
  logInfo('START', `🚀 NOUVELLE REQUÊTE: "${normalizedPrompt.substring(0, 100)}..."`);
  
  const complexity = detectComplexity(normalizedPrompt);
  const isProfile = isProfileQuery(normalizedPrompt);
  const queryType = detectQueryType(normalizedPrompt);
  
  const cacheKey = `query:${queryType}:${complexity}:${normalizeText(normalizedPrompt)}`;
  
  // ✅ CORRECTION: Utilisation de dbCache.get() au lieu de cache.get()
  const cachedResult = dbCache.get(CACHE_CONFIG.namespace, cacheKey);
  
  if (cachedResult) {
    logSuccess('CACHE', `⚡ Réponse du cache SQLite`);
    return { ...cachedResult as HybridResponse, fromCache: true, processingTime: Date.now() - startTime };
  }
  
  const procedureIntent = await detectProcedureIntent(normalizedPrompt);
  const { results: ragResults, scores: ragScores } = await searchMultiCollections(normalizedPrompt, queryType);
  const hasResults = ragResults.length > 0 && ragResults.some(r => r.documents.length > 0 && r.score > 0.2);
  
  let response: HybridResponse;
  
  if (procedureIntent.isProcedure && procedureIntent.confidence > 0.6 && !isProfile) {
    response = {
      answer: `📋 **Procédure ${procedureIntent.procedureName}**\n\nJe peux vous guider sur cette procédure.`,
      source: 'procedure',
      confidence: procedureIntent.confidence,
      procedure: procedureIntent,
      complexity,
      ragScores,
      processingTime: Date.now() - startTime
    };
  } else if (hasResults && ragResults[0].score > 0.2) {
    const context = formatRAGResponse(ragResults, isProfile);
    const sources = ragResults.flatMap(r => r.metadatas).slice(0, 5);
    
    const modelSelection = await selectOptimalModel(normalizedPrompt, queryType, complexity, isProfile);
    logInfo('MODEL', `🎯 Modèle sélectionné: ${modelSelection.model} (${modelSelection.reason})`);
    
    const { response: llmAnswer, modelUsed } = await generateLLMResponseWithModel(
      normalizedPrompt, context, complexity, isProfile, modelSelection
    );
    
    if (llmAnswer && llmAnswer.length > 10) {
      response = {
        answer: llmAnswer,
        source: 'llm',
        confidence: Math.min(0.95, 0.6 + ragResults[0].score * 0.3),
        sources,
        processingTime: Date.now() - startTime,
        modelUsed: modelUsed || modelSelection.model,
        modelReason: modelSelection.reason,
        complexity,
        ragScores
      };
    } else {
      response = {
        answer: `📄 **Documents trouvés:**\n\n${context}`,
        source: 'rag',
        confidence: 0.8,
        sources,
        processingTime: Date.now() - startTime,
        complexity,
        ragScores
      };
    }
  } else {
    response = {
      answer: `Je n'ai pas trouvé d'information spécifique sur "${normalizedPrompt.substring(0, 50)}".\n\n🔍 **Suggestions:**\n• Vérifiez l'orthographe technique (GE Frame 9E, SGT-800)\n• Consultez le manuel technique dans le Gestionnaire Documentaire\n• Demandez une procédure spécifique (ex: "Procédure de démarrage TG1")\n\nLe système s'appuie exclusivement sur vos documents réels pour garantir la fiabilité des informations.`,
      source: 'generic',
      confidence: 0.3,
      processingTime: Date.now() - startTime,
      complexity,
      ragScores
    };
  }
  
  if (response.confidence >= CACHE_CONFIG.minConfidence && response.source !== 'generic') {
    // ✅ CORRECTION: Utilisation de dbCache.set() au lieu de cache.set()
    dbCache.set(CACHE_CONFIG.namespace, cacheKey, response, CACHE_CONFIG.ttl);
  }
  
  logSuccess('COMPLETE', `✅ REQUÊTE TRAITÉE en ${formatDuration(response.processingTime || 0)}ms`);
  logMetric('COMPLETE', 'Modèle', response.modelUsed || 'N/A');
  logMetric('COMPLETE', 'Source', response.source);
  logMetric('COMPLETE', 'Confiance', `${(response.confidence * 100).toFixed(0)}%`);
  
  return response;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const normalizeTextForExport = normalizeText;
export { detectComplexity, detectQueryType, isProfileQuery };

export default {
  callHybridProvider,
  normalizeTextForExport,
  detectComplexity,
  detectQueryType,
  isProfileQuery
};