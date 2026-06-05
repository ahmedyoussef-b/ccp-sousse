/**
 * @fileOverview MultiSourceFetcher - Recherche parallèle multi-sources avec scores pondérés
 * @version 2.4.0
 * @description Recherche simultanément dans 7 sources (qr_index, cache, nominal, RAG, inversé, vision, training)
 * @innovations QR Index (haute précision) + Matrice de confiance + Données d'entraînement pré-préparées
 */

import { getSQLiteCore } from '@/ai/core/sqlite/manager';
import { nominalSearchService } from '@/ai/nominal/nominal-search.service';
import { searchIntelligent } from '@/ai/rag/intelligent-retriever';
import { searchImagesByQuery } from '@/ai/vision/vision-rag';
import type { VisionSearchResult } from '@/ai/vision/vision-rag';
import fs from 'fs';
import path from 'path';

// ============================================================================
// IMPORTS INNOVATIONS
// ============================================================================

import { qrIndex } from './innovations/qr-index';
import { sourceConfidence } from './innovations/source-confidence';
import { trainingQRLoader } from './training-qr-loader';

// ============================================================================
// TYPES
// ============================================================================

export interface SourceResult {
  sourceId: string;
  type: 'qr_index' | 'cache' | 'nominal' | 'rag' | 'inverted' | 'vision' | 'training';
  content: string;
  score: number;           // Score brut (0-1)
  weight: number;          // Poids de la source (prédéfini)
  weightedScore: number;   // score × weight
  metadata: Record<string, any>;
  relevance: number;       // Pertinence calculée (0-1)
  confidence: number;      // Confiance calculée par sourceConfidence
  recommendation: 'high' | 'medium' | 'low' | 'reject';
  timestamp: number;
}

export interface FetchOptions {
  includeQRIndex?: boolean;    // 🔥 NOUVEAU
  includeCache?: boolean;
  includeNominal?: boolean;
  includeRAG?: boolean;
  includeInverted?: boolean;
  includeVision?: boolean;
  includeTraining?: boolean;   // 📚🎓 7ÈME VOIX - Données d'entraînement pré-préparées
  timeout?: number;
  maxResultsPerSource?: number;
  originalQuery?: string;
  ragStrategy?: 'list' | 'step' | 'definition' | 'detail' | 'comparison' | 'cause_effect' | 'full_document';
  minConfidence?: number;      // 🔥 NOUVEAU - seuil de confiance minimum
  category?: string;           // 🔥 NOUVEAU - catégorie pour boosts
}

export interface FetchResult {
  success: boolean;
  results: SourceResult[];
  bestResult: SourceResult | null;
  processingTime: number;
  sourcesQueried: number;
  sourcesResponded: number;
  error?: string;
}

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

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_WEIGHTS: Record<string, number> = {
  qr_index: 1.8,    // 🔥 Haute précision
  cache: 1.5,
  nominal: 1.3,
  rag: 1.0,
  inverted: 0.7,
  vision: 0.5,
  training: 2.0     // 📚🎓 Données pré-préparées - POIDS MAXIMUM
};

const DEFAULT_OPTIONS: FetchOptions = {
  includeQRIndex: true,        // 🔥 ACTIVÉ PAR DÉFAUT
  includeCache: true,
  includeNominal: true,
  includeRAG: true,
  includeInverted: true,
  includeVision: true,
  includeTraining: true,       // 📚🎓 ACTIVÉ PAR DÉFAUT
  timeout: 30000,
  maxResultsPerSource: 5,
  minConfidence: 0.4
};

// ============================================================================
// INITIALISATION CORE SQLITE
// ============================================================================

let dbInitialized = false;
let db: ReturnType<typeof getSQLiteCore>;

async function getDB() {
  if (!dbInitialized) {
    db = getSQLiteCore();
    await db.initialize();
    dbInitialized = true;
  }
  return db;
}

// ============================================================================
// LOGS STRUCTURÉS
// ============================================================================

const LOG_SEPARATOR = '═'.repeat(70);
const LOG_SUBSEPARATOR = '─'.repeat(50);

