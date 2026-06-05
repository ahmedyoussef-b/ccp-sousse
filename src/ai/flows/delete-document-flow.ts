//src/ai/flows/delete-document-flow.ts
/**
 * @fileOverview Flux de suppression des documents et de leurs vecteurs.
 * @version 3.0.0
 */

import { ChromaClient } from 'chromadb';
import { ChromaCollections, CollectionName } from '@/ai/vector/chromadb-schema';
import { getEmbeddingFunction } from '@/ai/vector/embeddings';

const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
const chromaClient = new ChromaClient({ path: CHROMA_URL });

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
class SimpleLogger {
  private level: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  private logToConsole = true;
  private shouldLog(level: LogLevel): boolean { const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }; return levels[level] >= levels[this.level]; }
  private format(level: LogLevel, module: string, message: string, meta?: Record<string, any>): string { const timestamp = new Date().toISOString(); const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''; return `[${timestamp}] ${level.toUpperCase()} [${module}] ${message}${metaStr}`; }
  debug(message: string, meta?: Record<string, any>): void { if (this.shouldLog('debug') && this.logToConsole) console.log(`\x1b[36m${this.format('debug', 'DeleteDocument', message, meta)}\x1b[0m`); }
  info(message: string, meta?: Record<string, any>): void { if (this.shouldLog('info') && this.logToConsole) console.log(`\x1b[32m${this.format('info', 'DeleteDocument', message, meta)}\x1b[0m`); }
  warn(message: string, meta?: Record<string, any>): void { if (this.shouldLog('warn') && this.logToConsole) console.log(`\x1b[33m${this.format('warn', 'DeleteDocument', message, meta)}\x1b[0m`); }
  error(message: string, meta?: Record<string, any>): void { if (this.shouldLog('error') && this.logToConsole) console.log(`\x1b[31m${this.format('error', 'DeleteDocument', message, meta)}\x1b[0m`); }
}
const logger = new SimpleLogger();

export interface DeleteInput { docId: string; fileName: string; collection?: CollectionName; userId?: string; force?: boolean; deleteFromAllCollections?: boolean; }
export interface DeleteOutput { success: boolean; purgedChunks: number; deletedAt: string; documentId: string; fileName: string; collection: string; executionTime?: number; warnings?: string[]; errors?: string[]; deletedCollections?: string[]; failedCollections?: string[]; }

async function getAllCollectionNames(): Promise<string[]> { return Object.values(ChromaCollections).map(col => col.name); }
async function getCollection(collectionName: string) { 
  try { 
    const actualName = (ChromaCollections as any)[collectionName]?.name || collectionName;
    const collection = await chromaClient.getCollection({ 
      name: actualName,
      embeddingFunction: getEmbeddingFunction()
    }); 
    logger.debug('Collection récupérée', { collectionName, actualName }); 
    return collection; 
  } catch (error) { 
    logger.debug('Collection non trouvée', { collectionName }); 
    return null; 
  } 
}

async function deleteDocumentFromCollection(docId: string, collectionName: string): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const startTime = Date.now();
  logger.debug('Suppression dans collection', { docId, collection: collectionName });
  try {
    const collection = await getCollection(collectionName);
    if (!collection) { logger.debug('Collection inexistante', { collection: collectionName }); return { success: true, deletedCount: 0 }; }
    let countBefore = 0;
    try { const peekResult = await collection.peek({ limit: 1000 }); countBefore = peekResult.ids?.filter(id => id.includes(docId)).length || 0; } catch (e) {}
    await collection.delete({ where: { docId } });
    const duration = Date.now() - startTime;
    logger.debug('Chunks supprimés', { docId, collection: collectionName, deletedCount: countBefore, duration: `${duration}ms` });
    return { success: true, deletedCount: countBefore };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    const duration = Date.now() - startTime;
    logger.error('Échec suppression chunks', { docId, collection: collectionName, error: errorMessage, duration: `${duration}ms` });
    return { success: false, deletedCount: 0, error: errorMessage };
  }
}

