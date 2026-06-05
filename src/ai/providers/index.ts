// src/ai/providers/index.ts
/**
 * Providers LLM - Point d'entrée centralisé
 * @version 1.1.0
 */

// ============================================================================
// ROUTEUR PRINCIPAL
// ============================================================================

export {
  callLLMRouter,
  callLLMRouterStream,
  getLLMHealthStatus,
  getLLMRouterReport,
  resetLLMRouterStats,
  type LLMRouterOptions,
  type LLMRouterResponse,
  type ProviderCaller as ProviderConfig
} from './llm-router';

import llmRouter from './llm-router';

// ============================================================================
// PROVIDERS INDIVIDUELS
// ============================================================================

// GROQ
export {
  callGroq,
  callGroqStream
} from './groq-provider';

// Google Gemini
export {
  callGemini,
  callGeminiStream,
  isGeminiAvailable,
  testGeminiConnection,
  GEMINI_MODELS,
  default as geminiProvider
} from './gemini-provider';

// Cerebras
export {
  callCerebras,
  callCerebrasStream,
  isCerebrasAvailable,
  testCerebrasConnection,
  getCerebrasMetrics,
  cerebrasTracker,
  CEREBRAS_MODELS,
  default as cerebrasProvider
} from './cerebras-provider';

// OpenRouter
export {
  callOpenRouter,
  callOpenRouterStream,
  isOpenRouterAvailable,
  testOpenRouterConnection,
  getOpenRouterMetrics,
  openrouterTracker,
  OPENROUTER_FREE_MODELS,
  default as openRouterProvider
} from './openrouter-provider';

// Claude Local
export {
  callClaudeLocal,
  callClaudeLocalStream,
  claudeLocal,
  CLAUDE_LOCAL_MODELS,
  type ClaudeMessage,
  type ClaudeContentBlock,
  type ClaudeRequestOptions,
  type ClaudeResponse,
  type ClaudeProviderConfig,
  type ClaudeModelAlias,
  default as claudeLocalProvider
} from './claude-local-provider';

// Ollama
export {
  callOllama,
  callOllamaStream,
  isModelAvailable,
  isFinetunedAvailable,
  isGemmaQuantizedAvailable,
  getAvailableModels,
  testOllamaConnection,
  getModelInfo,
  generateEmbeddings,
  getOllamaStats,
  resetOllamaStats,
  default as ollamaClient
} from './ollama-client';

// Hybrid Provider (wrapper)
export {
  callHybridWrapper,
  callHybridWrapperStream,
  getHybridAnswer,
  getHybridFullResponse,
  isHybridAvailable,
  getHybridMetrics,
  type HybridWrapperOptions,
  default as hybridWrapper
} from './hybrid-wrapper';

// Provider Hybride original
export {
  callHybridProvider,
  detectComplexity,
  detectQueryType,
  isProfileQuery,
  normalizeTextForExport,
  type HybridResponse,
  type ModelConfig,
  default as hybridProvider
} from './hybrid-provider';

// ============================================================================
// UTILITAIRES
// ============================================================================

export async function testAllProviders(): Promise<{
  success: boolean;
  results: Record<string, { success: boolean; latency: number; error?: string }>;
  summary: string;
}> {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🧪 [PROVIDERS] TEST DE TOUS LES PROVIDERS`);
  console.log(`${'═'.repeat(70)}`);

  const results: Record<string, any> = {};
  const startTime = Date.now();

  const tests = [
    { name: 'groq', fn: async () => {
      if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY non définie');
      const { callGroq } = await import('./groq-provider');
      return callGroq("Réponds par 'OK'", { maxTokens: 5, temperature: 0 });
    }},
    { name: 'gemini', fn: async () => {
      if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY non définie');
      const { callGemini } = await import('./gemini-provider');
      return callGemini("Réponds par 'OK'", { maxTokens: 5, temperature: 0 });
    }},
    { name: 'cerebras', fn: async () => {
      if (!process.env.CEREBRAS_API_KEY) throw new Error('CEREBRAS_API_KEY non définie');
      const { callCerebras } = await import('./cerebras-provider');
      return callCerebras("Réponds par 'OK'", { maxTokens: 5, temperature: 0 });
    }},
    { name: 'openrouter', fn: async () => {
      if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY non définie');
      const { callOpenRouter } = await import('./openrouter-provider');
      return callOpenRouter("Réponds par 'OK'", { maxTokens: 5, temperature: 0 });
    }},
    { name: 'claude-local', fn: async () => {
      const { callClaudeLocal } = await import('./claude-local-provider');
      return callClaudeLocal("Réponds par 'OK'", { maxTokens: 5, temperature: 0 });
    }},
    { name: 'ollama', fn: async () => {
      const { callOllama } = await import('./ollama-client');
      return callOllama("Réponds par 'OK'", { maxTokens: 5, temperature: 0 });
    }},
    { name: 'hybrid', fn: async () => {
      const { callHybridWrapper } = await import('./hybrid-wrapper');
      return callHybridWrapper("Réponds par 'OK'");
    }}
  ];

  for (const test of tests) {
    const testStart = Date.now();
    try {
      await test.fn();
      results[test.name] = {
        success: true,
        latency: Date.now() - testStart
      };
      console.log(`✅ ${test.name.padEnd(14)}: OK (${results[test.name].latency}ms)`);
    } catch (error: any) {
      results[test.name] = {
        success: false,
        latency: Date.now() - testStart,
        error: error.message
      };
      console.log(`❌ ${test.name.padEnd(14)}: ÉCHEC - ${error.message}`);
    }
  }

  const totalDuration = Date.now() - startTime;
  const successCount = Object.values(results).filter(r => r.success).length;
  
  const summary = `
╔══════════════════════════════════════════════════════════════╗
║                    TEST RÉCAPITULATIF                        ║
╠══════════════════════════════════════════════════════════════╣
║   ✅ Succès: ${successCount}/${tests.length} providers
║   ⏱️  Durée totale: ${totalDuration}ms
╚══════════════════════════════════════════════════════════════╝
  `;
  
  console.log(summary);
  
  return {
    success: successCount === tests.length,
    results,
    summary
  };
}

export function checkAPIKeysConfiguration(): {
  configured: string[];
  missing: string[];
  allConfigured: boolean;
} {
  const requiredKeys = ['GROQ_API_KEY', 'GEMINI_API_KEY', 'CEREBRAS_API_KEY', 'OPENROUTER_API_KEY'];
  
  const configured: string[] = [];
  const missing: string[] = [];
  
  for (const key of requiredKeys) {
    if (process.env[key]) {
      configured.push(key);
    } else {
      missing.push(key);
    }
  }
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🔑 [PROVIDERS] CONFIGURATION DES CLÉS API`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`✅ Configurées: ${configured.length > 0 ? configured.join(', ') : 'aucune'}`);
  console.log(`❌ Manquantes: ${missing.length > 0 ? missing.join(', ') : 'aucune'}`);
  console.log(`${'═'.repeat(60)}\n`);
  
  return { configured, missing, allConfigured: missing.length === 0 };
}

// ============================================================================
// EXPORT PAR DÉFAUT
// ============================================================================

export default llmRouter;