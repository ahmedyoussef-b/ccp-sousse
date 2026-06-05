// src/lib/document-manager/config.ts
/**
 * @fileOverview Configuration du gestionnaire de documents - Version Zones.
 * Définit les racines du système de fichiers et les règles de mapping vers ChromaDB.
 * Version 3.0 - Architecture par zones (A0, B0, B1, B2, B3, TG1, TG2, HR, MAINTENANCE, SHARED)
 */

import path from 'path';
import { ZONES_CONFIG, type ZoneType } from '@/ai/vector/chromadb-schema';

// ============================================================================
// CONFIGURATION RACINE
// ============================================================================

/**
 * Racine des données techniques
 * Structure: data/centrale_documents/[ZONE]/[type]/
 */
export const DOCUMENTS_ROOT = path.join(process.cwd(), 'data', 'centrale_documents');

// ============================================================================
// LISTE DES ZONES (remplace FOLDER_NAMES)
// ============================================================================

export const ZONE_FOLDERS = Object.keys(ZONES_CONFIG) as ZoneType[];

// ============================================================================
// CONFIGURATION DES FORMATS SUPPORTÉS
// ============================================================================

export const SUPPORTED_FILE_TYPES = {
  // Documents texte
  'txt': { mime: 'text/plain', extractor: 'text', maxSize: 100 * 1024 * 1024 },
  'md': { mime: 'text/markdown', extractor: 'text', maxSize: 100 * 1024 * 1024 },
  'json': { mime: 'application/json', extractor: 'text', maxSize: 50 * 1024 * 1024 },
  'xml': { mime: 'application/xml', extractor: 'text', maxSize: 50 * 1024 * 1024 },
  'csv': { mime: 'text/csv', extractor: 'text', maxSize: 100 * 1024 * 1024 },
  
  // PDF
  'pdf': { mime: 'application/pdf', extractor: 'pdf', maxSize: 200 * 1024 * 1024 },
  
  // Images (OCR)
  'jpg': { mime: 'image/jpeg', extractor: 'ocr', maxSize: 50 * 1024 * 1024 },
  'jpeg': { mime: 'image/jpeg', extractor: 'ocr', maxSize: 50 * 1024 * 1024 },
  'png': { mime: 'image/png', extractor: 'ocr', maxSize: 50 * 1024 * 1024 },
  'bmp': { mime: 'image/bmp', extractor: 'ocr', maxSize: 50 * 1024 * 1024 },
  'tiff': { mime: 'image/tiff', extractor: 'ocr', maxSize: 50 * 1024 * 1024 },
  'tif': { mime: 'image/tiff', extractor: 'ocr', maxSize: 50 * 1024 * 1024 },
  'webp': { mime: 'image/webp', extractor: 'ocr', maxSize: 50 * 1024 * 1024 },
  'gif': { mime: 'image/gif', extractor: 'ocr', maxSize: 50 * 1024 * 1024 },
  
  // Microsoft Office
  'doc': { mime: 'application/msword', extractor: 'office', maxSize: 100 * 1024 * 1024 },
  'docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extractor: 'office', maxSize: 100 * 1024 * 1024 },
  'xls': { mime: 'application/vnd.ms-excel', extractor: 'office', maxSize: 100 * 1024 * 1024 },
  'xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extractor: 'office', maxSize: 100 * 1024 * 1024 },
  'ppt': { mime: 'application/vnd.ms-powerpoint', extractor: 'office', maxSize: 100 * 1024 * 1024 },
  'pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extractor: 'office', maxSize: 100 * 1024 * 1024 },
  
  // Archives
  'zip': { mime: 'application/zip', extractor: 'archive', maxSize: 500 * 1024 * 1024 },
  'rar': { mime: 'application/vnd.rar', extractor: 'archive', maxSize: 500 * 1024 * 1024 },
  '7z': { mime: 'application/x-7z-compressed', extractor: 'archive', maxSize: 500 * 1024 * 1024 },
  
  // CAD
  'dwg': { mime: 'application/x-autocad', extractor: 'cad', maxSize: 200 * 1024 * 1024 },
  'dxf': { mime: 'application/x-autocad', extractor: 'cad', maxSize: 200 * 1024 * 1024 },
  'step': { mime: 'model/step', extractor: 'cad', maxSize: 200 * 1024 * 1024 },
  'stp': { mime: 'model/step', extractor: 'cad', maxSize: 200 * 1024 * 1024 },
} as const;

export type ExtractorType = 'text' | 'pdf' | 'ocr' | 'office' | 'archive' | 'cad'|'json';
export type SupportedExtension = keyof typeof SUPPORTED_FILE_TYPES;

export function isSupportedExtension(ext: string): ext is SupportedExtension {
  return ext.toLowerCase() in SUPPORTED_FILE_TYPES;
}

export function getFileTypeConfig(ext: string) {
  const normalizedExt = ext.toLowerCase().replace(/^\./, '');
  if (isSupportedExtension(normalizedExt)) {
    return SUPPORTED_FILE_TYPES[normalizedExt];
  }
  return null;
}

