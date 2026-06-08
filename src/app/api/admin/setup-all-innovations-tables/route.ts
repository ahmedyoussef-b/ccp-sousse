export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function GET() {
  try {
    const db = getSQLiteCore();
    
    // =============================================================
    // TOUTES LES TABLES POUR LES 8 INNOVATIONS
    // =============================================================
    
    db.getDB().exec(`
      -- =============================================================
      -- TABLE 1: Sous-espaces (Zero-Shot & Few-Shot)
      -- =============================================================
      CREATE TABLE IF NOT EXISTS innovations_tech_subspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        subspace_data TEXT NOT NULL,
        reference_images TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      );
      
      CREATE INDEX IF NOT EXISTS idx_subspaces_type ON innovations_tech_subspaces(type);
      CREATE INDEX IF NOT EXISTS idx_subspaces_name ON innovations_tech_subspaces(name);
      
      -- =============================================================
      -- TABLE 2: Historique des analyses (Toutes les innovations)
      -- =============================================================
      CREATE TABLE IF NOT EXISTS innovations_tech_history (
        id TEXT PRIMARY KEY,
        innovation_type TEXT NOT NULL,
        analysis_data TEXT NOT NULL,
        detected_elements TEXT,
        suggested_actions TEXT,
        confidence REAL,
        success INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        user_id TEXT,
        session_id TEXT,
        metadata TEXT DEFAULT '{}'
      );
      
      CREATE INDEX IF NOT EXISTS idx_history_type ON innovations_tech_history(innovation_type);
      CREATE INDEX IF NOT EXISTS idx_history_created ON innovations_tech_history(created_at);
      CREATE INDEX IF NOT EXISTS idx_history_success ON innovations_tech_history(success);
      CREATE INDEX IF NOT EXISTS idx_history_user ON innovations_tech_history(user_id);
      
      -- =============================================================
      -- TABLE 3: Métriques (Statistiques d'utilisation)
      -- =============================================================
      CREATE TABLE IF NOT EXISTS innovations_tech_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        innovation_id INTEGER NOT NULL,
        innovation_name TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        timestamp INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_metrics_id ON innovations_tech_metrics(innovation_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_name ON innovations_tech_metrics(metric_name);
      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON innovations_tech_metrics(timestamp);
      
      -- =============================================================
      -- TABLE 4: Feedbacks utilisateur (Innovation #8)
      -- =============================================================
      CREATE TABLE IF NOT EXISTS innovations_tech_feedback (
        id TEXT PRIMARY KEY,
        prediction_id TEXT NOT NULL,
        image_id TEXT,
        innovation_type TEXT NOT NULL,
        user_feedback TEXT NOT NULL,
        correction TEXT,
        confidence_score REAL,
        similarity_score REAL,
        created_at INTEGER NOT NULL,
        processed INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_feedback_prediction ON innovations_tech_feedback(prediction_id);
      CREATE INDEX IF NOT EXISTS idx_feedback_type ON innovations_tech_feedback(innovation_type);
      CREATE INDEX IF NOT EXISTS idx_feedback_created ON innovations_tech_feedback(created_at);
      
      -- =============================================================
      -- TABLE 5: Index BM25 pour recherche hybride (Innovation #5)
      -- =============================================================
      CREATE TABLE IF NOT EXISTS innovations_tech_bm25 (
        term TEXT NOT NULL,
        document_id TEXT NOT NULL,
        tf REAL NOT NULL,
        doc_length INTEGER NOT NULL,
        PRIMARY KEY (term, document_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_bm25_term ON innovations_tech_bm25(term);
      CREATE INDEX IF NOT EXISTS idx_bm25_document ON innovations_tech_bm25(document_id);
      
      -- =============================================================
      -- TABLE 6: Sessions d'entraînement Few-Shot (Innovation #6)
      -- =============================================================
      CREATE TABLE IF NOT EXISTS innovations_tech_training_sessions (
        id TEXT PRIMARY KEY,
        defect_name TEXT NOT NULL,
        description TEXT,
        positive_samples TEXT NOT NULL,
        negative_samples TEXT NOT NULL,
        status TEXT NOT NULL,
        detector_id TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        metadata TEXT DEFAULT '{}'
      );
      
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON innovations_tech_training_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_created ON innovations_tech_training_sessions(created_at);
      
      -- =============================================================
      -- TABLE 7: Seuils de confiance persistants (Innovation #8)
      -- =============================================================
      CREATE TABLE IF NOT EXISTS innovations_tech_thresholds (
        id TEXT PRIMARY KEY,
        threshold_type TEXT NOT NULL,
        high REAL NOT NULL,
        medium REAL NOT NULL,
        low REAL NOT NULL,
        version INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_thresholds_type ON innovations_tech_thresholds(threshold_type);
      CREATE INDEX IF NOT EXISTS idx_thresholds_version ON innovations_tech_thresholds(version);
      
      -- =============================================================
      -- TABLE 8: Cache des résultats (Toutes les innovations)
      -- =============================================================
      CREATE TABLE IF NOT EXISTS innovations_tech_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        namespace TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        hits INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_cache_namespace ON innovations_tech_cache(namespace);
      CREATE INDEX IF NOT EXISTS idx_cache_expires ON innovations_tech_cache(expires_at);
    `);
    
    // Vérifier que les tables ont été créées
    const tables = db.getDB().prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name LIKE 'innovations_tech_%'
      ORDER BY name
    `).all() as { name: string }[];
    
    return NextResponse.json({
      success: true,
      message: '✅ Toutes les tables ont été créées avec succès !',
      tables: tables.map(t => t.name),
      count: tables.length
    });
    
  } catch (error: any) {
    console.error('❌ Erreur création tables:', error);
    return NextResponse.json({ 
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
}