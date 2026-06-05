// ai/core/sqlite/types.ts

export interface MigrationRecord {
  id: number;
  module: string;
  tableName: string;
  version: number;
  appliedAt: number;
}

export interface QueryOptions {
  params?: any[];
  timeout?: number;
}
export interface SemanticCacheEntry {
  id: string;
  query: string;
  embedding_compressed: Buffer;
  response: string;
  usage_count: number;
  last_used: number;
  created_at: number;
  metadata: any;
}

export interface QREntry {
  id: string;
  question: string;
  answer: string;
  sourceFile: string;
  sourcePath: string;
  zone: string;
  embedding: number[];
  keywords: string[];
  confidence: number;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
  category: string;
  language: string;
}

// ============================================================================
// MODULE ACTIONS
// ============================================================================

export interface ActionPolicy {
  id: string;
  contextPattern: string;
  actionTemplate: any; // Template d'action JSON
  confidence: number;
  demonstrationCount: number;
  successRate: number;
  createdAt: number;
  updatedAt: number;
  lastUsed: number;
  tags: string[];
}

export interface ActionDemonstration {
  id: string;
  timestamp: number;
  context: any;
  action: any;
  result: any;
  userId?: string;
  sessionId?: string;
  success: boolean;
  tags: string[];
  duration: number;
}

export interface ActionSnapshot {
  id: string;
  state: any;
  createdAt: number;
  expiresAt: number;
  workflowId?: string;
}

// ============================================================================
// MODULE LEARNING
// ============================================================================

export interface LearningInsight {
  id: string;
  instanceId: string;
  domain: string;
  pattern: string;
  instruction: string;
  confidence: number;
  timestamp: number;
  originalRule?: string;
}

export interface LearningPattern {
  id: string;
  description: string;
  domain: string;
  confidence: number;
  usageCount: number;
  applicability?: string;
  timestamp: number;
  tags: string[];
}

export interface ConceptNode {
  id: string;
  name: string;
  level: number;
  parentId?: string;
  description?: string;
  synonyms: string[];
  importance: number;
}

export interface ConceptRelation {
  sourceId: string;
  targetId: string;
  type: string;
}

export interface LearningEpisode {
  id: string;
  timestamp: number;
  type: string;
  content: string;
  context: string;
  importance: number;
  tags: string[];
  metadata: any;
}

export interface KnowledgeItem {
  id: string;
  content: string;
  concept: string;
  stability: number;
  difficulty: number;
  lastReview: number;
  nextReview: number;
  reviewsCount: number;
  tags: string[];
  domain: string;
}

export interface LearningProfile {
  conciseness: number;
  technicality: number;
  formality: number;
  creativity: number;
  lastUpdated: number;
  adaptationCount: number;
  history: any[];
}

export interface LearningRule {
  id: string;
  domain: string;
  pattern: string;
  instruction: string;
  confidence: number;
  timestamp: number;
  usageCount: number;
  tags: string[];
}

export interface PerformanceMetrics {
  timestamp: number;
  strategyId: string;
  success: boolean;
  quality: number;
  timeSpent: number;
  confidence?: number;
  query?: string;
}

export interface DomainMapping {
  sourceDomain: string;
  targetDomain: string;
  conceptFrom: string;
  conceptTo: string;
  confidence: number;
  usageCount: number;
  lastUsed: number;
}

// ============================================================================
// MODULE ORCHESTRATION
// ============================================================================

export interface WorkflowRecord {
  id: string;
  name: string;
  steps: any[];
  status: 'active' | 'archived' | 'template';
  executionCount: number;
  avgDuration: number;
  lastExecuted?: number;
  createdAt: number;
  metadata: any;
}

export interface SessionRecord {
  sessionId: string;
  userId?: string;
  state: string;
  context: any;
  history: any[];
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
}

export interface VoteRecord {
  id: string;
  pollId: string;
  voterId: string;
  choice: string;
  weight: number;
  timestamp: number;
  reasoning?: string;
}

// ============================================================================
// MODULE VISION & PART MATCHING
// ============================================================================

export interface GlobalImageRecord {
  id: string;
  imageId: string;
  gridRows: number;
  gridCols: number;
  overlap: number;
  patchSize: number;
  totalParts: number;
  processedAt?: number;
  metadata?: any;
}

export interface PatchRecord {
  id: string;
  globalImageId: string;
  position: { x: number; y: number; width: number; height: number };
  gridPosition: { row: number; col: number };
  features: number[];
  tags: string[];
  confidence: number;
  createdAt?: number;
}

export interface HierarchyRelation {
  childId: string;
  parentId: string;
  relationshipType: string;
  matchedZone: { x: number; y: number; width: number; height: number };
  confidence: number;
  createdAt?: number;
}

export interface PatchSearchResult extends PatchRecord {
  similarity: number;
}

// ============================================================================
// MODULE VISION
// ============================================================================

export interface VisionData {
  id: string;
  filename: string;
  filepath: string;
  thumbnail_path?: string;
  description?: string;
  tags: string[];
  location?: string;
  folder_id: string;
  date: string;
  created_at: number;
  image_type: 'simple' | 'panoramic' | 'global' | 'patch';
  qa_pairs?: string;
  invocation_keywords?: string;
  equipment_state?: 'normal' | 'degraded' | 'critical' | 'maintenance';
  valid_until?: string;
  linked_procedure?: string;
  ocr_text?: string;
  file_hash?: string;

