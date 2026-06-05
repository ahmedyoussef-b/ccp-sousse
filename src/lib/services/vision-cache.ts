// src/lib/services/vision-cache.ts
// Cache centralisé pour l'arborescence vision - évite les requêtes DB redondantes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // ms
}

class VisionTreeCache {
  private cache = new Map<string, CacheEntry<any>>();
  private static instance: VisionTreeCache;

  static getInstance(): VisionTreeCache {
    if (!VisionTreeCache.instance) {
      VisionTreeCache.instance = new VisionTreeCache();
    }
    return VisionTreeCache.instance;
  }

  set<T>(key: string, data: T, ttlMs = 30000): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  invalidate(prefix?: string): void {
    if (!prefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  get size(): number {
    return this.cache.size;
  }
}

export const visionTreeCache = VisionTreeCache.getInstance();

// Helper pour invalider le cache arborescence
export function clearTreeCache(): void {
  visionTreeCache.invalidate('tree:');
}
