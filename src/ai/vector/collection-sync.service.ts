// src/ai/vector/collection-sync.service.ts
// Service de synchronisation des 13 collections ChromaDB
// VERSION CORRIGÉE - Ajout du paramètre zone pour collectionExists

import { ChromaDBManager } from './chromadb-manager';
import { CollectionName, ChromaCollections } from './chromadb-schema';
import { logger } from '@/lib/logger';
import { fileService } from '@/lib/document-manager/file-service';
import { DocumentProcessor } from '@/lib/document-manager/document-processor';
import path from 'path';
import fs from 'fs/promises';

// ============================================================================
// CONFIGURATION
// ============================================================================

const AUTO_SYNC_ENABLED = false;
const FILE_WATCHER_ENABLED = false;
const POST_INIT_SYNC_ENABLED = false;

const MIN_SYNC_INTERVAL_MS = 60000;
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const DEBOUNCE_DELAY_MS = 5000;

// Zone par défaut pour les collections
const DEFAULT_ZONE = 'SHARED';

// ============================================================================
// TYPES
// ============================================================================

export interface SyncStatus {
  collection: string;
  displayName: string;
  status: 'idle' | 'syncing' | 'success' | 'error';
  documentCount: number;
  lastSync: Date | null;
  error?: string;
}

// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

export class CollectionSyncService {
  private static instance: CollectionSyncService;
  private chromaManager: ChromaDBManager;
  private documentProcessor: DocumentProcessor;
  private syncStatus: Map<string, SyncStatus> = new Map();
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private syncPromise: Promise<Map<string, { success: boolean; count: number }>> | null = null;
  private lastFullSyncTime = 0;
  private watchUnsubscribe: (() => void) | null = null;
  
  private pendingSyncs: Map<string, NodeJS.Timeout> = new Map();
  private syncingCollections: Set<string> = new Set();

  private constructor() {
    this.chromaManager = ChromaDBManager.getInstance();
    this.documentProcessor = new DocumentProcessor();
    this.initializeStatus();
  }

  static getInstance(): CollectionSyncService {
    if (!CollectionSyncService.instance) {
      CollectionSyncService.instance = new CollectionSyncService();
    }
    return CollectionSyncService.instance;
  }

  private initializeStatus(): void {
    for (const [key, config] of Object.entries(ChromaCollections)) {
      this.syncStatus.set(key, {
        collection: key,
        displayName: config.name,
        status: 'idle',
        documentCount: 0,
        lastSync: null
      });
    }
  }

  /**
   * Initialise toutes les collections
   */
  async initializeAllCollections(): Promise<void> {
    logger.info('[SYNC] Initialisation des 13 collections...');
    
    for (const [key] of Object.entries(ChromaCollections)) {
      try {
        await this.ensureCollectionExists(key as CollectionName);
        const count = await this.getCollectionDocumentCount(key as CollectionName);
        this.updateStatus(key, { documentCount: count, lastSync: new Date() });
      } catch (error) {
        logger.error(`[SYNC] Erreur initialisation ${key}:`, error);
        this.updateStatus(key, { status: 'error', error: String(error) });
      }
    }
    
    await this.logStatus();
    
    if (POST_INIT_SYNC_ENABLED) {
      logger.info('[SYNC] 🔄 Lancement de la synchronisation automatique post-initialisation...');
      await this.syncAllCollections();
    } else {
      logger.info('[SYNC] ⏭️ Synchronisation post-initialisation DÉSACTIVÉE');
    }
    
    logger.info('[SYNC] ✅ Toutes les collections sont initialisées');
  }

  /**
   * Vérifie et crée une collection si nécessaire
   * ✅ CORRECTION: Ajout du paramètre zone
   */
  async ensureCollectionExists(collectionKey: CollectionName): Promise<boolean> {
    try {
      const exists = await this.chromaManager.collectionExists(collectionKey, DEFAULT_ZONE);
      
      if (!exists) {
        logger.info(`[SYNC] Création de la collection: ${collectionKey}`);
        await this.chromaManager.getOrCreateCollection(collectionKey);
      }
      
      return true;
    } catch (error) {
      logger.error(`[SYNC] Erreur création ${collectionKey}:`, error);
      return false;
    }
  }

