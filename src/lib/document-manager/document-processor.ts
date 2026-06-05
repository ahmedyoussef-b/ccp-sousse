/**
 * @fileOverview DocumentProcessor - Service d'orchestration du traitement documentaire amélioré.
 * Gère l'extraction (OCR via OCR.space API, PDF, Office, Archives, CAD),
 * le chunking intelligent et l'enrichissement des métadonnées industrielles.
 * Version 3.4 - Intégration automatique de l'index inversé post-indexation
 */

import { readFile } from 'fs/promises';
import path from 'path';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import { ChromaDBManager } from '@/ai/vector/chromadb-manager';
import { type CollectionName, type ZoneType } from '@/ai/vector/chromadb-schema';
import { OCRSpaceService } from './ocrspace-service';
import { invertedIndexService } from '@/ai/search/inverted-index.service';
import { 
  getExtractorType, 
  generateDocumentId,
  getNormalizedExtension,
  getMaxFileSize,
  INDEXING_CONFIG,
  type ExtractorType,
  type DocumentMetadata,
  type ProcessingResult
} from './config';

// ============================================================================
// LOGS STRUCTURÉS POUR DIAGNOSTIC
// ============================================================================

const LOG_SEPARATOR = '═'.repeat(70);
const LOG_SUBSEPARATOR = '─'.repeat(50);

function logExtractionStep(step: string, data: Record<string, any>): void {
  console.log(`\n${LOG_SUBSEPARATOR}`);
  console.log(`📄 [EXTRACTION] ${step}`);
  for (const [key, value] of Object.entries(data)) {
    const displayValue = typeof value === 'string' && value.length > 200 
      ? value.substring(0, 200) + '...' 
      : value;
    console.log(`   ├─ ${key}: ${displayValue}`);
  }
  console.log(LOG_SUBSEPARATOR);
}

function logExtractionSuccess(fileName: string, contentLength: number, method: string): void {
  console.log(`\n${LOG_SEPARATOR}`);
  console.log(`✅ [EXTRACTION] SUCCÈS - ${fileName}`);
  console.log(`   ├─ Méthode: ${method}`);
  console.log(`   ├─ Longueur: ${contentLength} caractères`);
  console.log(`   ├─ Qualité: ${contentLength > 1000 ? 'BONNE' : contentLength > 100 ? 'MOYENNE' : 'FAIBLE'}`);
  console.log(`   └─ Statut: PRÊT POUR VECTORISATION`);
  console.log(LOG_SEPARATOR);
}

function logExtractionError(fileName: string, error: string): void {
  console.log(`\n${LOG_SEPARATOR}`);
  console.log(`❌ [EXTRACTION] ÉCHEC - ${fileName}`);
  console.log(`   ├─ Erreur: ${error}`);
  console.log(`   └─ Action: Vérifier le format du fichier`);
  console.log(LOG_SEPARATOR);
}

function logIndexingStep(step: string, data: Record<string, any>): void {
  console.log(`\n${LOG_SUBSEPARATOR}`);
  console.log(`🔷 [INDEXATION] ${step}`);
  for (const [key, value] of Object.entries(data)) {
    console.log(`   ├─ ${key}: ${value}`);
  }
  console.log(LOG_SUBSEPARATOR);
}

function logIndexingSuccess(fileName: string, chunksCount: number, duration: number): void {
  console.log(`\n${LOG_SEPARATOR}`);
  console.log(`✅ [INDEXATION] SUCCÈS - ${fileName}`);
  console.log(`   ├─ Chunks indexés: ${chunksCount}`);
  console.log(`   ├─ Durée: ${duration}ms`);
  console.log(`   └─ Statut: DISPONIBLE POUR RAG`);
  console.log(LOG_SEPARATOR);
}

function logInvertedIndexSuccess(fileName: string, termsCount: number): void {
  console.log(`\n${LOG_SUBSEPARATOR}`);
  console.log(`📚 [INVERTED-INDEX] INDEXATION RÉUSSIE - ${fileName}`);
  console.log(`   ├─ Termes uniques indexés: ${termsCount}`);
  console.log(`   └─ Statut: DISPONIBLE POUR RECHERCHE LEXICALE`);
  console.log(LOG_SUBSEPARATOR);
}

function logInvertedIndexError(fileName: string, error: string): void {
  console.log(`\n${LOG_SUBSEPARATOR}`);
  console.log(`⚠️ [INVERTED-INDEX] ÉCHEC - ${fileName}`);
  console.log(`   ├─ Erreur: ${error}`);
  console.log(`   └─ Action: L'index inversé sera mis à jour manuellement`);
  console.log(LOG_SUBSEPARATOR);
}

// Types pour les modules optionnels
let mammoth: any = null;
let xlsx: any = null;
let admZip: any = null;
let sharp: any = null;

async function loadOptionalDependencies() {
  if (!mammoth) {
    try {
      const mammothModule = await import('mammoth');
      mammoth = mammothModule.default;
      console.log('[PROCESSOR] mammoth chargé');
    } catch (e) { 
      console.log('[PROCESSOR] mammoth non disponible'); 
    }
  }
  if (!xlsx) {
    try {
      const xlsxModule = await import('xlsx');
      xlsx = xlsxModule.default;
      console.log('[PROCESSOR] xlsx chargé');
    } catch (e) { 
      console.log('[PROCESSOR] xlsx non disponible'); 
    }
  }
  if (!admZip) {
    try {
      const admZipModule = await import('adm-zip');
      admZip = admZipModule.default;
      console.log('[PROCESSOR] adm-zip chargé');
    } catch (e) { 
      console.log('[PROCESSOR] adm-zip non disponible'); 
    }
  }
  if (!sharp) {
    try {
      const sharpModule = await import('sharp');
      sharp = sharpModule.default;
      console.log('[PROCESSOR] sharp chargé');
    } catch (e) { 
      console.log('[PROCESSOR] sharp non disponible'); 
    }
  }
}

