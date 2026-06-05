/**
 * @fileOverview Configuration centralisée pour le module RAG
 * @version 1.0.0
 * @description Externalise les paramètres pour flexibilité environnementale
 */

import { z } from 'zod';

// ============================================================================
// SCHÉMAS DE CONFIGURATION
// ============================================================================

const LLMConfigSchema = z.object({
  defaultModel: z.string().default('phi:2.7b'),
  streamModel: z.string().default('llama3:8b'),
  timeoutMs: z.number().min(1000).max(300000).default(120000),
  maxTokens: z.number().min(100).max(4000).default(500),
  temperature: z.number().min(0).max(2).default(0.3)
});

const RetrievalConfigSchema = z.object({
  maxResults: z.number().min(1).max(50).default(10),
  minConfidence: z.number().min(0).max(1).default(0.4),
  enableReranking: z.boolean().default(true),
  sourceWeights: z.record(z.number().min(0).max(2)).default({
    document: 1.0,
    lesson: 0.9,
    interaction: 0.8,
    hierarchy: 0.85
  })
});

const ContextConfigSchema = z.object({
  maxTokens: z.number().min(500).max(8000).default(3000),
  proceduralThreshold: z.number().min(0).max(1).default(0.6),
  complexityThreshold: z.number().min(0).max(1).default(0.65)
});

const LearningConfigSchema = z.object({
  enablePersistence: z.boolean().default(true),
  collectionName: z.string().default('MEMOIRE_EPISODIQUE'),
  minRatingForReinforcement: z.number().min(1).max(5).default(4),
  maxRatingForCorrection: z.number().min(1).max(5).default(2)
});

const RAGConfigSchema = z.object({
  llm: LLMConfigSchema,
  retrieval: RetrievalConfigSchema,
  context: ContextConfigSchema,
  learning: LearningConfigSchema,
  logging: z.object({
    enableStructured: z.boolean().default(process.env.NODE_ENV === 'production'),
    maxDataLength: z.number().default(300)
  }).default({})
});

// ============================================================================
// CONFIGURATION PAR DÉFAUT + ENV
// ============================================================================

const defaultConfig: z.infer<typeof RAGConfigSchema> = {
  llm: {
    defaultModel: process.env.LLM_MODEL || 'phi:2.7b',
    streamModel: process.env.LLM_STREAM_MODEL || 'llama3:8b',
    timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '120000', 10),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '500', 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3')
  },
  retrieval: {
    maxResults: parseInt(process.env.RAG_MAX_RESULTS || '10', 10),
    minConfidence: parseFloat(process.env.RAG_MIN_CONFIDENCE || '0.4'),
    enableReranking: process.env.RAG_RERANK !== 'false',
    sourceWeights: {
      document: 1.0,
      lesson: 0.9,
      interaction: 0.8,
      hierarchy: 0.85
    }
  },
  context: {
    maxTokens: parseInt(process.env.RAG_CONTEXT_MAX_TOKENS || '3000', 10),
    proceduralThreshold: parseFloat(process.env.RAG_PROCEDURAL_THRESHOLD || '0.6'),
    complexityThreshold: parseFloat(process.env.RAG_COMPLEXITY_THRESHOLD || '0.65')
  },
  learning: {
    enablePersistence: process.env.RAG_LEARNING_PERSIST !== 'false',
    collectionName: process.env.RAG_LEARNING_COLLECTION || 'MEMOIRE_EPISODIQUE',
    minRatingForReinforcement: parseInt(process.env.RAG_REINFORCE_MIN_RATING || '4', 10),
    maxRatingForCorrection: parseInt(process.env.RAG_CORRECT_MAX_RATING || '2', 10)
  },
  logging: {
    enableStructured: process.env.NODE_ENV === 'production',
    maxDataLength: 300
  }
};

// ============================================================================
// VALIDATION ET EXPORT
// ============================================================================

export type RAGConfig = z.infer<typeof RAGConfigSchema>;

let validatedConfig: RAGConfig | null = null;

export function getRAGConfig(): RAGConfig {
  if (!validatedConfig) {
    const result = RAGConfigSchema.safeParse(defaultConfig);
    if (!result.success) {
      console.error('❌ Configuration RAG invalide:', result.error.errors);
      throw new Error('Invalid RAG configuration');
    }
    validatedConfig = result.data;
  }
  return validatedConfig;
}

export function overrideRAGConfig(overrides: Partial<RAGConfig>): void {
  const current = getRAGConfig();
  const merged = RAGConfigSchema.parse({ ...current, ...overrides });
  validatedConfig = merged;
}

export function resetRAGConfig(): void {
  validatedConfig = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getRAGConfig,
  overrideRAGConfig,
  resetRAGConfig,
  schemas: {
    RAGConfigSchema,
    LLMConfigSchema,
    RetrievalConfigSchema,
    ContextConfigSchema,
    LearningConfigSchema
  }
};