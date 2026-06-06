import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';
import { VisionData as SQLiteVisionData } from '@/ai/core/sqlite/types';

// On utilise les types de la BDD
type VisionData = SQLiteVisionData;

// Fonction utilitaire pour normaliser le type d'image (déclarée au niveau module)
const normalizeImageType = (type: string | undefined): 'simple' | 'panoramic' | 'global' | 'patch' => {
  if (type === 'global') return 'global';
  if (type === 'part') return 'patch';
  if (type === 'panoramic') return 'panoramic';
  return 'simple';
};

export const visionSyncService = {
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
          
          // Dans SQLiteCore, manager.ts a une prop `visionImages` (ou `vision`) qui contient saveImage
          const dbVision = (db as any).vision || (db as any).visionImages;
          if (dbVision?.saveImage) {
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
            dbVision.saveImage(syncData);
          }
        } catch { /* ignorer */ }
      }
      
      console.log(`⚡ Sync rapide ${relativePath} terminé`);
    } catch (error) {
      console.error(`❌ Erreur quickSyncFolder ${relativePath}:`, error);
    }
  },

  async updateImageMetadata(id: string, meta: Partial<VisionData>): Promise<boolean> {
    const db = getSQLiteCore();
    const dbVision = (db as any).vision || (db as any).visionImages;
    if (dbVision?.updateImage) {
      dbVision.updateImage(id, meta);
      return true;
    }
    // Fallback manuel si la méthode helper n'est pas bien exposée
    try {
      const setClause = [];
      const params = [];
      for (const [key, value] of Object.entries(meta)) {
        if (key !== 'id') {
          setClause.push(`${key} = ?`);
          params.push(value);
        }
      }
      if (setClause.length === 0) return true;
      params.push(id);
      
      db.getDB().prepare(`UPDATE vision_data SET ${setClause.join(', ')} WHERE id = ?`).run(...params);
      return true;
    } catch (error) {
      console.error('❌ Erreur updateImageMetadata:', error);
      return false;
    }
  }
};
