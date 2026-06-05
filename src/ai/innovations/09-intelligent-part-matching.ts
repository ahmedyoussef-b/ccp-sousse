/**
 * Innovation 9 : Intelligent Part Matching (Part-to-Whole)
 * 
 * Principe : Détecter si une photo recadrée (détail d'un organe) appartient 
 * à une image globale (vue d'ensemble d'un pupitre) avec localisation précise.
 * 
 * Fonctionnalités :
 * - Découpage automatique des images globales en patches
 * - Indexation des patches dans SQLite + ChromaDB
 * - Recherche de similarité avec localisation
 * - Auto-tagging par héritage et position
 * - Hiérarchisation des images parent-enfant
 * 
 * @module innovations/intelligent-part-matching
 * @version 1.1.0 - Avec préparations d'images
 */

import { getSQLiteCore } from '../core/sqlite/manager';
import { PatchSearchResult, VisionData, SpatialHierarchy } from '../core/sqlite/types';
import { RegisterGlobalParams, MatchDetailParams, PartLocationResult } from './types';
import sharp from 'sharp';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
  enabled: true,
  defaultGridRows: 4,
  defaultGridCols: 6,
  defaultOverlap: 0.5,
  defaultPatchSize: 100,
  minSimilarityThreshold: 0.7,
  autoIndexPatches: true,
  autoTaggingEnabled: true,
  maxPatchesPerGlobal: 500,
  ocrEnabled: false,
};

// ============================================================================
// TYPES POUR LES PRÉPARATIONS
// ============================================================================

interface ROI {
  type: 'alarm' | 'valve' | 'pump' | 'display' | 'text' | 'button';
  bbox: { x: number; y: number; width: number; height: number };
  importance: number;
  label?: string;
  confidence: number;
}

interface Anchor {
  id: string;
  type: 'qr' | 'logo' | 'shape';
  position: { x: number; y: number };
  size: { width: number; height: number };
  confidence: number;
}

interface SpatialRelation {
  from: string;
  to: string;
  direction: 'above' | 'below' | 'left' | 'right' | 'inside';
  distance: number;
}


// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

export class IntelligentPartMatching {
  private config = DEFAULT_CONFIG;
  private db = getSQLiteCore();
  private visionService: typeof import('@/lib/services/visionService').default | null = null;
  private stats = {
    globalImagesProcessed: 0,
    totalPatchesIndexed: 0,
    successfulMatches: 0,
    totalSearches: 0
  };

  constructor() {
    console.log('[PartMatching] ✅ Service initialisé (mode SQLite)');
    this.initVisionService();
    this.loadStats();
  }

  private async initVisionService(): Promise<void> {
    try {
      const { default: visionService } = await import('@/lib/services/visionService');
      this.visionService = visionService;
      console.log('[PartMatching] ✅ VisionService connecté');
    } catch (error) {
      console.error('[PartMatching] ❌ Erreur connexion VisionService:', error);
    }
  }

  private async loadStats(): Promise<void> {
    try {
      const stats = this.db.partMatching.getStats();
      this.stats.globalImagesProcessed = stats.globalImagesCount || 0;
      this.stats.totalPatchesIndexed = stats.totalPatchesCount || 0;
      this.stats.successfulMatches = stats.successfulMatches || 0;
      this.stats.totalSearches = stats.totalSearches || 0;
    } catch (error) {
      console.error('[PartMatching] Erreur chargement stats:', error);
    }
  }

  private calculateOptimalGrid(
    width: number,
    height: number,
    patchSize: number = DEFAULT_CONFIG.defaultPatchSize
  ): { rows: number; cols: number } {
    const cols = Math.max(2, Math.floor(width / patchSize));
    const rows = Math.max(2, Math.floor(height / patchSize));
    return { rows, cols };
  }