  /**
   * Synchronise UNE SEULE collection (avec verrou)
   */
  async syncCollection(collectionKey: CollectionName): Promise<{ success: boolean; count: number }> {
    if (this.syncingCollections.has(collectionKey)) {
      console.log(`[SYNC] ⏭️ Collection ${collectionKey} déjà en cours de synchronisation`);
      return { success: true, count: 0 };
    }
    
    this.syncingCollections.add(collectionKey);
    
    const config = ChromaCollections[collectionKey];
    const folder = config.sourceFolder;
    
    if (!folder) {
      logger.info(`[SYNC] ${collectionKey} n'a pas de dossier associé, ignoré`);
      this.syncingCollections.delete(collectionKey);
      return { success: true, count: 0 };
    }
    
    this.updateStatus(collectionKey, { status: 'syncing' });
    logger.info(`[SYNC] Synchronisation de ${collectionKey}...`);
    
    const folderPath = path.join(process.cwd(), 'data', 'centrale_documents', folder);
    
    try {
      const files = await this.getFilesRecursively(folderPath);
      logger.info(`[SYNC] ${files.length} fichiers trouvés dans ${folder}`);
      
      for (const filePath of files) {
        try {
          await this.documentProcessor.processDocument(filePath, collectionKey);
        } catch (error) {
          logger.warn(`[SYNC] Erreur traitement ${path.basename(filePath)}:`, error);
        }
      }
      
      const count = await this.getCollectionDocumentCount(collectionKey);
      this.updateStatus(collectionKey, {
        status: 'success',
        documentCount: count,
        lastSync: new Date()
      });
      
      logger.info(`[SYNC] ✅ ${collectionKey} synchronisé: ${count} documents`);
      return { success: true, count };
      
    } catch (error) {
      logger.error(`[SYNC] ❌ Erreur sync ${collectionKey}:`, error);
      this.updateStatus(collectionKey, { status: 'error', error: String(error) });
      return { success: false, count: 0 };
    } finally {
      this.syncingCollections.delete(collectionKey);
    }
  }

  /**
   * Synchronise toutes les collections
   */
  async syncAllCollections(): Promise<Map<string, { success: boolean; count: number }>> {
    if (this.isSyncing) {
      console.log('[SYNC] ⏭️ Synchronisation complète déjà en cours, ignorée');
      return this.syncPromise || new Map();
    }
    
    const now = Date.now();
    if (now - this.lastFullSyncTime < MIN_SYNC_INTERVAL_MS) {
      const waitTime = Math.round((MIN_SYNC_INTERVAL_MS - (now - this.lastFullSyncTime)) / 1000);
      console.log(`[SYNC] ⏭️ Synchronisation complète ignorée (dernière sync il y a ${waitTime}s)`);
      return new Map();
    }
    
    this.isSyncing = true;
    console.log('[SYNC] 🔄 Début synchronisation de toutes les collections...');
    
    this.syncPromise = this.performFullSync();
    
    try {
      const results = await this.syncPromise;
      return results;
    } finally {
      this.isSyncing = false;
      this.syncPromise = null;
      this.lastFullSyncTime = Date.now();
    }
  }

  /**
   * Exécute la synchronisation complète
   */
  private async performFullSync(): Promise<Map<string, { success: boolean; count: number }>> {
    const results = new Map();
    
    for (const [key, config] of Object.entries(ChromaCollections)) {
      if (config.sourceFolder) {
        const result = await this.syncCollection(key as CollectionName);
        results.set(key, result);
      }
    }
    
    await this.logStatus();
    console.log('[SYNC] ✅ Synchronisation terminée');
    
    return results;
  }

