/**
 * Types partagés pour les innovations AGENTIC Vision
 * @module innovations/types
 * @version 1.1.0 - Ajout Part Matching
 */

// ============================================================================
// INNOVATION 1 : Détection d'anomalies Zero-Shot
// ============================================================================

export interface NormalSubspace {
  mean: number[];
  components: number[][];
  explainedVariance: number[];
  threshold: number;
  referenceImages: string[];
  createdAt: string;
}

export interface AnomalyDetectionResult {
  report: string;
  isAnomaly: boolean;
  anomalyScore: number;
  threshold: number;
  reconstructionError: number;
  anomalyRegions?: Array<{
    bbox: [number, number, number, number];
    score: number;
  }>;
}

// ============================================================================
// INNOVATION 2 : Agent Visuel Computer-Use
// ============================================================================

export interface ScreenAnalysis {
  timestamp: string;
  detectedElements: Array<{
    type: 'alarm' | 'valve' | 'pump' | 'gauge' | 'button' | 'text';
    label: string;
    bbox?: [number, number, number, number];
    confidence: number;
    state?: 'normal' | 'warning' | 'critical' | 'unknown';
  }>;
  suggestedActions: string[];
  rawResponse: string;
}

export interface ComputerUseAgentConfig {
  enabled: boolean;
  screenshotInterval?: number;
  autoSuggest: boolean;
  maxActionsPerSession: number;
}

// ============================================================================
// INNOVATION 3 : Double Consensus Vision
// ============================================================================

export interface DualConsensusResult {
  text: string;
  confidence: number;
  consensus: 'full' | 'partial' | 'conflict';
  model1Result: string;
  model2Result: string;
  model1Confidence: number;
  model2Confidence: number;
  validatedFields: Record<string, string>;
  conflictingFields: Record<string, { model1: string; model2: string }>;
}

// ============================================================================
// INNOVATION 4 : Classification Auto des Dossiers
// ============================================================================

export interface AutoFolderClassification {
  suggestedFolder: string;
  confidence: number;
  equipmentType: string;
  zone: string;
  tags: string[];
  alternativeFolders: Array<{ path: string; confidence: number }>;
}

// ============================================================================
// INNOVATION 5 : Recherche Hybride Vision/Texte
// ============================================================================

export interface HybridVisionSearchParams {
  imageBuffer?: Buffer;
  textQuery?: string;
  visionWeight?: number;
  textWeight?: number;
  threshold?: number;
  maxResults?: number;
  filterFolder?: string;
  filterTags?: string[];
}

export interface HybridSearchResult {
  id: string;
  visionSimilarity: number;
  textSimilarity: number;
  combinedScore: number;
  metadata: {
    filename: string;
    description: string;
    tags: string[];
    folderId: string;
    date: string;
  };
  matchedTextFields: string[];
  
  mllmReRanked?: boolean;
  mllmScore?: number;
  mllmReason?: string;
}

export interface HybridSearchStats {
  indexSize: number;
  config: any;
  initialized: boolean;
  searchesCount: number;
  personalizedSearchesCount: number;
  dualConsensusSearchesCount: number;
  mllmReRankedSearchesCount: number;
  cacheHitRate: number;
}

// ============================================================================
// INNOVATION 6 : Entraînement Few-Shot de Défauts
// ============================================================================

export interface DefectDetector {
  id: string;
  name: string;
  description: string;
  referenceImageIds: string[];
  subspace: NormalSubspace;
  createdAt: string;
  updatedAt: string;
  sampleCount: number;
}

export interface TrainDefectResult {
  success: boolean;
  detectorId: string;
  message: string;
  validationScore?: number;
}

// ============================================================================
// INNOVATION 7 : Vision Panoramique
// ============================================================================

export interface PanoramaResult {
  success: boolean;
  panoramaBuffer?: Buffer; // Node.js side
  panoramaUrl?: string;    // Client side
  stitchedCount: number;
  quality: number;
  message?: string;
  metadata?: {
    mode: PanoramaMode;
    blending: BlendingStrategy;
    durationMs: number;
    homographyMatrices?: number[][][]; // Paires de matrices 3x3
    pointsDetected?: number;
    inliers?: number;
  };
}

export type PanoramaMode = 'auto' | 'manual' | 'hybrid';
export type BlendingStrategy = 'linear' | 'multi-band' | 'feathering' | 'gradient' | 'laplacian';
export type WarpMode = 'spherical' | 'cylindrical' | 'plane' | 'affine' | 'perspective';

export interface StitchingConfig {
  mode: PanoramaMode;
  blending: BlendingStrategy;
  warpMode: WarpMode;
  matchConfidence: number;
  blendStrength: number;
  
  // Paramètres techniques IA (Mode Auto/Hybride)
  sift?: {
    nFeatures: number;
    contrastThreshold: number;
  };
  flann?: {
    trees: number;
    checks: number;
  };
  ransac?: {
    threshold: number;
    maxIter: number;
  };
}

export interface ManualImageState {
  imageId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  zIndex: number;
}

// ============================================================================
// INNOVATION 8 : Feedback et Confiance
// ============================================================================