export class DocumentProcessor {
  private chromaManager: ChromaDBManager;
  private ocrService: OCRSpaceService;
  private onProgress?: (stage: string, percent: number, detail?: string) => void;
  private dependenciesLoaded = false;
  
  constructor(onProgress?: (stage: string, percent: number, detail?: string) => void) {
    this.chromaManager = ChromaDBManager.getInstance();
    this.ocrService = OCRSpaceService.getInstance();
    this.onProgress = onProgress;
  }
  
  async processDocument(filePath: string, customCollectionOrOptions?: string | {
    collection?: string;
    zone?: ZoneType;
    documentType?: string;
    forceReindex?: boolean;
    maxChunks?: number;
    skipCompression?: boolean;
    validChunksOnly?: number[];
    skipInvertedIndex?: boolean;
  }): Promise<ProcessingResult> {
    let collection: string | undefined;
    let zone: ZoneType | undefined;
    let documentType: string | undefined;
    let forceReindex = false;
    let maxChunks: number | undefined;
    let skipCompression = false;
    let validChunksOnly: number[] | undefined;
    let skipInvertedIndex = false;

    if (typeof customCollectionOrOptions === 'string') {
      collection = customCollectionOrOptions;
    } else if (customCollectionOrOptions) {
      collection = customCollectionOrOptions.collection;
      zone = customCollectionOrOptions.zone;
      documentType = customCollectionOrOptions.documentType;
      forceReindex = customCollectionOrOptions.forceReindex || false;
      maxChunks = customCollectionOrOptions.maxChunks;
      skipCompression = customCollectionOrOptions.skipCompression || false;
      validChunksOnly = customCollectionOrOptions.validChunksOnly;
      skipInvertedIndex = customCollectionOrOptions.skipInvertedIndex || false;
    }

    return this.processDocumentInternal(filePath, {
      collection,
      zone,
      documentType,
      forceReindex,
      maxChunks,
      skipCompression,
      validChunksOnly,
      skipInvertedIndex
    });
  }

