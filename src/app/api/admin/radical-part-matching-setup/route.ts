import { NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function GET() {
  const results: any = { steps: [], errors: [], success: false };
  
  try {
    const db = getSQLiteCore();
    
    // =============================================================
    // ÉTAPE 1: Supprimer les anciennes tables si elles existent
    // =============================================================
    results.steps.push('🗑️ Suppression des anciennes tables...');
    try {
      db.getDB().exec(`
        DROP TABLE IF EXISTS part_matching_global_images;
        DROP TABLE IF EXISTS part_matching_patches;
        DROP TABLE IF EXISTS part_matching_hierarchy;
        DROP TABLE IF EXISTS part_matching_stats;
      `);
      results.steps.push('✅ Anciennes tables supprimées');
    } catch (error: any) {
      results.errors.push(`⚠️ Erreur suppression: ${error.message}`);
    }
    
    // =============================================================
    // ÉTAPE 2: Créer les nouvelles tables
    // =============================================================
    results.steps.push('📦 Création des nouvelles tables...');
    
    db.getDB().exec(`
      -- Table des images globales
      CREATE TABLE IF NOT EXISTS part_matching_global_images (
        id TEXT PRIMARY KEY,
        image_id TEXT NOT NULL,
        grid_rows INTEGER NOT NULL DEFAULT 3,
        grid_cols INTEGER NOT NULL DEFAULT 4,
        overlap REAL NOT NULL DEFAULT 0.2,
        patch_size INTEGER NOT NULL DEFAULT 256,
        total_parts INTEGER DEFAULT 0,
        processed_at INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      );
      
      -- Table des patches
      CREATE TABLE IF NOT EXISTS part_matching_patches (
        id TEXT PRIMARY KEY,
        global_image_id TEXT NOT NULL,
        position_x INTEGER NOT NULL,
        position_y INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        grid_row INTEGER NOT NULL,
        grid_col INTEGER NOT NULL,
        features TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        confidence REAL DEFAULT 0.0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (global_image_id) REFERENCES part_matching_global_images(id) ON DELETE CASCADE
      );
      
      -- Table des relations hiérarchiques
      CREATE TABLE IF NOT EXISTS part_matching_hierarchy (
        child_id TEXT NOT NULL,
        parent_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL DEFAULT 'part_of',
        matched_zone TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.0,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (child_id, parent_id)
      );
      
      -- Table des statistiques
      CREATE TABLE IF NOT EXISTS part_matching_stats (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        global_images_count INTEGER NOT NULL DEFAULT 0,
        total_patches_count INTEGER NOT NULL DEFAULT 0,
        successful_matches INTEGER NOT NULL DEFAULT 0,
        total_searches INTEGER NOT NULL DEFAULT 0,
        last_updated INTEGER NOT NULL
      );
      
      -- Index pour optimiser les recherches
      CREATE INDEX IF NOT EXISTS idx_patches_global ON part_matching_patches(global_image_id);
      CREATE INDEX IF NOT EXISTS idx_patches_position ON part_matching_patches(position_x, position_y);
      CREATE INDEX IF NOT EXISTS idx_hierarchy_parent ON part_matching_hierarchy(parent_id);
      CREATE INDEX IF NOT EXISTS idx_hierarchy_child ON part_matching_hierarchy(child_id);
    `);
    results.steps.push('✅ Tables créées avec succès');
    
    // =============================================================
    // ÉTAPE 3: Insérer les statistiques initiales
    // =============================================================
    db.getDB().exec(`
      INSERT OR REPLACE INTO part_matching_stats (id, global_images_count, total_patches_count, successful_matches, total_searches, last_updated)
      VALUES (1, 0, 0, 0, 0, ${Date.now()});
    `);
    results.steps.push('📊 Statistiques initiales insérées');
    
    // =============================================================
    // ÉTAPE 4: Vérifier les tables
    // =============================================================
    const tables = db.getDB().prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name LIKE 'part_matching_%'
      ORDER BY name
    `).all() as { name: string }[];
    
    results.steps.push(`📋 Tables trouvées: ${tables.map(t => t.name).join(', ')}`);
    
    // =============================================================
    // ÉTAPE 5: Tester l'insertion
    // =============================================================
    const testId = `test_${Date.now()}`;
    try {
      db.getDB().prepare(`
        INSERT INTO part_matching_global_images (id, image_id, grid_rows, grid_cols, overlap, patch_size, total_parts, processed_at, metadata)
        VALUES (?, ?, 3, 4, 0.2, 256, 0, ?, '{}')
      `).run(testId, testId, Date.now());
      
      db.getDB().prepare(`DELETE FROM part_matching_global_images WHERE id = ?`).run(testId);
      results.steps.push('✅ Test d\'écriture réussi');
    } catch (error: any) {
      results.errors.push(`❌ Test d'écriture échoué: ${error.message}`);
    }
    
    results.success = results.errors.length === 0;
    results.steps.push(results.success ? '🎉 Installation réussie !' : '⚠️ Installation partielle');
    
    return NextResponse.json(results);
    
  } catch (error: any) {
    console.error('❌ Erreur fatale:', error);
    results.errors.push(`❌ Erreur fatale: ${error.message}`);
    results.success = false;
    return NextResponse.json(results, { status: 500 });
  }
}