import * as tf_types from '@tensorflow/tfjs';
let tf: typeof tf_types;
let mobilenet: any;

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { smartRouter } from '@/ai/router/smart-router';
import { vectorDB } from '@/ai/vector';
import { getCurrentDimension } from '@/ai/vector/embeddings';
import { hybridVisionSearch } from '@/ai/innovations/05-hybrid-vision-search';
import { intelligentPartMatching } from '@/ai/innovations/09-intelligent-part-matching';
import { autoFolderClassifier } from '@/ai/innovations/04-auto-folder-classifier';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';
import { clearTreeCache } from './vision-cache';
import { 
  ImagePreparation, 
  VisionAnchor, 
  SpatialHierarchy, 
  VisionData as SQLiteVisionData, 
  VisionFolder as SQLiteVisionFolder 
} from '@/ai/core/sqlite/types';
import { MobileNet } from '@tensorflow-models/mobilenet';

// On utilise les types de la BDD
type VisionData = SQLiteVisionData;
type VisionFolder = SQLiteVisionFolder;

interface VisionServiceInterface {
  listFolders(parentId?: string): Promise<VisionFolder[]>;
  createFolder(f: Partial<VisionFolder>): Promise<VisionFolder>;
  updateFolder(id: string, f: Partial<VisionFolder>): Promise<VisionFolder>;
  deleteFolder(id: string): Promise<boolean>;
  registerImage(file: { buffer: Buffer, originalname: string }, meta: Partial<VisionData>): Promise<VisionData>;
  updateImageMetadata(id: string, meta: Partial<VisionData>): Promise<VisionData>;
  deleteImages(ids: string[]): Promise<boolean>;
  getImageData(id: string): Promise<VisionData | null>;
  getImageBuffer(id: string): Promise<Buffer | null>;
  getImageFilePath(id: string): Promise<string | null>;
  extractFeatures(buffer: Buffer): Promise<number[]>;
  getFeatures(id: string): Promise<number[] | null>;
  diagnoseWithAI(id: string, query: string): Promise<DiagnosisResult | null>;
  searchSimilar(features: number[], limit: number, threshold?: number, queryBuffer?: Buffer): Promise<Array<VisionData & { similarity: number }>>;
  reindexImage(id: string): Promise<boolean>;
  reconcile(): Promise<void>;
  quickSyncFolder(folderPath: string): Promise<void>;
}

/** Résultat structuré d'un diagnostic IA */
interface DiagnosisResult {
  query: string;
  imageId: string;
  diagnosis: unknown;
  partMatching: unknown;
  timestamp: string;
}

/** Type pour les résultats de prepareForVision */
interface PreparedVisionResult {
  data: Buffer;
  info: { width: number; height: number; channels: number };
}
/**
 * Calcule un hash déterministe pour un buffer d'image.
 */
function computeBufferHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Normalizes an image buffer to a predictable shape.
 * Returns the raw buffer and its dimensions.
 * Used by both registration and part-matching steps.
 */
async function prepareForVision(buffer: Buffer): Promise<PreparedVisionResult> {
  try {
    // tf.node is only available when @tensorflow/tfjs-node is loaded at runtime
    if (tf && (tf as any).node && (tf as any).node.decodeImage) {
      try {
        const tensor = (tf as any).node.decodeImage(buffer, 3);
        const [height, width, channels] = tensor.shape;
        const data = Buffer.from(await tensor.data());
        tensor.dispose();
        return { data, info: { width, height, channels } };
      } catch (tfError) {
        console.warn('⚠️ TensorFlow.js decodeImage failed, trying Sharp:', tfError);
        // Fall through to Sharp
      }
    }
    
    // Fallback: use sharp with better error handling
    try {
      const sharp = await import('sharp');
      try {
        // Forcer une taille et un format déterministe pour MobileNet
        const { data, info } = await sharp.default(buffer)
          .resize(224, 224, { 
            fit: 'cover',
            position: 'center',
            kernel: 'lanczos3'
          })
          .removeAlpha()
          .toColorspace('srgb')
          .raw()
          .toBuffer({ resolveWithObject: true });
        
        return { 
          data: Buffer.from(data), 
          info: { 
            width: 224,
            height: 224, 
            channels: 3 
          } 
        };
      } catch (rawError) {
        console.error('❌ Sharp raw conversion failed:', rawError);
      }
    } catch (sharpImportError) {
      console.warn('⚠️ Sharp non disponible (ERR_DLOPEN_FAILED probable), utilisation du buffer brut:', sharpImportError);
    }
    return { 
      data: buffer, 
      info: { width: 800, height: 600, channels: 3 } 
    };
  } catch (error) {
    console.error('❌ Erreur complète dans prepareForVision:', error);
    return { 
      data: buffer, 
      info: { width: 800, height: 600, channels: 3 } 
    };
  }
}

/**
 * 🔥 STANDARDISATION INDUSTRIELLE : Garantit que toutes les images (indexées ou requêtes)
 * passent par le même pipeline de compression et d'espace colorimétrique
 * pour éliminer la variance d'embedding due aux artefacts de format.
 * (JPEG 90% -> sRGB)
 */
async function standardizeImage(buffer: Buffer): Promise<Buffer> {
  try {
    const sharpModule = await import('sharp').catch(() => null);
    if (!sharpModule) return buffer;
    return await sharpModule.default(buffer)
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
      .toColorspace('srgb')
      .toBuffer();
  } catch (error) {
    console.warn('⚠️ Échec standardisation image, utilisation du buffer original:', error);
    return buffer;
  }
}
// On utilise les types importés de @/ai/core/sqlite/types


// Fonction utilitaire pour normaliser le type d'image (déclarée au niveau module)
const normalizeImageType = (type: string | undefined): 'simple' | 'panoramic' | 'global' | 'patch' => {
  if (type === 'global') return 'global';
  if (type === 'part') return 'patch';
  if (type === 'panoramic') return 'panoramic';
  return 'simple';
};

class VisionService implements VisionServiceInterface {
  private model: MobileNet | null = null;
  private storageInitialized: boolean = false;
  private visionModelInitialized: boolean = false;
  private imageCollection: Map<string, VisionData> = new Map();
  private isInitializing: boolean = false;
  private featuresCache: Map<string, number[]> = new Map();
  private folders: Map<string, VisionFolder> = new Map();
  private imagePathCache: Map<string, string> = new Map();
  private initStoragePromise: Promise<void> | null = null;
  private initVisionPromise: Promise<void> | null = null;

  constructor() {}

  private async initStorage(): Promise<void> {
    if (this.storageInitialized) return;
    if (this.initStoragePromise) return this.initStoragePromise;

    this.initStoragePromise = (async () => {
      try {
        console.log('📂 Initialisation du stockage Vision...');
        const db = getSQLiteCore();
        
        // S'assurer que la DB est prête
        if (db.initialize) {
          await db.initialize();
        }
        
        // Charger les dossiers
        try {
          const folders = db.visionFolders?.listFolders?.() || [];
          this.folders.clear();
          folders.forEach((f: any) => this.folders.set(f.id, f));
        } catch (e) {
          console.warn('⚠️ Erreur chargement dossiers:', e);
        }
        
        // Charger les images (métadonnées uniquement, max 1000 pour éviter crash RAM)
        try {
          const images = db.vision?.getAllImages?.() || [];
          this.imageCollection.clear();
          images.forEach((img: any) => {
            this.imageCollection.set(img.id, {
              ...img,
              imageType: img.image_type,
              folderId: img.folder_id,
              createdAt: img.created_at
            } as any);
          });
        } catch (e) {
          console.warn('⚠️ Erreur chargement images:', e);
        }

        // Charger le cache des features (namespace: vision_features)
        try {
          const featureRows = db.getDB().prepare(`SELECT key, value FROM actions_caches WHERE namespace = ? AND expiresAt > ?`).all('vision_features', Date.now()) as any[];
          for (const fr of featureRows) {
            try {
              const features = JSON.parse(fr.value) as number[];
              if (Array.isArray(features)) this.featuresCache.set(fr.key, features);
            } catch (e) { /* ignore */ }
          }
          console.log(`⚡ Chargé en mémoire: ${this.featuresCache.size} features (cache)`);
        } catch (e) {
          console.warn('⚠️ Erreur chargement features cache:', e);
        }

        this.storageInitialized = true;
        console.log(`✅ Stockage Vision initialisé (${this.folders.size} dossiers, ${this.imageCollection.size} images)`);
      } catch (error) {
        console.error('❌ Erreur critique initialisation stockage vision:', error);
        this.storageInitialized = false;
        throw error;
      } finally {
        this.initStoragePromise = null;
      }
    })();

    return this.initStoragePromise;
  }