  private async processDocumentInternal(
    filePath: string,
    options: {
      collection?: string;
      zone?: ZoneType;
      documentType?: string;
      forceReindex?: boolean;
      maxChunks?: number;
      skipCompression?: boolean;
      validChunksOnly?: number[];
      skipInvertedIndex?: boolean;
    }
  ): Promise<ProcessingResult> {
    await this.ensureDependencies();
    
    const startTime = Date.now();
    const fileName = path.basename(filePath);
    const extension = getNormalizedExtension(filePath);
    const fileSize = fs.statSync(filePath).size;
    const maxSize = getMaxFileSize(filePath);
    
    console.log(`\n${LOG_SEPARATOR}`);
    console.log(`🚀 [PROCESSOR] DÉBUT TRAITEMENT`);
    console.log(`📁 Fichier: ${fileName}`);
    console.log(`📏 Taille: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📄 Extension: .${extension}`);
    console.log(`🎯 Zone: ${options.zone || 'auto'}`);
    console.log(`${LOG_SEPARATOR}`);
    
    this.onProgress?.('Analyse du document', 5, `Fichier: ${fileName}`);
    
    if (fileName.includes('_compressed')) {
      console.log(`[PROCESSOR] ⏭️ Fichier compressé ignoré`);
      return {
        success: true,
        documentId: generateDocumentId(filePath),
        collection: options.collection || 'SHARED',
        chunksCount: 0,
        processingTime: Date.now() - startTime,
        metadata: {} as DocumentMetadata
      };
    }
    
    if (fileSize > maxSize) {
      throw new Error(`Fichier trop volumineux (${(fileSize / 1024 / 1024).toFixed(2)}MB). Maximum: ${(maxSize / 1024 / 1024).toFixed(0)}MB`);
    }
    
    let content = '';
    let extractionMetadata: Record<string, any> = {};
    const extractorType = getExtractorType(filePath);
    
    try {
      // ============================================
      // PHASE 1 : EXTRACTION DU CONTENU
      // ============================================
      this.onProgress?.('Extraction du contenu', 10, `Type: ${extractorType || 'inconnu'}`);
      
      logExtractionStep('DÉBUT EXTRACTION', {
        fichier: fileName,
        type: extractorType || 'unknown',
        taille: `${(fileSize / 1024 / 1024).toFixed(2)} MB`
      });
      
      const extractionResult = await this.extractContent(filePath, extension, extractorType, { skipCompression: options.skipCompression });
      content = extractionResult.content;
      extractionMetadata = extractionResult.metadata;
      
      // Log du résultat d'extraction
      logExtractionSuccess(fileName, content.length, extractionMetadata.extractor || 'unknown');
      
      // Détail de la qualité d'extraction
      if (extension === 'pdf') {
        const wordCount = content.split(/\s+/).length;
        const charCount = content.length;
        console.log(`   📊 Statistiques extraction PDF:`);
        console.log(`      ├─ Mots: ${wordCount}`);
        console.log(`      ├─ Caractères: ${charCount}`);
        console.log(`      ├─ Pages: ${extractionMetadata.pages || '?'}`);
        console.log(`      └─ Ratio texte/taille: ${(charCount / fileSize * 100).toFixed(1)}%`);
      }
      
      if (!content || !content.trim()) {
        console.warn(`[PROCESSOR] ⚠️ Contenu vide pour ${fileName}`);
        content = this.generateFallbackContent(fileName, extension, extractionMetadata);
      }
      
      // ============================================
      // PHASE 2 : CHUNKING STRUCTUREL
      // ============================================
      this.onProgress?.('Découpage structurel', 20, 'Détection des sections');
      const structuralChunks = this.structureAwareChunking(content);
      console.log(`[PROCESSOR] Phase 1 - Structure-Aware: ${structuralChunks.length} sections`);
      
      // ============================================
      // PHASE 3 : RAFFINEMENT SÉMANTIQUE
      // ============================================
      this.onProgress?.('Raffinement sémantique', 30, 'Découpage des sections longues');
      const refinedChunks = await this.maxMinSemanticRefinement(structuralChunks);
      console.log(`[PROCESSOR] Phase 2 - Raffinement: ${refinedChunks.length} chunks`);
      
      // ============================================
      // PHASE 4 : LATE CHUNKING
      // ============================================
      this.onProgress?.('Préservation du contexte', 40, 'Génération embedding document');
      const docEmbedding = await this.getDocumentEmbedding(content);
      const contextualChunks = refinedChunks.map(chunk => ({
        content: chunk.content,
        parentEmbedding: docEmbedding,
        metadata: chunk.metadata
      }));
      
      // ============================================
      // PHASE 5 : ENRICHISSEMENT MÉTADONNÉES
      // ============================================
      this.onProgress?.('Enrichissement métadonnées', 50, 'Détection automatique');
      const docType = this.detectDocumentType(fileName, content);
      const enrichedChunks = contextualChunks.map((chunk, idx) => ({
        content: chunk.content,
        metadata: {
          ...chunk.metadata,
          docType,
          sectionType: this.inferSectionType(chunk.content),
          isAtomic: true,
          parentEmbedding: chunk.parentEmbedding,
          chunk_index: idx,
          chunk_total: contextualChunks.length
        }
      }));
      
      let finalChunks = enrichedChunks.map(c => c.content);
      let finalChunksMetadata = enrichedChunks.map(c => c.metadata);
      
      // ============================================
      // PHASE 6 : FILTRAGE VALIDATION
      // ============================================
      if (options.validChunksOnly && options.validChunksOnly.length > 0) {
        const validSet = new Set(options.validChunksOnly);
        const filteredChunks: string[] = [];
        const filteredMetadata: any[] = [];
        
        for (let i = 0; i < finalChunks.length; i++) {
          if (validSet.has(i)) {
            filteredChunks.push(finalChunks[i]);
            filteredMetadata.push(finalChunksMetadata[i]);
          }
        }
        
        console.log(`[PROCESSOR] 🔥 Filtrage validation: ${finalChunks.length} → ${filteredChunks.length} chunks`);
        finalChunks = filteredChunks;
        finalChunksMetadata = filteredMetadata;
      }
      
      const finalChunksLimited = options.maxChunks ? finalChunks.slice(0, options.maxChunks) : finalChunks;
      
      // ============================================
      // PHASE 7 : DÉTERMINATION COLLECTION
      // ============================================
      let collectionName: string;
      if (options.collection) {
        collectionName = options.collection;
      } else if (options.zone) {
        collectionName = options.zone;
      } else {
        collectionName = this.getCollectionFromPath(filePath);
      }
      
      const documentId = generateDocumentId(filePath);
      console.log(`[PROCESSOR] Collection: ${collectionName}, ID: ${documentId}`);
      
      // ============================================
      // PHASE 8 : ENRICHISSEMENT MÉTADONNÉES FINAL
      // ============================================
      const enrichedMetadata = await this.enrichMetadata({
        id: documentId,
        titre: fileName,
        filePath,
        content,
        extension,
        fileSize,
        extractionMetadata,
        collection: collectionName,
        explicitZone: options.zone,
        explicitType: options.documentType
      });
      
      (enrichedMetadata as any).chunkingStrategy = 'universal_4_phases';
      (enrichedMetadata as any).docType = docType;
      (enrichedMetadata as any).extractionQuality = content.length > 1000 ? 'good' : content.length > 100 ? 'medium' : 'poor';
      (enrichedMetadata as any).extractedTextLength = content.length;
      
      // ============================================
      // PHASE 9 : INDEXATION VECTORIELLE (CHROMADB)
      // ============================================
      this.onProgress?.('Indexation vectorielle', 70, `${finalChunksLimited.length} chunks`);
      
      logIndexingStep('DÉBUT INDEXATION', {
        fichier: fileName,
        chunks: finalChunksLimited.length,
        collection: collectionName
      });
      
      await this.indexDocumentWithChunkMetadata(
        collectionName as CollectionName,
        documentId,
        finalChunksLimited,
        finalChunksMetadata,
        enrichedMetadata,
        options.forceReindex || false
      );
      
      const processingTime = Date.now() - startTime;
      
      logIndexingSuccess(fileName, finalChunksLimited.length, processingTime);
      
      // ============================================
      // PHASE 10 : INDEXATION DANS L'INDEX INVERSÉ (AUTOMATIQUE)
      // ============================================
      let invertedIndexTermsCount = 0;
      let invertedIndexSuccess = false;
      
      if (!options.skipInvertedIndex && content && content.trim().length > 0) {
        this.onProgress?.('Indexation lexicale', 90, 'Mise à jour index inversé');
        
        try {
          console.log(`\n[PROCESSOR] 📚 Début indexation dans l'index inversé pour: ${fileName}`);
          
          await invertedIndexService.indexDocument(
            filePath,
            fileName,
            content,
            options.zone || collectionName
          );
          
          // Récupérer le nombre de termes indexés pour le log
          const stats = await invertedIndexService.getStats();
          invertedIndexTermsCount = stats.stats?.uniqueTerms || 0;
          invertedIndexSuccess = true;
          
          logInvertedIndexSuccess(fileName, invertedIndexTermsCount);
          
        } catch (error: any) {
          invertedIndexSuccess = false;
          logInvertedIndexError(fileName, error.message);
          console.warn(`[PROCESSOR] ⚠️ L'index inversé n'a pas été mis à jour, mais l'indexation ChromaDB a réussi.`);
        }
      } else {
        if (options.skipInvertedIndex) {
          console.log(`[PROCESSOR] ⏭️ Index inversé ignoré (skipInvertedIndex=true)`);
        } else if (!content || content.trim().length === 0) {
          console.log(`[PROCESSOR] ⏭️ Index inversé ignoré (contenu vide)`);
        }
      }
      
      this.onProgress?.('Terminé', 100, `Indexé en ${(processingTime / 1000).toFixed(1)}s`);
      
      // Retourner le résultat avec les informations d'index inversé
      return {
        success: true,
        documentId,
        collection: collectionName,
        chunksCount: finalChunksLimited.length,
        processingTime,
        metadata: {
          ...enrichedMetadata,
          invertedIndex: {
            success: invertedIndexSuccess,
            termsCount: invertedIndexTermsCount
          }
        } as DocumentMetadata
      };
      
    } catch (error: any) {
      logExtractionError(fileName, error.message);
      console.error(`[PROCESSOR] ❌ Erreur:`, error.message);
      throw new Error(`Échec traitement ${fileName}: ${error.message}`);
    }
  }
  
