/**
 * Types partagés pour le module NOMINAL - Recherche par nom de fichier
 * @module nominal/types
 * @version 1.0.0
 */

// ============================================================================
// TYPES DE BASE POUR LA RECHERCHE NOMINALE
// ============================================================================

export interface NominalSearchResult {
  found: boolean;
  filePath?: string;
  content?: string;
  score: number;
  normalizedScore: number;
  matchedTerms: string[];
  zone: string;
  mode: 'exact' | 'partial' | 'implicit' | 'semantic';
  matchQuality: 'perfect' | 'high' | 'medium' | 'low';
  semanticAnalysis?: SemanticAnalysis;
  details?: SearchDetails;
}

export interface NominalSearchOptions {
  basePath?: string;
  minScore?: number;
  maxResults?: number;
  recursive?: boolean;
  useSemanticAnalysis?: boolean;
}

export interface SemanticAnalysis {
  fileType: string;
  action?: string;
  equipment?: string;
  confidence: number;
  relevanceScore: number;
}

export interface SearchDetails {
  baseScore: number;
  bonusOriginal: number;
  penaltyExclusion: number;
  finalScore: number;
  typoMatch: boolean;
  matchedVariant?: string;
  semanticBonus?: number;
}

// ============================================================================
// TYPES POUR LE MAPPING IMPLICITE
// ============================================================================

export interface ImplicitMappingEntry {
  term: string;
  target: string;
  weight: number;
  occurrences: number;
  lastUpdated: string;
  createdFrom?: string;
}

export interface ImplicitMappingStore {
  version: string;
  mappings: ImplicitMappingEntry[];
  lastUpdated: string;
}

export interface ZoneMappingResult {
  zone: string;
  confidence: number;
}

// ============================================================================
// TYPES POUR LA DÉDUPLICATION
// ============================================================================

export interface DeduplicationResult {
  isDuplicate: boolean;
  existingHash?: string;
  similarity?: number;
  action: 'skip' | 'enrich' | 'add';
}

export interface DeduplicationOptions {
  similarityThreshold?: number;
  minEnrichThreshold?: number;
}

export interface PermanentCacheEntry {
  hash: string;
  question: string;
  response: string;
  zone: string;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// TYPES POUR L'AGENT NOMINAL
// ============================================================================

export interface NominalAgentConfig {
  enabled: boolean;
  searchTimeout: number;
  retryAttempts: number;
  autoInitialize: boolean;
  semanticAnalysisEnabled: boolean;
  deduplicationEnabled: boolean;
  implicitMappingEnabled: boolean;
}

export interface NominalAgentStatus {
  initialized: boolean;
  servicesReady: {
    search: boolean;
    mapping: boolean;
    deduplication: boolean;
  };
  lastActivity: string;
  errorCount: number;
  performance: {
    averageSearchTime: number;
    totalSearches: number;
    cacheHitRate: number;
  };
}

export interface NominalOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  retries: number;
}