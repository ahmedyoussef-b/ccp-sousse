// src/ai/vector/chromadb-manager.ts
import { ChromaClient, Collection, IEmbeddingFunction } from 'chromadb';
import { ChromaCollections, CollectionName } from './chromadb-schema';
import { logger } from '../../lib/logger';
import { getEmbeddingFunction, validateEmbeddingDimension, getCurrentDimension, isDimensionDetected, detectEmbeddingDimension } from './embeddings';
import { chromaDBAudit } from '../../lib/logger/chromadb-audit';

// ============================================
// CONFIGURATION MÉMOIRE BASSE
// ============================================

const MEMORY_CONFIG = {
  CACHE_TTL: 30000,
  MAX_CACHE_ENTRIES: 50,
  MAX_BATCH_SIZE: 20,
  QUERY_CACHE_SIZE: 30,
  CLEANUP_INTERVAL: 60000
};

// ============================================
// LOGS STRUCTURÉS
// ============================================

interface StructuredLog {
  timestamp: string;
  module: string;
  step: string;
  [key: string]: any;
}

function logStructured(step: string, data: Record<string, any>): void {
  const logEntry: StructuredLog = {
    timestamp: new Date().toISOString(),
    module: 'CHROMADB',
    step: step,
    ...data
  };
  if (['DIMENSION_CORRECTION', 'ERROR', 'WARN'].includes(step)) {
    console.log(`[${step}] ${data.message || ''}`, data);
  }
  console.log(JSON.stringify(logEntry, null, 2));
}

function logDebug(message: string, data?: Record<string, any>): void {
  if (data) {
    logStructured('DEBUG', { message, ...data });
  } else {
    logger.debug(message);
  }
}

function logInfo(message: string, data?: Record<string, any>): void {
  if (data) {
    logStructured('INFO', { message, ...data });
  } else {
    logger.info(message);
  }
}

function logWarn(message: string, data?: Record<string, any>): void {
  if (data) {
    logStructured('WARN', { message, ...data });
  } else {
    logger.warn(message);
  }
}

function logError(message: string, error?: any, data?: Record<string, any>): void {
  const errorData = {
    message,
    error: error?.message || error,
    stack: error?.stack,
    ...data
  };
  logStructured('ERROR', errorData);
  logger.error(message, error);
}

// ============================================
// CHROMADB MANAGER
// ============================================

export class ChromaDBManager {
    private static instance: ChromaDBManager;
    private client: ChromaClient;
    private embeddingFunction: IEmbeddingFunction;
    private collections: Map<CollectionName, Collection> = new Map();
    private initialized: boolean = false;
    private embeddingDimension: number | null = null;

    private cbFailures = 0;
    private cbOpenUntil = 0;
    private readonly CB_THRESHOLD = 3;
    private readonly CB_COOLDOWN = 30_000;
    private readonly MAX_BATCH_SIZE = MEMORY_CONFIG.MAX_BATCH_SIZE;

    private queryCache: Map<string, { results: any; timestamp: number }> = new Map();
    private readonly CACHE_TTL = MEMORY_CONFIG.CACHE_TTL;
    private readonly MAX_CACHE_SIZE = MEMORY_CONFIG.QUERY_CACHE_SIZE;
    
    private cleanupTimer: NodeJS.Timeout | null = null;

    private isCircuitOpen(): boolean {
        if (this.cbFailures < this.CB_THRESHOLD) return false;
        if (Date.now() > this.cbOpenUntil) {
            logInfo('Circuit HALF-OPEN — tentative de reconnexion ChromaDB...');
            this.cbFailures = this.CB_THRESHOLD - 1;
            return false;
        }
        return true;
    }

    private recordSuccess(): void {
        this.cbFailures = 0;
    }

    private recordFailure(): void {
        this.cbFailures++;
        if (this.cbFailures >= this.CB_THRESHOLD) {
            this.cbOpenUntil = Date.now() + this.CB_COOLDOWN;
            logWarn(`Circuit OUVERT — ChromaDB inaccessible (${this.cbFailures} échecs). Pause ${this.CB_COOLDOWN / 1000}s.`);
        }
    }

    private startCleanupTimer(): void {
        if (this.cleanupTimer) return;
        this.cleanupTimer = setInterval(() => {
            this.cleanupCache();
        }, MEMORY_CONFIG.CLEANUP_INTERVAL);
    }