  private async ensureDependencies(): Promise<void> {
    if (!this.dependenciesLoaded) {
      await loadOptionalDependencies();
      this.dependenciesLoaded = true;
    }
  }
  
  /**
   * Extraction intelligente selon le type de fichier
   * 🔥 VERSION AVEC LOGS DÉTAILLÉS
   */
  private async extractContent(
    filePath: string,
    extension: string,
    extractorType: ExtractorType | null,
    options?: { skipCompression?: boolean }
  ): Promise<{ content: string; metadata: Record<string, any> }> {
    const startTime = Date.now();
    let content = '';
    let metadata: Record<string, any> = {};
    
    console.log(`\n[EXTRACT] 🔍 Extraction pour: ${path.basename(filePath)}`);
    
    try {
      switch (extractorType) {
        case 'text':
          content = await readFile(filePath, 'utf-8');
          metadata = { extractor: 'text', encoding: 'utf-8' };
          console.log(`[EXTRACT] ✅ Texte brut: ${content.length} caractères`);
          break;
          
        case 'json':
          const jsonBuffer = await readFile(filePath, 'utf-8');
          try {
            const parsed = JSON.parse(jsonBuffer);
            content = JSON.stringify(parsed, null, 2);
            metadata = { extractor: 'json', jsonKeys: Object.keys(parsed).length };
            console.log(`[EXTRACT] ✅ JSON: ${content.length} caractères, ${metadata.jsonKeys} clés`);
          } catch (e: any) {
            content = jsonBuffer;
            metadata = { extractor: 'json_raw', parseError: e.message };
            console.log(`[EXTRACT] ⚠️ JSON invalide: ${content.length} caractères`);
          }
          break;
          
        case 'pdf':
          console.log(`[EXTRACT] 📄 Traitement PDF...`);
          const pdfBuffer = await readFile(filePath);
          const pdfData = await pdfParse(pdfBuffer);
          content = pdfData.text;
          metadata = {
            extractor: 'pdf',
            pages: pdfData.numpages,
            info: pdfData.info
          };
          console.log(`[EXTRACT] ✅ PDF extrait: ${content.length} caractères, ${pdfData.numpages} pages`);
          
          if (!content || content.length < 100 && pdfData.numpages > 0) {
            console.log(`[EXTRACT] ⚠️ PDF scanné détecté, tentative OCR...`);
            try {
              const ocrResult = await this.ocrService.extractTextFromImage(filePath);
              if (ocrResult.text && ocrResult.text.length > content.length) {
                content = ocrResult.text;
                metadata.ocrApplied = true;
                metadata.ocrConfidence = ocrResult.confidence;
                console.log(`[EXTRACT] ✅ OCR effectué: ${content.length} caractères`);
              }
            } catch (ocrErr: any) {
              console.warn(`[EXTRACT] ⚠️ Échec OCR sur PDF scanné (${ocrErr.message}), utilisation du texte brut ou fallback...`);
              if (!content) {
                content = `[Document PDF Scanné: ${path.basename(filePath)} - Extraction de texte brute incomplète et OCR non disponible]`;
              }
            }
          }
          break;
          
        case 'ocr':
          let imagePath = filePath;
          const fileName = path.basename(filePath);
          
          if (!options?.skipCompression && sharp && !fileName.includes('_compressed')) {
            imagePath = await this.compressImage(filePath);
            metadata.compressed = true;
            console.log(`[EXTRACT] 🖼️ Image compressée: ${path.basename(imagePath)}`);
          }
          
          try {
            const ocrResult = await this.ocrService.extractTextFromImage(imagePath);
            content = ocrResult.text;
            metadata = {
              extractor: 'ocr',
              ocrConfidence: ocrResult.confidence,
              ocrLanguage: ocrResult.language
            };
            console.log(`[EXTRACT] ✅ OCR: ${content.length} caractères (confiance: ${ocrResult.confidence})`);
          } catch (ocrErr: any) {
            console.warn(`[EXTRACT] ⚠️ Échec OCR (${ocrErr.message}), utilisation d'un contenu de secours...`);
            content = `[Image OCR: ${fileName} - Analyse textuelle non disponible (${ocrErr.message})]`;
            metadata = { extractor: 'ocr_fallback', error: ocrErr.message };
          }
          break;
          
        case 'office':
          content = await this.extractOfficeContent(filePath, extension);
          metadata = { extractor: 'office', format: extension };
          console.log(`[EXTRACT] ✅ Office: ${content.length} caractères`);
          break;
          
        case 'archive':
          content = await this.extractArchiveContent(filePath, extension);
          metadata = { extractor: 'archive', format: extension };
          console.log(`[EXTRACT] ✅ Archive: ${content.length} caractères`);
          break;
          
        case 'cad':
          content = await this.extractCADContent(filePath, extension);
          metadata = { extractor: 'cad', format: extension };
          console.log(`[EXTRACT] ✅ CAD: ${content.length} caractères`);
          break;
          
        default:
          const binaryBuffer = await readFile(filePath);
          content = this.extractTextFromBinary(binaryBuffer);
          metadata = { extractor: 'binary', size: binaryBuffer.length };
          console.log(`[EXTRACT] ⚠️ Binaire: ${content.length} caractères extraits`);
          break;
      }
      
      metadata.extractionTime = Date.now() - startTime;
      return { content, metadata };
      
    } catch (error: any) {
      console.error(`[EXTRACT] ❌ Échec: ${error.message}`);
      throw error;
    }
  }