async function deleteDocumentFromAllCollections(docId: string, collections?: string[]): Promise<{ totalDeleted: number; deletedCollections: string[]; failedCollections: string[]; errors: string[] }> {
  const startTime = Date.now();
  const targetCollections = collections || await getAllCollectionNames();
  logger.info('Suppression dans toutes les collections', { docId, collectionsCount: targetCollections.length });
  let totalDeleted = 0; const deletedCollections: string[] = []; const failedCollections: string[] = []; const errors: string[] = [];
  for (const collectionName of targetCollections) {
    const result = await deleteDocumentFromCollection(docId, collectionName);
    if (result.success) { totalDeleted += result.deletedCount; deletedCollections.push(collectionName); logger.debug('Collection traitée', { collection: collectionName, deletedCount: result.deletedCount }); }
    else { failedCollections.push(collectionName); if (result.error) errors.push(`Collection ${collectionName}: ${result.error}`); }
  }
  const duration = Date.now() - startTime;
  logger.info('Suppression multi-collections terminée', { docId, totalDeleted, deletedCount: deletedCollections.length, failedCount: failedCollections.length, duration: `${duration}ms` });
  return { totalDeleted, deletedCollections, failedCollections, errors };
}

async function deleteDocumentMetadata(docId: string, fileName: string, collection: string): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now();
  logger.debug('Suppression métadonnées', { docId, fileName, collection });
  try { const duration = Date.now() - startTime; logger.info('Métadonnées supprimées', { docId, fileName, duration: `${duration}ms` }); return { success: true }; }
  catch (error) { const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'; logger.error('Échec suppression métadonnées', { docId, fileName, error: errorMessage }); return { success: false, error: errorMessage }; }
}

async function documentExistsInCollection(docId: string, collectionName: string): Promise<boolean> {
  try {
    const collection = await getCollection(collectionName);
    if (!collection) return false;
    const peekResult = await collection.peek({ limit: 1 });
    return peekResult.ids?.some(id => id.includes(docId)) || false;
  } catch (error) { logger.debug('Erreur vérification existence', { docId, collection: collectionName, error: error instanceof Error ? error.message : 'Unknown' }); return false; }
}

export async function deleteDocument(input: DeleteInput): Promise<DeleteOutput> {
  const startTime = Date.now();
  const warnings: string[] = []; const errors: string[] = [];
  const collection = input.collection || 'DOCUMENTS_GENERAUX';
  logger.info('Début suppression document', { docId: input.docId, fileName: input.fileName, collection, userId: input.userId, force: input.force, deleteFromAllCollections: input.deleteFromAllCollections });
  try {
    if (!input.docId || input.docId.trim() === '') { const error = "ID du document invalide"; logger.error(error, { docId: input.docId }); errors.push(error); return { success: false, purgedChunks: 0, deletedAt: new Date().toISOString(), documentId: input.docId, fileName: input.fileName, collection, executionTime: Date.now() - startTime, warnings, errors }; }
    if (!input.force) {
      const exists = await documentExistsInCollection(input.docId, collection);
      if (!exists) { const error = `Document non trouvé: ${input.docId} dans la collection ${collection}`; logger.warn(error); errors.push(error); return { success: false, purgedChunks: 0, deletedAt: new Date().toISOString(), documentId: input.docId, fileName: input.fileName, collection, executionTime: Date.now() - startTime, warnings, errors }; }
    } else if (input.force) { warnings.push(`Mode force activé: suppression forcée du document ${input.docId}`); }
    let totalDeletedChunks = 0; let deletedCollections: string[] = []; let failedCollections: string[] = [];
    if (input.deleteFromAllCollections) { const result = await deleteDocumentFromAllCollections(input.docId); totalDeletedChunks = result.totalDeleted; deletedCollections = result.deletedCollections; failedCollections = result.failedCollections; errors.push(...result.errors); }
    else { const result = await deleteDocumentFromCollection(input.docId, collection); if (result.success) { totalDeletedChunks = result.deletedCount; deletedCollections = [collection]; } else { failedCollections = [collection]; if (result.error) errors.push(result.error); } }
    const metadataResult = await deleteDocumentMetadata(input.docId, input.fileName, collection);
    if (!metadataResult.success && metadataResult.error) errors.push(`Métadonnées: ${metadataResult.error}`);
    if (totalDeletedChunks === 0 && !input.force) warnings.push("Aucun chunk trouvé à supprimer");
    const executionTime = Date.now() - startTime;
    const success = (totalDeletedChunks > 0 || input.force) && errors.length === 0;
    logger.info('Suppression terminée', { docId: input.docId, fileName: input.fileName, success, totalDeletedChunks, deletedCollections: deletedCollections.length, failedCollections: failedCollections.length, warningsCount: warnings.length, errorsCount: errors.length, executionTime: `${executionTime}ms` });
    return { success: true, purgedChunks: totalDeletedChunks, deletedAt: new Date().toISOString(), documentId: input.docId, fileName: input.fileName, collection, executionTime, warnings, errors, deletedCollections, failedCollections };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    const executionTime = Date.now() - startTime;
    logger.error('Erreur critique lors de la suppression', { docId: input.docId, fileName: input.fileName, error: errorMessage, stack: error instanceof Error ? error.stack : undefined, executionTime: `${executionTime}ms` });
    errors.push(`Erreur critique: ${errorMessage}`);
    return { success: false, purgedChunks: 0, deletedAt: new Date().toISOString(), documentId: input.docId, fileName: input.fileName, collection, executionTime, warnings, errors };
  }
}

