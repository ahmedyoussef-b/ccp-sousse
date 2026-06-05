// src/ai/providers/cerebras-provider.ts
/**
 * Provider Cerebras API - Version avec tracker de performance intégré
 * @version 1.1.0
 * @description Intégration de Cerebras avec suivi des performances et métriques
 * @quota 30 req/min, 14,400 req/jour, 60,000 tokens/min
 */

export interface CerebrasOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface CerebrasResponse {
  text: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

// Modèles Cerebras disponibles gratuitement
export const CEREBRAS_MODELS = {
  LLAMA_3_1_8B: 'llama3.1-8b',
  GPT_OSS_120B: 'gpt-oss-120b'
} as const;

export type CerebrasModel = typeof CEREBRAS_MODELS[keyof typeof CEREBRAS_MODELS];

// Configuration par défaut
const DEFAULT_CONFIG = {
  model: CEREBRAS_MODELS.LLAMA_3_1_8B,
  temperature: 0.3,
  maxTokens: 2000,
  timeout: 30000,
  topP: 0.9,
  frequencyPenalty: 0,
  presencePenalty: 0
};

// ============================================================================
// TRACKER DE PERFORMANCE CEREBRAS
// ============================================================================

interface CerebrasCallRecord {
  timestamp: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  tokensPerSecond: number;
  success: boolean;
  error?: string;
}

interface CerebrasMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  successRate: number;
  totalTokens: number;
  totalDurationMs: number;
  avgResponseTimeMs: number;
  avgTokensPerSecond: number;
  avgTokensPerCall: number;
  lastMinuteCalls: number;
  lastMinuteTokens: number;
  modelUsage: Map<string, number>;
  recentCalls: CerebrasCallRecord[];
}

class CerebrasPerformanceTracker {
  private static instance: CerebrasPerformanceTracker;
  private calls: CerebrasCallRecord[] = [];
  private readonly MAX_RECENT_CALLS = 100;
  private readonly RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

  private constructor() {}

  static getInstance(): CerebrasPerformanceTracker {
    if (!CerebrasPerformanceTracker.instance) {
      CerebrasPerformanceTracker.instance = new CerebrasPerformanceTracker();
    }
    return CerebrasPerformanceTracker.instance;
  }

  /**
   * Enregistre un appel Cerebras
   */
  recordCall(record: CerebrasCallRecord): void {
    this.calls.unshift(record);
    
    // Garder seulement les N derniers appels
    if (this.calls.length > this.MAX_RECENT_CALLS) {
      this.calls.pop();
    }
    
    // Log des métriques importantes
    if (record.success) {
      console.log(`[CEREBRAS-TRACKER] 📊 Call #${this.calls.length}: ${record.durationMs}ms, ${record.tokensPerSecond.toFixed(1)} tok/s, ${record.totalTokens} tokens`);
    } else {
      console.warn(`[CEREBRAS-TRACKER] ❌ Échec: ${record.error}`);
    }
  }

  /**
   * Récupère les métriques complètes
   */
  getMetrics(): CerebrasMetrics {
    const successfulCalls = this.calls.filter(c => c.success);
    const failedCalls = this.calls.filter(c => !c.success);
    const totalCalls = this.calls.length;
    
    const totalTokens = successfulCalls.reduce((sum, c) => sum + c.totalTokens, 0);
    const totalDuration = successfulCalls.reduce((sum, c) => sum + c.durationMs, 0);
    
    // Calcul des moyennes
    const avgResponseTime = successfulCalls.length > 0 
      ? totalDuration / successfulCalls.length 
      : 0;
    
    const avgTokensPerSecond = successfulCalls.length > 0
      ? successfulCalls.reduce((sum, c) => sum + c.tokensPerSecond, 0) / successfulCalls.length
      : 0;
    
    const avgTokensPerCall = successfulCalls.length > 0
      ? totalTokens / successfulCalls.length
      : 0;
    
    // Statistiques de la dernière minute
    const now = Date.now();
    const lastMinuteCallsList = this.calls.filter(c => 
      now - c.timestamp < this.RATE_LIMIT_WINDOW_MS
    );
    const lastMinuteSuccessful = lastMinuteCallsList.filter(c => c.success);
    const lastMinuteTokens = lastMinuteSuccessful.reduce((sum, c) => sum + c.totalTokens, 0);
    
    // Modèles utilisés
    const modelUsage = new Map<string, number>();
    for (const call of this.calls) {
      if (call.success) {
        const count = modelUsage.get(call.model) || 0;
        modelUsage.set(call.model, count + 1);
      }
    }
    
    return {
      totalCalls,
      successfulCalls: successfulCalls.length,
      failedCalls: failedCalls.length,
      successRate: totalCalls > 0 ? successfulCalls.length / totalCalls : 0,
      totalTokens,
      totalDurationMs: totalDuration,
      avgResponseTimeMs: avgResponseTime,
      avgTokensPerSecond: avgTokensPerSecond,
      avgTokensPerCall: avgTokensPerCall,
      lastMinuteCalls: lastMinuteCallsList.length,
      lastMinuteTokens: lastMinuteTokens,
      modelUsage,
      recentCalls: this.calls.slice(0, 10)
    };
  }

