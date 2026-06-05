// src/ai/providers/openrouter-provider.ts
/**
 * Provider OpenRouter API
 * @version 1.0.0
 * @description Accès à 20+ modèles gratuits via OpenRouter
 * @quota 20 req/min, 50 req/jour
 * @cost Gratuit
 */

export interface OpenRouterOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface OpenRouterResponse {
  text: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

// Modèles OpenRouter gratuits disponibles
export const OPENROUTER_FREE_MODELS = {
  GEMMA_3N_E2B: 'google/gemma-3n-e2b-it:free',
  GEMMA_3N_4B: 'google/gemma-3n-4b-it:free',
  GEMMA_3N_12B: 'google/gemma-3n-12b-it:free',
  QWEN_3_4B: 'qwen/qwen3-4b:free',
  MISTRAL_SMALL_3_1_24B: 'mistralai/mistral-small-3.1-24b:free',
  DEEPSEEK_R1_DISTILL: 'deepseek/deepseek-r1-distill-qwen-32b:free',
  PHI_3_5_MINI: 'microsoft/phi-3.5-mini-128k-instruct:free'
} as const;

export type OpenRouterModel = typeof OPENROUTER_FREE_MODELS[keyof typeof OPENROUTER_FREE_MODELS];

// Liste des modèles par priorité (fallback automatique)
const MODEL_PRIORITY: OpenRouterModel[] = [
  OPENROUTER_FREE_MODELS.GEMMA_3N_E2B,
  OPENROUTER_FREE_MODELS.QWEN_3_4B,
  OPENROUTER_FREE_MODELS.PHI_3_5_MINI,
  OPENROUTER_FREE_MODELS.MISTRAL_SMALL_3_1_24B
];

// Configuration par défaut
const DEFAULT_CONFIG = {
  model: OPENROUTER_FREE_MODELS.GEMMA_3N_E2B,
  temperature: 0.3,
  maxTokens: 2000,
  timeout: 60000,
  topP: 0.9,
  frequencyPenalty: 0,
  presencePenalty: 0
};

// ============================================================================
// TRACKER DE PERFORMANCE OPENROUTER
// ============================================================================

interface OpenRouterCallRecord {
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

interface OpenRouterMetrics {
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
  modelUsage: Map<string, number>;
  recentCalls: OpenRouterCallRecord[];
}

class OpenRouterPerformanceTracker {
  private static instance: OpenRouterPerformanceTracker;
  private calls: OpenRouterCallRecord[] = [];
  private readonly MAX_RECENT_CALLS = 100;
  private readonly RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
  private readonly DAILY_LIMIT = 50;

  private constructor() {}

  static getInstance(): OpenRouterPerformanceTracker {
    if (!OpenRouterPerformanceTracker.instance) {
      OpenRouterPerformanceTracker.instance = new OpenRouterPerformanceTracker();
    }
    return OpenRouterPerformanceTracker.instance;
  }

  recordCall(record: OpenRouterCallRecord): void {
    this.calls.unshift(record);
    
    if (this.calls.length > this.MAX_RECENT_CALLS) {
      this.calls.pop();
    }
    
    if (record.success) {
      console.log(`[OPENROUTER-TRACKER] 📊 Call: ${record.durationMs}ms, ${record.tokensPerSecond.toFixed(1)} tok/s`);
    } else {
      console.warn(`[OPENROUTER-TRACKER] ❌ Échec: ${record.error}`);
    }
  }

