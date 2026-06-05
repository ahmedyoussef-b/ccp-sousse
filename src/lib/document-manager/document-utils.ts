// src/lib/document-manager/document-utils.ts
/**
 * @fileOverview DocumentUtils - Utilitaires de gestion des identifiants et scan de fichiers.
 * Version 2.0 avec cache, filtres avancés, et gestion optimisée des grands volumes.
 */

import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { DOCUMENTS_ROOT, isFileSupported } from './config';

// ============================================================================
// CONSTANTES ET CONFIGURATION
// ============================================================================

/**
 * Configuration du scan de fichiers
 */
export const SCAN_CONFIG = {
  // Extensions à ignorer
  ignoreExtensions: ['.tmp', '.swp', '.bak', '.log', '.cache'],
  
  // Dossiers à ignorer
  ignoreFolders: ['.git', '.svn', 'node_modules', '.DS_Store', 'Thumbs.db'],
  
  // Taille maximale pour le cache (en nombre d'entrées)
  maxCacheSize: 10000,
  
  // Durée de vie du cache (ms)
  cacheTTL: 60000, // 1 minute
  
  // Profondeur maximale de scan
  maxDepth: 50,
  
  // Batch size pour les opérations lourdes
  batchSize: 1000
};

/**
 * Cache des résultats de scan
 */
interface CacheEntry {
  files: string[];
  timestamp: number;
  rootHash: string;
}

let scanCache: Map<string, CacheEntry> = new Map();
let lastScanTime: Map<string, number> = new Map();

// ============================================================================
// GÉNÉRATION D'IDENTIFIANTS
// ============================================================================

/**
 * Génère un ID stable et URL-safe pour un chemin de fichier.
 * Version améliorée avec hash pour éviter les collisions.
 */
export function generateId(filePath: string, useHash: boolean = false): string {
  const relative = path.relative(DOCUMENTS_ROOT, filePath);
  
  if (useHash) {
    // Utiliser un hash pour les chemins longs
    const hash = createHash('md5').update(relative).digest('hex').substring(0, 16);
    const base = relative
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase()
      .substring(0, 80);
    return `${base}_${hash}`;
  }
  
  let id = relative
    .replace(/[^a-zA-Z0-9]/g, '_')
    .toLowerCase()
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  // Limiter la longueur (ChromaDB limite)
  if (id.length > 100) {
    const ext = path.extname(id);
    const name = id.substring(0, 100 - ext.length);
    id = name + ext;
  }
  
  return id;
}

/**
 * Génère un ID à partir du contenu du fichier (pour détection de doublons)
 */
export async function generateContentHash(filePath: string): Promise<string> {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size > 10 * 1024 * 1024) { // > 10MB, utiliser seulement les premiers 1MB
      const buffer = Buffer.alloc(1024 * 1024);
      const fd = await fs.open(filePath, 'r');
      await fd.read(buffer, 0, buffer.length, 0);
      await fd.close();
      return createHash('sha256').update(buffer).digest('hex').substring(0, 32);
    } else {
      const content = await fs.readFile(filePath);
      return createHash('sha256').update(content).digest('hex').substring(0, 32);
    }
  } catch (error) {
    console.error(`[DocumentUtils] Erreur hash pour ${filePath}:`, error);
    return '';
  }
}

// ============================================================================
// SCAN DE FICHIERS OPTIMISÉ
// ============================================================================

/**
 * Options de scan
 */
export interface ScanOptions {
  extensions?: string[];        // Extensions à inclure (ex: ['.pdf', '.jpg'])
  excludeExtensions?: string[]; // Extensions à exclure
  excludeFolders?: string[];    // Dossiers à exclure
  maxDepth?: number;            // Profondeur maximale
  minSize?: number;             // Taille minimale (octets)
  maxSize?: number;             // Taille maximale (octets)
  modifiedAfter?: Date;         // Fichiers modifiés après cette date
  modifiedBefore?: Date;        // Fichiers modifiés avant cette date
  useCache?: boolean;           // Utiliser le cache
  includeDirectories?: boolean; // Inclure les dossiers dans les résultats
}

/**
 * Scanne récursivement un dossier pour lister tous les fichiers.
 * Version optimisée avec cache, filtres, et gestion des erreurs.
 */
