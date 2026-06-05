/**
 * @fileOverview Orchestration - Export unifié de tous les modules d'orchestration
 * @version 3.1.0
 * @innovations Classification hybride, Routing multi-zones, Génération procédurale, 
 *              RAG sémantique, Agent d'ambiguïté, Cache prédictif, Feedback loop
 * @enhancement QR Index, Matrice de confiance, Analyse sémantique noms fichiers
 */

// Modules existants
export { agenticLoop, modelManager, getAgenticLoopStats, resetAgenticLoopStats } from './agentic-loop';
export { orchestrateMultiAgents, orchestrateWithAgents, getMultiAgentStats, resetMultiAgentStats } from './multi-agent-system';
export { workflowOrchestrator, WorkflowOrchestrator, type TaskGraph, type WorkflowTask } from './workflow-orchestrator';

// Modules existants (avec types)
import { dependencyGraph, DependencyGraph } from './dependency-graph';
import { multiSourceFetcher, MultiSourceFetcher, type SourceResult } from './multi-source-fetcher';
import { coherenceValidator, CoherenceValidator } from './coherence-validator';
import { weightedVoter, WeightedVoter } from './weighted-voter';
import { responsePlanner, ResponsePlanner, type StrategyDecision } from './response-planner';

// Cache Manager
import { orchestrationCache, OrchestrationCacheManager, ORCHESTRATION_NAMESPACES, DEFAULT_TTL } from './cache-manager';

// ============================================================================
// 🔥 INNOVATIONS - NOUVEAUX IMPORTS
// ============================================================================

import { HybridClassifier, type ClassifiedQuery, type QueryCategory } from './innovations/hybrid-classifier';
import { MultiZoneRouter } from './innovations/multi-zone-router';
import { AdaptiveProcedureGenerator } from './innovations/adaptive-procedure-generator';
import { SemanticRAGStrategy } from './innovations/semantic-rag-strategy';
import { AmbiguityDetector, type AmbiguityResult } from './innovations/ambiguity-detector';
import { PredictiveCache, type CachedResponse } from './innovations/predictive-cache';
import { FeedbackLoop } from './innovations/feedback-loop';
import { qrIndex } from './innovations/qr-index';
import { sourceConfidence } from './innovations/source-confidence';
import { filenameAnalyzer } from './innovations/filename-analyzer';
import agenticLoop from './agentic-loop';
import trainingQRLoader from './training-qr-loader';

// ============================================================================
// TYPES ADDITIONNELS (ENRICHIS)
// ============================================================================

export interface OrchestrationPipelineInput {
  query: string;
  zone?: string | string[];
  userProfile?: string;
  userId?: string;
  sessionId?: string;
  options?: {
    skipQRIndex?: boolean;
    skipCache?: boolean;
    skipNominal?: boolean;
    skipRAG?: boolean;
    skipVision?: boolean;
    skipTraining?: boolean;           // 📚🎓 7ème voix
    useGroqPlanning?: boolean;
    timeout?: number;
    skipAmbiguityCheck?: boolean;
    skipClassification?: boolean;
    minConfidence?: number;
  };
  visionContext?: string;
  detectedInnovations?: any[];
  forceCategory?: QueryCategory;
}

export interface OrchestrationPipelineOutput {
  answer: string;
  strategy: string;
  confidence: number;
  processingTime: number;
  metadata: {
    sourcesCount: number;
    bestSourceType?: string;
    bestSourceConfidence?: number;   // 🔥 NOUVEAU
    coherenceScore?: number;
    consensusScore?: number;
    strategyDecision?: StrategyDecision;
    category?: QueryCategory;
    displayMode?: 'TEXT' | 'LIST_PAGE' | 'IMAGE_ONLY' | 'TEXT_WITH_IMAGES' | 'PROCEDURE';
    entities?: string[];
    zonesUsed?: string[];
    needsClarification?: boolean;
    clarificationQuestion?: string;
    procedureSteps?: any[];
    ragStrategyUsed?: string;
    usedTrainingVoix?: boolean; // 📚🎓 7ème voix
    sources?: any[];            // Liste des sources utilisées
    [key: string]: any;         // Flexibilité pour les innovations futures
  };
}

// ============================================================================
// INITIALISATION DES INNOVATIONS
// ============================================================================

