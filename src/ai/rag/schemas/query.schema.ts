/**
 * @fileOverview Schémas de validation Zod pour le module RAG
 * @version 1.0.0
 * @description Validation runtime des interfaces critiques
 */

import { z } from 'zod';

// ============================================================================
// SCHÉMAS DE BASE
// ============================================================================

export const QueryTypeSchema = z.enum([
  'factual',
  'procedural', 
  'comparative',
  'explanatory',
  'action',
  'general'
] as const);

export const IntentSchema = z.enum([
  'inform',
  'help',
  'explain',
  'summarize',
  'calculate'
] as const);

export const SourceTypeSchema = z.enum([
  'document',
  'lesson',
  'interaction',
  'procedure',
  'alarme',
  'hmi',
  'episodic',
  'hierarchy',
  'pattern'
] as const);

// ============================================================================
// SCHÉMAS COMPOSÉS
// ============================================================================

export const QueryAnalysisSchema = z.object({
  type: QueryTypeSchema,
  intent: IntentSchema,
  concepts: z.array(z.string().min(1).max(100)),
  entities: z.array(z.string().min(1).max(100)),
  complexity: z.number().min(0).max(1),
  original: z.string().min(1).max(2000),
  processingTime: z.number().min(0).optional(),
  analysisMethod: z.enum(['llm', 'fallback']).optional(),
  confidence: z.number().min(0).max(1).optional()
});

export const FusedResultSchema = z.object({
  content: z.string().min(1),
  source: SourceTypeSchema,
  score: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  finalScore: z.number().min(0).max(1),
  metadata: z.record(z.unknown()).optional()
});

export const RetrievalResultSchema = z.object({
  contexts: z.array(FusedResultSchema),
  totalCount: z.number().min(0),
  analysis: z.unknown().nullable(),
  suggestions: z.array(z.string()).optional(),
  metadata: z.object({
    processingTime: z.number().min(0),
    sourcesUsed: z.array(SourceTypeSchema),
    searchCount: z.number().min(0),
    avgScore: z.number().min(0).max(1)
  })
});

export const SearchOptionsSchema = z.object({
  userProfile: z.enum(['chef_bloc_TG1', 'chef_bloc_TG2', 'chef_quart', 'superviseur']).optional(),
  equipe: z.string().optional(),
  equipement: z.string().optional(),
  zone: z.string().optional(),
  pupitre: z.string().optional(),
  useHybrid: z.boolean().optional(),
  useReranking: z.boolean().optional(),
  nResults: z.number().min(1).max(100).optional(),
  minConfidence: z.number().min(0).max(1).optional()
});

// ============================================================================
// VALIDATEURS UTILITAIRES
// ============================================================================

export type QueryAnalysis = z.infer<typeof QueryAnalysisSchema>;
export type FusedResult = z.infer<typeof FusedResultSchema>;
export type RetrievalResult = z.infer<typeof RetrievalResultSchema>;
export type SearchOptions = z.infer<typeof SearchOptionsSchema>;

/**
 * Valide et parse une QueryAnalysis
 * @throws {z.ZodError} si la validation échoue
 */
export function validateQueryAnalysis(input: unknown): QueryAnalysis {
  return QueryAnalysisSchema.parse(input);
}

/**
 * Valide et parse une QueryAnalysis de façon sûre
 * @returns {QueryAnalysis | null} null si échec
 */
export function safeParseQueryAnalysis(input: unknown): QueryAnalysis | null {
  const result = QueryAnalysisSchema.safeParse(input);
  return result.success ? result.data : null;
}

/**
 * Valide et parse des SearchOptions
 */
export function validateSearchOptions(input: unknown): SearchOptions {
  return SearchOptionsSchema.parse(input);
}

export function safeParseSearchOptions(input: unknown): SearchOptions | null {
  const result = SearchOptionsSchema.safeParse(input);
  return result.success ? result.data : null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  QueryAnalysisSchema,
  FusedResultSchema,
  RetrievalResultSchema,
  SearchOptionsSchema,
  validateQueryAnalysis,
  safeParseQueryAnalysis,
  validateSearchOptions,
  safeParseSearchOptions
};