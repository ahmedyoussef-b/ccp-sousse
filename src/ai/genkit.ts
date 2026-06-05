// src/ai/genkit.ts (SHIM POUR MIGRATION)
/**
 * @fileOverview Shim Genkit vers HybridProvider pour migration progressive
 * Ce fichier permet une transition douce sans casser tout le code en même temps
 */

import { callHybridProvider } from "./providers/hybrid-provider";


/** Interface compatible avec l'ancien pattern Genkit */
export interface GenkitResponse {
  text: string;
  confidence?: number;
}

export interface GenkitGenerateOptions {
  model: string;
  system?: string;
  prompt: string;
  config?: {
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  };
}

/**
 * Shim qui redirige tous les appels ai.generate() vers callHybridProvider()
 * Utilisable pendant la phase de migration complète du système
 */
const generate = async (options: GenkitGenerateOptions): Promise<GenkitResponse> => {
  const { system, prompt } = options;
  
  // Construire prompt complet
  const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;

  const response = await callHybridProvider(fullPrompt);
  
  return {
    text: response.answer || '',
    confidence: response.confidence || 0
  };
};

export const ai = {
  generate: generate,
  testConnection: async () => true,
};

// Export functions standalone
export const getProviderStats = () => ({
  uptime: Date.now(),
  modelsAvailable: ['phi:2.7b', 'gemma:2b', 'tinyllama:1.1b', 'nomic-embed-text']
});

export const clearCache = () => {
  // Implémenter si nécessaire dans cache-manager
  console.log('[GENKIT-SHIM] Cache cleared');
};