  /**
   * Vérifie si on approche du rate limit
   */
  isNearRateLimit(): boolean {
    const metrics = this.getMetrics();
    const RATE_LIMIT_REQUESTS = 30; // 30 req/min
    const RATE_LIMIT_TOKENS = 60000; // 60k tokens/min
    
    const isNearRequests = metrics.lastMinuteCalls >= RATE_LIMIT_REQUESTS * 0.8; // 80% du quota
    const isNearTokens = metrics.lastMinuteTokens >= RATE_LIMIT_TOKENS * 0.8;
    
    if (isNearRequests || isNearTokens) {
      console.warn(`[CEREBRAS-TRACKER] ⚠️ Proche du rate limit: ${metrics.lastMinuteCalls}/30 req, ${metrics.lastMinuteTokens}/60000 tokens`);
    }
    
    return isNearRequests || isNearTokens;
  }

  /**
   * Estime le temps avant reset du rate limit
   */
  getTimeToReset(): number {
    const now = Date.now();
    const oldestInWindow = this.calls.find(c => 
      now - c.timestamp < this.RATE_LIMIT_WINDOW_MS
    );
    
    if (!oldestInWindow) return 0;
    
    const oldestTimestamp = oldestInWindow.timestamp;
    const timeSinceOldest = now - oldestTimestamp;
    const timeToReset = Math.max(0, this.RATE_LIMIT_WINDOW_MS - timeSinceOldest);
    
    return timeToReset;
  }

  /**
   * Génère un rapport complet
   */
  generateReport(): string {
    const metrics = this.getMetrics();
    const timeToReset = this.getTimeToReset();
    
    return `
╔══════════════════════════════════════════════════════════════╗
║              CEREBRAS PERFORMANCE REPORT                     ║
╠══════════════════════════════════════════════════════════════╣
║ 📊 STATISTIQUES GLOBALES                                      ║
║   ├─ Total appels: ${metrics.totalCalls}
║   ├─ Succès: ${metrics.successfulCalls}
║   ├─ Échecs: ${metrics.failedCalls}
║   └─ Taux succès: ${(metrics.successRate * 100).toFixed(1)}%
╠══════════════════════════════════════════════════════════════╣
║ ⚡ PERFORMANCES                                               ║
║   ├─ Temps réponse moyen: ${metrics.avgResponseTimeMs.toFixed(0)}ms
║   ├─ Vitesse moyenne: ${metrics.avgTokensPerSecond.toFixed(1)} tok/s
║   └─ Tokens moyen/appel: ${metrics.avgTokensPerCall.toFixed(0)}
╠══════════════════════════════════════════════════════════════╣
║ 🔄 RATE LIMIT (dernière minute)                               ║
║   ├─ Requêtes: ${metrics.lastMinuteCalls}/30
║   ├─ Tokens: ${metrics.lastMinuteTokens}/60000
║   └─ Reset dans: ${(timeToReset / 1000).toFixed(0)}s
╠══════════════════════════════════════════════════════════════╣
║ 🎯 MODÈLES UTILISÉS                                          ║
${Array.from(metrics.modelUsage.entries()).map(([model, count]) => 
  `║   ├─ ${model}: ${count} appels`
).join('\n')}
╚══════════════════════════════════════════════════════════════╝
    `;
  }

