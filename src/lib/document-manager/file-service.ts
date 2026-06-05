// src/lib/document-manager/file-service.ts
/**
 * @fileOverview Service de gestion de fichiers avancé - Version zones.
 * Gère l'arborescence dynamique basée sur le contenu réel de DOCUMENTS_ROOT.
 * CORRIGÉ : Filtrage des fichiers générés par compression pour éviter les boucles infinies.
 */

import fs from 'fs/promises';
import path from 'path';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import { 
  DOCUMENTS_ROOT, 
  WATCHER_CONFIG,
  INDEXING_CONFIG,
  type FileNode,
  getFileTypeConfig,
  isFileSupported,
  generateDocumentId
} from './config';
import { DocumentProcessor } from './document-processor';
import { ZONES_CONFIG, type ZoneType } from '@/ai/vector/chromadb-schema';

// Liste des zones connues (pour information)
const ZONE_FOLDERS = Object.keys(ZONES_CONFIG) as ZoneType[];

// Sous-dossiers standards par zone
const SUBFOLDERS = [
  'equipements',
  'alarmes',
  'alarmes_techniques',
  'alarmes_hmi',
  'procedures',
  'images',
  'synoptiques',
  'composants',
  'documents_bruts'
];

// ============================================================================
// INTERFACES ET TYPES
// ============================================================================

interface SyncQueueItem {
  type: 'add' | 'change' | 'unlink';
  path: string;
  timestamp: number;
  retryCount: number;
}

interface ProcessingStats {
  totalProcessed: number;
  successful: number;
  failed: number;
  lastProcessedAt: Date | null;
  averageProcessingTime: number;
}

// ============================================================================
// SERVICE PRINCIPAL
// ============================================================================

