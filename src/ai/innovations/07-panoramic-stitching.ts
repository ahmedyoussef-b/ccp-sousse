/**
 * Innovation 7 : Vision Panoramique pour Inspection Longue Distance
 * 
 * Principe : Assembler plusieurs images en une vue panoramique pour
 * analyser de grands équipements (tuyauteries, turbines) d'un seul coup.
 * 
 * VERSION MIGRÉE : Métriques SQLite et cache des résultats
 * 
 * @module innovations/panoramic-stitching
 * @version 3.0.0 - SQLite Metrics
 */

import { PanoramaResult, StitchingConfig, PanoramaMode, BlendingStrategy, WarpMode } from './types';
import { getSQLiteCore } from '../core/sqlite/manager';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: StitchingConfig & { enabled: boolean; maxImages: number; cacheResults: boolean } = {
  enabled: true,
  mode: 'auto',
  blending: 'multi-band',
  matchConfidence: 0.6,
  blendStrength: 0.5,
  warpMode: 'cylindrical',
  maxImages: 10,
  cacheResults: true,
  sift: {
    nFeatures: 2000,
    contrastThreshold: 0.04,
  },
  flann: {
    trees: 5,
    checks: 50,
  },
  ransac: {
    threshold: 3.0,
    maxIter: 2000,
  },
};

// Interface pour le cache
interface CachedPanorama {
  hash: string;
  result: PanoramaResult;
  timestamp: number;
}

// ============================================================================
// CLASSE PRINCIPALE (Proxy Client avec métriques)
// ============================================================================

export class PanoramicStitching {
  private static instance: PanoramicStitching;
  private config = DEFAULT_CONFIG;
  private db = getSQLiteCore();
  private cache: Map<string, CachedPanorama> = new Map(); // Cache mémoire L1

  public static getInstance(): PanoramicStitching {
    if (!PanoramicStitching.instance) {
      PanoramicStitching.instance = new PanoramicStitching();
    }
    return PanoramicStitching.instance;
  }

  constructor() {
    console.log('[Panoramic] ✅ Service initialisé (mode SQLite metrics)');
  }

  /**
   * Génère un hash pour un ensemble d'images
   */
  private async generateBatchHash(imageBuffers: Buffer[]): Promise<string> {
    const sizes = imageBuffers.map(b => b.length).join(',');
    const firstBytes = imageBuffers[0]?.slice(0, 100).toString('hex') || '';
    return `${sizes}_${firstBytes}`;
  }

  /**
   * Convertit un Buffer en Blob
   */
  private bufferToBlob(buffer: Buffer): Blob {
    // @ts-ignore
    return new Blob([buffer], { type: 'image/jpeg' });
  }