  /**
   * Synchronisation ciblée déclenchée par le watcher (avec debounce)
   */
  private scheduleTargetedSync(collectionKey: CollectionName): void {
    const existingTimer = this.pendingSyncs.get(collectionKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const timer = setTimeout(async () => {
      this.pendingSyncs.delete(collectionKey);
      console.log(`[SYNC] 🔄 Synchronisation ciblée: ${collectionKey}`);
      await this.syncCollection(collectionKey);
    }, DEBOUNCE_DELAY_MS);
    
    this.pendingSyncs.set(collectionKey, timer);
  }

  /**
   * Démarre la synchronisation automatique
   */
  startAutoSync(intervalMs: number = AUTO_SYNC_INTERVAL_MS): void {
    if (!AUTO_SYNC_ENABLED) {
      logger.info('[SYNC] Auto-sync DÉSACTIVÉE (AUTO_SYNC_ENABLED = false)');
      return;
    }
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    logger.info(`[SYNC] Auto-sync ACTIVÉE - toutes les ${intervalMs / 1000}s`);
    this.syncInterval = setInterval(() => {
      this.syncAllCollections();
    }, intervalMs);
  }

  /**
   * Arrête la synchronisation automatique
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('[SYNC] Auto-sync arrêtée');
    }
    
    for (const [, timer] of this.pendingSyncs) {
      clearTimeout(timer);
    }
    this.pendingSyncs.clear();
  }

  /**
   * Démarre le watcher de fichiers
   */
  async startFileWatcher(): Promise<void> {
    if (!FILE_WATCHER_ENABLED) {
      logger.info('[SYNC] Watcher de fichiers DÉSACTIVÉ (FILE_WATCHER_ENABLED = false)');
      return;
    }
    
    logger.info('[SYNC] Démarrage du watcher de fichiers...');
    
    const handleFileChange = async ({ path: filePath, type }: { path: string; type: string }) => {
      const collectionKey = this.getCollectionKeyFromPath(filePath);
      if (collectionKey) {
        console.log(`[SYNC] Changement détecté (${type}): ${path.basename(filePath)} → ${collectionKey}`);
        this.scheduleTargetedSync(collectionKey);
      }
    };
    
    fileService.on('file-changed', handleFileChange);
    
    this.watchUnsubscribe = () => {
      fileService.off('file-changed', handleFileChange);
    };
  }

  /**
   * Récupère les priorités de recherche par type
   */
  getSearchPriority(queryType: string): string[] {
    const priorities: Record<string, string[]> = {
      profile: ['RH_COLL', 'SHARED'],
      procedure: ['TG1', 'TG2', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE', 'B0_AUXILIAIRES'],
      equipment: ['TG1', 'TG2', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE', 'B0_AUXILIAIRES', 'A0_DIVERS'],
      maintenance: ['MAINTENANCE', 'TG1', 'TG2'],
      safety: ['SHARED', 'B0_AUXILIAIRES'],
      performance: ['SHARED', 'TG1', 'TG2', 'B3_TV_PE'],
      training: ['SHARED', 'RH_COLL'],
      general: ['SHARED', 'B0_AUXILIAIRES']
    };
    
    return priorities[queryType] || priorities.general;
  }

  /**
   * Récupère le statut de toutes les collections
   */
  getStatus(): SyncStatus[] {
    return Array.from(this.syncStatus.values());
  }

  /**
   * Obtient le nombre de documents dans une collection
   */
  private async getCollectionDocumentCount(collectionKey: CollectionName): Promise<number> {
    try {
      const stats = await this.chromaManager.getCollectionStats(collectionKey);
      return stats.count;
    } catch {
      return 0;
    }
  }

  /**
   * Met à jour le statut d'une collection
   */
  private updateStatus(collectionKey: string, update: Partial<SyncStatus>): void {
    const current = this.syncStatus.get(collectionKey);
    if (current) {
      this.syncStatus.set(collectionKey, { ...current, ...update });
    }
  }

  /**
   * Récupère la clé de collection à partir d'un chemin
   */
  private getCollectionKeyFromPath(filePath: string): CollectionName | null {
    for (const [key, config] of Object.entries(ChromaCollections)) {
      if (config.sourceFolder && filePath.includes(config.sourceFolder)) {
        return key as CollectionName;
      }
    }
    return null;
  }

  /**
   * Récupère tous les fichiers d'un dossier récursivement
   */
  private async getFilesRecursively(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...await this.getFilesRecursively(fullPath));
        } else if (this.isSupportedFile(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Dossier n'existe pas
    }
    
    return files;
  }

  /**
   * Vérifie si un fichier est supporté
   */
  private isSupportedFile(filename: string): boolean {
    const supported = ['.txt', '.md', '.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx', '.json'];
    const ext = path.extname(filename).toLowerCase();
    return supported.includes(ext);
  }

  /**
   * Affiche le statut des collections
   */
  async logStatus(): Promise<void> {
    console.log('\n' + '='.repeat(70));
    console.log('📊 ÉTAT DES 13 COLLECTIONS CHROMADB');
    console.log('='.repeat(70));
    
    for (const [key, status] of this.syncStatus) {
      const config = ChromaCollections[key as CollectionName];
      const icon = status.status === 'success' ? '✅' : status.status === 'syncing' ? '🔄' : '⚠️';
      const docs = status.documentCount;
      const lastSync = status.lastSync ? new Date(status.lastSync).toLocaleTimeString() : 'jamais';
      
      console.log(`${icon} ${(config.name || key).padEnd(35)} | ${String(docs).padStart(5)} docs | ${lastSync}`);
      if (status.error) {
        console.log(`   ⚠️ Erreur: ${status.error}`);
      }
    }
    
    console.log('='.repeat(70));
  }

  /**
   * Arrête le service
   */
  async shutdown(): Promise<void> {
    this.stopAutoSync();
    if (this.watchUnsubscribe) {
      this.watchUnsubscribe();
    }
    logger.info('[SYNC] Service arrêté');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

export const collectionSyncService = CollectionSyncService.getInstance();

export async function initializeCollections(): Promise<void> {
  await collectionSyncService.initializeAllCollections();
  
  await collectionSyncService.startFileWatcher();
  collectionSyncService.startAutoSync(AUTO_SYNC_INTERVAL_MS);
  
  logger.info(`[SYNC] Configuration: Auto-sync=${AUTO_SYNC_ENABLED ? 'ON' : 'OFF'}, Watcher=${FILE_WATCHER_ENABLED ? 'ON' : 'OFF'}, Post-init=${POST_INIT_SYNC_ENABLED ? 'ON' : 'OFF'}`);
}