// src/ai/flows/ingest-document-flow.ts
/**
 * @fileOverview Flux d'ingestion unifié pour ChromaDB – Architecture par zones
 * Combine l'indexation vectorielle, l'extraction de connaissances et la hiérarchie de concepts
 * Version 4.0.0 – Adaptation à la structure par zones (A0, B0, B1, B2, B3, TG1, TG2, HR, MAINTENANCE, SHARED)
 * 
 * @version 4.0.0
 * @lastUpdated 2026-04-10
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { extractHierarchicalConcepts } from '@/ai/learning/concept-hierarchy';
import { ChromaDBManager } from '@/ai/vector/chromadb-manager';
import { ZoneType } from '@/ai/vector/chromadb-schema';
import { collectionSyncService } from '@/ai/vector/collection-sync.service';
import { selectModel } from '@/ai/config/models.config';

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
      const formatted = this.format('debug', 'IngestFlow', message, meta);
      if (this.logToConsole) console.log(`\x1b[36m${formatted}\x1b[0m`);
    }
  }

  info(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('info')) {
      const formatted = this.format('info', 'IngestFlow', message, meta);
      if (this.logToConsole) console.log(`\x1b[32m${formatted}\x1b[0m`);
    }
  }

  warn(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('warn')) {
      const formatted = this.format('warn', 'IngestFlow', message, meta);
      if (this.logToConsole) console.log(`\x1b[33m${formatted}\x1b[0m`);
    }
  }

  error(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('error')) {
      const formatted = this.format('error', 'IngestFlow', message, meta);
      if (this.logToConsole) console.log(`\x1b[31m${formatted}\x1b[0m`);
    }
  }
}

const logger = new SimpleLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface CentraleDocumentMetadata {
  id: string;
  titre: string;
  type: string;            // 'equipement', 'alarme_hmi', 'alarme_technique', 'procedure', 'image', 'synoptique', 'composant', 'rh', 'maintenance'
  categorie: string;       // correspond à la zone (ex: 'TG1', 'B0_AUXILIAIRES')
  zone?: ZoneType;         // zone explicite
  equipement?: string;
  pupitre?: string;
  profil_cible?: string[];
  tags: string[];
  mots_cles: string[];
  version: string;
  date_creation: string;
  date_modification: string;
  auteur: string;
  source_fichier: string;
  documents_lies?: string[];
  equipements_lies?: string[];
  niveau_hierarchique?: number;
  parent_id?: string;
  enfants_ids?: string[];
  [key: string]: any;
}

export interface IngestInput {
  fileName: string;
  fileContent: string;
  fileType: string;
  metadata?: Partial<CentraleDocumentMetadata>;
  zone?: ZoneType;         // NOUVEAU: zone explicite (prioritaire)
  userId?: string;
  chunkSize?: number;
}

export interface IngestOutput {
  docId: string;
  chunks: number;
  embeddingModel: string;
  processedAt: string;
  concepts: string[];
  zone: ZoneType;          // au lieu de collection
  graphData?: any;
  hierarchy?: any;
  processingTime?: number;
  warnings?: string[];
}

// ============================================================================
// UTILITAIRES
// ============================================================================

async function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number, 
  fallback: T,
  operationName: string = 'operation'
): Promise<T> {
  const timeoutPromise = new Promise<T>((resolve) =>
    setTimeout(() => {
      logger.warn(`Timeout atteint après ${timeoutMs}ms pour ${operationName}. Utilisation du fallback.`);
      resolve(fallback);
    }, timeoutMs)
  );
  return Promise.race([promise, timeoutPromise]);
}

function chunkText(text: string, size: number = 1000): string[] {
  const chunks: string[] = [];
  if (!text) return [];
  
  logger.debug('Découpage du texte en chunks', { textLength: text.length, chunkSize: size });
  
  const sentences = text.split(/(?<=[.!?])\s+/);
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= size) {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        logger.debug('Chunk créé', { chunkLength: currentChunk.length });
      }
      currentChunk = sentence;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  logger.info('Découpage terminé', { chunksCount: chunks.length });
  return chunks;
}

// ============================================================================
// EXTRACTION DE CONNAISSANCES AVEC IA LOCALE
// ============================================================================

async function extractKnowledgeFromText(docId: string, text: string): Promise<{ nodes: any[]; relations: any[] }> {
  const startTime = Date.now();
  
  logger.debug('Extraction des connaissances', { docId, textLength: text.length });
  
  try {
    const slice = text.substring(0, 1500);
    const systemPrompt = "Tu es un extracteur de graphe de connaissances technique. Analyse le texte et identifie les 3 relations les plus importantes sous le format 'Sujet -> Relation -> Objet'. Réponds UNIQUEMENT avec les relations, une par ligne.";
    const userPrompt = `Analyse ce document technique et extrait au maximum 3 relations clés.
Contenu : "${slice}"`;
    
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    
    const extractionModel = selectModel('thinking').name;
    const response = await callOllama(fullPrompt, {
      model: extractionModel,
      temperature: 0.3,
      maxTokens: 500
    });

    const lines = response.split('\n').filter(l => l.includes('->'));
    const nodes: any[] = [{ id: docId, label: 'Document Principal', type: 'document' }];
    const relations: any[] = [];

    lines.forEach(line => {
      const parts = line.split('->').map(p => p.trim());
      if (parts.length === 3) {
        const [subject, predicate, object] = parts;
        const subId = subject.toLowerCase().replace(/\s+/g, '_');
        const objId = object.toLowerCase().replace(/\s+/g, '_');

        nodes.push({ id: subId, label: subject, type: 'concept' });
        nodes.push({ id: objId, label: object, type: 'entity' });
        relations.push({ from: docId, to: subId, predicate: 'décrit' });
        relations.push({ from: subId, to: objId, predicate: predicate });
        
        logger.debug('Relation extraite', { subject, predicate, object });
      }
    });

    if (nodes.length === 1) {
      nodes.push({ id: 'technical_base', label: 'Connaissances Techniques', type: 'concept' });
      relations.push({ from: docId, to: 'technical_base', predicate: 'concerne' });
      logger.debug('Relation par défaut ajoutée', { docId });
    }
    
    const duration = Date.now() - startTime;
    logger.info('Extraction connaissances terminée', {
      docId,
      nodesCount: nodes.length,
      relationsCount: relations.length,
      duration: `${duration}ms`
    });
    
    return { nodes, relations };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    const duration = Date.now() - startTime;
    
    logger.error('Échec extraction connaissances', {
      docId,
      error: errorMessage,
      duration: `${duration}ms`
    });
    
    return { nodes: [{ id: docId, label: 'Document', type: 'document' }], relations: [] };
  }
}

// ============================================================================
// DÉTERMINATION DE LA ZONE (remplace determineCollection)
// ============================================================================

function determineZone(metadata: Partial<CentraleDocumentMetadata>, fileName?: string, explicitZone?: ZoneType): ZoneType {
  // Priorité à la zone explicite
  if (explicitZone) {
    logger.debug('Zone explicite utilisée', { zone: explicitZone });
    return explicitZone;
  }

  const type = metadata.type?.toLowerCase();
  const categorie = metadata.categorie?.toLowerCase();
  const equipement = metadata.equipement?.toLowerCase();
  const fileNameLower = fileName?.toLowerCase() || '';
  
  logger.debug('Détermination zone', {
    type,
    categorie,
    equipement,
    fileName: fileName?.substring(0, 50)
  });
  
  // 1. RH / Profils
  if (type === 'profile' || type === 'rh' || categorie === 'profile' || categorie === 'rh' ||
      fileNameLower.includes('profile') || fileNameLower.includes('profil') || fileNameLower.includes('rh')) {
    return 'RH';
  }
  
  // 2. Maintenance
  if (type === 'maintenance' || categorie === 'maintenance' || fileNameLower.includes('maintenance')) {
    return 'MAINTENANCE';
  }
  
  // 3. Turbines à gaz TG1 / TG2
  if (equipement === 'tg1' || fileNameLower.includes('tg1') || fileNameLower.includes('turbine gaz 1')) {
    return 'TG1';
  }
  if (equipement === 'tg2' || fileNameLower.includes('tg2') || fileNameLower.includes('turbine gaz 2')) {
    return 'TG2';
  }
  
  // 4. Chaudières HRSG B1 / B2
  if (equipement === 'cr1' || equipement === 'b1' || fileNameLower.includes('cr1') || fileNameLower.includes('b1') || fileNameLower.includes('chaudière 1')) {
    return 'B1_HRSG_TG1';
  }
  if (equipement === 'cr2' || equipement === 'b2' || fileNameLower.includes('cr2') || fileNameLower.includes('b2') || fileNameLower.includes('chaudière 2')) {
    return 'B2_HRSG_TG2';
  }
  
  // 5. Turbine vapeur / Poste d'eau
  if (equipement === 'tv' || fileNameLower.includes('tv') || fileNameLower.includes('turbine vapeur') ||
      fileNameLower.includes('condenseur') || fileNameLower.includes('poste eau')) {
    return 'B3_TV_PE';
  }
  
  // 6. Auxiliaires B0
  if (equipement === 'b0' || fileNameLower.includes('b0') || fileNameLower.includes('auxiliaire') ||
      fileNameLower.includes('eau de refroidissement') || fileNameLower.includes('air instrument')) {
    return 'B0_AUXILIAIRES';
  }
  
  // 7. Divers A0
  if (equipement === 'a0' || fileNameLower.includes('a0') || fileNameLower.includes('divers')) {
    return 'A0_DIVERS';
  }
  
  // 8. Sinon, zone partagée
  logger.debug('Zone par défaut utilisée', { zone: 'SHARED' });
  return 'SHARED';
}

// ============================================================================
// PIPELINE D'INGESTION
// ============================================================================

class IngestPipeline {
  private chromaManager: ChromaDBManager;
  
  constructor() {
    this.chromaManager = ChromaDBManager.getInstance();
    logger.info('IngestPipeline initialisé (version zones)');
  }
  
  /**
   * Traite un document complet et l'ajoute à la zone appropriée
   */
  async processDocument(
    document: {
      content: string;
      metadata: Partial<CentraleDocumentMetadata>;
      chunks?: Array<{ content: string; metadata: any }>;
    },
    targetZone: ZoneType
  ): Promise<{ zone: ZoneType; chunkCount: number }> {
    const startTime = Date.now();
    
    try {
      const zoneName = targetZone;
      
      logger.info('Traitement document', {
        docId: document.metadata.id,
        zone: zoneName,
        hasChunks: !!document.chunks,
        chunksCount: document.chunks?.length || 0
      });
      
      // Vérifier que la collection (zone) existe
      await collectionSyncService.ensureCollectionExists(zoneName);
      logger.debug('Zone vérifiée', { zone: zoneName });
      
      // Indexer les chunks ou le document complet
      if (document.chunks && document.chunks.length > 0) {
        await this.indexChunks(zoneName, document.chunks, document.metadata);
        const duration = Date.now() - startTime;
        logger.info('Chunks indexés', {
          docId: document.metadata.id,
          zone: zoneName,
          chunksCount: document.chunks.length,
          duration: `${duration}ms`
        });
        return { zone: zoneName, chunkCount: document.chunks.length };
      } else {
        await this.indexSingleDocument(zoneName, document);
        const duration = Date.now() - startTime;
        logger.info('Document unique indexé', {
          docId: document.metadata.id,
          zone: zoneName,
          duration: `${duration}ms`
        });
        return { zone: zoneName, chunkCount: 1 };
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      logger.error('Échec traitement document', {
        docId: document.metadata.id,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
  
  private async indexChunks(
    zoneName: ZoneType,
    chunks: Array<{ content: string; metadata: any }>,
    baseMetadata: Partial<CentraleDocumentMetadata>
  ): Promise<void> {
    const startTime = Date.now();
    
    logger.debug('Indexation des chunks', {
      zone: zoneName,
      chunksCount: chunks.length,
      docId: baseMetadata.id
    });
    
    const documents = chunks.map((chunk, index) => ({
      id: `${baseMetadata.id}_chunk_${index}`,
      content: chunk.content,
      metadata: {
        ...baseMetadata,
        ...chunk.metadata,
        zone: zoneName,
        chunk_index: index,
        chunk_total: chunks.length,
        is_chunk: true,
        timestamp: new Date().toISOString()
      } as Record<string, any>
    }));
    
    // Correction: Utiliser la méthode addDocuments (ou getCollection + upsert)
    await this.chromaManager.addDocuments(zoneName, documents);
    
    const duration = Date.now() - startTime;
    logger.info('Chunks indexés avec succès', {
      zone: zoneName,
      chunksCount: documents.length,
      duration: `${duration}ms`
    });
  }
  
  private async indexSingleDocument(
    zoneName: ZoneType,
    document: { content: string; metadata: Partial<CentraleDocumentMetadata> }
  ): Promise<void> {
    const startTime = Date.now();
    
    logger.debug('Indexation document unique', {
      zone: zoneName,
      docId: document.metadata.id
    });
    
    // Correction: Utiliser la méthode addDocuments
    await this.chromaManager.addDocuments(zoneName, [{
      id: document.metadata.id!,
      content: document.content,
      metadata: {
        ...document.metadata,
        zone: zoneName,
        is_chunk: false,
        timestamp: new Date().toISOString()
      } as Record<string, any>
    }]);
    
    const duration = Date.now() - startTime;
    logger.info('Document unique indexé', {
      zone: zoneName,
      docId: document.metadata.id,
      duration: `${duration}ms`
    });
  }
}

const pipeline = new IngestPipeline();

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

export async function ingestDocument(input: IngestInput): Promise<IngestOutput> {
  const startTime = Date.now();
  const warnings: string[] = [];
  
  logger.info('Début ingestion document', {
    fileName: input.fileName,
    fileType: input.fileType,
    contentLength: input.fileContent.length,
    userId: input.userId,
    explicitZone: input.zone
  });
  
  try {
    // 1. Validation du contenu
    if (!input.fileContent || input.fileContent.trim().length === 0) {
      warnings.push('Contenu du document vide');
      logger.warn('Contenu vide', { fileName: input.fileName });
    }
    
    // 2. Segmentation du texte
    const chunks = chunkText(input.fileContent, input.chunkSize || 1000);
    logger.info('Segmentation terminée', {
      fileName: input.fileName,
      chunksCount: chunks.length,
      avgChunkSize: input.fileContent.length / (chunks.length || 1)
    });
    
    // 3. Génération d'un ID unique
    const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    logger.debug('ID document généré', { docId });
    
    // 4. Extraction parallèle des connaissances avec timeout
    const [knowledge, hierarchy] = await Promise.allSettled([
      withTimeout(
        extractKnowledgeFromText(docId, input.fileContent), 
        15000, 
        { nodes: [], relations: [] },
        'extractKnowledge'
      ),
      withTimeout(
        extractHierarchicalConcepts(input.fileContent.substring(0, 1000)), 
        12000, 
        null,
        'extractHierarchy'
      ),
    ]);
    
    const knowledgeData = knowledge.status === 'fulfilled' ? knowledge.value : { nodes: [], relations: [] };
    const hierarchyData = hierarchy.status === 'fulfilled' ? hierarchy.value : null;
    
    if (knowledge.status === 'rejected') {
      warnings.push('Extraction de connaissances partielle ou échouée');
    }
    
    // 5. Déterminer la zone
    const targetZone = determineZone(
      { ...input.metadata, type: input.fileType, titre: input.fileName },
      input.fileName,
      input.zone
    );
    
    logger.debug('Zone déterminée', {
      fileName: input.fileName,
      zone: targetZone
    });
    
    // 6. Métadonnées enrichies
    const metadata: Partial<CentraleDocumentMetadata> = {
      id: docId,
      titre: input.fileName,
      type: input.fileType,
      categorie: targetZone,
      zone: targetZone,
      tags: input.metadata?.tags || [],
      mots_cles: knowledgeData.nodes?.map((n: any) => n.label).filter(Boolean).slice(0, 10) || [],
      version: input.metadata?.version || '1.0',
      date_creation: new Date().toISOString(),
      date_modification: new Date().toISOString(),
      auteur: input.metadata?.auteur || 'system',
      source_fichier: input.fileName,
      userId: input.userId,
      ...input.metadata
    };
    
    logger.debug('Métadonnées construites', {
      docId,
      titre: metadata.titre,
      zone: metadata.zone,
      tagsCount: metadata.tags?.length,
      motsClesCount: metadata.mots_cles?.length
    });
    
    // 7. Indexation dans ChromaDB (dans la zone)
    const chunksWithMetadata = chunks.map((content, idx) => ({
      content,
      metadata: {
        chunk_index: idx,
        chunk_total: chunks.length
      }
    }));
    
    const { zone: usedZone, chunkCount } = await pipeline.processDocument(
      {
        content: input.fileContent,
        metadata,
        chunks: chunksWithMetadata
      },
      targetZone
    );
    
    // 8. Stockage dans le graphe de connaissances (dans SHARED pour centraliser les graphes)
    if (knowledgeData.nodes && knowledgeData.nodes.length > 1) {
      try {
        await pipeline.processDocument(
          {
            content: JSON.stringify(knowledgeData),
            metadata: {
              id: `${docId}_graph`,
              titre: `${input.fileName} - Graphe`,
              type: 'knowledge_graph',
              categorie: 'SHARED',
              zone: 'SHARED',
              tags: ['graph', 'relations', 'knowledge'],
              mots_cles: [],
              version: '1.0',
              date_creation: new Date().toISOString(),
              date_modification: new Date().toISOString(),
              auteur: 'system',
              source_fichier: input.fileName,
              userId: input.userId
            }
          },
          'SHARED'
        );
        logger.debug('Graphe de connaissances stocké dans SHARED', { docId: `${docId}_graph` });
      } catch (graphError) {
        warnings.push('Stockage du graphe de connaissances échoué');
        logger.warn('Échec stockage graphe', {
          error: graphError instanceof Error ? graphError.message : 'Unknown'
        });
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    logger.info('Ingestion terminée avec succès', {
      docId,
      fileName: input.fileName,
      chunks: chunkCount,
      zone: usedZone,
      conceptsCount: metadata.mots_cles?.length || 0,
      processingTime: `${processingTime}ms`,
      warningsCount: warnings.length
    });
    
    return {
      docId,
      chunks: chunkCount,
      embeddingModel: 'ollama/nomic-embed-text',
      processedAt: new Date().toISOString(),
      concepts: metadata.mots_cles || [],
      zone: usedZone,
      graphData: knowledgeData,
      hierarchy: hierarchyData,
      processingTime,
      warnings
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    const processingTime = Date.now() - startTime;
    
    logger.error('Échec de l\'ingestion', {
      fileName: input.fileName,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      processingTime: `${processingTime}ms`
    });
    
    warnings.push(`Erreur critique: ${errorMessage}`);
    
    throw new Error(`Échec de l'ingestion du document ${input.fileName}: ${errorMessage}`);
  }
}

// ============================================================================
// EXPORT DU PIPELINE POUR USAGE PROGRAMMATIQUE
// ============================================================================

export { pipeline as ingestPipeline };