  private async extractPatchesWithSharp(
    imageBuffer: Buffer,
    rows: number,
    cols: number,
    overlap: number = DEFAULT_CONFIG.defaultOverlap
  ): Promise<Array<{
    buffer: Buffer;
    position: { x: number; y: number; width: number; height: number };
    gridPosition: { row: number; col: number };
  }>> {
    const patches: Array<{
      buffer: Buffer;
      position: { x: number; y: number; width: number; height: number };
      gridPosition: { row: number; col: number };
    }> = [];
    
    // Utiliser sharp pour obtenir les dimensions réelles
    const metadata = await sharp(imageBuffer).metadata();
    const imgWidth = metadata.width || 800;
    const imgHeight = metadata.height || 600;
    const patchWidth = Math.floor(imgWidth / cols);
    const patchHeight = Math.floor(imgHeight / rows);
    const stepX = Math.floor(patchWidth * (1 - overlap));
    const stepY = Math.floor(patchHeight * (1 - overlap));
    
    const numCols = Math.floor((imgWidth - patchWidth) / stepX) + 1;
    const numRows = Math.floor((imgHeight - patchHeight) / stepY) + 1;
    
    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        const x = col * stepX;
        const y = row * stepY;
        
        if (x + patchWidth <= imgWidth && y + patchHeight <= imgHeight) {
          // Extraire le patch avec sharp
          const patchBuffer = await sharp(imageBuffer)
            .extract({ left: x, top: y, width: patchWidth, height: patchHeight })
            .toBuffer();
          
          patches.push({
            buffer: patchBuffer,
            position: { x, y, width: patchWidth, height: patchHeight },
            gridPosition: { row, col }
          });
        }
      }
    }
    
    return patches;
  }

  private generateTags(
    position: { x: number; y: number; width: number; height: number },
    imageWidth: number,
    imageHeight: number,
    inheritedTags: string[] = []
  ): string[] {
    const tags = [...inheritedTags];
    
    const centerX = position.x + position.width / 2;
    if (centerX < imageWidth / 3) tags.push('gauche');
    else if (centerX > (imageWidth * 2) / 3) tags.push('droite');
    else tags.push('centre');
    
    const centerY = position.y + position.height / 2;
    if (centerY < imageHeight / 3) tags.push('haut');
    else if (centerY > (imageHeight * 2) / 3) tags.push('bas');
    else tags.push('milieu');
    
    if (position.width > imageWidth / 2) tags.push('large');
    if (position.height > imageHeight / 2) tags.push('grand');
    
    return [...new Set(tags)];
  }

  // ==========================================================================
  // MÉTHODE MATCH - IMPLÉMENTATION COMPLÈTE
  // ==========================================================================

  /**
   * Méthode principale pour faire correspondre une image partielle avec une image globale
   * Cette méthode est appelée par registerImage dans visionService.ts
   */
  async match(imageData: VisionData, query: string): Promise<PartLocationResult | null> {
    console.log(`[PartMatching] 🎯 Matching d'image: ${imageData.id}, query: ${query}`);
    
    try {
      // Récupérer le buffer de l'image partielle
      if (!this.visionService) {
        console.error('[PartMatching] ❌ VisionService non initialisé');
        return null;
      }
      const imageBuffer = await this.visionService.getImageBuffer(imageData.id);
      if (!imageBuffer) {
        console.error('[PartMatching] ❌ Impossible de récupérer le buffer de l\'image');
        return null;
      }
      
      // Analyser la requête pour déterminer s'il s'agit d'une demande de localisation
      const isLocationQuery = query.toLowerCase().includes('où') || 
                              query.toLowerCase().includes('localise') || 
                              query.toLowerCase().includes('position') ||
                              query.toLowerCase().includes('trouve');
      
      if (!isLocationQuery) {
        console.log('[PartMatching] ℹ️ Query non-localisation, pas de matching nécessaire');
        return null;
      }
      
      // Trouver la localisation de l'image partielle dans une image globale
      const locationResult = await this.findPartLocation({
        imageBuffer: imageBuffer,
        threshold: DEFAULT_CONFIG.minSimilarityThreshold,
        maxResults: 5
      });
      
      return locationResult;
      
    } catch (error) {
      console.error('[PartMatching] ❌ Erreur dans match:', error);
      return null;
    }
  }

  // ==========================================================================
  // MÉTHODES DE PRÉPARATION D'IMAGES
  // ==========================================================================

  /**
   * Détecte les régions d'intérêt (ROI) dans une image globale
   */
  async detectROIs(imageBuffer: Buffer, globalImageId: string): Promise<ROI[]> {
    const rois: ROI[] = [];
    
    // 1. Détection par couleurs (rouge = alarme)
    // Simulation - à remplacer par une vraie détection
    const redZones = await this.detectRedZones(imageBuffer);
    for (const zone of redZones) {
      rois.push({
        type: 'alarm',
        bbox: zone,
        importance: 1.0,
        confidence: 0.85
      });
    }
    
    // 2. Détection par OCR (textes)
    if (this.config.ocrEnabled) {
      const textZones = await this.detectTextZones(imageBuffer);
      for (const zone of textZones) {
        rois.push({
          type: 'text',
          bbox: zone.bbox,
          importance: 0.7,
          label: zone.text,
          confidence: zone.confidence
        });
      }
    }
    
    // Sauvegarder les ROI dans SQLite
    const existingPrep = this.db.visionPrep.getPreparation(globalImageId);
    const p0Data = {
      status: (existingPrep?.status || 'processing') as 'pending' | 'processing' | 'completed' | 'failed',
      anchors: (existingPrep?.anchors || []),
      spatialHierarchy: (existingPrep?.spatialHierarchy || { components: [], relations: [], metadata: { analyzedAt: '', strategy: '' } }),
      pyramid: (existingPrep?.pyramid || []),
      rois: rois as unknown as Record<string, unknown>[],
      imageId: globalImageId,
      preparationDate: existingPrep?.preparationDate || new Date().toISOString()
    };
    
    this.db.visionPrep.savePreparation(globalImageId, p0Data as unknown as import('../core/sqlite/types').ImagePreparation);
    
    return rois;
  }

  private async detectRedZones(imageBuffer: Buffer): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
    try {
      const { data } = await sharp(imageBuffer).resize(200, 150).raw().toBuffer({ resolveWithObject: true });
      const zones: Array<{ x: number; y: number; width: number; height: number }> = [];
      
      // Analyse simplifiée : détection de clusters de pixels rouges
      // R > 180, G < 80, B < 80
      for (let i = 0; i < data.length; i += 3) {
        if (data[i] > 180 && data[i+1] < 80 && data[i+2] < 80) {
          const pixelIdx = i / 3;
          const py = Math.floor(pixelIdx / 200);
          const px = pixelIdx % 200;
          
          // Mapper vers dimensions réelles (approximation)
          zones.push({
            x: (px / 200) * 100,
            y: (py / 150) * 100,
            width: 5,
            height: 5
          });
          if (zones.length > 5) break; // Limiter pour performance
        }
      }
      return zones;
    } catch (e) {
      return [];
    }
  }

  private async detectTextZones(_imageBuffer: Buffer): Promise<Array<{ bbox: { x: number; y: number; width: number; height: number; }; text: string; confidence: number }>> {
    // Dans cette version, on s'appuie sur les tags existants pour simuler la localisation
    return [];
  }

  /**
   * Détecte les points d'ancrage (QR codes, logos)
   */
  async detectAnchors(imageBuffer: Buffer, globalImageId: string): Promise<Anchor[]> {
    const anchors: Anchor[] = [];
    
    // Détection de QR codes (simulée par analyse de contraste aux coins)
    const qrCodes = await this.detectQRCodes(imageBuffer);
    for (const qr of qrCodes) {
      anchors.push({
        id: `qr_${Date.now()}_${anchors.length}`,
        type: 'qr',
        position: { x: qr.x, y: qr.y },
        size: { width: qr.width, height: qr.height },
        confidence: qr.confidence
      });
    }
    
    // Détection de logos
    const logos = await this.detectLogos(imageBuffer);
    for (const logo of logos) {
      anchors.push({
        id: `logo_${Date.now()}_${anchors.length}`,
        type: 'logo',
        position: { x: logo.x, y: logo.y },
        size: { width: logo.width, height: logo.height },
        confidence: logo.confidence
      });
    }
    
    if (anchors.length > 0) {
      const existingPrep = this.db.visionPrep.getPreparation(globalImageId);
      const p0Data = {
        status: (existingPrep?.status || 'processing') as 'pending' | 'processing' | 'completed' | 'failed',
        anchors: anchors as unknown as Record<string, unknown>[],
        spatialHierarchy: (existingPrep?.spatialHierarchy || { components: [], relations: [], metadata: { analyzedAt: '', strategy: '' } }),
        pyramid: (existingPrep?.pyramid || []),
        rois: (existingPrep?.rois || []),
        imageId: globalImageId,
        preparationDate: existingPrep?.preparationDate || new Date().toISOString()
      };
      
      this.db.visionPrep.savePreparation(globalImageId, p0Data as unknown as import('../core/sqlite/types').ImagePreparation);
    }
    
    return anchors;
  }

  private async detectQRCodes(_imageBuffer: Buffer): Promise<Array<{ x: number; y: number; width: number; height: number; confidence: number }>> {
    // Si sharp est là, on peut chercher des zones de haute fréquence (coins)
    return [];
  }

  private async detectLogos(_imageBuffer: Buffer): Promise<Array<{ x: number; y: number; width: number; height: number; confidence: number }>> {
    return [];
  }

  /**
   * Construit la hiérarchie spatiale des composants
   */
  async buildSpatialHierarchy(imageBuffer: Buffer, globalImageId: string): Promise<SpatialHierarchy> {
    const rois = await this.detectROIs(imageBuffer, globalImageId);
    const relations: SpatialRelation[] = [];
    
    // Calculer les relations spatiales entre ROI
    for (let i = 0; i < rois.length; i++) {
      for (let j = i + 1; j < rois.length; j++) {
        const relation = this.calculateSpatialRelation(rois[i].bbox, rois[j].bbox);
        if (relation) {
          relations.push({
            from: `${rois[i].type}_${i}`,
            to: `${rois[j].type}_${j}`,
            direction: relation.direction,
            distance: relation.distance
          });
        }
      }
    }
    
    const hierarchy: SpatialHierarchy = {
      components: rois.map((roi, idx) => ({
        id: `${roi.type}_${idx}`,
        type: roi.type,
        bbox: roi.bbox
      })) as unknown as Record<string, unknown>[],
      relations: relations as unknown as Record<string, unknown>[],
      metadata: {
        analyzedAt: new Date().toISOString(),
        strategy: 'roi-based'
      }
    };
    
    const existingPrep = this.db.visionPrep.getPreparation(globalImageId);
    const p0Data = {
      status: (existingPrep?.status || 'processing') as 'pending' | 'processing' | 'completed' | 'failed',
      anchors: (existingPrep?.anchors || []),
      spatialHierarchy: hierarchy,
      pyramid: (existingPrep?.pyramid || []),
      rois: (existingPrep?.rois || []),
      imageId: globalImageId,
      preparationDate: existingPrep?.preparationDate || new Date().toISOString()
    };
    
    this.db.visionPrep.savePreparation(globalImageId, p0Data as unknown as import('../core/sqlite/types').ImagePreparation);
    
    return hierarchy;
  }

  private calculateSpatialRelation(
    bbox1: { x: number; y: number; width: number; height: number },
    bbox2: { x: number; y: number; width: number; height: number }
  ): { direction: 'above' | 'below' | 'left' | 'right' | 'inside'; distance: number } | null {
    const center1 = { x: bbox1.x + bbox1.width / 2, y: bbox1.y + bbox1.height / 2 };
    const center2 = { x: bbox2.x + bbox2.width / 2, y: bbox2.y + bbox2.height / 2 };
    
    const dx = center2.x - center1.x;
    const dy = center2.y - center1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (Math.abs(dx) > Math.abs(dy)) {
      return { direction: dx > 0 ? 'right' : 'left', distance };
    } else {
      return { direction: dy > 0 ? 'below' : 'above', distance };
    }
  }

  /**
   * Génère une pyramide multi-résolution
   */
  async generatePyramid(imageBuffer: Buffer, globalImageId: string): Promise<Buffer[]> {
    const pyramid: Buffer[] = [];
    const scales = [0.25, 0.5, 1, 2];
    
    for (const scale of scales) {
      if (scale === 1) {
        pyramid.push(imageBuffer);
      } else {
        const resized = await sharp(imageBuffer)
          .resize(Math.floor(800 * scale), Math.floor(600 * scale))
          .toBuffer();
        pyramid.push(resized);
      }
    }
    
    // Cette variable est utilisée pour construire pyramidLevels mais non utilisée ensuite
    const pyramidLevels = pyramid.map((_, idx) => ({ scale: scales[idx], size: pyramid[idx].length }));
    // Utiliser pyramidLevels pour éviter l'avertissement TypeScript
    console.log(`[PartMatching] Pyramide générée: ${pyramidLevels.length} niveaux`);
    
    const existingPrep = this.db.visionPrep.getPreparation(globalImageId);
    const p0Data = {
      status: (existingPrep?.status || 'processing') as 'pending' | 'processing' | 'completed' | 'failed',
      anchors: (existingPrep?.anchors || []),
      spatialHierarchy: (existingPrep?.spatialHierarchy || { components: [], relations: [], metadata: { analyzedAt: '', strategy: '' } }),
      pyramid: pyramidLevels as unknown as Record<string, unknown>[],
      rois: (existingPrep?.rois || []),
      imageId: globalImageId,
      preparationDate: existingPrep?.preparationDate || new Date().toISOString()
    };
    
    this.db.visionPrep.savePreparation(globalImageId, p0Data as unknown as import('../core/sqlite/types').ImagePreparation);
    
    return pyramid;
  }

  /**
   * Prépare complètement une image globale
   */
  async prepareGlobalImage(
    globalImageId: string,
    imageBuffer: Buffer,
    options?: {
      detectROI?: boolean;
      detectAnchors?: boolean;
      buildHierarchy?: boolean;
      generatePyramid?: boolean;
    }
  ): Promise<{ success: boolean; message: string; rois?: ROI[]; anchors?: Anchor[]; hierarchy?: SpatialHierarchy }> {
    const startTime = Date.now();
    
    try {
      this.db.visionPrep.savePreparationLog({
        image_id: globalImageId,
        operation: 'PREPARE_GLOBAL_IMAGE',
        status: 'processing',
        details: 'Début de la préparation',
        duration_ms: 0,
        created_at: Date.now()
      });
      
      let rois: ROI[] = [];
      let anchors: Anchor[] = [];
      let hierarchy: SpatialHierarchy | undefined;
      
      if (options?.detectROI !== false) {
        rois = await this.detectROIs(imageBuffer, globalImageId);
        this.db.visionPrep.savePreparationLog({
          image_id: globalImageId,
          operation: 'DETECT_ROI',
          status: 'success',
          details: `${rois.length} régions détectées`,
          duration_ms: Date.now() - startTime,
          created_at: Date.now()
        });
      }
      
      if (options?.detectAnchors !== false) {
        anchors = await this.detectAnchors(imageBuffer, globalImageId);
        this.db.visionPrep.savePreparationLog({
          image_id: globalImageId,
          operation: 'DETECT_ANCHORS',
          status: 'success',
          details: `${anchors.length} ancres détectées`,
          duration_ms: Date.now() - startTime,
          created_at: Date.now()
        });
      }
      
      if (options?.buildHierarchy !== false) {
        hierarchy = await this.buildSpatialHierarchy(imageBuffer, globalImageId);
        this.db.visionPrep.savePreparationLog({
          image_id: globalImageId,
          operation: 'BUILD_HIERARCHY',
          status: 'success',
          details: `${hierarchy.components.length} composants, ${hierarchy.relations.length} relations`,
          duration_ms: Date.now() - startTime,
          created_at: Date.now()
        });
      }
      
      if (options?.generatePyramid !== false) {
        await this.generatePyramid(imageBuffer, globalImageId);
        this.db.visionPrep.savePreparationLog({
          image_id: globalImageId,
          operation: 'GENERATE_PYRAMID',
          status: 'success',
          duration_ms: Date.now() - startTime,
          created_at: Date.now()
        });
      }
      
      this.db.visionPrep.updatePreparationStatus(globalImageId, 'completed');
      
      this.db.visionPrep.savePreparationLog({
        image_id: globalImageId,
        operation: 'PREPARE_GLOBAL_IMAGE',
        status: 'success',
        details: 'Préparation terminée avec succès',
        duration_ms: Date.now() - startTime,
        created_at: Date.now()
      });
      
      return {
        success: true,
        message: `Image globale préparée en ${Date.now() - startTime}ms`,
        rois,
        anchors,
        hierarchy
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.db.visionPrep.savePreparationLog({
        image_id: globalImageId,
        operation: 'PREPARE_GLOBAL_IMAGE',
        status: 'failed',
        details: errorMessage,
        duration_ms: Date.now() - startTime,
        created_at: 0
      });
      
      this.db.visionPrep.updatePreparationStatus(globalImageId, 'failed');
      
      return {
        success: false,
        message: errorMessage
      };
    }
  }

  /**
   * Récupère les préparations d'une image
   */
  async getImagePreparations(imageId: string): Promise<import('../core/sqlite/types').ImagePreparation | null> {
    return this.db.visionPrep.getPreparation(imageId);
  }

  // ==========================================================================
  // MÉTHODES EXISTANTES
  // ==========================================================================

  async registerGlobalImage(
    params: RegisterGlobalParams
  ): Promise<{ success: boolean; globalImageId: string; patchesCount: number }> {
    console.log('[PartMatching] 📸 Enregistrement image globale (sans découpage automatique)...');
    
    try {
      let globalImageId = params.imageId;
      
      if (!globalImageId) {
        if (!this.visionService) {
           throw new Error('VisionService non initialisé');
        }
        globalImageId = crypto.randomUUID();
        console.log('[PartMatching] 📝 Image non enregistrée, appel à VisionService...');
        await this.visionService.registerImage(
          { buffer: params.imageBuffer, name: params.filename },
          {
            id: globalImageId,
            filename: params.filename,
            image_type: 'global',
            imageType: 'global',
            description: params.metadata?.description || '',
            tags: params.metadata?.tags || ['global', 'pupitre'],
            equipmentState: (params.metadata?.equipmentType as any) || 'normal',
            location: params.metadata?.zone || 'inconnue',
            folderId: `data/banque_images_ia/pupitre/${globalImageId}`,
            folder_id: `data/banque_images_ia/pupitre/${globalImageId}`,
            targetPath: `data/banque_images_ia/pupitre/${globalImageId}`
          }
        );
      }
      
      if (!globalImageId) {
        throw new Error('Impossible d\'obtenir un imageId pour l\'image globale');
      }
      
      const globalRecordId = `global_${globalImageId}`;
      this.db.partMatching.saveGlobalImage({
        id: globalRecordId,
        imageId: globalImageId,
        gridRows: 0,
        gridCols: 0,
        overlap: 0,
        patchSize: 0,
        totalParts: 0,
        processedAt: Date.now(),
        metadata: params.metadata || {}
      });
      
      this.db.partMatching.updateStats({
        globalImagesCount: this.stats.globalImagesProcessed + 1,
        totalPatchesCount: this.stats.totalPatchesIndexed,
        successfulMatches: this.stats.successfulMatches,
        totalSearches: this.stats.totalSearches,
        lastUpdated: Date.now()
      });
      
      this.stats.globalImagesProcessed++;
      
      console.log(`[PartMatching] ✅ Image globale enregistrée avec succès : ${globalImageId} (prête pour liaisons manuelles)`);
      
      return {
        success: true,
        globalImageId,
        patchesCount: 0
      };
      
    } catch (error) {
      console.error('[PartMatching] ❌ Erreur enregistrement image globale:', error);
      return { success: false, globalImageId: '', patchesCount: 0 };
    }
  }

  async findPartLocation(params: MatchDetailParams): Promise<PartLocationResult> {
    console.log('[PartMatching] 🔍 Recherche de localisation (Via ChromaDB)...');
    this.stats.totalSearches++;
    
    try {
      if (!this.visionService) {
        throw new Error('VisionService non initialisé');
      }
      const queryFeatures = await this.visionService.extractFeatures(params.imageBuffer);
      
      let similarPatches: PatchSearchResult[] = [];
      try {
        const { chromaDBManager } = await import('../vector/chromadb-manager');
        const chromaResults = await chromaDBManager.searchSimilar(
          'VISION', 
          queryFeatures, 
          params.maxResults || 5, 
          params.threshold || DEFAULT_CONFIG.minSimilarityThreshold
        );
        
        similarPatches = chromaResults
          .map(r => ({
            id: r.id,
            globalImageId: String(r.metadata.globalImageId),
            position: {
              x: Number(r.metadata.position_x),
              y: Number(r.metadata.position_y),
              width: Number(r.metadata.width),
              height: Number(r.metadata.height)
            },
            gridPosition: {
              row: Number(r.metadata.grid_row),
              col: Number(r.metadata.grid_col)
            },
            features: [],
            tags: [],
            confidence: 1,
            similarity: r.score
          } as PatchSearchResult));
          
        console.log(`[PartMatching] 📊 ChromaDB a retourné ${similarPatches.length} patch(s) similaire(s)`);
      } catch (chromaError) {
        console.error('[PartMatching] ⚠️ Erreur lors de la recherche ChromaDB, fallback sur SQLite:', chromaError);
        // Fallback SQLite is deprecated for patches, returning empty
        similarPatches = [];
      }
      
      if (params.globalImageId) {
        const globalRecord = this.db.partMatching.getGlobalImage(params.globalImageId);
        if (globalRecord) {
          similarPatches = similarPatches.filter(p => p.globalImageId === globalRecord.id);
        }
      }
      
      if (similarPatches.length === 0) {
        this.db.partMatching.incrementSearchCount(false);
        return {
          found: false,
          similarity: 0,
          message: 'Aucune correspondance trouvée'
        };
      }
      
      const bestMatch = similarPatches[0];
      const threshold = params.threshold || DEFAULT_CONFIG.minSimilarityThreshold;
      
      if (bestMatch.similarity < threshold) {
        this.db.partMatching.incrementSearchCount(false);
        return {
          found: false,
          similarity: bestMatch.similarity,
          message: `Similarité trop faible (${Math.round(bestMatch.similarity * 100)}% < ${Math.round(threshold * 100)}%)`
        };
      }
      
      const globalRecord = this.db.partMatching.getGlobalImage(bestMatch.globalImageId);
      if (!globalRecord) {
        console.error('[PartMatching] Image globale non trouvée:', bestMatch.globalImageId);
        return {
          found: false,
          similarity: bestMatch.similarity,
          message: 'Image globale associée non trouvée'
        };
      }

      const globalImageData = await this.visionService.getImageData(globalRecord.imageId);
      
      this.db.partMatching.saveHierarchy({
        childId: `temp_${Date.now()}`,
        parentId: globalRecord.imageId,
        relationshipType: 'part_of',
        matchedZone: {
          x: bestMatch.position.x,
          y: bestMatch.position.y,
          width: bestMatch.position.width,
          height: bestMatch.position.height
        },
        confidence: bestMatch.similarity,
        createdAt: Date.now()
      });
      
      this.stats.successfulMatches++;
      this.db.partMatching.incrementSearchCount(true);
      
      // Récupérer les dimensions réelles de l'image pour le calcul des pourcentages
      const imgBuffer = await this.visionService.getImageBuffer(globalRecord.imageId);
      let imgWidth = 800, imgHeight = 600;
      if (imgBuffer) {
        const metadata = await sharp(imgBuffer).metadata();
        imgWidth = metadata.width || 800;
        imgHeight = metadata.height || 600;
      }
      
      console.log(`[PartMatching] ✅ Localisation trouvée: similarité ${Math.round(bestMatch.similarity * 100)}%`);
      
      return {
        found: true,
        globalImage: {
          id: globalRecord.imageId,
          url: `/api/vision/images/${globalRecord.imageId}`,
          filename: globalImageData?.filename || '',
          metadata: {
            type: 'global',
            grid: {
              rows: globalRecord.gridRows,
              cols: globalRecord.gridCols,
              patchSize: globalRecord.patchSize,
              overlap: globalRecord.overlap || 0.5
            },
            parts: [],
            hierarchy: { parentId: undefined, childrenIds: [] },
            ocrData: []
          }
        },
        matchedZone: {
          x: (bestMatch.position.x / imgWidth) * 100,
          y: (bestMatch.position.y / imgHeight) * 100,
          width: (bestMatch.position.width / imgWidth) * 100,
          height: (bestMatch.position.height / imgHeight) * 100,
          confidence: bestMatch.similarity
        },
        similarity: bestMatch.similarity,
        message: `Image localisée avec ${Math.round(bestMatch.similarity * 100)}% de confiance`
      };
      
    } catch (error) {
      console.error('[PartMatching] ❌ Erreur recherche localisation:', error);
      this.db.partMatching.incrementSearchCount(false);
      return {
        found: false,
        similarity: 0,
        message: error instanceof Error ? error.message : 'Erreur lors de la recherche'
      };
    }
  }

  async listGlobalImages(): Promise<any[]> {
    return this.db.partMatching.listGlobalImages();
  }

  async getStats(): Promise<{
    globalImagesProcessed: number;
    totalPatchesIndexed: number;
    successfulMatches: number;
    totalSearches: number;
    matchRate: number;
  }> {
    const matchRate = this.stats.totalSearches > 0
      ? this.stats.successfulMatches / this.stats.totalSearches
      : 0;
    
    return {
      globalImagesProcessed: this.stats.globalImagesProcessed,
      totalPatchesIndexed: this.stats.totalPatchesIndexed,
      successfulMatches: this.stats.successfulMatches,
      totalSearches: this.stats.totalSearches,
      matchRate
    };
  }

  updateConfig(updates: Partial<typeof DEFAULT_CONFIG>): void {
    this.config = { ...this.config, ...updates };
    console.log('[PartMatching] Configuration mise à jour');
  }

  async refreshStats(): Promise<void> {
    await this.loadStats();
  }
}

// Export singleton
export const intelligentPartMatching = new IntelligentPartMatching();