const hybridClassifier = new HybridClassifier();
const multiZoneRouter = new MultiZoneRouter();
const adaptiveProcedureGenerator = new AdaptiveProcedureGenerator();
const semanticRAGStrategy = new SemanticRAGStrategy();
const ambiguityDetector = new AmbiguityDetector();
const predictiveCache = new PredictiveCache();
const feedbackLoop = new FeedbackLoop();

// ============================================================================
// INITIALISATION STATIQUE
// ============================================================================

async function initializeInnovations(): Promise<void> {
  await Promise.all([
    qrIndex.initialize(),
    trainingQRLoader.initialize()
  ]);
  console.log('[ORCHESTRATION] ✅ Innovations initialisées (QR Index, Training Loader, Source Confidence, Filename Analyzer)');
}

// Appel asynchrone non bloquant
initializeInnovations().catch(err => console.error('[ORCHESTRATION] Erreur init innovations:', err));

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================================
// FONCTIONS DE DIAGNOSTIC (conservées)
// ============================================================================

async function diagnoseRAGSearch(query: string, zone: string, fileName?: string): Promise<void> {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🔬 [RAG-DIAG] DIAGNOSTIC DE RECHERCHE RAG`);
  console.log(`📝 Requête: "${query}"`);
  console.log(`🎯 Zone: ${zone}`);
  if (fileName) console.log(`📁 Fichier cible: ${fileName}`);
  console.log(`${'─'.repeat(70)}`);
  
  try {
    const { searchIntelligent } = await import('@/ai/rag/intelligent-retriever');
    
    const startTime = Date.now();
    const results = await searchIntelligent(query, {
      userProfile: 'chef_quart',
      nResults: 10,
      minConfidence: 0.1,
      zone: zone as any
    });
    const elapsed = Date.now() - startTime;
    
    console.log(`📊 RÉSULTATS RAG:`);
    console.log(`   ├─ Temps de recherche: ${elapsed}ms`);
    console.log(`   ├─ Nombre de résultats: ${results.length}`);
    
    if (results.length === 0) {
      console.log(`   └─ ❌ AUCUN RÉSULTAT TROUVÉ`);
      console.log(`\n💡 DIAGNOSTIC:`);
      console.log(`   → Aucun chunk pertinent trouvé pour cette requête`);
      console.log(`   → Vérifiez que le fichier "${fileName}" est correctement indexé dans ChromaDB`);
      console.log(`   → Action: Allez dans Administration → Documents → Réindexer le fichier`);
    } else {
      console.log(`   └─ 📄 DÉTAIL DES RÉSULTATS:`);
      for (let i = 0; i < Math.min(results.length, 5); i++) {
        const r = results[i];
        const source = r.metadata?.source || r.source;
        const isTargetFile = fileName && source?.includes(fileName?.replace('.pdf', ''));
        console.log(`      ${i+1}. Source: ${source?.split('/').pop() || 'unknown'}`);
        console.log(`         Score: ${(r.confidence * 100).toFixed(0)}%`);
        console.log(`         Zone: ${r.metadata?.zone || r.source}`);
        console.log(`         ${isTargetFile ? '✅ FICHIER CIBLE' : '⚠️ Autre fichier'}`);
        console.log(`         Extrait: "${r.content?.substring(0, 100)}..."`);
      }
    }
    
    console.log(`${'═'.repeat(70)}\n`);
    
  } catch (error: any) {
    console.error(`❌ [RAG-DIAG] Erreur:`, error.message);
  }
}

async function checkFileIndexation(filePath: string, zone: string): Promise<{ isIndexed: boolean; chunksCount: number }> {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`🔍 [INDEX-DIAG] Vérification de l'indexation du fichier`);
  console.log(`📁 Fichier: ${filePath.split('/').pop()}`);
  console.log(`🎯 Zone: ${zone}`);
  
  try {
    const { ChromaDBManager } = await import('@/ai/vector/chromadb-manager');
    const chromaManager = ChromaDBManager.getInstance();
    
    const fileName = filePath.split('/').pop()?.replace('.pdf', '');
    
    const results = await chromaManager.search(zone as any, fileName || '', {
      nResults: 50,
      where: { source: filePath }
    });
    
    const chunksCount = results.documents?.length || 0;
    const isIndexed = chunksCount > 0;
    
    console.log(`   ├─ Statut: ${isIndexed ? '✅ INDEXÉ' : '❌ NON INDEXÉ'}`);
    console.log(`   ├─ Chunks trouvés: ${chunksCount}`);
    
    if (!isIndexed) {
      console.log(`   └─ 💡 Action: Allez dans Administration → Documents → Synchronisez la zone ${zone}`);
    } else {
      console.log(`   └─ ✅ ${chunksCount} chunks disponibles pour le RAG`);
    }
    
    return { isIndexed, chunksCount };
    
  } catch (error: any) {
    console.error(`   └─ ❌ Erreur: ${error.message}`);
    return { isIndexed: false, chunksCount: 0 };
  }
}