export async function scanDirectory(
  dir: string = DOCUMENTS_ROOT, 
  options: ScanOptions = {}
): Promise<string[]> {
  const startTime = Date.now();
  const {
    excludeFolders = SCAN_CONFIG.ignoreFolders,
    maxDepth = SCAN_CONFIG.maxDepth,
    useCache = true,
    includeDirectories = false
  } = options;
  
  // Normaliser le chemin
  const normalizedDir = path.resolve(dir);
  
  // Vérifier le cache
  if (useCache) {
    const cached = scanCache.get(normalizedDir);
    if (cached && (Date.now() - cached.timestamp) < SCAN_CONFIG.cacheTTL) {
      // Vérifier si le dossier a changé
      const currentRootHash = await getDirectoryHash(normalizedDir);
      if (currentRootHash === cached.rootHash) {
        console.log(`[DocumentUtils] Cache hit pour ${normalizedDir} (${cached.files.length} fichiers)`);
        return applyFilters(cached.files, options);
      }
    }
  }
  
  console.log(`[DocumentUtils] Scan du dossier: ${normalizedDir}`);
  
  const files: string[] = [];
  const errors: Error[] = [];
  
  try {
    await scanRecursive(
      normalizedDir,
      files,
      errors,
      0,
      maxDepth,
      excludeFolders,
      includeDirectories
    );
    
    // Appliquer les filtres
    let filteredFiles = await applyFilters(files, options);
    
    // Trier par chemin
    filteredFiles.sort();
    
    // Mettre en cache
    if (useCache && filteredFiles.length <= SCAN_CONFIG.maxCacheSize) {
      const rootHash = await getDirectoryHash(normalizedDir);
      scanCache.set(normalizedDir, {
        files: filteredFiles,
        timestamp: Date.now(),
        rootHash
      });
    }
    
    const duration = Date.now() - startTime;
    console.log(`[DocumentUtils] Scan terminé: ${filteredFiles.length} fichiers, ${errors.length} erreurs, ${duration}ms`);
    
    if (errors.length > 0) {
      console.warn(`[DocumentUtils] ${errors.length} erreurs lors du scan`);
    }
    
    return filteredFiles;
    
  } catch (error: any) {
    console.error(`[DocumentUtils] Erreur scan de ${normalizedDir}:`, error.message);
    return [];
  }
}

/**
 * Scan récursif avec gestion de profondeur
 */
async function scanRecursive(
  dir: string,
  files: string[],
  errors: Error[],
  depth: number,
  maxDepth: number,
  excludeFolders: string[],
  includeDirectories: boolean
): Promise<void> {
  if (depth > maxDepth) return;
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    // Traiter par batches pour les grands dossiers
    const batches = [];
    for (let i = 0; i < entries.length; i += SCAN_CONFIG.batchSize) {
      batches.push(entries.slice(i, i + SCAN_CONFIG.batchSize));
    }
    
    for (const batch of batches) {
      await Promise.all(batch.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        
        // Vérifier les dossiers à ignorer
        if (excludeFolders.includes(entry.name)) return;
        
        if (entry.isDirectory()) {
          if (includeDirectories) {
            files.push(fullPath);
          }
          await scanRecursive(
            fullPath, files, errors, depth + 1, maxDepth,
            excludeFolders, includeDirectories
          );
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }));
    }
  } catch (error: any) {
    errors.push(error);
    console.error(`[DocumentUtils] Erreur accès ${dir}:`, error.message);
  }
}

/**
 * Applique les filtres aux fichiers
 */
async function applyFilters(files: string[], options: ScanOptions): Promise<string[]> {
  let filtered = [...files];
  
  const {
    extensions,
    excludeExtensions = [],
    minSize,
    maxSize,
    modifiedAfter,
    modifiedBefore
  } = options;
  
  // Filtre par extension (inclure)
  if (extensions && extensions.length > 0) {
    const extSet = new Set(extensions.map(e => e.toLowerCase()));
    filtered = filtered.filter(f => extSet.has(path.extname(f).toLowerCase()));
  }
  
  // Filtre par extension (exclure)
  if (excludeExtensions.length > 0) {
    const excludeSet = new Set(excludeExtensions.map(e => e.toLowerCase()));
    filtered = filtered.filter(f => !excludeSet.has(path.extname(f).toLowerCase()));
  }
  
  // Filtres qui nécessitent des stats (optionnel, pour performance)
  if (minSize !== undefined || maxSize !== undefined || modifiedAfter || modifiedBefore) {
    const statsPromises = filtered.map(async (file) => {
      try {
        const stats = await fs.stat(file);
        let keep = true;
        
        if (minSize !== undefined && stats.size < minSize) keep = false;
        if (maxSize !== undefined && stats.size > maxSize) keep = false;
        if (modifiedAfter && stats.mtime < modifiedAfter) keep = false;
        if (modifiedBefore && stats.mtime > modifiedBefore) keep = false;
        
        return { file, keep };
      } catch {
        return { file, keep: false };
      }
    });
    
    const results = await Promise.all(statsPromises);
    filtered = results.filter(r => r.keep).map(r => r.file);
  }
  
  return filtered;
}

// ============================================================================
// SCAN INTELLIGENT AVEC MÉTADONNÉES
// ============================================================================

