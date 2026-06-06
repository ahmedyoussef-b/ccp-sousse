// app/api/vision/fs-tree/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';
import { visionSyncService } from '@/lib/services/visionSyncService';
import { visionTreeCache } from '@/lib/services/vision-cache';

export const dynamic = 'force-dynamic';

// ============================================
// API GET - Récupérer l'Arborescence via DB (avec cache serveur)
// ============================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get('path');
  
  const startTime = Date.now();
  const baseDir = 'data/banque_images_ia';
  const relativePath = (requestedPath || baseDir).replace(/\\/g, '/');
  const cacheKey = `tree:${relativePath}`;

  // ⚡ Vérifier le cache serveur (TTL 30s)
  const cached = visionTreeCache.get<any>(cacheKey);
  if (cached) {
    console.log(`⚡ [FS-TREE CACHE HIT] ${relativePath} (${Date.now() - startTime}ms)`);
    return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const sqliteManager = getSQLiteCore();
    await sqliteManager.initialize();
    const db = sqliteManager.getDB();
    
    // 1. Identifier le dossier actuel
    let currentFolderId: string | null = 'root';
    if (relativePath !== baseDir) {
      const folder = db.prepare('SELECT id FROM vision_folders WHERE path = ?').get(relativePath) as { id: string } | undefined;
      if (folder) {
        currentFolderId = folder.id;
      } else {
        return NextResponse.json({ success: false, error: 'Dossier non synchronisé' }, { status: 404 });
      }
    }

    // 2. Récupérer les sous-dossiers (DB - ULTRA RAPIDE)
    // 🔥 FIX: Gérer parentId = 'root' ET parentId IS NULL pour la racine
    const dbSubFolders = db.prepare(`
      SELECT f.*, 
        (SELECT COUNT(*) FROM vision_data WHERE folder_id = f.id) as image_count,
        EXISTS(SELECT 1 FROM vision_folders WHERE parentId = f.id LIMIT 1) as has_subfolders
      FROM vision_folders f 
      WHERE f.parentId = ? ${currentFolderId === 'root' ? 'OR f.parentId IS NULL' : ''}
      ORDER BY f.name ASC
    `).all(currentFolderId) as any[];

    // For each db folder, compute local file count (number of .json sidecar files in the folder)
    const tree = await Promise.all(dbSubFolders.map(async (f) => {
      let localCount = 0;
      try {
        const folderFullPath = path.join(process.cwd(), f.path);
        const entries = await fs.readdir(folderFullPath, { withFileTypes: true }).catch(() => []);
        localCount = (entries || []).filter(e => e.isFile() && e.name.endsWith('.json') && !e.name.includes('_thumb')).length;
      } catch (e) {
        // ignore
      }
      return {
        id: f.id,
        name: f.name,
        path: f.path,
        parentId: f.parentId,
        children: [],
        images: [],
        type: 'directory',
        imageCount: f.image_count,
        localCount,
        hasChildren: f.has_subfolders === 1 || f.image_count > 0
      };
    }));

    // 3. Récupérer les images du dossier (DB - ULTRA RAPIDE)
    const dbImages = db.prepare(`
      SELECT v.id, v.filename, v.description, v.tags, v.location, v.folder_id, 
             v.date, v.created_at, v.image_type, p.status as prep_status
      FROM vision_data v
      LEFT JOIN image_preparations p ON v.id = p.image_id
      WHERE v.folder_id = ?
    `).all(currentFolderId) as any[];

    const rootImages = dbImages.map(img => ({
      id: img.id,
      filename: img.filename,
      description: img.description,
      tags: JSON.parse(img.tags || '[]'),
      location: img.location,
      folderId: img.folder_id,
      date: img.date,
      createdAt: new Date(img.created_at).toISOString(),
      imageType: img.image_type,
      thumbnailUrl: `/api/vision/images/${img.id}?thumbnail=true`,
      preparationStatus: img.prep_status || 'not_started',
      hasPreparations: img.prep_status === 'completed'
    }));
    
    const duration = Date.now() - startTime;
    console.log(`⚡ [FS-TREE DB] ${relativePath} chargé en ${duration}ms (${tree.length} folders, ${rootImages.length} images)`);
    
    const result = { 
      success: true, 
      tree,
      rootImages,
      path: relativePath,
      stats: { durationMs: duration }
    };

    // Mettre en cache (TTL 30s)
    visionTreeCache.set(cacheKey, result, 30000);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Erreur API fs-tree (DB mode):', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, { status: 500 });
  }
}