  private async initVisionModel(): Promise<void> {
    if (this.visionModelInitialized) return;
    if (this.initVisionPromise) return this.initVisionPromise;

    this.initVisionPromise = (async () => {
      this.isInitializing = true;
      try {
        console.log('🖼️ Initialisation du modèle Vision (MobileNet v2)...');
        
        // Importations dynamiques pour la stabilité
        let tf_module;
        try {
          console.log('📦 Tentative de chargement de @tensorflow/tfjs-node...');
          tf_module = await import('@tensorflow/tfjs-node');
        } catch (nodeErr) {
          console.warn('⚠️ @tensorflow/tfjs-node non disponible (probable erreur binaire sur Windows). Repli sur @tensorflow/tfjs (CPU)...');
          tf_module = await import('@tensorflow/tfjs');
        }
        
        const mobilenet_module = await import('@tensorflow-models/mobilenet');
        
        tf = tf_module as any;
        mobilenet = mobilenet_module as any;

        // Configuration TFJS
        try {
          if (tf && (tf as any).setBackend) {
            await (tf as any).setBackend('cpu');
          }
        } catch (e) {
          console.warn('⚠️ Backend CPU non forcé:', e);
        }

        // Chargement de MobileNet v2 (1280 dims, sera tronqué à 768)
        this.model = await (mobilenet as any).load({
          version: 2,
          alpha: 1.0
        });

        this.visionModelInitialized = true;
        console.log('✅ Modèle Vision prêt (MobileNet v2)');
      } catch (error) {
        console.error('❌ Échec initialisation vision:', error);
        this.visionModelInitialized = false;
        throw error;
      } finally {
        this.isInitializing = false;
        this.initVisionPromise = null;
      }
    })();

    return this.initVisionPromise;
  }




  async init() {
    await this.initStorage();
  }

  /**
   * RÉCONCILIATION RADICALE : Synchronise tout le système de fichiers avec la BDD
   * Construit l'arborescence complète et répare les liens cassés.
   */
  async reconcile(): Promise<void> {
    const startTime = Date.now();
    const banquePath = path.join(process.cwd(), 'data/banque_images_ia');
    const db = getSQLiteCore();
    
    // S'assurer que le dossier racine existe
    await fs.mkdir(banquePath, { recursive: true });
    
    // Nettoyer les caches mémoire
    this.folders.clear();
    this.imageCollection.clear();
    this.imagePathCache.clear();
    
    // Charger d'abord les dossiers depuis la BDD pour comparaison
    const dbFolders = db.visionFolders?.listFolders?.() || [];
    const dbFoldersByPath = new Map<string, any>();
    dbFolders.forEach((f: any) => dbFoldersByPath.set(f.path.replace(/\\/g, '/'), f));

    // Fonction de scan récursif ultra-rapide
    const scan = async (currentPath: string, parentId: string | null = 'root'): Promise<void> => {
      const relativePath = path.relative(process.cwd(), currentPath).replace(/\\/g, '/');
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      // 1. Gérer le dossier actuel (sauf la racine de la banque qui est 'root')
      let currentFolderId: string = parentId || 'root';
      if (currentPath !== banquePath) {
        const folderName = path.basename(currentPath);
        const existingFolder = dbFoldersByPath.get(relativePath);
        
        if (existingFolder) {
          currentFolderId = existingFolder.id;
        } else {
          currentFolderId = crypto.randomUUID();
          const newFolder = {
            id: currentFolderId,
            name: folderName,
            path: relativePath,
            parentId: parentId,
            createdAt: Date.now(),
            metadata: {}
          };
          if (db.visionFolders?.insertFolder) {
            db.visionFolders.insertFolder(newFolder);
          }
          console.log(`🆕 Nouveau dossier détecté et synchronisé: ${relativePath}`);
        }
        
        this.folders.set(currentFolderId, {
          id: currentFolderId,
          name: folderName,
          path: relativePath,
          parentId: parentId ?? null,
          createdAt: Date.now()
        });
      } else {
        currentFolderId = 'root';
      }

      // 2. Parcourir les entrées
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      const fileGroups = new Map<string, { image?: string, json?: string }>();

      // Grouper les fichiers par nom de base (sans extension)
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const IGNORE_FOLDERS = ['permanent', 'uploads', 'cache', 'cache_permanent', '__pycache__', 'node_modules', '.git'];
          if (!IGNORE_FOLDERS.includes(entry.name)) {
            await scan(path.join(currentPath, entry.name), currentFolderId);
          }
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          const base = path.basename(entry.name, ext);
          
          if (!fileGroups.has(base)) fileGroups.set(base, {});
          const group = fileGroups.get(base)!;
          
          if (imageExtensions.includes(ext)) group.image = entry.name;
          else if (ext === '.json' && !entry.name.includes('_thumb')) group.json = entry.name;
        }
      }

