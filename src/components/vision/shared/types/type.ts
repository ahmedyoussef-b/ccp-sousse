// src/components/vision/shared/types/type.ts

// ============================================================================
// TYPES DE BASE VISION (Alignés sur l'API et les composants)
// ============================================================================

export interface RegionOfInterest {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  label?: string;
  category?: string;
  color?: string;
}

export interface AnchorPoint {
  id: string;
  x: number;
  y: number;
  confidence: number;
  type: 'corner' | 'edge' | 'center' | 'feature';
  label?: string;
}

export interface ImageMetadata {
  id: string;
  filename: string;
  path: string;
  size?: number;
  width?: number;
  height?: number;
  format?: string;
  date?: string;
  location?: string;
  createdAt?: string;
  capturedAt?: string;
  tags: string[];
  equipmentState?: 'normal' | 'defect' | 'warning' | 'unknown' | 'degraded' | 'critical' | 'maintenance';
  description?: string;
  preparationStatus?: 'not_started' | 'processing' | 'completed' | 'failed' | 'pending';
  rois?: RegionOfInterest[];
  anchors?: AnchorPoint[];
  hasPreparations?: boolean;
  imageType?: 'global' | 'part' | 'simple' | 'assemblage' | 'image' | 'video' | 'depth' | 'thermal' | 'pointcloud' | 'unknown' | 'directory' | 'file';
  thumbnailUrl?: string;
  qaPairs?: string;
  invocationKeywords?: string;
  validUntil?: string;
  linkedProcedure?: string;
  image?: string; // Base64 content for some views
  zone?: string;
  equipmentType?: string;
  zoneId?: string;
  circuitId?: string;
  parameterId?: string;
  metadata?: Record<string, any>;
}

export interface VisionFileNode {
  id: string;
  name: string;
  path: string;
  type: 'directory' | 'file';
  parentId?: string | null;
  children?: VisionFileNode[];
  images?: ImageMetadata[];
  imageCount?: number;
  hasChildren?: boolean;
  imageType?: 'global' | 'part' | 'simple' | 'assemblage' | 'image' | 'video' | 'depth' | 'thermal' | 'pointcloud' | 'unknown' | 'directory' | 'file';
  hasPreparations?: boolean;
}

// Alias pour compatibilité
export type FolderNode = VisionFileNode;

// ============================================================================
// TYPES POUR LE PART MATCHING
// ============================================================================

export interface GlobalImage {
  id: string;
  imageId: string;
  filename: string;
  description: string;
  gridRows: number;
  gridCols: number;
  patchesCount: number;
  processedAt: number;
}

export interface PartLocationResult {
  found: boolean;
  globalImage?: {
    id: string;
    filename: string;
    image?: string;
    url?: string;
  };
  matchedZone?: {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  };
  similarity: number;
  message?: string;
}

export interface RegisterGlobalResult {
  success: boolean;
  globalImageId?: string;
  patchesCount?: number;
  gridRows?: number;
  gridCols?: number;
  message?: string;
}

export interface PartMatchingStats {
  globalImagesCount: number;
  totalPartsCount?: number;
  totalPatchesCount?: number;
  indexedPatchesCount?: number;
  successfulMatches: number;
  totalSearches: number;
  matchRate: number;
  lastUpdated: number | null;
}

// ============================================================================
// TYPES POUR LES MÉTADONNÉES D'ENREGISTREMENT
// ============================================================================

export interface ImageRegistrationMetadata {
  filename: string;
  description: string;
  tags: string[];
  location?: string;
  folderId?: string;
  imageType?: 'global' | 'simple';
}