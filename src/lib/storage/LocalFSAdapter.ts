import * as fs from 'fs';
import * as path from 'path';
import { StorageAdapter } from './StorageAdapter';

export class LocalFSAdapter implements StorageAdapter {
    private getAbsolutePath(filepath: string): string {
        // Résout par rapport à la racine du projet
        return path.resolve(process.cwd(), filepath);
    }

    private ensureDirectoryExists(filepath: string) {
        const dirname = path.dirname(filepath);
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname, { recursive: true });
        }
    }

    async put(filepath: string, data: string | Buffer | object, options?: { contentType?: string, isPublic?: boolean }): Promise<string> {
        const absolutePath = this.getAbsolutePath(filepath);
        this.ensureDirectoryExists(absolutePath);

        let contentToWrite: string | Buffer;
        if (Buffer.isBuffer(data) || typeof data === 'string') {
            contentToWrite = data;
        } else {
            contentToWrite = JSON.stringify(data, null, 2);
        }

        fs.writeFileSync(absolutePath, contentToWrite);
        
        // En local, on retourne souvent le chemin relatif pour l'utilisation dans src/
        return filepath;
    }

    async get(filepath: string): Promise<string | Buffer | null> {
        const absolutePath = this.getAbsolutePath(filepath);
        if (!fs.existsSync(absolutePath)) return null;
        
        return fs.readFileSync(absolutePath, 'utf-8');
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
        const absolutePath = this.getAbsolutePath(filepath);
        if (!fs.existsSync(absolutePath)) return false;
        
        try {
            fs.unlinkSync(absolutePath);
            return true;
        } catch {
            return false;
        }
    }
}
