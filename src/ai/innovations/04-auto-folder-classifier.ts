/**
 * Innovation 4 : Classification et Tri d'Images par Dossiers Virtuels Automatisés
 * 
 * Principe : L'IA analyse le contenu de l'image et détermine automatiquement
 * dans quel dossier la classer, sans intervention manuelle de l'utilisateur.
 * 
 * VERSION MIGRÉE : Cache SQLite via Core SQLite
 * 
 * @module innovations/auto-folder-classifier
 * @version 3.0.0 - SQLite Cache
 */

import { AutoFolderClassification } from './types';
import { getSQLiteCore } from '../core/sqlite/manager';
import { smartRouter } from '../router/smart-router';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
  enabled: true,
  autoTag: true,
  minConfidence: 0.6,
  cacheTTLSeconds: 86400, // 24 heures
  maxCacheEntries: 1000,
};

// ============================================================================
// TYPES INTERNES
// ============================================================================

interface CacheEntry {
  imageHash: string;
  classification: AutoFolderClassification;
  timestamp: string;
}

// Définition du type VisionData pour résoudre l'erreur "Cannot find name 'VisionData'"
interface VisionData {
  id: string;
  filename: string;
  description?: string;
  invocationKeywords?: string;
  imageType?: 'global' | 'part';
  metadata?: Record<string, any>;
}

// ============================================================================
// CLASSE PRINCIPALE (MIGRÉE SQLite)
// ============================================================================

