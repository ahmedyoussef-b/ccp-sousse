// src/types/global.d.ts
declare module 'genkitx-ollama' {
    export interface OllamaModel {
      name: string;
      type: 'chat' | 'generate' | 'embedding';
    }
  
    export interface OllamaPluginOptions {
      models: OllamaModel[];
      serverUrl?: string;
    }
  
    export function ollama(options: OllamaPluginOptions): any;
  }
  
  // Extension des types pour le cache
  interface CacheEntry {
    embedding: number[];
    response: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  }
  
  interface SearchResult {
    id: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
    similarity: number;
  }
  
  declare module '*.css';