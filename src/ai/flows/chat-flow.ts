/**
 * @fileOverview Elite 32 Orchestrator - Point d'entrée Chat (Version IA Locale Ollama)
 * @version 9.0.0
 * @lastUpdated 2026-04-25
 * @changes Migration Core SQLite - Suppression anciens modules cache
 */

import { personalizedRecommender } from '@/ai/training/personalized-recommender';
import { semanticCacheService } from '@/ai/cache/semantic-cache';
import { callOllamaStream } from '@/ai/providers/ollama-client';
import { searchIntelligent, getFullDocument } from '@/ai/rag/intelligent-retriever';
import { detectProcedureIntent, ProcedureIntent } from '@/ai/rag/procedure-detector';
import { extractStepsFromContent, Step } from '@/ai/rag/procedure-extractor';
import { CollectionName } from '@/ai/vector/chromadb-schema';
import { smartRouter } from '@/ai/router/smart-router';
import { aiLogger } from '@/lib/logger/ai-logger';
import { validateResponseAgainstContext } from '@/ai/validation/context-validator';
import { QueryIntentAnalyzer } from '@/ai/query-intent-analyzer';
import type { HybridResponse } from '@/ai/resilience/hybrid-router';
import { searchImagesByQuery } from '@/ai/vision/vision-rag';
import { SQLiteCore } from '@/ai/core/sqlite';

// Module nominal pour recherche par nom de fichier
import { nominalSearchService } from '@/ai/nominal/nominal-search.service';
// Pipeline d'orchestration complet
import { orchestrateResponse } from '@/ai/orchestration';
import path from 'path';
import { dependencyGraph } from '../orchestration/dependency-graph';
import { mindMapChatEnricher } from '@/ai/mindmap/mindmap-chat-enricher';

