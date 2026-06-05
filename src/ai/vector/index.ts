import { isCloudMode } from '../../lib/config/env-mode';
import { IVectorDB } from './IVectorDB';
import { ChromaDBManager } from './chromadb-manager';
import { PGVectorAdapter } from './pgvector-adapter';

class VectorDBFactory {
    private static instance: IVectorDB;

    static getDB(): IVectorDB {
        if (!this.instance) {
            this.instance = isCloudMode() 
                ? new PGVectorAdapter()
                : ChromaDBManager.getInstance();
            
            this.instance.initialize().catch(console.error);
        }
        return this.instance;
    }
}

export const vectorDB = VectorDBFactory.getDB();
