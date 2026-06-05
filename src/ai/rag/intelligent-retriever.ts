/**
 * @fileOverview Phase 1: COMPRENDRE - Retriever Intelligent Multi-Sources.
 * @version 5.6.0
 * @lastUpdated 2026-04-20
 * @description Adaptation compl├¿te ├á l'architecture par zones + int├®gration VISION + Enrichissement m├®tadonn├®es + Support codes techniques + Recherche par nom de fichier exact
 */

import { analyzeQuery } from './query-analyzer';
import { createRAGLogger } from './utils/logger';
import { StatsManager } from './utils/stats-manager';
import { getRAGConfig } from './config/rag.config';
import {
  safeParseSearchOptions,
  type SearchOptions as ValidatedSearchOptions
} from './schemas/query.schema';
import { aiLogger } from '../../lib/logger/ai-logger';
import { SemanticCache } from '../semantic-cache';
import type { IVectorStore } from './interfaces/vector-store';
import { ChromaDBManager } from '../vector/chromadb-manager';
import {
  type ZoneType,
  ZONES_CONFIG,
  getRelevantZones,
  getExpectedResponseType
} from '../vector/chromadb-schema';
import { mindMapRagBridge } from '../mindmap/mindmap-rag-bridge';

// ============================================================================
// EXTRACTION DES CODES TECHNIQUES
// ============================================================================

/**
 * ­ƒöÑ Extrait les codes techniques de la requ├¬te (ex: TCV057, TG1, CRF12)
 */
function extractTechnicalCodes(query: string): string[] {
  const matches = query.match(/[A-Z]{2,}[0-9]{2,}/gi);
  return matches || [];
}

// ============================================================================
// RECHERCHE PAR NOM DE FICHIER EXACT
// ============================================================================

/**
 * ­ƒöÑ Recherche une image par son nom de fichier exact
 * Cette fonction interroge directement l'API Vision pour trouver une image par filename
 */
async function searchByExactFilename(filename: string): Promise<EnrichedSearchResult | null> {
  try {
    // Nettoyer le nom de fichier (enlever l'extension si pr├®sente)
    const cleanFilename = filename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
    
    // Appeler l'API pour lister toutes les images
    const response = await fetch(`http://localhost:3000/api/vision/images?limit=1000`);
    if (!response.ok) return null;
    
    const data = await response.json();
    const images = data.images || [];
    
    // Chercher une correspondance exacte (insensible ├á la casse)
    const exactMatch = images.find((img: any) => 
      img.filename?.toLowerCase() === filename.toLowerCase() ||
      img.filename?.toLowerCase().replace(/\.(jpg|jpeg|png|gif|webp)$/i, '') === cleanFilename.toLowerCase()
    );
    
    if (exactMatch) {
      console.log(`[RAG] ­ƒÄ» Correspondance exacte par filename: ${exactMatch.filename} (ID: ${exactMatch.id})`);
      
      return {
        content: `[IMAGE: ${exactMatch.filename} | ID: ${exactMatch.id}]\n${exactMatch.description || ''}`,
        metadata: exactMatch,
        score: 1.0,
        source: 'VISION',
        confidence: 1.0,
        citations: [exactMatch.filename],
        imageId: exactMatch.id,
        imageUrl: `/api/vision/images/${exactMatch.id}`,
        imageThumbnailUrl: `/api/vision/images/${exactMatch.id}?thumbnail=true`,
        isImage: true
      };
    }
    
    return null;
  } catch (error) {
    console.error('[RAG] Erreur recherche par filename:', error);
    return null;
  }
}

// ============================================================================
// ENRICHISSEMENT DES M├ëTADONN├ëES POUR LA RECHERCHE
// ============================================================================

/**
 * Enrichit le contenu d'un r├®sultat avec ses m├®tadonn├®es (nom du fichier, source)
 * pour am├®liorer la recherche par nom de fichier
 */
function enrichContentWithMetadata(content: string, metadata: Record<string, any>): string {
  const enrichedParts: string[] = [];
  
  // Ajouter le nom du fichier si disponible
  if (metadata.filename) {
    const filename = metadata.filename.replace(/\.(pdf|txt|md|json|docx?)$/i, '');
    enrichedParts.push(`[FICHIER: ${filename}]`);
  } else if (metadata.source) {
    const sourcePath = metadata.source;
    const filename = sourcePath.split(/[\\/]/).pop()?.replace(/\.(pdf|txt|md|json|docx?)$/i, '');
    if (filename) {
      enrichedParts.push(`[FICHIER: ${filename}]`);
    }
  }
  
  if (metadata.source && metadata.source !== metadata.filename) {
    enrichedParts.push(`[SOURCE: ${metadata.source}]`);
  }
  
  if (metadata.collection || metadata.zone) {
    const zone = metadata.collection || metadata.zone;
    enrichedParts.push(`[ZONE: ${zone}]`);
  }
  
  if (metadata.tags && Array.isArray(metadata.tags)) {
    enrichedParts.push(`[TAGS: ${metadata.tags.join(', ')}]`);
  }
  
  if (metadata.title) {
    enrichedParts.push(`[TITRE: ${metadata.title}]`);
  }
  
  if (enrichedParts.length === 0) {
    return content;
  }
  
  return `${enrichedParts.join(' ')}\n\n${content}`;
}

// ============================================================================
// BM25 R├ëEL - IMPL├ëMENTATION STANDARD
// ============================================================================

interface BM25Document {
  content: string;
  metadata: Record<string, any>;
  tokens: string[];
}

class BM25 {
  private documents: BM25Document[] = [];
  private docFreq: Map<string, number> = new Map();
  private avgDocLength: number = 0;
  private totalDocs: number = 0;
  private k1: number = 1.5;
  private b: number = 0.75;

