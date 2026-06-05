// types/vision.ts

export interface VisionSearchResult {
    found: boolean;
    match?: {
      id: string;
      similarity: number;
      metadata: VisionMetadata;
      thumbnail?: string;
    };
    matches?: Array<{
      id: string;
      similarity: number;
      metadata: VisionMetadata;
    }>;
    message?: string;
    data?: VisionData;
    diagnostic?: string; // Résultat du diagnostic IA (Qwen3-VL)
}

export interface VisionMetadata {
  filename: string;
  date: string;
  tags: string[];
  description: string;
  location?: string;
  author?: string;
  documentType?: string;
  relatedDocs?: string[];
  folderId?: string;
  linkedDocumentIds?: string[];
  ocrText?: string;           // Texte extrait via OCR

  // ✅ NOUVEAUX CHAMPS pour les métadonnées enrichies
  qaPairs?: string;           // JSON string
  invocationKeywords?: string;
  equipmentState?: 'normal' | 'degraded' | 'critical' | 'maintenance';
  validUntil?: string;        // date ISO
  linkedProcedure?: string;   // ID ou nom de procédure
  fileHash?: string;          // Hash MD5 du contenu
  imageType?: 'global' | 'simple'; // ✅ Innovation #9: Type d'image
  parentGlobalId?: string;      // ✅ Innovation #9: Lien vers l'image globale parente
  matchedZone?: {              // ✅ Innovation #9: Zone localisée
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  };
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
}

export interface VisionData extends VisionMetadata {
  id: string;
  image: string; // base64
  createdAt: string;
  features?: number[];
  ocr_text?: string; // Compatibilité snake_case DB

}

// Interface pour le dossier virtuel
export interface VisionFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

export interface VisionRegisterResponse {
  success: boolean;
  imageId: string;
  message: string;
}

export interface CameraState {
  isActive: boolean;
  capturedImage: string | null;
  facingMode: 'user' | 'environment';
  error: string | null;
}

// ============================================================================
// 🔥 NOUVEAUX TYPES POUR LE PART MATCHING (Innovation #9)
// ============================================================================

/**
 * Type d'image dans la hiérarchie
 */
export type ImageHierarchyType = 'global' | 'normal' | 'part';

/**
 * Métadonnées pour une image globale (pupitre complet)
 */
export interface GlobalImageMetadata extends VisionMetadata {
  type: 'global';
  grid: {
    rows: number;        // Découpage en lignes (ex: 3)
    cols: number;        // Découpage en colonnes (ex: 4)
    patchSize: number;   // Taille des patches (ex: 256)
    overlap: number;     // Chevauchement entre patches (ex: 0.2)
  };
  parts: Array<{
    id: string;                      // ID de la sous-image
    position: { x: number; y: number; width: number; height: number };
    tags: string[];                  // Tags hérités + spécifiques
    organType?: string;              // Type d'organe (pompe, vanne...)
    label?: string;                  // Label extrait du texte
    confidence: number;
  }>;
  hierarchy: {
    parentId?: string;
    childrenIds: string[];           // IDs des parties
  };
  ocrData?: Array<{
    text: string;
    boundingBox: { x: number; y: number; width: number; height: number };
    confidence: number;
  }>;
}

/**
 * Métadonnées pour une image normale ou partie
 */
export interface NormalImageMetadata extends VisionMetadata {
  type: 'normal' | 'part';
  parentGlobalId?: string;           // Lien vers l'image globale parente
  parentPartId?: string;             // Lien vers la partie spécifique
  matchedZone?: {                    // Zone dans l'image globale
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  };
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
}

/**
 * Résultat de la recherche de localisation
 */
export interface PartLocationResult {
  found: boolean;
  globalImage?: {
    id: string;
    url: string;
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
 * Paramètres pour l'enregistrement d'une image globale
 */
export interface RegisterGlobalParams {
  imageBuffer: Buffer;
  filename: string;
  gridRows?: number;      // Optionnel, auto-détection possible
  gridCols?: number;      // Optionnel, auto-détection possible
  overlap?: number;       // Default: 0.2
  patchSize?: number;     // Default: 256
  ocrEnabled?: boolean;   // Default: true
  autoTagging?: boolean;  // Default: true
  metadata?: Partial<VisionMetadata>;
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
 * Statistiques du module Part Matching
 */
export interface PartMatchingStats {
  globalImagesCount: number;
  totalPartsCount: number;
  indexedPatchesCount: number;
  averagePatchesPerGlobal: number;
  successfulMatches: number;
  totalSearches: number;
}

// ============================================================================
// 🔥 NOUVEAUX TYPES POUR LA PRÉPARATION (Innovation #10)
// ============================================================================

/**
 * Ancre visuelle ou logique pour le recalage
 */
export interface VisionAnchor {
  id: string;
  type: 'logical_anchor' | 'qr' | 'logo' | 'fixed_point';
  label?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  confidence: number;
}

/**
 * Composant détecté dans la hiérarchie spatiale
 */
export interface SpatialComponent {
  id: string;
  type: string;
  role: string;
  label?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}

/**
 * Hiérarchie spatiale complète d'une image
 */
export interface SpatialHierarchy {
  components: SpatialComponent[];
  relations: Array<{
    sourceId: string;
    targetId: string;
    type: 'contains' | 'next_to' | 'above' | 'below';
  }>;
  metadata: {
    analyzedAt: string;
    strategy: string;
  };
}

/**
 * Résultat complet d'une préparation d'image
 */
export interface ImagePreparation {
  imageId: string;
  status: 'not_started' | 'processing' | 'completed' | 'failed';
  preparationDate: string;
  rois: any[]; 
  anchors: VisionAnchor[];
  spatialHierarchy: SpatialHierarchy;
  pyramid: Array<{ scale: number; cached: boolean }>;
}