  /**
   * Compression d'image pour l'OCR
   */
  private async compressImage(imagePath: string): Promise<string> {
    if (!sharp) return imagePath;
    if (imagePath.toLowerCase().endsWith('.pdf')) return imagePath;
    
    const compressedPath = imagePath.replace(/\.(jpg|jpeg|png)$/i, '_compressed.jpg');
    try {
      await sharp(imagePath)
        .resize(1920, 1080, { fit: 'inside' })
        .jpeg({ quality: 85 })
        .toFile(compressedPath);
      
      console.log(`[PROCESSOR] Image compressée: ${compressedPath}`);
      return compressedPath;
    } catch (error) {
      console.warn('[PROCESSOR] Échec compression, utilisation originale');
      return imagePath;
    }
  }
  
  /**
   * Extraction de contenu Office
   */
  private async extractOfficeContent(filePath: string, extension: string): Promise<string> {
    const fileBuffer = await readFile(filePath);
    let content = '';
    
    try {
      if (extension === 'docx' && mammoth) {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        content = result.value;
      } else if (extension === 'doc') {
        content = `[Document Word: ${path.basename(filePath)} - Format .doc non supporté, veuillez convertir en .docx]`;
      } else if ((extension === 'xlsx' || extension === 'xls') && xlsx) {
        const workbook = xlsx.read(fileBuffer);
        content = workbook.SheetNames.map((sheetName: string) => {
          const sheet = workbook.Sheets[sheetName];
          return xlsx.utils.sheet_to_csv(sheet);
        }).join('\n\n');
      } else if ((extension === 'pptx' || extension === 'ppt')) {
        content = `[Présentation: ${path.basename(filePath)} - Extraction PowerPoint non disponible]`;
      } else {
        content = `[Document Office non reconnu: ${path.basename(filePath)}]`;
      }
      
      return content || `[Document Office: ${path.basename(filePath)}]`;
    } catch (error) {
      console.warn('[PROCESSOR] Échec extraction Office:', error);
      return `[Document Office non extractible: ${path.basename(filePath)}]`;
    }
  }
  
  /**
   * Extraction de contenu d'archive
   */
  private async extractArchiveContent(filePath: string, _extension: string): Promise<string> {
    if (!admZip) return `[Archive: ${path.basename(filePath)} - Extraction non disponible]`;
    
    try {
      const zip = new admZip(filePath);
      const entries = zip.getEntries();
      let content = `Archive: ${path.basename(filePath)}\nContient ${entries.length} fichiers:\n\n`;
      
      for (const entry of entries) {
        if (!entry.isDirectory) {
          const entryName = entry.entryName;
          const entryData = entry.getData();
          const text = entryData.toString('utf-8');
          content += `\n=== ${entryName} ===\n${text.substring(0, 5000)}\n`;
        }
      }
      
      return content;
    } catch (error) {
      console.warn('[PROCESSOR] Échec extraction archive:', error);
      return `[Archive non extractible: ${path.basename(filePath)}]`;
    }
  }
  
  /**
   * Extraction de contenu CAD
   */
  private async extractCADContent(filePath: string, extension: string): Promise<string> {
    const fileName = path.basename(filePath);
    const fileSize = fs.statSync(filePath).size;
    
    return `[Fichier CAD: ${fileName}
Type: ${extension.toUpperCase()}
Taille: ${(fileSize / 1024 / 1024).toFixed(2)} MB
Contenu: Dessin technique ${extension === 'dwg' ? 'AutoCAD' : extension === 'dxf' ? 'DXF' : 'STEP'} 3D
Nom du fichier: ${fileName}]`;
  }
  
