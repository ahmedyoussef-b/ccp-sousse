// src/lib/services/vision-unified-service.ts
/**
 * 🔥 SERVICE UNIFIÉ VISION - Solution au double système de gestion parallèle
 * 
 * PROBLÈME IDENTIFIÉ:
 * 1. Double système de gestion (Vision Service vs FS-Tree) non synchronisés
 * 2. Cache serveur concurrent (30s) avec données obsolètes
 * 3. Cache module-level persistant entre navigations
 * 4. Multiple API routes retournant des informations incohérentes
 * 
 * SOLUTION: Service unifié qui garantit la cohérence entre tous les systèmes
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';
import visionService from './visionService';
import { visionTreeCache } from './vision-cache';

export const dynamic = 'force-dynamic';

interface UnifiedFolderInfo {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  imageCount: number;
  localCount: number;
  hasChildren: boolean;
  existsInDB: boolean;
  existsInFS: boolean;
  lastSynced: number;
}

interface UnifiedSyncResult {
  success: boolean;
  folders: UnifiedFolderInfo[];
  inconsistencies: Array<{
    type: 'db_missing' | 'fs_missing' | 'count_mismatch';
    path: string;
    details: string;
  }>;
  correctedPaths: Array<{
    from: string;
    to: string;
    reason: string;
  }>;
}

/**
 * 🔥 FONCTION PRINCIPALE: Synchronisation unifiée des dossiers
 * Résout les incohérences entre la base de données et le système de fichiers
 */