  getMetrics(): OpenRouterMetrics {
    const successfulCalls = this.calls.filter(c => c.success);
    const failedCalls = this.calls.filter(c => !c.success);
    const totalCalls = this.calls.length;
    
    const totalTokens = successfulCalls.reduce((sum, c) => sum + c.totalTokens, 0);
    const totalDuration = successfulCalls.reduce((sum, c) => sum + c.durationMs, 0);
    
    const avgResponseTime = successfulCalls.length > 0 ? totalDuration / successfulCalls.length : 0;
    const avgTokensPerSecond = successfulCalls.length > 0
      ? successfulCalls.reduce((sum, c) => sum + c.tokensPerSecond, 0) / successfulCalls.length
      : 0;
    const avgTokensPerCall = successfulCalls.length > 0 ? totalTokens / successfulCalls.length : 0;
    
    const now = Date.now();
    const lastMinuteCalls = this.calls.filter(c => now - c.timestamp < this.RATE_LIMIT_WINDOW_MS).length;
    
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
      avgTokensPerSecond,
      avgTokensPerCall,
      lastMinuteCalls,
      modelUsage,
      recentCalls: this.calls.slice(0, 10)
    };
  }

  getRemainingDailyQuota(): number {
    const today = new Date().toDateString();
    const todayCalls = this.calls.filter(c => 
      new Date(c.timestamp).toDateString() === today && c.success
    ).length;
    return Math.max(0, this.DAILY_LIMIT - todayCalls);
  }

  isNearRateLimit(): boolean {
    const metrics = this.getMetrics();
    const RATE_LIMIT_REQUESTS = 20;
    return metrics.lastMinuteCalls >= RATE_LIMIT_REQUESTS * 0.8;
  }

  getTimeToReset(): number {
    const now = Date.now();
    const oldestInWindow = this.calls.find(c => 
      now - c.timestamp < this.RATE_LIMIT_WINDOW_MS
    );
    if (!oldestInWindow) return 0;
    return Math.max(0, this.RATE_LIMIT_WINDOW_MS - (now - oldestInWindow.timestamp));
  }

  generateReport(): string {
    const metrics = this.getMetrics();
    const remaining = this.getRemainingDailyQuota();
    const timeToReset = this.getTimeToReset();
    
    return `
╔══════════════════════════════════════════════════════════════╗
║              OPENROUTER PERFORMANCE REPORT                   ║
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
║ 🔄 QUOTAS                                                    ║
║   ├─ Requêtes minute: ${metrics.lastMinuteCalls}/20
║   ├─ Requêtes restantes (jour): ${remaining}/50
║   └─ Reset minute dans: ${(timeToReset / 1000).toFixed(0)}s
╠══════════════════════════════════════════════════════════════╣
║ 🎯 MODÈLES UTILISÉS                                          ║
${Array.from(metrics.modelUsage.entries()).map(([model, count]) => 
  `║   ├─ ${model.split('/').pop()}: ${count} appels`
).join('\n')}
╚══════════════════════════════════════════════════════════════╝
    `;
  }

