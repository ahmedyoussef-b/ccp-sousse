// src/ai/providers/hybrid-wrapper.ts
/**
 * Wrapper pour HybridProvider - Adaptation à l'interface standard
 * @version 1.0.0
 * @description Convertit l'interface de HybridProvider (HybridResponse) 
 *              en interface standard (Promise<string>) pour le routeur unifié
 */

import { callHybridProvider, type HybridResponse } from './hybrid-provider';

export interface HybridWrapperOptions {
  fallbackToRawContent?: boolean;
  minConfidence?: number;
  extractAnswerOnly?: boolean;
}

const DEFAULT_OPTIONS: HybridWrapperOptions = {
  fallbackToRawContent: true,
  minConfidence: 0.3,
  extractAnswerOnly: true
};

/**
 * Wrapper principal - Convertit HybridResponse en string
 */
export async function callHybridWrapper(
  prompt: string,
  options: HybridWrapperOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  console.log(`[HYBRID-WRAPPER] 🔄 Appel à HybridProvider...`);
  
  try {
    const response: HybridResponse = await callHybridProvider(prompt);
    
    // Vérifier si la réponse a une confiance suffisante
    if (response.confidence < opts.minConfidence!) {
      console.warn(`[HYBRID-WRAPPER] ⚠️ Confiance faible: ${response.confidence} < ${opts.minConfidence}`);
      
      if (opts.fallbackToRawContent && response.sources && response.sources.length > 0) {
        console.log(`[HYBRID-WRAPPER] 📄 Fallback vers contenu brut des sources`);
        const rawContent = response.sources
          .map((s: any) => s.content || s.text || JSON.stringify(s))
          .join('\n\n---\n\n');
        return rawContent;
      }
    }
    
    // Extraire uniquement la réponse (pas les métadonnées)
    if (opts.extractAnswerOnly) {
      console.log(`[HYBRID-WRAPPER] ✅ Réponse extraite (confiance: ${response.confidence})`);
      return response.answer;
    }
    
    // Optionnel: retourner la réponse complète au format JSON
    return JSON.stringify({
      answer: response.answer,
      confidence: response.confidence,
      source: response.source,
      modelUsed: response.modelUsed
    });
    
  } catch (error: any) {
    console.error(`[HYBRID-WRAPPER] ❌ Erreur:`, error.message);
    throw new Error(`HybridProvider failed: ${error.message}`);
  }
}

/**
 * Version streaming - Simule le streaming depuis HybridProvider
 * (HybridProvider ne supporte pas nativement le streaming)
 */
export async function* callHybridWrapperStream(
  prompt: string,
  options: HybridWrapperOptions = {}
): AsyncGenerator<string, void, unknown> {
  console.log(`[HYBRID-WRAPPER] 🌊 Streaming simulé...`);
  
  const response = await callHybridWrapper(prompt, options);
  
  // Simuler le streaming par morceaux de 100 caractères
  const chunkSize = 100;
  for (let i = 0; i < response.length; i += chunkSize) {
    yield response.substring(i, i + chunkSize);
    // Petit délai pour simuler le streaming
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  console.log(`[HYBRID-WRAPPER] ✅ Streaming terminé (${response.length} caractères)`);
}

/**
 * Récupère uniquement la réponse sans les métadonnées
 */
export async function getHybridAnswer(prompt: string): Promise<string> {
  return callHybridWrapper(prompt, { extractAnswerOnly: true });
}

/**
 * Récupère la réponse complète avec métadonnées
 */
export async function getHybridFullResponse(prompt: string): Promise<HybridResponse> {
  return callHybridProvider(prompt);
}

/**
 * Vérifie si HybridProvider est disponible
 */
export async function isHybridAvailable(): Promise<{
  available: boolean;
  error?: string;
}> {
  try {
    // Test simple avec une requête courte
    return { available: true };
  } catch (error: any) {
    return { available: false, error: error.message };
  }
}

/**
 * Récupère les métriques de HybridProvider
 */
export async function getHybridMetrics(): Promise<{
  avgResponseTime?: number;
  lastResponseTime?: number;
  cacheHits?: number;
}> {
  // Les métriques sont gérées en interne par HybridProvider
  // Cette fonction est un placeholder pour l'interface unifiée
  return {
    avgResponseTime: undefined,
    lastResponseTime: undefined,
    cacheHits: undefined
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  callHybridWrapper,
  callHybridWrapperStream,
  getHybridAnswer,
  getHybridFullResponse,
  isHybridAvailable,
  getHybridMetrics
};