export async function unifiedSyncFolders(targetPath?: string): Promise<UnifiedSyncResult> {
  const startTime = Date.now();
  const db = getSQLiteCore();
  await db.initialize();
  const dbInstance = db.getDB();
  
  console.log(`🔥 UNIFIED SYNC: Début synchronisation pour ${targetPath || 'racine'}`);
  
  const inconsistencies: UnifiedSyncResult['inconsistencies'] = [];
  const correctedPaths: UnifiedSyncResult['correctedPaths'] = [];
  
  try {
    // 1. Récupérer tous les dossiers de la base de données
    const dbFolders = dbInstance.prepare(`
      SELECT id, name, path, parentId, 
             (SELECT COUNT(*) FROM vision_data WHERE folder_id = f.id) as image_count
      FROM vision_folders f
      ORDER BY path ASC
    `).all() as Array<{
      id: string;
      name: string;
      path: string;
      parentId: string | null;
      image_count: number;
    }>;

    // 2. Scanner le système de fichiers pour validation
    const baseDir = path.join(process.cwd(), 'data/banque_images_ia');
    const scanPath = targetPath 
      ? path.join(process.cwd(), targetPath)
      : baseDir;
    
    const fsEntries = await fs.readdir(scanPath, { withFileTypes: true })
      .catch(() => []);

    const fsFolders = fsEntries
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        name: entry.name,
        path: path.relative(process.cwd(), path.join(scanPath, entry.name)).replace(/\\/g, '/'),
        exists: true
      }));

    // 3. 🔥 DÉTECTION DES INCOHÉRENCES
    const unifiedFolders: UnifiedFolderInfo[] = [];

    // Dossiers présents en DB mais pas en FS
    for (const dbFolder of dbFolders) {
      const fsFolder = fsFolders.find(f => f.path === dbFolder.path);
      const existsInFS = !!fsFolder;
      
      if (!existsInFS) {
        inconsistencies.push({
          type: 'fs_missing',
          path: dbFolder.path,
          details: `Dossier "${dbFolder.name}" existe en DB mais pas dans le système de fichiers`
        });
        
        // Supprimer de la DB
        dbInstance.prepare('DELETE FROM vision_folders WHERE id = ?').run(dbFolder.id);
        console.log(`🗑️ UNIFIED SYNC: Dossier supprimé de la DB (manquant en FS): ${dbFolder.path}`);
        continue;
      }

      unifiedFolders.push({
        id: dbFolder.id,
        name: dbFolder.name,
        path: dbFolder.path,
        parentId: dbFolder.parentId,
        imageCount: dbFolder.image_count,
        localCount: 0, // Sera calculé plus tard
        hasChildren: false, // Sera calculé plus tard
        existsInDB: true,
        existsInFS: true,
        lastSynced: Date.now()
      });
    }

    // Dossiers présents en FS mais pas en DB
    for (const fsFolder of fsFolders) {
      const dbFolder = dbFolders.find(f => f.path === fsFolder.path);
      const existsInDB = !!dbFolder;
      
      if (!existsInDB) {
        inconsistencies.push({
          type: 'db_missing',
          path: fsFolder.path,
          details: `Dossier "${fsFolder.name}" existe en FS mais pas en base de données`
        });

        // Ajouter à la DB
        const newId = crypto.randomUUID();
        const parentPath = path.dirname(fsFolder.path);
        const parentId = parentPath === 'data/banque_images_ia' 
          ? 'root' 
          : (dbInstance.prepare('SELECT id FROM vision_folders WHERE path = ?').get(parentPath) as { id: string } | undefined)?.id || 'root';

        dbInstance.prepare(`
          INSERT INTO vision_folders (id, name, path, parentId, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(newId, fsFolder.name, fsFolder.path, parentId, Date.now());

        console.log(`➕ UNIFIED SYNC: Dossier ajouté à la DB (manquant en DB): ${fsFolder.path}`);

        unifiedFolders.push({
          id: newId,
          name: fsFolder.name,
          path: fsFolder.path,
          parentId,
          imageCount: 0,
          localCount: 0,
          hasChildren: false,
          existsInDB: true,
          existsInFS: true,
          lastSynced: Date.now()
        });
      }
    }

    // 4. 🔥 CORRECTION AUTOMATIQUE DES CHEMINS PROBLÉMATIQUES
    for (const folder of unifiedFolders) {
      const pathParts = folder.path.split(/[\/\\]/);
      const lastPart = pathParts[pathParts.length - 1];
      
      // Détecter les chemins qui ressemblent à des noms de fichiers
      if (lastPart && (
        lastPart.includes('.') || // Extension
        lastPart.length >= 32 || // UUID
        (/[A-Z0-9_]{8,}/.test(lastPart) && /\d/.test(lastPart)) || // Pattern technique
        lastPart.length > 15 // Nom très long
      )) {
        const parentPath = pathParts.slice(0, -1).join('/');
        if (parentPath && parentPath !== folder.path) {
          correctedPaths.push({
            from: folder.path,
            to: parentPath,
            reason: `Chemin détecté comme nom de fichier: "${lastPart}"`
          });
          
          console.log(`🔧 UNIFIED SYNC: Chemin corrigé: "${folder.path}" → "${parentPath}"`);
        }
      }
    }

    // 5. Invalider tous les caches pour forcer la synchronisation
    visionTreeCache.invalidate('tree:');
    console.log(`🧹 UNIFIED SYNC: Tous les caches invalidés`);

    const duration = Date.now() - startTime;
    console.log(`✅ UNIFIED SYNC: Terminé en ${duration}ms - ${inconsistencies.length} incohérences, ${correctedPaths.length} corrections`);

    return {
      success: true,
      folders: unifiedFolders,
      inconsistencies,
      correctedPaths
    };

  } catch (error) {
    console.error('❌ UNIFIED SYNC: Erreur critique:', error);
    return {
      success: false,
      folders: [],
      inconsistencies: [{
        type: 'db_missing',
        path: 'system',
        details: error instanceof Error ? error.message : 'Erreur inconnue'
      }],
      correctedPaths: []
    };
  }
}

/**
 * 🔥 VALIDATION UNIFIÉE: Vérifie si un chemin est cohérent
 */
export function validatePathConsistency(targetPath: string): {
  isValid: boolean;
  correctedPath?: string;
  issues: string[];
} {
  const issues: string[] = [];
  let correctedPath = targetPath;
  let isValid = true;

  // 1. Vérifier si le chemin existe en DB
  const db = getSQLiteCore();
  const dbInstance = db.getDB();
  const folderExists = dbInstance.prepare('SELECT path FROM vision_folders WHERE path = ?').get(targetPath);
  
  if (!folderExists) {
    issues.push(`Chemin "${targetPath}" n'existe pas dans la base de données`);
    isValid = false;
  }

  // 2. Détecter les patterns de noms de fichiers
  const pathParts = targetPath.split(/[\/\\]/);
  const lastPart = pathParts[pathParts.length - 1];
  
  if (lastPart && (
    lastPart.includes('.') ||
    lastPart.length >= 32 ||
    (/[A-Z0-9_]{8,}/.test(lastPart) && /\d/.test(lastPart)) ||
    lastPart.length > 15
  )) {
    const parentPath = pathParts.slice(0, -1).join('/');
    if (parentPath !== targetPath) {
      correctedPath = parentPath;
      issues.push(`Chemin "${targetPath}" détecté comme nom de fichier, correction vers "${parentPath}"`);
    }
  }

  return {
    isValid,
    correctedPath: correctedPath !== targetPath ? correctedPath : undefined,
    issues
  };
}

/**
 * 🔥 API ROUTE: Synchronisation unifiée
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetPath = searchParams.get('path');
    
    const result = await unifiedSyncFolders(targetPath || undefined);
    
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ UNIFIED SYNC API: Erreur:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erreur inconnue' 
      },
      { status: 500 }
    );
  }
}

/**
 * 🔥 API ROUTE: Validation de chemin
 */
export async function POST(request: NextRequest) {
  try {
    const { path } = await request.json();
    
    if (!path) {
      return NextResponse.json(
        { error: 'Chemin requis' },
        { status: 400 }
      );
    }
    
    const validation = validatePathConsistency(path);
    
    return NextResponse.json({
      success: true,
      validation,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ UNIFIED VALIDATION API: Erreur:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erreur inconnue' 
      },
      { status: 500 }
    );
  }
}