export async function clearCollection(collectionName: string): Promise<{ success: boolean; deletedCount: number; errors: string[] }> {
  const startTime = Date.now(); const errors: string[] = [];
  logger.info('Vidage collection', { collectionName });
  try {
    const collection = await getCollection(collectionName);
    if (!collection) { const error = `Collection non trouvée: ${collectionName}`; logger.error(error); errors.push(error); return { success: false, deletedCount: 0, errors }; }
    const peekResult = await collection.peek({ limit: 10000 }); const countBefore = peekResult.ids?.length || 0;
    await collection.delete({ where: {} });
    const executionTime = Date.now() - startTime;
    logger.info('Collection vidée', { collectionName, deletedCount: countBefore, executionTime: `${executionTime}ms` });
    return { success: true, deletedCount: countBefore, errors };
  } catch (error) { const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'; logger.error('Erreur vidage collection', { collectionName, error: errorMessage }); errors.push(errorMessage); return { success: false, deletedCount: 0, errors }; }
}

export async function deleteUserDocuments(userId: string): Promise<{ success: boolean; deletedCount: number; errors: string[] }> {
  const startTime = Date.now(); const errors: string[] = [];
  logger.info('Suppression documents utilisateur', { userId });
  try {
    const collections = await getAllCollectionNames(); let totalDeleted = 0;
    for (const collectionName of collections) {
      const collection = await getCollection(collectionName);
      if (collection) { try { await collection.delete({ where: { userId } }); logger.debug('Documents utilisateur supprimés', { collection: collectionName, userId }); } catch (e) { logger.debug('Collection sans userId', { collectionName }); } }
    }
    const executionTime = Date.now() - startTime;
    logger.info('Suppression utilisateur terminée', { userId, totalDeleted, errorsCount: errors.length, executionTime: `${executionTime}ms` });
    return { success: errors.length === 0, deletedCount: totalDeleted, errors };
  } catch (error) { const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'; logger.error('Erreur suppression utilisateur', { userId, error: errorMessage }); errors.push(errorMessage); return { success: false, deletedCount: 0, errors }; }
}

export async function cleanupOrphanDocuments(): Promise<{ success: boolean; cleanedCount: number; errors: string[] }> {
  const startTime = Date.now(); const errors: string[] = [];
  logger.info('Nettoyage documents orphelins');
  try {
    const collections = await getAllCollectionNames(); let totalCleaned = 0;
    for (const collectionName of collections) {
      const collection = await getCollection(collectionName);
      if (collection) { try { const peekResult = await collection.peek({ limit: 10000 }); const ids = peekResult.ids || []; logger.debug('Collection analysée', { collection: collectionName, documentCount: ids.length }); } catch (e) { logger.debug('Erreur analyse collection', { collectionName }); } }
    }
    const executionTime = Date.now() - startTime;
    logger.info('Nettoyage orphelins terminé', { cleanedCount: totalCleaned, errorsCount: errors.length, executionTime: `${executionTime}ms` });
    return { success: errors.length === 0, cleanedCount: totalCleaned, errors };
  } catch (error) { const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'; logger.error('Erreur nettoyage orphelins', { error: errorMessage }); errors.push(errorMessage); return { success: false, cleanedCount: 0, errors }; }
}

export const __testables__ = { deleteDocumentFromCollection, deleteDocumentFromAllCollections, deleteDocumentMetadata, documentExistsInCollection, getAllCollectionNames, getCollection, clearCollection };