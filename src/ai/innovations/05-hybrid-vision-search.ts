/**
 * Innovation 5 : Recherche Hybride Vectorielle et Texte (Lexicale)
 * 
 * Principe : Combiner la similarité visuelle avec la recherche textuelle
 * pour des résultats plus pertinents.
 * 
 * VERSION MIGRÉE : Index BM25 persistant dans SQLite
 * VERSION AMÉLIORÉE : Filtres, scores de confiance, personnalisation
 * VERSION 5.0.0 : Intégration DualConsensus pour extraction texte + recherche hybride
 * 
 * @module innovations/hybrid-vision-search
 * @version 5.0.0 - Dual Consensus Integration
 */

import { HybridVisionSearchParams, HybridSearchResult, HybridSearchStats } from './types';
import { getSQLiteCore } from '../core/sqlite/manager';
import { VisionData } from '@/types/vision';
import { chromaDBManager } from '../vector/chromadb-manager';
import { unifiedComparator } from './comparison-engine';
import { ocrService } from '@/lib/services/ocr-service';
import { mllmReRanker } from '@/lib/services/mllmReRanker';
import { quotaManager } from '../resilience/quota-manager';
import { callGemini, isGeminiAvailable } from '../providers/gemini-provider';


// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
  enabled: true,
  defaultVisionWeight: 0.5,
  defaultTextWeight: 0.5,
  minCombinedScore: 0.40, // Seuil assoupli pour MobileNet
  certaintyThreshold: 0.75, // Seuil de haute confiance

  maxResults: 10,
  enableConfidenceScoring: true,
  enablePersonalization: true,
  enableDualConsensus: false, // Activer l'extraction de texte via DualConsensus
  enableMLLMReRanking: false, // ❌ DÉSACTIVÉ: Évite la surcharge CPU/Ollama
  enableCloudAnalysis: false, // ❌ DÉSACTIVÉ: Utilisation exclusive de MobileNet + ChromaDB
  enableDeepEnrichment: false, // ❌ DÉSACTIVÉ: Évite les calculs géométriques/structurels lourds (Part Matching/Stitching) qui causent des timeouts
};


// ============================================================================
// TYPES INTERNES
// ============================================================================

interface VisionMatch {
  id: string;
  similarity: number;
  metadata: {
    filename: string;
    date: string;
    tags: string[];
    description: string;
    location?: string;
    folderId?: string;
  };
}

interface TextMatch {
  id: string;
  score: number;
  metadata: {
    filename: string;
    date: string;
    tags: string[];
    description: string;
    folderId?: string;
  };
  matchedFields: string[];
}

// ============================================================================
// TYPES ÉTENDUS (EXPORTÉS)
// ============================================================================

export interface EnrichedHybridSearchParams extends HybridVisionSearchParams {
  // Filtres
  filterFolder?: string;
  filterZone?: string;
  filterEquipmentType?: string;
  filterTags?: string[];
  
  // Options d'affinage
  minConfidence?: number;
  sortBy?: 'relevance' | 'date' | 'usage' | 'confidence';
  useUserHistory?: boolean;
  recordFeedback?: boolean;
  sessionId?: string;
  userId?: string;
}

export interface EnrichedSearchResult extends HybridSearchResult {
  // Métadonnées enrichies
  folderId?: string;
  zone?: string;
  equipmentType?: string;
  
  // Scoring avancé
  confidenceScore?: number;
  confidenceLevel?: 'high' | 'medium' | 'low';
  confidenceRecommendation?: 'trust' | 'verify' | 'reject';
  relevanceScore?: number;
  
  // Feedback et utilisation
  userFeedback?: 'positive' | 'negative' | null;
  usageCount?: number;
}

export interface AvailableFilters {
  folders: Array<{ id: string; name: string }>;
  zones: string[];
  equipmentTypes: string[];
  tags: string[];
}

export interface SearchMetadata {
  durationMs: number;
  searchMode: 'vision' | 'text' | 'hybrid';
  totalResults: number;
  filtersApplied: string[];
  confidenceBoostApplied: boolean;
  personalizationApplied: boolean;
}

// ============================================================================
// CLASSE PRINCIPALE AMÉLIORÉE
// ============================================================================

export class HybridVisionSearch {
  private config = DEFAULT_CONFIG;
  private db = getSQLiteCore();
  private indexBuilt: boolean = false;
  private imageCache: Map<string, any> = new Map();
  private stats = {
    searches: 0,
    cacheHits: 0,
    cacheMisses: 0,
    personalizedSearches: 0,
    dualConsensusSearches: 0,
    mllmReRankedSearches: 0
  };


  constructor() {
    console.log('[HybridSearch] ✅ Service initialisé (mode SQLite + DualConsensus)');
    this.loadIndexStatus();
    this.initUserPreferencesTable();
  }

  /**
   * Initialise la table des préférences utilisateur
   */
  private async initUserPreferencesTable(): Promise<void> {
    try {
      this.db.getDB().exec(`
        CREATE TABLE IF NOT EXISTS user_search_preferences (
          session_id TEXT PRIMARY KEY,
          user_id TEXT,
          preferred_tags TEXT DEFAULT '[]',
          preferred_zones TEXT DEFAULT '[]',
          preferred_equipment_types TEXT DEFAULT '[]',
          search_history TEXT DEFAULT '[]',
          last_updated INTEGER DEFAULT 0
        )
      `);
    } catch (error) {
      console.error('[HybridSearch] Erreur init préférences:', error);
    }
  }

  /**
   * Charge le statut de l'index depuis SQLite
   */
  private async loadIndexStatus(): Promise<void> {
    try {
      const size = this.db.getDB().prepare(`
        SELECT COUNT(DISTINCT document_id) as count FROM innovation_bm25_index
      `).get() as { count: number };
      
      this.indexBuilt = (size?.count || 0) > 0;
      console.log(`[HybridSearch] 📊 Index BM25: ${size?.count || 0} documents (${this.indexBuilt ? 'chargé' : 'vide'})`);
    } catch (error) {
      console.error('[HybridSearch] Erreur chargement statut index:', error);
    }
  }

