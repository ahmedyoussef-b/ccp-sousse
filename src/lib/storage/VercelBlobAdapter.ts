import { put, del, list } from '@vercel/blob';
import { StorageAdapter } from './StorageAdapter';

export class VercelBlobAdapter implements StorageAdapter {
    async put(filepath: string, data: string | Buffer | object, options?: { contentType?: string, isPublic?: boolean }): Promise<string> {
        let contentToWrite: string | Buffer;
        if (Buffer.isBuffer(data) || typeof data === 'string') {
            contentToWrite = data;
        } else {
            contentToWrite = JSON.stringify(data, null, 2);
        }

        const blob = await put(filepath, contentToWrite, {
            access: 'public', // Vercel Blob est public par défaut
            addRandomSuffix: false, // Important pour pouvoir récupérer le fichier par son nom exact
            contentType: options?.contentType
        });
        
        return blob.url;
    }

    async get(filepath: string): Promise<string | Buffer | null> {
        try {
            const { blobs } = await list({ prefix: filepath, limit: 1 });
            if (blobs.length === 0) return null;
            
            const response = await fetch(blobs[0].url);
            if (!response.ok) return null;
            
            return await response.text();
        } catch (error) {
            console.error(`[VercelBlob] Erreur lors de la récupération de ${filepath}:`, error);
            return null;
        }
    }

    async getJSON<T>(filepath: string): Promise<T | null> {
        const content = await this.get(filepath);
        if (!content) return null;
        try {
            return JSON.parse(content as string) as T;
        } catch {
            return null;
        }
    }

    async delete(filepath: string): Promise<boolean> {
        try {
            const { blobs } = await list({ prefix: filepath, limit: 1 });
            if (blobs.length === 0) return false;
            
            await del(blobs[0].url);
            return true;
        } catch (error) {
            console.error(`[VercelBlob] Erreur lors de la suppression de ${filepath}:`, error);
            return false;
        }
    }
}