  /**
   * Réinitialise les statistiques
   */
  reset(): void {
    this.calls = [];
    console.log(`[CEREBRAS-TRACKER] 🔄 Statistiques réinitialisées`);
  }
}

// Export du tracker
export const cerebrasTracker = CerebrasPerformanceTracker.getInstance();

// ============================================================================
// FONCTIONS PRINCIPALES AVEC TRACKER
// ============================================================================

/**
 * Appelle l'API Cerebras avec tracking des performances
 */
export async function callCerebras(
  prompt: string,
  options: CerebrasOptions = {}
): Promise<string> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  
  if (!apiKey) {
    throw new Error('CEREBRAS_API_KEY non définie dans .env.local');
  }

  const {
    model = DEFAULT_CONFIG.model,
    temperature = DEFAULT_CONFIG.temperature,
    maxTokens = DEFAULT_CONFIG.maxTokens,
    timeout = DEFAULT_CONFIG.timeout,
    topP = DEFAULT_CONFIG.topP,
    frequencyPenalty = DEFAULT_CONFIG.frequencyPenalty,
    presencePenalty = DEFAULT_CONFIG.presencePenalty
  } = options;

  const startTime = Date.now();
  
  console.log(`[CEREBRAS] 🚀 Appel à ${model}...`);
  console.log(`[CEREBRAS] 📊 Paramètres: temperature=${temperature}, maxTokens=${maxTokens}, timeout=${timeout}ms`);

  const url = 'https://api.cerebras.ai/v1/chat/completions';
  
  const body = {
    model: model,
    messages: [
      {
        role: 'system',
        content: 'Tu es un assistant industriel expert. Réponds en français de manière précise et technique, en te basant uniquement sur les informations fournies.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: temperature,
    max_tokens: maxTokens,
    top_p: topP,
    frequency_penalty: frequencyPenalty,
    presence_penalty: presencePenalty,
    stream: false
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      
      // Enregistrer l'échec dans le tracker
      cerebrasTracker.recordCall({
        timestamp: Date.now(),
        model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        durationMs: duration,
        tokensPerSecond: 0,
        success: false,
        error: errorMessage
      });
      
      if (response.status === 429) {
        const timeToReset = cerebrasTracker.getTimeToReset();
        console.error(`[CEREBRAS] ❌ Rate limit atteint. Reset dans ${(timeToReset / 1000).toFixed(0)}s`);
        throw new Error(`Cerebras rate limit: ${errorMessage}`);
      }
      
      throw new Error(`Cerebras API error (${response.status}): ${errorMessage}`);
    }

    const data = await response.json();
    
    // Extraire le texte de la réponse
    const text = data.choices?.[0]?.message?.content;
    
    if (!text) {
      throw new Error('Réponse Cerebras vide ou invalide');
    }

    const usage = data.usage || {};
    const promptTokens = usage.prompt_tokens || Math.ceil(prompt.length / 4);
    const completionTokens = usage.completion_tokens || Math.ceil(text.length / 4);
    const totalTokens = promptTokens + completionTokens;
    
    // Calcul de la vitesse
    const tokensPerSecond = duration > 0 ? (completionTokens / (duration / 1000)) : 0;
    
    // Enregistrer le succès dans le tracker
    cerebrasTracker.recordCall({
      timestamp: Date.now(),
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      durationMs: duration,
      tokensPerSecond,
      success: true
    });
    
    console.log(`[CEREBRAS] ✅ Réponse générée en ${duration}ms (${tokensPerSecond.toFixed(1)} tok/s)`);
    console.log(`[CEREBRAS] 📊 Tokens: ${promptTokens} in, ${completionTokens} out, ${totalTokens} total`);
    console.log(`[CEREBRAS] 📝 Réponse: ${text.substring(0, 100)}...`);
    
    // Afficher un warning si on approche du rate limit
    if (cerebrasTracker.isNearRateLimit()) {
      console.warn(`[CEREBRAS] ⚠️ Attention: approche du rate limit!`);
    }
    
    return text;

  } catch (error: any) {
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    
    if (error.name === 'AbortError') {
      console.error(`[CEREBRAS] ❌ Timeout après ${duration}ms`);
      throw new Error(`Cerebras timeout after ${timeout}ms`);
    }
    
    console.error(`[CEREBRAS] ❌ Erreur après ${duration}ms:`, error.message);
    throw error;
  }
}