  /**
   * Extraction de texte depuis des données binaires
   */
  private extractTextFromBinary(buffer: Buffer): string {
    let text = '';
    let currentString = '';
    
    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];
      if (char >= 32 && char <= 126) {
        currentString += String.fromCharCode(char);
      } else if (currentString.length > 3) {
        text += currentString + '\n';
        currentString = '';
      } else {
        currentString = '';
      }
    }
    
    if (currentString.length > 3) {
      text += currentString;
    }
    
    return text || `[Fichier binaire: ${buffer.length} octets]`;
  }
  
  /**
   * Génération de contenu fallback
   */
  private generateFallbackContent(fileName: string, extension: string, metadata: any): string {
    return `[Document: ${fileName}
Type: ${extension}
Taille: ${metadata.fileSize || 'inconnue'}
Extraction: ${metadata.extractor || 'automatique'}
Contenu: Document technique indexé avec métadonnées industrielles]`;
  }
  
  // ============================================================================
  // PHASE 1 : STRUCTURE-AWARE CHUNKING
  // ============================================================================
  
  private structureAwareChunking(content: string): Array<{ content: string; metadata: any }> {
    const chunks: Array<{ content: string; metadata: any }> = [];
    
    const sectionPatterns = [
      /^#{1,3}\s+.+$/m,
      /^[A-Z][A-Z\s]{3,}$/m,
      /^[IVXLCDM]+\.\s+.+$/m,
      /^\d+\.\s+[A-Z]/m,
      /^##\s*COMPÉTENCES|EXPÉRIENCE|FORMATION|LANGUES/i
    ];
    
    const lines = content.split('\n');
    let currentChunk = '';
    let currentMetadata: any = { headerLevel: 0, headerText: '' };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let isNewSection = false;
      let headerLevel = 0;
      let headerText = '';
      
      for (const pattern of sectionPatterns) {
        const match = line.match(pattern);
        if (match) {
          isNewSection = true;
          if (line.startsWith('###')) headerLevel = 3;
          else if (line.startsWith('##')) headerLevel = 2;
          else if (line.startsWith('#')) headerLevel = 1;
          else headerLevel = 2;
          
          headerText = line.replace(/^#+\s*/, '').trim();
          break;
        }
      }
      
      const isListItem = /^[\s]*[-*+•]\s+/.test(line) || /^\s*\d+\.\s+/.test(line);
      const isTableRow = line.includes('|');
      
      if (isNewSection && currentChunk.trim().length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          metadata: { ...currentMetadata, isAtomic: false }
        });
        currentChunk = line + '\n';
        currentMetadata = { headerLevel, headerText, isAtomic: false };
      } else {
        currentChunk += line + '\n';
        if (isListItem || isTableRow) {
          currentMetadata.isAtomic = true;
        }
      }
    }
    
    if (currentChunk.trim().length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: { ...currentMetadata, isAtomic: currentMetadata.isAtomic || false }
      });
    }
    
    const finalChunks: Array<{ content: string; metadata: any }> = [];
    for (const chunk of chunks) {
      if (chunk.metadata.isAtomic && chunk.content.length > 3000) {
        const subChunks = this.splitLongAtomicBlock(chunk.content);
        finalChunks.push(...subChunks.map(c => ({
          content: c,
          metadata: { ...chunk.metadata, isAtomic: true, isSubChunk: true }
        })));
      } else {
        finalChunks.push(chunk);
      }
    }
    
    return finalChunks;
  }
  
  private splitLongAtomicBlock(content: string): string[] {
    const chunks: string[] = [];
    const lines = content.split('\n');
    let currentChunk = '';
    
    for (const line of lines) {
      if (currentChunk.length + line.length > 1500) {
        chunks.push(currentChunk);
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
  }
  
  // ============================================================================
  // PHASE 2 : MAX-MIN SEMANTIC REFINEMENT
  // ============================================================================
  
  private async maxMinSemanticRefinement(
    chunks: Array<{ content: string; metadata: any }>
  ): Promise<Array<{ content: string; metadata: any }>> {
    const refined: Array<{ content: string; metadata: any }> = [];
    const MAX_CHUNK_SIZE = 1500;
    const MIN_CHUNK_SIZE = 300;
    
    for (const chunk of chunks) {
      if (chunk.content.length <= MAX_CHUNK_SIZE) {
        refined.push(chunk);
        continue;
      }
      
      const sentences = chunk.content.split(/(?<=[.!?])\s+/);
      if (sentences.length <= 1) {
        const subChunks = this.splitBySize(chunk.content, MAX_CHUNK_SIZE, 100, MIN_CHUNK_SIZE);
        refined.push(...subChunks.map(c => ({ content: c, metadata: chunk.metadata })));
        continue;
      }
      
      const sentenceChunks: string[] = [];
      let currentGroup = sentences[0];
      
      for (let i = 1; i < sentences.length; i++) {
        const combined = currentGroup + ' ' + sentences[i];
        
        if (combined.length > MAX_CHUNK_SIZE) {
          sentenceChunks.push(currentGroup);
          currentGroup = sentences[i];
        } else {
          currentGroup = combined;
        }
      }
      
      if (currentGroup) sentenceChunks.push(currentGroup);
      
      refined.push(...sentenceChunks.map(c => ({ content: c, metadata: chunk.metadata })));
    }
    
    return refined;
  }
  
  // ============================================================================
  // PHASE 3 : LATE CHUNKING - CONTEXT PRESERVATION
  // ============================================================================
  
  private async getDocumentEmbedding(content: string): Promise<number[]> {
    const truncated = content.substring(0, 4000);
    
    try {
      const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
      const embeddingModel = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
      
      console.log(`[PROCESSOR] Appel embedding document via Ollama: ${ollamaUrl}`);
      
      const response = await fetch(`${ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: embeddingModel,
          prompt: truncated
        }),
        signal: AbortSignal.timeout(80000)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error (${response.status}): ${errorText}`);
      }
      
      const data = await response.json();
      
      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Format embedding invalide');
      }
      
      console.log(`[PROCESSOR] Embedding document généré (${data.embedding.length} dimensions)`);
      return data.embedding;
      
    } catch (error: any) {
      console.warn(`[PROCESSOR] Échec embedding document: ${error.message}. Utilisation fallback.`);
      return Array(768).fill(0);
    }
  }
  
  // ============================================================================
  // PHASE 4 : ADAPTIVE METADATA ENRICHMENT
  // ============================================================================
  
  private detectDocumentType(fileName: string, content: string): string {
    const lowerContent = content.toLowerCase();
    const lowerName = fileName.toLowerCase();
    
    if (lowerName.includes('profile') || lowerContent.includes('compétence') || 
        lowerContent.includes('expérience professionnelle') || lowerContent.includes('cv')) {
      return 'profile';
    }
    if (lowerContent.includes('procédure') || lowerContent.includes('démarrage') || 
        lowerContent.includes('étape')) {
      return 'procedure';
    }
    if (lowerContent.includes('turbine') || lowerContent.includes('pompe') || 
        lowerContent.includes('équipement')) {
      return 'equipment';
    }
    if (lowerContent.includes('maintenance') || lowerContent.includes('réparation')) {
      return 'maintenance';
    }
    if (lowerContent.includes('alarme') || lowerContent.includes('sécurité')) {
      return 'security';
    }
    
    return 'general';
  }
  
  private inferSectionType(content: string): string {
    const lower = content.substring(0, 200).toLowerCase();
    
    if (lower.includes('compétence') || lower.includes('competence')) return 'competences';
    if (lower.includes('expérience') || lower.includes('experience')) return 'experience';
    if (lower.includes('formation')) return 'formation';
    if (lower.includes('langue')) return 'langues';
    if (lower.includes('information') || lower.includes('personnel')) return 'info_perso';
    if (lower.includes('procédure') || lower.includes('étape')) return 'procedure';
    if (lower.includes('alarme')) return 'alarme';
    
    return 'general';
  }
  
  // ============================================================================
  // INDEXATION AVEC MÉTADONNÉES DE CHUNK
  // ============================================================================
  
  private async indexDocumentWithChunkMetadata(
    collection: string,
    documentId: string,
    chunks: string[],
    chunksMetadata: any[],
    baseMetadata: DocumentMetadata,
    _forceReindex: boolean
  ): Promise<void> {
    const batchSize = INDEXING_CONFIG.batchSize;
    const documents = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunkMeta = chunksMetadata[i] || {};
      documents.push({
        id: `${documentId}_chunk_${i}`,
        content: chunks[i],
        metadata: {
          ...baseMetadata,
          ...chunkMeta,
          chunk_index: i,
          chunk_total: chunks.length,
          is_chunk: true,
          parent_id: documentId
        }
      });
    }
    
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      let retries = INDEXING_CONFIG.retryAttempts;
      
      while (retries > 0) {
        try {
          await this.chromaManager.upsertDocuments(collection as CollectionName, batch);
          console.log(`[PROCESSOR] Batch ${Math.floor(i / batchSize) + 1} indexé (${batch.length} chunks)`);
          break;
        } catch (error) {
          retries--;
          if (retries === 0) throw error;
          console.warn(`[PROCESSOR] Échec batch, retry... (${retries} restantes)`);
          await new Promise(resolve => setTimeout(resolve, INDEXING_CONFIG.retryDelay));
        }
      }
    }
    
    console.log(`[PROCESSOR] Indexation complète: ${documents.length} chunks avec métadonnées enrichies`);
  }
  
  private splitBySize(content: string, size: number, overlap: number, minSize: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < content.length) {
      const end = Math.min(start + size, content.length);
      let chunk = content.substring(start, end);
      
      if (end < content.length) {
        const lastSpace = chunk.lastIndexOf(' ');
        if (lastSpace > size * 0.7) {
          chunk = chunk.substring(0, lastSpace);
        }
      }
      
      if (chunk.length >= minSize) {
        chunks.push(chunk.trim());
      }
      
      start += size - overlap;
    }
    
    return chunks;
  }
  
  private async enrichMetadata(params: {
    id: string;
    titre: string;
    filePath: string;
    content: string;
    extension: string;
    fileSize: number;
    extractionMetadata: Record<string, any>;
    collection: string;
    explicitZone?: ZoneType;
    explicitType?: string;
  }): Promise<DocumentMetadata> {
    const { id, titre, filePath, content, extension, fileSize, extractionMetadata, explicitZone, explicitType } = params;
    const fileName = path.basename(filePath);
    const contentLower = content.toLowerCase();
    
    const entities = this.detectIndustrialEntities(fileName, contentLower);
    
    const zone = explicitZone || entities.zone;
    const typeDoc = explicitType || this.determineDocumentTypeAdvanced(fileName, contentLower);
    
    const metadata: DocumentMetadata = {
      id,
      titre,
      type: typeDoc,
      categorie: this.determineCategoryAdvanced(filePath),
      sous_categorie: this.determineSubcategoryAdvanced(filePath),
      equipement: entities.equipement,
      zone: zone as ZoneType | undefined,
      pupitre: entities.pupitre,
      profils_cibles: entities.profiles,
      tags: this.generateTagsAdvanced(fileName, contentLower, extension),
      source: filePath,
      version: this.extractVersion(fileName, contentLower),
      fileSize,
      fileType: extension,
      mimeType: this.getMimeType(extension),
      extractedBy: 'DocumentProcessor-v3.4',
      extractionDate: new Date(),
      processingTime: extractionMetadata.extractionTime,
      ...extractionMetadata
    };
    
    return metadata;
  }
  
  private detectIndustrialEntities(fileName: string, content: string): {
    equipement?: string;
    zone?: string;
    pupitre?: string;
    profiles: string[];
  } {
    const text = (fileName + ' ' + content).toUpperCase();
    const profiles: string[] = [];
    
    const equipments = [
      { name: 'TG1', keywords: ['TG1', 'TURBINE GAZ 1', 'GAZ TURBINE 1'] },
      { name: 'TG2', keywords: ['TG2', 'TURBINE GAZ 2', 'GAZ TURBINE 2'] },
      { name: 'TV', keywords: ['TV', 'TURBINE VAPEUR', 'STEAM TURBINE'] },
      { name: 'CR1', keywords: ['CR1', 'CHAUDIERE 1', 'BOILER 1'] },
      { name: 'CR2', keywords: ['CR2', 'CHAUDIERE 2', 'BOILER 2'] },
      { name: 'ALTERNATEUR', keywords: ['ALTERNATEUR', 'GENERATOR'] },
      { name: 'COMPRESSEUR', keywords: ['COMPRESSEUR', 'COMPRESSOR'] },
      { name: 'CONDENSEUR', keywords: ['CONDENSEUR', 'CONDENSER'] },
      { name: 'POMPE HP', keywords: ['POMPE HP', 'HP PUMP', 'HAUTE PRESSION'] },
      { name: 'POMPE BP', keywords: ['POMPE BP', 'BP PUMP', 'BASSE PRESSION'] }
    ];
    
    let equipement: string | undefined;
    for (const eq of equipments) {
      if (eq.keywords.some(k => text.includes(k))) {
        equipement = eq.name;
        break;
      }
    }
    
    let zone: string | undefined;
    const zones = [
      { name: 'Salle de contrôle', keywords: ['SALLE CONTROLE', 'CONTROL ROOM'] },
      { name: 'Zone turbine', keywords: ['TURBINE', 'TURBINE HALL'] },
      { name: 'Zone chaudière', keywords: ['CHAUDIERE', 'BOILER'] },
      { name: 'Zone auxiliaires', keywords: ['AUXILIAIRE', 'BOP'] },
      { name: 'Extérieur', keywords: ['EXTERIEUR', 'OUTDOOR', 'EXTERNAL'] }
    ];
    
    for (const z of zones) {
      if (z.keywords.some(k => text.includes(k))) {
        zone = z.name;
        break;
      }
    }
    
    let pupitre: string | undefined;
    if (text.includes('TG1') || text.includes('CR1')) pupitre = 'TG1_CR1';
    else if (text.includes('TG2') || text.includes('CR2')) pupitre = 'TG2_CR2';
    else if (text.includes('TV')) pupitre = 'TV';
    
    const profileMap = [
      { profile: 'chef_bloc_TG1', keywords: ['TG1', 'TURBINE GAZ 1'] },
      { profile: 'chef_bloc_TG2', keywords: ['TG2', 'TURBINE GAZ 2'] },
      { profile: 'operateur_TV', keywords: ['TV', 'TURBINE VAPEUR'] },
      { profile: 'chef_quart', keywords: ['DEMARRAGE', 'ARRET', 'QUART'] },
      { profile: 'superviseur', keywords: ['PERFORMANCE', 'SUPERVISION', 'RENDEMENT'] },
      { profile: 'maintenance', keywords: ['MAINTENANCE', 'REPARATION', 'DEPANNAGE'] },
      { profile: 'securite', keywords: ['SECURITE', 'SAFETY', 'HSE'] },
      { profile: 'qualite', keywords: ['QUALITE', 'QUALITY', 'ISO'] },
      { profile: 'environnement', keywords: ['ENVIRONNEMENT', 'ENVIRONMENT', 'EMISSIONS'] }
    ];
    
    for (const { profile, keywords } of profileMap) {
      if (keywords.some(k => text.includes(k))) {
        profiles.push(profile);
      }
    }
    
    return {
      equipement,
      zone,
      pupitre,
      profiles: profiles.length > 0 ? profiles : ['chef_quart']
    };
  }
  
  private determineDocumentTypeAdvanced(fileName: string, content: string): string {
    const types = [
      { name: 'procedure_demarrage', keywords: ['demarrage', 'startup', 'démarrage', 'mise en route'] },
      { name: 'procedure_arret', keywords: ['arret', 'shutdown', 'arrêt', 'mise à l\'arrêt'] },
      { name: 'procedure_urgence', keywords: ['urgence', 'emergency', 'incident', 'accident'] },
      { name: 'procedure_inspection', keywords: ['inspection', 'round', 'tournée', 'check'] },
      { name: 'procedure_maintenance', keywords: ['maintenance', 'entretien', 'repair', 'réparation'] },
      { name: 'procedure_alarme', keywords: ['alarme', 'alarm', 'defaut', 'défaut'] },
      { name: 'notice_technique', keywords: ['notice', 'manuel', 'manual', 'guide'] },
      { name: 'schema', keywords: ['schema', 'diagram', 'plan', 'drawing'] },
      { name: 'rapport', keywords: ['rapport', 'report', 'analyse', 'analysis'] }
    ];
    
    for (const type of types) {
      if (type.keywords.some(k => fileName.includes(k) || content.includes(k))) {
        return type.name;
      }
    }
    
    return 'document_technique';
  }
  
  private determineCategoryAdvanced(filePath: string): string {
    const parts = filePath.split(path.sep);
    for (let i = parts.length - 2; i >= 0; i--) {
      if (parts[i].match(/^\d{2}_/)) {
        return parts[i];
      }
    }
    return parts[parts.length - 2] || 'general';
  }
  
  private determineSubcategoryAdvanced(filePath: string): string {
    const parts = filePath.split(path.sep);
    if (parts.length >= 3) {
      return parts[parts.length - 3];
    }
    return 'general';
  }
  
  private extractVersion(fileName: string, content: string): string {
    const versionRegex = /v(?:ersion)?[.\s]*(\d+(?:[.-]\d+)?)/i;
    const match = content.match(versionRegex) || fileName.match(versionRegex);
    return match ? match[1] : '1.0';
  }
  
  private getMimeType(extension: string): string {
    const mimeMap: Record<string, string> = {
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'md': 'text/markdown',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'zip': 'application/zip'
    };
    return mimeMap[extension] || 'application/octet-stream';
  }
  
  private generateTagsAdvanced(fileName: string, content: string, extension: string): string[] {
    const tags = new Set<string>();
    tags.add(extension);
    
    const keywords = [
      'demarrage', 'arret', 'inspection', 'maintenance', 'alarme', 'securite',
      'urgence', 'procedure', 'chaudiere', 'turbine', 'gaz', 'vapeur',
      'pompe', 'vanne', 'circuit', 'reglage', 'controle', 'performance',
      'qualite', 'environnement', 'hse', 'formation', 'equipement'
    ];
    
    for (const keyword of keywords) {
      if (content.includes(keyword) || fileName.includes(keyword)) {
        tags.add(keyword);
      }
    }
    
    return Array.from(tags);
  }
  
  private getCollectionFromPath(filePath: string): string {
    const pathUpper = filePath.toUpperCase();
    const collections = [
      { name: 'PROCEDURES_EXPLOITATION', keywords: ['PROCEDURES', '04_PROCEDURES'] },
      { name: 'EQUIPEMENTS_PRINCIPAUX', keywords: ['EQUIPEMENTS_PRINCIPAUX', '02_EQUIPEMENTS'] },
      { name: 'SYSTEMES_AUXILIAIRES', keywords: ['SYSTEMES_AUXILIAIRES', '03_SYSTEMES'] },
      { name: 'CONSIGNES_ET_SEUILS', keywords: ['CONSIGNES', '05_CONSIGNES'] },
      { name: 'MAINTENANCE', keywords: ['MAINTENANCE', '06_MAINTENANCE'] },
      { name: 'SECURITE', keywords: ['SECURITE', '08_SECURITE'] },
      { name: 'FORMATION', keywords: ['FORMATION', '10_FORMATION'] },
      { name: 'SALLE_CONTROLE_CONDUITE', keywords: ['SALLE_CONTROLE', '11_SALLE'] },
      { name: 'centrale_gestion_equipes_humain', keywords: ['GESTION_EQUIPES', '12_GESTION'] },
      { name: 'SUPERVISION_GLOBALE', keywords: ['SUPERVISION', '13_SUPERVISION'] }
    ];
    
    for (const collection of collections) {
      if (collection.keywords.some(k => pathUpper.includes(k))) {
        return collection.name;
      }
    }
    
    return 'DOCUMENTS_GENERAUX';
  }
}

export default DocumentProcessor;