const intentAnalyzer = new QueryIntentAnalyzer();

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
// LOGGER SIMPLIFIÉ
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class SimpleLogger {
  private level: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  private logToConsole = true;

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.level];
  }

  private format(level: LogLevel, module: string, message: string, meta?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()} [${module}] ${message}${metaStr}`;
  }

  debug(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('debug')) {
      const formatted = this.format('debug', 'ChatFlow', message, meta);
      if (this.logToConsole) console.log(`\x1b[36m${formatted}\x1b[0m`);
    }
  }

  info(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('info')) {
      const formatted = this.format('info', 'ChatFlow', message, meta);
      if (this.logToConsole) console.log(`\x1b[32m${formatted}\x1b[0m`);
    }
  }

  warn(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('warn')) {
      const formatted = this.format('warn', 'ChatFlow', message, meta);
      if (this.logToConsole) console.log(`\x1b[33m${formatted}\x1b[0m`);
    }
  }

  error(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('error')) {
      const formatted = this.format('error', 'ChatFlow', message, meta);
      if (this.logToConsole) console.log(`\x1b[31m${formatted}\x1b[0m`);
    }
  }
}

const logger = new SimpleLogger();

// ============================================================================
// LOGS STRUCTURÉS
// ============================================================================

function logStructured(step: string, data: any): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    module: 'CHAT-FLOW',
    step: step,
    ...data
  }, null, 2));
}

// ============================================================================
// TYPES
// ============================================================================

export interface ProcedureContext {
  isProcedure: boolean;
  procedureIntent: ProcedureIntent;
  steps?: Step[];
  documentContent?: string;
  collection?: string;
  documentId?: string;
}

export interface ProcedureResponse {
  type: 'procedure_detected' | 'procedure_steps' | 'procedure_guide' | 'normal';
  procedureName?: string;
  steps?: Step[];
  currentStepIndex?: number;
  totalSteps?: number;
  message?: string;
}

export interface ChatInput {
  text: string;
  history?: any[];
  documentContext?: string;
  episodicMemory?: any[];
  distilledRules?: any[];
  userProfile?: {
    id?: string;
    expertise?: 'débutant' | 'intermédiaire' | 'expert';
    preferences?: Record<string, any>;
    domain?: string;
  };
  hierarchyNodes?: any[];
  strictness?: number;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'détaillé' | 'concis' | 'technique' | 'pédagogique';
  procedureMode?: 'proposal' | 'steps' | 'guide' | 'next_step' | 'prev_step' | 'complete';
  currentProcedureId?: string;
  currentStepIndex?: number;
  procedureAction?: 'show_steps' | 'start_guide' | 'next' | 'prev' | 'complete' | 'reset' | 'show_full_document';
  model?: 'gemma2:2b' | 'tinyllama:latest' | 'gemma:2b' | 'gemma2:2b';
  visionContext?: string;
  detectedInnovations?: any[];
}

export interface ChatOutput {
  answer: string;
  sources?: Array<{
    id: string;
    title: string;
    relevance: number;
    excerpt?: string;
  }>;
  confidence?: number;
  disclaimer?: string;
  suggestions?: string[];
  recommendations?: any[];
  newMemoryEpisode?: any;
  pedagogicalLevel?: string;
  collaborativeInsight?: string;
  processingTime?: number;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  warnings?: string[];
  procedureResponse?: ProcedureResponse;
  hybridMetadata?: HybridResponse;
  images?: Array<{
    id: string;
    url: string;
    thumbnailUrl: string;
    filename: string;
    description?: string;
    similarity?: number;
  }>;
  showImagesDirectly?: boolean;
  imagesAvailable?: boolean;
  metadata?: any;
}

// ============================================================================
// CACHE SÉMANTIQUE INTELLIGENT (DragonMemory + SQLite)
// ============================================================================

const semanticCache = semanticCacheService;

// ============================================================================
// GESTION DES SESSIONS DE PROCÉDURE
// ============================================================================

interface ActiveProcedureSession {
  procedureId: string;
  procedureName: string;
  steps: Step[];
  currentStepIndex: number;
  startedAt: Date;
  userId: string;
  documentId: string;
  collection: string;
}

const activeProcedures = new Map<string, ActiveProcedureSession>();

function generateProcedureId(): string {
  return `proc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ============================================================================
// FONCTIONS DE DÉTECTION ET DE TRAITEMENT DES PROCÉDURES
// ============================================================================

async function detectAndExtractProcedure(query: string): Promise<ProcedureContext | null> {
  const startTime = Date.now();
  
  logStructured('DETECTION_START', {
    query: query.substring(0, 100),
    queryLength: query.length
  });
  
  logger.debug('Détection de procédure', { query: query.substring(0, 50) });
  
  const procedureIntent = await detectProcedureIntent(query);
  
  if (!procedureIntent.isProcedure || procedureIntent.confidence < 0.6) {
    logStructured('DETECTION_NO_PROCEDURE', {
      query: query.substring(0, 100),
      confidence: procedureIntent.confidence
    });
    return null;
  }
  
  logger.info('Procédure détectée', {
    procedureName: procedureIntent.procedureName,
    confidence: procedureIntent.confidence
  });
  
  const searchResults = await searchIntelligent(query, {
    userProfile: 'chef_quart',
    nResults: 30,
    minConfidence: 0.3
  });
  
  logStructured('RAG_RESULTS', {
    query: query,
    resultsCount: searchResults.length,
    results: searchResults.slice(0, 10).map(r => ({
      source: r.source,
      contentLength: r.content?.length || 0,
      contentPreview: r.content?.substring(0, 100),
      confidence: r.confidence
    }))
  });
  
  logger.info(`[RAG] ${searchResults.length} résultats trouvés pour la procédure`);
  
  let steps: Step[] = [];
  let documentContent = '';
  let collection = '';
  let documentId = '';
  let fullDocumentContent = '';
  
  for (const result of searchResults) {
    const isProcedureResult = result.source === 'procedure' || 
                              result.metadata?.type?.includes('procedure') ||
                              result.content?.toLowerCase().includes('procédure') ||
                              result.content?.toLowerCase().includes('démarrage') ||
                              result.content?.toLowerCase().includes('arrêt');
    
    if (isProcedureResult) {
      documentContent = result.content;
      collection = result.metadata?.collection || result.source;
      
      if (collection.toLowerCase() === 'procedures_exploitation') {
        collection = 'PROCEDURES_EXPLOITATION';
      }
      documentId = result.metadata?.id || '';
      
      if (documentId) {
        try {
          const fullDoc = await getFullDocument(documentId, collection as CollectionName);
          if (fullDoc && fullDoc.content && fullDoc.content.length > documentContent.length) {
            fullDocumentContent = fullDoc.content;
            logger.info(`[RAG] Document complet récupéré: ${fullDocumentContent.length} caractères`);
            
            const fullSteps = extractStepsFromContent(fullDocumentContent);
            if (fullSteps.length > steps.length) {
              steps = fullSteps;
              logger.info(`[RAG] ${steps.length} étapes extraites du document complet`);
            }
          }
        } catch (error) {
          logger.warn(`[RAG] Impossible de récupérer le document complet: ${documentId}`);
        }
      }
      
      if (steps.length === 0) {
        const extractedSteps = extractStepsFromContent(documentContent);
        if (extractedSteps.length > steps.length) {
          steps = extractedSteps;
          logger.debug(`[RAG] ${steps.length} étapes extraites du chunk`);
        }
      }
      
      if (steps.length >= 20) {
        logger.info(`[RAG] Suffisamment d'étapes trouvées (${steps.length}), arrêt de la recherche`);
        break;
      }
    }
  }
  
  if (steps.length === 0) {
    logStructured('DETECTION_NO_STEPS', {
      query: query.substring(0, 100),
      resultsAnalyzed: searchResults.length
    });
    logger.warn('[RAG] Aucune étape extraite des résultats');
    return null;
  }
  
  const elapsedTime = Date.now() - startTime;
  
  logStructured('DETECTION_SUCCESS', {
    procedureName: procedureIntent.procedureName,
    stepsCount: steps.length,
    extractionTimeMs: elapsedTime,
    hasFullDocument: !!fullDocumentContent,
    documentSize: fullDocumentContent.length || documentContent.length
  });
  
  logger.info(`[RAG] Extraction terminée: ${steps.length} étapes trouvées`);
  
  return {
    isProcedure: true,
    procedureIntent,
    steps,
    documentContent: fullDocumentContent || documentContent,
    collection,
    documentId
  };
}

// ============================================================================
// FONCTION POUR GÉNÉRER UNE RÉPONSE À PARTIR DU RAG
// ============================================================================

async function generateAnswerFromRAG(query: string, zone: string): Promise<{ answer: string; sources: any[] }> {
  const searchResults = await searchIntelligent(query, {
    userProfile: 'chef_quart',
    nResults: 5,
    minConfidence: 0.3,
    zone: zone as any
  });
  
  if (searchResults.length === 0) {
    return {
      answer: "Je ne trouve pas cette information dans la base locale.",
      sources: []
    };
  }
  
  const routerResult = await smartRouter.route(query, {
    userId: 'default-user',
    mode: zone === 'RH' ? 'profile' : 'auto'
  });
  
  const sources = searchResults.slice(0, 3).map(r => ({
    id: r.metadata?.id || 'unknown',
    title: r.metadata?.source || r.source,
    relevance: r.confidence,
    excerpt: r.content?.substring(0, 200)
  }));
  
  return {
    answer: routerResult.response,
    sources
  };
}

// ============================================================================
// FONCTION POUR DÉTECTER SI LA REQUÊTE DEMANDE EXPLICITEMENT UNE IMAGE
// ============================================================================

function isExplicitImageQuery(query: string): boolean {
  const imagePatterns = [
    /(donne|affiche|montre|vois|voir).*(image|photo|schéma|visuel|dessin|illustration)/i,
    /(image|photo|schéma|visuel|dessin).*(de|du|des|la|le|les)/i,
    /^image\s+de/i,
    /^photo\s+de/i,
    /^schéma\s+de/i,
    /afficher\s+l['']image/i,
    /montrer\s+l['']image/i
  ];
  
  return imagePatterns.some(pattern => pattern.test(query));
}

/**
 * Calcule un score normalisé (0-1) pour la recherche nominale
 */
function getNormalizedScore(nominalResult: any, query: string): number {
  let normalized = nominalResult.score / 10;
  
  const queryClean = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  const fileClean = nominalResult.filePath?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  
  if (fileClean.includes(queryClean) || queryClean.includes(fileClean)) {
    normalized = Math.max(normalized, 0.85);
  }
  
  if (nominalResult.mode === 'exact') {
    normalized = Math.max(normalized, 0.9);
  } else if (nominalResult.mode === 'partial') {
    normalized = Math.max(normalized, 0.7);
  }
  
  return Math.min(1, normalized);
}

// ============================================================================
// INITIALISATION DU GRAPHE DE DÉPENDANCES
// ============================================================================

let graphInitialized = false;

async function ensureGraphInitialized(): Promise<void> {
  if (!graphInitialized) {
    try {
      await dependencyGraph.initialize();
      graphInitialized = true;
    } catch (error) {
      console.error('[GRAPH] Erreur initialisation:', error);
    }
  }
}

// ============================================================================
// ORCHESTRATEUR PRINCIPAL AVEC SMART ROUTER + VISION + PIPELINE 5 INNOVATIONS
// ============================================================================

export async function chat(input: ChatInput): Promise<ChatOutput> {
  const startTime = Date.now();
  
  await ensureGraphInitialized();
  await getDB(); // Initialiser SQLite

  // 🧠 Enrichissement dynamique du contexte avec les Mind Maps si un circuit est mentionné
  const enrichment = await mindMapChatEnricher.enrichPromptContext(input.text, input.documentContext || '');
  input.documentContext = enrichment.enrichedContext;
  
  aiLogger.logStep(1, 'FLOW', 'Request Received', {
    text: input.text.substring(0, 500),
    procedureMode: input.procedureMode,
    model: input.model,
    userExpertise: input.userProfile?.expertise,
    message: `Réception d'une nouvelle requête (${input.text.length} chars)`
  });

  // ============================================
  // GESTION DES CONFIRMATIONS (OUI/NON)
  // ============================================
  const lastEpisode = input.episodicMemory && input.episodicMemory.length > 0 
    ? input.episodicMemory[input.episodicMemory.length - 1] 
    : null;

  if (lastEpisode && lastEpisode.type === 'confirmation_required' && lastEpisode.cachedHash) {
    const isYes = /\b(oui|yes|d'accord|ok|affirmatif|vas-y|go)\b/i.test(input.text);
    const isNo = /\b(non|no|négatif|annuler|stop)\b/i.test(input.text);

    if (isYes) {
      console.log(`[PERMANENT-CACHE] ✅ Confirmation reçue pour le hash: ${lastEpisode.cachedHash}`);
      
      const dbInstance = await getDB();
      
      // Récupérer l'entrée depuis SQLite
      const cachedEntry = dbInstance.cache.getPermanentEntry(lastEpisode.cachedHash);
      
      if (cachedEntry) {
        return {
          answer: cachedEntry.response,
          confidence: 1.0,
          processingTime: Date.now() - startTime,
          sources: [{ 
            id: cachedEntry.hash, 
            title: `Réponse validée 5⭐ (${cachedEntry.zone})`, 
            relevance: 1.0 
          }],
          warnings: ["✅ Réponse validée chargée"],
          suggestions: ["Détails techniques", "Procédures liées"]
        };
      }
    } else if (isNo) {
      console.log(`[PERMANENT-CACHE] ❌ Confirmation refusée`);
    }
  }
  
  logStructured('CHAT_START', {
    textPreview: input.text.substring(0, 100),
    procedureMode: input.procedureMode,
    procedureAction: input.procedureAction,
    model: input.model,
    userExpertise: input.userProfile?.expertise
  });
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 SECTION 6 – Orchestration du Flow');
  console.log('📝 Texte à traiter :', input.text.substring(0, 100));
  console.log('🔧 Mode procédure :', input.procedureMode || 'none');
  console.log('👤 Expertise utilisateur :', input.userProfile?.expertise || 'intermédiaire');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('Début traitement chat', {
    textPreview: input.text.substring(0, 50),
    procedureMode: input.procedureMode,
    procedureAction: input.procedureAction,
    model: input.model,
    userExpertise: input.userProfile?.expertise
  });

 // ============================================
// SECTION 1.5 - CACHE PERMANENT (SQLite)
// ============================================

interface PermanentCacheEntry {
  hash: string;
  question: string;
  response: string;
  zone: string;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
}

const intentAnalysis = await intentAnalyzer.analyze(input.text);
const detectedZone = intentAnalysis.detectedZone || (intentAnalysis.relevantZones[0]) || 'SHARED';

// Recherche dans le cache permanent SQLite
const dbInstance = await getDB();
const allCachedEntries = dbInstance.cache.searchPermanentEntries(detectedZone) as PermanentCacheEntry[];

// Recherche sémantique simple sur les questions
let bestMatch: { entry: PermanentCacheEntry; similarity: number } | null = null;
const normalizedQuery = input.text.toLowerCase().trim();

for (const entry of allCachedEntries) {
  const similarity = entry.question.toLowerCase().includes(normalizedQuery) || 
                     normalizedQuery.includes(entry.question.toLowerCase()) ? 0.95 : 0.5;
  if (similarity > (bestMatch?.similarity || 0)) {
    bestMatch = { entry, similarity };
  }
}

const isPerfectHit = bestMatch && bestMatch.similarity >= 0.9;
const isSuggestion = bestMatch && bestMatch.similarity >= 0.6 && bestMatch.similarity < 0.9;

if (isPerfectHit && bestMatch?.entry) {
  const processingTime = Date.now() - startTime;
  console.log(`[PERMANENT-CACHE] 🚀 Hit Direct (>90%) - Réponse immédiate`);
  
  aiLogger.logStep(1.5, 'CACHE', 'Permanent Cache Hit', {
    similarity: bestMatch.similarity,
    zone: detectedZone,
    hash: bestMatch.entry.hash,
    message: `Cache Hit: Réponse validée trouvée (${(bestMatch.similarity * 100).toFixed(1)}%)`
  });

  return {
    answer: bestMatch.entry.response,
    confidence: 1.0,
    processingTime,
    sources: [{ 
      id: bestMatch.entry.hash, 
      title: `Réponse validée 5⭐ (${bestMatch.entry.zone})`, 
      relevance: bestMatch.similarity 
    }],
    suggestions: ["Détails techniques", "Procédures liées"],
    warnings: ["✅ Réponse vérifiée et validée"],
    procedureResponse: bestMatch.entry.response.includes('étape') ? {
      type: 'procedure_detected',
      procedureName: bestMatch.entry.question,
      message: 'Réponse issue du cache permanent'
    } : undefined
  };
}

if (isSuggestion && bestMatch?.entry) {
  console.log(`[PERMANENT-CACHE] 🎤 Suggestion (60-90%) - Demande confirmation`);
  
  aiLogger.logStep(1.5, 'CACHE', 'Permanent Cache Suggestion', {
    similarity: bestMatch.similarity,
    zone: detectedZone,
    message: `Suggestion de cache: Proximité sémantique à ${(bestMatch.similarity * 100).toFixed(1)}%`
  });

  return {
    answer: `J'ai trouvé une réponse validée qui semble correspondre : **"${bestMatch.entry.question}"**. \n\nVoulez-vous que je l'utilise ? (Répondez par "Oui" ou "Non")`,
    confidence: bestMatch.similarity,
    processingTime: Date.now() - startTime,
    suggestions: ["Oui", "Non"],
    warnings: ["🔍 Similarité forte détectée"],
    newMemoryEpisode: {
      type: 'confirmation_required',
      cachedHash: bestMatch.entry.hash,
      targetQuestion: bestMatch.entry.question
    }
  };
}
  // ============================================
  // SECTION 1.55 - PIPELINE D'ORCHESTRATION COMPLET (5 innovations)
  // ============================================
  
  if (!isPerfectHit && !isSuggestion) {
    try {
      console.log(`[ORCHESTRATION] 🚀 Lancement du pipeline complet...`);
      
      const orchestrationResult = await orchestrateResponse({
        query: input.text,
        zone: detectedZone,
        options: {
          skipCache: false,
          skipNominal: false,
          skipRAG: false,
          skipVision: false
        },
        visionContext: input.visionContext,
        detectedInnovations: input.detectedInnovations
      });
      
      console.log(`[ORCHESTRATION] ✅ Pipeline terminé: stratégie=${orchestrationResult.strategy}, confiance=${(orchestrationResult.confidence * 100).toFixed(0)}%`);
      
      if (orchestrationResult.strategy === 'not_found' && orchestrationResult.confidence < 0.5) {
        console.log(`[ORCHESTRATION] ✅ Décision not_found confirmée (confiance: ${(orchestrationResult.confidence * 100).toFixed(0)}%) - Réponse sans fallback`);
        
        return {
          answer: "Je ne trouve pas cette information dans la base locale.",
          confidence: orchestrationResult.confidence,
          processingTime: orchestrationResult.processingTime,
          sources: [],
          warnings: ["🔍 Aucune information pertinente trouvée pour cette question"],
          suggestions: ["Reformulez votre question", "Essayez des mots-clés différents"]
        };
      }
      
      if (orchestrationResult.confidence >= 0.6) {
        console.log(`[ORCHESTRATION] ✅ Réponse trouvée avec confiance suffisante (${(orchestrationResult.confidence * 100).toFixed(0)}%) - Utilisation directe`);
        
        return {
          answer: orchestrationResult.answer,
          confidence: orchestrationResult.confidence,
          processingTime: orchestrationResult.processingTime,
          sources: [],
          warnings: [`🔍 Stratégie: ${orchestrationResult.strategy}`],
          suggestions: ["Plus de détails", "Voir les sources"]
        };
      }
      
      console.log(`[ORCHESTRATION] ⚠️ Confiance insuffisante (${(orchestrationResult.confidence * 100).toFixed(0)}% < 60%), fallback pipeline standard`);
      
    } catch (error: any) {
      console.error(`[ORCHESTRATION] ❌ Erreur: ${error.message}, fallback pipeline standard`);
    }
  }

  // ============================================
  // SECTION 1.6 - RECHERCHE NOMINALE (PRIORITAIRE AVEC SCORE DYNAMIQUE)
  // ============================================
  
  if (!isPerfectHit && !isSuggestion) {
    const nominalResult = await nominalSearchService.search(input.text);
    
    if (nominalResult.found) {
      const processingTime = Date.now() - startTime;
      
      const normalizedScore = getNormalizedScore(nominalResult, input.text);
      
      console.log(`[NOMINAL-SEARCH] 🎯 Fichier trouvé: ${nominalResult.filePath} (score brut: ${nominalResult.score}, normalisé: ${normalizedScore.toFixed(2)}, mode: ${nominalResult.mode}, qualité: ${nominalResult.matchQuality})`);
      
      await nominalSearchService.enrichImplicitMapping(input.text, nominalResult);
      
      if (normalizedScore >= 0.5) {
        console.log(`[NOMINAL-SEARCH] 🎯 Score ${normalizedScore.toFixed(2)} → RAG pour réponse intelligente (fichier: ${path.basename(nominalResult.filePath!)}`);
        
        const { answer, sources } = await generateAnswerFromRAG(input.text, nominalResult.zone);
        
        const enhancedSources = [...sources];
        if (nominalResult.filePath) {
          enhancedSources.unshift({
            id: nominalResult.filePath,
            title: `📁 ${path.basename(nominalResult.filePath)} (fichier source)`,
            relevance: normalizedScore,
            excerpt: `Fichier trouvé par recherche nominale avec un score de ${(normalizedScore * 100).toFixed(0)}%`
          });
        }
        
        aiLogger.logStep(1.6, 'NOMINAL', 'File Found + RAG (Intelligent Response)', {
          filePath: nominalResult.filePath,
          scoreBrut: nominalResult.score,
          normalizedScore,
          zone: nominalResult.zone,
          mode: nominalResult.mode,
          matchQuality: nominalResult.matchQuality,
          ragSourcesCount: sources.length
        });
        
        return {
          answer,
          confidence: Math.min(0.95, normalizedScore + 0.1),
          processingTime,
          sources: enhancedSources.slice(0, 5),
          warnings: normalizedScore >= 0.9 
            ? [`✅ Fichier "${path.basename(nominalResult.filePath!)}" trouvé (match parfait)`]
            : [`📁 Fichier trouvé: ${path.basename(nominalResult.filePath!)}`],
          suggestions: ["Plus de détails", "Voir le document complet", "Autres informations"],
          procedureResponse: undefined
        };
      }
      
      else {
        console.log(`[NOMINAL-SEARCH] ⚠️ Score normalisé faible (${normalizedScore.toFixed(2)}) → fallback RAG standard`);
      }
    }
  }
  
  // ============================================
  // GESTION DES ACTIONS DE PROCÉDURE
  // ============================================
  
  if (input.procedureAction === 'next' && input.currentProcedureId) {
    const session = activeProcedures.get(input.currentProcedureId);
    if (session && session.currentStepIndex < session.steps.length - 1) {
      session.currentStepIndex++;
      activeProcedures.set(input.currentProcedureId, session);
      
      const currentStep = session.steps[session.currentStepIndex];
      const isComplete = session.currentStepIndex === session.steps.length - 1;
      
      logger.info('Étape suivante procédure', {
        procedureId: input.currentProcedureId,
        stepIndex: session.currentStepIndex,
        totalSteps: session.steps.length
      });
      
      return {
        answer: `📌 **Étape ${currentStep.number}/${session.steps.length}**\n\n${currentStep.description}${currentStep.safetyNote ? `\n\n⚠️ **Consigne de sécurité**: ${currentStep.safetyNote}` : ''}${currentStep.verification ? `\n\n✓ **Vérification**: ${currentStep.verification}` : ''}`,
        confidence: 0.95,
        processingTime: Date.now() - startTime,
        sources: [],
        suggestions: isComplete ? ["✅ Terminer la procédure"] : ["▶️ Étape suivante", "⬅️ Étape précédente"],
        recommendations: [],
        warnings: [],
        procedureResponse: {
          type: 'procedure_guide',
          procedureName: session.procedureName,
          steps: session.steps,
          currentStepIndex: session.currentStepIndex,
          totalSteps: session.steps.length,
          message: isComplete ? 'Procédure terminée !' : `Étape ${session.currentStepIndex + 1}/${session.steps.length}`
        }
      };
    }
    
    if (session && session.currentStepIndex === session.steps.length - 1) {
      activeProcedures.delete(input.currentProcedureId);
      return {
        answer: `✅ **Procédure "${session.procedureName}" terminée avec succès !**\n\nN'oubliez pas de documenter l'intervention et de vérifier les paramètres finaux.`,
        confidence: 0.95,
        processingTime: Date.now() - startTime,
        sources: [],
        suggestions: ["Vérifier les paramètres finaux", "Documenter l'intervention", "Nouvelle procédure"],
        recommendations: [],
        warnings: [],
        procedureResponse: {
          type: 'procedure_guide',
          procedureName: session.procedureName,
          totalSteps: session.steps.length,
          message: 'Procédure terminée'
        }
      };
    }
  }
  
  if (input.procedureAction === 'prev' && input.currentProcedureId) {
    const session = activeProcedures.get(input.currentProcedureId);
    if (session && session.currentStepIndex > 0) {
      session.currentStepIndex--;
      activeProcedures.set(input.currentProcedureId, session);
      
      const currentStep = session.steps[session.currentStepIndex];
      
      return {
        answer: `📌 **Retour à l'étape ${currentStep.number}/${session.steps.length}**\n\n${currentStep.description}`,
        confidence: 0.95,
        processingTime: Date.now() - startTime,
        sources: [],
        suggestions: ["▶️ Étape suivante", "📋 Voir toutes les étapes"],
        recommendations: [],
        warnings: [],
        procedureResponse: {
          type: 'procedure_guide',
          procedureName: session.procedureName,
          steps: session.steps,
          currentStepIndex: session.currentStepIndex,
          totalSteps: session.steps.length,
          message: `Retour à l'étape ${session.currentStepIndex + 1}`
        }
      };
    }
  }
  
  if (input.procedureAction === 'reset' && input.currentProcedureId) {
    activeProcedures.delete(input.currentProcedureId);
    logger.info('Procédure réinitialisée', { procedureId: input.currentProcedureId });
    return {
      answer: `🔄 La procédure a été réinitialisée. Vous pouvez recommencer si nécessaire.`,
      confidence: 0.9,
      processingTime: Date.now() - startTime,
      sources: [],
      suggestions: ["Recommencer la procédure", "Afficher les étapes"],
      recommendations: [],
      warnings: [],
      procedureResponse: {
        type: 'procedure_detected',
        message: 'Procédure réinitialisée'
      }
    };
  }
  
  if (input.procedureAction === 'complete' && input.currentProcedureId) {
    const session = activeProcedures.get(input.currentProcedureId);
    activeProcedures.delete(input.currentProcedureId);
    logger.info('Procédure marquée comme terminée', { procedureId: input.currentProcedureId });
    return {
      answer: `✅ **Procédure "${session?.procedureName || 'en cours'}" terminée avec succès !**\n\nN'oubliez pas de documenter l'intervention dans le rapport de maintenance.`,
      confidence: 0.95,
      processingTime: Date.now() - startTime,
      sources: [],
      suggestions: ["Vérifier les paramètres finaux", "Rédiger le rapport", "Nouvelle procédure"],
      recommendations: [],
      warnings: [],
      procedureResponse: {
        type: 'procedure_guide',
        message: 'Procédure terminée'
      }
    };
  }

  // ============================================
  // DÉTECTION DES PROCÉDURES
  // ============================================
  
  if (input.procedureMode === 'proposal') {
    const procedureContext = await detectAndExtractProcedure(input.text);
    
    if (procedureContext && procedureContext.steps && procedureContext.steps.length > 0) {
      const procedureId = generateProcedureId();
      
      activeProcedures.set(procedureId, {
        procedureId,
        procedureName: procedureContext.procedureIntent.procedureName,
        steps: procedureContext.steps,
        currentStepIndex: 0,
        startedAt: new Date(),
        userId: input.userProfile?.id || 'default-user',
        documentId: procedureContext.documentId || '',
        collection: procedureContext.collection || ''
      });
      
      logger.info('Nouvelle procédure enregistrée', {
        procedureId,
        procedureName: procedureContext.procedureIntent.procedureName,
        stepsCount: procedureContext.steps.length
      });
      
      const stepsPreview = procedureContext.steps.slice(0, 5).map(s => 
        `  ${s.number}. ${s.description.substring(0, 300)}${s.description.length > 300 ? '...' : ''}`
      ).join('\n\n');
      
      const remainingSteps = procedureContext.steps.length - 5;
      const stepsSummary = remainingSteps > 0 
        ? `\n  ... et ${remainingSteps} étapes supplémentaires`
        : '';
      
      return {
        answer: `🔧 **Procédure détectée : ${procedureContext.procedureIntent.procedureName}**\n\n` +
                `📊 **Résumé de la procédure** (${procedureContext.steps.length} étapes):\n` +
                `${stepsPreview}${stepsSummary}`,
        confidence: 0.9,
        processingTime: Date.now() - startTime,
        sources: [],
        suggestions: ["📋 Afficher les étapes", "🎯 Me guider pas à pas", "📄 Voir le document complet"],
        recommendations: [],
        warnings: procedureContext.steps.length < 5 ? ["⚠️ Peu d'étapes détectées, la procédure pourrait être incomplète"] : [],
        procedureResponse: {
          type: 'procedure_detected',
          procedureName: procedureContext.procedureIntent.procedureName,
          steps: procedureContext.steps,
          totalSteps: procedureContext.steps.length,
          message: `${procedureContext.steps.length} étapes détectées`
        }
      };
    } else {
      aiLogger.logStep(3, 'FLOW', 'No Procedure Found', {
        message: 'Aucune procédure explicite détectée dans la requête'
      });
    }
  }
  
  // ============================================
  // AFFICHAGE DES ÉTAPES DÉTAILLÉES
  // ============================================
  
  if (input.procedureAction === 'show_steps' && input.currentProcedureId) {
    const session = activeProcedures.get(input.currentProcedureId);
    if (session) {
      const stepsText = session.steps.map(s => {
        let stepText = `**${s.number}. ${s.description}**`;
        if (s.duration) stepText += ` ⏱️ ${s.duration} min`;
        if (s.subSteps?.length) {
          stepText += `\n   📌 Sous-étapes:`;
          stepText += s.subSteps.map(sub => `\n      • ${sub}`).join('');
        }
        if (s.safetyNote) stepText += `\n   ⚠️ **Sécurité**: ${s.safetyNote}`;
        if (s.verification) stepText += `\n   ✓ **Vérification**: ${s.verification}`;
        if (s.expectedOutcome) stepText += `\n   → **Résultat**: ${s.expectedOutcome}`;
        return stepText;
      }).join('\n\n');
      
      const totalDuration = session.steps.reduce((sum, s) => sum + (s.duration || 0), 0);
      const durationText = totalDuration > 0 ? `\n\n⏱️ **Durée totale estimée**: ${totalDuration} minutes` : '';
      
      return {
        answer: `📋 **${session.procedureName}** (${session.steps.length} étapes)${durationText}\n\n${stepsText}`,
        confidence: 0.95,
        processingTime: Date.now() - startTime,
        sources: [],
        suggestions: ["🎯 Démarrer le guide pas à pas", "📄 Voir le document complet", "Retour"],
        recommendations: [],
        warnings: [],
        procedureResponse: {
          type: 'procedure_steps',
          procedureName: session.procedureName,
          steps: session.steps,
          totalSteps: session.steps.length,
          message: `${session.steps.length} étapes détaillées`
        }
      };
    }
  }
  
  // ============================================
  // GUIDE PAS À PAS
  // ============================================
  
  if (input.procedureAction === 'start_guide' && input.currentProcedureId) {
    const session = activeProcedures.get(input.currentProcedureId);
    if (session && session.steps.length > 0) {
      const firstStep = session.steps[0];
      
      return {
        answer: `🎯 **Guide pas à pas - ${session.procedureName}**\n\n📌 **Étape 1/${session.steps.length}**\n\n${firstStep.description}${firstStep.safetyNote ? `\n\n⚠️ **Consigne de sécurité**: ${firstStep.safetyNote}` : ''}${firstStep.verification ? `\n\n✓ **Vérification**: ${firstStep.verification}` : ''}`,
        confidence: 0.95,
        processingTime: Date.now() - startTime,
        sources: [],
        suggestions: ["▶️ Étape suivante", "📋 Voir toutes les étapes", "❌ Annuler"],
        recommendations: [],
        warnings: [],
        procedureResponse: {
          type: 'procedure_guide',
          procedureName: session.procedureName,
          steps: session.steps,
          currentStepIndex: 0,
          totalSteps: session.steps.length,
          message: 'Guide démarré'
        }
      };
    }
  }
  
  // ============================================
  // AFFICHAGE DU DOCUMENT COMPLET
  // ============================================
  
  if (input.procedureAction === 'show_full_document' && input.currentProcedureId) {
    const session = activeProcedures.get(input.currentProcedureId);
    if (session && session.documentId) {
      try {
        const fullDoc = await getFullDocument(session.documentId, session.collection as CollectionName);
        
        if (fullDoc && fullDoc.content) {
          const maxDisplay = 5000;
          const content = fullDoc.content.length > maxDisplay 
            ? fullDoc.content.substring(0, maxDisplay) + '\n\n... (document tronqué, voir fichier original pour la suite)'
            : fullDoc.content;
          
          return {
            answer: `📄 **Document complet: ${session.procedureName}**\n\n` +
                    `\`\`\`\n${content}\n\`\`\`\n\n` +
                    `📊 **Statistiques du document:**\n` +
                    `• Taille: ${fullDoc.content.length} caractères\n` +
                    `• ${fullDoc.chunks.length} chunks indexés\n` +
                    `• Collection: ${session.collection}`,
            confidence: 0.95,
            processingTime: Date.now() - startTime,
            sources: [],
            suggestions: ["📋 Afficher les étapes", "🎯 Reprendre le guide", "↩️ Retour"],
            recommendations: [],
            warnings: [],
            procedureResponse: {
              type: 'procedure_steps',
              procedureName: session.procedureName,
              message: 'Document complet affiché'
            }
          };
        }
      } catch (error: any) {
        logger.error('Erreur récupération document complet', error);
        return {
          answer: `❌ Impossible de récupérer le document complet: ${error.message}`,
          confidence: 0.5,
          processingTime: Date.now() - startTime,
          sources: [],
          suggestions: ["📋 Afficher les étapes", "🎯 Reprendre le guide"],
          recommendations: [],
          warnings: ["Document non disponible"],
          procedureResponse: {
            type: 'procedure_guide',
            procedureName: session.procedureName,
            message: 'Document non disponible'
          }
        };
      }
    }
  }
  
  // ============================================
  // REQUÊTE NORMALE - UTILISATION DU SMART ROUTER + VISION
  // ============================================
  
  const computeAnswer = async (): Promise<ChatOutput> => {
    try {
      const explicitImageQuery = isExplicitImageQuery(input.text);
      let images: ChatOutput['images'] = [];
      let imagesAvailableCount = 0;
      let showImagesDirectly = false;
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🖼️ [IMAGES-DEBUG] RECHERCHE D\'IMAGES');
      console.log(`📝 Requête: "${input.text}"`);
      console.log(`🎯 Mode explicite: ${explicitImageQuery ? 'OUI' : 'NON'}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      try {
        const visionResults = await searchImagesByQuery(input.text, 3);
        if (visionResults.length > 0) {
          images = visionResults.map(img => ({
            id: img.imageId,
            url: `/api/vision/images/${img.imageId}?raw=true`,
            thumbnailUrl: `/api/vision/images/${img.imageId}?thumbnail=true`,
            filename: img.metadata.filename,
            description: img.metadata.description,
            similarity: img.similarity
          }));
          imagesAvailableCount = images.length;
        }
      } catch (err) {
        logger.warn('Erreur lors de la recherche d’images');
      }

      const routerResult = await smartRouter.route(input.text, {
        userId: input.userProfile?.id || 'anonymous',
        sessionId: input.currentProcedureId,
        mode: input.procedureMode === 'proposal' ? 'auto' : undefined,
        imagesAvailable: imagesAvailableCount,
        explicitImageQuery: explicitImageQuery
      });
      
      const processingTime = Date.now() - startTime;
      let routerAnswer = routerResult.response;
      
      if (imagesAvailableCount > 0) {
        if (explicitImageQuery) {
          showImagesDirectly = true;
          logger.info(`📸 Requête image explicite → affichage direct de ${images.length} image(s) via UI native`);
        } else {
          logger.info(`📸 ${images.length} images disponibles en arrière-plan (option "Voir l'image" via UI native)`);
        }
      }
      
      let recommendations: any[] = [];
      try {
        const recResult = await personalizedRecommender.recommend(
          input.userProfile?.id || 'default-user',
          {
            domain: input.text.toLowerCase().includes('turbine') ? 'Turbine' : 'Général',
            limit: 2,
            query: undefined
          }
        );
        
        if (Array.isArray(recResult)) {
          recommendations = recResult;
        } else if (recResult && typeof recResult === 'object') {
          if ('items' in recResult && Array.isArray(recResult.items)) {
            recommendations = recResult.items;
          } else if ('recommendations' in recResult && Array.isArray(recResult.recommendations)) {
            recommendations = recResult.recommendations;
          }
        }
        
        recommendations = recommendations.map((item: any, index: number) => ({
          title: item.title || item.name || `Recommandation ${index + 1}`,
          ...item
        }));
        
      } catch (error: any) {
        logger.error('Erreur recommandations', { error: error.message });
        recommendations = [];
      }
      
      let suggestions: string[] = [];
      switch (routerResult.intent.category) {
        case 'greeting':
          suggestions = ["Comment démarrer la turbine?", "État des équipements", "Procédures d'urgence"];
          break;
        case 'procedure':
          suggestions = ["Afficher les étapes", "Démarrer le guide", "Voir la documentation"];
          break;
        case 'profile':
          suggestions = ["Compétences", "Expérience professionnelle", "Formation continue"];
          break;
        default:
          suggestions = ["Documentation technique", "Support", "FAQ"];
      }
      
      if (images.length > 0 && !showImagesDirectly && !suggestions.includes("Afficher l'image")) {
        suggestions.unshift("Afficher l'image");
      }

      // Detect circuit IDs for mindmap suggestions & metadata
      const detectedCircuits = mindMapChatEnricher.detectCircuitIds(input.text);
      let mindmapMeta = null;
      if (detectedCircuits.length > 0) {
        mindmapMeta = mindMapChatEnricher.getClientEnrichmentMetadata(detectedCircuits);
        const circuitId = detectedCircuits[0];
        const suggestionText = `🧠 Schéma mental ${circuitId}`;
        if (!suggestions.includes(suggestionText)) {
          suggestions.unshift(suggestionText);
        }
      }
      
      logger.info('Réponse générée via SmartRouter', {
        confidence: Math.round(routerResult.intent.confidence * 100),
        processingTime: `${processingTime}ms`,
        intent: routerResult.intent.category,
        imagesFound: images.length,
        showImagesDirectly
      });
      
      return {
        answer: routerAnswer,
        confidence: routerResult.intent.confidence,
        disclaimer: routerResult.intent.confidence < 0.5 ? "⚠️ Réponse avec fiabilité limitée" : undefined,
        sources: [],
        warnings: routerResult.intent.confidence < 0.6 ? ["⚠️ Confiance modérée"] : [],
        suggestions: suggestions.slice(0, 3),
        recommendations: recommendations,
        images: images,
        showImagesDirectly: showImagesDirectly,
        imagesAvailable: images.length > 0 && !showImagesDirectly,
        newMemoryEpisode: {
          type: 'interaction',
          content: routerAnswer.substring(0, 500),
          context: input.text,
          importance: routerResult.intent.confidence,
          timestamp: Date.now(),
        },
        pedagogicalLevel: routerResult.intent.complexity === 'simple' ? 'débutant' : 'intermédiaire',
        collaborativeInsight: '',
        processingTime,
        hybridMetadata: routerResult.hybrid,
        metadata: mindmapMeta ? {
          mindmap: mindmapMeta,
          hasMindmap: true,
          circuits: detectedCircuits,
          messageHint: mindmapMeta.messageHint
        } : undefined
      };

    } catch (error: any) {
      logger.error('Erreur traitement SmartRouter', { error: error.message, stack: error.stack });
      
      return {
        answer: `Désolé, une erreur technique est survenue: ${error.message}`,
        confidence: 0.1,
        warnings: ["❌ Erreur système"],
        processingTime: Date.now() - startTime,
        sources: [],
        suggestions: ["Réessayer plus tard", "Vérifier que Ollama est actif"],
        recommendations: []
      };
    }
  };

  if (input.procedureMode === 'proposal' && !input.procedureAction) {
    const cacheKey = `${input.text}:${input.documentContext?.substring(0, 100)}:${input.userProfile?.expertise || 'default'}:${input.model}`;
    
    try {
      const result = await semanticCache.getOrCompute(cacheKey, async () => {
        const res = await computeAnswer();
        return JSON.stringify(res);
      });

      const parsed = JSON.parse(result) as ChatOutput;
      if (!parsed.processingTime) {
        parsed.processingTime = 0;
        parsed.warnings = [...(parsed.warnings || []), "💡 Réponse du cache"];
      }
      
      const validation = await validateResponseAgainstContext(parsed.answer, input.documentContext || '');
      aiLogger.logStep(7, 'VALID', 'Response Validation (Cache)', {
        relevanceScore: validation.relevanceScore,
        hasHallucinations: validation.hasHallucinations
      });
      aiLogger.logStep(8, 'FLOW', 'Sending Response (Cache)', {
        answerLength: parsed.answer.length,
        totalTimeMs: Date.now() - startTime
      });

      return parsed;
    } catch {
      // Fallback if cache fails
    }
  }
  
  const finalResult = await computeAnswer();

  const validation = await validateResponseAgainstContext(finalResult.answer, input.documentContext || '');
  aiLogger.logStep(7, 'VALID', 'Response Validation', {
    relevanceScore: validation.relevanceScore,
    hasHallucinations: validation.hasHallucinations,
    coverage: validation.coverage
  });

  aiLogger.logStep(8, 'FLOW', 'Sending Response', {
    answerLength: finalResult.answer.length,
    confidence: finalResult.confidence,
    totalTimeMs: Date.now() - startTime
  });

  return finalResult;
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

export async function clearCache(): Promise<void> {
  await semanticCache.clear();
  logger.info('Cache vidé');
}

export async function getCacheStats() {
  const stats = semanticCache.getStats();
  logger.debug('Statistiques cache', stats);
  return stats;
}

export async function chatSimple(query: string): Promise<string> {
  const result = await chat({
    text: query,
    history: [],
    documentContext: '',
    episodicMemory: [],
    distilledRules: [],
    userProfile: undefined,
    hierarchyNodes: [],
    strictness: 0.7,
    maxTokens: 1000,
    temperature: 0.3,
    responseFormat: 'détaillé',
    procedureMode: 'proposal',
    model: 'gemma2:2b'
  });
  return result.answer;
}

export async function* generateResponseStream(query: string, options: any = {}): AsyncIterable<string> {
  logger.info('Début stream', { query: query.substring(0, 30) });
  
  try {
    const model = options.model || 'gemma2:2b';
    const temperature = options.temperature || 0.3;
    const maxTokens = options.maxTokens || 500;
    
    const fullPrompt = `Tu es un expert en centrale électrique. Réponds de manière technique et précise: ${query}`;
    
    const stream = callOllamaStream(fullPrompt, {
      model,
      temperature,
      maxTokens
    });

    for await (const chunk of stream) {
      yield chunk;
    }
  } catch (error: any) {
    logger.error('Erreur stream', { error: error.message });
    yield `Erreur: ${error.message}`;
  }
}

export async function getActiveProcedure(sessionId: string): Promise<ActiveProcedureSession | null> {
  return activeProcedures.get(sessionId) || null;
}

export async function endProcedure(sessionId: string): Promise<boolean> {
  const deleted = activeProcedures.delete(sessionId);
  if (deleted) {
    logger.info('Procédure terminée', { sessionId });
  }
  return deleted;
}

// ============================================================================
// EXPORT POUR TESTING
// ============================================================================

export const __testables__ = {
  detectAndExtractProcedure,
  generateProcedureId,
  isExplicitImageQuery
};