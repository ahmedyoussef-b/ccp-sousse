// lib/services/ttsCache.ts
import fs from 'fs';
import path from 'path';

class TTSCache {
  private cacheDir: string;
  private maxSize: number; // en bytes
  private maxAge: number; // en ms

  constructor() {
    this.cacheDir = path.join(process.cwd(), 'data/tts/cache');
    this.maxSize = 500 * 1024 * 1024; // 500 MB
    this.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 jours
    
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Récupérer un fichier du cache
   */
  async get(key: string): Promise<Buffer | null> {
    const filePath = path.join(this.cacheDir, key);
    
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const stats = await fs.promises.stat(filePath);
      const age = Date.now() - stats.mtimeMs;
      
      if (age > this.maxAge) {
        await fs.promises.unlink(filePath);
        return null;
      }
      
      return await fs.promises.readFile(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Sauvegarder dans le cache
   */
  async set(key: string, data: Buffer): Promise<void> {
    const filePath = path.join(this.cacheDir, key);
    
    try {
      await fs.promises.writeFile(filePath, data);
      await this.cleanup();
    } catch (error) {
      console.error('Erreur cache:', error);
    }
  }

  /**
   * Nettoyer le cache (anciens fichiers + taille max)
   */
  async cleanup(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      const now = Date.now();
      
      // Supprimer les fichiers trop vieux
      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stats = await fs.promises.stat(filePath);
        
        if (now - stats.mtimeMs > this.maxAge) {
          await fs.promises.unlink(filePath);
        }
      }
      
      // Vérifier la taille totale
      let totalSize = 0;
      const fileStats = await Promise.all(
        files.map(async file => {
          const filePath = path.join(this.cacheDir, file);
          const stats = await fs.promises.stat(filePath);
          totalSize += stats.size;
          return { file, stats, path: filePath };
        })
      );
      
      // Si trop gros, supprimer les plus vieux
      if (totalSize > this.maxSize) {
        fileStats.sort((a, b) => a.stats.mtimeMs - b.stats.mtimeMs);
        
        while (totalSize > this.maxSize && fileStats.length > 0) {
          const oldest = fileStats.shift();
          if (oldest) {
            totalSize -= oldest.stats.size;
            await fs.promises.unlink(oldest.path);
          }
        }
      }
    } catch (error) {
      console.error('Erreur nettoyage cache:', error);
    }
  }

  /**
   * Vider complètement le cache
   */
  async clear(): Promise<void> {
    const files = await fs.promises.readdir(this.cacheDir);
    await Promise.all(
      files.map(file => fs.promises.unlink(path.join(this.cacheDir, file)))
    );
  }
}

export default new TTSCache();