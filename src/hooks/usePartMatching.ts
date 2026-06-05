// src/hooks/usePartMatching.ts
'use client';

import { useState, useCallback } from 'react';

import { 
  RegisterGlobalResult, 
  PartLocationResult, 
  GlobalImage, 
  PartMatchingStats 
} from '@/components/vision/shared/types/type';

export type { 
  RegisterGlobalResult, 
  PartLocationResult, 
  GlobalImage, 
  PartMatchingStats 
};

interface UsePartMatchingReturn {
  // Enregistrer une image globale
  registerGlobalImage: (
    file: File,
    options?: {
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
  ) => Promise<RegisterGlobalResult>;
  
  // Rechercher la localisation d'une image
  findPartLocation: (
    file: File,
    options?: {
      globalImageId?: string;
      threshold?: number;
    }
  ) => Promise<PartLocationResult>;
  
  // Lister les images globales
  listGlobalImages: () => Promise<GlobalImage[]>;
  
  // Obtenir les statistiques
  getStats: () => Promise<PartMatchingStats>;
  
  // Obtenir le parent d'une image
  getParent: (imageId: string) => Promise<{
    id: string;
    relationshipType: string;
    matchedZone: { x: number; y: number; width: number; height: number };
    confidence: number;
  } | null>;
  
  // Obtenir les enfants d'une image
  getChildren: (imageId: string) => Promise<Array<{
    id: string;
    relationshipType: string;
    confidence: number;
  }>>;
  
  // Créer une relation manuelle
  createRelation: (data: {
    childId: string;
    parentId: string;
    relationshipType?: string;
    matchedZone?: { x: number; y: number; width: number; height: number };
    confidence?: number;
  }) => Promise<{ success: boolean; message: string }>;
  
  // États
  isLoading: boolean;
  error: string | null;
}

export function usePartMatching(): UsePartMatchingReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = '/api/innovations/part-matching';

  /**
   * Enregistrer une image globale (pupitre complet)
   */
  const registerGlobalImage = useCallback(async (
    file: File,
    options?: {
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
  ): Promise<RegisterGlobalResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);
      
      if (options?.gridRows) formData.append('gridRows', options.gridRows.toString());
      if (options?.gridCols) formData.append('gridCols', options.gridCols.toString());
      if (options?.overlap) formData.append('overlap', options.overlap.toString());
      if (options?.patchSize) formData.append('patchSize', options.patchSize.toString());
      if (options?.autoGrid) formData.append('autoGrid', 'true');
      if (options?.description) formData.append('description', options.description);
      if (options?.zone) formData.append('zone', options.zone);
      if (options?.equipmentType) formData.append('equipmentType', options.equipmentType);
      if (options?.tags) formData.append('tags', JSON.stringify(options.tags));

      const response = await fetch(`${API_BASE}/register-global`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'enregistrement');
      }
      
      return {
        success: data.success,
        globalImageId: data.globalImageId,
        patchesCount: data.patchesCount,
        gridRows: data.gridRows,
        gridCols: data.gridCols,
        message: data.message
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMsg);
      return { success: false, message: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Rechercher la localisation d'une image dans une image globale
   */
  const findPartLocation = useCallback(async (
    file: File,
    options?: {
      globalImageId?: string;
      threshold?: number;
    }
  ): Promise<PartLocationResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);
      if (options?.globalImageId) formData.append('globalImageId', options.globalImageId);
      if (options?.threshold) formData.append('threshold', options.threshold.toString());

      const response = await fetch(`${API_BASE}/match-detail`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la recherche');
      }
      
      return {
        found: data.found,
        globalImage: data.globalImage,
        matchedZone: data.matchedZone,
        similarity: data.similarity || 0,
        message: data.message
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMsg);
      return { found: false, similarity: 0, message: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Lister toutes les images globales
   */
  const listGlobalImages = useCallback(async (): Promise<GlobalImage[]> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/hierarchy?type=globals`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du chargement');
      }
      
      return data.globalImages || [];
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMsg);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Obtenir les statistiques du module
   */
  const getStats = useCallback(async (): Promise<PartMatchingStats> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/hierarchy`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du chargement des statistiques');
      }
      
      return data.stats || {
        globalImagesCount: 0,
        totalPatchesCount: 0,
        successfulMatches: 0,
        totalSearches: 0,
        matchRate: 0,
        lastUpdated: null
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMsg);
      return {
        globalImagesCount: 0,
        totalPatchesCount: 0,
        successfulMatches: 0,
        totalSearches: 0,
        matchRate: 0,
        lastUpdated: null
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Obtenir le parent d'une image
   */
  const getParent = useCallback(async (imageId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/hierarchy?type=parent&imageId=${imageId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du chargement du parent');
      }
      
      return data.parent || null;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMsg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Obtenir les enfants d'une image
   */
  const getChildren = useCallback(async (imageId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/hierarchy?type=children&imageId=${imageId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du chargement des enfants');
      }
      
      return data.children || [];
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMsg);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Créer une relation hiérarchique manuelle
   */
  const createRelation = useCallback(async (data: {
    childId: string;
    parentId: string;
    relationshipType?: string;
    matchedZone?: { x: number; y: number; width: number; height: number };
    confidence?: number;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/hierarchy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de la création de la relation');
      }
      
      return { success: true, message: result.message || 'Relation créée' };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMsg);
      return { success: false, message: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    registerGlobalImage,
    findPartLocation,
    listGlobalImages,
    getStats,
    getParent,
    getChildren,
    createRelation,
    isLoading,
    error,
  };
}