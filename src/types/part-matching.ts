// src/types/part-matching.ts

/**
 * Types pour le module Part Matching (Innovation #9)
 * Intelligent Part Matching - Localisation d'images dans des pupitres globaux
 */

// ============================================================================
// TYPES DE BASE
// ============================================================================

/**
 * Type d'image dans la hiérarchie
 */
export type ImageHierarchyType = 'global' | 'normal' | 'part';

/**
 * Type de relation hiérarchique
 */
export type RelationshipType = 'part_of' | 'contains' | 'detail_of' | 'instance_of';

// ============================================================================
// INTERFACES POUR LES IMAGES GLOBALES
// ============================================================================

/**
 * Configuration de la grille de découpage
 */
export interface GridConfig {
  rows: number;        // Nombre de lignes
  cols: number;        // Nombre de colonnes
  patchSize: number;   // Taille des patches en pixels
  overlap: number;     // Chevauchement entre patches (0-1)
  totalPatches: number; // Nombre total de patches (rows * cols)
}

/**
 * Métadonnées pour une image globale (pupitre complet)
 */
export interface GlobalImageMetadata {
  id: string;
  imageId: string;           // Référence vers l'image dans vision_data
  filename: string;
  description?: string;
  zone?: string;
  equipmentType?: string;
  grid: GridConfig;
  processedAt: number;       // Timestamp de l'indexation
  tags?: string[];
}

/**
 * Patch extrait d'une image globale
 */
export interface ImagePatch {
  id: string;
  globalImageId: string;
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
  features: number[];        // Vecteur de features
  tags: string[];
  confidence: number;
  createdAt: number;
}

// ============================================================================
// INTERFACES POUR LES RELATIONS HIÉRARCHIQUES
// ============================================================================

/**
 * Relation hiérarchique entre images
 */
export interface HierarchyRelation {
  childId: string;           // ID de l'image enfant (détail)
  parentId: string;          // ID de l'image parente (globale)
  relationshipType: RelationshipType;
  matchedZone: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  createdAt: number;
}

/**
 * Information sur une zone localisée
 */
export interface MatchedZone {
  x: number;        // Position X en pourcentage (0-100)
  y: number;        // Position Y en pourcentage (0-100)
  width: number;    // Largeur en pourcentage (0-100)
  height: number;   // Hauteur en pourcentage (0-100)
  confidence: number;
}

// ============================================================================
// INTERFACES POUR LES RÉSULTATS DE RECHERCHE
// ============================================================================

/**
 * Résultat de localisation d'une image
 */
export interface PartLocationResult {
  found: boolean;
  globalImage?: {
    id: string;
    filename: string;
    description?: string;
  };
  matchedZone?: MatchedZone;
  similarity: number;
  message?: string;
}

/**
 * Résultat d'enregistrement d'une image globale
 */
export interface RegisterGlobalResult {
  success: boolean;
  globalImageId?: string;
  patchesCount?: number;
  gridRows?: number;
  gridCols?: number;
  message?: string;
  error?: string;
}

// ============================================================================
// INTERFACES POUR LES PARAMÈTRES D'API
// ============================================================================

/**
 * Paramètres pour l'enregistrement d'une image globale
 */
export interface RegisterGlobalParams {
  imageBuffer: Buffer;
  filename: string;
  gridRows?: number;
  gridCols?: number;
  overlap?: number;
  patchSize?: number;
  autoGrid?: boolean;
  description?: string;
  zone?: string;
  equipmentType?: string;
  tags?: string[];
}

/**
 * Paramètres pour la recherche de localisation
 */
export interface MatchDetailParams {
  imageBuffer: Buffer;
  globalImageId?: string;
  threshold?: number;
  maxResults?: number;
}

// ============================================================================
// STATISTIQUES
// ============================================================================

/**
 * Statistiques du module Part Matching
 */
export interface PartMatchingStats {
  globalImagesCount: number;
  totalPatchesCount: number;
  successfulMatches: number;
  totalSearches: number;
  matchRate: number;
  lastUpdated: number | null;
}

// ============================================================================
// RÉPONSES API
// ============================================================================

/**
 * Réponse de l'API de hiérarchie
 */
export interface HierarchyApiResponse {
  success: boolean;
  parent?: {
    id: string;
    relationshipType: RelationshipType;
    matchedZone: MatchedZone;
    confidence: number;
  };
  children?: Array<{
    id: string;
    relationshipType: RelationshipType;
    confidence: number;
  }>;
  globalImages?: GlobalImageMetadata[];
  stats?: PartMatchingStats;
  error?: string;
  message?: string;
}

/**
 * Réponse de l'API de localisation
 */
export interface MatchDetailApiResponse {
  success: boolean;
  found: boolean;
  globalImage?: {
    id: string;
    filename: string;
  };
  matchedZone?: MatchedZone;
  similarity: number;
  message?: string;
  error?: string;
}

// ============================================================================
// TYPES POUR LE HOOK
// ============================================================================

/**
 * Interface du hook usePartMatching
 */
export interface UsePartMatchingReturn {
  registerGlobalImage: (file: File, options?: Omit<RegisterGlobalParams, 'imageBuffer' | 'filename'>) => Promise<RegisterGlobalResult>;
  findPartLocation: (file: File, options?: { globalImageId?: string; threshold?: number }) => Promise<PartLocationResult>;
  listGlobalImages: () => Promise<GlobalImageMetadata[]>;
  getStats: () => Promise<PartMatchingStats>;
  getParent: (imageId: string) => Promise<HierarchyRelation | null>;
  getChildren: (imageId: string) => Promise<HierarchyRelation[]>;
  createRelation: (data: Omit<HierarchyRelation, 'createdAt'>) => Promise<{ success: boolean; message: string }>;
  isLoading: boolean;
  error: string | null;
}