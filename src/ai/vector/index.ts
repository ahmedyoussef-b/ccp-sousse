// src/ai/vector/index.ts
import { isCloudMode } from '../../lib/config/env-mode';
import { IVectorDB } from './IVectorDB';
import { ChromaDBManager } from './chromadb-manager';
import { PGVectorAdapter } from './pgvector-adapter';

// Vérifier si PGVector doit être désactivé (pour Vercel)
const isPGVectorForcedDisabled = (): boolean => {
  if (process.env.VERCEL === '1') return true;
  if (process.env.DISABLE_PGVECTOR === 'true') return true;
  if (process.env.NEXT_PUBLIC_DISABLE_PGVECTOR === 'true') return true;
  return false;
};

class VectorDBFactory {
    private static instance: IVectorDB;

    static getDB(): IVectorDB {
        if (!this.instance) {
            // Si PGVector est forcé désactivé, utiliser ChromaDB (ou fallback)
            const usePGVector = isCloudMode() && !isPGVectorForcedDisabled();
            
            if (usePGVector) {
                console.log('[VectorDB] 📍 Utilisation de PGVector (mode cloud)');
                this.instance = new PGVectorAdapter();
            } else if (isCloudMode() && isPGVectorForcedDisabled()) {
                console.log('[VectorDB] ⚠️ PGVector désactivé sur Vercel, utilisation de ChromaDB (fallback SQLite)');
                this.instance = ChromaDBManager.getInstance();
            } else {
                console.log('[VectorDB] 📍 Utilisation de ChromaDB (mode local)');
                this.instance = ChromaDBManager.getInstance();
            }
            
            this.instance.initialize().catch(console.error);
        }
        return this.instance;
    }
}

export const vectorDB = VectorDBFactory.getDB();