  constructor(docs: { content: string; metadata: Record<string, any> }[] = []) {
    if (docs.length > 0) {
      this.addDocuments(docs);
    }
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s├á├ó├º├®├¿├¬├½├«├»├┤├╗├╣├╝├┐├▒├ª┼ô]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !this.isStopWord(word));
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'en', 'dans',
      'pour', 'par', 'avec', 'sans', 'sur', 'sous', 'est', 'sont', 'a', 'ont',
      'et', 'ou', 'mais', 'donc', 'car', 'ce', 'cet', 'cette', 'ces', 'qui',
      'que', 'quoi', 'dont', 'o├╣', 'lui', 'elle', 'nous', 'vous', 'ils', 'elles'
    ]);
    return stopWords.has(word);
  }

  addDocuments(docs: { content: string; metadata: Record<string, any> }[]): void {
    for (const doc of docs) {
      const tokens = this.tokenize(doc.content);
      this.documents.push({ content: doc.content, metadata: doc.metadata, tokens });
      this.totalDocs++;
      this.avgDocLength = (this.avgDocLength * (this.totalDocs - 1) + tokens.length) / this.totalDocs;

      const uniqueTokens = Array.from(new Set(tokens));
      for (const token of uniqueTokens) {
        this.docFreq.set(token, (this.docFreq.get(token) || 0) + 1);
      }
    }
  }

  score(query: string, documentIndex: number): number {
    const queryTokens = this.tokenize(query);
    const doc = this.documents[documentIndex];
    if (!doc) return 0;

    const docLength = doc.tokens.length;
    let score = 0;

    const termFreq = new Map<string, number>();
    for (const token of doc.tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    for (const token of queryTokens) {
      const tf = termFreq.get(token) || 0;
      const df = this.docFreq.get(token) || 1;
      const idf = Math.log((this.totalDocs - df + 0.5) / (df + 0.5) + 1);

      const numerator = tf * (this.k1 + 1);
      const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
      score += idf * (numerator / denominator);
    }

    return Math.min(score, 1.0);
  }

  search(query: string, topK: number = 10): Array<{ content: string; metadata: Record<string, any>; score: number }> {
    const scores = this.documents.map((doc, idx) => ({
      content: doc.content,
      metadata: doc.metadata,
      score: this.score(query, idx)
    }));

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

// ============================================================================
// INITIALISATION DES UTILITAIRES
// ============================================================================

const logger = createRAGLogger('[RAG-RETRIEVER]', {
  maxDataLength: 300,
  enableStructured: process.env.NODE_ENV === 'production'
});

interface RetrieverStats {
  totalSearches: number;
  avgResults: number;
  avgProcessingTime: number;
  lastSearchTime: number | null;
  lastSearchDuration: number | null;
  errorCount: number;
  cacheHits: number;
  cacheMisses: number;
  bm25UsageCount: number;
  vectorUsageCount: number;
}

const statsManager = new StatsManager<RetrieverStats>({
  initial: {
    totalSearches: 0,
    avgResults: 0,
    avgProcessingTime: 0,
    lastSearchTime: null,
    lastSearchDuration: null,
    errorCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    bm25UsageCount: 0,
    vectorUsageCount: 0
  },
  persistIntervalMs: 60000,
  onPersist: async (stats, timestamp) => {
    logger.structured('STATS_PERSIST', {
      module: 'retriever',
      stats,
      timestamp: timestamp.toISOString()
    });
  }
});

// ============================================================================
// ABSTRACTION VECTOR STORE
// ============================================================================

let vectorStoreInstance: IVectorStore | null = null;

export function setVectorStore(store: IVectorStore): void {
  vectorStoreInstance = store;
  logger.info('CONFIG', 'Vector store personnalis├® d├®fini');
}

function getVectorStore(): IVectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = ChromaDBManager.getInstance() as unknown as IVectorStore;
  }
  return vectorStoreInstance;
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface RetrievalResult {
  contexts: FusedResult[];
  totalCount: number;
  analysis?: any;
  suggestions?: string[];
  metadata: {
    processingTime: number;
    sourcesUsed: string[];
    searchCount: number;
    avgScore: number;
  };
}

export interface FusedResult {
  content: string;
  source: 'document' | 'lesson' | 'interaction' | 'procedure' | 'alarme' | 'hmi' | 'episodic' | 'hierarchy' | 'pattern' | 'mindmap';
  score: number;
  weight: number;
  finalScore: number;
  metadata?: any;
}

export interface EnrichedSearchResult {
  content: string;
  metadata: Record<string, any>;
  score: number;
  source: string;
  confidence: number;
  citations: string[];
  imageId?: string;
  imageUrl?: string;
  imageThumbnailUrl?: string;
  isImage?: boolean;
}

export interface SearchOptions {
  userProfile?: 'chef_bloc_TG1' | 'chef_bloc_TG2' | 'chef_quart' | 'superviseur';
  equipe?: string;
  equipement?: string;
  zone?: ZoneType;
  pupitre?: string;
  useHybrid?: boolean;
  useReranking?: boolean;
  nResults?: number;
  minConfidence?: number;
}

export interface DocumentWithChunks {
  content: string;
  metadata: Record<string, any>;
  chunks: { content: string; index: number }[];
}

export interface CollectionSearchResult {
  content: string;
  metadata: Record<string, any>;
  score: number;
  source: string;
  confidence: number;
  citations: string[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const RERANKING_WEIGHTS = {
  semantic: 0.50,
  lexical: 0.30,
  source: 0.12,
  freshness: 0.08
};

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}



function isVisionQuery(query: string): boolean {
  const visionKeywords = [
    'image', 'photo', 'montre', 'affiche', 'visuel', 'sch├®ma', 'composant', 'pi├¿ce', 'mat├®riel',
    'pupitre', 'commande', '├®cran', 'panneau', 'tcv', 'tg1', 'tg2', 'vannes', 'pompe', 'turbine',
    'inspection', 'diagnostic', 'd├®faut', '├®tat', 'maintenance', 'photo de', 'image de'
  ];
  const queryLower = query.toLowerCase();
  return visionKeywords.some(kw => queryLower.includes(kw));
}

function freshnessScore(metadata: Record<string, any>): number {
  const raw = metadata?.date_modification || metadata?.timestamp || metadata?.date;
  if (!raw) return 0.5;
  try {
    const ageMs = Date.now() - new Date(raw).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return Math.exp(-ageDays / 365);
  } catch {
    return 0.5;
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      logger.warning('RETRY', `Tentative ${attempt}/${retries} ├®chou├®e: ${error.message}`);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  throw lastError || new Error('All retries failed');
}

// ============================================================================
// RE-RANKING HYBRIDE
// ============================================================================

async function rerankHybrid(
  query: string,
  results: EnrichedSearchResult[],
  sourceWeights: Record<string, number>,
  bm25Instance: BM25
): Promise<EnrichedSearchResult[]> {
  logger.info('RERANK', 'Application du re-ranking hybride...');

  const weights = RERANKING_WEIGHTS;

  console.log('   ÔÜû´©Å Poids appliqu├®s :');
  console.log('      Ôö£ÔöÇ S├®mantique :', (weights.semantic * 100).toFixed(0) + '%');
  console.log('      Ôö£ÔöÇ Lexical (BM25) :', (weights.lexical * 100).toFixed(0) + '%');
  console.log('      Ôö£ÔöÇ Source :', (weights.source * 100).toFixed(0) + '%');
  console.log('      ÔööÔöÇ Fra├«cheur :', (weights.freshness * 100).toFixed(0) + '%');

  const reranked = results.map((r: EnrichedSearchResult) => {
    const semantic = r.score;
    const lexical = bm25Instance.score(query, 0);
    const priority = sourceWeights[r.source] || 0.70;
    const freshness = freshnessScore(r.metadata);

    const hybrid =
      weights.semantic * semantic +
      weights.lexical * lexical +
      weights.source * priority +
      weights.freshness * freshness;

    return { ...r, score: hybrid, confidence: hybrid };
  }).sort((a, b) => b.score - a.score);

  if (reranked.length > 0) {
    logger.metric('RERANK', 'meilleur score', reranked[0].score.toFixed(3));
  }

  return reranked;
}

// ============================================================================
// FUSION ET D├ëDUPLIFICATION
// ============================================================================

function mergeResults(results: EnrichedSearchResult[]): EnrichedSearchResult[] {
  const seen = new Set<string>();
  const merged: EnrichedSearchResult[] = [];

  for (const result of results.sort((a, b) => b.score - a.score)) {
    const contentStr = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    const key = `${result.source}:${contentStr.substring(0, 200)}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(result);
    }
  }

  logger.metric('MERGE', 'r├®sultats', `${results.length} ÔåÆ ${merged.length} apr├¿s d├®duplication`);
  return merged;
}
// ============================================================================
// RECHERCHE PAR COLLECTION (les collections sont les zones)
// ============================================================================

async function searchInZoneInternal(
  zoneName: ZoneType,
  query: string,
  options: { nResults?: number; where?: Record<string, any> } = {}
): Promise<CollectionSearchResult[]> {
  const startTime = Date.now();
  const vectorStore = getVectorStore();

  logger.info('IN-ZONE', `Recherche dans la zone: ${zoneName}`);

  try {
    const results = await withRetry(async () => {
      return await vectorStore.search(zoneName, query, {
        nResults: options.nResults || 10,
        where: options.where,
        include: ['documents', 'metadatas', 'distances']
      });
    });

    statsManager.increment('vectorUsageCount');

    const elapsedTime = Date.now() - startTime;

    if (!results.documents || results.documents.length === 0) {
      logger.info('IN-ZONE', `Aucun r├®sultat dans la zone ${zoneName}`);
      return [];
    }

    const isVisionZone = zoneName === 'VISION';
    const technicalCodes = extractTechnicalCodes(query);
    const queryLower = query.toLowerCase();
    
    const mapped = results.documents.map((doc: any, i: number) => {
      const contentStr = typeof doc === 'string' ? doc : JSON.stringify(doc);
      const metadata = results.metadatas?.[i] || {};

      let imageId: string | undefined;
      let isImage = false;
      let imageFilename: string | undefined;
      let imageDescription: string | undefined;
      
      if (isVisionZone || metadata.type === 'image' || metadata.mimeType?.startsWith('image/')) {
        isImage = true;
        
        imageId = metadata.id || metadata.imageId || metadata.image_id;
        
        if (!imageId) {
          const idMatch = contentStr.match(/[Ii][Dd]:\s*([a-f0-9-]+)/);
          if (idMatch) imageId = idMatch[1];
        }
        
        if (!imageId) {
          const uuidMatch = contentStr.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
          if (uuidMatch) imageId = uuidMatch[0];
        }
        
        if (!imageId && metadata.filename) {
          imageId = metadata.filename;
        }
        
        imageFilename = metadata.filename || metadata.name || `image_${imageId || i}`;
        imageDescription = metadata.description || metadata.caption || '';
        
        console.log(`[VISION] ­ƒû╝´©Å Image trouv├®e dans zone ${zoneName}: id=${imageId}, filename=${imageFilename}`);
      }

      let enrichedContent = enrichContentWithMetadata(contentStr, metadata);
      
      if (isImage && imageId) {
        const imageMarker = `[IMAGE: ${imageFilename} | ID: ${imageId}]`;
        if (!enrichedContent.includes(imageMarker)) {
          enrichedContent = `${imageMarker}\n${enrichedContent}`;
        }
      }

      let distance = 1;
      if (results.distances && results.distances[i] !== undefined) {
        const distValue = Array.isArray(results.distances[i])
          ? results.distances[i][0]
          : results.distances[i];
        distance = typeof distValue === 'number' && !isNaN(distValue) ? distValue : 1;
      }

      let score = 1 - Math.min(Math.max(distance, 0), 1);
      if (isNaN(score)) score = 0;
      
      // ­ƒöÑ BONUS POUR LES CODES TECHNIQUES
      if (technicalCodes.length > 0) {
        let bonus = 0;
        const filename = metadata.filename || '';
        const tags = metadata.tags || [];
        
        for (const code of technicalCodes) {
          if (filename.toUpperCase().includes(code.toUpperCase())) {
            bonus = Math.max(bonus, 0.4);
            console.log(`[RAG] ­ƒÄ» Bonus code ${code} sur filename ${filename}: +0.4`);
          }
          if (Array.isArray(tags) && tags.some(tag => tag.toUpperCase().includes(code.toUpperCase()))) {
            bonus = Math.max(bonus, 0.3);
            console.log(`[RAG] ­ƒÄ» Bonus code ${code} sur tags: +0.3`);
          }
          const description = metadata.description || '';
          if (description.toUpperCase().includes(code.toUpperCase())) {
            bonus = Math.max(bonus, 0.2);
            console.log(`[RAG] ­ƒÄ» Bonus code ${code} sur description: +0.2`);
          }
        }
        
        if (bonus > 0) {
          score = Math.min(score + bonus, 1.0);
          console.log(`[RAG] ­ƒôê Nouveau score apr├¿s bonus codes: ${score.toFixed(2)}`);
        }
      }
      
      // ­ƒöÑ NOUVEAU: BONUS POUR LES TAGS ET LA DESCRIPTION (recherche s├®mantique)
      if (isImage && isVisionZone) {
        let semanticBonus = 0;
        const tags = metadata.tags || [];
        const description = (metadata.description || '').toLowerCase();
        const filename = (metadata.filename || '').toLowerCase();
        
        // Bonus pour chaque tag qui correspond ├á la requ├¬te
        for (const tag of tags) {
          if (queryLower.includes(tag.toLowerCase())) {
            semanticBonus = Math.max(semanticBonus, 0.35);
            console.log(`[RAG] ­ƒÅÀ´©Å Bonus tag correspondant: "${tag}" (+0.35)`);
          }
        }
        
        // Bonus si la description contient des mots-cl├®s de la requ├¬te
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);
        let matchCount = 0;
        for (const word of queryWords) {
          if (description.includes(word) || filename.includes(word)) {
            matchCount++;
          }
        }
        if (matchCount > 0) {
          const descriptionBonus = Math.min(0.25, (matchCount / queryWords.length) * 0.25);
          semanticBonus = Math.max(semanticBonus, descriptionBonus);
          console.log(`[RAG] ­ƒôØ Bonus description: ${matchCount}/${queryWords.length} mots correspondants (+${descriptionBonus.toFixed(2)})`);
        }
        
        // Bonus suppl├®mentaire si les mots-cl├®s d'invocation correspondent
        const invocationKeywords = (metadata.invocationKeywords || '').toLowerCase();
        if (invocationKeywords && queryLower.split(/\s+/).some(w => invocationKeywords.includes(w))) {
          semanticBonus = Math.max(semanticBonus, 0.2);
          console.log(`[RAG] ­ƒöæ Bonus invocationKeywords (+0.2)`);
        }
        
        if (semanticBonus > 0) {
          score = Math.min(score + semanticBonus, 1.0);
          console.log(`[RAG] ­ƒôê Nouveau score apr├¿s bonus s├®mantique: ${score.toFixed(2)}`);
        }
      }
      
      // Bonus de base pour les images dans la zone VISION
      if (isImage && isVisionZone) {
        score = Math.min(score + 0.1, 1.0);
      }

      const result: CollectionSearchResult = {
        content: enrichedContent,
        metadata: {
          ...metadata,
          isImage,
          imageId,
          imageFilename,
          imageDescription,
          zone: zoneName
        },
        score: score,
        source: metadata.zone || metadata.collection || zoneName,
        confidence: score,
        citations: [metadata.source || 'Document']
      };
      
      if (isImage && imageId) {
        (result as any).imageId = imageId;
        (result as any).imageUrl = `/api/vision/images/${imageId}`;
        (result as any).imageThumbnailUrl = `/api/vision/images/${imageId}?thumbnail=true`;
        (result as any).isImage = true;
        (result as any).confidence = score;
      }
      
      return result;
    });

    // ­ƒöÑ TRIER PAR SCORE (les plus pertinents en premier)
    mapped.sort((a, b) => b.score - a.score);

    const imagesFound = mapped.filter(r => (r.metadata as any).isImage === true);
    if (imagesFound.length > 0) {
      console.log(`ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü`);
      console.log(`­ƒû╝´©Å [ZONE:${zoneName}] ${imagesFound.length} image(s) trouv├®e(s):`);
      imagesFound.forEach((img, idx) => {
        const imgData = img as any;
        console.log(`   ${idx + 1}. ${imgData.metadata.imageFilename || 'Image'} (ID: ${imgData.imageId}) [score: ${imgData.score.toFixed(2)}]`);
      });
      console.log(`ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü`);
    }

    logger.success('IN-ZONE', `${mapped.length} r├®sultats en ${formatDuration(elapsedTime)}${imagesFound.length > 0 ? ` (dont ${imagesFound.length} images)` : ''}`);
    return mapped;

  } catch (error: any) {
    logger.error('IN-ZONE', `Erreur dans la zone ${zoneName}`, error);
    statsManager.increment('errorCount');
    return [];
  }
}
// ============================================================================
// RECHERCHE DYNAMIQUE PAR ZONES PERTINENTES
// ============================================================================

async function searchDynamicZones(
  query: string,
  options: ValidatedSearchOptions
): Promise<EnrichedSearchResult[]> {
  const startTime = Date.now();

  if (options.zone && (options.zone as keyof typeof ZONES_CONFIG) in ZONES_CONFIG) {
    const zoneName = options.zone;
    logger.info('DYNAMIC', `­ƒÄ» Recherche cibl├®e sur la zone: ${zoneName}`);
    const results = await searchInZoneInternal(zoneName as ZoneType, query, {
      nResults: options.nResults || 10,
      where: options.equipement ? { equipement: options.equipement } : undefined
    });
    const elapsedTime = Date.now() - startTime;
    logger.metric('DYNAMIC', 'r├®sultats', `${results.length} en ${formatDuration(elapsedTime)}`);
    return results;
  }

  let relevantZones: ZoneType[] = getRelevantZones(query);

  if (isVisionQuery(query) && !relevantZones.includes('VISION')) {
    logger.info('DYNAMIC', '­ƒû╝´©Å Requ├¬te visuelle d├®tect├®e ÔåÆ ajout forc├® de la zone VISION');
    relevantZones.unshift('VISION');
  }

  if (relevantZones.length === 0) {
    logger.warning('DYNAMIC', 'Aucune zone pertinente, utilisation par d├®faut');
    relevantZones.push('SHARED', 'B0_AUXILIAIRES');
  }

  logger.info('DYNAMIC', `­ƒÄ» Recherche contextuelle dans les zones: ${relevantZones.join(', ')}`);

  const allResults: EnrichedSearchResult[] = [];
  let totalImagesFound = 0;

  for (const zoneName of relevantZones) {
    const where: any = {};
    if (options.equipement) where.equipement = options.equipement;
    if (options.zone) where.zone = options.zone;

    const results = await searchInZoneInternal(zoneName, query, {
      nResults: options.nResults || 3,
      where
    });

    const config = ZONES_CONFIG[zoneName];
    const relevanceBonus = config ? (6 - config.priority) * 0.05 : 0;

    const imagesInZone = results.filter(r => (r as any).isImage === true || r.metadata?.isImage === true);
    if (imagesInZone.length > 0) {
      totalImagesFound += imagesInZone.length;
    }

    console.log('   ­ƒôü Zone interrog├®e :', zoneName);
    console.log('      Ôö£ÔöÇ R├®sultats bruts :', results.length);
    if (imagesInZone.length > 0) {
      console.log('      Ôö£ÔöÇ ­ƒû╝´©Å Images trouv├®es :', imagesInZone.length);
    }
    if (results.length > 0) {
      console.log('      Ôö£ÔöÇ Meilleur score :', (results[0].score * 100).toFixed(1) + '%');
      console.log('      ÔööÔöÇ Bonus de pertinence :', relevanceBonus > 0 ? '+' + (relevanceBonus * 100).toFixed(0) + '%' : 'aucun');
    } else {
      console.log('      ÔööÔöÇ Aucun r├®sultat');
    }

    for (const result of results) {
      result.confidence = Math.min(result.confidence + relevanceBonus, 1);
      result.score = result.confidence;
      
      const anyResult = result as any;
      if (anyResult.isImage === true || anyResult.imageId) {
        anyResult.isImage = true;
        if (!anyResult.imageUrl && anyResult.imageId) {
          anyResult.imageUrl = `/api/vision/images/${anyResult.imageId}`;
          anyResult.imageThumbnailUrl = `/api/vision/images/${anyResult.imageId}?thumbnail=true`;
        }
        if (result.metadata) {
          result.metadata.isImage = true;
          result.metadata.imageId = anyResult.imageId;
          result.metadata.imageUrl = anyResult.imageUrl;
        }
      }
      
      allResults.push(result);
    }
  }

  // ­ƒöÑ TRI PRIORITAIRE : Les images remontent en premier
  allResults.sort((a, b) => {
    const aIsImage = (a as any).isImage === true;
    const bIsImage = (b as any).isImage === true;
    
    if (aIsImage && !bIsImage) return -1;
    if (!aIsImage && bIsImage) return 1;
    return b.score - a.score;
  });

  // ­ƒöÑ TRI PAR PRIORIT├ë DES CODES TECHNIQUES
  const technicalCodes = extractTechnicalCodes(query);
  if (technicalCodes.length > 0 && allResults.length > 0) {
    console.log(`[DYNAMIC] ­ƒöº Tri par priorit├® des codes: ${technicalCodes.join(', ')}`);
    
    allResults.sort((a, b) => {
      const aMetadata = a.metadata || {};
      const bMetadata = b.metadata || {};
      
      const aFilename = aMetadata.filename || '';
      const bFilename = bMetadata.filename || '';
      const aTags = aMetadata.tags || [];
      const bTags = bMetadata.tags || [];
      
      const aMatches = technicalCodes.some(code => 
        aFilename.toUpperCase().includes(code.toUpperCase()) ||
        aTags.some((tag: string) => tag.toUpperCase().includes(code.toUpperCase()))
      );
      const bMatches = technicalCodes.some(code => 
        bFilename.toUpperCase().includes(code.toUpperCase()) ||
        bTags.some((tag: string) => tag.toUpperCase().includes(code.toUpperCase()))
      );
      
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return b.score - a.score;
    });
    
    const topMatches = allResults.slice(0, 3).filter(r => {
      const metadata = r.metadata || {};
      return technicalCodes.some(code => 
        (metadata.filename || '').toUpperCase().includes(code.toUpperCase())
      );
    });
    if (topMatches.length > 0) {
      console.log(`[DYNAMIC] ­ƒÄ» ${topMatches.length} r├®sultat(s) prioritaire(s) pour codes techniques`);
    }
  }

  if (totalImagesFound > 0) {
    console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');
    console.log(`­ƒû╝´©Å [DYNAMIC-ZONES] ${totalImagesFound} image(s) trouv├®e(s) au total`);
    console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');
  }

  const elapsedTime = Date.now() - startTime;
  
  aiLogger.logStep(4, 'RAG', 'Dynamic Zones Search', {
    query,
    zonesSearched: relevantZones,
    totalFound: allResults.length,
    imagesFound: totalImagesFound,
    durationMs: elapsedTime
  });
  
  logger.metric('DYNAMIC', 'r├®sultats', `${allResults.length} en ${formatDuration(elapsedTime)}${totalImagesFound > 0 ? ` (dont ${totalImagesFound} images)` : ''}`);

  return allResults;
}

// ============================================================================
// RECHERCHE INTELLIGENTE MULTI-SOURCES
// ============================================================================

export async function searchIntelligent(
  query: string,
  options: SearchOptions = {}
): Promise<EnrichedSearchResult[]> {
  const startTime = Date.now();
  const config = getRAGConfig();

  const validatedOptions = safeParseSearchOptions(options);
  const safeOptions = validatedOptions || options;

  // ============================================
  // ­ƒöÑ RECHERCHE PAR NOM DE FICHIER EXACT
  // ============================================
  // D├®tecter si la requ├¬te contient un nom de fichier (avec extension)
  const filenameMatch = query.match(/([a-zA-Z0-9_\-]+\.(jpg|jpeg|png|gif|webp))/i);
  if (filenameMatch) {
    console.log(`[RAG] ­ƒô© D├®tection de nom de fichier: ${filenameMatch[1]}`);
    const exactResult = await searchByExactFilename(filenameMatch[1]);
    if (exactResult) {
      console.log(`[RAG] Ô£à Image trouv├®e par nom de fichier exact`);
      return [exactResult];
    }
  }

  if (safeOptions.zone) {
    if (safeOptions.zone === ('MINDMAP' as any)) {
      logger.info('INTELLIGENT', `🧠 Recherche ciblée dans la zone MINDMAP`);
      const mmResults = await mindMapRagBridge.searchMindMapNodes(query, safeOptions.nResults || 5);
      const elapsedTime = Date.now() - startTime;
      logger.success('INTELLIGENT', `${mmResults.length} schémas mentaux trouvés en ${formatDuration(elapsedTime)}`);
      
      return mmResults.map(mr => ({
        content: mr.markdown,
        metadata: {
          circuitId: mr.circuitId,
          nodesCount: mr.nodesCount,
          zone: 'MINDMAP',
          title: `🧠 Schéma mental - Circuit ${mr.circuitId}`,
          source: `mindmap:${mr.circuitId}`,
          isMindMap: true
        },
        score: 0.95,
        source: 'mindmap',
        confidence: 0.95,
        citations: [`MindMap:${mr.circuitId}`]
      }));
    }

    logger.info('INTELLIGENT', `­ƒÄ» Recherche uniquement dans la zone sp├®cifi├®e: ${safeOptions.zone}`);
    const results = await searchInZoneInternal(safeOptions.zone as ZoneType, query, {
      nResults: safeOptions.nResults || 10,
      where: safeOptions.equipement ? { equipement: safeOptions.equipement } : undefined
    });
    const elapsedTime = Date.now() - startTime;
    logger.success('INTELLIGENT', `${results.length} r├®sultats en ${formatDuration(elapsedTime)}`);
    
    return results.map(r => {
      const anyResult = r as any;
      return {
        content: r.content,
        metadata: r.metadata,
        score: r.score,
        source: r.source,
        confidence: r.confidence,
        citations: r.citations,
        ...(anyResult.isImage || anyResult.imageId ? {
          imageId: anyResult.imageId || anyResult.metadata?.imageId,
          imageUrl: anyResult.imageUrl || (anyResult.imageId ? `/api/vision/images/${anyResult.imageId}` : undefined),
          imageThumbnailUrl: anyResult.imageThumbnailUrl || (anyResult.imageId ? `/api/vision/images/${anyResult.imageId}?thumbnail=true` : undefined),
          isImage: true
        } : {})
      };
    });
  }

  logger.info('INTELLIGENT', `­ƒöì Recherche: "${query.substring(0, 60)}${query.length > 60 ? '...' : ''}"`);

  const responseType = getExpectedResponseType(query);
  logger.metric('INTELLIGENT', 'Type r├®ponse attendu', responseType);

  const isShortQuery = query.length < 30;
  const isProfileQuery = (
    query.toLowerCase().includes('qui est') ||
    query.toLowerCase().includes('profil') ||
    query.toLowerCase().includes('profile') ||
    query.toLowerCase().includes('chef de bloc') ||
    query.toLowerCase().includes('chef de quart') ||
    query.toLowerCase().includes('chef bloc') ||
    query.toLowerCase().includes('chef quart') ||
    query.toLowerCase().includes('fiche de poste') ||
    query.toLowerCase().includes('fiche poste') ||
    query.toLowerCase().includes('responsable') ||
    query.toLowerCase().includes('superviseur') ||
    query.toLowerCase().includes('op├®rateur') ||
    query.toLowerCase().includes('operateur') ||
    query.toLowerCase().includes('attribution') ||
    query.toLowerCase().includes('mission') ||
    query.toLowerCase().includes('fonction')
  );

  const defaultNResults = isShortQuery ? 3 : (safeOptions.nResults || config.retrieval.maxResults);
  const maxFinalResults = Math.min(defaultNResults, 5);

  const cacheEnabled = process.env.RAG_SEMANTIC_CACHE !== 'false';
  if (cacheEnabled) {
    const cacheKey = `search:${query.toLowerCase().trim()}:${JSON.stringify(safeOptions)}`;
    try {
      const cached = SemanticCache.cache?.get(cacheKey);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        statsManager.increment('cacheHits');

        const cachedImages = cached.filter((r: any) => r.isImage === true);
        
        console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');
        console.log('­ƒÆ¥ SECTION 4.0 ÔÇô Cache RAG');
        console.log('Ô£à HIT ÔÇô R├®sultats servis depuis le cache RAG');
        console.log('­ƒôè', cached.length, 'r├®sultats en cache');
        if (cachedImages.length > 0) {
          console.log('­ƒû╝´©Å Dont', cachedImages.length, 'image(s) en cache');
        }
        console.log('ÔÅ▒´©Å Temps ├®conomis├® : ~2-4 secondes');
        console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');

        return cached as EnrichedSearchResult[];
      }
    } catch (error: any) {
      logger.warning('CACHE', '├ëchec lecture cache', error.message);
    }
  }

  console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');
  console.log('­ƒÆ¥ SECTION 4.0 ÔÇô Cache RAG');
  console.log('ÔØî MISS ÔÇô Aucun r├®sultat en cache');
  console.log('­ƒöä Poursuite de la recherche vectorielle...');
  console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');

  statsManager.increment('cacheMisses');

  let results: EnrichedSearchResult[] = [];

  if (isProfileQuery) {
    logger.info('INTELLIGENT', `­ƒæñ D├®tection profil, priorit├® ├á la zone HR`);
    const zoneForSearch: ZoneType = 'RH';
    const profileResults = await searchInZoneInternal(zoneForSearch, query, {
      nResults: 5,
      where: safeOptions.zone ? { zone: safeOptions.zone } : undefined
    });
    results.push(...profileResults);
  }

  const dynamicResults = await searchDynamicZones(query, safeOptions);
  results.push(...dynamicResults);

  // 🧠 RECHERCHE DANS LES MINDMAPS (SCHÉMAS MENTAUX)
  let mindmapSearchResults = [];
  const queryLower = query.toLowerCase();
  const hasMindMapKeywords = [
    'mindmap', 'mind map', 'schéma mental', 'schema mental', 'circuit', 
    'nœud', 'noeud', 'dépendance', 'dependance', 'paramètre', 'parametre', 
    'formule', 'équation', 'equation', 'kks', 'interdépendance'
  ].some(kw => queryLower.includes(kw));

  if (hasMindMapKeywords || !isShortQuery) {
    try {
      console.log(`[RAG] 🧠 Recherche de schémas mentaux (Mind Maps) pour: "${query}"`);
      const mmResults = await mindMapRagBridge.searchMindMapNodes(query, 3);
      if (mmResults && mmResults.length > 0) {
        console.log(`[RAG] ✅ ${mmResults.length} schéma(s) mental(aux) trouvé(s)`);
        mindmapSearchResults = mmResults.map(mr => ({
          content: mr.markdown,
          metadata: {
            circuitId: mr.circuitId,
            nodesCount: mr.nodesCount,
            zone: 'MINDMAP',
            title: `🧠 Schéma mental - Circuit ${mr.circuitId}`,
            source: `mindmap:${mr.circuitId}`,
            isMindMap: true
          },
          score: 0.95,
          source: 'mindmap',
          confidence: 0.95,
          citations: [`MindMap:${mr.circuitId}`]
        }));
      }
    } catch (err) {
      console.error('[RAG] Erreur lors de la recherche MindMap:', err);
    }
  }

  if (mindmapSearchResults.length > 0) {
    results.push(...mindmapSearchResults);
  }

  const mergedResults = mergeResults(results);

  console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');
  console.log('­ƒöä SECTION 4.1 ÔÇô Fusion et D├®duplication');
  console.log('­ƒôè R├®sultats avant fusion :', results.length);
  console.log('­ƒôè R├®sultats apr├¿s d├®duplication :', mergedResults.length);
  if (results.length !== mergedResults.length) {
    console.log('­ƒùæ´©Å Doublons supprim├®s :', results.length - mergedResults.length);
  }
  console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');

  let bm25: BM25 | null = null;
  if (!isShortQuery && mergedResults.length > 0) {
    const bm25Corpus = mergedResults.map(r => ({
      content: typeof r.content === 'string' ? r.content.substring(0, 800) : String(r.content).substring(0, 800),
      metadata: r.metadata
    }));
    bm25 = new BM25(bm25Corpus);
    statsManager.increment('bm25UsageCount');
  }

  const shouldRerank = safeOptions.useReranking !== false &&
    config.retrieval.enableReranking &&
    !isShortQuery &&
    bm25 !== null;

  const reranked = shouldRerank && bm25
    ? await rerankHybrid(query, mergedResults, config.retrieval.sourceWeights, bm25)
    : mergedResults;

  if (shouldRerank && bm25) {
    console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');
    console.log('­ƒôè SECTION 4.2 ÔÇô Re-ranking Hybride');
    console.log('Ô£à Re-ranking activ├® (BM25 + Vectoriel)');
    console.log('­ƒôê Meilleur score avant re-ranking :', mergedResults[0]?.score.toFixed(3) || 'N/A');
    console.log('­ƒôê Meilleur score apr├¿s re-ranking :', reranked[0]?.score.toFixed(3) || 'N/A');
    if (mergedResults[0] && reranked[0]) {
      const improvement = ((reranked[0].score - mergedResults[0].score) * 100).toFixed(1);
      console.log('­ƒö╝ Am├®lioration :', improvement + '%');
    }
    console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');
  } else {
    console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');
    console.log('­ƒôè SECTION 4.2 ÔÇô Re-ranking Hybride');
    console.log('ÔÅ¡´©Å Re-ranking d├®sactiv├® (requ├¬te courte ou BM25 non disponible)');
    console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');
  }

  const minConfidence = isShortQuery ? 0.2 : (safeOptions.minConfidence || config.retrieval.minConfidence);
  const filtered = reranked.filter(r => r.confidence >= minConfidence);

  console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');
  console.log('­ƒö¼ SECTION 4.3 ÔÇô Filtrage par Confiance');
  console.log('­ƒôè R├®sultats avant filtrage :', reranked.length);
  console.log('­ƒôè R├®sultats apr├¿s filtrage :', filtered.length);
  console.log('­ƒÄ» Seuil de confiance minimum :', (minConfidence * 100).toFixed(0) + '%');
  if (reranked.length > filtered.length) {
    const filteredOut = reranked.filter(r => r.confidence < minConfidence);
    console.log('­ƒùæ´©Å R├®sultats filtr├®s (confiance trop faible) :');
    filteredOut.slice(0, 3).forEach(r => {
      console.log('   ÔööÔöÇ', r.source, ':', (r.confidence * 100).toFixed(1) + '%');
    });
    if (filteredOut.length > 3) {
      console.log('   ÔööÔöÇ ... et', filteredOut.length - 3, 'autre(s)');
    }
  }
  console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');

  const finalResults = filtered.slice(0, maxFinalResults).map(r => {
    const anyResult = r as any;
    const hasImage = anyResult.isImage === true || anyResult.imageId || r.metadata?.isImage === true;
    
    return {
      content: r.content,
      metadata: r.metadata,
      score: r.score,
      source: r.source,
      confidence: r.confidence,
      citations: r.citations,
      ...(hasImage ? {
        imageId: anyResult.imageId || anyResult.metadata?.imageId,
        imageUrl: anyResult.imageUrl || anyResult.metadata?.imageUrl || (anyResult.imageId ? `/api/vision/images/${anyResult.imageId}` : undefined),
        imageThumbnailUrl: anyResult.imageThumbnailUrl || anyResult.metadata?.imageThumbnailUrl || (anyResult.imageId ? `/api/vision/images/${anyResult.imageId}?thumbnail=true` : undefined),
        isImage: true
      } : {})
    };
  });

  const elapsedTime = Date.now() - startTime;

  statsManager.increment('totalSearches');
  statsManager.average('avgResults', finalResults.length);
  statsManager.average('avgProcessingTime', elapsedTime);
  statsManager.update({
    lastSearchTime: Date.now(),
    lastSearchDuration: elapsedTime
  });

  if (cacheEnabled && finalResults.length > 0 && !isShortQuery) {
    const cacheKey = `search:${query.toLowerCase().trim()}:${JSON.stringify(safeOptions)}`;
    try {
      await SemanticCache.set({
        key: cacheKey,
        value: finalResults,
        ttl: 3600
      });
      logger.info('CACHE', 'R├®sultats mis en cache pour 1h');
    } catch (error: any) {
      logger.warning('CACHE', '├ëchec ├®criture cache', error.message);
    }
  }

  const sourcesUsed = Array.from(new Set(finalResults.map(r => r.source)));
  const imagesFound = finalResults.filter(r => (r as any).isImage === true);
  
  logger.success('INTELLIGENT', `${finalResults.length} r├®sultats en ${formatDuration(elapsedTime)}`, {
    sources: sourcesUsed.join(', ') || 'aucune',
    responseType,
    optimized: isShortQuery ? 'yes' : 'no',
    zone: safeOptions.zone || 'auto',
    imagesFound: imagesFound.length
  });

  console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');
  console.log('­ƒöì SECTION 4 ÔÇô Recherche RAG (R├®sultats finaux)');
  console.log('­ƒôØ Requ├¬te RAG :', query.substring(0, 100));
  console.log('­ƒôé Zones interrog├®es :', sourcesUsed.join(', ') || 'aucune');
  console.log('­ƒôè Nombre de r├®sultats :', finalResults.length);
  if (imagesFound.length > 0) {
    console.log('­ƒû╝´©Å Images trouv├®es :', imagesFound.length);
    imagesFound.forEach((img, idx) => {
      const imgData = img as any;
      console.log(`   ${idx + 1}. ${imgData.metadata?.filename || 'Image'} (ID: ${imgData.imageId})`);
    });
  }
  if (finalResults.length > 0) {
    console.log('­ƒÅå Meilleure confiance :', (finalResults[0].confidence * 100).toFixed(0) + '%');
    console.log('­ƒôä Source principale :', finalResults[0].source);
  } else {
    console.log('ÔÜá´©Å Aucun r├®sultat trouv├®');
  }
  console.log('ÔÅ▒´©Å Temps total RAG :', formatDuration(elapsedTime));
  console.log('ÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöüÔöü');

  return finalResults;
}

// ============================================================================
// FONCTIONS DE RECHERCHE SP├ëCIALIS├ëES
// ============================================================================

export async function searchByProfile(
  query: string,
  profile: string,
  options: Omit<SearchOptions, 'userProfile'> = {}
): Promise<EnrichedSearchResult[]> {
  logger.info('BY-PROFILE', `Recherche pour profil: ${profile}`);
  return searchIntelligent(query, { ...options, userProfile: profile as any });
}

export async function searchByEquipment(
  query: string,
  equipement: string,
  options: Omit<SearchOptions, 'equipement'> = {}
): Promise<EnrichedSearchResult[]> {
  logger.info('BY-EQUIPMENT', `Recherche pour ├®quipement: ${equipement}`);
  return searchIntelligent(query, { ...options, equipement });
}

export async function searchInZone(
  zoneName: ZoneType,
  query: string,
  options: { nResults?: number; where?: Record<string, any> } = {}
): Promise<EnrichedSearchResult[]> {
  logger.info('IN-ZONE', `Recherche dans la zone ${zoneName}`);
  return searchInZoneInternal(zoneName, query, options);
}

// ============================================================================
// R├ëCUP├ëRATION DE DOCUMENTS COMPLETS
// ============================================================================

export async function getFullDocument(
  documentId: string,
  zoneName: ZoneType
): Promise<DocumentWithChunks | null> {
  const startTime = Date.now();

  logger.info('FULL-DOC', `­ƒôä R├®cup├®ration du document complet: ${documentId} depuis la zone ${zoneName}`);

  try {
    const vectorStore = getVectorStore();
    await vectorStore.getOrCreateCollection(zoneName);

    const mainResult = await withRetry(async () => {
      return await vectorStore.search(zoneName, documentId, {
        nResults: 1,
        where: { id: documentId },
        include: ['documents', 'metadatas']
      });
    });

    if (!mainResult.documents || mainResult.documents.length === 0 || !mainResult.documents[0]) {
      logger.warning('FULL-DOC', `Document principal non trouv├®: ${documentId}`);
      return null;
    }

    const chunksResult = await vectorStore.search(zoneName, documentId, {
      nResults: 100,
      where: { parent_id: documentId },
      include: ['documents', 'metadatas']
    });

    const chunks: { content: string; index: number }[] = [];
    if (chunksResult.documents && chunksResult.documents.length > 0) {
      for (let i = 0; i < chunksResult.documents.length; i++) {
        const chunkMetadata = chunksResult.metadatas?.[i] || {};
        const rawIndex = chunkMetadata.chunk_index;
        let chunkIndex = i;

        if (typeof rawIndex === 'number') {
          chunkIndex = rawIndex;
        } else if (typeof rawIndex === 'string') {
          const parsed = parseInt(rawIndex, 10);
          chunkIndex = isNaN(parsed) ? i : parsed;
        }

        chunks.push({
          content: chunksResult.documents[i] || '',
          index: chunkIndex
        });
      }
      chunks.sort((a, b) => a.index - b.index);
    }

    let fullContent = mainResult.documents[0];
    for (const chunk of chunks) {
      if (!fullContent.includes(chunk.content)) {
        fullContent += '\n\n' + chunk.content;
      }
    }

    const elapsedTime = Date.now() - startTime;
    logger.success('FULL-DOC', `Ô£à Document complet r├®cup├®r├® en ${formatDuration(elapsedTime)}`, {
      documentId,
      contentLength: fullContent.length,
      chunksCount: chunks.length
    });

    return {
      content: fullContent,
      metadata: mainResult.metadatas?.[0] || {},
      chunks
    };

  } catch (error: any) {
    logger.error('FULL-DOC', `Erreur lors de la r├®cup├®ration du document ${documentId}:`, error);
    statsManager.increment('errorCount');
    return null;
  }
}

export async function findFullDocumentById(documentId: string): Promise<(DocumentWithChunks & { zone: ZoneType }) | null> {
  const startTime = Date.now();

  logger.info('FIND-DOC', `­ƒöì Recherche du document: ${documentId} dans toutes les zones`);

  try {
    const vectorStore = getVectorStore();
    const allZones = Object.keys(ZONES_CONFIG) as ZoneType[];

    for (const zoneName of allZones) {
      try {
        const result = await vectorStore.search(zoneName, documentId, {
          nResults: 1,
          where: { id: documentId },
          include: ['documents', 'metadatas']
        });

        if (result.documents && result.documents.length > 0 && result.documents[0]) {
          const chunksResult = await vectorStore.search(zoneName, documentId, {
            nResults: 100,
            where: { parent_id: documentId },
            include: ['documents', 'metadatas']
          });

          const chunks: { content: string; index: number }[] = [];
          if (chunksResult.documents) {
            for (let i = 0; i < chunksResult.documents.length; i++) {
              const chunkMetadata = chunksResult.metadatas?.[i] || {};
              let chunkIndex = i;
              const rawIndex = chunkMetadata.chunk_index;

              if (typeof rawIndex === 'number') {
                chunkIndex = rawIndex;
              } else if (typeof rawIndex === 'string') {
                const parsed = parseInt(rawIndex, 10);
                chunkIndex = isNaN(parsed) ? i : parsed;
              }

              chunks.push({
                content: chunksResult.documents[i] || '',
                index: chunkIndex
              });
            }
            chunks.sort((a, b) => a.index - b.index);
          }

          const elapsedTime = Date.now() - startTime;
          logger.success('FIND-DOC', `Ô£à Document trouv├® dans la zone ${zoneName} en ${formatDuration(elapsedTime)}`);

          return {
            content: result.documents[0],
            metadata: result.metadatas?.[0] || {},
            zone: zoneName,
            chunks
          };
        }
      } catch (error) {
        continue;
      }
    }

    logger.warning('FIND-DOC', `Document non trouv├®: ${documentId}`);
    return null;

  } catch (error: any) {
    logger.error('FIND-DOC', `Erreur lors de la recherche du document ${documentId}:`, error);
    return null;
  }
}

export async function getEnrichedDocumentContent(
  documentId: string,
  zoneName: ZoneType
): Promise<string> {
  const fullDoc = await getFullDocument(documentId, zoneName);
  if (!fullDoc) return '';

  if (fullDoc.chunks.length > 0) {
    let completeContent = '';
    for (const chunk of fullDoc.chunks) {
      completeContent += chunk.content + '\n\n';
    }
    return completeContent.trim();
  }

  return fullDoc.content;
}

// ============================================================================
// FONCTION PRINCIPALE DE RETRIEVAL
// ============================================================================

export async function retrieveContext(
  query: string,
  _userId: string = 'default-user'
): Promise<RetrievalResult> {
  const startTime = Date.now();

  logger.printSeparator();
  logger.info('RETRIEVE', `­ƒÜÇ R├ëCUP├ëRATION DE CONTEXTE`);
  logger.metric('RETRIEVE', 'requ├¬te', `"${query.substring(0, 80)}${query.length > 80 ? '...' : ''}"`);
  logger.printSeparator();

  try {
    const [searchResults, analysis] = await Promise.all([
      searchIntelligent(query, { nResults: 5 }),
      analyzeQuery(query),
    ]);

    const elapsedTime = Date.now() - startTime;

    const fused: FusedResult[] = searchResults.map(r => ({
      content: r.content,
      source: (r.source === 'document' ? 'document' :
        r.source === 'episodic' ? 'interaction' :
          r.source === 'procedure' ? 'procedure' :
            r.source === 'alarme' ? 'alarme' :
              r.source === 'hmi' ? 'hmi' :
                r.source === 'VISION' ? 'document' :
                r.source === 'mindmap' || r.source === 'MINDMAP' || r.source.startsWith('mindmap:') ? 'mindmap' :
                  'lesson') as FusedResult['source'],
      score: r.score,
      weight: 1.0,
      finalScore: r.score,
      metadata: r.metadata
    }));

    const sourcesUsed: string[] = Array.from(new Set(searchResults.map(r => r.source)));
    const avgScore = searchResults.length > 0
      ? searchResults.reduce((sum, r) => sum + r.confidence, 0) / searchResults.length
      : 0;

    logger.printSeparator();
    logger.success('RETRIEVE', `Ô£à CONTEXTE R├ëCUP├ëR├ë en ${formatDuration(elapsedTime)}`);
    logger.printSeparator();

    return {
      contexts: fused.slice(0, 5),
      totalCount: fused.length,
      analysis,
      suggestions: analysis?.concepts?.slice(0, 2).map((c: string) => `D├®tails sur ${c} ?`) || [],
      metadata: {
        processingTime: elapsedTime,
        sourcesUsed,
        searchCount: searchResults.length,
        avgScore
      }
    };

  } catch (error: any) {
    statsManager.increment('errorCount');
    const elapsedTime = Date.now() - startTime;
    logger.error('RETRIEVE', `├ëchec apr├¿s ${formatDuration(elapsedTime)}`, error);

    return {
      contexts: [],
      totalCount: 0,
      analysis: null,
      suggestions: [],
      metadata: {
        processingTime: elapsedTime,
        sourcesUsed: [],
        searchCount: 0,
        avgScore: 0
      }
    };
  }
}

// ============================================================================
// STATISTIQUES
// ============================================================================

export function getRetrieverStats(): Readonly<RetrieverStats> {
  return statsManager.get();
}

export function getRetrieverSnapshot(): {
  stats: Readonly<RetrieverStats>;
  metadata: { createdAt: Date; updatedAt: Date };
} {
  return statsManager.getSnapshot();
}

export function resetRetrieverStats(): void {
  statsManager.reset();
  logger.success('STATS', 'Statistiques du retriever r├®initialis├®es');
}

export async function persistRetrieverStats(): Promise<void> {
  await statsManager.persist();
  logger.success('STATS', 'Statistiques persist├®es manuellement');
}

export function disposeRetrieverStats(): void {
  statsManager.dispose();
  logger.info('STATS', 'Gestionnaire de statistiques dispos├®');
}

export function getCacheHitRate(): number {
  const stats = statsManager.get();
  const total = stats.cacheHits + stats.cacheMisses;
  return total > 0 ? stats.cacheHits / total : 0;
}

export function getBM25UsageRate(): number {
  const stats = statsManager.get();
  const total = stats.bm25UsageCount + stats.vectorUsageCount;
  return total > 0 ? stats.bm25UsageCount / total : 0;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  searchIntelligent,
  searchByProfile,
  searchByEquipment,
  searchInZone,
  retrieveContext,
  getFullDocument,
  findFullDocumentById,
  getEnrichedDocumentContent,
  getRetrieverStats,
  getRetrieverSnapshot,
  resetRetrieverStats,
  persistRetrieverStats,
  disposeRetrieverStats,
  getCacheHitRate,
  getBM25UsageRate,
  setVectorStore,
  BM25
};
