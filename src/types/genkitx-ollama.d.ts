// src/types/genkitx-ollama.d.ts
declare module 'genkitx-ollama' {
    export interface OllamaPluginOptions {
      models: Array<{
        name: string;
        type: 'chat' | 'generate' | 'embedding';
      }>;
      serverUrl?: string;
    }
  
    export function ollama(options: OllamaPluginOptions): any;
  }