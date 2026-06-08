export const runtime = 'edge';

// src/app/api/admin/reset/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ChromaDBManager } from '@/ai/vector/chromadb-manager';
import { readdir, rm, mkdir } from 'fs/promises';
import { fileService } from '@/lib/document-manager/file-service';
import path from 'path';
import { DOCUMENTS_ROOT } from '@/lib/document-manager/config';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';
import { clearTreeCache } from '@/lib/services/vision-cache';

/**
 * API Route: /api/admin/reset
 * Réinitialise complètement le système :
 * 1. Vide toutes les collections ChromaDB
 * 2. Supprime tous les fichiers physiques dans DOCUMENTS_ROOT
 * 3. VIDE LE CACHE D'ARBORESCENCE pour forcer le refresh
 * 4. PRÉSERVE le cache permanent
 * 5. PRÉSERVE les dossiers de la banque d'images (supprime uniquement les fichiers)
 */
export async function POST(_req: NextRequest) {
  try {
    console.log('[API][ADMIN][RESET] Lancement de la réinitialisation totale...');

    // 1. RÉINITIALISATION VECTORIELLE (ChromaDB)
    const manager = ChromaDBManager.getInstance();
    try {
      await manager.clearAllCollections();
      console.log('[API][ADMIN][RESET] ✅ Collections ChromaDB vidées avec succès');
    } catch (chromaError: any) {
      console.error('[API][ADMIN][RESET] ❌ Erreur ChromaDB:', chromaError.message);
    }

    // 2. RÉINITIALISATION PHYSIQUE (Fichiers uniquement, conservation de l'arborescence)
    try {
      async function cleanFilesOnly(dir: string) {
        const items = await readdir(dir, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          
          if (fullPath.includes('cache_permanent')) continue;

          if (item.isDirectory()) {
            await cleanFilesOnly(fullPath);
          } else {
            console.log(`[API][ADMIN][RESET] Suppression du fichier : ${fullPath}`);
            await rm(fullPath, { force: true });
          }
        }
      }

      await mkdir(DOCUMENTS_ROOT, { recursive: true });
      
      fileService.suspend();
      await cleanFilesOnly(DOCUMENTS_ROOT);
      
      console.log('[API][ADMIN][RESET] ✅ Fichiers physiques supprimés, arborescence conservée');
    } catch (fileError: any) {
      console.error('[API][ADMIN][RESET] ❌ Erreur fichiers:', fileError.message);
    } finally {
      fileService.resume();
    }

    // 2b. RÉINITIALISATION DE LA BANQUE D'IMAGES (data/banque_images_ia)
    try {
      const banquePath = path.join(process.cwd(), 'data', 'banque_images_ia');
      console.log('[API][ADMIN][RESET] 🔄 Nettoyage de la banque d\'images:', banquePath);

      async function cleanBankFilesOnly(dir: string) {
        const items = await readdir(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          if (item.isDirectory()) {
            const IGNORE_FOLDERS = ['permanent', 'uploads', 'cache', 'cache_permanent', '__pycache__', 'node_modules', '.git'];
            if (!IGNORE_FOLDERS.includes(item.name)) {
              await cleanBankFilesOnly(fullPath);
            }
          } else {
            if (fullPath.endsWith('.json') || fullPath.endsWith('.jpg') || fullPath.endsWith('.png') || fullPath.endsWith('_thumb.jpg')) {
              try {
                await rm(fullPath, { force: true });
                console.log('[API][ADMIN][RESET] Suppression banque fichier :', fullPath);
              } catch (e) {
                // ignore
              }
            }
          }
        }
      }

      fileService.suspend();
      await cleanBankFilesOnly(banquePath);
      fileService.resume();

      // Supprimer le cache persistant de l'arborescence de la banque
      const bankCache = path.join(banquePath, '.tree-cache.json');
      try { await rm(bankCache, { force: true }); } catch {}

      // 🔥 CORRECTION BUG 2: Vider les tables SQLite SAUF vision_folders
      try {
        const db = getSQLiteCore();
        const instance = db.getDB();
        try { instance.prepare('DELETE FROM vision_data').run(); } catch (e) { /* ignore */ }
        // ❌ NE PAS SUPPRIMER vision_folders - les dossiers doivent être préservés
        // try { instance.prepare('DELETE FROM vision_folders').run(); } catch (e) { /* ignore */ }
        try { instance.prepare('DELETE FROM image_preparations').run(); } catch (e) { /* ignore */ }
        try { instance.prepare('DELETE FROM image_assemblies').run(); } catch (e) { /* ignore */ }
        console.log('[API][ADMIN][RESET] ✅ Tables vision SQLite vidées (dossiers préservés)');
      } catch (dbErr) {
        console.warn('[API][ADMIN][RESET] ⚠️ Erreur vidage tables vision:', dbErr.message || dbErr);
      }

      // Invalider cache mémoire vision
      try { clearTreeCache(); } catch {}

      // 🔥 RECONSTRUCTION: Réconcilier pour recréer les dossiers dans la DB
      try {
        const visionServiceModule = await import('@/lib/services/visionService');
        await visionServiceModule.default.reconcile();
        console.log('[API][ADMIN][RESET] ✅ Réconciliation banque d\'images terminée');
      } catch (recErr: any) {
        console.warn('[API][ADMIN][RESET] ⚠️ Erreur réconciliation:', recErr.message || recErr);
      }

      console.log('[API][ADMIN][RESET] ✅ Banque d\'images réinitialisée (dossiers conservés)');
    } catch (bankErr: any) {
      console.error('[API][ADMIN][RESET] ❌ Erreur nettoyage banque images:', bankErr.message || bankErr);
    }

    // 3. RÉINITIALISATION DU CACHE D'ARBORESCENCE
    try {
      console.log('[API][ADMIN][RESET] 🔄 Vidage du cache d\'arborescence...');
      
      fileService.clearCache();
      
      const cacheFile = path.join(DOCUMENTS_ROOT, '.tree-cache.json');
      try {
        await rm(cacheFile, { force: true });
        console.log('[API][ADMIN][RESET] ✅ Cache d\'arborescence vidé');
      } catch (cacheError) {
        console.warn('[API][ADMIN][RESET] ⚠️ Impossible de supprimer le cache persistant:', cacheError.message);
      }
      
      await fileService.getTree(true);
      console.log('[API][ADMIN][RESET] ✅ Arborescence rechargée depuis le système de fichiers');
      
    } catch (cacheError: any) {
      console.error('[API][ADMIN][RESET] ❌ Erreur vidage cache:', cacheError.message);
    }

    return NextResponse.json({
      success: true,
      message: 'Réinitialisation terminée. Les fichiers, la base de données et le cache d\'arborescence ont été vidés (dossiers préservés).'
    });

  } catch (error: any) {
    console.error('[API][ADMIN][RESET] 💥 Échec critique:', error);
    return NextResponse.json({
      success: false,
      error: 'Erreur lors de la réinitialisation',
      details: error.message
    }, { status: 500 });
  }
}