  width?: number;
  height?: number;
  file_size?: number;
  mime_type?: string;
  linked_document_ids?: string[];
  author?: string;
  document_type?: string;
  related_docs?: string[];
  image?: string; // Base64
  metadata: Record<string, any>;

  // ── camelCase aliases (service-layer compatibility) ──
  // These mirror the snake_case DB columns for use in application code.
  folderId?: string;
  createdAt?: number | string;
  imageType?: 'simple' | 'panoramic' | 'global' | 'patch';
  qaPairs?: string;
  invocationKeywords?: string;
  equipmentState?: 'normal' | 'degraded' | 'critical' | 'maintenance';
  validUntil?: string;
  linkedProcedure?: string;
  ocrText?: string;
  fileHash?: string;

  fileSize?: number;
  mimeType?: string;
  linkedDocumentIds?: string[];
  documentType?: string;
  relatedDocs?: string[];
  thumbnailPath?: string;
}

export interface VisionAnchor {
  id: string;
  type: 'qr' | 'logical_anchor' | 'logo' | 'fixed_point';
  label: string;
  confidence: number;
  position?: { x: number; y: number };
}

export interface SpatialHierarchy {
  components: Record<string, unknown>[];
  relations: Record<string, unknown>[];
  metadata: {
    analyzedAt: string;
    strategy: string;
  };
}

export interface ImagePreparation {
  pyramid: Record<string, unknown>[];
  imageId: string;
  rois?: Record<string, unknown>[];
  anchors?: Record<string, unknown>[];
  spatialHierarchy?: SpatialHierarchy;
  saliencyMap?: Record<string, unknown>;
  segmentation?: Record<string, unknown>;
  pyramidLevels?: Record<string, unknown>;
  enhancementParams?: Record<string, unknown>;
  preparationDate?: number | string;
  preparationVersion?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface ImageAssembly {
  id: string;
  result_image_id: string;
  source_images: string[];
  grid_rows: number;
  grid_cols: number;
  assembly_quality: number;
  created_at: number;
  metadata: Record<string, any>;
}

export interface PreparationLog {
  id?: number;
  image_id: string;
  operation: string;
  status: string;
  details?: string;
  duration_ms?: number;
  created_at: number;
}

export interface InnovationSubspace {
  id: string;
  name: string;
  type: string;
  mean?: number[];
  components?: number[][];
  explainedVariance?: number[];
  threshold?: number;
  referenceImages?: string[];
  createdAt?: number;
  updatedAt?: number;
  version?: number;
  metadata?: any;
}

export interface InnovationAnalysis {
  id: string;
  innovationType: string;
  analysisData: any;
  detectedElements?: any[];
  suggestedActions?: any[];
  rawResponse?: string;
  userId?: string;
  sessionId?: string;
  createdAt?: number;
}

export interface InnovationFeedback {
  id: string;
  predictionId: string;
  imageId?: string;
  innovationType: string;
  userFeedback: string;
  correction?: string;
  confidenceScore?: number;
  similarityScore?: number;
  userId?: string;
}

export interface InnovationTrainingSession {
  id: string;
  defectName: string;
  description?: string;
  positiveSamples: string[];
  negativeSamples: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  detectorId?: string;
  createdAt: number;
  completedAt?: number;
  metadata?: any;
}

export interface TechAnalysis {
  id: string;
  innovationType: string;
  analysisData: any;
  detectedElements?: any[];
  suggestedActions?: any[];
  confidence?: number;
  success?: boolean;
  userId?: string;
  metadata?: any;
}

export interface TechMetric {
  innovationId: number;
  innovationName: string;
  metricName: string;
  metricValue: number;
  timestamp: number;
}

export interface TechSubspace {
  id: string;
  name: string;
  type: string;
  subspaceData: any;
  referenceImages: string[];
  createdAt: number;
  updatedAt: number;
  metadata?: any;
}

export interface TechFeedback {
  id: string;
  predictionId: string;
  imageId?: string;
  innovationType: string;
  userFeedback: string;
  correction?: string;
  confidenceScore?: number;
  userId?: string;
}

export interface VisionFolder {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  createdAt: number;
  metadata?: any;
}

// ============================================================================
// MODULE MINDMAP
// ============================================================================

export interface DbCircuitMindMap {
  id: string;
  circuit_id: string;
  mindmap_data: string; // JSON Stringified
  thumbnail_url: string | null;
  metadata: string; // JSON Stringified
  created_at: number;
  updated_at: number;
  version: number;
}

export interface DbMindMapNode {
  id: string;
  mindmap_id: string;
  parent_id: string | null;
  type: string;
  label: string;
  description: string | null;
  position_x: number | null;
  position_y: number | null;
  style: string; // JSON Stringified
}

export interface DbMindMapEmbedding {
  id: string;
  mindmap_id: string;
  chunk_text: string;
  embedding: Buffer;
  metadata: string; // JSON Stringified
}