// ============================================================================
// MAPPING DES COLLECTIONS (déprécié – utilisation des zones directement)
// Gardé pour compatibilité descendante avec d'anciens modules.
// ============================================================================

export interface CollectionConfig {
  name: string;
  displayName: string;
  description: string;
  category: string;
  priority: number;
  enabled: boolean;
}

// Anciennes collections – pour compatibilité (peuvent être supprimées si aucun module ne les utilise)
export const COLLECTION_CONFIG: Record<string, CollectionConfig> = {};

// Pour éviter les erreurs, on crée un mapping vide
export const COLLECTION_MAPPING: Record<string, string> = {};
export const COLLECTION_NAMES: string[] = [];
export const FOLDER_NAMES: string[] = [];

// Alias – pour compatibilité
export const COLLECTION_ALIASES: Record<string, string> = {};

export function getCollectionConfig(_folderName: string): CollectionConfig | null {
  return null;
}

export function getCollectionByChromaName(_chromaName: string): CollectionConfig | null {
  return null;
}

export function resolveCollectionName(alias: string): string {
  return alias;
}

export function getActiveChromaCollections(): string[] {
  return ZONE_FOLDERS;
}

export function getAllAliases(): string[] {
  return [];
}

export function getFolderNameFromChromaName(chromaName: string): string | null {
  return ZONE_FOLDERS.includes(chromaName as ZoneType) ? chromaName : null;
}

export function isValidCollectionName(name: string): boolean {
  return ZONE_FOLDERS.includes(name as ZoneType);
}

export function normalizeCollectionName(name: string): string {
  return name;
}

// ============================================================================
// CONFIGURATION DE TRAITEMENT
// ============================================================================

export const CHUNKING_CONFIG = {
  size: {
    default: 2500,
    min: 800,
    max: 5000,
    overlap: 300
  },
  semantic: {
    enabled: true,
    separators: ['\n## ', '\n### ', '\n\n', '\n', '. ', ' '],
    minChunkSize: 200
  },
  structural: {
    detectSections: true,
    detectSteps: true,
    detectTables: true,
    preserveCodeBlocks: true,
    preserveProcedureBlocks: true,
    maxStepBlockSize: 5000
  },
  specialRules: {
    profile: { preserveFull: true, maxSize: 10000 },
    procedure: { preserveFull: false, chunkSize: 3000, preserveSteps: true, maxStepsPerChunk: 20 },
    safety: { preserveFull: false, chunkSize: 2500, preserveWarnings: true },
    equipment: { preserveFull: false, chunkSize: 3000, preserveSpecs: true },
    training: { preserveFull: false, chunkSize: 2500, preserveExamples: true }
  }
};

export const INDEXING_CONFIG = {
  batchSize: 50,
  retryAttempts: 3,
  retryDelay: 1000,
  timeout: 600000,
  concurrentUploads: 3,
  useCache: true,
  cacheTTL: 3600,
  maxDocumentSize: 50000,
  preserveMetadata: true,
  indexFullText: true,
  chunkRetryAttempts: 2,
  chunkRetryDelay: 500
};

export const OCR_CONFIG = {
  service: 'ocr.space',
  apiUrl: 'https://api.ocr.space/parse/image',
  apiKey: process.env.OCR_SPACE_API_KEY || '',
  maxFileSize: 50 * 1024 * 1024,
  timeout: 120000,
  retryAttempts: 3,
  retryDelay: 5000,
  languages: ['fr', 'eng', 'spa', 'deu', 'ita'],
  defaultLanguage: 'fr',
  options: {
    isOverlayRequired: false,
    isCreateSearchablePdf: false,
    isSearchablePdfHideTextLayer: true,
    detectOrientation: true,
    scale: true,
    OCREngine: 2
  },
  compression: {
    enabled: true,
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 85,
    detectCompressed: true,
    compressedPatterns: ['_compressed', '_compressed_compressed'],
    maxCompressionDepth: 1
  },
  cache: {
    enabled: true,
    ttl: 86400,
    maxEntries: 1000
  }
};

export const WATCHER_CONFIG = {
  enabled: true,
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100
  },
  ignored: [
    /(^|[\/\\])\../,
    /~$/,
    /\.tmp$/,
    /\.swp$/,
    /Thumbs\.db$/,
    /\.DS_Store$/,
    /_assets/,
    /\.idx/,
    /chroma_data/,
    /\.next/,
    /node_modules/
  ],
  debounceDelay: 1000
};

