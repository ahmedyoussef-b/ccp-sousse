// hooks/useVisionSearch.ts
'use client';

import { useState, useCallback } from 'react';
import { VisionSearchResult, VisionRegisterResponse } from '@/types/vision';
import { ConfidenceMetadata } from '@/ai/innovations/types';
import { PartLocationResult } from './usePartMatching';

// Types étendus pour la recherche hybride
export interface HybridSearchOptions {
  threshold?: number;
  filterFolder?: string;
  filterTags?: string[];
  visionWeight?: number;
  textWeight?: number;
}

export interface EnhancedVisionSearchResult extends VisionSearchResult {
  searchMetadata?: {
    mode: 'vision' | 'text' | 'hybrid' | 'part';
    durationMs: number;
    filtersApplied?: string[];
    totalResults: number;
    mllmReRankedSearchesCount?: number;
  };
  matchedTextFields?: string[];
  confidence?: ConfidenceMetadata;
  suggestedTags?: string[];
  // 🔥 NOUVEAU: Pour Part Matching
  partLocation?: PartLocationResult;
  advancedDetails?: any;
}

export interface EnhancedSearchMatch {
  id: string;
  similarity: number;
  metadata: any;
  advancedDetails?: any;
  // 🔥 NOUVEAU: MLLM Re-Ranking
  mllmReRanked?: boolean;
  mllmScore?: number;
  mllmReason?: string;
}

interface UseVisionSearchReturn {
  // Recherche par image (compatible existant)
  searchImage: (file: File, threshold?: number) => Promise<VisionSearchResult>;

  // Recherche par texte uniquement
  searchByText: (query: string, options?: HybridSearchOptions) => Promise<EnhancedVisionSearchResult>;

  // Recherche hybride (image + texte)
  searchHybrid: (file: File, query: string, options?: HybridSearchOptions) => Promise<EnhancedVisionSearchResult>;

  // 🔥 NOUVEAU: Recherche de localisation (Part Matching)
  searchPartLocation: (file: File, options?: {
    globalImageId?: string;
    threshold?: number;
  }) => Promise<EnhancedVisionSearchResult>;

  // Recherche avancée avec tous les paramètres
  searchAdvanced: (params: {
    image?: File;
    textQuery?: string;
    threshold?: number;
    filterFolder?: string;
    filterTags?: string[];
    visionWeight?: number;
    textWeight?: number;
    mode?: 'vision' | 'text' | 'hybrid' | 'part';
  }) => Promise<EnhancedVisionSearchResult>;

  // Recherche par ID d'image existant
  searchByImageId: (imageId: string, threshold?: number) => Promise<EnhancedVisionSearchResult>;

  // 🔥 NOUVEAU: Accès aux matches typés
  matches: EnhancedSearchMatch[];
  match: EnhancedSearchMatch | null;

  // Méthodes existantes
  registerImage: (file: File, metadata?: any) => Promise<VisionRegisterResponse>;
  diagnoseImage: (file: File) => Promise<string>;
  getSuggestions: (file: File) => Promise<{
    tags: string[];
    description: string;
    equipmentType: string;
    zone: string;
  }>;
  reset: () => void;

  // États
  isLoading: boolean;
  error: string | null;
  result: EnhancedVisionSearchResult | null;
  confidence: ConfidenceMetadata | null;
  predictionId: string | null;
}