  /**
   * Assemble une séquence d'images en panorama via l'API
   */
  async stitchPanorama(
    imageBuffers: Buffer[],
    options?: { 
      quality?: number; 
      analyze?: boolean; 
      forceRefresh?: boolean;
      mode?: PanoramaMode;
      blending?: BlendingStrategy;
      warpMode?: WarpMode;
    }
  ): Promise<PanoramaResult> {
    const startTime = Date.now();
    
    if (imageBuffers.length < 2) {
      return {
        success: false,
        stitchedCount: 0,
        quality: 0,
        message: 'Au moins 2 images sont nécessaires',
      };
    }

    if (imageBuffers.length > this.config.maxImages) {
      return {
        success: false,
        stitchedCount: 0,
        quality: 0,
        message: `Maximum ${this.config.maxImages} images autorisées`,
      };
    }

    // Vérifier le cache
    const batchHash = await this.generateBatchHash(imageBuffers);
    if (this.config.cacheResults && !options?.forceRefresh && this.cache.has(batchHash)) {
      const cached = this.cache.get(batchHash)!;
      console.log('[Panoramic] 📦 Résultat trouvé en cache');
      return cached.result;
    }

    console.log(`[Panoramic] 🔄 Assemblage de ${imageBuffers.length} images via API...`);

    try {
      const formData = new FormData();
      
      for (let i = 0; i < imageBuffers.length; i++) {
        const blob = this.bufferToBlob(imageBuffers[i]);
        formData.append(`image${i}`, blob);
      }
      
      formData.append('count', imageBuffers.length.toString());
      formData.append('mode', options?.mode || this.config.mode);
      formData.append('blending', options?.blending || this.config.blending);
      formData.append('warpMode', options?.warpMode || this.config.warpMode);
      
      // Paramètres techniques IA
      formData.append('sift_nFeatures', String(this.config.sift?.nFeatures ?? 2000));
      formData.append('sift_contrastThreshold', String(this.config.sift?.contrastThreshold ?? 0.04));
      formData.append('ransac_threshold', String(this.config.ransac?.threshold ?? 3.0));
      
      if (options?.quality) formData.append('quality', options.quality.toString());
      if (options?.analyze) formData.append('analyze', 'true');

      const response = await fetch('/api/vision/panorama', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erreur assemblage panorama');
      }

      const data = await response.json();
      
      const result: PanoramaResult = {
        success: true,
        stitchedCount: data.stitchedCount,
        quality: data.quality || 0.8,
        message: data.message || 'Panorama assemblé avec succès',
        metadata: data.metadata || {
          mode: options?.mode || this.config.mode,
          blending: options?.blending || this.config.blending,
          durationMs: Date.now() - startTime
        }
      };
      
      // Mettre en cache
      if (this.config.cacheResults) {
        this.cache.set(batchHash, {
          hash: batchHash,
          result,
          timestamp: Date.now()
        });
        
        // Limiter la taille du cache mémoire
        if (this.cache.size > 50) {
          const oldestKey = this.cache.keys().next().value;
          if (oldestKey) this.cache.delete(oldestKey);
        }
      }
      
      // Enregistrer les métriques
      const duration = Date.now() - startTime;
      await this.db.orchestration.stats.record('panoramic', 'stitch_count', 1);
      await this.db.orchestration.stats.record('panoramic', 'images_stitched', data.stitchedCount);
      await this.db.orchestration.stats.record('panoramic', 'stitch_quality', data.quality || 0.8);
      await this.db.orchestration.stats.record('panoramic', 'stitch_duration_ms', duration);
      
      console.log(`[Panoramic] ✅ Panorama créé : ${data.stitchedCount}/${imageBuffers.length} images (${duration}ms)`);
      
      return result;
      
    } catch (error) {
      console.error('[Panoramic] Erreur assemblage:', error);
      
      // Enregistrer l'erreur
      await this.db.orchestration.stats.record('panoramic', 'stitch_error', 1);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        stitchedCount: 0,
        quality: 0,
        message: `Erreur: ${errorMessage}`,
      };
    }
  }

  /**
   * Analyse un panorama avec l'IA via l'API
   */
  async analyzePanorama(panoramaBuffer: Buffer): Promise<string> {
    const startTime = Date.now();
    
    try {
      const formData = new FormData();
      const blob = this.bufferToBlob(panoramaBuffer);
      formData.append('image', blob);
      formData.append('mode', 'panorama-analysis');

      const response = await fetch('/api/vision/diagnose', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Erreur analyse panorama');
      }

      const data = await response.json();
      const analysis = data.diagnostic || 'Analyse non disponible';
      
      // Enregistrer les métriques
      const duration = Date.now() - startTime;
      await this.db.orchestration.stats.record('panoramic', 'analysis_count', 1);
      await this.db.orchestration.stats.record('panoramic', 'analysis_duration_ms', duration);
      
      return analysis;
      
    } catch (error) {
      console.error('[Panoramic] Erreur analyse:', error);
      await this.db.orchestration.stats.record('panoramic', 'analysis_error', 1);
      return 'Erreur lors de l\'analyse du panorama';
    }
  }

  /**
   * Vérifie si deux images peuvent être assemblées via l'API
   */
  async canStitch(image1: Buffer, image2: Buffer): Promise<{
    possible: boolean;
    confidence: number;
    matches: number;
  }> {
    try {
      const formData = new FormData();
      formData.append('image1', this.bufferToBlob(image1));
      formData.append('image2', this.bufferToBlob(image2));

      const response = await fetch('/api/vision/panorama/check', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        return { possible: false, confidence: 0, matches: 0 };
      }

      const data = await response.json();
      
      // Enregistrer la vérification
      if (data.possible) {
        await this.db.orchestration.stats.record('panoramic', 'stitch_possible', 1);
        await this.db.orchestration.stats.record('panoramic', 'stitch_confidence', data.confidence || 0);
      }
      
      return {
        possible: data.possible || false,
        confidence: data.confidence || 0,
        matches: data.matches || 0,
      };
      
    } catch (error) {
      console.error('[Panoramic] Erreur vérification:', error);
      return { possible: false, confidence: 0, matches: 0 };
    }
  }

  /**
   * Vide le cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[Panoramic] Cache vidé');
  }

  /**
   * Vérifie si OpenCV est disponible (toujours false côté client)
   */
  isOpenCvAvailable(): boolean {
    return false;
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(updates: Partial<typeof DEFAULT_CONFIG>): void {
    this.config = { ...this.config, ...updates };
    console.log('[Panoramic] Configuration mise à jour');
  }

  /**
   * Obtient des statistiques (avec accès SQLite)
   */
  async getStats(): Promise<{ 
    config: typeof DEFAULT_CONFIG; 
    opencvAvailable: boolean;
    cacheSize: number;
    totalStitches: number;
    avgQuality: number;
    successRate: number;
  }> {
    // Récupérer les métriques depuis SQLite
    const stitchCount = this.db.orchestration.stats.getAggregated('panoramic', 'stitch_count');
    const stitchErrors = this.db.orchestration.stats.getAggregated('panoramic', 'stitch_error');
    const avgQualityMetric = this.db.orchestration.stats.getAggregated('panoramic', 'stitch_quality');
    
    const totalStitches = stitchCount.count;
    const errors = stitchErrors.count;
    const successRate = totalStitches > 0 ? (totalStitches - errors) / totalStitches : 0;
    
    return {
      config: this.config,
      opencvAvailable: false,
      cacheSize: this.cache.size,
      totalStitches,
      avgQuality: avgQualityMetric.avg || 0,
      successRate
    };
  }

  /**
   * Obtient les métriques détaillées
   */
  async getDetailedMetrics(): Promise<{
    avgDurationMs: number;
    avgQuality: number;
    totalAnalyses: number;
    avgAnalysisDurationMs: number;
  }> {
    const durationMetric = this.db.orchestration.stats.getAggregated('panoramic', 'stitch_duration_ms');
    const qualityMetric = this.db.orchestration.stats.getAggregated('panoramic', 'stitch_quality');
    const analysisCount = this.db.orchestration.stats.getAggregated('panoramic', 'analysis_count');
    const analysisDuration = this.db.orchestration.stats.getAggregated('panoramic', 'analysis_duration_ms');
    
    return {
      avgDurationMs: durationMetric.avg || 0,
      avgQuality: qualityMetric.avg || 0,
      totalAnalyses: analysisCount.count || 0,
      avgAnalysisDurationMs: analysisDuration.avg || 0
    };
  }
}

// Export singleton
export const panoramicStitching = new PanoramicStitching();