export interface ConfidenceMetadata {
  score: number;
  level: 'high' | 'medium' | 'low';
  factors: Array<{
    name: string;
    value: number;
    weight: number;
  }>;
  recommendation: 'trust' | 'verify' | 'reject';
}

export interface FeedbackRecord {
  id: string;
  imageId: string;
  predictionId: string;
  userFeedback: 'confirm' | 'correct' | 'reject';
  correction?: string;
  timestamp: string;
  userId?: string;
}

export interface FeedbackStats {
  totalFeedbacks: number;
  confirmationRate: number;
  correctionRate: number;
  rejectionRate: number;
  averageConfidenceWhenCorrect: number;
  averageConfidenceWhenWrong: number;
  thresholdRecommendations: {
    high: number;
    medium: number;
    low: number;
  };
}

// ============================================================================
// INNOVATION 9 : Intelligent Part Matching (Part-to-Whole)
// ============================================================================

/**
 * Type d'image dans la hiérarchie
 */
export type ImageHierarchyType = 'global' | 'normal' | 'part';

/**
 * Paramètres pour l'enregistrement d'une image globale
 */
export interface RegisterGlobalParams {
  imageBuffer: Buffer;
  filename: string;
  imageId?: string;       // ✅ Optionnel: si déjà enregistrée par VisionService
  gridRows?: number;      // Optionnel, auto-détection possible
  gridCols?: number;      // Optionnel, auto-détection possible
  overlap?: number;       // Default: 0.2
  patchSize?: number;     // Default: 256
  ocrEnabled?: boolean;   // Default: true
  autoTagging?: boolean;  // Default: true
  metadata?: Partial<{
    description: string;
    zone: string;
    equipmentType: string;
    tags: string[];
    folderId?: string;
  }>;
}

/**
 * Paramètres pour la recherche de localisation
 */
export interface MatchDetailParams {
  imageBuffer: Buffer;
  globalImageId?: string;  // Optionnel: si connu, recherche seulement dans celle-ci
  threshold?: number;      // Default: 0.55
  maxResults?: number;     // Default: 5
}

/**
 * Patch extrait d'une image globale
 */
export interface ImagePatch {
  id: string;
  parentImageId: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  gridPosition: {
    row: number;
    col: number;
  };
  features: number[];
  thumbnail?: string;
  tags: string[];
  confidence: number;
}

/**
 * Métadonnées pour une image globale (pupitre complet)
 */
export interface GlobalImageMetadata {
  type: 'global';
  grid: {
    rows: number;
    cols: number;
    patchSize: number;
    overlap: number;
  };
  parts: Array<{
    id: string;
    position: { x: number; y: number; width: number; height: number };
    tags: string[];
    organType?: string;
    label?: string;
    confidence: number;
  }>;
  hierarchy: {
    parentId?: string;
    childrenIds: string[];
  };
  ocrData?: Array<{
    text: string;
    boundingBox: { x: number; y: number; width: number; height: number };
    confidence: number;
  }>;
}

/**
 * Résultat de la recherche de localisation
 */
export interface PartLocationResult {
  found: boolean;
  globalImage?: {
    id: string;
    url?: string;
    filename: string;
    metadata: GlobalImageMetadata;
  };
  matchedZone?: {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  };
  matchedPart?: {
    id: string;
    label?: string;
    organType?: string;
    tags: string[];
  };
  similarity: number;
  message?: string;
}

/**
 * Statistiques du module Part Matching
 */
export interface PartMatchingStats {
  globalImagesCount: number;
  totalPartsCount: number;
  indexedPatchesCount: number;
  averagePatchesPerGlobal: number;
  successfulMatches: number;
  totalSearches: number;
  matchRate: number;
}

// ============================================================================
// CONFIGURATION GLOBALE DES INNOVATIONS
// ============================================================================

export interface InnovationsConfig {
  zeroShotAnomaly: {
    enabled: boolean;
    defaultThreshold: number;
    referenceImagesRequired: number;
  };
  computerUseAgent: ComputerUseAgentConfig;
  dualConsensus: {
    enabled: boolean;
    model1: string;
    model2: string;
    consensusThreshold: number;
  };
  autoFolderClassifier: {
    enabled: boolean;
    autoTag: boolean;
    minConfidence: number;
  };
  hybridSearch: {
    enabled: boolean;
    defaultVisionWeight: number;
    defaultTextWeight: number;
  };
  fewShotTrainer: {
    enabled: boolean;
    minSamplesForTraining: number;
    autoValidate: boolean;
  };
  panoramicStitching: StitchingConfig & { enabled: boolean; maxImages: number };
  confidenceFeedback: {
    enabled: boolean;
    storeFeedbackLocally: boolean;
    autoAdjustThresholds: boolean;
  };
  // 🔥 NOUVEAU: Configuration pour Part Matching
  partMatching: {
    enabled: boolean;
    defaultGridRows: number;
    defaultGridCols: number;
    defaultOverlap: number;
    defaultPatchSize: number;
    minConfidence: number;
    autoOcrEnabled: boolean;
    autoTaggingEnabled: boolean;
  };
}