export const LOG_CONFIG = {
  level: (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info',
  enabled: true,
  console: { enabled: true, format: 'pretty' },
  file: {
    enabled: process.env.NODE_ENV === 'production',
    path: path.join(process.cwd(), 'logs'),
    maxSize: 10 * 1024 * 1024,
    maxFiles: 10,
    format: 'json'
  },
  modules: {
    'hybrid-provider': true,
    'chromadb-manager': true,
    'ocrspace-service': true,
    'file-service': true,
    'collection-sync': true
  }
};

export const DOCUMENT_TYPE_CONFIG = {
  profile: {
    collections: ['HR'],
    preserveFullDocument: true,
    maxTokens: 1500,
    temperature: 0.3,
    priority: 1,
    chunkSize: 5000,
    overlap: 500
  },
  procedure: {
    collections: ['TG1', 'TG2', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE', 'B0_AUXILIAIRES'],
    preserveFullDocument: false,
    chunkSize: 3000,
    overlap: 300,
    priority: 1,
    preserveSteps: true,
    maxStepsPerChunk: 20,
    preserveSafetyNotes: true
  },
  equipment: {
    collections: ['TG1', 'TG2', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE', 'B0_AUXILIAIRES', 'A0_DIVERS'],
    preserveFullDocument: false,
    chunkSize: 3000,
    overlap: 300,
    priority: 2,
    preserveSpecifications: true,
    preserveTechnicalData: true
  },
  safety: {
    collections: ['SHARED', 'B0_AUXILIAIRES', 'TG1', 'TG2', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE'],
    preserveFullDocument: false,
    chunkSize: 2500,
    overlap: 250,
    priority: 1,
    preserveWarnings: true,
    preserveThresholds: true
  },
  general: {
    collections: ['SHARED', 'A0_DIVERS'],
    preserveFullDocument: false,
    chunkSize: 2500,
    overlap: 300,
    priority: 3
  },
  training: {
    collections: ['HR', 'SHARED'],
    preserveFullDocument: false,
    chunkSize: 2500,
    overlap: 200,
    priority: 2,
    preserveExamples: true,
    preserveExercises: true
  },
  maintenance: {
    collections: ['MAINTENANCE'],
    preserveFullDocument: false,
    chunkSize: 3000,
    overlap: 300,
    priority: 1,
    preserveChecklists: true,
    preserveProcedures: true
  }
};

// ============================================================================
// INTERFACES ET TYPES
// ============================================================================

export interface FileNode {
  collection: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  size?: number;
  modifiedAt?: Date;
  createdAt?: Date;
  extension?: string;
  mimeType?: string;
  zone?: ZoneType;
  syncStatus?: 'pending' | 'syncing' | 'synced' | 'error' | 'partial';
  error?: string;
  processingProgress?: number;
  chunksCount?: number;
  processingTime?: number;
}

export interface DocumentMetadata {
  id: string;
  titre: string;
  type: string;
  categorie: string;
  sous_categorie?: string;
  equipement?: string;
  zone?: ZoneType;
  pupitre?: string;
  profils_cibles: string[];
  tags: string[];
  source: string;
  version: string;
  fileSize?: number;
  fileType?: string;
  mimeType?: string;
  extractedBy: string;
  extractionDate: Date;
  processingTime?: number;
  confidence?: number;
  ocrConfidence?: number;
  chunk_index?: number;
  chunk_total?: number;
  is_chunk?: boolean;
  parent_id?: string;
  chunkingStrategy?: string;
  docType?: string;
}

export interface ProcessingResult {
  success: boolean;
  documentId: string;
  collection: string;
  chunksCount: number;
  processingTime: number;
  error?: string;
  metadata: DocumentMetadata;
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

export function generateDocumentId(filePath: string): string {
  const relative = path.relative(DOCUMENTS_ROOT, filePath);
  let id = relative
    .replace(/[^a-zA-Z0-9]/g, '_')
    .toLowerCase()
    .replace(/_+/g, '_');
  if (id.length > 100) {
    const ext = path.extname(id);
    const name = id.substring(0, 100 - ext.length);
    id = name + ext;
  }
  return id;
}

export function getNormalizedExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
  return ext;
}

export function isFileSupported(filePath: string): boolean {
  const ext = getNormalizedExtension(filePath);
  return isSupportedExtension(ext);
}

export function getMaxFileSize(filePath: string): number {
  const ext = getNormalizedExtension(filePath);
  const config = getFileTypeConfig(ext);
  return config?.maxSize || 50 * 1024 * 1024;
}

export function getExtractorType(filePath: string): ExtractorType | null {
  const ext = getNormalizedExtension(filePath);
  const config = getFileTypeConfig(ext);
  return config?.extractor || null;
}

export const IMAGE_EXTENSIONS = Object.keys(SUPPORTED_FILE_TYPES).filter(ext => 
  SUPPORTED_FILE_TYPES[ext as SupportedExtension]?.extractor === 'ocr'
);
export const OFFICE_EXTENSIONS = Object.keys(SUPPORTED_FILE_TYPES).filter(ext =>
  SUPPORTED_FILE_TYPES[ext as SupportedExtension]?.extractor === 'office'
);
export const TEXT_EXTENSIONS = Object.keys(SUPPORTED_FILE_TYPES).filter(ext =>
  SUPPORTED_FILE_TYPES[ext as SupportedExtension]?.extractor === 'text'
);