  /**
   * Tokenize un texte pour l'index BM25
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 2);
  }

  /**
   * Ajoute un document à l'index BM25 SQLite
   */
  private async addDocumentToIndex(id: string, text: string): Promise<void> {
    const tokens = this.tokenize(text);
    const docLength = tokens.length;
    
    const termFreq: Map<string, number> = new Map();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }
    
    for (const [term, tf] of termFreq) {
      this.db.innovations?.addToBM25Index?.(term, id, tf, docLength);
    }
  }

  /**
   * Supprime un document de l'index BM25
   */
  private async removeDocumentFromIndex(id: string): Promise<void> {
    try {
      this.db.getDB().prepare(`
        DELETE FROM innovation_bm25_index WHERE document_id = ?
      `).run(id);
    } catch (error) {
      console.error('[HybridSearch] Erreur suppression index:', error);
    }
  }

  /**
   * Recherche BM25 via SQLite
   */
  private async bm25Search(query: string, limit: number = 10): Promise<Array<{ id: string; score: number }>> {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];
    
    const stats = this.db.getDB().prepare(`
      SELECT COUNT(DISTINCT document_id) as total_docs, AVG(doc_length) as avg_doc_length
      FROM innovation_bm25_index
    `).get() as { total_docs: number; avg_doc_length: number };
    
    if (!stats.total_docs) return [];
    
    const k1 = 1.5;
    const b = 0.75;
    const idfCache: Map<string, number> = new Map();
    
    for (const term of queryTokens) {
      const docCount = this.db.getDB().prepare(`
        SELECT COUNT(DISTINCT document_id) as count FROM innovation_bm25_index WHERE term = ?
      `).get(term) as { count: number };
      const docsWithTerm = docCount?.count || 0;
      const idf = Math.log((stats.total_docs - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1);
      idfCache.set(term, idf);
    }
    
    const placeholders = queryTokens.map(() => '?').join(',');
    const rows = this.db.getDB().prepare(`
      SELECT document_id, term, tf, doc_length
      FROM innovation_bm25_index
      WHERE term IN (${placeholders})
    `).all(...queryTokens) as Array<{ document_id: string; term: string; tf: number; doc_length: number }>;
    
    const scores: Map<string, number> = new Map();
    for (const row of rows) {
      const idf = idfCache.get(row.term) || 0;
      const numerator = row.tf * (k1 + 1);
      const denominator = row.tf + k1 * (1 - b + b * (row.doc_length / stats.avg_doc_length));
      const score = idf * (numerator / denominator);
      scores.set(row.document_id, (scores.get(row.document_id) || 0) + score);
    }
    
    const maxScore = Math.max(...scores.values(), 1);
    return Array.from(scores.entries())
      .map(([id, score]) => ({ id, score: score / maxScore }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  /**
   * 🔥 NOUVEAU: Extrait le texte d'une image via Tesseract.js (OCR local)
   * Retourne le texte extrait
   */
  private async extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    const ocrId = `OCR_${Date.now().toString(36)}`;
    console.log(`[HybridSearch][${ocrId}] 🤖 Extraction OCR via Tesseract.js...`);
    const ocrStart = Date.now();
    
    try {
      const result = await ocrService.extractText(imageBuffer);
      
      this.stats.dualConsensusSearches++;
      
      const duration = Date.now() - ocrStart;
      
      if (result.text && result.text.length > 5 && result.confidence > 30) {
        console.log(`[HybridSearch][${ocrId}] ✅ Texte fiable: "${result.text.substring(0, 80)}..." (${result.confidence}%, ${duration}ms)`);
        return result.text;
      }
      
      if (result.text && result.text.length > 0) {
        console.log(`[HybridSearch][${ocrId}] ⚠️ Texte faible confiance: "${result.text.substring(0, 80)}..." (${result.confidence}%, ${duration}ms)`);
        return result.text; // On retourne quand même pour tenter la recherche
      }
      
      console.log(`[HybridSearch][${ocrId}] ⚠️ Aucun texte extrait (${duration}ms)`);
      return '';
    } catch (error) {
      const duration = Date.now() - ocrStart;
      console.error(`[HybridSearch][${ocrId}] ❌ Erreur OCR après ${duration}ms:`, error);
      return '';
    }
  }
  /**
   * Recherche visuelle directement via VisionService
   * 🔥 AMÉLIORÉ: Court-circuit par hash + prétraitement standardisé + timeout protection
   */
  private async visionSearchViaAPI(
    imageBuffer: Buffer,
    threshold: number,
    limit: number
  ): Promise<VisionMatch[]> {
    const searchId = `VISION_${Date.now().toString(36)}`;
    const searchStart = Date.now();
    
    try {
      const visionService = (await import('@/lib/services/visionService')).default;
      const crypto = await import('crypto');
      const { getSQLiteCore } = await import('@/ai/core/sqlite/manager');
      
      // 🔥 ÉTAPE 0: Court-circuit par hash EXACT (évite tout calcul coûteux)
      const queryHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
      console.log(`[HybridSearch][${searchId}] 🔑 Hash requête: ${queryHash.substring(0, 16)}...`);
      
      const db = getSQLiteCore();
      const exactMatch = db.vision?.getImageByHash?.(queryHash);
      
      if (exactMatch) {
        console.log(`[HybridSearch][${searchId}] 🎯 COURT-CIRCUIT HASH: Match exact trouvé → ${exactMatch.id}`);
        return [{
          id: exactMatch.id,
          similarity: 1.0,
          metadata: {
            filename: exactMatch.filename || '',
            date: exactMatch.date || '',
            tags: typeof exactMatch.tags === 'string' ? JSON.parse(exactMatch.tags) : (exactMatch.tags || []),
            description: exactMatch.description || '',
            location: exactMatch.location,
            folderId: exactMatch.folder_id || exactMatch.folderId
          }
        }];
      }

      // 🔥 ÉTAPE 1: Prétraitement standardisé (Identique à VisionService.standardizeImage)
      // JPEG 90% + sRGB pour garantir des embeddings déterministes.
      let standardizedBuffer = imageBuffer;
      try {
        const sharp = await import('sharp');
        standardizedBuffer = await sharp.default(imageBuffer)
          .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
          .toColorspace('srgb')
          .toBuffer();
        console.log(`[HybridSearch][${searchId}] 🖼️ Buffer standardisé (${(imageBuffer.length / 1024).toFixed(0)}KB → ${(standardizedBuffer.length / 1024).toFixed(0)}KB)`);
      } catch (sharpErr) {
        console.warn('[HybridSearch] ⚠️ Échec standardisation, utilisation du buffer original:', sharpErr);
        standardizedBuffer = imageBuffer;
      }

      // 🔥 ÉTAPE 2: Extraire les features (avec le buffer standardisé)
      // Timeout de 15s pour l'extraction des features
      const featureTimeout = 15000;
      const features = await Promise.race([
        visionService.extractFeatures(standardizedBuffer),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout extraction features (15s)')), featureTimeout)
        )
      ]).catch((err) => {
        console.error(`[HybridSearch][${searchId}] ❌ Échec extraction features:`, err);
        return null;
      });
      
      if (!features || features.length === 0) {
        console.log(`[HybridSearch][${searchId}] ⚠️ Aucune feature extraite`);
        return [];
      }

      // 🔥 ÉTAPE 3: Tenter d'abord ChromaDB (recherche vectorielle performante)
      // Timeout de 10s pour ChromaDB
      const chromaTimeout = 10000;
      try {
        console.log(`[HybridSearch][${searchId}] 🔎 Recherche vectorielle ChromaDB (dimension ${features.length})...`);
        
        const chromaResults = await Promise.race([
          chromaDBManager.searchSimilar('VISION', features, limit, threshold),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout ChromaDB (10s)')), chromaTimeout)
          )
        ]);
        
        if (chromaResults && chromaResults.length > 0) {
          console.log(`[HybridSearch][${searchId}] ✅ ${chromaResults.length} résultats trouvés via ChromaDB en ${Date.now() - searchStart}ms`);
          return chromaResults.map(r => ({
            id: r.id.replace(/^vision_/, ''),
            similarity: r.score,
            metadata: {
              filename: r.metadata.filename as string || '',
              date: r.metadata.date as string || '',
              tags: typeof r.metadata.tags === 'string' ? JSON.parse(r.metadata.tags) : (r.metadata.tags || []),
              description: r.metadata.description as string || '',
              location: r.metadata.location as string,
              folderId: r.metadata.folderId as string
            }
          }));
        }
      } catch (chromaErr) {
        console.warn(`[HybridSearch][${searchId}] ⚠️ ChromaDB search failed/slow:`, chromaErr.message);
      }

      // 🔥 ÉTAPE 4: Fallback: Recherche mémoire O(N) via VisionService (avec timeout)
      // Timeout de 20s pour la recherche mémoire
      const memoryTimeout = 20000;
      try {
        console.log(`[HybridSearch][${searchId}] 🔄 Fallback: recherche en mémoire (featuresCache)...`);
        
        const matches = await Promise.race([
          visionService.searchSimilar(features, limit, threshold, imageBuffer),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout recherche mémoire (20s)')), memoryTimeout)
          )
        ]);
        
        if (!matches || matches.length === 0) {
          console.log(`[HybridSearch][${searchId}] ⚠️ Aucun résultat en mémoire`);
          return [];
        }
        
        console.log(`[HybridSearch][${searchId}] ✅ ${matches.length} résultats trouvés en mémoire en ${Date.now() - searchStart}ms`);
        return matches.map((match) => ({
          id: match.id,
          similarity: match.similarity,
          metadata: {
            filename: match.metadata?.filename || '',
            date: match.metadata?.date || '',
            tags: match.metadata?.tags || [],
            description: match.metadata?.description || '',
            location: match.metadata?.location,
            folderId: match.metadata?.folderId
          }
        }));
      } catch (memErr) {
        console.error(`[HybridSearch][${searchId}] ❌ Échec recherche mémoire:`, memErr.message);
        return [];
      }
    } catch (error) {
      console.error(`[HybridSearch][${searchId}] Erreur recherche visuelle:`, error);
      return [];
    }
  }

  /**
   * Récupère la liste des images via l'API
   */
  private async listImagesViaAPI(): Promise<any[]> {
    try {
      const { default: visionService } = await import('@/lib/services/visionService');
      return await visionService.listImages();
    } catch (error) {
      console.error('[HybridSearch] Erreur listImages:', error);
      return [];
    }
  }

  /**
   * Récupère les données d'une image via l'API
   */
  private async getImageDataViaAPI(imageId: string, includeImage: boolean = true): Promise<Record<string, any> | null> {
    if (this.imageCache.has(imageId)) {
      const cached = this.imageCache.get(imageId);
      // Si on a besoin de l'image mais qu'elle n'est pas dans le cache, on ignore le cache
      if (!includeImage || cached.image) {
        this.stats.cacheHits++;
        return cached;
      }
    }
    
    this.stats.cacheMisses++;
    try {
      const { default: visionService } = await import('@/lib/services/visionService');
      const imageData = await visionService.getImageData(imageId, includeImage);
      
      if (imageData) {
        this.imageCache.set(imageId, imageData);
        if (this.imageCache.size > 500) {
          const oldestKey = this.imageCache.keys().next().value;
          if (oldestKey) this.imageCache.delete(oldestKey);
        }
      }
      return imageData;
    } catch (error) {
      console.error('[HybridSearch] Erreur getImageData:', error);
      return null;
    }
  }

  /**
   * Construit l'index BM25 à partir de toutes les images
   */
  async buildTextIndex(): Promise<number> {
    console.log('[HybridSearch] 🔨 Construction de l\'index textuel...');
    
    this.db.innovations?.clearBM25Index?.();
    
    const images = await this.listImagesViaAPI();
    let indexedCount = 0;
    
    for (const image of images) {
      const textParts: string[] = [];
      if (image.filename) textParts.push(image.filename);
      if (image.description) textParts.push(image.description);
      if (image.tags && Array.isArray(image.tags)) textParts.push(...image.tags);
      if (image.location) textParts.push(image.location);
      
      const combinedText = textParts.join(' ');
      if (combinedText.trim().length > 0 && image.id) {
        await this.addDocumentToIndex(image.id, combinedText);
        indexedCount++;
      }
    }
    
    this.indexBuilt = true;
    await this.db.orchestration.stats.record('hybrid_search', 'index_size', indexedCount);
    await this.db.orchestration.stats.record('hybrid_search', 'index_rebuild', 1);
    
    console.log(`[HybridSearch] ✅ Index construit : ${indexedCount} documents (SQLite)`);
    return indexedCount;
  }

    /**
   * Indexe une image dans le système de recherche hybride
   * Cette méthode est appelée par registerImage dans visionService.ts
   */
   /**
   * 🔥 AMÉLIORÉ: Indexe une image avec extraction automatique de texte via DualConsensus
   * Le texte extrait enrichit les métadonnées (description, tags)
   * Cette méthode est appelée par registerImage dans visionService.ts
   */
  async indexImage(imageId: string, features: number[], visionData: VisionData): Promise<void> {
    const auditId = `IDX_${imageId.substring(0, 8)}`;
    console.group(`[HybridSearch][${auditId}] 📝 DÉBUT INDEXATION`);
    console.log(`[${auditId}] 📋 Métadonnées initiales:`, {
      filename: visionData.filename,
      descriptionLength: visionData.description?.length || 0,
      tagsCount: visionData.tags?.length || 0,
      hasFeatures: features?.length > 0,
      featuresDimension: features?.length || 0
    });
    
    try {
      // 🔥 ÉTAPE 0: Analyse profonde via CLOUD (Gemini) - Si activé et quota dispo
      if (this.config.enableCloudAnalysis) {
        const isQuotaAvailable = await quotaManager.isAvailable('gemini');
        if (isQuotaAvailable) {
          console.log(`[${auditId}] 🌐 ÉTAPE 0/4: Analyse profonde via Cloud (Gemini)...`);
          try {
            const visionService = (await import('@/lib/services/visionService')).default;
            const imageBuffer = await visionService.getImageBuffer(imageId);
            
            if (imageBuffer) {
              const base64Image = imageBuffer.toString('base64');
              const prompt = `
                Analyse cette image industrielle de haute précision.
                1. Donne une description technique détaillée (max 3 phrases).
                2. Identifie l'équipement, sa fonction et son état apparent.
                3. Liste 5-10 mots-clés techniques pertinents pour la recherche.
                
                FORMAT JSON ATTENDU :
                {
                  "description": "...",
                  "equipment": "...",
                  "tags": ["tag1", "tag2", ...]
                }
              `;
              
              const response = await callGemini(prompt, {
                images: [base64Image],
                model: 'gemini-1.5-flash',
                temperature: 0.2
              });
              
              const jsonMatch = response.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const cloudData = JSON.parse(jsonMatch[0]);
                console.log(`[${auditId}] ✅ Analyse Cloud réussie:`, cloudData);
                
                // Enrichir les métadonnées
                visionData.description = `${visionData.description || ''} | CLOUD: ${cloudData.description} (Equipement: ${cloudData.equipment})`;
                const existingTags = new Set(visionData.tags || []);
                if (Array.isArray(cloudData.tags)) {
                  cloudData.tags.forEach((t: string) => existingTags.add(t.toLowerCase()));
                }
                visionData.tags = Array.from(existingTags);
                
                // Mettre à jour en DB
                const visionServiceInst = (await import('@/lib/services/visionService')).default;
                await visionServiceInst.updateImageMetadata(imageId, {
                  description: visionData.description,
                  tags: visionData.tags,
                });
              }
            }
          } catch (cloudErr) {
            console.warn(`[${auditId}] ⚠️ Échec analyse Cloud:`, cloudErr);
          }
        } else {
          console.log(`[${auditId}] ⏭️ Analyse Cloud ignorée (quota épuisé ou Gemini indisponible)`);
        }
      }

      // 🔥 ÉTAPE 1: Extraction automatique du texte via Tesseract.js (OCR local)
      let extractedText = '';
      let ocrSuccess = false;
      
      if (this.config.enableDualConsensus) {
        console.log(`[${auditId}] 🤖 ÉTAPE 1/4: Extraction OCR via Tesseract.js...`);
        const ocrStart = Date.now();
        
        try {
          const visionService = (await import('@/lib/services/visionService')).default;
          const imageBuffer = await visionService.getImageBuffer(imageId);
          
          if (imageBuffer) {
            console.log(`[${auditId}] 📸 Buffer image obtenu: ${(imageBuffer.length / 1024).toFixed(1)} KB`);
            
            const ocrResult = await ocrService.extractText(imageBuffer);
            
            const ocrDuration = Date.now() - ocrStart;
            console.log(`[${auditId}] ⏱️ OCR terminé en ${ocrDuration}ms`);
            console.log(`[${auditId}] 📊 Résultat OCR:`, {
              textLength: ocrResult.text?.length || 0,
              confidence: `${ocrResult.confidence}%`,
              wordsCount: ocrResult.words?.length || 0,
              reliable: ocrResult.confidence > 50 ? '✅' : ocrResult.confidence > 30 ? '⚠️' : '❌'
            });
            
            if (ocrResult.text && ocrResult.text.length > 5 && ocrResult.confidence > 30) {
              extractedText = ocrResult.text;
              ocrSuccess = true;
              console.log(`[${auditId}] ✅ Texte extrait: "${extractedText.substring(0, 100)}${extractedText.length > 100 ? '...' : ''}"`);
              
              // 🔥 Enrichir description
              const oldDescription = visionData.description || '';
              if (!visionData.description) {
                visionData.description = extractedText;
                console.log(`[${auditId}] 📝 Description créée depuis OCR`);
              } else if (!visionData.description.includes(extractedText)) {
                visionData.description = `${visionData.description} | OCR: ${extractedText}`;
                console.log(`[${auditId}] 📝 Description enrichie (+${extractedText.length} chars)`);
              }
              
              // 🔥 Enrichir tags avec les mots extraits
              const tagsBefore = visionData.tags?.length || 0;
              const existingTags = new Set(visionData.tags || []);
              const newTags: string[] = [];
              
              // Ajouter les mots significatifs comme tags
              for (const word of ocrResult.words) {
                if (word.text.length > 2 && word.confidence > 50) {
                  if (!existingTags.has(word.text)) {
                    existingTags.add(word.text);
                    newTags.push(word.text);
                  }
                }
              }
              visionData.tags = Array.from(existingTags);
              if (newTags.length > 0) {
                console.log(`[${auditId}] 🏷️ Tags enrichis: ${tagsBefore} → ${visionData.tags.length} (+${newTags.length}: [${newTags.join(', ')}])`);
              }
              
              // 🔥 Persister dans la DB
              try {
                await visionService.updateImageMetadata(imageId, {
                  description: visionData.description,
                  tags: visionData.tags,
                });
                console.log(`[${auditId}] 💾 Métadonnées persistées en DB`);
              } catch (updateErr) {
                console.warn(`[${auditId}] ⚠️ Échec persistance métadonnées:`, updateErr);
              }
            } else {
              console.log(`[${auditId}] ⚠️ OCR sans résultat fiable (texte: ${ocrResult.text?.length || 0} chars, confiance: ${ocrResult.confidence}%)`);
            }
          } else {
            console.warn(`[${auditId}] ⚠️ Buffer image introuvable, OCR ignoré`);
          }
        } catch (ocrErr) {
          const ocrDuration = Date.now() - ocrStart;
          console.error(`[${auditId}] ❌ Échec OCR après ${ocrDuration}ms:`, ocrErr);
        }
      }

      // 🔥 ÉTAPE 2: Construction du texte pour BM25
      console.log(`[${auditId}] 📝 ÉTAPE 2/4: Construction texte BM25...`);
      const textParts: string[] = [];
      
      if (visionData.filename) textParts.push(visionData.filename);
      if (visionData.description) textParts.push(visionData.description);
      if (visionData.invocationKeywords) textParts.push(visionData.invocationKeywords);
      if (visionData.tags && Array.isArray(visionData.tags)) textParts.push(...visionData.tags);
      if (visionData.location) textParts.push(visionData.location);
      if (visionData.imageType) textParts.push(visionData.imageType);
      if (visionData.ocr_text) textParts.push(visionData.ocr_text);
      if ((visionData as any).ocrText) textParts.push((visionData as any).ocrText);
      
      // Indexer également les documents associés
      if (visionData.linkedDocumentIds && Array.isArray(visionData.linkedDocumentIds)) {
        textParts.push(...visionData.linkedDocumentIds);
      }
      if ((visionData as any).linked_document_ids && Array.isArray((visionData as any).linked_document_ids)) {
        textParts.push(...(visionData as any).linked_document_ids);
      }
      
      const combinedText = textParts.join(' ');

      console.log(`[${auditId}] 📊 Texte BM25: ${combinedText.length} caractères, ${textParts.length} segments`, {
        sources: {
          filename: !!visionData.filename,
          description: !!(visionData.description),
          tags: visionData.tags?.length || 0,
          location: !!visionData.location,
          ocrEnriched: ocrSuccess,
          linkedDocs: (visionData.linkedDocumentIds?.length || 0) + ((visionData as any).linked_document_ids?.length || 0)
        }
      });
      
      // 🔥 ÉTAPE 3: Index BM25
      console.log(`[${auditId}] 🔨 ÉTAPE 3/4: Index BM25...`);
      const bm25Start = Date.now();
      
      if (combinedText.trim().length > 0) {
        await this.addDocumentToIndex(imageId, combinedText);
        const bm25Duration = Date.now() - bm25Start;
        console.log(`[${auditId}] ✅ BM25 indexé en ${bm25Duration}ms (${combinedText.length} caractères)`);
      } else {
        console.warn(`[${auditId}] ⚠️ Aucun texte à indexer, BM25 ignoré`);
      }
      
      // 🔥 ÉTAPE 4: Index vectoriel ChromaDB
      console.log(`[${auditId}] 🧬 ÉTAPE 4/4: Index vectoriel ChromaDB...`);
      const chromaStart = Date.now();
      
      if (features && features.length > 0) {
        try {
          await chromaDBManager.upsertDocuments('VISION', [{
            id: `vision_${imageId}`,
            content: combinedText,
            metadata: {
              id: imageId,
              filename: visionData.filename || '',
              description: visionData.description || '',
              tags: JSON.stringify(visionData.tags || []),
              folderId: visionData.folderId || 'root',
              ocr_text: visionData.ocr_text || (visionData as any).ocrText || '',
              file_hash: visionData.fileHash || (visionData as any).file_hash || '',
              date: visionData.date || visionData.createdAt || new Date().toISOString(),
              linkedDocumentIds: JSON.stringify(visionData.linkedDocumentIds || (visionData as any).linked_document_ids || [])
            },
            embedding: features
          }]);
          const chromaDuration = Date.now() - chromaStart;
          console.log(`[${auditId}] ✅ ChromaDB indexé en ${chromaDuration}ms (dimension ${features.length})`);
        } catch (chromaErr) {
          const chromaDuration = Date.now() - chromaStart;
          console.error(`[${auditId}] ❌ Échec ChromaDB après ${chromaDuration}ms:`, chromaErr);
        }

        // Cache fallback SQLite
        this.db.set('vision_features', imageId, features, 86400 * 30);
        console.log(`[${auditId}] 💾 Features sauvegardées en cache SQLite (30 jours)`);
      } else {
        console.warn(`[${auditId}] ⚠️ Pas de features, ChromaDB ignoré`);
      }
      
      // Métriques
      await this.db.orchestration.stats.record('hybrid_search', 'index_image_count', 1);
      if (ocrSuccess) {
        await this.db.orchestration.stats.record('hybrid_search', 'ocr_enriched_count', 1);
      }
      
      console.log(`[${auditId}] ✅ INDEXATION TERMINÉE`, {
        ocrEnriched: ocrSuccess,
        bm25Indexed: combinedText.trim().length > 0,
        chromaDBIndexed: features?.length > 0,
        totalTags: visionData.tags?.length || 0
      });
      console.groupEnd();
      
    } catch (error) {
      console.error(`[${auditId}] 💥 ERREUR CRITIQUE INDEXATION:`, error);
      console.groupEnd();
    }
  }

  /**
   * Recherche textuelle pure (via BM25 SQLite)
   */
  private async textSearch(query: string, limit: number): Promise<TextMatch[]> {
    if (!this.indexBuilt) await this.buildTextIndex();
    
    const results = await this.bm25Search(query, limit * 2);
    const matches: TextMatch[] = [];
    
    for (const result of results) {
      const imageData = await this.getImageDataViaAPI(result.id, false);
      if (imageData) {
        const matchedFields: string[] = [];
        const queryLower = query.toLowerCase();
        
        if (imageData.filename?.toLowerCase().includes(queryLower)) matchedFields.push('filename');
        if (imageData.description?.toLowerCase().includes(queryLower)) matchedFields.push('description');
        if (imageData.tags?.some((t: string) => t.toLowerCase().includes(queryLower))) matchedFields.push('tags');
        
        matches.push({
          id: result.id,
          score: result.score,
          metadata: {
            filename: imageData.filename || '',
            date: imageData.date || imageData.createdAt || '',
            tags: imageData.tags || [],
            description: imageData.description || '',
            folderId: imageData.folderId,
          },
          matchedFields,
        });
      }
    }
    return matches;
  }

  /**
   * Fusionne les résultats visuels et textuels
   */
  private fuseResults(
    visionMatches: VisionMatch[],
    textMatches: TextMatch[],
    visionWeight: number,
    textWeight: number
  ): HybridSearchResult[] {
    const combinedScores: Map<string, { visionScore: number; textScore: number }> = new Map();
    
    for (const match of visionMatches) {
      combinedScores.set(match.id, { visionScore: match.similarity, textScore: 0 });
    }
    for (const match of textMatches) {
      const existing = combinedScores.get(match.id);
      if (existing) existing.textScore = match.score;
      else combinedScores.set(match.id, { visionScore: 0, textScore: match.score });
    }
    
    const results: HybridSearchResult[] = [];
    for (const [id, scores] of combinedScores.entries()) {
      const visionMatch = visionMatches.find(m => m.id === id);
      const textMatch = textMatches.find(m => m.id === id);
      
      results.push({
        id,
        visionSimilarity: scores.visionScore,
        textSimilarity: scores.textScore,
        combinedScore: (scores.visionScore * visionWeight) + (scores.textScore * textWeight),
        metadata: {
          filename: visionMatch?.metadata?.filename || textMatch?.metadata?.filename || '',
          description: visionMatch?.metadata?.description || textMatch?.metadata?.description || '',
          tags: visionMatch?.metadata?.tags || textMatch?.metadata?.tags || [],
          folderId: visionMatch?.metadata?.folderId || textMatch?.metadata?.folderId || '',
          date: visionMatch?.metadata?.date || textMatch?.metadata?.date || '',
        },
        matchedTextFields: textMatch?.matchedFields || [],
      });
    }
    
    results.sort((a, b) => b.combinedScore - a.combinedScore);
    return results;
  }

  /**
   * Calcule le score de confiance pour un résultat
   */
  private calculateConfidenceScore(result: HybridSearchResult): { 
    score: number; 
    level: 'high' | 'medium' | 'low'; 
    recommendation: 'trust' | 'verify' | 'reject'
  } {
    const { combinedScore, visionSimilarity, textSimilarity, matchedTextFields } = result;
    let baseScore = combinedScore;
    if (visionSimilarity >= 0.95) baseScore = Math.max(baseScore, 0.95);
    if (textSimilarity >= 0.8 && matchedTextFields.length > 0) baseScore = Math.min(baseScore + 0.1, 1.0);
    
    let level: 'high' | 'medium' | 'low';
    let recommendation: 'trust' | 'verify' | 'reject';
    
    if (baseScore >= this.config.certaintyThreshold) { level = 'high'; recommendation = 'trust'; }
    else if (baseScore >= this.config.minCombinedScore) { level = 'medium'; recommendation = 'verify'; }
    else { level = 'low'; recommendation = 'reject'; }

    
    return { score: baseScore, level, recommendation };
  }

  /**
   * Récupère les préférences utilisateur
   */
  private async getUserPreferences(sessionId: string): Promise<Record<string, any> | null> {
    try {
      const row = this.db.getDB().prepare(`
        SELECT preferred_tags, preferred_zones, preferred_equipment_types, search_history
        FROM user_search_preferences WHERE session_id = ?
      `).get(sessionId) as { preferred_tags: string; preferred_zones: string; preferred_equipment_types: string; search_history: string } | undefined;
      
      if (!row) return null;
      return {
        preferredTags: JSON.parse(row.preferred_tags),
        preferredZones: JSON.parse(row.preferred_zones),
        preferredEquipmentTypes: JSON.parse(row.preferred_equipment_types),
        searchHistory: JSON.parse(row.search_history)
      };
    } catch { return null; }
  }

  /**
   * Récupère les filtres disponibles
   */
  async getAvailableFilters(): Promise<AvailableFilters> {
    const foldersResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/vision/folders`);
    const foldersData = foldersResponse.ok ? await foldersResponse.json() : { folders: [] };
    const folders = Array.isArray(foldersData.folders) ? foldersData.folders : [];
    
    return {
      folders: folders.map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })),
      zones: ['zone_A', 'zone_B', 'zone_C'],
      equipmentTypes: ['pompe', 'vanne', 'compresseur', 'moteur', 'turbine'],
      tags: ['industriel', 'equipement', 'maintenance', 'inspection']
    };
  }

  /**
   * Recherche enrichie avec affinage
   */
  async enhancedSearch(params: EnrichedHybridSearchParams): Promise<{
    results: EnrichedSearchResult[];
    filters: AvailableFilters;
    metadata: SearchMetadata;
  }> {
    const startTime = Date.now();
    const filtersApplied: string[] = [];
    let confidenceBoostApplied = false;
    let personalizationApplied = false;
    
    const availableFilters = await this.getAvailableFilters();
    
    const baseResult = await this.search({
      imageBuffer: params.imageBuffer,
      textQuery: params.textQuery,
      visionWeight: params.visionWeight,
      textWeight: params.textWeight,
      threshold: params.threshold || 0.5,
      maxResults: params.maxResults || 50,
    });
    
    let results = baseResult.results;
    
    if (params.filterFolder) {
      results = results.filter(r => r.metadata.folderId === params.filterFolder);
      filtersApplied.push(`folder:${params.filterFolder}`);
    }
    if (params.filterTags?.length) {
      results = results.filter(r => r.metadata.tags?.some(t => params.filterTags!.includes(t)));
      filtersApplied.push(`tags:${params.filterTags.join(',')}`);
    }
    
    if (params.minConfidence !== undefined && params.minConfidence !== null) {
      results = results.filter(r => (r.combinedScore) >= params.minConfidence!);
      filtersApplied.push(`minConfidence:${params.minConfidence}`);
      confidenceBoostApplied = true;
    }
    
    if (params.sortBy === 'date') {
      results.sort((a, b) => new Date(b.metadata.date).getTime() - new Date(a.metadata.date).getTime());
    } else if (params.sortBy === 'confidence') {
      results.sort((a, b) => b.combinedScore - a.combinedScore);
    }
    
    const enrichedResults: EnrichedSearchResult[] = await Promise.all(
      results.map(async (result) => {
        const confidence = this.calculateConfidenceScore(result);
        
        let usageCount = 0;
        try {
          const usage = this.db.getDB().prepare(`
            SELECT usageCount FROM cache_permanent_entries WHERE hash = ?
          `).get(result.id) as { usageCount: number } | undefined;
          usageCount = usage?.usageCount || 0;
        } catch { usageCount = 0; }
        
        return {
          ...result,
          confidenceScore: confidence.score,
          confidenceLevel: confidence.level,
          confidenceRecommendation: confidence.recommendation,
          usageCount,
          relevanceScore: result.combinedScore
        };
      })
    );
    
    let finalResults = enrichedResults;
    if (params.useUserHistory && params.sessionId && this.config.enablePersonalization) {
      const userPrefs = await this.getUserPreferences(params.sessionId);
      if (userPrefs && userPrefs.preferredTags.length > 0) {
        finalResults = enrichedResults.map(r => ({
          ...r,
          relevanceScore: (r.combinedScore * 0.7) + 
            (r.metadata.tags?.some((t: string) => userPrefs.preferredTags.includes(t)) ? 0.3 : 0)
        })).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
        personalizationApplied = true;
      }
    }
    
    if (params.recordFeedback && params.sessionId) {
      try {
        this.db.getDB().prepare(`
          INSERT OR REPLACE INTO user_search_preferences (session_id, search_history, last_updated)
          VALUES (?, ?, ?)
        `).run(params.sessionId, JSON.stringify([{
          query: params.textQuery,
          timestamp: Date.now(),
          resultsCount: finalResults.length
        }]), Date.now());
      } catch (error) {
        console.error('[HybridSearch] Erreur enregistrement recherche:', error);
      }
      this.stats.personalizedSearches++;
    }
    
    const limitedResults = finalResults.slice(0, params.maxResults || this.config.maxResults);
    
    return {
      results: limitedResults,
      filters: availableFilters,
      metadata: {
        durationMs: Date.now() - startTime,
        searchMode: baseResult.searchMode,
        totalResults: finalResults.length,
        filtersApplied,
        confidenceBoostApplied,
        personalizationApplied
      }
    };
  }

  /**
   * Recherche hybride (vision + texte) - Méthode de base
   */
  async search(params: HybridVisionSearchParams): Promise<{
    results: HybridSearchResult[];
    searchMode: 'vision' | 'text' | 'hybrid';
    params: { visionWeight: number; textWeight: number; threshold: number };
  }> {
    const {
      imageBuffer,
      textQuery,
      visionWeight = this.config.defaultVisionWeight,
      textWeight = this.config.defaultTextWeight,
      threshold = this.config.minCombinedScore,

      maxResults = this.config.maxResults,
      filterFolder,
      filterTags,
    } = params;
    
    console.log('[HybridSearch] 🔍 Recherche hybride...');
    this.stats.searches++;
    
    let visionMatches: VisionMatch[] = [];
    let textMatches: TextMatch[] = [];
    let searchMode: 'vision' | 'text' | 'hybrid' = 'hybrid';
    
    if (visionWeight > 0 && imageBuffer) {
      visionMatches = await this.visionSearchViaAPI(imageBuffer, threshold, maxResults);
    }
    if (textWeight > 0 && textQuery) {
      textMatches = await this.textSearch(textQuery, maxResults);
    }
    
    if (visionMatches.length > 0 && textMatches.length > 0) searchMode = 'hybrid';
    else if (visionMatches.length > 0) searchMode = 'vision';
    else if (textMatches.length > 0) searchMode = 'text';
    
    let results = this.fuseResults(visionMatches, textMatches, visionWeight, textWeight);
    
    if (filterFolder) results = results.filter(r => r.metadata.folderId === filterFolder);
    if (filterTags?.length) results = results.filter(r => r.metadata.tags?.some(t => filterTags.includes(t)));
    
    results = results.filter(r => r.combinedScore >= threshold);

    results = results.slice(0, maxResults);

    // 🔥 NOUVEAU: Enrichissement profond pour les meilleurs résultats (Top 3)
    if (this.config.enableDeepEnrichment && imageBuffer && results.length > 0) {
      console.log(`[HybridSearch] 🧠 Enrichissement profond pour les ${Math.min(3, results.length)} meilleurs résultats...`);
      const enrichedResults = await Promise.all(
        results.slice(0, 3).map(r => unifiedComparator.enrichResult(r, imageBuffer))
      );
      // Remplacer les 3 premiers par les versions enrichies
      for (let i = 0; i < enrichedResults.length; i++) {
        results[i] = enrichedResults[i];
      }
      // Re-trier si les scores ont changé significativement
      results.sort((a, b) => b.combinedScore - a.combinedScore);
    }

    // 🔥 NOUVEAU: MLLM Re-Ranking (Innovation Finale)
    if (this.config.enableMLLMReRanking && imageBuffer && results.length > 0) {
      const rerankStart = Date.now();
      console.log(`[HybridSearch] 🚀 Lancement du MLLM Re-Ranking sur le top ${Math.min(20, results.length)}...`);
      
      try {
        const topBefore = results[0]?.metadata?.filename;
        const rerankedResults = await mllmReRanker.reRankResults(imageBuffer, results, textQuery || undefined);
        results = rerankedResults;
        this.stats.mllmReRankedSearches++;
        
        const duration = Date.now() - rerankStart;
        console.log(`[HybridSearch] ✅ MLLM Re-Ranking terminé en ${duration}ms`);
        
        // Log structuré des top résultats
        console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
        console.log('│ 🧠 RÉSULTATS RE-RANKÉS (TOP 5)                                               │');
        console.log('├───────────────────────┬───────────────┬───────────────┬──────────────────────┤');
        console.log('│ Fichier               │ Score Orig.   │ Score MLLM    │ Changement           │');
        console.log('├───────────────────────┼───────────────┼───────────────┼──────────────────────┤');
        results.slice(0, 5).forEach(r => {
          const name = (r.metadata.filename || r.id).substring(0, 21).padEnd(21);
          const orig = (r.visionSimilarity || 0).toFixed(3).padEnd(13);
          const mllm = (r.mllmScore || 0).toFixed(3).padEnd(13);
          const change = r.mllmReRanked ? '✅ Re-Ranked' : ' - ';
          console.log(`│ ${name} │ ${orig} │ ${mllm} │ ${change}      │`);
        });
        console.log('└───────────────────────┴───────────────┴───────────────┴──────────────────────┘');
        
        if (topBefore !== results[0]?.metadata?.filename) {
          console.log(`[HybridSearch] 🎯 NOUVEAU MEILLEUR RÉSULTAT : ${topBefore} ➔ ${results[0]?.metadata?.filename}`);
        }
      } catch (err) {
        console.error('[HybridSearch] ❌ Échec du MLLM Re-Ranking:', err);
        // On continue avec les résultats originaux
      }
    }
    
    await this.db.recordMetric('hybrid_search', 'search_count', 1);

    await this.db.recordMetric('hybrid_search', 'results_count', results.length);
    
    console.log(`[HybridSearch] ✅ ${results.length} résultats (mode: ${searchMode})`);
    return { results, searchMode, params: { visionWeight, textWeight, threshold } };
  }

  /**
   * 🔥 AMÉLIORÉ: Recherche par image avec extraction de texte via DualConsensus
   * Combine la similarité visuelle ET la recherche textuelle sur les métadonnées
   */
  async searchByImage(imageBuffer: Buffer, options?: { threshold?: number; maxResults?: number }): Promise<HybridSearchResult[]> {
    // Extraire le texte de l'image via DualConsensus (OCR IA)
    let extractedText = '';
    if (this.config.enableDualConsensus) {
      extractedText = await this.extractTextFromImage(imageBuffer);
    }
    
    // Poids : 40% vision, 60% texte (privilégier les métadonnées)
    const result = await this.search({
      imageBuffer,
      textQuery: extractedText || undefined,
      visionWeight: extractedText ? 0.4 : 1.0,  // Si pas de texte extrait, 100% vision
      textWeight: extractedText ? 0.6 : 0.0,
      threshold: options?.threshold,
      maxResults: options?.maxResults,
    });
    return result.results;
  }

  /**
   * Recherche des images similaires à partir d'un ID existant
   */
  async searchSimilarById(imageId: string, options?: { threshold?: number; maxResults?: number }): Promise<HybridSearchResult[]> {
    try {
      const visionService = (await import('@/lib/services/visionService')).default;
      const buffer = await visionService.getImageBuffer(imageId);
      if (!buffer) throw new Error('Image source introuvable');
      
      // On exclut l'image elle-même des résultats
      const results = await this.searchByImage(buffer, options);
      return results.filter(r => r.id !== imageId && r.id !== `vision_${imageId}`);
    } catch (error) {
      console.error('[HybridSearch] Erreur searchSimilarById:', error);
      return [];
    }
  }

  async searchByText(textQuery: string, options?: { maxResults?: number; filterFolder?: string }): Promise<HybridSearchResult[]> {
    const dummyBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const result = await this.search({
      imageBuffer: dummyBuffer,
      textQuery,
      visionWeight: 0.0,
      textWeight: 1.0,
      maxResults: options?.maxResults,
      filterFolder: options?.filterFolder,
    });
    return result.results;
  }

  async rebuildIndex(): Promise<number> {
    return this.buildTextIndex();
  }

  async addToIndex(imageId: string, text: string): Promise<void> {
    await this.addDocumentToIndex(imageId, text);
    await this.db.recordMetric('hybrid_search', 'index_increment', 1);
    console.log(`[HybridSearch] 📝 Image ${imageId} ajoutée à l'index`);
  }

  async removeFromIndex(imageId: string): Promise<void> {
    await this.removeDocumentFromIndex(imageId);
    console.log(`[HybridSearch] 🗑️ Image ${imageId} supprimée de l'index`);
  }

  updateConfig(updates: Partial<typeof DEFAULT_CONFIG>): void {
    this.config = { ...this.config, ...updates };
    console.log('[HybridSearch] Configuration mise à jour');
  }

  async getStats(): Promise<HybridSearchStats> {
    let indexSize = 0;
    try {
      const size = this.db.getDB().prepare(`SELECT COUNT(DISTINCT document_id) as count FROM innovation_bm25_index`).get() as { count: number };
      indexSize = size?.count || 0;
    } catch { indexSize = 0; }
    
    const totalRequests = this.stats.cacheHits + this.stats.cacheMisses;
    const cacheHitRate = totalRequests > 0 ? this.stats.cacheHits / totalRequests : 0;
    
    return {
      indexSize,
      config: this.config,
      initialized: this.indexBuilt,
      searchesCount: this.stats.searches,
      personalizedSearchesCount: this.stats.personalizedSearches,
      dualConsensusSearchesCount: this.stats.dualConsensusSearches,
      mllmReRankedSearchesCount: this.stats.mllmReRankedSearches,
      cacheHitRate
    };
  }
}

// Export singleton
export const hybridVisionSearch = new HybridVisionSearch();