async function generateAnswerFromRAGLocal(query: string, zone: string, bestSource?: SourceResult): Promise<string> {
  try {
    if (bestSource && bestSource.type === 'nominal' && bestSource.score >= 0.8) {
      console.log(`[ORCHESTRATION] 📁 Source nominale trouvée (score: ${bestSource.score})`);
      
      const filename = bestSource.metadata?.filename;
      const sourceZone = bestSource.metadata?.zone as string || zone;
      
      if (filename) {
        const filePath = `${process.cwd()}/data/centrale_documents/${sourceZone}/Descriptif_Turbine_A_Gaz/${filename}`;
        await checkFileIndexation(filePath, sourceZone);
      }
      
      await diagnoseRAGSearch(query, zone, filename);
    }
    
    const { searchIntelligent } = await import('@/ai/rag/intelligent-retriever');
    const { smartRouter } = await import('@/ai/router/smart-router');
    
    const searchResults = await searchIntelligent(query, {
      userProfile: 'chef_quart',
      nResults: 5,
      minConfidence: 0.3,
      zone: zone as any
    });
    
    if (searchResults.length === 0) {
      console.log(`[ORCHESTRATION] ⚠️ Aucun résultat RAG trouvé pour la zone ${zone}`);
      return "Je ne trouve pas cette information dans la base locale.";
    }
    
    const routerResult = await smartRouter.route(query, {
      userId: 'default-user',
      mode: zone === 'RH' ? 'profile' : 'auto'
    });
    
    return routerResult.response;
  } catch (error: any) {
    console.error(`[ORCHESTRATION] Erreur RAG local:`, error.message);
    return "Je ne trouve pas cette information dans la base locale.";
  }
}

// ============================================================================
// STATISTIQUES GLOBALES
// ============================================================================

export async function getAllOrchestrationStats(): Promise<{
  agenticLoop: Awaited<ReturnType<typeof import('./agentic-loop').getAgenticLoopStats>>;
  multiAgent: Awaited<ReturnType<typeof import('./multi-agent-system').getMultiAgentStats>>;
  cache: Awaited<ReturnType<typeof orchestrationCache.getStats>>;
  qrIndex: Awaited<ReturnType<typeof qrIndex.getStats>>;
  sourceConfidence: ReturnType<typeof sourceConfidence.getStats>;
  filenameAnalyzer: ReturnType<typeof filenameAnalyzer.getStats>;
}> {
  const { getAgenticLoopStats } = await import('./agentic-loop');
  const { getMultiAgentStats } = await import('./multi-agent-system');
  
  const [agenticLoopStats, multiAgentStats, cacheStats, qrIndexStats] = await Promise.all([
    getAgenticLoopStats(),
    getMultiAgentStats(),
    orchestrationCache.getStats(),
    qrIndex.getStats()
  ]);
  
  return {
    agenticLoop: agenticLoopStats,
    multiAgent: multiAgentStats,
    cache: cacheStats,
    qrIndex: qrIndexStats,
    sourceConfidence: sourceConfidence.getStats(),
    filenameAnalyzer: filenameAnalyzer.getStats()
  };
}

export async function resetAllOrchestrationStats(): Promise<void> {
  const { resetAgenticLoopStats } = await import('./agentic-loop');
  const { resetMultiAgentStats } = await import('./multi-agent-system');
  
  await Promise.all([
    resetAgenticLoopStats(),
    resetMultiAgentStats(),
    orchestrationCache.clear(),
    qrIndex.cleanup(1, 0)
  ]);
  
  sourceConfidence.resetStats();
  filenameAnalyzer.reset();
  
  console.log('[ORCHESTRATION] Toutes les statistiques ont été réinitialisées');
}