// ============================================
// API POST - Créer un nouveau dossier
// ============================================

export async function POST(request: NextRequest) {
  try {
    const { path: targetPath, name } = await request.json();
    
    if (!name) {
      return NextResponse.json({ error: 'Nom du dossier requis' }, { status: 400 });
    }
    
    // Déterminer le chemin complet
    let fullPath: string;
    if (targetPath) {
      fullPath = path.join(process.cwd(), targetPath, name);
    } else {
      fullPath = path.join(process.cwd(), 'data/banque_images_ia', name);
    }
    
    // Créer le dossier
    await fs.mkdir(fullPath, { recursive: true });
    
    // ⚡ Sync rapide (un seul dossier, pas de scan disque complet)
    await visionSyncService.quickSyncFolder(fullPath);
    
    // ♻️ Invalider le cache
    visionTreeCache.invalidate('tree:');
    
    return NextResponse.json({ 
      success: true, 
      folder: {
        name,
        path: path.relative(process.cwd(), fullPath).replace(/\\/g, '/'),
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Erreur création dossier:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

// ============================================
// API DELETE - Supprimer un dossier
// ============================================

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const folderPath = searchParams.get('path');
    
    if (!folderPath) {
      return NextResponse.json({ error: 'Chemin du dossier requis' }, { status: 400 });
    }
    
    const fullPath = path.join(process.cwd(), folderPath);
    
    // Vérifier que le dossier n'est pas protégé
    if (fullPath.includes('permanent') || fullPath.includes('uploads')) {
      return NextResponse.json({ error: 'Ce dossier est protégé' }, { status: 403 });
    }
    
    // Supprimer le dossier récursivement
    await fs.rm(fullPath, { recursive: true, force: true });
    
    // ⚡ Sync rapide (suppression dans la DB uniquement)
    await visionSyncService.quickSyncFolder(fullPath);
    
    // ♻️ Invalider le cache
    visionTreeCache.invalidate('tree:');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur suppression dossier:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

// ============================================
// API PATCH - Renommer un dossier
// ============================================

export async function PATCH(request: NextRequest) {
  try {
    const { path: oldPath, newName } = await request.json();
    
    if (!oldPath || !newName) {
      return NextResponse.json({ error: 'Chemin et nouveau nom requis' }, { status: 400 });
    }
    
    // 🔍 1. CAS IMAGE (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(oldPath)) {
      const success = await visionSyncService.updateImageMetadata(oldPath, { filename: newName });
      if (!success) return NextResponse.json({ error: 'Image non trouvée' }, { status: 404 });
      
      // 🔥 Renommer aussi le fichier physique si nécessaire (géré par visionSyncService.updateImageMetadata ?)
      // En fait visionSyncService.updateImageMetadata met à jour la DB. 
      // Le filesystem n'a pas forcément besoin de changer de nom si on utilise les IDs.
      
      // ⚡ Pour les images, updateImageMetadata met à jour la DB directement - pas besoin de scan
      visionTreeCache.invalidate('tree:');
      return NextResponse.json({ success: true });
    }

    // 🔍 2. CAS DOSSIER (Path)
    const fullOldPath = path.join(process.cwd(), oldPath);
    const parentDir = path.dirname(fullOldPath);
    const fullNewPath = path.join(parentDir, newName);
    
    // Vérifier si le nouveau nom existe déjà
    try {
      await fs.access(fullNewPath);
      return NextResponse.json({ error: 'Un dossier avec ce nom existe déjà' }, { status: 400 });
    } catch {
      // Ok, n'existe pas
    }
    
    // Renommer
    await fs.rename(fullOldPath, fullNewPath);
    
    // ⚡ Sync rapide du nouveau chemin
    await visionSyncService.quickSyncFolder(fullNewPath);
    visionTreeCache.invalidate('tree:');
    
    return NextResponse.json({ 
      success: true,
      newPath: path.relative(process.cwd(), fullNewPath).replace(/\\/g, '/')
    });
  } catch (error) {
    console.error('❌ Erreur renommage dossier/image:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}