/**
 * Résultat de scan avec métadonnées
 */
export interface ScannedFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: Date;
  createdAt: Date;
  isSupported: boolean;
  collection?: string;
  id: string;
}

/**
 * Scanne un dossier et retourne des informations détaillées
 */
export async function scanDirectoryDetailed(
  dir: string = DOCUMENTS_ROOT,
  options: ScanOptions = {}
): Promise<ScannedFile[]> {
  const files = await scanDirectory(dir, { ...options, includeDirectories: false });
  const results: ScannedFile[] = [];
  
  // Traiter par batches
  for (let i = 0; i < files.length; i += SCAN_CONFIG.batchSize) {
    const batch = files.slice(i, i + SCAN_CONFIG.batchSize);
    const batchResults = await Promise.all(
      batch.map(async (filePath) => {
        try {
          const stats = await fs.stat(filePath);
          const extension = path.extname(filePath).toLowerCase();
          
          return {
            path: filePath,
            name: path.basename(filePath),
            extension,
            size: stats.size,
            modifiedAt: stats.mtime,
            createdAt: stats.birthtime,
            isSupported: isFileSupported(filePath),
            collection: determineCollectionFromPath(filePath),
            id: generateId(filePath)
          } as ScannedFile;
        } catch (error) {
          console.error(`[DocumentUtils] Erreur lecture ${filePath}:`, error);
          return null;
        }
      })
    );
    
    results.push(...batchResults.filter((r): r is ScannedFile => r !== null));
  }
  
  return results;
}

// ============================================================================
// RECHERCHE DE FICHIERS
// ============================================================================

/**
 * Retrouve le chemin d'un fichier physique à partir de son ID généré.
 * Version optimisée avec index et cache.
 */
export async function findDocumentById(
  id: string, 
  useCache: boolean = true
): Promise<string | null> {
  if (!id) return null;
  
  // Vérifier le cache des IDs
  const cacheKey = `id_${id}`;
  if (useCache && lastScanTime.has(cacheKey)) {
    const lastFound = lastScanTime.get(cacheKey);
    if (lastFound && (Date.now() - lastFound) < 5000) {
      // Trop récent, éviter de rescanner
      return null;
    }
  }
  
  // Scanner les fichiers
  const allFiles = await scanDirectory(DOCUMENTS_ROOT, { useCache });
  
  // Recherche optimisée avec index
  const fileMap = new Map<string, string>();
  for (const file of allFiles) {
    const fileId = generateId(file);
    fileMap.set(fileId, file);
    if (fileId === id) {
      lastScanTime.set(cacheKey, Date.now());
      return file;
    }
  }
  
  return null;
}

/**
 * Recherche des fichiers par nom (partial ou exact)
 */
export async function findDocumentsByName(
  searchTerm: string,
  exactMatch: boolean = false
): Promise<string[]> {
  const allFiles = await scanDirectory(DOCUMENTS_ROOT);
  const searchLower = searchTerm.toLowerCase();
  
  return allFiles.filter(file => {
    const fileName = path.basename(file).toLowerCase();
    return exactMatch 
      ? fileName === searchLower
      : fileName.includes(searchLower);
  });
}

/**
 * Recherche des fichiers par extension
 */
export async function findDocumentsByExtension(
  extension: string
): Promise<string[]> {
  const allFiles = await scanDirectory(DOCUMENTS_ROOT);
  const extLower = extension.toLowerCase().replace(/^\./, '');
  
  return allFiles.filter(file => 
    path.extname(file).toLowerCase().replace(/^\./, '') === extLower
  );
}

// ============================================================================
// STATISTIQUES ET ANALYSE
// ============================================================================

/**
 * Statistiques du système de fichiers
 */
export interface FileStats {
  totalFiles: number;
  totalSize: number;
  byExtension: Map<string, { count: number; size: number }>;
  byCollection: Map<string, { count: number; size: number }>;
  supportedFiles: number;
  unsupportedFiles: number;
  largestFiles: Array<{ path: string; size: number }>;
  oldestFiles: Array<{ path: string; modifiedAt: Date }>;
  newestFiles: Array<{ path: string; modifiedAt: Date }>;
}

/**
 * Obtient des statistiques sur les documents
 */
