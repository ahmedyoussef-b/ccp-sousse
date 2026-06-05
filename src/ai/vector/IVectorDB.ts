import { CollectionName } from './chromadb-schema';

export interface VectorDocument {
    id: string;
    content: string;
    metadata: Record<string, any>;
    embedding?: number[];
}

export interface VectorSearchResult {
    id: string;
    score: number;
    metadata: Record<string, any>;
    document?: string;
}

export interface IVectorDB {
    initialize(): Promise<void>;
    
    getStatus(): Promise<{ connected: boolean; version?: string; embeddingDimension?: number; error?: string }>;
    
    addDocuments(collectionName: CollectionName, documents: VectorDocument[], traceId?: string): Promise<void>;
    
    upsertDocuments(collectionName: CollectionName, documents: VectorDocument[], traceId?: string): Promise<void>;
    
    deleteDocuments(collectionName: CollectionName, ids: string[], traceId?: string): Promise<void>;
    
    search(collectionName: CollectionName, query: string, options?: any): Promise<any>;
    
    searchSimilar(collectionName: CollectionName, queryEmbedding: number[], nResults?: number, threshold?: number, traceId?: string): Promise<VectorSearchResult[]>;
    
    getDocumentsByFilter(collectionName: CollectionName, where: Record<string, any>, limit?: number): Promise<{ ids: string[]; documents: string[]; metadatas: Record<string, any>[] }>;
    
    getCollectionStats(collectionName: CollectionName, traceId?: string): Promise<{ count: number; metadata: Record<string, any>; name: string; }>;
    
    getAllCollectionsStats(): Promise<any[]>;
    
    clearAllCollections(): Promise<void>;
}