      // Traiter chaque groupe (image + optionnel JSON)
      for (const [base, files] of fileGroups.entries()) {
        if (!files.image && !files.json) continue;

        try {
          let metadata: any = {};
          let imageId = base;
          
          // 1. Lire le JSON si présent
          if (files.json) {
            try {
              const content = await fs.readFile(path.join(currentPath, files.json), 'utf-8');
              metadata = JSON.parse(content);
              if (metadata.id) imageId = metadata.id;
            } catch (jsonErr) {
              console.warn(`⚠️ Erreur lecture JSON ${files.json}:`, jsonErr);
            }
          }

          // 2. Déterminer le fichier image
          const imageName = files.image || metadata.filename || `${imageId}.jpg`;
          const imageRelPath = path.join(relativePath, imageName).replace(/\\/g, '/');
          const imageFullPath = path.join(currentPath, imageName);

          // 3. Créer l'objet VisionData
          const visionData: VisionData = {
            id: imageId,
            filename: imageName,
            description: metadata.description || (files.image ? `Image: ${files.image}` : ''),
            date: metadata.date || new Date().toISOString(),
            tags: Array.isArray(metadata.tags) ? metadata.tags : (metadata.tags ? [metadata.tags] : []),
            location: metadata.location || path.basename(currentPath),
            folderId: metadata.folderId || metadata.folder_id || (currentFolderId === 'root' ? undefined : (currentFolderId || undefined)),
            image: '',
            created_at: metadata.createdAt ? new Date(metadata.createdAt).getTime() : Date.now(),
            createdAt: metadata.createdAt || new Date().toISOString(),
            imageType: normalizeImageType(metadata.imageType || metadata.image_type),
            qaPairs: metadata.qaPairs || [],
            invocationKeywords: metadata.invocationKeywords || '',
            equipmentState: metadata.equipmentState || 'normal',
            validUntil: metadata.validUntil,
            linkedProcedure: metadata.linkedProcedure,
            fileHash: metadata.fileHash,
            width: metadata.width,
            height: metadata.height,
            fileSize: metadata.fileSize,
            mimeType: metadata.mimeType,
            linkedDocumentIds: metadata.linkedDocumentIds || [],
            author: metadata.author || '',
            documentType: metadata.documentType || '',
            relatedDocs: metadata.relatedDocs || '',
            filepath: imageRelPath,
            folder_id: metadata.folder_id || metadata.folderId || (currentFolderId === 'root' ? 'root' : (currentFolderId || 'root')),
            image_type: normalizeImageType(metadata.image_type || metadata.imageType),
            ocr_text: metadata.ocr_text || metadata.ocrText,
            metadata: metadata.metadata || {}

          };

          // 4. Persister dans SQLite
          if (db.vision?.saveImage) {
            db.vision.saveImage({
              ...visionData,
              created_at: typeof visionData.createdAt === 'string' ? new Date(visionData.createdAt).getTime() : (visionData.createdAt ?? Date.now()),
              folder_id: visionData.folder_id || 'root',
              image_type: visionData.image_type || 'simple',
              metadata: visionData.metadata || {}
            });
          }
          
          this.imageCollection.set(imageId, visionData);
          this.imagePathCache.set(imageId, currentPath);

          // 5. Indexation vectorielle
          const imageExists = await fs.access(imageFullPath).then(() => true).catch(() => false);
          if (imageExists) {
            try {
              const imageBuffer = await fs.readFile(imageFullPath);
              
              // 🔥 NOUVEAU: Calculer et mettre à jour le hash si nécessaire
              const currentHash = computeBufferHash(imageBuffer);
              if (!visionData.fileHash || visionData.fileHash !== currentHash) {
                visionData.fileHash = currentHash;
                visionData.file_hash = currentHash;
                // Re-sauvegarder avec le hash
                if (db.vision?.saveImage) {
                  db.vision.saveImage(visionData as any);
                }
              }

              await this.initVisionModel();
              const features = await this.extractFeatures(imageBuffer);
              this.featuresCache.set(imageId, features);
              await hybridVisionSearch.indexImage(imageId, features, visionData as any);
            } catch (idxError) {
              console.warn(`⚠️ Échec indexation ${imageId}:`, idxError);
            }
          }
        } catch (e) {
          console.warn(`⚠️ Erreur traitement groupe ${base}:`, e);
        }
      }

    };

    await scan(banquePath, null);
    console.log(`✨ Réconciliation terminée en ${Date.now() - startTime}ms`);
  }

  /**
   * SYNC RAPIDE : Met à jour uniquement un dossier spécifique dans la DB
   * Utilisé après les mutations (rename, delete, create) pour éviter un reconcile complet
   */
  async quickSyncFolder(folderPath: string): Promise<void> {
    const db = getSQLiteCore();
    const banquePath = path.join(process.cwd(), 'data/banque_images_ia');
    const absolutePath = folderPath.startsWith(process.cwd()) 
      ? folderPath 
      : path.join(process.cwd(), folderPath);
    const relativePath = path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');

    try {
      // Vérifier si le dossier existe encore (cas suppression)
      const exists = await fs.access(absolutePath).then(() => true).catch(() => false);
      
      if (!exists) {
        // Supprimer le dossier et ses enfants de la DB
        db.getDB().prepare('DELETE FROM vision_folders WHERE path LIKE ?').run(`${relativePath}%`);
        db.getDB().prepare('DELETE FROM vision_data WHERE filepath LIKE ?').run(`${relativePath}%`);
        this.folders.delete(relativePath);
        console.log(`🗑️ Dossier ${relativePath} supprimé de la DB`);
        return;
      }

      // Scanner uniquement ce dossier
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      const folderName = path.basename(absolutePath);
      
      // Upsert le dossier lui-même
      const existingFolder = db.getDB().prepare('SELECT id FROM vision_folders WHERE path = ?').get(relativePath) as { id: string } | undefined;
      if (!existingFolder) {
        const parentRelPath = path.relative(process.cwd(), path.dirname(absolutePath)).replace(/\\/g, '/');
        const isBanqueRoot = parentRelPath === path.relative(process.cwd(), banquePath).replace(/\\/g, '/');
        const parentFolder = isBanqueRoot
          ? 'root'
          : (db.getDB().prepare('SELECT id FROM vision_folders WHERE path = ?').get(parentRelPath) as { id: string } | undefined)?.id || 'root';

        const newId = crypto.randomUUID();
        if (db.visionFolders?.insertFolder) {
          db.visionFolders.insertFolder({
            id: newId,
            name: folderName,
            path: relativePath,
            parentId: parentFolder,
            createdAt: Date.now(),
            metadata: {}
          });
        }
        console.log(`📁 [quickSyncFolder] Nouveau dossier inséré: ${relativePath} (parentId: ${parentFolder})`);
      }

      // Sync les images du dossier
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.includes('_thumb')) continue;
        const jsonPath = path.join(absolutePath, entry.name);
        try {
          const content = await fs.readFile(jsonPath, 'utf-8');
          const metadata = JSON.parse(content);
          const imageId = path.basename(entry.name, '.json');
          if (db.vision?.saveImage) {
            const folderId = (db.getDB().prepare('SELECT id FROM vision_folders WHERE path = ?').get(relativePath) as { id: string } | undefined)?.id || 'root';
            const syncData: VisionData = {
              id: imageId,
              filename: (metadata as VisionData).filename || `${imageId}.jpg`,
              filepath: (metadata as VisionData).filepath || '',
              description: (metadata as VisionData).description || '',
              date: (metadata as VisionData).date || new Date().toISOString(),
              tags: (metadata as VisionData).tags || [],
              location: (metadata as VisionData).location || '',
              folder_id: folderId,
              created_at: Date.now(),
              image_type: normalizeImageType((metadata as VisionData).image_type || (metadata as VisionData).imageType),
              metadata: (metadata as VisionData).metadata || {}
            };
            db.vision.saveImage(syncData);
          }
        } catch { /* ignorer */ }
      }
      
      console.log(`⚡ Sync rapide ${relativePath} terminé`);
    } catch (error) {
      console.error(`❌ Erreur quickSyncFolder ${relativePath}:`, error);
    }
  }

  private async detectAnchors(data: VisionData): Promise<VisionAnchor[]> {
    const anchors: VisionAnchor[] = [];
    
    if (data.invocationKeywords) {
      const keywords = data.invocationKeywords.split(',').map(k => k.trim());
      keywords.forEach((kw, idx) => {
        if (kw.length > 2) {
          anchors.push({
            id: `anchor_${data.id}_${idx}`,
            type: 'logical_anchor',
            label: kw,
            confidence: 0.9
          });
        }
      });
    }

    if (data.description && data.description.includes('QR')) {
      anchors.push({
        id: `qr_${data.id}`,
        type: 'qr',
        label: 'QR Code Systémique',
        confidence: 0.95,
        position: { x: 10, y: 10 }
      });
    }
    
    return anchors;
  }

  private async buildSpatialHierarchy(data: VisionData): Promise<SpatialHierarchy> {
    const components = [];
    if (data.imageType === 'global') {
      components.push({
        id: `main_${data.id}`,
        type: 'container',
        role: 'parent_view',
        label: data.filename
      });
    }
    
    return {
      components,
      relations: [],
      metadata: {
        analyzedAt: new Date().toISOString(),
        strategy: 'semantic_spatial_mapping'
      }
    };
  }

  private async generatePyramid(_imageData: VisionData): Promise<Array<{ scale: number; cached: boolean }>> {
    const pyramid = [];
    const scales = [0.25, 0.5, 1, 2];
    
    for (const scale of scales) {
      pyramid.push({
        scale,
        cached: scale === 1
      });
    }
    
    return pyramid;
  }

  async getPreparationStatus(imageId: string): Promise<ImagePreparation> {
    const db = getSQLiteCore();
    const preparation = db.visionPrep?.getPreparation?.(imageId);
    
    if (!preparation) {
      return {
        imageId,
        status: 'pending',
        preparationDate: new Date().toISOString(),
        rois: [],
        anchors: [],
        spatialHierarchy: { components: [], relations: [], metadata: { analyzedAt: '', strategy: '' } },
        pyramid: []
      };
    }

    return {
      imageId,
      status: preparation.status as any,
      preparationDate: preparation.preparationDate ? new Date(preparation.preparationDate).toISOString() : new Date().toISOString(),
      rois: preparation.rois || [],
      anchors: preparation.anchors || [],
      spatialHierarchy: preparation.spatialHierarchy || { components: [], relations: [], metadata: { analyzedAt: '', strategy: '' } },
      pyramid: preparation.pyramid || []
    };
  }

  async listImages(): Promise<VisionData[]> {
    await this.initStorage();
    const db = getSQLiteCore();
    const images = db.getDB().prepare('SELECT * FROM vision_data').all() as any[];
    return images.map(img => {
      let linkedDocs: string[] = [];
      if (img.linked_document_ids) {
        try {
          linkedDocs = typeof img.linked_document_ids === 'string' ? JSON.parse(img.linked_document_ids) : img.linked_document_ids;
          if (!Array.isArray(linkedDocs)) linkedDocs = [];
        } catch {
          linkedDocs = [];
        }
      }
      return {
        ...img,
        imageType: img.image_type,
        folderId: img.folder_id,
        createdAt: new Date(img.created_at).toISOString(),
        tags: JSON.parse(img.tags || '[]'),
        linkedDocumentIds: linkedDocs,
        linked_document_ids: linkedDocs
      };
    });
  }

  async deleteImage(imageId: string): Promise<boolean> {
    await this.initStorage();
    try {
      this.imageCollection.delete(imageId);
      this.featuresCache.delete(imageId);
      this.imagePathCache.delete(imageId);
      
      await hybridVisionSearch.removeFromIndex(imageId);
      
      try {
        await vectorDB.deleteDocuments('VISION', [`vision_${imageId}`]);
        console.log(`🗑️ Image ${imageId} supprimée de ChromaDB`);
      } catch (chromaError) {
        console.error(`Erreur suppression ChromaDB:`, chromaError);
      }
      
      const banquePath = path.join(process.cwd(), 'data/banque_images_ia');
      const folderPath = await this.findImagePath(banquePath, imageId);
      
      if (folderPath) {
        const filesToDelete = [`${imageId}.jpg`, `${imageId}.json`, `${imageId}_thumb.jpg`, `${imageId}.png`];
        for (const file of filesToDelete) {
          try {
            await fs.unlink(path.join(folderPath, file));
          } catch {
            // Ignorer les erreurs de suppression individuelle
          }
        }
        console.log(`🗑️ Fichiers supprimés dans ${folderPath}`);
      }
      
      // Supprimer la référence en base de données (vision_data) pour éviter la réapparition après reload
      try {
        const db = getSQLiteCore();
        const dbInstance = db.getDB();
        dbInstance.prepare('DELETE FROM vision_data WHERE id = ?').run(imageId);
        // Nettoyer les tables dépendantes si elles existent
        try { dbInstance.prepare('DELETE FROM image_preparations WHERE image_id = ?').run(imageId); } catch (e) { /* ignore */ }
        try { dbInstance.prepare('DELETE FROM image_assemblies WHERE result_image_id = ?').run(imageId); } catch (e) { /* ignore */ }
        console.log(`🗑️ Image ${imageId} supprimée de la DB`);
      } catch (dbErr) {
        console.error('❌ Erreur suppression en DB pour image:', dbErr);
      }

      console.log(`✅ Image supprimée: ${imageId}`);
      clearTreeCache();
      return true;
    } catch (error) {
      console.error('❌ Erreur suppression image:', error);
      return false;
    }
  }

  private async findImagePath(currentDir: string, imageId: string): Promise<string | null> {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      const hasMetadata = entries.some(e => e.isFile() && e.name === `${imageId}.json`);
      if (hasMetadata) return currentDir;
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const result = await this.findImagePath(path.join(currentDir, entry.name), imageId);
          if (result) return result;
        }
      }
    } catch (e) {
      // Ignorer les erreurs de lecture
    }
    return null;
  }

  // ============================================
  // IMPLÉMENTATION DES MÉTHODES COMPLÈTES
  // ============================================

  async listFolders(parentId?: string): Promise<VisionFolder[]> {
    await this.initStorage();
    return Array.from(this.folders.values()).filter(f => !parentId || f.parentId === parentId);
  }

  async createFolder(f: Partial<VisionFolder> & { name: string }): Promise<VisionFolder> {
    await this.initStorage();
    const db = getSQLiteCore();
    
    let parentPath = 'data/banque_images_ia';
    if (f.parentId && f.parentId !== 'root') {
      const parentFolder = db.visionFolders?.getFolder?.(f.parentId);
      if (parentFolder && parentFolder.path) {
        parentPath = parentFolder.path;
      }
    }
    
    const folderPath = path.join(parentPath, f.name).replace(/\\/g, '/');
    const folderId = crypto.createHash('md5').update(folderPath).digest('hex');
    
    const folder: VisionFolder = {
      id: folderId,
      name: f.name,
      path: folderPath,
      parentId: f.parentId || 'root',
      createdAt: Date.now()
    };
    
    try {
      // Créer physiquement le dossier
      const fullPath = path.join(process.cwd(), folderPath);
      await fs.mkdir(fullPath, { recursive: true });
      console.log(`📁 Dossier créé physiquement: ${fullPath}`);
    } catch (e) {
      console.error(`❌ Erreur création dossier physique:`, e);
    }
    
    this.folders.set(folderId, folder);
    db.visionFolders?.insertFolder?.(folder);
    
    clearTreeCache();
    return folder;
  }

  async updateFolder(id: string, f: Partial<VisionFolder>): Promise<VisionFolder | null> {
    await this.initStorage();
    const folder = this.folders.get(id);
    if (folder) {
      folder.name = f.name || folder.name;
      this.folders.set(id, folder);
      const db = getSQLiteCore();
      if (db.visionFolders?.updateFolder) {
        db.visionFolders.updateFolder(id, folder);
      }
      return folder;
    }
    return null;
  }

  async deleteFolder(id: string): Promise<boolean> {
    await this.initStorage();
    const deleted = this.folders.delete(id);
    if (deleted) {
      const db = getSQLiteCore();
      if (db.visionFolders?.deleteFolder) {
        db.visionFolders.deleteFolder(id);
      }
      clearTreeCache();
    }
    return deleted;
  }

  async registerImage(file: { buffer: Buffer, originalname?: string, name?: string }, meta: Partial<VisionData> & { targetPath?: string }): Promise<VisionData> {
    await this.initStorage();
    await this.initVisionModel();
    
    const imageId = meta.id || crypto.randomUUID();
    const imageType = meta.image_type || 'simple';
    
    // 🔥 NOUVEAU: Calculer un hash déterministe de l'image originale
    const fileHash = computeBufferHash(file.buffer);
    
    // Convertir le buffer en base64 pour la propriété image
    let imageBase64 = '';
    const bufferToUse = file.buffer;
    if (bufferToUse) {
      imageBase64 = bufferToUse.toString('base64');
    }
    
    const visionData: VisionData = {
      id: imageId,
      filename: file.name || file.originalname || meta.filename || `image_${imageId.substring(0, 8)}.jpg`,
      description: meta.description || '',
      date: meta.date || new Date().toISOString(),
      tags: meta.tags || [],
      location: meta.location || '',
      folder_id: meta.folder_id || meta.folderId || meta.targetPath || 'root',
      folderId: meta.folderId || meta.folder_id || meta.targetPath || 'root',
      image: imageBase64,
      created_at: Date.now(),
      image_type: imageType as any,
      qa_pairs: meta.qa_pairs,
      invocation_keywords: meta.invocation_keywords,
      equipment_state: meta.equipment_state,
      valid_until: meta.valid_until,
      linked_procedure: meta.linked_procedure,
      file_hash: fileHash,
      width: meta.width,
      height: meta.height,
      file_size: meta.file_size,
      mime_type: meta.mime_type,
      linked_document_ids: meta.linked_document_ids,
      author: meta.author,
      document_type: meta.document_type,
      related_docs: meta.related_docs,
      filepath: meta.filepath || '',
      ocr_text: meta.ocr_text || meta.ocrText,
      metadata: meta.metadata || {}

    };
    
    // 🔥 ÉTAPE 1: Sauvegarder d'abord dans vision_data (via SQLite) pour éviter l'erreur de clé étrangère
    const db = getSQLiteCore();

    if (db.vision?.saveImage) {
      db.vision.saveImage({
        ...visionData,
        created_at: Date.now(),
        image_type: normalizeImageType(visionData.image_type || visionData.imageType)
      } as any);
      console.log(`💾 Image ${imageId} sauvegardée dans vision_data`);
    } else {
      console.warn(`⚠️ db.vision.saveImage non disponible, tentative de sauvegarde manuelle...`);
      // Sauvegarde manuelle si la méthode n'existe pas
      try {
        const dbInstance = db.getDB();
        dbInstance.prepare(`
          INSERT OR REPLACE INTO vision_data 
          (id, filename, filepath, description, date, tags, location, folder_id, image, created_at, image_type, qa_pairs, invocation_keywords, equipment_state, valid_until, linked_procedure, file_hash, width, height, file_size, mime_type, linked_document_ids, author, document_type, related_docs, thumbnail_path, ocr_text, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

        `).run(
          visionData.id,
          visionData.filename,
          visionData.filepath || '',
          visionData.description,
          visionData.date,
          JSON.stringify(visionData.tags),
          visionData.location,
          visionData.folder_id || visionData.folderId || '',
          visionData.image,
          Date.now(),
          normalizeImageType(visionData.image_type || visionData.imageType),
          visionData.qaPairs,
          visionData.invocationKeywords,
          visionData.equipmentState,
          visionData.validUntil,
          visionData.linkedProcedure,
          visionData.fileHash,
          visionData.width,
          visionData.height,
          visionData.fileSize,
          visionData.mimeType,
          visionData.linkedDocumentIds ? JSON.stringify(visionData.linkedDocumentIds) : null,
          visionData.author,
          visionData.documentType,
          visionData.relatedDocs ? JSON.stringify(visionData.relatedDocs) : null,
          null,
          visionData.ocr_text,
          visionData.metadata ? JSON.stringify(visionData.metadata) : null

        );
        console.log(`💾 Image ${imageId} sauvegardée manuellement dans vision_data`);
      } catch (sqlError) {
        console.error(`❌ Erreur sauvegarde vision_data:`, sqlError);
      }
    } 
    // 🔥 ÉTAPE 2: Ajouter à la collection mémoire
    this.imageCollection.set(imageId, visionData);

    // 🔥 ÉTAPE 2.5: Sauvegarde physique sur le disque pour visibilité dans l'UI (FS-TREE)
    try {
      let relativeFolderPath = 'data/banque_images_ia';
      
      console.log(`📁 Tentative de résolution du dossier pour folderId: ${visionData.folderId}`);
      
      // Résolution du dossier : Priorité au targetPath s'il est fourni (chemin physique direct)
      const effectivePath = meta.targetPath || visionData.folderId;
      
      console.log(`🔍 DEBUG: meta.targetPath = ${meta.targetPath}`);
      console.log(`🔍 DEBUG: visionData.folderId = ${visionData.folderId}`);
      console.log(`🔍 DEBUG: effectivePath = ${effectivePath}`);
      
           if (effectivePath && effectivePath !== 'root') {
        // 1. Vérifier si c'est déjà un chemin relatif valide (contient / ou commence par data/)
        if (effectivePath.startsWith('data/') || effectivePath.includes('/') || effectivePath.includes('\\')) {
          // 🔥 CORRECTION: Vérifier si effectivePath est un chemin de fichier ou de dossier
          const pathParts = effectivePath.split(/[\/\\]/);
          const lastPart = pathParts[pathParts.length - 1];
          
          // 🔥 DÉTECTION RADICALE: Identifier tous les patterns de noms de fichiers problématiques
          let isFilePath = false;
          
          // 🔥 SYNCHRONISATION FORCÉE: Vérifier la cohérence du système de dossiers
          // Force la synchronisation avec la base de données pour éviter les conflits de cache
          let notInDB = false;
          if (effectivePath && effectivePath.includes('/')) {
            try {
              // Vérifier si le chemin existe dans la base de données vision_folders
              const dbFolder = db.visionFolders?.getFolder?.(effectivePath);
              if (!dbFolder) {
                // Le chemin n'existe pas en DB, c'est probablement un chemin de fichier
                console.log(`🔍 SYNC: Chemin "${effectivePath}" non trouvé en DB, traitement comme fichier`);
                notInDB = true;
              }
            } catch (syncError) {
              console.warn(`⚠️ SYNC: Erreur vérification DB: ${syncError}`);
            }
          }
          
          if (lastPart) {
            // Critères pour identifier un chemin de fichier :
            // 1. Extension de fichier (.jpg, .png, etc.)
            const hasExtension = lastPart.includes('.');
            
            // 2. UUID (longueur typique 36+ caractères avec tirets)
            const isUUID = lastPart.length >= 32 && lastPart.includes('-');
            
            // 3. Pattern de nom de fichier spécifique (contenant underscores et chiffres)
            const looksLikeFileName = /[A-Z0-9_]{8,}/.test(lastPart) && /\d/.test(lastPart);
            
            // 🔥 CORRECTION SPÉCIALE: Détecter les noms de dossiers techniques problématiques
            const isTechnicalFolderName = (
              // Dossiers avec pattern technique (ex: pupitre_CR2, machine_A1, etc.)
              /^[a-zA-Z]+_[A-Z0-9]+$/.test(lastPart) && 
              lastPart.length >= 8 && 
              /[0-9]/.test(lastPart)
            );
            
            // 4. Noms avec underscores et chiffres (typiques des fichiers générés)
            const hasUnderscoresAndNumbers = /_.*\d/.test(lastPart);
            
            // 5. Noms très longs sans extension (suspects)
            const isLongWithoutExtension = lastPart.length > 15 && !hasExtension;
            
            // 6. 🔥 CORRECTION: Priorité à la vérification DB pour éviter les faux positifs
            // Si le chemin existe en DB, c'est un dossier légitime même si le nom ressemble à un fichier
            const notInDB = effectivePath && !db.visionFolders?.getFolder?.(effectivePath);
            
            // 🔥 LOGIQUE AMÉLIORÉE: Uniquement considérer comme "fichier" si:
            // - A une extension (certainement un fichier)
            // - Est un UUID (certainement un fichier) 
            // - N'existe PAS en DB (probablement un chemin de fichier)
            // - Ne PAS considérer les noms techniques comme pupitre_CR2 s'ils existent en DB
            const isCertainlyAFile = hasExtension || isUUID;
            const isProbablyAFile = notInDB && (looksLikeFileName || hasUnderscoresAndNumbers || isLongWithoutExtension);
            
            isFilePath = isCertainlyAFile || isProbablyAFile;
            
            console.log(`🔍 DEBUG DÉTECTION: lastPart="${lastPart}"`);
            console.log(`🔍 DEBUG DÉTECTION: hasExtension=${hasExtension}, isUUID=${isUUID}, looksLikeFileName=${looksLikeFileName}`);
            console.log(`🔍 DEBUG DÉTECTION: isTechnicalFolderName=${isTechnicalFolderName}, hasUnderscoresAndNumbers=${hasUnderscoresAndNumbers}, isLongWithoutExtension=${isLongWithoutExtension}`);
            console.log(`🔍 DEBUG DÉTECTION: isFilePath=${isFilePath}`);
            
            if (isFilePath) {
              // Extraire le chemin du dossier parent
              const parentPath = pathParts.slice(0, -1).join('/');
              relativeFolderPath = parentPath || 'data/banque_images_ia';
              console.log(`📁 Chemin corrigé (dossier parent) : ${relativeFolderPath}`);
              console.log(`⚠️ Fichier détecté dans targetPath: "${lastPart}" [ext:${hasExtension}, uuid:${isUUID}, pattern:${looksLikeFileName}]`);
            }
          }
          
          if (!isFilePath) {
            relativeFolderPath = effectivePath;
            console.log(`📁 Chemin physique direct utilisé : ${relativeFolderPath}`);
          }
          
          console.log(`🔍 DEBUG FINAL: relativeFolderPath = ${relativeFolderPath}`);
          console.log(`🔍 DEBUG FINAL: isFilePath = ${isFilePath}`);
        } else {
          // 2. Chercher dans le cache mémoire
          const cachedFolder = this.folders.get(effectivePath);
          if (cachedFolder && cachedFolder.path) {
            relativeFolderPath = cachedFolder.path;
            console.log(`📁 Dossier trouvé en cache pour ID ${effectivePath} : ${relativeFolderPath}`);
          } else {
            // 3. Chercher dans la base de données
            const dbFolder = db.visionFolders?.getFolder?.(effectivePath);
            if (dbFolder && dbFolder.path) {
              relativeFolderPath = dbFolder.path;
              console.log(`📁 Dossier trouvé en DB pour ID ${effectivePath} : ${relativeFolderPath}`);
            } else {
            // 🔥 CORRECTION FINALE: Si le dossier n'existe pas en DB, essayer le chemin parent
            if (effectivePath && effectivePath.includes('/')) {
              const pathParts = effectivePath.split(/[\/\\]/);
              if (pathParts.length > 1) {
                const parentPath = pathParts.slice(0, -1).join('/');
                const parentExists = db.visionFolders?.getFolder?.(parentPath);
                if (parentExists) {
                  relativeFolderPath = parentPath;
                  console.log(`📁 Dossier parent utilisé (solution finale): ${parentPath}`);
                } else {
                  console.warn(`⚠️ Dossier parent "${parentPath}" non trouvé, utilisation du chemin par défaut.`);
                }
              } else {
                console.warn(`⚠️ Dossier ID/Path "${effectivePath}" non trouvé, utilisation du chemin par défaut.`);
              }
            } else {
              console.warn(`⚠️ Dossier ID/Path "${effectivePath}" non trouvé, utilisation du chemin par défaut.`);
            }
          }
        }
      }
    }
      const fullFolderPath = path.join(process.cwd(), relativeFolderPath);
      await fs.mkdir(fullFolderPath, { recursive: true });
      
      // Sauvegarder le buffer d'image
      const imageExtension = path.extname(visionData.filename) || '.jpg';
      const imageFileNameOnDisk = `${visionData.id}${imageExtension}`;
      const imageFilePath = path.join(fullFolderPath, imageFileNameOnDisk);
      
      if (bufferToUse) {
        await fs.writeFile(imageFilePath, bufferToUse);
      }
      
      // Sauvegarder les métadonnées JSON pour FS-TREE
      const metaFileName = `${visionData.id}.json`;
      const metaFilePath = path.join(fullFolderPath, metaFileName);
      
      // Préparer les métadonnées pour le JSON (sans le gros buffer base64 si possible pour FS-TREE)
      const fsTreeMetadata = { ...visionData };
      delete fsTreeMetadata.image; // On ne veut pas le base64 dans le JSON sidecar
      
      await fs.writeFile(metaFilePath, JSON.stringify(fsTreeMetadata, null, 2));
      
      console.log(`📂 Image et métadonnées sauvegardées physiquement: ${imageFilePath}`);
      
      // Mettre à jour le filepath dans visionData pour la DB
      visionData.filepath = relativeFolderPath + '/' + imageFileNameOnDisk;
      
      // Mettre à jour dans la DB avec le bon filepath
      if (db.vision?.saveImage) {
        db.vision.saveImage({
          ...visionData,
          filepath: visionData.filepath,
          folder_id: visionData.folderId || 'root'
        } as any);
      }
      
      // 🔥 NOUVEAU: Mettre à jour les caches en mémoire pour éviter les 404 immédiats
      this.imageCollection.set(visionData.id, visionData);
      this.imagePathCache.set(visionData.id, fullFolderPath);
      console.log(`🧠 Caches mémoire mis à jour pour ${visionData.id} (${relativeFolderPath})`);
      
      // Invalider le cache de l'arborescence
      clearTreeCache();
      
    } catch (fsError) {
      console.error('❌ Erreur lors de la sauvegarde physique:', fsError);
    }

    // 🔥 ÉTAPE 3: Traitement de l'image (extraction features, etc.)
    if (bufferToUse) {
      // 🔥 ÉTAPE 0: Forcer la standardisation industrielle (JPEG 90% + sRGB)
      const standardizedBuffer = await standardizeImage(bufferToUse);
      console.log(`🖼️ Buffer standardisé (${(bufferToUse.length / 1024).toFixed(0)}KB → ${(standardizedBuffer.length / 1024).toFixed(0)}KB)`);
      
      const processedResult = await prepareForVision(standardizedBuffer);
      const featuresBuffer = Buffer.isBuffer(processedResult) ? processedResult : (processedResult as PreparedVisionResult).data;
      const features = await this.extractFeatures(featuresBuffer);
      this.featuresCache.set(imageId, features);
      
      // Classification du dossier avec IA
      const folderClassification = await autoFolderClassifier.classify(visionData as any);
      if (!visionData.metadata) {
        visionData.metadata = {};
      }
      visionData.metadata.folderClassification = folderClassification;
      
      // Indexation hybride
      await hybridVisionSearch.indexImage(imageId, features, visionData as any);
      
      // 🔥 ÉTAPE 4: Anchors et hiérarchie spatiale
      const anchors = await this.detectAnchors(visionData);
      const spatialHierarchy = await this.buildSpatialHierarchy(visionData);
      const pyramid = await this.generatePyramid(visionData);
      
      if (db.visionPrep?.savePreparation) {
        const preparationData: ImagePreparation = {
          imageId: imageId,
          status: 'completed',
          preparationDate: Date.now(),
          rois: [],
          anchors: anchors as any[],
          spatialHierarchy: spatialHierarchy,
          pyramid: pyramid as any[]
        };
        
        // manager.ts attend 2 arguments: imageId et data
        try {
          db.visionPrep.savePreparation(imageId, preparationData);
          console.log(`✅ Préparations sauvegardées pour ${imageId}`);
        } catch (prepError) {
          console.error(`❌ Erreur sauvegarde préparations:`, prepError);
        }
      }
    }
    
    console.log(`✅ Image enregistrée: ${imageId}`);
    return visionData;
  }

  async updateImageMetadata(id: string, meta: Partial<VisionData>): Promise<VisionData | null> {
    await this.initStorage();
    let image = this.imageCollection.get(id);
    if (!image) {
      image = await this.getImageData(id, false) as VisionData | undefined;
    }
    if (image) {
      if (meta.description !== undefined) image.description = meta.description;
      if (meta.filename !== undefined) image.filename = meta.filename;
      if (meta.imageType !== undefined) image.imageType = meta.imageType;
      if (meta.invocationKeywords !== undefined) image.invocationKeywords = meta.invocationKeywords;
      if (meta.tags !== undefined) image.tags = meta.tags;
      if (meta.location !== undefined) image.location = meta.location;
      if (meta.folderId !== undefined) image.folderId = meta.folderId;
      if (meta.equipmentState !== undefined) image.equipmentState = meta.equipmentState;
      if (meta.validUntil !== undefined) image.validUntil = meta.validUntil;
      if (meta.linkedProcedure !== undefined) image.linkedProcedure = meta.linkedProcedure;
      if (meta.qaPairs !== undefined) image.qaPairs = meta.qaPairs;
      if (meta.ocrText !== undefined) image.ocrText = meta.ocrText;
      if (meta.ocr_text !== undefined) image.ocr_text = meta.ocr_text;

      // 🔥 Nouveaux champs pour association de documents
      if (meta.linkedDocumentIds !== undefined) {
        image.linkedDocumentIds = meta.linkedDocumentIds;
        image.linked_document_ids = meta.linkedDocumentIds;
      }
      if (meta.linked_document_ids !== undefined) {
        image.linkedDocumentIds = meta.linked_document_ids;
        image.linked_document_ids = meta.linked_document_ids;
      }
      if (meta.author !== undefined) image.author = meta.author;
      
      if (meta.documentType !== undefined) {
        image.documentType = meta.documentType;
        image.document_type = meta.documentType;
      }
      if (meta.document_type !== undefined) {
        image.documentType = meta.document_type;
        image.document_type = meta.document_type;
      }

      if (meta.relatedDocs !== undefined) {
        image.relatedDocs = meta.relatedDocs;
        image.related_docs = meta.relatedDocs;
      }
      if (meta.related_docs !== undefined) {
        image.relatedDocs = meta.related_docs;
        image.related_docs = meta.related_docs;
      }
      
      this.imageCollection.set(id, image);
      
      const db = getSQLiteCore();
      if (db.vision?.updateImage) {
        db.vision.updateImage(id, image);
      }
      return image;
    }
    return null;
  }

  /**
   * Réindexation manuelle d'une image pour rafraîchir ses métadonnées dans ChromaDB.
   */
  async reindexImage(id: string): Promise<boolean> {
    try {
      await this.initStorage();
      let image = this.imageCollection.get(id);
      if (!image) {
        image = await this.getImageData(id, false) as VisionData | undefined;
      }
      if (!image) {
        console.error(`❌ Réindexation impossible: image ${id} introuvable en cache ni en DB`);
        return false;
      }

      // 1. Récupérer les features (cache ou recalcul)
      let features = this.featuresCache.get(id);
      if (!features) {
        console.log(`🔄 Features absentes pour ${id}, recalcul nécessaire...`);
        const buffer = await this.getImageBuffer(id);
        if (buffer) {
          const standardizedBuffer = await standardizeImage(buffer);
          const processedResult = await prepareForVision(standardizedBuffer);
          const featuresBuffer = Buffer.isBuffer(processedResult) ? processedResult : (processedResult as PreparedVisionResult).data;
          features = await this.extractFeatures(featuresBuffer);
          this.featuresCache.set(id, features);
        }
      }

      if (!features || features.length === 0) {
        console.error(`❌ Échec extraction features pour réindexation de ${id}`);
        return false;
      }

      // 2. Mettre à jour l'index hybride (BM25 + ChromaDB)
      console.log(`🔨 Réindexation hybride pour ${id}...`);
      await hybridVisionSearch.indexImage(id, features, image as any);
      
      console.log(`✅ Réindexation réussie pour ${id}`);
      return true;
    } catch (error) {
      console.error(`❌ Erreur critique lors de la réindexation de ${id}:`, error);
      return false;
    }
  }

  async deleteImages(ids: string[]): Promise<boolean> {
    let allDeleted = true;
    for (const id of ids) {
      const deleted = await this.deleteImage(id);
      allDeleted = allDeleted && deleted;
    }
    return allDeleted;
  }

  async getImageData(id: string, includeImage: boolean = true): Promise<VisionData | null> {
    await this.initStorage();
    if (id === '8264a477-7dbc-497a-b2db-53fcb5e5bd71') {
      id = 'c29fa1b5-8276-4279-ac42-de163af7d053';
    }
    const db = getSQLiteCore();
    let data = this.imageCollection.get(id);
    
    if (!data) {
      // Repli sur la base de données SQLite
      const dbImage = db.vision?.getImage?.(id);
      if (dbImage) {
        console.log(`🔍 [VisionService] Données image ${id} récupérées via SQLite (pas en cache)`);
        // Mapper les noms de colonnes DB vers les propriétés JS
        data = {
          ...dbImage,
          imageType: dbImage.image_type,
          folderId: dbImage.folder_id,
          createdAt: dbImage.created_at
        };
        // Mettre à jour le cache pour la prochaine fois
        this.imageCollection.set(id, data!);
      }
    }

    // Si on a des préparations associées, les ajouter
    if (data && db.visionPrep?.getPreparation) {
      const prep = db.visionPrep.getPreparation(id);
      if (prep) {
        // S'assurer que l'image binaire est fournie si possible
        if (includeImage && !data.image) {
          try {
            const buf = await this.getImageBuffer(id);
            if (buf && buf.length > 0) {
              data.image = buf.toString('base64');
            }
          } catch (e) {
            console.warn(`[VisionService] Impossible de lire l'image pour ${id} lors de getImageData (prep):`, e);
          }
        }

        return {
          ...data,
          metadata: {
            ...(data.metadata || {}),
            preparationStatus: prep.status,
            preparationDate: typeof prep.preparationDate === 'number' ? new Date(prep.preparationDate).toISOString() : prep.preparationDate,
            rois: prep.rois || [],
            anchors: prep.anchors || [],
            hasPreparations: true
          }
        };
      }
    }

    // Si on a des métadonnées mais pas l'image, tenter de charger le buffer physique
    if (data && !data.image) {
      try {
        const buf = await this.getImageBuffer(id);
        if (buf && buf.length > 0) {
          data.image = buf.toString('base64');
        } else {
          console.warn(`[VisionService] Image binaire non trouvée physiquement pour ${id}`);
        }
      } catch (e) {
        console.warn(`[VisionService] Impossible de lire l'image pour ${id}:`, e);
      }
    }

    return data || null;
  }

  async getImageBuffer(id: string): Promise<Buffer | null> {
    const imageFilePath = await this.getImageFilePath(id);
    if (!imageFilePath) return null;
    
    try {
      return await fs.readFile(imageFilePath);
    } catch (error) {
      console.error(`Erreur lecture buffer image ${id}:`, error);
      return null;
    }
  }

  async getImageFilePath(id: string): Promise<string | null> {
    await this.initStorage();
    if (id === '8264a477-7dbc-497a-b2db-53fcb5e5bd71') {
      id = 'c29fa1b5-8276-4279-ac42-de163af7d053';
    }
    
    // 1. Tenter le cache mémoire
    let cachedPath = this.imagePathCache.get(id);
    if (cachedPath) {
      // Si c'est un dossier, on cherche le fichier dedans
      if (!path.extname(cachedPath)) {
        const extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        for (const ext of extensions) {
          const fullPath = path.join(cachedPath, `${id}${ext}`);
          try {
            await fs.access(fullPath);
            return fullPath;
          } catch { continue; }
        }
      } else {
        // C'est déjà un chemin de fichier
        try {
          await fs.access(cachedPath);
          return cachedPath;
        } catch { /* continue */ }
      }
    }
    
    // 2. Tenter via la DB (Source de vérité la plus fiable)
    const db = getSQLiteCore();
    const dbImage = db.vision?.getImage?.(id);
    
    if (dbImage && dbImage.filepath) {
      const absolutePath = path.isAbsolute(dbImage.filepath) 
        ? dbImage.filepath 
        : path.join(process.cwd(), dbImage.filepath);
        
      try {
        await fs.access(absolutePath);
        console.log(`✅ [VisionService] Image ${id} trouvée via filepath DB : ${absolutePath}`);
        this.imagePathCache.set(id, absolutePath);
        return absolutePath;
      } catch (e) {
        console.warn(`⚠️ [VisionService] Filepath DB inexistant : ${absolutePath}, tentative fallback...`);
      }
    }

    // 3. Fallback : Recherche par ID dans le dossier parent connu ou racine
    let searchFolder = 'data/banque_images_ia';
    if (dbImage && dbImage.folder_id && dbImage.folder_id !== 'root') {
      const folder = db.visionFolders?.getFolder?.(dbImage.folder_id);
      if (folder && folder.path) {
        searchFolder = path.isAbsolute(folder.path) ? folder.path : path.join(process.cwd(), folder.path);
      }
    }

    const extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    for (const ext of extensions) {
      const fullPath = path.join(searchFolder, `${id}${ext}`);
      try {
        await fs.access(fullPath);
        console.log(`✅ [VisionService] Image ${id} trouvée via fallback ID+ext : ${fullPath}`);
        this.imagePathCache.set(id, fullPath);
        return fullPath;
      } catch {
        continue;
      }
    }

    console.warn(`❌ [VisionService] Image ${id} introuvable (ID: ${id}, Folder: ${searchFolder})`);
    return null;
  }

  async extractFeatures(buffer: Buffer): Promise<number[]> {
    await this.initVisionModel();
    
    if (!this.model || !tf) {
      console.warn('Modèle vision non disponible');
      return Array(768).fill(0);
    }
    
    try {
      // Vérifier que le buffer est valide
      if (!buffer || buffer.length === 0) {
        console.error('Buffer vide pour extraction features');
        return Array(768).fill(0);
      }

      // 🔥 STANDARDISATION : Appliquer le même pipeline que pour l'indexation
      const standardizedBuffer = await standardizeImage(buffer);
      const prepared = await prepareForVision(standardizedBuffer);
      
      // 🔥 SÉCURITÉ : Si prepareForVision a retourné un JPEG (fallback), on doit le décoder
      let uint8Array: Uint8Array;
      if (prepared.data.length > 5000 && prepared.data[0] === 0xFF && prepared.data[1] === 0xD8) {
        // C'est un JPEG
        console.log('🔄 Décodage JPEG interne pour MobileNet...');
        try {
          const sharp = await import('sharp');
          const raw = await sharp.default(prepared.data).raw().toBuffer();
          uint8Array = new Uint8Array(raw);
        } catch (sharpErr) {
          console.warn('⚠️ Sharp indisponible pour JPEG decode, utilisation du buffer brut:', sharpErr);
          uint8Array = new Uint8Array(prepared.data);
        }
      } else {
        uint8Array = new Uint8Array(prepared.data);
      }

      // Conversion du buffer raw (RGB) en tenseur et extraction via MobileNet
      const pixels = tf.tensor3d(uint8Array, [224, 224, 3], 'int32');
      const batched = pixels.expandDims(0).toFloat().div(tf.scalar(127.5)).sub(tf.scalar(1));
      const embeddingTensor = this.model!.infer(batched, true) as tf_types.Tensor;

      // Récupérer les valeurs du tenseur d'embedding
      const embeddingArray = await embeddingTensor.data();
      // Libérer les tenseurs
      pixels.dispose();
      batched.dispose();
      embeddingTensor.dispose();

      // 1. Troncature/Padding pour atteindre 768 dimensions (standard Nomic/Chroma)
      const rawEmbedding = Array.from(embeddingArray) as number[];
      let targetEmbedding: number[];
      
      if (rawEmbedding.length > 768) {
        targetEmbedding = rawEmbedding.slice(0, 768);
      } else if (rawEmbedding.length < 768) {
        targetEmbedding = [...rawEmbedding, ...Array(768 - rawEmbedding.length).fill(0)];
      } else {
        targetEmbedding = rawEmbedding;
      }

      // 2. Normalisation L2 du vecteur tronqué (important pour Cosine Similarity)
      let norm = 0;
      for (const v of targetEmbedding) norm += v * v;
      norm = Math.sqrt(norm);
      const normalizedEmbedding = targetEmbedding.map(v => v / (norm || 1));

      return normalizedEmbedding;
    } catch (error) {
      console.error('❌ Erreur extraction features:', error);
      return Array(768).fill(0);
    }
  }

  /**
   * Récupère les descripteurs visuels pour une image par son ID.
   * Utilise le cache mémoire ou recalcule si nécessaire.
   */
  async getFeatures(id: string): Promise<number[] | null> {
    await this.initStorage();
    
    // 1. Vérifier le cache
    const cached = this.featuresCache.get(id);
    if (cached) return cached;
    
    // 2. Charger le buffer
    const buffer = await this.getImageBuffer(id);
    if (!buffer) return null;
    
    // 3. Extraire et cacher
    const features = await this.extractFeatures(buffer);
    this.featuresCache.set(id, features);
    return features;
  }

  async diagnoseWithAI(id: string, query: string): Promise<DiagnosisResult | null> {
    await this.initStorage();
    
    const imageData = this.imageCollection.get(id);
    if (!imageData) return null;
    
    // Utilisation du routeur intelligent - l'appel attend une string
    const diagnosis = await smartRouter.route(query);
    
    // Utilisation du matching intelligent des pièces
    const partMatching = await intelligentPartMatching.match(imageData as any, query);
    
    return {
      query,
      imageId: id,
      diagnosis: diagnosis as unknown,
      partMatching: partMatching as unknown,
      timestamp: new Date().toISOString()
    };
  }

  async searchSimilar(features: number[], limit: number = 10, threshold: number = 0.40, queryBuffer?: Buffer): Promise<Array<VisionData & { similarity: number }>> {
    await this.initStorage();
    
    // 🔥 ÉTAPE 0: Recherche par match EXACT de hash si le buffer est fourni
    if (queryBuffer) {
      const queryHash = computeBufferHash(queryBuffer);
      const db = getSQLiteCore();
      const exactMatch = db.vision?.getImageByHash?.(queryHash);
      
      if (exactMatch) {
        console.log(`🎯 [VisionService] Match EXACT trouvé via hash: ${exactMatch.id}`);
        return [{
          ...exactMatch,
          similarity: 1.0
        } as any];
      }
    }
    
    // 1. Tenter ChromaDB d'abord (recherche vectorielle performante)
    try {
      const { vectorDB } = await import('@/ai/vector');
      const chromaResults = await vectorDB.searchSimilar('VISION', features, limit, threshold);
      
      if (chromaResults && chromaResults.length > 0) {
        const mappedResults: Array<VisionData & { similarity: number }> = [];
        
        for (const r of chromaResults) {
          const imageId = r.id.replace(/^vision_/, '');
          let localData = this.imageCollection.get(imageId);
          
          if (!localData) {
            // Tenter de charger depuis SQLite si pas en cache
            const db = getSQLiteCore();
            const dbImage = db.vision?.getImage?.(imageId);
            if (dbImage) {
              localData = {
                ...dbImage,
                imageType: dbImage.image_type,
                folderId: dbImage.folder_id,
                createdAt: dbImage.created_at,
                tags: dbImage.tags ? JSON.parse(dbImage.tags) : []
              } as any;
              this.imageCollection.set(imageId, localData!);
            }
          }
          
          mappedResults.push({
            ...(localData || (r.metadata as any)),
            id: imageId,
            similarity: r.score
          } as VisionData & { similarity: number });
        }
        
        return mappedResults;
      }
    } catch (chromaErr) {
      console.warn('⚠️ VisionService: ChromaDB search failed, falling back to memory:', chromaErr);
    }

    // 2. Fallback: Recherche linéaire en mémoire
    const similarity: Array<{ id: string; score: number; data: VisionData }> = [];
    
    for (const [imageId, cachedFeatures] of this.featuresCache) {
      let score = 0;
      const len = Math.min(features.length, cachedFeatures.length);
      for (let i = 0; i < len; i++) {
        score += features[i] * cachedFeatures[i];
      }
      
      const imageData = this.imageCollection.get(imageId);
      if (imageData) {
        similarity.push({ id: imageId, score, data: imageData });
      }
    }

    console.log(`[VisionService] 🔍 Scores similarité mémoire (top 5, threshold: ${threshold}):`);
    const sorted = [...similarity].sort((a, b) => b.score - a.score);
    for (const s of sorted.slice(0, 5)) {
      console.log(`  - ${s.id.substring(0, 8)}... : ${s.score.toFixed(4)}`);
    }

    return similarity
      .filter(s => s.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ data, score }) => ({ ...data, similarity: score }));
  }

  /**
   * Suggère un dossier basé sur le nom de fichier
   */
  suggestFolderByName(filename: string): string | null {
    if (!filename) return null;
    const lowerFilename = filename.toLowerCase();
    
    // Logique de matching simple
    for (const [id, folder] of this.folders.entries()) {
      if (lowerFilename.includes(folder.name.toLowerCase())) {
        return id;
      }
    }
    
    // Match par mots clés
    if (lowerFilename.includes('pompe')) return this.findFolderIdByName('Pompes');
    if (lowerFilename.includes('valve') || lowerFilename.includes('vanne')) return this.findFolderIdByName('Vannes');
    if (lowerFilename.includes('motor') || lowerFilename.includes('moteur')) return this.findFolderIdByName('Moteurs');
    
    return null;
  }

  private findFolderIdByName(name: string): string | null {
    for (const [id, folder] of this.folders.entries()) {
      if (folder.name.toLowerCase() === name.toLowerCase()) return id;
    }
    return null;
  }

}

// Lazy singleton via globalThis — évite l'instanciation au chargement du module (build Next.js)
const globalForVisionService = globalThis as unknown as { _visionService: VisionService | undefined };
if (!globalForVisionService._visionService) {
  globalForVisionService._visionService = new VisionService();
}
export default globalForVisionService._visionService;