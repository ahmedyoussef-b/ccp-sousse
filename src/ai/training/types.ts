/**
 * @fileOverview Définitions de types pour le pipeline ML AGENTIC
 * @version 2.0.0
 * @lastUpdated 2026-04-02
 */

export interface TrainingExample {
  id?: string;
  type: 'comprehension' | 'reasoning' | 'action' | 'correction' | 'document_knowledge' | 'chat_success';
  input: string;
  output: string;
  instruction?: string;
  response?: string; // Ajout pour compatibilité avec certains exports
  context?: any;
  weight?: number;
  source?: string;
  docId?: string;
  rating?: number;
  correction?: string;
  metadata?: Record<string, any>;
  timestamp?: number;
}

export interface TrainingOptions {
  timeout?: number;
  validationSplit?: number;
  learningRate?: number;
  epochs?: number;
  batchSize?: number;
  loraRank?: number;
  loraAlpha?: number;
  modelName?: string;
  baseModel?: string; // Ajouté pour la sélection du modèle source
  useRsLORA?: boolean;
  use4Bit?: boolean;
  maxSeqLength?: number;
  gradientCheckpointing?: boolean;
}

export interface TrainingMetrics {
  accuracy: number;
  loss: number;
  trainingTime: string;
  trainingTimeMs: number;
  samplesProcessed: number;
  convergence: 'Excellent' | 'Acceptable' | 'Arrêt précoce' | 'Normal' | 'Optimale';
  rank: number;
  alpha: number;
  validationAccuracy?: number;
  validationLoss?: number;
  epochsCompleted: number;
  finalLoss: number;
  gradNorm?: number;
  memoryUsageMB?: number;
}

export interface TrainedModel {
  name: string;
  version: string;
  path: string;
  metrics: TrainingMetrics;
  deployedAt?: number;
  status?: 'production' | 'backup' | 'candidate';
}

export interface Prediction {
  result: string;
  confidence: number;
  modelVersion: string;
  latency: number;
  tokensUsed?: number;
}

export interface UserInteraction {
  id?: string;
  input: string;
  prediction: string;
  actual?: string;
  feedback?: {
    rating: number;
    correction?: string;
    timestamp?: number;
  };
  context?: any;
  modelVersion: string;
  timestamp: number;
}

export interface PredictionRecord extends UserInteraction {
  id: string;
}

export interface UserProfile {
  userId: string;
  interests: string[];
  expertise: 'beginner' | 'intermediate' | 'expert';
  preferences: Record<string, any>;
  recentTopics: string[];
  documentTypes: string[];
  lastUpdated: number;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  category: string;
  confidence: number;
  reasons: string[];
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export interface RecommendationContext {
  query?: string;
  limit?: number;
  currentTask?: string;
  domain?: string;
  userId?: string;
}

export interface Candidate {
  id: string;
  title: string;
  description: string;
  category: string;
  confidence: number;
}

export interface ScoredCandidate extends Candidate {
  score: number;
  reasons: string[];
}

// Correction: Suppression de l'index signature et des doublons
export interface PipelineResult {
  success: boolean;
  modelVersion: string;
  trainingSize: number;
  metrics: TrainingMetrics;
  timestamp: number;
  processingTime: number;
  stages: {
    collection: { duration: number; count: number; success: boolean };
    preparation: { duration: number; count: number; success: boolean };
    training: { duration: number; success: boolean; modelName?: string };
    evaluation: { duration: number; success: boolean; accuracy?: number };
    deployment: { duration: number; success: boolean };
  };
  warnings: string[];
  errors: string[];
  result: {
    technicalPrecision: number;
    hallucinationRate: number;
    instructionFollowing: number;
  };
}

export interface TrainingResult {
  status: 'skipped' | 'completed' | 'failed';
  reason?: string;
  gain?: number;
  deployed?: boolean;
  version?: string;
  metrics?: TrainingMetrics;
}