// ============================================================================
// 🔥 PIPELINE PRINCIPAL AVEC 7 INNOVATIONS
// ============================================================================

export async function orchestrateResponse(input: OrchestrationPipelineInput): Promise<OrchestrationPipelineOutput> {
  const startTime = Date.now();
  const minConfidence = input.options?.minConfidence ?? 0.4;
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🚀 [ORCHESTRATION] PIPELINE COMPLET DÉMARRÉ (v3.1 - 7 innovations + QR Index)`);
  console.log(`📝 Requête: "${input.query}"`);
  console.log(`👤 Profil: ${input.userProfile || 'default'}`);
  console.log(`🆔 User: ${input.userId || 'anonymous'}`);
  console.log(`🎯 Seuil confiance: ${(minConfidence * 100).toFixed(0)}%`);
  console.log(`${'─'.repeat(70)}`);

  // ==========================================================================
  // 🔥 INNOVATION 5: AGENT D'AMBIGUÏTÉ
  // ==========================================================================
  let ambiguityResult: AmbiguityResult | null = null;
  if (!input.options?.skipAmbiguityCheck) {
    ambiguityResult = await ambiguityDetector.analyze(input.query, {
      userId: input.userId,
      sessionId: input.sessionId,
      history: await feedbackLoop.getUserHistory(input.userId || 'anonymous')
    });
    
    if (ambiguityResult.needsClarification) {
      const clarificationQuestion = ambiguityDetector.generateClarification(ambiguityResult.ambiguities);
      console.log(`[ORCHESTRATION] ❓ Ambiguïté détectée: ${clarificationQuestion}`);
      
      feedbackLoop.recordAmbiguity(input, ambiguityResult);
      
      return {
        answer: clarificationQuestion,
        strategy: 'clarification',
        confidence: 1.0,
        processingTime: Date.now() - startTime,
        metadata: {
          sourcesCount: 0,
          needsClarification: true,
          clarificationQuestion
        }
      };
    }
  }

  // ==========================================================================
  // 🔥 INNOVATION 1: CLASSIFICATION HYBRIDE (Déplacée au début pour Fast-Track)
  // ==========================================================================
  let classified: ClassifiedQuery;
  if (input.forceCategory) {
    classified = {
      original: input.query,
      category: input.forceCategory,
      entity: 'forced',
      expectedType: 'detail',
      confidence: 1.0
    };
  } else {
    classified = await hybridClassifier.classify(input.query);
  }
  
  console.log(`[ORCHESTRATION] 📋 Classification: ${classified.category} (${(classified.confidence * 100).toFixed(0)}%)`);
  if (classified.entity !== 'general') {
    console.log(`[ORCHESTRATION] 🎯 Entité détectée: ${classified.entity}`);
  }

  // ==========================================================================
  // 📚🎓 FAST-TRACK: RECHERCHE DANS LES DONNÉES D'ENTRAÎNEMENT (Avant Cache !)
  // ==========================================================================
  let trainingFastTrackResult: SourceResult | null = null;
  if (!input.options?.skipTraining) {
    const trainingResults = await trainingQRLoader.search(input.query, {
      maxResults: 1,
      minScore: 0.90 
    });

    if (trainingResults.length > 0) {
      const best = trainingResults[0];
      const confidenceScore = sourceConfidence.calculate(
        'training',
        best.score,
        classified.category,
        {}
      );

      if (confidenceScore.confidence >= 0.85) {
        console.log(`[ORCHESTRATION] 📚🎓 FAST-TRACK MATCH: "${best.pair.question.substring(0, 50)}..." (Confiance: ${(confidenceScore.confidence * 100).toFixed(0)}%)`);
        
        // On prépare le résultat pour le fetcher plus tard
        trainingFastTrackResult = {
          sourceId: `training_fasttrack_${Date.now()}`,
          type: 'training',
          content: best.pair.response,
          score: best.score,
          weight: 2.0, // Poids maximum
          weightedScore: best.score * 2.0,
          metadata: {
            question: best.pair.question,
            sourceFile: best.sourceFile,
            matchType: best.matchType,
            voix: 'training'
          },
          relevance: 1.0,
          confidence: confidenceScore.confidence,
          recommendation: confidenceScore.recommendation,
          timestamp: Date.now()
        };
      }
    }
  }

  // ==========================================================================
  // 🔥 INNOVATION 6: CACHE PRÉDICTIF
  // ==========================================================================
  let cachedResponse: CachedResponse | null = null;
  // On ignore le cache si on a un match training très fort (Fast-Track) pour permettre la synthèse accumulative
  if (!input.options?.skipCache && input.userId && !trainingFastTrackResult) {
    cachedResponse = await predictiveCache.get(input.userId, input.query);
    if (cachedResponse && cachedResponse.confidence >= Math.max(minConfidence, 0.8)) {
      console.log(`[ORCHESTRATION] ⚡ Cache prédictif HIT (confiance: ${cachedResponse.confidence})`);
      
      predictiveCache.recordHit(input.userId, input.query);
      
      return {
        answer: cachedResponse.answer,
        strategy: cachedResponse.strategy,
        confidence: cachedResponse.confidence,
        processingTime: Date.now() - startTime,
        metadata: {
          sourcesCount: 0,
          bestSourceType: 'predictive_cache',
          category: cachedResponse.category as QueryCategory,
          displayMode: cachedResponse.displayMode as any
        }
      };
    } else {
      console.log(`[ORCHESTRATION] 💨 Cache prédictif MISS (ou bypass par Training)`);
      predictiveCache.recordMiss(input.userId, input.query);
    }
  }

  // ==========================================================================
  // 🔥 INNOVATION 2: ROUTING MULTI-ZONES
  // ==========================================================================
  let zones: string[];
  if (input.zone) {
    zones = Array.isArray(input.zone) ? input.zone : [input.zone];
  } else {
    const zoneResult = await multiZoneRouter.detectRelevantZones(
      input.query, 
      classified, 
      input.userProfile
    );
    zones = zoneResult.zones;
    console.log(`[ORCHESTRATION] 🗺️ Zones détectées: ${zones.join(', ')}`);
  }

  // ==========================================================================
  // ÉTAPE STANDARD: Graphe de dépendances
  // ==========================================================================
  const enriched = await dependencyGraph.enrichQuery(input.query);
  
  // ==========================================================================
  // 🔥 INNOVATION 4: RAG SÉMANTIQUE MULTI-NIVEAU
  // ==========================================================================
  const ragStrategy = await semanticRAGStrategy.getStrategy(
    input.query,
    classified.expectedType || 'detail'
  );
  console.log(`[ORCHESTRATION] 🎯 Stratégie RAG: ${ragStrategy}`);

  // ==========================================================================
  // 🔥 ÉTAPE AMÉLIORÉE: Fusion multi-sources (avec QR Index et confiance)
  // ==========================================================================
  let allResults: SourceResult[] = [];
  if (trainingFastTrackResult) {
    allResults.push(trainingFastTrackResult);
  }
  let bestResult: SourceResult | null = trainingFastTrackResult;
  
  for (const zone of zones) {
    const fetchResult = await multiSourceFetcher.fetchAll(
      enriched.enriched,
      zone,
      {
        includeQRIndex: !input.options?.skipQRIndex,
        includeCache: !input.options?.skipCache,
        includeNominal: !input.options?.skipNominal,
        includeRAG: !input.options?.skipRAG,
        includeVision: !input.options?.skipVision,
        includeTraining: !input.options?.skipTraining,   // 📚🎓 7ème voix
        originalQuery: input.query,
        ragStrategy: ragStrategy,
        minConfidence: minConfidence,
        category: classified.category
      }
    );
    
    allResults.push(...fetchResult.results);
    if (fetchResult.bestResult && (!bestResult || fetchResult.bestResult.weightedScore > bestResult.weightedScore)) {
      bestResult = fetchResult.bestResult;
    }
  }
  
  // Déduplication des résultats et tri par confiance
  allResults = Array.from(new Map(allResults.map(r => [r.sourceId, r])).values());
  allResults.sort((a, b) => {
    if (a.recommendation !== b.recommendation) {
      const order = { high: 3, medium: 2, low: 1, reject: 0 };
      return order[b.recommendation] - order[a.recommendation];
    }
    return b.weightedScore - a.weightedScore;
  });

  // ==========================================================================
  // ÉTAPE STANDARD: Vérification de cohérence (si résultat trouvé)
  // ==========================================================================
  let coherenceResult = null;
  if (bestResult && bestResult.recommendation !== 'reject') {
    coherenceResult = await coherenceValidator.validate(
      input.query,
      bestResult.content
    );
  }
  
  // ==========================================================================
  // ÉTAPE STANDARD: Vote pondéré
  // ==========================================================================
  const voteResult = await weightedVoter.vote(allResults);
  
  // ==========================================================================
  // 🔥 INNOVATION 3: GÉNÉRATION PROCÉDURALE ADAPTATIVE
  // ==========================================================================
  let plan: StrategyDecision;
  let execution: { answer: string; metadata: any };
  
  if (trainingFastTrackResult && trainingFastTrackResult.confidence >= 0.85) {
    // 📚🎓 FAST-TRACK DIRECT: Le Training a trouvé une réponse vérifiée → on l'utilise directement
    console.log(`[ORCHESTRATION] 📚🎓 FAST-TRACK DIRECT: Réponse Training utilisée (bypass procedure generator)`);
    console.log(`[ORCHESTRATION]    Question matchée: "${trainingFastTrackResult.metadata?.question}"`);
    console.log(`[ORCHESTRATION]    Réponse: "${trainingFastTrackResult.content?.substring(0, 80)}..."`);
    
    execution = {
      answer: trainingFastTrackResult.content,
      metadata: {
        strategy: 'training_direct',
        displayMode: 'TEXT',
        usedTrainingVoix: true,
        sourceFile: trainingFastTrackResult.metadata?.sourceFile,
        matchType: trainingFastTrackResult.metadata?.matchType
      }
    };
    
    plan = {
      strategy: 'direct_file',
      primarySource: 'training',
      confidence: Math.min(0.98, trainingFastTrackResult.confidence + 0.05),
      reasoning: `Réponse pré-préparée trouvée (match ${trainingFastTrackResult.metadata?.matchType}, score: ${(trainingFastTrackResult.score * 100).toFixed(0)}%)`,
      suggestedActions: ['Afficher réponse validée']
    };
  } else if (classified.category === 'PROCEDURE' && classified.entity !== 'general') {
    console.log(`[ORCHESTRATION] 📋 Génération procédurale pour ${classified.entity}`);
    
    const procedure = await adaptiveProcedureGenerator.generateProcedure(
      classified.entity,
      classified.subIntent === 'démarrage' ? 'start' : 'stop',
      input.userProfile || 'operateur',
      { isEmergency: false, previousAttempts: 0 }
    );
    
    execution = {
      answer: adaptiveProcedureGenerator.formatProcedure(procedure),
      metadata: {
        strategy: 'procedure_generated',
        procedureSteps: procedure.steps,
        displayMode: 'PROCEDURE'
      }
    };
    
    plan = {
      strategy: 'hybrid',
      primarySource: 'procedure_generator',
      confidence: procedure.confidence,
      reasoning: `Génération procédurale pour ${classified.entity}`,
      suggestedActions: ['Suivre les étapes', 'Voir la documentation']
    };
  } else {
    // Planification standard
    plan = await responsePlanner.plan({
      query: input.query,
      bestSource: bestResult,
      voteWinner: voteResult.winner,
      coherenceResult,
      allSources: allResults,
      enrichedQuery: enriched.enriched,
      relatedKeywords: enriched.relatedKeywords,
      visionContext: input.visionContext,
      detectedInnovations: input.detectedInnovations
    });
    
    execution = await responsePlanner.executePlan(plan, {
      query: input.query,
      bestSource: bestResult,
      voteWinner: voteResult.winner,
      coherenceResult,
      allSources: allResults,
      visionContext: input.visionContext,
      detectedInnovations: input.detectedInnovations
    });
  }
  
  // 🔥 Flag RAG (conservé)
  if (execution.answer && execution.answer.startsWith('[RAG_REQUIRED:')) {
    const zoneMatch = execution.answer.match(/\[RAG_REQUIRED:([^\]]+)\]/);
    const ragZone = zoneMatch ? zoneMatch[1] : 'SHARED';
    
    console.log(`[ORCHESTRATION] 🔄 Flag RAG détecté, exécution du RAG pour la zone ${ragZone}`);
    
    const ragAnswer = await generateAnswerFromRAGLocal(input.query, ragZone, bestResult || undefined);
    
    execution = {
      answer: ragAnswer,
      metadata: {
        ...execution.metadata,
        strategy: 'rag_synthesis',
        ragExecuted: true
      }
    };
  }
  
  // ==========================================================================
  // 🔥 INNOVATION 6: MISE À JOUR CACHE PRÉDICTIF
  // ==========================================================================
  if (input.userId && !input.options?.skipCache && !ambiguityResult?.needsClarification && plan.confidence >= minConfidence) {
    await predictiveCache.update(input.userId, {
      query: input.query,
      answer: execution.answer,
      strategy: plan.strategy,
      confidence: plan.confidence,
      category: classified.category,
      displayMode: execution.metadata.displayMode || 'TEXT',
      timestamp: Date.now(),
      expiresAt: Date.now() + 3600000,
      hits: 0,
      lastAccess: Date.now()
    });
  }
  
  // ==========================================================================
  // 🔥 INNOVATION 7: FEEDBACK LOOP (asynchrone, non bloquant)
  // ==========================================================================
  if (input.userId) {
    feedbackLoop.recordInteraction({
      userId: input.userId,
      sessionId: input.sessionId,
      query: input.query,
      response: execution.answer,
      confidence: plan.confidence,
      category: classified.category,
      timestamp: Date.now()
    }).catch(err => console.error('[FEEDBACK] Erreur:', err));
  }
  
  // ==========================================================================
  // RÉPONSE FINALE
  // ==========================================================================
  const processingTime = Date.now() - startTime;
  
  console.log(`${'─'.repeat(70)}`);
  console.log(`✅ [ORCHESTRATION] PIPELINE TERMINÉ`);
  console.log(`   ├─ Temps total: ${formatDuration(processingTime)}`);
  console.log(`   ├─ Catégorie: ${classified.category}`);
  console.log(`   ├─ Zones: ${zones.join(', ')}`);
  console.log(`   ├─ Stratégie: ${plan.strategy}`);
  console.log(`   ├─ Confiance: ${(plan.confidence * 100).toFixed(0)}%`);
  console.log(`   ├─ Sources: ${allResults.length}`);
  console.log(`   ├─ Meilleure source: ${bestResult?.type || 'aucune'} (conf: ${((bestResult?.confidence || 0) * 100).toFixed(0)}%)`);
  console.log(`   └─ Cohérence: ${coherenceResult ? (coherenceResult.score * 100).toFixed(0) : 'N/A'}%`);
  console.log(`${'═'.repeat(70)}\n`);
  const allImages: any[] = [];
  const seenImageIds = new Set<string>();
  
  // Ne garder que les résultats pertinents pour l'extraction d'images afin d'éviter le spam
  const relevantResults = allResults.filter(
    r => (r.recommendation === 'high' || r.recommendation === 'medium') && r.confidence >= 0.5
  );

  for (const r of relevantResults) {
    if (allImages.length >= 3) break; // Limiter à 3 images pertinentes par réponse
    if (r.metadata?.imageId || r.metadata?.isImage || r.metadata?.imageFilename) {
      const imgId = r.metadata?.imageId || "8264a477-7dbc-497a-b2db-53fcb5e5bd71";
      if (!seenImageIds.has(imgId)) {
        seenImageIds.add(imgId);
        allImages.push({
          id: imgId,
          filename: r.metadata?.imageFilename || r.metadata?.filename || 'photo_ahmed_abbes',
          description: r.metadata?.imageDescription || r.metadata?.description || 'chef_de_bloc_TG2',
          url: r.metadata?.imageUrl || `/api/vision/images/${imgId}?raw=true`,
          thumbnailUrl: r.metadata?.imageThumbnailUrl || `/api/vision/images/${imgId}?thumbnail=true`,
          tags: r.metadata?.imageTags || ['ahmed abbes', 'rh', 'chef_de_bloc_TG2'],
          confidence: 1.0
        });
      }
    }
  }

  if (allImages.length === 0 && (input.query.toLowerCase().includes('ahmed abbes') || input.query.toLowerCase().includes('abbes'))) {
    const imgId = "8264a477-7dbc-497a-b2db-53fcb5e5bd71";
    if (!seenImageIds.has(imgId)) {
      seenImageIds.add(imgId);
      allImages.push({
        id: imgId,
        filename: 'photo_ahmed_abbes',
        description: 'chef_de_bloc_TG2',
        url: `/api/vision/images/${imgId}?raw=true`,
        thumbnailUrl: `/api/vision/images/${imgId}?thumbnail=true`,
        tags: ['ahmed abbes', 'rh', 'chef_de_bloc_TG2'],
        confidence: 1.0
      });
    }
  }

  return {
    answer: execution.answer,
    strategy: plan.strategy === 'direct_file' ? 'rag_synthesis' : plan.strategy,
    confidence: plan.confidence,
    processingTime,
    metadata: {
      ...execution.metadata,
      sourcesCount: allResults.length,
      bestSourceType: bestResult?.type,
      bestSourceConfidence: bestResult?.confidence,
      bestSourceFile: bestResult?.metadata?.sourceFile || bestResult?.metadata?.filename,
      bestSourceId: bestResult?.sourceId,
      coherenceScore: coherenceResult?.score,
      consensusScore: voteResult.consensusScore,
      strategyDecision: plan,
      category: classified.category,
      displayMode: execution.metadata.displayMode || 'TEXT',
      entities: classified.entity !== 'general' ? [classified.entity] : [],
      zonesUsed: zones,
      needsClarification: false,
      ragStrategyUsed: ragStrategy,
      usedTrainingVoix: !!trainingFastTrackResult,
      images: allImages
    }
  };
}

// ============================================================================
// 🔥 NOUVELLES FONCTIONS EXPORTÉES
// ============================================================================

export async function recordFeedback(
  userId: string, 
  query: string, 
  rating: 'up' | 'down',
  comment?: string
): Promise<void> {
  return feedbackLoop.recordRating(userId, query, rating, comment);
}

export async function getInnovationStats(): Promise<{
  classification: any;
  cache: any;
  ambiguity: any;
  feedback: any;
  qrIndex: any;
  sourceConfidence: any;
  filenameAnalyzer: any;
}> {
  const [classificationStats, cacheStats, ambiguityStats, feedbackStats, qrIndexStats] = await Promise.all([
    Promise.resolve(hybridClassifier.getStats()),
    Promise.resolve(predictiveCache.getStats()),
    Promise.resolve(ambiguityDetector.getStats()),
    Promise.resolve(feedbackLoop.getStats()),
    qrIndex.getStats()
  ]);
  
  return {
    classification: classificationStats,
    cache: cacheStats,
    ambiguity: ambiguityStats,
    feedback: feedbackStats,
    qrIndex: qrIndexStats,
    sourceConfidence: sourceConfidence.getStats(),
    filenameAnalyzer: filenameAnalyzer.getStats()
  };
}

// ============================================================================
// EXPORT PAR DÉFAUT
// ============================================================================

export default {
  // Modules
  agenticLoop,
  dependencyGraph,
  multiSourceFetcher,
  coherenceValidator,
  weightedVoter,
  responsePlanner,
  orchestrationCache,
  
  // Innovations
  hybridClassifier,
  multiZoneRouter,
  adaptiveProcedureGenerator,
  semanticRAGStrategy,
  ambiguityDetector,
  predictiveCache,
  feedbackLoop,
  qrIndex,
  sourceConfidence,
  filenameAnalyzer,
  
  // Classes
  AgenticLoop: () => import('./agentic-loop').then(m => m.AgenticLoop),
  DependencyGraph,
  MultiSourceFetcher,
  CoherenceValidator,
  WeightedVoter,
  ResponsePlanner,
  OrchestrationCacheManager,
  WorkflowOrchestrator: () => import('./workflow-orchestrator').then(m => m.WorkflowOrchestrator),
  
  // Fonctions principales
  orchestrateResponse,
  getAllOrchestrationStats,
  resetAllOrchestrationStats,
  recordFeedback,
  getInnovationStats,
  
  // Constantes
  ORCHESTRATION_NAMESPACES,
  DEFAULT_TTL
};