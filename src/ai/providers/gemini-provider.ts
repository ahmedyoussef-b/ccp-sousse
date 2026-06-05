// src/ai/providers/gemini-provider.ts
/**
 * Provider Google Gemini API
 * @version 1.0.0
 * @description Intégration de Google Gemini avec gestion des quotas et fallback
 * @quota 3,000 requêtes/jour (1,500 pour Gemma 4 26B + 1,500 pour Gemma 4 31B)
 * @cost Gratuit (sans carte bancaire)
 */

import { quotaManager } from '../resilience/quota-manager';

export interface GeminiOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  topP?: number;
  topK?: number;
  images?: string[];
}

export interface GeminiResponse {
  text: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

// Modèles Gemini disponibles (v1beta)
// NOTE: gemini-1.5-flash et gemini-2.0-flash-exp ont été retirés/dépréciés.
// Utiliser gemini-2.0-flash (stable) ou gemini-2.5-flash (dernière génération).
export const GEMINI_MODELS = {
  GEMINI_2_5_FLASH: 'gemini-2.5-flash',
  GEMINI_2_0_FLASH: 'gemini-2.0-flash',
  GEMINI_1_5_FLASH: 'gemini-2.0-flash', // Alias → modèle stable actuel
  GEMINI_1_5_FLASH_LATEST: 'gemini-2.0-flash', // Alias → modèle stable actuel
  GEMINI_1_5_PRO: 'gemini-2.0-flash', // Alias → modèle stable actuel (Pro payant)
  GEMINI_1_5_PRO_LATEST: 'gemini-2.0-flash', // Alias → modèle stable actuel
  GEMMA_2_27B: 'gemma-2-27b-it',
  GEMMA_2_9B: 'gemma-2-9b-it'
} as const;

export type GeminiModel = typeof GEMINI_MODELS[keyof typeof GEMINI_MODELS];

// Configuration par défaut
const DEFAULT_CONFIG = {
  model: GEMINI_MODELS.GEMINI_2_0_FLASH,
  temperature: 0.3,
  maxTokens: 2000,
  timeout: 45000,
  topP: 0.9,
  topK: 40
};

// ============================================================================
// FONCTIONS PRINCIPALES
// ============================================================================

/**
 * Appelle l'API Google Gemini
 */
export async function callGemini(
  prompt: string,
  options: GeminiOptions = {}
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY non définie dans .env.local');
  }

  const {
    model = DEFAULT_CONFIG.model,
    temperature = DEFAULT_CONFIG.temperature,
    maxTokens = DEFAULT_CONFIG.maxTokens,
    timeout = DEFAULT_CONFIG.timeout,
    topP = DEFAULT_CONFIG.topP,
    topK = DEFAULT_CONFIG.topK
  } = options;

  const startTime = Date.now();
  
  console.log(`[GEMINI] 🚀 Appel à ${model}...`);
  console.log(`[GEMINI] 📊 Paramètres: temperature=${temperature}, maxTokens=${maxTokens}, timeout=${timeout}ms`);

  // 🔧 CORRECTION : Utiliser v1beta pour tous les modèles actuels
  const apiVersion = 'v1beta';
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;
  
  console.log(`[GEMINI] 🔗 URL: ${url.replace(apiKey, 'HIDDEN')}`);
  
  const parts: any[] = [{ text: prompt }];
  
