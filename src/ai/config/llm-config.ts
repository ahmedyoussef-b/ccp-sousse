// src/ai/config/llm-config.ts
/**
 * Configuration LLM étendue - Providers externes
 * @version 1.0.0
 * @description Complète models.config.ts pour les providers externes (GROQ, Gemini, etc.)
 * 
 * models.config.ts = modèles Ollama locaux
 * llm-config.ts = providers externes + fallback
 */

// ============================================================================
// PROVIDERS EXTERNES CONFIGURATION
// ============================================================================

export interface ProviderAPIConfig {
  name: string;
  apiKeyEnvVar: string;
  baseUrl?: string;
  defaultModel: string;
  timeout: number;
  maxRetries: number;
  enabled: boolean;
  quota: {
    requestsPerDay: number;
    tokensPerDay: number;
    requestsPerMinute?: number;
  };
}

export const PROVIDERS_CONFIG: Record<string, ProviderAPIConfig> = {
  groq: {
    name: 'groq',
    apiKeyEnvVar: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    timeout: 30000,
    maxRetries: 2,
    enabled: !!process.env.GROQ_API_KEY,
    quota: {
      requestsPerDay: 1000,
      tokensPerDay: 100000,
      requestsPerMinute: 30
    }
  },
  
  gemini: {
    name: 'gemini',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemma-4-31b-it',
    timeout: 45000,
    maxRetries: 2,
    enabled: !!process.env.GEMINI_API_KEY,
    quota: {
      requestsPerDay: 3000,
      tokensPerDay: 500000,
      requestsPerMinute: 15
    }
  },
  
  cerebras: {
    name: 'cerebras',
    apiKeyEnvVar: 'CEREBRAS_API_KEY',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama3.1-8b',
    timeout: 30000,
    maxRetries: 2,
    enabled: !!process.env.CEREBRAS_API_KEY,
    quota: {
      requestsPerDay: 14400,
      tokensPerDay: 1000000,
      requestsPerMinute: 30
    }
  },
  
  openrouter: {
    name: 'openrouter',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemma-3n-e2b-it:free',
    timeout: 60000,
    maxRetries: 2,
    enabled: !!process.env.OPENROUTER_API_KEY,
    quota: {
      requestsPerDay: 50,
      tokensPerDay: 10000,
      requestsPerMinute: 20
    }
  },
  
  claudeLocal: {
    name: 'claude-local',
    apiKeyEnvVar: '',
    baseUrl: '/api/chat/claude-compatible',
    defaultModel: 'claude-sonnet',
    timeout: 120000,
    maxRetries: 1,
    enabled: true,
    quota: {
      requestsPerDay: Infinity,
      tokensPerDay: Infinity
    }
  },
  
  ollama: {
    name: 'ollama',
    apiKeyEnvVar: '',
    baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    defaultModel: 'ccp-finetuned:latest',
    timeout: 120000,
    maxRetries: 2,
    enabled: true,
    quota: {
      requestsPerDay: Infinity,
      tokensPerDay: Infinity
    }
  },
  
  hybrid: {
    name: 'hybrid',
    apiKeyEnvVar: '',
    baseUrl: 'internal',
    defaultModel: 'hybrid',
    timeout: 180000,
    maxRetries: 1,
    enabled: true,
    quota: {
      requestsPerDay: Infinity,
      tokensPerDay: Infinity
    }
  }
};

// ============================================================================
// ORDRE DE FALLBACK
// ============================================================================

export const FALLBACK_ORDER: string[] = [
  'groq',
  'gemini',
  'cerebras',
  'openrouter',
  'claudeLocal',
  'ollama',
  'hybrid'
];

// ============================================================================
// CONFIGURATION DU CACHE
// ============================================================================

export const CACHE_CONFIG = {
  enabled: true,
  semanticEnabled: true, // Activation du cache sémantique DragonMemory
  defaultTTL: 7 * 24 * 60 * 60 * 1000, // 7 jours
  maxEntries: 500,
  minConfidenceToCache: 0.7,
  persistToDisk: true,
  persistencePath: 'data/cache/llm-cache.json',
  sqlitePath: 'data/ai-core.db' // Nouveau chemin pour le cache sémantique SQLite
};

// ============================================================================
// CONFIGURATION DU ROUTEUR
// ============================================================================

export const ROUTER_CONFIG = {
  defaultMaxTokens: 2000,
  defaultTemperature: 0.3,
  defaultTimeout: 60000,
  enableStreaming: true,
  enableCache: true,
  enableUsageTracking: true,
  bypassRateLimitForTesting: false
};

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Vérifie quels providers sont disponibles (clés API présentes)
 */
export function getAvailableProviders(): string[] {
  return FALLBACK_ORDER.filter(provider => {
    const config = PROVIDERS_CONFIG[provider];
    if (!config) return false;
    if (config.apiKeyEnvVar && !process.env[config.apiKeyEnvVar]) return false;
    return config.enabled;
  });
}

/**
 * Récupère le meilleur provider disponible en fonction de la priorité et du quota
 */
export function getBestProvider(usageStats: Record<string, { requests: number; tokens: number }> = {}): string {
  const available = getAvailableProviders();
  
  for (const provider of FALLBACK_ORDER) {
    if (available.includes(provider)) {
      const usage = usageStats[provider] || { requests: 0, tokens: 0 };
      if (!isProviderRateLimited(provider, usage)) {
        return provider;
      }
    }
  }
  
  return 'ollama'; // Fallback ultime sur le local
}

/**
 * Récupère la configuration d'un provider
 */
export function getProviderConfig(providerName: string): ProviderAPIConfig | undefined {
  return PROVIDERS_CONFIG[providerName];
}

/**
 * Vérifie si un provider est rate limité (selon quota)
 */
export function isProviderRateLimited(providerName: string, currentUsage: { requests: number; tokens: number }): boolean {
  const config = getProviderConfig(providerName);
  if (!config) return false;
  
  const quota = config.quota;
  return (quota.requestsPerDay !== Infinity && currentUsage.requests >= quota.requestsPerDay) || 
         (quota.tokensPerDay !== Infinity && currentUsage.tokens >= quota.tokensPerDay);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  PROVIDERS_CONFIG,
  FALLBACK_ORDER,
  CACHE_CONFIG,
  ROUTER_CONFIG,
  getAvailableProviders,
  getBestProvider,
  getProviderConfig,
  isProviderRateLimited
};