  reset(): void {
    this.calls = [];
    console.log(`[OPENROUTER-TRACKER] 🔄 Statistiques réinitialisées`);
  }
}

export const openrouterTracker = OpenRouterPerformanceTracker.getInstance();

// ============================================================================
// FONCTIONS PRINCIPALES
// ============================================================================

/**
 * Appelle l'API OpenRouter avec fallback automatique entre modèles gratuits
 */
export async function callOpenRouter(
  prompt: string,
  options: OpenRouterOptions = {}
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY non définie dans .env.local');
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
  
  console.log(`[OPENROUTER] 🚀 Appel à ${model}...`);

  const url = 'https://openrouter.ai/api/v1/chat/completions';
  
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
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'AGENTIC Industrial Assistant'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      
      openrouterTracker.recordCall({
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
        throw new Error(`OpenRouter rate limit: ${errorMessage}`);
      }
      
      throw new Error(`OpenRouter API error (${response.status}): ${errorMessage}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    
    if (!text) {
      throw new Error('Réponse OpenRouter vide ou invalide');
    }

    const usage = data.usage || {};
    const promptTokens = usage.prompt_tokens || Math.ceil(prompt.length / 4);
    const completionTokens = usage.completion_tokens || Math.ceil(text.length / 4);
    const totalTokens = promptTokens + completionTokens;
    const tokensPerSecond = duration > 0 ? (completionTokens / (duration / 1000)) : 0;
    
    openrouterTracker.recordCall({
      timestamp: Date.now(),
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      durationMs: duration,
      tokensPerSecond,
      success: true
    });
    
    console.log(`[OPENROUTER] ✅ Réponse en ${duration}ms (${tokensPerSecond.toFixed(1)} tok/s)`);
    console.log(`[OPENROUTER] 📊 Tokens: ${totalTokens} (${completionTokens} out)`);
    
    return text;

  } catch (error: any) {
    clearTimeout(timeoutId);
    
    // Fallback vers un autre modèle si disponible
    const currentIndex = MODEL_PRIORITY.indexOf(model as OpenRouterModel);
    if (currentIndex !== -1 && currentIndex < MODEL_PRIORITY.length - 1) {
      const nextModel = MODEL_PRIORITY[currentIndex + 1];
      console.log(`[OPENROUTER] 🔄 Fallback vers ${nextModel}...`);
      return callOpenRouter(prompt, { ...options, model: nextModel });
    }
    
    throw error;
  }
}

// ============================================================================
// VERSION STREAMING
// ============================================================================

export async function* callOpenRouterStream(
  prompt: string,
  options: OpenRouterOptions = {}
): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY non définie dans .env.local');
  }

  const {
    model = DEFAULT_CONFIG.model,
    temperature = DEFAULT_CONFIG.temperature,
    maxTokens = DEFAULT_CONFIG.maxTokens,
    timeout = DEFAULT_CONFIG.timeout
  } = options;

  console.log(`[OPENROUTER] 🌊 Streaming avec ${model}...`);

  const url = 'https://openrouter.ai/api/v1/chat/completions';
  
  const body = {
    model: model,
    messages: [
      {
        role: 'system',
        content: 'Tu es un assistant industriel expert. Réponds en français.'
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
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'AGENTIC Industrial Assistant'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OpenRouter API error (${response.status})`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error('No response body');

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
            if (content) yield content;
          } catch (e) {}
        }
      }
    }

    console.log(`[OPENROUTER] ✅ Streaming terminé`);

  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error(`[OPENROUTER] ❌ Streaming error:`, error.message);
    throw error;
  }
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

export async function isOpenRouterAvailable(): Promise<{
  available: boolean;
  models: string[];
  error?: string;
}> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    return { available: false, models: [], error: 'OPENROUTER_API_KEY non définie' };
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      return { available: false, models: [], error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    const models = data.data?.filter((m: any) => m.pricing?.prompt === '0')?.map((m: any) => m.id) || [];
    
    console.log(`[OPENROUTER] ✅ Disponible: ${models.length} modèles gratuits`);
    
    return { available: true, models };
    
  } catch (error: any) {
    return { available: false, models: [], error: error.message };
  }
}

export async function testOpenRouterConnection(): Promise<{
  success: boolean;
  latency: number;
  response?: string;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    const response = await callOpenRouter("Réponds par 'OK'", {
      maxTokens: 10,
      temperature: 0
    });
    
    return {
      success: true,
      latency: Date.now() - startTime,
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

export async function getOpenRouterMetrics() {
  const metrics = openrouterTracker.getMetrics();
  return {
    avgResponseTime: metrics.avgResponseTimeMs,
    totalCalls: metrics.totalCalls,
    successRate: metrics.successRate,
    remainingDailyQuota: openrouterTracker.getRemainingDailyQuota(),
    nearRateLimit: openrouterTracker.isNearRateLimit(),
    report: openrouterTracker.generateReport()
  };
}

export default {
  callOpenRouter,
  callOpenRouterStream,
  isOpenRouterAvailable,
  testOpenRouterConnection,
  getOpenRouterMetrics,
  openrouterTracker,
  OPENROUTER_FREE_MODELS,
  MODEL_PRIORITY
};