export class AutoFolderClassifier {
  private config = DEFAULT_CONFIG;
  private db = getSQLiteCore();
  private memoryCache: Map<string, CacheEntry> = new Map(); // Cache L1 mémoire
  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    classifications: 0
  };

  constructor() {
    console.log('[AutoFolder] ✅ Service initialisé (mode SQLite)');
    this.loadStatsFromSQLite();
  }

  /**
   * Charge les statistiques depuis SQLite
   */
  private async loadStatsFromSQLite(): Promise<void> {
    try {
      const metrics = this.db.getMetricStats('auto_folder', 'classification');
      this.stats.classifications = metrics.count;
    } catch (error) {
      console.error('[AutoFolder] Erreur chargement stats:', error);
    }
  }

  /**
   * Sauvegarde une classification dans le cache SQLite
   */
  private async saveToCache(imageHash: string, classification: AutoFolderClassification): Promise<void> {
    try {
      this.db.set(`auto_folder_cache`, imageHash, classification, this.config.cacheTTLSeconds);
      
      await this.db.recordMetric('auto_folder', 'classification', 1);
      await this.db.recordMetric('auto_folder', 'confidence', classification.confidence);
      
      if (classification.confidence >= 0.8) {
        await this.db.recordMetric('auto_folder', 'high_confidence', 1);
      } else if (classification.confidence >= 0.6) {
        await this.db.recordMetric('auto_folder', 'medium_confidence', 1);
      } else {
        await this.db.recordMetric('auto_folder', 'low_confidence', 1);
      }
    } catch (error) {
      console.error('[AutoFolder] Erreur sauvegarde cache SQLite:', error);
    }
  }

  /**
   * Récupère une classification depuis le cache SQLite
   */
  private async getFromCache(imageHash: string): Promise<AutoFolderClassification | null> {
    try {
      return this.db.get<AutoFolderClassification>(`auto_folder_cache`, imageHash) || null;
    } catch (error) {
      console.error('[AutoFolder] Erreur lecture cache SQLite:', error);
      return null;
    }
  }

  /**
   * Convertit un Buffer en Blob compatible navigateur
   */
  private bufferToBlob(buffer: Buffer): Blob {
    // @ts-ignore - Buffer est compatible Blob à l'exécution
    return new Blob([buffer], { type: 'image/jpeg' });
  }

  /**
   * Génère un hash simple pour une image (compatible client)
   */
  private async generateImageHash(buffer: Buffer): Promise<string> {
    const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    
    let startStr = '';
    let endStr = '';
    
    for (let i = 0; i < Math.min(1024, bytes.length); i++) {
      startStr += bytes[i].toString(16).padStart(2, '0');
    }
    
    for (let i = Math.max(0, bytes.length - 1024); i < bytes.length; i++) {
      endStr += bytes[i].toString(16).padStart(2, '0');
    }
    
    return `${bytes.length}_${startStr.slice(0, 50)}_${endStr.slice(0, 50)}`;
  }

  /**
   * Analyse et classifie une image via Gemini Vision
   */
  async classifyImage(
    imageBuffer: Buffer,
    options?: { forceRefresh?: boolean; customPrompt?: string }
  ): Promise<AutoFolderClassification> {
    const imageHash = await this.generateImageHash(imageBuffer);
    
    if (!options?.forceRefresh) {
      // Check memory cache first
      if (this.memoryCache.has(imageHash)) {
        const cached = this.memoryCache.get(imageHash)!;
        this.stats.cacheHits++;
        console.log('[AutoFolder] 📦 Résultat trouvé en cache mémoire');
        return cached.classification;
      }
      
      // Then check SQLite cache
      const cached = await this.getFromCache(imageHash);
      if (cached) {
        this.memoryCache.set(imageHash, {
          imageHash,
          classification: cached,
          timestamp: new Date().toISOString()
        });
        this.stats.cacheHits++;
        console.log('[AutoFolder] 📦 Résultat trouvé en cache SQLite');
        return cached;
      }
    }
    
    this.stats.cacheMisses++;
    console.log('[AutoFolder] 🔍 Classification automatique via Gemini Vision...');
    
    try {
      const prompt = options?.customPrompt || `Analyse cette image industrielle et suggère une classification.
RÉPONDS UNIQUEMENT AU FORMAT JSON :
{
  "suggestedFolder": "Nom du dossier (ex: Pompes, Turbines, Électrique, Vannes, Sécurité)",
  "equipmentType": "Type d'équipement détecté",
  "zone": "Zone probable (ex: Salle des machines, Extérieur, Poste électrique)",
  "tags": ["tag1", "tag2", "tag3"],
  "confidence": 0.0-1.0,
  "alternativeFolders": ["Option2", "Option3"]
}`;

      const response = await smartRouter.callVisionLLM(prompt, imageBuffer, {
        temperature: 0.2,
        maxTokens: 500
      });

      let data: Record<string, unknown> = {};
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        }
      } catch {
        data = {};
      }
      
      const classification: AutoFolderClassification = {
        suggestedFolder: (data.suggestedFolder as string) || 'Racine',
        confidence: (data.confidence as number) || 0.5,
        equipmentType: (data.equipmentType as string) || 'inconnu',
        zone: (data.zone as string) || 'non spécifiée',
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        alternativeFolders: (Array.isArray(data.alternativeFolders)
          ? data.alternativeFolders.map((f: unknown) =>
              typeof f === 'string'
                ? { path: f, confidence: 0.5 }
                : { path: String((f as Record<string, unknown>).path || ''), confidence: Number((f as Record<string, unknown>).confidence || 0.5) }
            )
          : []).slice(0, 3),
      };
      
      const cacheEntry: CacheEntry = {
        imageHash,
        classification,
        timestamp: new Date().toISOString(),
      };
      
      this.memoryCache.set(imageHash, cacheEntry);
      await this.saveToCache(imageHash, classification);
      
      if (this.memoryCache.size > 100) {
        const oldestKey = this.memoryCache.keys().next().value;
        if (oldestKey) {
          this.memoryCache.delete(oldestKey);
        }
      }
      
      this.stats.classifications++;
      console.log(`[AutoFolder] ✅ Classifié : ${classification.suggestedFolder} (${(classification.confidence * 100).toFixed(0)}%)`);
      
      return classification;
      
    } catch (error) {
      console.error('[AutoFolder] Erreur classification:', error);
      
      return {
        suggestedFolder: 'Racine',
        confidence: 0.3,
        equipmentType: 'inconnu',
        zone: 'non spécifiée',
        tags: [],
        alternativeFolders: [],
      };
    }
  }

  /**
   * Classifie ET enregistre automatiquement une image dans le bon dossier
   */
  /**
   * Classifie ET enregistre automatiquement une image dans le bon dossier
   * NOTE: Cette méthode a été désactivée car elle utilisait des fetch relatifs côté serveur.
   * Utiliser visionService.registerImage directement à la place.
   */
  async classifyAndRegister(
    imageBuffer: Buffer,
    baseMetadata: { filename?: string; description?: string } = {}
  ): Promise<{
    imageId: string;
    classification: AutoFolderClassification;
    folderId: string;
  }> {
    const classification = await this.classifyImage(imageBuffer);
    throw new Error('classifyAndRegister est déprécié. Utilisez visionService.registerImage.');
  }

  /**
   * Suggère des tags pour une image
   */
  async suggestTags(imageBuffer: Buffer): Promise<string[]> {
    const classification = await this.classifyImage(imageBuffer);
    
    const tags = [...classification.tags];
    
    if (classification.equipmentType !== 'inconnu') {
      tags.push(classification.equipmentType.toLowerCase().replace(/\s+/g, '_'));
    }
    
    if (classification.zone !== 'non spécifiée') {
      tags.push(classification.zone.toLowerCase().replace(/\s+/g, '_'));
    }
    
    return [...new Set(tags)].slice(0, 10);
  }

  /**
   * Rafraîchit la structure des dossiers (via API)
   */
  /**
   * Rafraîchit la structure des dossiers (via SQLite directement)
   */
  async refreshFolderStructure(): Promise<void> {
    try {
      // Au lieu de fetch, on utilise la DB directement si possible
      const folders = this.db.visionFolders.listFolders();
      await this.db.recordMetric('auto_folder', 'folders_count', folders.length || 0);
      console.log(`[AutoFolder] Structure dossiers chargée via SQLite : ${folders.length} dossiers`);
    } catch (error) {
      console.error('[AutoFolder] Erreur chargement dossiers:', error);
    }
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(updates: Partial<typeof DEFAULT_CONFIG>): void {
    this.config = { ...this.config, ...updates };
    console.log('[AutoFolder] Configuration mise à jour');
  }

  /**
   * Vide le cache (mémoire + SQLite)
   */
  async clearCache(): Promise<void> {
    this.memoryCache.clear();
    
    try {
      const deleted = this.db.clearNamespace('auto_folder_cache');
      console.log(`[AutoFolder] Cache SQLite vidé: ${deleted} entrées supprimées`);
    } catch (error) {
      console.error('[AutoFolder] Erreur vidage cache SQLite:', error);
    }
    
    console.log('[AutoFolder] Cache vidé');
  }

  /**
   * Obtient des statistiques
   */
  async getStats(): Promise<{
    cacheSize: number;
    sqliteCacheSize: number;
    foldersCount: number;
    config: typeof DEFAULT_CONFIG;
    hitRate: number;
    totalClassifications: number;
  }> {
    let sqliteCacheSize = 0;
    try {
      const stats = this.db.getStats();
      const cacheStat = stats.find(s => s.namespace === 'auto_folder_cache');
      sqliteCacheSize = cacheStat?.size || 0;
    } catch (error) {
      console.error('[AutoFolder] Erreur stats SQLite:', error);
    }
    
    const totalRequests = this.stats.cacheHits + this.stats.cacheMisses;
    const hitRate = totalRequests > 0 ? this.stats.cacheHits / totalRequests : 0;
    
    return {
      cacheSize: this.memoryCache.size,
      sqliteCacheSize,
      foldersCount: 0,
      config: this.config,
      hitRate,
      totalClassifications: this.stats.classifications
    };
  }

  /**
   * Obtient les métriques depuis SQLite
   */
  async getMetrics(): Promise<{
    avgConfidence: number;
    highConfidenceCount: number;
    mediumConfidenceCount: number;
    lowConfidenceCount: number;
  }> {
    const avgConfidence = this.db.getMetricStats('auto_folder', 'confidence');
    const highConfidence = this.db.getMetricStats('auto_folder', 'high_confidence');
    const mediumConfidence = this.db.getMetricStats('auto_folder', 'medium_confidence');
    const lowConfidence = this.db.getMetricStats('auto_folder', 'low_confidence');
    
    return {
      avgConfidence: avgConfidence.avg || 0,
      highConfidenceCount: highConfidence.count || 0,
      mediumConfidenceCount: mediumConfidence.count || 0,
      lowConfidenceCount: lowConfidence.count || 0
    };
  }

    /**
   * Méthode d'alignement d'interface pour la classe VisionData
   * Cette méthode est appelée par registerImage dans visionService.ts
   */
  async classify(visionData: VisionData): Promise<AutoFolderClassification> {
    // Si visionData contient un buffer d'image, utiliser classifyImage
    if (visionData.metadata && (visionData.metadata as Record<string, unknown>).imageBuffer) {
      return this.classifyImage((visionData.metadata as Record<string, unknown>).imageBuffer as Buffer);
    }
    
    // Sinon, retourner une classification basée sur les métadonnées existantes
    const classification: AutoFolderClassification = {
      suggestedFolder: visionData.imageType === 'global' ? 'Images_Globales' : 'Images_Part',
      confidence: 0.7,
      equipmentType: visionData.imageType === 'global' ? 'vue_ensemble' : 'piece_detachee',
      zone: 'automatique',
      tags: visionData.invocationKeywords ? visionData.invocationKeywords.split(',').map(k => k.trim()) : [],
      alternativeFolders: [
        { path: 'Racine', confidence: 0.5 },
        { path: 'Non_classifie', confidence: 0.3 }
      ]
    };
    
    console.log(`[AutoFolder] Classification basée sur métadonnées: ${classification.suggestedFolder}`);
    return classification;
  }
}

// Export singleton
export const autoFolderClassifier = new AutoFolderClassifier();