    private stopCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    private cleanupCache(): void {
        const beforeSize = this.queryCache.size;
        const now = Date.now();
        let removedCount = 0;
        
        const { modelManager } = require('../resilience/model-manager');
        const dynamicTTL = (modelManager.getConstraints().chromaTTL * 1000) || this.CACHE_TTL;

        const entries = Array.from(this.queryCache.entries());
        for (const [key, value] of entries) {
            if (now - value.timestamp > dynamicTTL) {
                this.queryCache.delete(key);
                removedCount++;
            }
        }
        
        if (this.queryCache.size > this.MAX_CACHE_SIZE) {
            const entries = Array.from(this.queryCache.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            const toDelete = entries.slice(0, this.queryCache.size - this.MAX_CACHE_SIZE);
            for (const [key] of toDelete) {
                this.queryCache.delete(key);
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            logDebug(`🧹 Nettoyage cache: ${removedCount} entrées supprimées (${beforeSize} -> ${this.queryCache.size})`);
        }
    }

    private constructor() {
        const urlString = (process.env.CHROMADB_URL || 'http://127.0.0.1:8000').trim();
        try {
            this.client = new ChromaClient({
                path: urlString
            });
            logInfo(`Client configuré pour ${urlString}`);
        } catch (e) {
            logError('Erreur parsing CHROMADB_URL, fallback sur http://127.0.0.1:8000', e);
            this.client = new ChromaClient({
                path: 'http://127.0.0.1:8000'
            });
        }
        this.embeddingFunction = getEmbeddingFunction();
        
        this.startCleanupTimer();
    }

    static getInstance(): ChromaDBManager {
        if (!ChromaDBManager.instance) {
            ChromaDBManager.instance = new ChromaDBManager();
        }
        return ChromaDBManager.instance;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;
        try {
            await this.client.heartbeat();
            
            if (!isDimensionDetected()) {
                logInfo('🔍 Détection automatique de la dimension des embeddings...');
                const detectedDim = await detectEmbeddingDimension();
                logInfo(`✅ Dimension détectée: ${detectedDim}`);
            }
            
            this.embeddingDimension = getCurrentDimension();
            
            if (!validateEmbeddingDimension(this.embeddingDimension)) {
                logWarn(`⚠️ Dimension ${this.embeddingDimension} non standard, mais acceptée`);
            }
            
            logInfo(`✅ Embeddings configurés: ${this.embeddingDimension} dimensions`);
            logInfo('✅ ChromaDB connected successfully');
            this.initialized = true;
        } catch (error) {
            logError('ChromaDB initialization failed:', error);
            throw error;
        }
    }

    async getStatus(): Promise<{ connected: boolean; version?: string; embeddingDimension?: number; error?: string }> {
        try {
            const version = await this.client.version();
            return { 
                connected: true, 
                version,
                embeddingDimension: this.embeddingDimension || getCurrentDimension()
            };
        } catch (e: any) {
            return { connected: false, error: e.message };
        }
    }

    async getOrCreateCollection(name: CollectionName, traceId?: string): Promise<Collection> {
        if (this.collections.has(name)) {
            return this.collections.get(name)!;
        }
        
        await this.initialize();

        try {
            const actualName = ChromaCollections[name]?.name || name;
            logDebug(`Tentative de récupération de la collection: ${actualName} (ID: ${name})`);
            
            const targetDim = (ChromaCollections as any)[name]?.embeddingDimension || 768;
            let collection = await this.client.getCollection({
                name: actualName,
                embeddingFunction: targetDim === getCurrentDimension() ? this.embeddingFunction : undefined
            });
            const isCorrect = await this.validateCollectionDimension(collection, targetDim);
            if (!isCorrect) {
                logWarn(`⚠️ Dimension mismatch détectée pour ${name}. Suppression et recréation...`);
                await this.deleteCollection(name, traceId);
                collection = await this.createNewCollection(name, traceId);
                
                logStructured('DIMENSION_CORRECTION', {
                    message: `Collection ${name} réinitialisée avec la dimension correcte`,
                    collection: name,
                    targetDimension: targetDim,
                    traceId
                });
            }

            this.collections.set(name, collection);
            return collection;
        } catch (error) {
            logInfo(`🆕 Collection non trouvée, création: ${name}`);
            const collection = await this.createNewCollection(name, traceId);
            this.collections.set(name, collection);
            return collection;
        }
    }

    private async validateCollectionDimension(collection: Collection, expectedDim?: number): Promise<boolean> {
        try {
            const dim = expectedDim || getCurrentDimension() || 768;
            await collection.query({
                queryEmbeddings: [new Array(dim).fill(0)],
                nResults: 1
            });
            return true;
        } catch (error: any) {
            if (error.message && (error.message.includes('dimension') || error.message.includes('expected'))) {
                logError(`Dimension mismatch confirmée: attendu ${expectedDim}`, error);
                return false;
            }
            return true;
        }
    }

    private async createNewCollection(name: CollectionName, traceId?: string): Promise<Collection> {
        const startTime = Date.now();
        const currentDim = (ChromaCollections as any)[name]?.embeddingDimension || getCurrentDimension() || 768;

        chromaDBAudit.appToChromaDB('CREATE_COLLECTION', 0, true, {
            collection: name,
            dimension: currentDim,
            traceId
        });

        const actualName = ChromaCollections[name]?.name || name;
        const collection = await this.client.createCollection({
            name: actualName,
            embeddingFunction: currentDim === getCurrentDimension() ? this.embeddingFunction : undefined,
            metadata: {
                "hnsw:space": "cosine",
                "embedding_dimension": currentDim,
                "created_at": new Date().toISOString(),
                "managed_by": "AGENTIC_ROOT_FIX"
            }
        });

        const duration = Date.now() - startTime;
        chromaDBAudit.chromaDBResponse('CREATE_COLLECTION', duration, true, {
            collection: name,
            traceId
        });

        logInfo(`✅ Collection créée avec succès: ${name} (dimension ${currentDim})`);
        return collection;
    }

    private sanitizeMetadata(metadata: Record<string, any>): Record<string, string | number | boolean> {
        const sanitized: Record<string, string | number | boolean> = {};
        const MAX_METADATA_KEYS = 10;
        let keyCount = 0;
        
        for (const [key, value] of Object.entries(metadata)) {
            if (keyCount >= MAX_METADATA_KEYS) break;
            if (value === null || value === undefined) continue;
            if (Array.isArray(value)) {
                if (value.length > 0) sanitized[key] = value.slice(0, 5).join(', ');
            } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                sanitized[key] = value;
            } else if (typeof value === 'object') {
                sanitized[key] = JSON.stringify(value).substring(0, 100);
            } else {
                sanitized[key] = String(value);
            }
            keyCount++;
        }
        return sanitized;
    }

    async addDocuments(
        collectionName: CollectionName, 
        documents: Array<{ id: string; content: string; metadata: Record<string, any>; embedding?: number[] }>,
        traceId?: string
    ): Promise<void> {
        return this.processBatchAction(collectionName, documents, 'add', traceId);
    }

    async upsertDocuments(
        collectionName: CollectionName, 
        documents: Array<{ id: string; content: string; metadata: Record<string, any>; embedding?: number[] }>,
        traceId?: string
    ): Promise<void> {
        return this.processBatchAction(collectionName, documents, 'upsert', traceId);
    }

    async deleteDocuments(
        collectionName: CollectionName, 
        ids: string[],
        traceId?: string
    ): Promise<void> {
        const startTime = Date.now();
        
        if (this.isCircuitOpen()) return;
        
        chromaDBAudit.appToChromaDB('DELETE_DOCUMENTS', 0, true, {
            collection: collectionName,
            documentsCount: ids.length,
            traceId
        });
        
        try {
            const collection = await this.getOrCreateCollection(collectionName, traceId);
            await collection.delete({ ids });
            const duration = Date.now() - startTime;
            this.recordSuccess();
            
            chromaDBAudit.chromaDBResponse('DELETE_DOCUMENTS', duration, true, {
                collection: collectionName,
                resultsCount: ids.length,
                traceId
            });
            
            this.invalidateCache(collectionName);
            logInfo(`Deleted ${ids.length} documents from ${collectionName}`);
        } catch (error: any) {
            const duration = Date.now() - startTime;
            this.recordFailure();
            chromaDBAudit.appToChromaDB('DELETE_DOCUMENTS', duration, false, {
                collection: collectionName,
                traceId,
                error: error.message
            });
            throw error;
        }
    }

    private async processBatchAction(
        collectionName: CollectionName, 
        documents: Array<{ id: string; content: string; metadata: Record<string, any>; embedding?: number[] }>, 
        action: 'add' | 'upsert',
        traceId?: string
    ): Promise<void> {
        const startTime = Date.now();
        
        if (!documents.length) return;
        if (this.isCircuitOpen()) {
            logWarn(`Circuit ouvert, skipping ${action} for ${collectionName}`);
            return;
        }

        logDebug(`Processing ${action} for ${collectionName}: ${documents.length} documents`, {
            documentIds: documents.map(d => d.id).slice(0, 5),
            totalDocuments: documents.length
        });

        const operation = action === 'add' ? 'ADD_DOCUMENTS' : 'UPDATE_DOCUMENTS';
        chromaDBAudit.appToChromaDB(operation, 0, true, {
            collection: collectionName,
            documentsCount: documents.length,
            traceId
        });

        try {
            const collection = await this.getOrCreateCollection(collectionName, traceId);
            
            for (let i = 0; i < documents.length; i += this.MAX_BATCH_SIZE) {
                const batch = documents.slice(i, i + this.MAX_BATCH_SIZE);
                const payload: any = {
                    ids: batch.map(d => d.id),
                    documents: batch.map(d => d.content),
                    metadatas: batch.map(d => this.sanitizeMetadata(d.metadata || {}))
                };
                
                // Si des embeddings sont fournis, les ajouter au payload
                const batchEmbeddings = batch.filter(d => d.embedding).map(d => d.embedding);
                if (batchEmbeddings.length === batch.length) {
                    payload.embeddings = batchEmbeddings;
                }
                
                if (action === 'add') await collection.add(payload);
                else await collection.upsert(payload);
            }
            
            const duration = Date.now() - startTime;
            this.recordSuccess();
            
            chromaDBAudit.chromaDBResponse(operation, duration, true, {
                collection: collectionName,
                resultsCount: documents.length,
                traceId
            });
            
            this.invalidateCache(collectionName);
            logDebug(`${action} completed: ${documents.length} docs to ${collectionName}`);
        } catch (error: any) {
            const duration = Date.now() - startTime;
            this.recordFailure();
            
            chromaDBAudit.appToChromaDB(operation, duration, false, {
                collection: collectionName,
                documentsCount: documents.length,
                traceId,
                error: error.message
            });
            
            logError(`Failed to ${action} documents to ${collectionName}:`, error);
            throw error;
        }
    }

    async search(collectionName: CollectionName, query: string, options: any = {}): Promise<any> {
        const timeoutMs = options.timeout || 12000;
        
        if (this.isCircuitOpen()) {
            return { documents: [], metadatas: [], distances: [], ids: [] };
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const collection = await this.getOrCreateCollection(collectionName, options.traceId);
            const results = await collection.query({
                queryTexts: [query],
                nResults: options.nResults || 10
            });
            
            clearTimeout(timeoutId);
            this.recordSuccess();
            return results;
        } catch (error: any) {
            clearTimeout(timeoutId);
            this.recordFailure();
            if (error.name === 'AbortError') {
                logWarn(`Search timeout after ${timeoutMs}ms for ${collectionName}`);
            } else {
                logError(`Search failed for ${collectionName}:`, error);
            }
            return { documents: [], metadatas: [], distances: [], ids: [] };
        }
    }

  /**
 * 🔥 RECHERCHE PAR SIMILARITÉ VECTORIELLE (pour images)
 */
async searchSimilar(
    collectionName: CollectionName,
    queryEmbedding: number[],
    nResults: number = 10,
    threshold: number = 0.7,
    traceId?: string
): Promise<Array<{ id: string; score: number; metadata: Record<string, any>; document?: string }>> {
    if (this.isCircuitOpen()) {
        logWarn('Circuit ouvert, recherche vectorielle ignorée');
        return [];
    }
    
    try {
        const collection = await this.getOrCreateCollection(collectionName, traceId);
        
        // 🔥 CORRECTION TYPESCRIPT : Utilisation de include explicite
        const results = await collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: nResults,
            include: ['distances' as any, 'metadatas' as any, 'documents' as any]
        });
        
        this.recordSuccess();
        
        if (!results?.ids?.[0]?.length) return [];
        
        const formattedResults: Array<{ id: string; score: number; metadata: Record<string, any>; document?: string }> = [];
        for (let i = 0; i < results.ids[0].length; i++) {
            const distance = results.distances?.[0]?.[i] || 0;
            const similarity = Math.max(0, 1 - distance);
            
            if (similarity < threshold) continue;
            
            // 🔥 CORRECTION : Gérer le cas où document peut être null
            const document = results.documents?.[0]?.[i];
            
            formattedResults.push({
                id: results.ids[0][i] as string,
                score: similarity,
                metadata: results.metadatas?.[0]?.[i] || {},
                document: document || undefined
            });
        }
        
        return formattedResults;
    } catch (error) {
        this.recordFailure();
        logError(`searchSimilar failed for ${collectionName}:`, error);
        return [];
    }
}
    async getDocumentsByFilter(
        collectionName: CollectionName,
        where: Record<string, any>,
        limit: number = 1000
    ): Promise<{ ids: string[]; documents: string[]; metadatas: Record<string, any>[] }> {
        try {
            const collection = await this.getOrCreateCollection(collectionName);
            const getArgs: any = { limit };
            if (where && Object.keys(where).length > 0) {
                getArgs.where = where;
            }
            const results = await collection.get(getArgs);
            return {
                ids: results.ids || [],
                documents: (results.documents || []) as string[],
                metadatas: (results.metadatas || []) as Record<string, any>[]
            };
        } catch (error) {
            logWarn(`getDocumentsByFilter failed for ${collectionName}:`, { error });
            return { ids: [], documents: [], metadatas: [] };
        }
    }

    async getCollectionStats(collectionName: CollectionName, traceId?: string): Promise<{
        count: number;
        metadata: Record<string, any>;
        name: string;
    }> {
        const collection = await this.getOrCreateCollection(collectionName, traceId);
        const count = await collection.count();
        const metadata = await (collection as any).metadata;
        return { count, metadata: metadata || {}, name: collectionName };
    }

    async getAllCollectionsStats(): Promise<any[]> {
        const stats = [];
        for (const key of Object.keys(ChromaCollections)) {
            try {
                const collection = await this.getOrCreateCollection(key as CollectionName);
                const count = await collection.count();
                const config = (ChromaCollections as any)[key];
                stats.push({ 
                    count, 
                    id: key, 
                    name: config?.name || key, 
                    description: config?.description || 'No description' 
                });
            } catch (e) {
                stats.push({ id: key, error: "Indisponible" });
            }
        }
        return stats;
    }

    async collectionExists(_zone: string, collectionName: CollectionName): Promise<boolean> {
        try {
            const actualName = ChromaCollections[collectionName]?.name || collectionName;
            await this.client.getCollection({
                name: actualName,
                embeddingFunction: this.embeddingFunction
            });
            return true;
        } catch {
            return false;
        }
    }

    async clearAllCollections(): Promise<void> {
        logInfo('Début du nettoyage de toutes les collections');
        for (const [key, config] of Object.entries(ChromaCollections)) {
            try {
                const collection = await this.getOrCreateCollection(key as CollectionName);
                const allDocs = await collection.get();
                if (allDocs.ids && allDocs.ids.length > 0) {
                    await collection.delete({ ids: allDocs.ids });
                    logInfo(`Cleared ${allDocs.ids.length} documents from ${config.name}`);
                }
            } catch (error) {
                logError(`Error clearing ${config.name}:`, error);
            }
        }
        this.queryCache.clear();
        logInfo('All collections cleared');
    }

    async deleteCollection(collectionName: CollectionName, traceId?: string): Promise<void> {
        const startTime = Date.now();
        
        chromaDBAudit.appToChromaDB('DELETE_COLLECTION', 0, true, {
            collection: collectionName,
            traceId
        });
        
        try {
            const actualName = ChromaCollections[collectionName]?.name || collectionName;
            await this.client.deleteCollection({ name: actualName });
            this.collections.delete(collectionName);
            this.invalidateCache(collectionName);
            const duration = Date.now() - startTime;
            
            chromaDBAudit.chromaDBResponse('DELETE_COLLECTION', duration, true, {
                collection: collectionName,
                traceId
            });
            
            logInfo(`Deleted collection: ${collectionName}`);
        } catch (error: any) {
            const duration = Date.now() - startTime;
            chromaDBAudit.appToChromaDB('DELETE_COLLECTION', duration, false, {
                collection: collectionName,
                traceId,
                error: error.message
            });
            logError(`Error deleting collection ${collectionName}:`, error);
            throw error;
        }
    }

    async listCollections(): Promise<{ name: string }[]> {
        try {
            const collections = await this.client.listCollections();
            // 🔥 CORRECTION ROBUSTE : Supporte à la fois string[] et Collection[]
            return collections.map((c: any) => ({ name: typeof c === 'string' ? c : c.name }));
        } catch (error) {
            logError('Erreur lors du listage des collections:', error);
            return [];
        }
    }

    private invalidateCache(collectionName?: CollectionName): void {
        if (collectionName) {
            const keys = Array.from(this.queryCache.keys());
            for (const key of keys) {
                if (key.startsWith(collectionName)) {
                    this.queryCache.delete(key);
                }
            }
        } else {
            this.queryCache.clear();
        }
    }

    getEmbeddingDimension(): number | null {
        return this.embeddingDimension || getCurrentDimension();
    }
    
    async dispose(): Promise<void> {
        this.stopCleanupTimer();
        this.queryCache.clear();
        this.collections.clear();
        logInfo('ChromaDBManager ressources libérées');
    }
}

// Export singleton
export const chromaDBManager = ChromaDBManager.getInstance();