function logInfo(message: string, data?: any): void {
  console.log(`[MULTI-SOURCE] 📍 ${message}`);
  if (data) console.log(`[MULTI-SOURCE] 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logSuccess(message: string, data?: any): void {
  console.log(`[MULTI-SOURCE] ✅ ${message}`);
  if (data) console.log(`[MULTI-SOURCE] 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logWarning(message: string, data?: any): void {
  console.warn(`[MULTI-SOURCE] ⚠️ ${message}`);
  if (data) console.warn(`[MULTI-SOURCE] 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================================
// SERVICE
// ============================================================================

export class MultiSourceFetcher {
  private weights: Record<string, number>;
  private options: FetchOptions;

  constructor(options?: Partial<FetchOptions>) {
    this.weights = { ...DEFAULT_WEIGHTS };
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Normalise un score entre 0 et 1
   */
  private normalizeScore(rawScore: number, maxScore: number = 10): number {
    return Math.min(1, Math.max(0, rawScore / maxScore));
  }

  /**
   * Calcule la pertinence d'un résultat par rapport à la question
   */
  private calculateRelevance(content: string, query: string, type: string, metadata: Record<string, any>): number {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    
    const keywords = queryLower.split(/\s+/).filter(w => w.length > 3);
    
    if (keywords.length === 0) return 0.5;
    
    let matches = 0;
    for (const kw of keywords) {
      if (contentLower.includes(kw)) matches++;
    }
    
    const keywordCoverage = matches / keywords.length;
    
    let typeBonus = 0;
    if (type === 'nominal' && metadata.filename?.toLowerCase().includes(queryLower)) {
      typeBonus = 0.2;
    }
    if (type === 'cache') {
      typeBonus = 0.15;
    }
    if (type === 'qr_index') {
      typeBonus = 0.2;
    }
    if (type === 'training') {
      // 📚🎓 Bonus fort: la question pré-préparée est directement alignée avec la réponse
      typeBonus = metadata.question
        ? (this.calculateSimilarity(query, metadata.question) > 0.5 ? 0.25 : 0.15)
        : 0.15;
    }
    if (type === 'vision' && queryLower.includes('image')) {
      typeBonus = 0.1;
    }
    
    return Math.min(1, (keywordCoverage * 0.7) + typeBonus);
  }

  /**
   * Calcule la similarité entre deux questions
   */
  private calculateSimilarity(question1: string, question2: string): number {
    const norm1 = question1.toLowerCase().trim();
    const norm2 = question2.toLowerCase().trim();
    
    if (norm1 === norm2) return 1.0;
    if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;
    
    const words1 = new Set(norm1.split(' '));
    const words2 = new Set(norm2.split(' '));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * 🔥 NOUVEAU: Recherche dans QR Index (haute précision)
   */
  private async fetchFromQRIndex(query: string, zone: string, category?: string): Promise<SourceResult | null> {
    try {
      await qrIndex.initialize();
      
      const result = await qrIndex.search(query, zone as any);
      
      if (!result || result.length === 0) return null;
      
      const best = result[0];
      const normalizedScore = best.score;
      const relevance = this.calculateRelevance(best.entry.answer, query, 'qr_index', { 
        sourceFile: best.entry.sourceFile,
        confidence: best.entry.confidence 
      });
      
      // Calculer la confiance via sourceConfidence
      const confidenceScore = sourceConfidence.calculate(
        'qr_index',
        normalizedScore,
        category,
        {}
      );
      
      return {
        sourceId: best.entry.id,
        type: 'qr_index',
        content: best.entry.answer,
        score: normalizedScore,
        weight: this.weights.qr_index,
        weightedScore: normalizedScore * this.weights.qr_index * relevance,
        metadata: { 
          question: best.entry.question,
          sourceFile: best.entry.sourceFile,
          confidence: best.entry.confidence,
          matchType: best.matchType,
          matchScore: best.score
        },
        relevance,
        confidence: confidenceScore.confidence,
        recommendation: confidenceScore.recommendation,
        timestamp: Date.now()
      };
    } catch (error) {
      logWarning(`QR Index échoué pour "${query.substring(0, 30)}..."`);
      return null;
    }
  }

  /**
   * Recherche dans le cache permanent (SQLite)
   */
  private async fetchFromCache(query: string, zone: string, category?: string): Promise<SourceResult | null> {
    try {
      const dbInstance = await getDB();
      const allEntries = dbInstance.cache.searchPermanentEntries(zone) as PermanentCacheEntry[];
      
      if (!allEntries || allEntries.length === 0) return null;
      
      let bestMatch: { entry: PermanentCacheEntry; similarity: number } | null = null;
      
      for (const entry of allEntries) {
        const similarity = this.calculateSimilarity(query, entry.question);
        if (similarity > (bestMatch?.similarity || 0) && similarity > 0.6) {
          bestMatch = { entry, similarity };
        }
      }
      
      if (bestMatch && bestMatch.similarity > 0.6) {
        const normalizedScore = bestMatch.similarity;
        const relevance = this.calculateRelevance(bestMatch.entry.response, query, 'cache', {});
        
        const confidenceScore = sourceConfidence.calculate(
          'cache',
          normalizedScore,
          category,
          {}
        );
        
        return {
          sourceId: bestMatch.entry.hash,
          type: 'cache',
          content: bestMatch.entry.response,
          score: normalizedScore,
          weight: this.weights.cache,
          weightedScore: normalizedScore * this.weights.cache * relevance,
          metadata: { question: bestMatch.entry.question, zone: bestMatch.entry.zone },
          relevance,
          confidence: confidenceScore.confidence,
          recommendation: confidenceScore.recommendation,
          timestamp: Date.now()
        };
      }
      return null;
    } catch (error) {
      logWarning(`Cache échoué pour "${query.substring(0, 30)}..."`);
      return null;
    }
  }

  /**
   * Recherche nominale (par nom de fichier)
   */
  private async fetchFromNominal(query: string, category?: string): Promise<SourceResult | null> {
    try {
      const result = await nominalSearchService.search(query, { useSemanticAnalysis: true });
      
      if (result.found && result.score >= 5) {
        const normalizedScore = this.normalizeScore(result.score);
        const relevance = this.calculateRelevance(result.content || '', query, 'nominal', { filename: result.filePath });
        
        const confidenceScore = sourceConfidence.calculate(
          'nominal',
          normalizedScore,
          category,
          { retryCount: 0 }
        );
        
        return {
          sourceId: result.filePath || 'unknown',
          type: 'nominal',
          content: result.content || '',
          score: normalizedScore,
          weight: this.weights.nominal,
          weightedScore: normalizedScore * this.weights.nominal * relevance,
          metadata: { 
            filename: result.filePath, 
            zone: result.zone, 
            mode: result.mode, 
            score: result.score,
            matchQuality: result.matchQuality,
            semanticAnalysis: result.semanticAnalysis
          },
          relevance,
          confidence: confidenceScore.confidence,
          recommendation: confidenceScore.recommendation,
          timestamp: Date.now()
        };
      }
      return null;
    } catch (error) {
      logWarning(`Nominal échoué pour "${query.substring(0, 30)}..."`);
      return null;
    }
  }

  /**
   * RECHERCHE RAG AMÉLIORÉE - Avec post-traitement selon stratégie
   */
  private async fetchFromRAG(
    query: string, 
    zone: string, 
    maxResults: number = 5,
    originalQuery?: string,
    ragStrategy?: string,
    category?: string
  ): Promise<SourceResult[]> {
    try {
      const searchQuery = originalQuery || query;
      
      if (originalQuery && originalQuery !== query) {
        logInfo(`🔄 RAG: Utilisation de la requête originale "${originalQuery.substring(0, 50)}..."`);
      }
      
      if (ragStrategy && ragStrategy !== 'detail') {
        logInfo(`🎯 RAG: Application de la stratégie "${ragStrategy}"`);
      }
      
      const results = await searchIntelligent(searchQuery, {
        zone: zone as any,
        nResults: maxResults,
        minConfidence: 0.3
      });
      
      if (!results || results.length === 0) return [];
      
      let mappedResults = results.map(r => {
        const normalizedScore = r.confidence || 0.5;
        const relevance = this.calculateRelevance(r.content, searchQuery, 'rag', r.metadata);
        
        const confidenceScore = sourceConfidence.calculate(
          'rag',
          normalizedScore,
          category,
          {}
        );
        
        return {
          sourceId: r.metadata?.id || `rag_${Date.now()}_${Math.random()}`,
          type: 'rag' as const,
          content: r.content,
          score: normalizedScore,
          weight: this.weights.rag,
          weightedScore: normalizedScore * this.weights.rag * relevance,
          metadata: r.metadata || {},
          relevance,
          confidence: confidenceScore.confidence,
          recommendation: confidenceScore.recommendation,
          timestamp: Date.now()
        };
      });
      
      // POST-TRAITEMENT SELON STRATÉGIE RAG
      if (ragStrategy && ragStrategy !== 'detail') {
        try {
          const { semanticRAGStrategy } = await import('./innovations/semantic-rag-strategy');
          
          const ragResultsForPostProcess = mappedResults.map(r => ({
            content: r.content,
            confidence: r.score,
            metadata: r.metadata,
            order: r.metadata?.step_number || undefined,
            section: r.metadata?.section || undefined
          }));
          
          const processed = await semanticRAGStrategy.postProcessResults(
            ragResultsForPostProcess,
            ragStrategy as any,
            searchQuery
          );
          
          mappedResults = processed.map(p => {
            const normalizedScore = p.confidence || 0.5;
            const relevance = this.calculateRelevance(p.content, searchQuery, 'rag', p.metadata);
            const confidenceScore = sourceConfidence.calculate(
              'rag',
              normalizedScore,
              category,
              {}
            );
            return {
              sourceId: p.metadata?.id || p.metadata?.parent_id || `rag_${Date.now()}_${Math.random()}`,
              type: 'rag' as const,
              content: p.content,
              score: normalizedScore,
              weight: this.weights.rag,
              weightedScore: normalizedScore * this.weights.rag * relevance,
              metadata: p.metadata || {},
              relevance,
              confidence: confidenceScore.confidence,
              recommendation: confidenceScore.recommendation,
              timestamp: Date.now()
            };
          });
          
          mappedResults.sort((a, b) => b.weightedScore - a.weightedScore);
          logInfo(`🎯 Post-traitement RAG (${ragStrategy}): ${mappedResults.length} résultats`);
        } catch (error) {
          logWarning(`Post-traitement RAG échoué: ${error}`);
        }
      }
      
      return mappedResults;
    } catch (error) {
      logWarning(`RAG échoué pour "${query.substring(0, 30)}..."`);
      return [];
    }
  }

  /**
   * Recherche inversée (mots-clés) avec index persisté
   */
  private async fetchFromInverted(query: string, category?: string): Promise<SourceResult[]> {
    try {
      const startTime = Date.now();
      
      const stopWords = new Set([
        'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'en', 'dans',
        'pour', 'par', 'avec', 'sans', 'sur', 'sous', 'est', 'sont', 'a', 'ont',
        'et', 'ou', 'mais', 'donc', 'car', 'ce', 'cet', 'cette', 'ces', 'qui',
        'que', 'quoi', 'dont', 'où', 'lui', 'elle', 'nous', 'vous', 'ils', 'elles',
        'donne', 'moi', 'info', 'role'
      ]);
      
      const keywords = query
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter(word => word.length > 3 && !stopWords.has(word));
      
      if (keywords.length === 0) {
        logInfo(`📚 Index inversé: aucun mot-clé significatif`);
        return [];
      }
      
      logInfo(`📚 Index inversé: recherche pour ${keywords.length} mots-clés: ${keywords.join(', ')}`);
      
      const invertedIndexPath = path.join(process.cwd(), 'data', 'training', 'inverted_index.json');
      
      if (!fs.existsSync(invertedIndexPath)) {
        logWarning(`📚 Index inversé non trouvé: ${invertedIndexPath}`);
        return [];
      }
      
      const invertedIndex = JSON.parse(fs.readFileSync(invertedIndexPath, 'utf-8'));
      
      const documentScores = new Map<string, { score: number; metadata: Record<string, any>; content: string }>();
      
      for (const keyword of keywords) {
        const entries = invertedIndex[keyword];
        if (entries && Array.isArray(entries)) {
          for (const entry of entries) {
            const docId = entry.documentId || entry;
            const currentScore = documentScores.get(docId)?.score || 0;
            const weight = entry.weight || 1;
            const newScore = currentScore + weight;
            
            documentScores.set(docId, {
              score: newScore,
              metadata: entry.metadata || {},
              content: entry.content || `Document: ${docId}`
            });
          }
        }
      }
      
      const results: SourceResult[] = [];
      const maxScore = keywords.length * 2;
      
      for (const [docId, data] of documentScores.entries()) {
        const normalizedScore = Math.min(1, data.score / maxScore);
        const relevance = this.calculateRelevance(data.content, query, 'inverted', data.metadata);
        
        const confidenceScore = sourceConfidence.calculate(
          'inverted',
          normalizedScore,
          category,
          {}
        );
        
        results.push({
          sourceId: docId,
          type: 'inverted',
          content: data.content,
          score: normalizedScore,
          weight: this.weights.inverted,
          weightedScore: normalizedScore * this.weights.inverted * relevance,
          metadata: data.metadata,
          relevance,
          confidence: confidenceScore.confidence,
          recommendation: confidenceScore.recommendation,
          timestamp: Date.now()
        });
      }
      
      results.sort((a, b) => b.weightedScore - a.weightedScore);
      
      const processingTime = Date.now() - startTime;
      logInfo(`📚 Index inversé: ${results.length} résultats trouvés en ${formatDuration(processingTime)}`);
      
      return results.slice(0, this.options.maxResultsPerSource || 5);
      
    } catch (error: any) {
      logWarning(`Index inversé échoué: ${error.message}`);
      return [];
    }
  }

  /**
   * Recherche vision (images)
   */
  private async fetchFromVision(query: string, maxResults: number = 5, category?: string): Promise<SourceResult[]> {
    try {
      const results: VisionSearchResult[] = await searchImagesByQuery(query, maxResults);
      
      if (!results || results.length === 0) return [];
      
      return results.map(img => {
        const normalizedScore = img.similarity || 0.5;
        const metadata = img.metadata as any;
        const filename = metadata?.filename || img.imageId || 'image';
        const description = metadata?.description || filename;
        const relevance = this.calculateRelevance(description, query, 'vision', metadata || {});
        
        const confidenceScore = sourceConfidence.calculate(
          'vision',
          normalizedScore,
          category,
          {}
        );
        
        return {
          sourceId: img.imageId,
          type: 'vision',
          content: description,
          score: normalizedScore,
          weight: this.weights.vision,
          weightedScore: normalizedScore * this.weights.vision * relevance,
          metadata: { 
            filename: filename,
            description: description,
            imageId: img.imageId,
            similarity: img.similarity,
            originalMetadata: metadata
          },
          relevance,
          confidence: confidenceScore.confidence,
          recommendation: confidenceScore.recommendation,
          timestamp: Date.now()
        };
      });
    } catch (error) {
      logWarning(`Vision échoué pour "${query.substring(0, 30)}..."`);
      return [];
    }
  }

  /**
   * 📚🎓 7ÈME VOIX: Recherche dans les données d'entraînement pré-préparées (data/training)
   */
  private async fetchFromTraining(query: string, category?: string): Promise<SourceResult | null> {
    const startTime = Date.now();
    try {
      const results = await trainingQRLoader.search(query, {
        minScore: 0.35,
        maxResults: 1,
        minQuality: 3
      });

      if (!results || results.length === 0) return null;

      const best = results[0];
      const normalizedScore = best.score;
      const relevance = this.calculateRelevance(
        best.pair.response,
        query,
        'training',
        { sourceFile: best.sourceFile, question: best.pair.question }
      );

      const confidenceScore = sourceConfidence.calculate(
        'training', // 📚🎓 Profil de confiance dédié aux données d'entraînement
        normalizedScore,
        category,
        {}
      );

      const elapsed = Date.now() - startTime;

      // ============================================================
      // LOG STRUCTURÉ DÉDIÉ - 📚🎓 VOIX TRAINING ACTIVÉE
      // ============================================================
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`[MULTI-SOURCE] 📚🎓 ═══ VOIX TRAINING ACTIVÉE ═══`);
      console.log(`[MULTI-SOURCE] 📚🎓 ├─ Question matchée : "${best.pair.question.substring(0, 70)}"`);
      console.log(`[MULTI-SOURCE] 📚🎓 ├─ Source fichier   : ${best.sourceFile}`);
      console.log(`[MULTI-SOURCE] 📚🎓 ├─ Type de match    : ${best.matchType}`);
      console.log(`[MULTI-SOURCE] 📚🎓 ├─ Score brut       : ${(normalizedScore * 100).toFixed(0)}%`);
      console.log(`[MULTI-SOURCE] 📚🎓 ├─ Pertinence       : ${(relevance * 100).toFixed(0)}%`);
      console.log(`[MULTI-SOURCE] 📚🎓 ├─ Confiance        : ${(confidenceScore.confidence * 100).toFixed(0)}% (${confidenceScore.recommendation})`);
      console.log(`[MULTI-SOURCE] 📚🎓 └─ Temps            : ${elapsed}ms`);
      console.log(`${'─'.repeat(60)}\n`);

      return {
        sourceId: `training_${best.sourceFile}_${Date.now()}`,
        type: 'training',
        content: best.pair.response,
        score: normalizedScore,
        weight: this.weights.training,
        weightedScore: normalizedScore * this.weights.training * relevance,
        metadata: {
          question: best.pair.question,
          sourceFile: best.sourceFile,
          matchType: best.matchType,
          quality: best.pair.quality,
          category: best.pair.category,
          voix: 'training'
        },
        relevance,
        confidence: confidenceScore.confidence,
        recommendation: confidenceScore.recommendation,
        timestamp: Date.now()
      };
    } catch (error: any) {
      logWarning(`📚🎓 Voix Training échouée pour "${query.substring(0, 30)}...": ${error.message}`);
      return null;
    }
  }

  /**
   * Recherche parallèle dans toutes les sources
   */
  async fetchAll(
    query: string,
    zone: string = 'SHARED',
    options?: Partial<FetchOptions>
  ): Promise<FetchResult> {
    const startTime = Date.now();
    const opts = { ...this.options, ...options };
    const originalQuery = opts.originalQuery || query;
    const minConfidence = opts.minConfidence || 0.4;
    
    console.log(`\n${LOG_SEPARATOR}`);
    logInfo(`🚀 DÉBUT RECHERCHE MULTI-SOURCES`);
    logInfo(`📝 Requête: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`);
    if (originalQuery !== query) {
      logInfo(`📝 Requête originale: "${originalQuery.substring(0, 100)}${originalQuery.length > 100 ? '...' : ''}"`);
    }
    logInfo(`🎯 Zone: ${zone}`);
    logInfo(`🎯 Seuil confiance minimum: ${(minConfidence * 100).toFixed(0)}%`);
    if (opts.ragStrategy) {
      logInfo(`🎯 Stratégie RAG: ${opts.ragStrategy}`);
    }
    if (opts.category) {
      logInfo(`📂 Catégorie: ${opts.category}`);
    }
    logInfo(`🔧 Sources activées: ${Object.entries(opts).filter(([k, v]) => v && k.startsWith('include')).map(([k]) => k.replace('include', '')).join(', ')}`);
    console.log(LOG_SUBSEPARATOR);

    const tasks: Array<{ type: string; promise: Promise<any> }> = [];

    if (opts.includeQRIndex) {
      tasks.push({ type: 'qr_index', promise: this.fetchFromQRIndex(originalQuery, zone, opts.category) });
    }
    if (opts.includeCache) {
      tasks.push({ type: 'cache', promise: this.fetchFromCache(originalQuery, zone, opts.category) });
    }
    if (opts.includeNominal) {
      tasks.push({ type: 'nominal', promise: this.fetchFromNominal(originalQuery, opts.category) });
    }
    if (opts.includeRAG) {
      tasks.push({ type: 'rag', promise: this.fetchFromRAG(query, zone, opts.maxResultsPerSource, originalQuery, opts.ragStrategy, opts.category) });
    }
    if (opts.includeInverted) {
      tasks.push({ type: 'inverted', promise: this.fetchFromInverted(originalQuery, opts.category) });
    }
    if (opts.includeVision) {
      tasks.push({ type: 'vision', promise: this.fetchFromVision(originalQuery, opts.maxResultsPerSource, opts.category) });
    }
    if (opts.includeTraining) {
      tasks.push({ type: 'training', promise: this.fetchFromTraining(originalQuery, opts.category) });
    }

    const resultsMap = new Map<string, any>();
    let sourcesResponded = 0;

    for (const task of tasks) {
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), opts.timeout);
      });
      const result = await Promise.race([task.promise, timeoutPromise]);
      if (result !== null) {
        resultsMap.set(task.type, result);
        sourcesResponded++;
        logInfo(`📥 Source "${task.type}" a répondu`);
      } else {
        logWarning(`⏱️ Source "${task.type}" timeout après ${formatDuration(opts.timeout!)}`);
      }
    }

    const allResults: SourceResult[] = [];

    const qrResult = resultsMap.get('qr_index');
    if (qrResult) allResults.push(qrResult);

    const cacheResult = resultsMap.get('cache');
    if (cacheResult) allResults.push(cacheResult);

    const nominalResult = resultsMap.get('nominal');
    if (nominalResult) allResults.push(nominalResult);

    const ragResults = resultsMap.get('rag');
    if (ragResults && Array.isArray(ragResults)) allResults.push(...ragResults);

    const invertedResults = resultsMap.get('inverted');
    if (invertedResults && Array.isArray(invertedResults)) allResults.push(...invertedResults);

    const visionResults = resultsMap.get('vision');
    if (visionResults && Array.isArray(visionResults)) allResults.push(...visionResults);

    const trainingResult = resultsMap.get('training');
    if (trainingResult) allResults.push(trainingResult);

    // Filtrer par confiance minimum et par recommendation
    const validResults = allResults.filter(r => 
      r && r.content && r.confidence >= minConfidence && r.recommendation !== 'reject'
    );
    
    // Trier par confidence (priorité) puis par weightedScore
    validResults.sort((a, b) => {
      if (a.recommendation !== b.recommendation) {
        const order = { high: 3, medium: 2, low: 1,reject:0 };
        return order[b.recommendation] - order[a.recommendation];
      }
      return b.weightedScore - a.weightedScore;
    });

    const processingTime = Date.now() - startTime;
    const sourcesQueried = tasks.length;

    console.log(LOG_SUBSEPARATOR);
    logInfo(`📊 RÉSULTATS DE LA RECHERCHE:`);
    logInfo(`   ├─ Sources interrogées: ${sourcesQueried}`);
    logInfo(`   ├─ Sources répondues: ${sourcesResponded}`);
    logInfo(`   ├─ Résultats bruts: ${allResults.length}`);
    logInfo(`   ├─ Résultats filtrés (conf≥${(minConfidence*100).toFixed(0)}%): ${validResults.length}`);
    logInfo(`   └─ Temps total: ${formatDuration(processingTime)}`);

    if (validResults.length > 0) {
      console.log(LOG_SUBSEPARATOR);
      logInfo(`🏆 MEILLEUR RÉSULTAT:`);
      const best = validResults[0];
      logInfo(`   ├─ Type: ${best.type}`);
      logInfo(`   ├─ Score brut: ${best.score.toFixed(3)}`);
      logInfo(`   ├─ Confiance: ${(best.confidence * 100).toFixed(0)}% (${best.recommendation})`);
      logInfo(`   ├─ Poids: ${best.weight}`);
      logInfo(`   ├─ Pertinence: ${(best.relevance * 100).toFixed(0)}%`);
      logInfo(`   ├─ Score pondéré: ${best.weightedScore.toFixed(3)}`);
      if (best.metadata?.filename) {
        logInfo(`   └─ Fichier: ${best.metadata.filename}`);
      }
      if (best.type === 'qr_index' && best.metadata?.question) {
        logInfo(`   └─ Question matchée: "${best.metadata.question.substring(0, 50)}..."`);
      }
    } else {
      logWarning(`❌ Aucun résultat valide trouvé pour "${originalQuery}"`);
    }

    console.log(LOG_SEPARATOR);

    return {
      success: validResults.length > 0,
      results: validResults,
      bestResult: validResults[0] || null,
      processingTime,
      sourcesQueried,
      sourcesResponded
    };
  }

  /**
   * Récupère uniquement le meilleur résultat
   */
  async fetchBest(query: string, zone: string = 'SHARED'): Promise<SourceResult | null> {
    const result = await this.fetchAll(query, zone);
    return result.bestResult;
  }

  /**
   * Met à jour les poids des sources
   */
  setWeight(sourceType: string, weight: number): void {
    if (this.weights[sourceType]) {
      this.weights[sourceType] = weight;
      logSuccess(`Poids mis à jour: ${sourceType} = ${weight}`);
    } else {
      logWarning(`Source non reconnue: ${sourceType}`);
    }
  }

  /**
   * Récupère les poids actuels
   */
  getWeights(): Record<string, number> {
    return { ...this.weights };
  }

  /**
   * Récupère l'ordre de priorité recommandé
   */
  getPriorityOrder(category?: string): string[] {
    return sourceConfidence.getPriorityOrder(category);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const multiSourceFetcher = new MultiSourceFetcher();

// ============================================================================
// EXPORT PAR DÉFAUT
// ============================================================================

export default {
  MultiSourceFetcher,
  multiSourceFetcher
};