export function useVisionSearch(): UseVisionSearchReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnhancedVisionSearchResult | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceMetadata | null>(null);
  const [predictionId, setPredictionId] = useState<string | null>(null);

  // ========================================================================
  // FONCTIONS INTERNES
  // ========================================================================

  /**
   * Fonction interne pour les appels API de recherche standard avec timeout
   */
  const performSearch = useCallback(async (formData: FormData): Promise<EnhancedVisionSearchResult> => {
    const newPredictionId = `search_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setPredictionId(newPredictionId);
    setConfidence(null);

    const controller = new AbortController();
    // Timeout de 120s pour la recherche (augmenté pour supporter le pipeline complet)
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      console.log(`[VisionHook][${newPredictionId}] 🚀 Démarrage de la recherche...`);
      
      const response = await fetch('/api/vision/search', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMsg = 'Erreur recherche';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          console.error('[VisionHook] Erreur lecture réponse erreur:', e);
        }
        throw new Error(errorMsg);
      }

      const data: EnhancedVisionSearchResult = await response.json();
      console.log(`[VisionHook][${newPredictionId}] ✅ Recherche terminée`, {
        found: data.found,
        matches: data.matches?.length || 0,
        duration: data.searchMetadata?.durationMs
      });
      
      setResult(data);
      
      if (data.confidence) {
        setConfidence(data.confidence);
      }
      
      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[VisionHook][${newPredictionId}] ❌ Timeout après 120s`);
        throw new Error('Délai d\'attente dépassé (120s) — le pipeline de recherche est surchargé. Réessayez dans quelques secondes.');
      }
      throw err;
    }
  }, []);

  /**
   * 🔥 Fonction interne pour les appels API de Part Matching
   */
  const performPartMatchingSearch = useCallback(async (formData: FormData): Promise<EnhancedVisionSearchResult> => {
    const newPredictionId = `partmatch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setPredictionId(newPredictionId);
    setConfidence(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout (augmenté pour supporter le pipeline)

    try {
      console.log(`[VisionHook][${newPredictionId}] 🎯 Démarrage Part Matching...`);
      
      const response = await fetch('/api/innovations/part-matching/match-detail', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMsg = 'Erreur recherche de localisation';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) { }
        throw new Error(errorMsg);
      }

      const data = await response.json();

      console.log(`[VisionHook][${newPredictionId}] ✅ Part Matching terminé`, {
        found: data.found,
        similarity: data.similarity
      });

      // 🔥 CORRECTION: Améliorer la construction du résultat
      const enhancedResult: EnhancedVisionSearchResult = {
        found: data.found || false,
        matches: [],
        message: data.message || '',
        searchMetadata: {
          mode: 'part',
          durationMs: data.durationMs || 0,
          totalResults: data.found ? 1 : 0
        },
        partLocation: {
          found: data.found || false,
          globalImage: data.globalImage,
          matchedZone: data.matchedZone,
          similarity: data.similarity || 0,
          message: data.message
        }
      };

      // Ajouter le match si trouvé
      if (data.found && data.globalImage) {
        enhancedResult.matches = [{
          id: data.globalImage.id,
          similarity: data.similarity || 0,
          metadata: {
            filename: data.globalImage.filename || '',
            description: '',
            tags: [],
            folderId: '',
            date: new Date().toISOString()
          }
        }];
        enhancedResult.match = enhancedResult.matches[0];
      }

      setResult(enhancedResult);
      return enhancedResult;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[VisionHook][${newPredictionId}] ❌ Timeout Part Matching après 120s`);
        throw new Error('Délai d\'attente dépassé (120s) — recherche de localisation trop lente.');
      }
      throw err;
    }
  }, []);

  // ========================================================================
  // MÉTHODES DE RECHERCHE
  // ========================================================================

  /**
   * Recherche par image uniquement (compatible existant)
   */
  const searchImage = useCallback(async (file: File, threshold: number = 0.7) => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('threshold', threshold.toString());

      const data = await performSearch(formData);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [performSearch]);

  /**
   * Recherche par ID d'image existant
   */
  const searchByImageId = useCallback(async (imageId: string, threshold: number = 0.7) => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('imageId', imageId);
      formData.append('threshold', threshold.toString());

      const data = await performSearch(formData);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [performSearch]);

  /**
   * Recherche par texte uniquement
   */
  const searchByText = useCallback(async (query: string, options?: HybridSearchOptions) => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('textQuery', query);
      if (options?.threshold) formData.append('threshold', options.threshold.toString());
      if (options?.filterFolder) formData.append('filterFolder', options.filterFolder);
      if (options?.filterTags) formData.append('filterTags', JSON.stringify(options.filterTags));

      const data = await performSearch(formData);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [performSearch]);

  /**
   * Recherche hybride (image + texte)
   */
  const searchHybrid = useCallback(async (file: File, query: string, options?: HybridSearchOptions) => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('textQuery', query);
      if (options?.threshold) formData.append('threshold', options.threshold.toString());
      if (options?.filterFolder) formData.append('filterFolder', options.filterFolder);
      if (options?.filterTags) formData.append('filterTags', JSON.stringify(options.filterTags));
      if (options?.visionWeight) formData.append('visionWeight', options.visionWeight.toString());
      if (options?.textWeight) formData.append('textWeight', options.textWeight.toString());

      const data = await performSearch(formData);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [performSearch]);

  /**
   * 🔥 NOUVEAU: Recherche de localisation (Part Matching)
   */
  const searchPartLocation = useCallback(async (file: File, options?: {
    globalImageId?: string;
    threshold?: number;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);
      if (options?.globalImageId) formData.append('globalImageId', options.globalImageId);
      if (options?.threshold) formData.append('threshold', options.threshold.toString());

      const data = await performPartMatchingSearch(formData);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [performPartMatchingSearch]);

  /**
   * Recherche avancée avec tous les paramètres
   */
  const searchAdvanced = useCallback(async (params: {
    image?: File;
    textQuery?: string;
    threshold?: number;
    filterFolder?: string;
    filterTags?: string[];
    visionWeight?: number;
    textWeight?: number;
    mode?: 'vision' | 'text' | 'hybrid' | 'part';
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      // Si mode 'part', utiliser l'API Part Matching
      if (params.mode === 'part' && params.image) {
        const formData = new FormData();
        formData.append('image', params.image);
        if (params.threshold) formData.append('threshold', params.threshold.toString());

        const data = await performPartMatchingSearch(formData);
        return data;
      }

      // Sinon, utiliser l'API standard
      const formData = new FormData();
      if (params.image) formData.append('image', params.image);
      if (params.textQuery) formData.append('textQuery', params.textQuery);
      if (params.threshold) formData.append('threshold', params.threshold.toString());
      if (params.filterFolder) formData.append('filterFolder', params.filterFolder);
      if (params.filterTags) formData.append('filterTags', JSON.stringify(params.filterTags));
      if (params.visionWeight) formData.append('visionWeight', params.visionWeight.toString());
      if (params.textWeight) formData.append('textWeight', params.textWeight.toString());

      const data = await performSearch(formData);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [performSearch, performPartMatchingSearch]);

  // ========================================================================
  // MÉTHODES UTILITAIRES
  // ========================================================================

  /**
   * Enregistrement d'image
   */
  const registerImage = useCallback(async (file: File, metadata: any = {}) => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('metadata', JSON.stringify(metadata));

      if (metadata.folderId) formData.append('folderId', metadata.folderId);
      if (metadata.targetPath) formData.append('targetPath', metadata.targetPath);

      const response = await fetch('/api/vision/register', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur enregistrement');
      }

      const data: VisionRegisterResponse = await response.json();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Diagnostic d'image
   */
  const diagnoseImage = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/vision/diagnose', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur diagnostic');
      }

      const data = await response.json();

      setResult(prev => {
        if (!prev) {
          return {
            found: false,
            matches: [],
            diagnostic: data.diagnostic,
            confidence: undefined
          };
        }
        return {
          ...prev,
          diagnostic: data.diagnostic
        };
      });

      return data.diagnostic;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Suggestions automatiques
   */
  const getSuggestions = useCallback(async (file: File) => {
    const controller = new AbortController();
    // Passer une raison explicite à abort() pour éviter "signal is aborted without reason"
    const timeoutId = setTimeout(
      () => controller.abort(new Error('Timeout 60s: API suggestions trop lente (Ollama)')),
      60000 // Augmenté de 30s à 60s pour Ollama sur CPU
    );

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('filename', file.name);

      const response = await fetch('/api/vision/suggestions', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error('[VisionHook] Erreur API suggestions:', response.status);
        // Ne pas throw — retourner un résultat vide pour ne pas bloquer l'UX
        return {
          tags: [],
          description: '',
          equipmentType: 'inconnu',
          zone: 'non spécifiée',
          error: `API suggestions erreur ${response.status}`
        };
      }

      const data = await response.json();
      return {
        tags: data.tags || [],
        description: data.equipmentType ? `Équipement: ${data.equipmentType} - Zone: ${data.zone}` : '',
        equipmentType: data.equipmentType || 'inconnu',
        zone: data.zone || 'non spécifiée',
        suggestedFolder: data.suggestedFolder,
        suggestedFolderId: data.suggestedFolderId,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      const isAbort = error instanceof Error && error.name === 'AbortError';
      const isDOMAbort = error instanceof DOMException && error.name === 'AbortError';

      if (isAbort || isDOMAbort) {
        console.warn('[VisionHook] getSuggestions: timeout 60s dépassé — suggestions ignorées');
        return {
          tags: [],
          description: '',
          equipmentType: 'inconnu',
          zone: 'non spécifiée',
          error: 'Timeout 60s — suggestions non disponibles'
        };
      }

      console.error('[VisionHook] Erreur génération suggestions:', error);
      return {
        tags: [],
        description: '',
        equipmentType: 'inconnu',
        zone: 'non spécifiée',
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      };
    }
  }, []);

  /**
   * Réinitialisation
   */
  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setConfidence(null);
    setPredictionId(null);
  }, []);

  return {
    // Méthodes existantes (compatibilité ascendante)
    searchImage,
    searchByImageId,
    registerImage,
    diagnoseImage,
    getSuggestions,
    reset,

    // Nouvelles méthodes
    searchByText,
    searchHybrid,
    searchPartLocation,
    searchAdvanced,

    // États
    isLoading,
    error,
    result,
    confidence,
    predictionId,
    matches: result?.matches || [],
    match: result?.match || null,
  };
}