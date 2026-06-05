import { isCloudMode } from '../config/env-mode';
import { StorageAdapter } from './StorageAdapter';
import { LocalFSAdapter } from './LocalFSAdapter';
import { VercelBlobAdapter } from './VercelBlobAdapter';

class StorageFactory {
    private static instance: StorageAdapter;

    static getStorage(): StorageAdapter {
        if (!this.instance) {
            this.instance = isCloudMode() 
                ? new VercelBlobAdapter() 
                : new LocalFSAdapter();
        }
        return this.instance;
    }
}

export const storage = StorageFactory.getStorage();
export type { StorageAdapter };