// ============================================================================
// VERSION STREAMING AVEC TRACKER
// ============================================================================

/**
 * Version streaming pour Cerebras avec tracking
 */
export async function* callCerebrasStream(
  prompt: string,
  options: CerebrasOptions = {}
): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  
  if (!apiKey) {
    throw new Error('CEREBRAS_API_KEY non définie dans .env.local');
  }

  const {
    model = DEFAULT_CONFIG.model,
    temperature = DEFAULT_CONFIG.temperature,
    maxTokens = DEFAULT_CONFIG.maxTokens,
    timeout = DEFAULT_CONFIG.timeout
  } = options;

  const startTime = Date.now();
  let completionTokens = 0;
  let fullResponse = '';
  
  console.log(`[CEREBRAS] 🌊 Streaming avec ${model}...`);

  const url = 'https://api.cerebras.ai/v1/chat/completions';
  
  const body = {
    model: model,
    messages: [
      {
        role: 'system',
        content: 'Tu es un assistant industriel expert. Réponds en français de manière précise et technique.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: temperature,
    max_tokens: maxTokens,
    stream: true
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Cerebras API error (${response.status}): ${errorData.error?.message || response.statusText}`);
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
          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') continue;
          
          try {
            const data = JSON.parse(jsonStr);
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              completionTokens += Math.ceil(content.length / 4);
              yield content;
            }
          } catch (e) {
            // Ignorer les lignes mal formées
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    const tokensPerSecond = duration > 0 ? (completionTokens / (duration / 1000)) : 0;
    
    // Enregistrer dans le tracker
    cerebrasTracker.recordCall({
      timestamp: Date.now(),
      model,
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens,
      totalTokens: Math.ceil(prompt.length / 4) + completionTokens,
      durationMs: duration,
      tokensPerSecond,
      success: true
    });
    
    console.log(`[CEREBRAS] ✅ Streaming terminé en ${duration}ms (${tokensPerSecond.toFixed(1)} tok/s)`);

  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error(`[CEREBRAS] ❌ Streaming error:`, error.message);
    throw error;
  }
}

// ============================================================================
// FONCTIONS UTILITAIRES AVEC TRACKER
// ============================================================================

/**
 * Vérifie si l'API Cerebras est disponible
 */
export async function isCerebrasAvailable(): Promise<{
  available: boolean;
  models: string[];
  error?: string;
}> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  
  if (!apiKey) {
    return { available: false, models: [], error: 'CEREBRAS_API_KEY non définie' };
  }

  try {
    const url = 'https://api.cerebras.ai/v1/models';
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      return { available: false, models: [], error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    const models = data.data?.map((m: any) => m.id) || [];
    
    console.log(`[CEREBRAS] ✅ Disponible: ${models.length} modèles`);
    
    return { available: true, models };
    
  } catch (error: any) {
    return { available: false, models: [], error: error.message };
  }
}

/**
 * Test rapide de l'API Cerebras
 */
export async function testCerebrasConnection(): Promise<{
  success: boolean;
  latency: number;
  response?: string;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    const response = await callCerebras("Réponds par 'OK' si tu fonctionnes.", {
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

/**
 * Récupère les métriques Cerebras
 */
export async function getCerebrasMetrics(): Promise<{
  avgResponseTime: number;
  estimatedTokensPerSecond: number;
  totalCalls: number;
  successRate: number;
  nearRateLimit: boolean;
  report: string;
}> {
  const metrics = cerebrasTracker.getMetrics();
  
  return {
    avgResponseTime: metrics.avgResponseTimeMs,
    estimatedTokensPerSecond: metrics.avgTokensPerSecond,
    totalCalls: metrics.totalCalls,
    successRate: metrics.successRate,
    nearRateLimit: cerebrasTracker.isNearRateLimit(),
    report: cerebrasTracker.generateReport()
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  callCerebras,
  callCerebrasStream,
  isCerebrasAvailable,
  testCerebrasConnection,
  getCerebrasMetrics,
  cerebrasTracker,
  CEREBRAS_MODELS
};