export async function getDocumentStats(): Promise<FileStats> {
  const files = await scanDirectoryDetailed(DOCUMENTS_ROOT);
  
  const stats: FileStats = {
    totalFiles: files.length,
    totalSize: 0,
    byExtension: new Map(),
    byCollection: new Map(),
    supportedFiles: 0,
    unsupportedFiles: 0,
    largestFiles: [],
    oldestFiles: [],
    newestFiles: []
  };
  
  for (const file of files) {
    stats.totalSize += file.size;
    
    if (file.isSupported) stats.supportedFiles++;
    else stats.unsupportedFiles++;
    
    // Par extension
    const ext = file.extension || 'no_extension';
    const extStats = stats.byExtension.get(ext) || { count: 0, size: 0 };
    extStats.count++;
    extStats.size += file.size;
    stats.byExtension.set(ext, extStats);
    
    // Par collection
    const collection = file.collection || 'unknown';
    const colStats = stats.byCollection.get(collection) || { count: 0, size: 0 };
    colStats.count++;
    colStats.size += file.size;
    stats.byCollection.set(collection, colStats);
  }
  
  // Top 10 plus gros fichiers
  stats.largestFiles = [...files]
    .sort((a, b) => b.size - a.size)
    .slice(0, 10)
    .map(f => ({ path: f.path, size: f.size }));
  
  // Plus anciens
  stats.oldestFiles = [...files]
    .sort((a, b) => a.modifiedAt.getTime() - b.modifiedAt.getTime())
    .slice(0, 10)
    .map(f => ({ path: f.path, modifiedAt: f.modifiedAt }));
  
  // Plus récents
  stats.newestFiles = [...files]
    .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
    .slice(0, 10)
    .map(f => ({ path: f.path, modifiedAt: f.modifiedAt }));
  
  return stats;
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Calcule un hash du dossier pour détection de changements
 */
async function getDirectoryHash(dir: string): Promise<string> {
  try {
    const entries = await fs.readdir(dir);
    const hash = createHash('md5');
    hash.update(dir);
    
    for (const entry of entries.slice(0, 100)) { // Limiter pour performance
      hash.update(entry);
      try {
        const stats = await fs.stat(path.join(dir, entry));
        hash.update(stats.mtime.getTime().toString());
        hash.update(stats.size.toString());
      } catch {
        // Ignorer
      }
    }
    
    return hash.digest('hex');
  } catch {
    return Date.now().toString();
  }
}

/**
 * Détermine la collection à partir du chemin
 */
function determineCollectionFromPath(filePath: string): string | undefined {
  const relative = path.relative(DOCUMENTS_ROOT, filePath);
  const folderName = relative.split(path.sep)[0];
  
  const collectionMap: Record<string, string> = {
    '01_DOCUMENTS_GENERAUX': 'DOCUMENTS_GENERAUX',
    '02_EQUIPEMENTS_PRINCIPAUX': 'EQUIPEMENTS_PRINCIPAUX',
    '03_SYSTEMES_AUXILIAIRES': 'SYSTEMES_AUXILIAIRES',
    '04_PROCEDURES': 'PROCEDURES_EXPLOITATION',
    '05_CONSIGNES_ET_SEUILS': 'CONSIGNES_ET_SEUILS',
    '06_MAINTENANCE': 'MAINTENANCE',
    '07_HISTORIQUE': 'HISTORIQUE',
    '08_SECURITE': 'SECURITE',
    '09_ANALYSE_PERFORMANCE': 'ANALYSE_PERFORMANCE',
    '10_FORMATION': 'FORMATION',
    '11_SALLE_CONTROLE_ET_CONDUITE': 'SALLE_CONTROLE_CONDUITE',
    '12_GESTION_EQUIPES_ET_HUMAIN': 'centrale_gestion_equipes_humain',
    '13_SUPERVISION_GLOBALE': 'SUPERVISION_GLOBALE'
  };
  
  return collectionMap[folderName];
}

/**
 * Vide le cache de scan
 */
export function clearScanCache(): void {
  scanCache.clear();
  lastScanTime.clear();
  console.log('[DocumentUtils] Cache vidé');
}

/**
 * Vérifie si un fichier existe
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Obtient la taille totale d'un dossier
 */
export async function getDirectorySize(dir: string): Promise<number> {
  let totalSize = 0;
  const files = await scanDirectory(dir);
  
  for (const file of files) {
    try {
      const stats = await fs.stat(file);
      totalSize += stats.size;
    } catch {
      // Ignorer
    }
  }
  
  return totalSize;
}

/**
 * Exporte la liste des fichiers vers un fichier (utile pour debug)
 */
export async function exportFileList(outputPath: string): Promise<void> {
  const files = await scanDirectory(DOCUMENTS_ROOT);
  const content = files.join('\n');
  await fs.writeFile(outputPath, content, 'utf-8');
  console.log(`[DocumentUtils] Exporté ${files.length} fichiers vers ${outputPath}`);
}

// ============================================================================
// EXPORTS POUR COMPATIBILITÉ
// ============================================================================

export default {
  generateId,
  generateContentHash,
  scanDirectory,
  scanDirectoryDetailed,
  findDocumentById,
  findDocumentsByName,
  findDocumentsByExtension,
  getDocumentStats,
  clearScanCache,
  fileExists,
  getDirectorySize,
  exportFileList
};