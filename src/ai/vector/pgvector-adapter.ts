import { sql } from '@vercel/postgres';
import { CollectionName } from './chromadb-schema';
import { IVectorDB, VectorDocument, VectorSearchResult } from './IVectorDB';

export class PGVectorAdapter implements IVectorDB {
    async initialize(): Promise<void> {
        try {
            await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
            await sql`
                CREATE TABLE IF NOT EXISTS embeddings (
                    id TEXT PRIMARY KEY,
                    collection_name TEXT NOT NULL,
                    content TEXT,
                    metadata JSONB,
                    embedding vector(768)
                );
            `;
            await sql`
                CREATE INDEX IF NOT EXISTS embeddings_collection_idx ON embeddings (collection_name);
            `;
            console.log('✅ PGVector initialized');
        } catch (e) {
            console.error('❌ Failed to initialize PGVector:', e);
        }
    }

    async getStatus(): Promise<{ connected: boolean; version?: string; embeddingDimension?: number; error?: string }> {
        try {
            await sql`SELECT 1`;
            return { connected: true, version: 'pgvector via @vercel/postgres' };
        } catch (e: any) {
            return { connected: false, error: e.message };
        }
    }

    async addDocuments(collectionName: CollectionName, documents: VectorDocument[], traceId?: string): Promise<void> {
        for (const doc of documents) {
            if (doc.embedding) {
                const embeddingStr = `[${doc.embedding.join(',')}]`;
                await sql`
                    INSERT INTO embeddings (id, collection_name, content, metadata, embedding)
                    VALUES (${doc.id}, ${collectionName}, ${doc.content}, ${JSON.stringify(doc.metadata)}, ${embeddingStr}::vector)
                    ON CONFLICT (id) DO NOTHING;
                `;
            }
        }
    }

    async upsertDocuments(collectionName: CollectionName, documents: VectorDocument[], traceId?: string): Promise<void> {
        for (const doc of documents) {
            if (doc.embedding) {
                const embeddingStr = `[${doc.embedding.join(',')}]`;
                await sql`
                    INSERT INTO embeddings (id, collection_name, content, metadata, embedding)
                    VALUES (${doc.id}, ${collectionName}, ${doc.content}, ${JSON.stringify(doc.metadata)}, ${embeddingStr}::vector)
                    ON CONFLICT (id) DO UPDATE 
                    SET content = EXCLUDED.content, 
                        metadata = EXCLUDED.metadata, 
                        embedding = EXCLUDED.embedding;
                `;
            }
        }
    }

    async deleteDocuments(collectionName: CollectionName, ids: string[], traceId?: string): Promise<void> {
        if (ids.length === 0) return;
        await sql`
            DELETE FROM embeddings 
            WHERE collection_name = ${collectionName} 
            AND id = ANY(${ids as any});
        `;
    }

    async search(collectionName: CollectionName, query: string, options?: any): Promise<any> {
        const res = await sql`
            SELECT id, content, metadata 
            FROM embeddings 
            WHERE collection_name = ${collectionName} 
            AND content ILIKE ${'%' + query + '%'}
            LIMIT ${options?.nResults || 10}
        `;
        
        return {
            ids: [res.rows.map(r => r.id)],
            documents: [res.rows.map(r => r.content)],
            metadatas: [res.rows.map(r => r.metadata)]
        };
    }

    async searchSimilar(collectionName: CollectionName, queryEmbedding: number[], nResults: number = 10, threshold: number = 0.7, traceId?: string): Promise<VectorSearchResult[]> {
        const embeddingStr = `[${queryEmbedding.join(',')}]`;
        
        const res = await sql`
            SELECT id, content, metadata, 1 - (embedding <=> ${embeddingStr}::vector) as similarity
            FROM embeddings
            WHERE collection_name = ${collectionName}
            ORDER BY embedding <=> ${embeddingStr}::vector
            LIMIT ${nResults};
        `;
        
        return res.rows
            .filter(r => r.similarity >= threshold)
            .map(r => ({
                id: r.id,
                score: r.similarity,
                metadata: r.metadata,
                document: r.content
            }));
    }

    async getDocumentsByFilter(collectionName: CollectionName, where: Record<string, any>, limit: number = 1000): Promise<{ ids: string[]; documents: string[]; metadatas: Record<string, any>[] }> {
        const res = await sql`
            SELECT id, content, metadata
            FROM embeddings
            WHERE collection_name = ${collectionName}
            LIMIT ${limit};
        `;
        
        return {
            ids: res.rows.map(r => r.id),
            documents: res.rows.map(r => r.content),
            metadatas: res.rows.map(r => r.metadata)
        };
    }

    async getCollectionStats(collectionName: CollectionName, traceId?: string): Promise<{ count: number; metadata: Record<string, any>; name: string; }> {
        const res = await sql`
            SELECT COUNT(*) as count 
            FROM embeddings 
            WHERE collection_name = ${collectionName};
        `;
        return {
            count: parseInt(res.rows[0].count),
            metadata: {},
            name: collectionName
        };
    }

    async getAllCollectionsStats(): Promise<any[]> {
        const res = await sql`
            SELECT collection_name, COUNT(*) as count
            FROM embeddings
            GROUP BY collection_name;
        `;
        return res.rows.map(r => ({
            id: r.collection_name,
            name: r.collection_name,
            count: parseInt(r.count)
        }));
    }

    async clearAllCollections(): Promise<void> {
        await sql`TRUNCATE TABLE embeddings;`;
    }
}