  if (options.images && options.images.length > 0) {
    for (const image of options.images) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: image.replace(/^data:image\/\w+;base64,/, "")
        }
      });
    }
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: maxTokens,
      topP: topP,
      topK: topK
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      }
    ]
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      
      if (response.status === 404) {
        console.error(`[GEMINI] ❌ Modèle ${model} non trouvé. Modèles disponibles: gemini-1.5-flash, gemini-1.5-pro, gemma-2-27b-it`);
      }
      
      if (response.status === 429) {
        console.error(`[GEMINI] ❌ Rate limit atteint: ${errorMessage}`);
        throw new Error(`Gemini rate limit: ${errorMessage}`);
      }
      
      throw new Error(`Gemini API error (${response.status}): ${errorMessage}`);
    }

    const data = await response.json();
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error('Réponse Gemini vide ou invalide');
    }

    const estimatedTokens = Math.ceil(text.length / 4);
    const estimatedPromptTokens = Math.ceil(prompt.length / 4);
    
    console.log(`[GEMINI] ✅ Réponse générée en ${duration}ms`);
    console.log(`[GEMINI] 📊 Tokens estimés: ${estimatedPromptTokens} in, ${estimatedTokens} out`);
    console.log(`[GEMINI] 📝 Réponse: ${text.substring(0, 100)}...`);
    
    // Enregistrer l'utilisation dans le QuotaManager
    await quotaManager.recordUsage('gemini');
    
    return text;

  } catch (error: any) {
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    
    if (error.name === 'AbortError') {
      console.error(`[GEMINI] ❌ Timeout après ${duration}ms`);
      throw new Error(`Gemini timeout after ${timeout}ms`);
    }
    
    console.error(`[GEMINI] ❌ Erreur après ${duration}ms:`, error.message);
    throw error;
  }
}
// ============================================================================
// FONCTIONS STREAMING (si supporté par Gemini)
// ============================================================================

/**
 * Version streaming pour Gemini (utilise SSE)
 */
export async function* callGeminiStream(
  prompt: string,
  options: GeminiOptions = {}
): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY non définie dans .env.local');
  }

  const {
    model = DEFAULT_CONFIG.model,
    temperature = DEFAULT_CONFIG.temperature,
    maxTokens = DEFAULT_CONFIG.maxTokens,
    timeout = DEFAULT_CONFIG.timeout
  } = options;

  console.log(`[GEMINI] 🌊 Streaming avec ${model}...`);

  // 🔧 CORRECTION : Toujours utiliser v1beta (v1 ne supporte plus les modèles récents)
  const apiVersion = 'v1beta';
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:streamGenerateContent?key=${apiKey}`;
  
  const body = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: maxTokens
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error (${response.status}): ${errorData.error?.message || response.statusText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body for streaming');
    }

    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() && line.startsWith('data: ')) {
          try {
            const jsonStr = line.slice(6);
            const data = JSON.parse(jsonStr);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              yield text;
            }
          } catch (e) {
            // Ignorer les lignes mal formées
          }
        }
      }
    }

    console.log(`[GEMINI] ✅ Streaming terminé`);

  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error(`[GEMINI] ❌ Streaming error:`, error.message);
    throw error;
  }
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Vérifie si l'API Gemini est disponible
 */

export async function isGeminiAvailable(): Promise<{
  available: boolean;
  models: string[];
  error?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return { available: false, models: [], error: 'GEMINI_API_KEY non définie' };
  }

  try {
    // 🔧 CORRECTION : Utiliser v1beta pour lister les modèles
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    
    if (!response.ok) {
      return { available: false, models: [], error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    const models = data.models?.map((m: any) => m.name.replace('models/', '')) || [];
    const availableModels = models.filter((m: string) => 
      m.includes('gemma') || m.includes('gemini')
    );
    
    console.log(`[GEMINI] ✅ Disponible: ${availableModels.length} modèles`);
    console.log(`[GEMINI] 📋 Modèles: ${availableModels.slice(0, 5).join(', ')}...`);
    
    return { available: true, models: availableModels };
    
  } catch (error: any) {
    return { available: false, models: [], error: error.message };
  }
}
/**
 * Test rapide de l'API Gemini
 */
export async function testGeminiConnection(): Promise<{
  success: boolean;
  latency: number;
  response?: string;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    const response = await callGemini("Réponds par 'OK' si tu fonctionnes.", {
      maxTokens: 10,
      temperature: 0
    });
    
    const latency = Date.now() - startTime;
    
    return {
      success: true,
      latency,
      response: response.substring(0, 50)
    };
    
  } catch (error: any) {
    return {
      success: false,
      latency: Date.now() - startTime,
      error: error.message
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  callGemini,
  callGeminiStream,
  isGeminiAvailable,
  testGeminiConnection,
  GEMINI_MODELS
};