export class FileSystemService extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private syncQueue: Map<string, SyncQueueItem> = new Map();
  private isProcessing = false;
  private isSuspended = false;
  private stats: ProcessingStats = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    lastProcessedAt: null,
    averageProcessingTime: 0
  };
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private processingLock: Set<string> = new Set();
  private queueInterval: NodeJS.Timeout | null = null;
  private treeCache: FileNode[] | null = null;
  private isScanningTree = false;
  private cacheRefreshTimer: NodeJS.Timeout | null = null;
  private readonly TREE_CACHE_FILE = path.join(DOCUMENTS_ROOT, '.tree-cache.json');
  private lastRootMtime: number = 0;

  constructor() {
    super();
    this.init();
  }

  // ============================================================================
  // INITIALISATION
  // ============================================================================

  private async init(): Promise<void> {
    try {
      console.log('[FILE-SYSTEM] Initialisation du service (version zones)...');
      await this.initializeDirectories();
      await this.setupWatcher();
      this.startQueueProcessor();
      console.log('[FILE-SYSTEM] Service initialisé avec succès');
      this.emit('ready');
    } catch (error) {
      console.error('[FILE-SYSTEM] Erreur initialisation:', error);
      this.emit('error', error);
    }
  }

  private async initializeDirectories(): Promise<void> {
    await this.ensureDirectory(DOCUMENTS_ROOT);
    console.log(`[FILE-SYSTEM] Dossier racine initialisé: ${DOCUMENTS_ROOT}`);
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
      console.log(`[FILE-SYSTEM] Dossier créé: ${path.relative(DOCUMENTS_ROOT, dirPath)}`);
    }
  }

  // ============================================================================
  // SURVEILLANCE DE FICHIERS
  // ============================================================================

  private async setupWatcher(): Promise<void> {
    if (typeof window !== 'undefined') return;

    const { enabled, persistent, ignoreInitial, awaitWriteFinish, ignored, debounceDelay } = WATCHER_CONFIG;
    if (!enabled) {
      console.log('[FILE-SYSTEM] Surveillance désactivée');
      return;
    }

    // ✅ AJOUT : Ignorer les fichiers contenant '_compressed' dans leur nom
    const ignoreCompressed = (filePath: string) => {
      return path.basename(filePath).includes('_compressed');
    };

    this.watcher = chokidar.watch(DOCUMENTS_ROOT, {
      persistent,
      ignoreInitial,
      awaitWriteFinish,
      ignored: [
        ...ignored,
        /(^|[\/\\])\..*/,
        ignoreCompressed  // ✅ Ignorer les fichiers compressés
      ]
    });

    this.watcher
      .on('add', (filePath) => {
        this.debounceSync(filePath, 'add', debounceDelay);
        this.requestCacheRefresh();
      })
      .on('change', (filePath) => {
        this.debounceSync(filePath, 'change', debounceDelay);
        this.requestCacheRefresh();
      })
      .on('unlink', (filePath) => {
        this.debounceSync(filePath, 'unlink', debounceDelay);
        this.requestCacheRefresh();
      })
      .on('addDir', () => this.requestCacheRefresh())
      .on('unlinkDir', () => this.requestCacheRefresh())
      .on('error', (error) => {
        console.error('[FILE-SYSTEM] Erreur watcher:', error);
        this.emit('watcher-error', error);
      });

    // Scan initial asynchrone pour peupler le cache
    this.loadPersistentCache().then(() => {
      this.requestCacheRefresh(500);
    });

    console.log('[FILE-SYSTEM] Watcher configuré et cache initialisé');
  }

  private async loadPersistentCache(): Promise<void> {
    try {
      const data = await fs.readFile(this.TREE_CACHE_FILE, 'utf-8');
      this.treeCache = JSON.parse(data);
      console.log('[FILE-SYSTEM] Cache persistant chargé');
    } catch {
      // Pas de cache ou erreur, tant pis
    }
  }

  private async savePersistentCache(): Promise<void> {
    try {
      if (!this.treeCache) return;
      await fs.writeFile(this.TREE_CACHE_FILE, JSON.stringify(this.treeCache), 'utf-8');
    } catch (error) {
      console.error('[FILE-SYSTEM] Échec sauvegarde cache:', error);
    }
  }

  private debounceSync(filePath: string, type: 'add' | 'change' | 'unlink', delay: number): void {
    const key = `${filePath}_${type}`;
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    
    const timer = setTimeout(() => {
      this.queueSync(filePath, type);
      this.debounceTimers.delete(key);
    }, delay);
    this.debounceTimers.set(key, timer);
  }

  private queueSync(filePath: string, type: 'add' | 'change' | 'unlink'): void {
    if (this.isSuspended) {
      console.log(`[FILE-SYSTEM] Événement ignoré (service suspendu): ${path.basename(filePath)}`);
      return;
    }

    // ✅ AJOUT : Ignorer explicitement les fichiers générés par compression
    if (path.basename(filePath).includes('_compressed')) {
      console.log(`[FILE-SYSTEM] ⏭️ Fichier compressé ignoré: ${path.basename(filePath)}`);
      return;
    }
    
    if (type !== 'unlink' && !isFileSupported(filePath)) {
      console.log(`[FILE-SYSTEM] Fichier non supporté ignoré: ${path.basename(filePath)}`);
      return;
    }
    this.syncQueue.set(filePath, { type, path: filePath, timestamp: Date.now(), retryCount: 0 });
    this.emit('file-changed', { path: filePath, type });
    console.log(`[FILE-SYSTEM] Fichier mis en file: ${path.basename(filePath)} (${type})`);
  }

  // ============================================================================
  // TRAITEMENT DE LA FILE D'ATTENTE
  // ============================================================================

  private startQueueProcessor(): void {
    if (this.queueInterval) clearInterval(this.queueInterval);
    this.queueInterval = setInterval(async () => {
      await this.processQueue();
    }, 1000);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.syncQueue.size === 0) return;
    this.isProcessing = true;
    const entries = Array.from(this.syncQueue.entries());
    this.syncQueue.clear();
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toProcess = entries.filter(([p]) => !this.processingLock.has(p));
    const batches = this.createBatches(toProcess);
    for (const batch of batches) {
      await this.processBatch(batch);
    }
    const locked = entries.filter(([p]) => this.processingLock.has(p));
    for (const [p, item] of locked) {
      this.syncQueue.set(p, item);
    }
    this.isProcessing = false;
  }

  private createBatches(entries: Array<[string, SyncQueueItem]>): Array<Array<[string, SyncQueueItem]>> {
    const batches = [];
    const batchSize = INDEXING_CONFIG.concurrentUploads;
    for (let i = 0; i < entries.length; i += batchSize) {
      batches.push(entries.slice(i, i + batchSize));
    }
    return batches;
  }

  private async processBatch(batch: Array<[string, SyncQueueItem]>): Promise<void> {
    const promises = batch.map(async ([filePath, { type }]) => {
      this.processingLock.add(filePath);
      const startTime = Date.now();
      try {
        if (type === 'unlink') {
          await this.handleDeletion(filePath);
        } else {
          await this.handleFileChange(filePath);
        }
        this.updateStats(true, Date.now() - startTime);
      } catch (error: any) {
        console.error(`[SYNC] Échec pour ${filePath}:`, error.message);
        this.updateStats(false);
        const item = batch.find(([p]) => p === filePath)?.[1];
        if (item && item.retryCount < INDEXING_CONFIG.retryAttempts) {
          item.retryCount++;
          item.timestamp = Date.now() + (INDEXING_CONFIG.retryDelay * Math.pow(2, item.retryCount));
          this.syncQueue.set(filePath, item);
        }
        this.emit('sync-error', { path: filePath, error: error.message });
      } finally {
        this.processingLock.delete(filePath);
      }
    });
    await Promise.allSettled(promises);
  }

  // ============================================================================
  // TRAITEMENT DES FICHIERS (utilisent des chemins absolus en interne)
  // ============================================================================

  private async handleFileChange(filePath: string): Promise<void> {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) return;

    const fileName = path.basename(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const fileSize = stats.size;
    
    console.log(`[SYNC] Traitement: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    this.emit('sync-start', { path: filePath, stage: 'DÉTECTION', fileName, fileSize, extension });

    const fileConfig = getFileTypeConfig(extension);
    if (fileConfig && fileSize > fileConfig.maxSize) {
      throw new Error(`Fichier trop volumineux: ${(fileSize / 1024 / 1024).toFixed(2)}MB > ${(fileConfig.maxSize / 1024 / 1024).toFixed(0)}MB`);
    }

    const zone = this.getZoneFromPath(filePath);
    const documentType = this.inferDocumentTypeFromPath(filePath);
    
    this.emit('sync-start', { path: filePath, stage: 'EXTRACTION', zone });

    const processor = new DocumentProcessor((stage, percent, detail) => {
      this.emit('processing-progress', { path: filePath, stage, percent, detail });
    });

    const result = await processor.processDocument(filePath, { zone, documentType });
    
    this.emit('sync-complete', { 
      path: filePath, 
      success: true, 
      chunks: result.chunksCount,
      processingTime: result.processingTime,
      collection: result.collection,
      message: `Document traité: ${result.chunksCount} chunks indexés en ${(result.processingTime / 1000).toFixed(1)}s`
    });
    
    console.log(`[SYNC] ✅ Traitement réussi: ${fileName} (${result.chunksCount} chunks, ${result.processingTime}ms)`);
  }

  private async handleDeletion(filePath: string): Promise<void> {
    const documentId = generateDocumentId(filePath);
    const zone = this.getZoneFromPath(filePath);
    const appUrl = process.env.APP_URL || 'http://127.0.0.1:3000';
    
    try {
      console.log(`[SYNC] Suppression: ${path.basename(filePath)} (zone: ${zone})`);
      const response = await this.fetchWithRetry(
        `${appUrl}/api/documents/delete`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId, filePath, zone })
        }
      );
      if (response.ok) {
        this.emit('sync-complete', { path: filePath, type: 'unlink', success: true, message: 'Document supprimé' });
        console.log(`[SYNC] ✅ Suppression réussie: ${path.basename(filePath)}`);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error(`[SYNC] ❌ Échec suppression:`, error);
      throw error;
    }
  }

  // ============================================================================
  // GESTION DE L'ARBORESCENCE (RETOURNE DES CHEMINS RELATIFS) – CORRIGÉE
  // ============================================================================

  // ============================================================================
  // GESTION DE L'ARBORESCENCE AVEC CACHE
  // ============================================================================

  /**
   * Retourne l'arborescence des fichiers.
   * Utilise un cache mémoire pour des performances maximales.
   */
  async getTree(refresh: boolean = false): Promise<FileNode[]> {
    // Si on a un cache et qu'on ne force pas le refresh, on le renvoie immédiatement
    if (!refresh && this.treeCache && !this.isScanningTree) {
      console.log('[FILE-SYSTEM] Arborescence servie via cache');
      return this.treeCache;
    }

    // Sinon, on reconstruit le cache (si pas déjà en cours)
    if (!this.isScanningTree) {
      await this.refreshTree(refresh);
    } else if (!this.treeCache) {
      // Si un scan est en cours mais qu'on n'a pas encore de cache du tout, on attend un peu
      await new Promise(resolve => setTimeout(resolve, 500));
      return this.treeCache || [];
    }

    return this.treeCache || [];
  }

  /**
   * Déclenche une mise à jour du cache avec un délai (pour grouper les changements)
   */
  private requestCacheRefresh(delay: number = 2000): void {
    if (this.cacheRefreshTimer) clearTimeout(this.cacheRefreshTimer);
    
    this.cacheRefreshTimer = setTimeout(async () => {
      if (!this.isScanningTree) {
        await this.refreshTree();
      }
      this.cacheRefreshTimer = null;
    }, delay);
  }

  /**
   * Reconstruit réellement le cache de l'arborescence
   */
  private async refreshTree(force: boolean = false): Promise<void> {
    if (this.isScanningTree) return;
    
    try {
      const rootStats = await fs.stat(DOCUMENTS_ROOT);
      if (!force && this.treeCache && rootStats.mtimeMs <= this.lastRootMtime && !this.isScanningTree) {
        return; // Pas de changement au niveau racine
      }
      this.lastRootMtime = rootStats.mtimeMs;
    } catch (e) {}

    this.isScanningTree = true;
    const startTime = Date.now();
    
    try {
      console.log('[FILE-SYSTEM] 🔄 Reconstruction du cache de l\'arborescence...');
      const entries = await fs.readdir(DOCUMENTS_ROOT, { withFileTypes: true });
      
      // Trier les entrées pour avoir les dossiers en premier
      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      // Limiter la parallélisation au premier niveau pour éviter d'étouffer le système
      const nodes = await Promise.all(
        entries
          .filter(entry => !entry.name.startsWith('.'))
          .map(async (entry) => {
            const fullPath = path.join(DOCUMENTS_ROOT, entry.name);
            const node = await this.buildNode(
              fullPath, 
              entry.name, 
              entry.isDirectory() ? 'directory' : 'file',
              0
            );
            if (ZONE_FOLDERS.includes(entry.name as ZoneType)) {
              node.collection = entry.name;
            }
            return node;
          })
      );

      this.treeCache = nodes.filter(n => n !== null);
      console.log(`[FILE-SYSTEM] ✅ Cache reconstruit en ${Date.now() - startTime}ms`);
      this.savePersistentCache();
      this.emit('tree-updated', this.treeCache);
      
    } catch (error) {
      console.error('[FILE-SYSTEM] Échec reconstruction cache:', error);
    } finally {
      this.isScanningTree = false;
    }
  }

  private async buildNode(
    fullPath: string, 
    name: string, 
    type: 'file' | 'directory',
    depth: number = 0
  ): Promise<FileNode> {
    const isDirectory = type === 'directory';
    
    // Pour les fichiers, on fait un stat pour avoir la taille et la date
    // Pour les dossiers, on ne fait le stat que si nécessaire ou au premier niveau
    let stats: any = null;
    if (!isDirectory || depth === 0) {
      try {
        stats = await fs.stat(fullPath);
      } catch (e) {
        // Le fichier a pu être supprimé entre temps
        return { name, path: name, type, collection: '' };
      }
    }

    const relativePath = path.relative(DOCUMENTS_ROOT, fullPath).replace(/\\/g, '/') || name;
    
    const node: FileNode = {
      name,
      path: relativePath,
      type,
      modifiedAt: stats?.mtime || new Date(),
      createdAt: stats?.birthtime || new Date(),
      size: stats?.size || 0,
      collection: ''
    };
    
    if (isDirectory && depth < 10) { // Réduit la profondeur par défaut pour la performance
      try {
        const children = await fs.readdir(fullPath, { withFileTypes: true });
        
        // Traitement séquentiel par petits lots pour les enfants pour éviter l'explosion de descripteurs de fichiers
        const childrenNodes: FileNode[] = [];
        
        // Filtrer et trier
        const filteredChildren = children
          .filter(c => !c.name.startsWith('.'))
          .sort((a, b) => {
            if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

        // Parcourir les enfants
        for (const child of filteredChildren) {
          const childPath = path.join(fullPath, child.name);
          const childNode = await this.buildNode(
            childPath, 
            child.name, 
            child.isDirectory() ? 'directory' : 'file', 
            depth + 1
          );
          childrenNodes.push(childNode);
        }

        node.children = childrenNodes;
      } catch (error) {
        node.children = [];
        node.error = String(error);
        node.syncStatus = 'error';
      }
    }
    
    return node;
  }

  // ============================================================================
  // OPÉRATIONS SUR LES FICHIERS (chemins absolus pour fs)
  // ============================================================================

  async renameItem(oldPath: string, newName: string): Promise<string> {
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName);
    await fs.rename(oldPath, newPath);
    this.queueSync(oldPath, 'unlink');
    this.queueSync(newPath, 'add');
    return newPath;
  }

  async createDirectory(parentPath: string, name: string): Promise<string> {
    if (!name || /[<>:"/\\|?*]/.test(name)) {
      throw new Error("Nom de dossier invalide");
    }
    const newPath = path.join(parentPath, name);
    await fs.mkdir(newPath, { recursive: true });
    return newPath;
  }

  async deleteFile(filePath: string): Promise<void> {
    await fs.unlink(filePath);
    this.queueSync(filePath, 'unlink');
  }

  async deleteDirectory(dirPath: string, recursive: boolean = false): Promise<void> {
    if (recursive) {
      await fs.rm(dirPath, { recursive: true, force: true });
    } else {
      await fs.rmdir(dirPath);
    }
  }

  // ============================================================================
  // UTILITAIRES
  // ============================================================================

  private fetchWithRetry(
    url: string, 
    options: RequestInit, 
    retries: number = INDEXING_CONFIG.retryAttempts,
    delayMs: number = INDEXING_CONFIG.retryDelay
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), INDEXING_CONFIG.timeout);
    
    const attempt = (remaining: number): Promise<Response> => {
      return fetch(url, { ...options, signal: controller.signal })
        .catch(async (err) => {
          if (remaining <= 1) throw err;
          await new Promise(resolve => setTimeout(resolve, delayMs));
          return attempt(remaining - 1);
        });
    };
    
    return attempt(retries).finally(() => clearTimeout(timeoutId));
  }

  private getZoneFromPath(filePath: string): ZoneType {
    const relative = path.relative(DOCUMENTS_ROOT, filePath);
    const firstSegment = relative.split(path.sep)[0];
    if (ZONE_FOLDERS.includes(firstSegment as ZoneType)) {
      return firstSegment as ZoneType;
    }
    console.warn(`[FILE-SYSTEM] Zone non détectée pour ${filePath}, utilisation SHARED`);
    return 'SHARED';
  }

  private inferDocumentTypeFromPath(filePath: string): string {
    const relative = path.relative(DOCUMENTS_ROOT, filePath);
    const parts = relative.split(path.sep);
    if (parts.length >= 2) {
      const subfolder = parts[1];
      if (SUBFOLDERS.includes(subfolder)) {
        if (subfolder === 'equipements') return 'equipement';
        if (subfolder === 'alarmes') return 'alarme_hmi';
        if (subfolder === 'alarmes_techniques') return 'alarme_technique';
        if (subfolder === 'procedures') return 'procedure';
        if (subfolder === 'images') return 'image';
        if (subfolder === 'synoptiques') return 'synoptique';
        if (subfolder === 'composants') return 'composant';
        if (subfolder === 'documents_bruts') return 'document_brut';
        return subfolder.slice(0, -1);
      }
    }
    return 'document_brut';
  }

  private updateStats(success: boolean, processingTime?: number): void {
    this.stats.totalProcessed++;
    if (success) {
      this.stats.successful++;
      if (processingTime) {
        this.stats.averageProcessingTime = 
          (this.stats.averageProcessingTime * (this.stats.successful - 1) + processingTime) / this.stats.successful;
      }
    } else {
      this.stats.failed++;
    }
    this.stats.lastProcessedAt = new Date();
  }

  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  async clearQueue(): Promise<void> {
    this.syncQueue.clear();
    this.processingLock.clear();
  }

  async rescanAll(): Promise<void> {
    console.log('[FILE-SYSTEM] Rescan complet déclenché');
    const files = await this.getAllFiles();
    for (const file of files) {
      this.queueSync(file, 'add');
    }
  }

  private async getAllFiles(): Promise<string[]> {
    const files: string[] = [];
    async function scan(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (isFileSupported(fullPath)) {
          files.push(fullPath);
        }
      }
    }
    await scan(DOCUMENTS_ROOT);
    return files;
  }

  async stop(): Promise<void> {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    
    if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
    }
    
    console.log('[FILE-SYSTEM] Service arrêté proprement');
  }

  suspend(): void {
    this.isSuspended = true;
    console.log('[FILE-SYSTEM] Service suspendu temporairement');
  }

  resume(): void {
    this.isSuspended = false;
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    this.syncQueue.clear();
    console.log('[FILE-SYSTEM] Service réactivé');
  }

  /**
   * Vide complètement le cache d'arborescence (mémoire + disque)
   * Utilisé lors du reset système pour forcer le rechargement depuis le FS
   */
  clearCache(): void {
    this.treeCache = null;
    this.lastRootMtime = 0;
    console.log('[FILE-SYSTEM] Cache d\'arborescence vidé');
  }
}

// SINGLETON AVEC SUPPORT HOT RELOAD (NEXT.JS)
// ============================================================================

const globalForFileService = global as unknown as { fileService: FileSystemService };

export const fileService = globalForFileService.fileService || new FileSystemService();

if (process.env.NODE_ENV !== 'production') {
  globalForFileService.fileService = fileService;
}

export type { ProcessingStats };