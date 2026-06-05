// src/ai/core/sqlite/migrations.ts

import { getSQLiteCore, SQLiteCore } from './manager';
import { SCHEMAS } from './schemas';
import { logger } from './utils';

// ============================================================================
// TYPES
// ============================================================================

export interface Migration {
  id: number;
  module: string;
  version: number;
  description: string;
  up: (db: SQLiteCore) => Promise<void> | void;
  down?: (db: SQLiteCore) => Promise<void> | void;
}

export interface MigrationRecord {
  id: number;
  module: string;
  version: number;
  description: string;
  appliedAt: number;
}

// ============================================================================
// DÉFINITION DES MIGRATIONS
// ============================================================================

/**
 * Migration 001: Tables initiales du module actions
 */
const MIGRATION_001_ACTIONS_INIT: Migration = {
  id: 1,
  module: 'actions',
  version: 1,
  description: 'Tables initiales: caches, policies, demonstrations, snapshots',
  up: async (db: SQLiteCore) => {
    const tables = SCHEMAS.filter(s => s.module === 'actions');
    for (const table of tables) {
      db.getDB().exec(table.schema);
      for (const index of table.indexes) {
        db.getDB().exec(index);
      }
    }
    logger.info('MIGRATIONS', '✅ Migration 001 appliquée (actions)');
  }
};

/**
 * Migration 002: Tables initiales du module learning
 */
const MIGRATION_002_LEARNING_INIT: Migration = {
  id: 2,
  module: 'learning',
  version: 1,
  description: 'Tables initiales: episodic_memory, spaced_repetition',
  up: async (db: SQLiteCore) => {
    const tables = SCHEMAS.filter(s => s.module === 'learning');
    for (const table of tables) {
      db.getDB().exec(table.schema);
      for (const index of table.indexes) {
        db.getDB().exec(index);
      }
    }
    logger.info('MIGRATIONS', '✅ Migration 002 appliquée (learning)');
  }
};

/**
 * Migration 003: Tables initiales du module orchestration
 */
const MIGRATION_003_ORCHESTRATION_INIT: Migration = {
  id: 3,
  module: 'orchestration',
  version: 1,
  description: 'Tables initiales: transitions, stats, keyword_graph',
  up: async (db: SQLiteCore) => {
    const tables = SCHEMAS.filter(s => s.module === 'orchestration');
    for (const table of tables) {
      db.getDB().exec(table.schema);
      for (const index of table.indexes) {
        db.getDB().exec(index);
      }
    }
    logger.info('MIGRATIONS', '✅ Migration 003 appliquée (orchestration)');
  }
};

/**
 * Migration 004: Tables initiales du module agent
 */
const MIGRATION_004_AGENT_INIT: Migration = {
  id: 4,
  module: 'agent',
  version: 1,
  description: 'Tables initiales: agent_states',
  up: async (db: SQLiteCore) => {
    const tables = SCHEMAS.filter(s => s.module === 'agent');
    for (const table of tables) {
      db.getDB().exec(table.schema);
      for (const index of table.indexes) {
        db.getDB().exec(index);
      }
    }
    logger.info('MIGRATIONS', '✅ Migration 004 appliquée (agent)');
  }
};

/**
 * Migration 005: Tables initiales du module cache (permanent)
 */
const MIGRATION_005_CACHE_INIT: Migration = {
  id: 5,
  module: 'cache',
  version: 1,
  description: 'Tables initiales: permanent_entries, embeddings',
  up: async (db: SQLiteCore) => {
    const tables = SCHEMAS.filter(s => s.module === 'cache');
    for (const table of tables) {
      db.getDB().exec(table.schema);
      for (const index of table.indexes) {
        db.getDB().exec(index);
      }
    }
    logger.info('MIGRATIONS', '✅ Migration 005 appliquée (cache)');
  }
};

/**
 * Migration 006: Ajout de la colonne embedding_hash dans actions_policies
 */
const MIGRATION_006_ACTIONS_EMBEDDING_HASH: Migration = {
  id: 6,
  module: 'actions',
  version: 2,
  description: 'Ajout colonne embedding_hash pour optimisation recherche',
  up: async (db: SQLiteCore) => {
    try {
      db.getDB().exec(`
        ALTER TABLE actions_policies ADD COLUMN embedding_hash TEXT DEFAULT NULL;
        CREATE INDEX IF NOT EXISTS idx_actions_policies_embedding ON actions_policies(embedding_hash);
      `);
      logger.info('MIGRATIONS', '✅ Migration 006 appliquée (embedding_hash ajouté)');
    } catch (error) {
      logger.warn('MIGRATIONS', '⚠️ Colonne embedding_hash existe probablement déjà');
    }
  },
  down: async (_db: SQLiteCore) => {
    logger.warn('MIGRATIONS', '⚠️ Impossible de supprimer embedding_hash (SQLite limitation)');
  }
};

/**
 * Migration 007: Ajout métriques de performance
 */
const MIGRATION_007_PERFORMANCE_METRICS: Migration = {
  id: 7,
  module: 'actions',
  version: 3,
  description: 'Ajout table performance_metrics',
  up: async (db: SQLiteCore) => {
    db.getDB().exec(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        module TEXT NOT NULL,
        operation TEXT NOT NULL,
        durationMs INTEGER NOT NULL,
        success INTEGER NOT NULL DEFAULT 1,
        metadata TEXT DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_performance_metrics_module ON performance_metrics(module);
      CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp);
    `);
    logger.info('MIGRATIONS', '✅ Migration 007 appliquée (performance_metrics)');
  }
};

/**
 * Migration 008: Tables initiales du module QR (Questions/Réponses)
 */
const MIGRATION_008_QR_INIT: Migration = {
  id: 8,
  module: 'qr',
  version: 1,
  description: 'Tables initiales: qr_index, qr_embeddings',
  up: async (db: SQLiteCore) => {
    const tables = SCHEMAS.filter(s => s.module === 'qr');
    for (const table of tables) {
      db.getDB().exec(table.schema);
      for (const index of table.indexes) {
        db.getDB().exec(index);
      }
    }
    logger.info('MIGRATIONS', '✅ Migration 008 appliquée (qr)');
  }
};

/**
 * Migration 009: Tables initiales du module INNOVATIONS (Vision par similarité)
 */
const MIGRATION_009_INNOVATIONS_INIT: Migration = {
  id: 9,
  module: 'innovations',
  version: 1,
  description: 'Tables initiales: subspaces, analysis_history, feedback, bm25_index, training_sessions, thresholds',
  up: async (db: SQLiteCore) => {
    db.getDB().exec(`
      CREATE TABLE IF NOT EXISTS innovation_subspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        subspace_data TEXT NOT NULL,
        reference_images TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        version INTEGER DEFAULT 1,
        metadata TEXT DEFAULT '{}'
      );
      
      CREATE TABLE IF NOT EXISTS innovation_analysis_history (
        id TEXT PRIMARY KEY,
        innovation_type TEXT NOT NULL,
        analysis_data TEXT NOT NULL,
        detected_elements TEXT,
        suggested_actions TEXT,
        raw_response TEXT,
        user_id TEXT,
        session_id TEXT,
        created_at INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS innovation_feedback (
        id TEXT PRIMARY KEY,
        prediction_id TEXT NOT NULL,
        image_id TEXT,
        innovation_type TEXT NOT NULL,
        user_feedback TEXT NOT NULL,
        correction TEXT,
        confidence_score REAL,
        similarity_score REAL,
        user_id TEXT,
        created_at INTEGER NOT NULL,
        processed INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS innovation_bm25_index (
        term TEXT NOT NULL,
        document_id TEXT NOT NULL,
        tf REAL NOT NULL,
        doc_length INTEGER NOT NULL,
        PRIMARY KEY (term, document_id)
      );
      
      CREATE TABLE IF NOT EXISTS innovation_training_sessions (
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
      
      CREATE TABLE IF NOT EXISTS innovation_thresholds (
        id TEXT PRIMARY KEY,
        threshold_type TEXT NOT NULL,
        high REAL NOT NULL,
        medium REAL NOT NULL,
        low REAL NOT NULL,
        version INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    
    db.getDB().exec(`
      CREATE INDEX IF NOT EXISTS idx_innovation_subspaces_type ON innovation_subspaces(type);
      CREATE INDEX IF NOT EXISTS idx_innovation_analysis_type ON innovation_analysis_history(innovation_type);
      CREATE INDEX IF NOT EXISTS idx_innovation_analysis_created ON innovation_analysis_history(created_at);
      CREATE INDEX IF NOT EXISTS idx_innovation_feedback_prediction ON innovation_feedback(prediction_id);
      CREATE INDEX IF NOT EXISTS idx_innovation_feedback_type ON innovation_feedback(innovation_type);
      CREATE INDEX IF NOT EXISTS idx_innovation_bm25_term ON innovation_bm25_index(term);
      CREATE INDEX IF NOT EXISTS idx_innovation_bm25_document ON innovation_bm25_index(document_id);
      CREATE INDEX IF NOT EXISTS idx_innovation_sessions_status ON innovation_training_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_innovation_thresholds_type ON innovation_thresholds(threshold_type);
    `);
    
    logger.info('MIGRATIONS', '✅ Migration 009 appliquée (innovations)');
  }
};

/**
 * Migration 010: Tables pour les innovations techniques (8 IA Pro)
 */
const MIGRATION_010_INNOVATIONS_TECH: Migration = {
  id: 10,
  module: 'innovations_tech',
  version: 1,
  description: 'Tables pour les 8 innovations techniques: history, metrics, subspaces, feedback',
  up: async (db: SQLiteCore) => {
    const tables = SCHEMAS.filter(s => s.module === 'innovations_tech');
    for (const table of tables) {
      db.getDB().exec(table.schema);
      for (const index of table.indexes) {
        db.getDB().exec(index);
      }
    }
    logger.info('MIGRATIONS', '✅ Migration 010 appliquée (innovations_tech)');
  }
};

/**
 * 🔥 MIGRATION 011: Tables pour le module Part Matching (Innovation #9)
 */
const MIGRATION_011_PART_MATCHING: Migration = {
  id: 11,
  module: 'part_matching',
  version: 1,
  description: 'Tables pour le Part Matching: global_images, patches, hierarchy, stats',
  up: async (db: SQLiteCore) => {
    const tables = SCHEMAS.filter(s => s.module === 'part_matching');
    for (const table of tables) {
      db.getDB().exec(table.schema);
      for (const index of table.indexes) {
        db.getDB().exec(index);
      }
    }
    
    // Insérer les statistiques initiales
    db.getDB().exec(`
      INSERT OR IGNORE INTO part_matching_stats (id, global_images_count, total_patches_count, successful_matches, total_searches, last_updated)
      VALUES (1, 0, 0, 0, 0, ${Date.now()})
    `);
    
    logger.info('MIGRATIONS', '✅ Migration 011 appliquée (part_matching)');
  }
};

// ============================================================================
// LISTE DE TOUTES LES MIGRATIONS
// ============================================================================

const ALL_MIGRATIONS: Migration[] = [
  MIGRATION_001_ACTIONS_INIT,
  MIGRATION_002_LEARNING_INIT,
  MIGRATION_003_ORCHESTRATION_INIT,
  MIGRATION_004_AGENT_INIT,
  MIGRATION_005_CACHE_INIT,
  MIGRATION_006_ACTIONS_EMBEDDING_HASH,
  MIGRATION_007_PERFORMANCE_METRICS,
  MIGRATION_008_QR_INIT,
  MIGRATION_009_INNOVATIONS_INIT,
  MIGRATION_010_INNOVATIONS_TECH,
  MIGRATION_011_PART_MATCHING,
  /**
   * Migration 012: Cache Sémantique avec DragonMemory (Innovation #3)
   */
  {
    id: 12,
    module: 'cache',
    version: 2,
    description: 'Table semantic_cache pour DragonMemory',
    up: async (db: SQLiteCore) => {
      const tables = (await import('./schemas')).getAllSchemas().filter(s => s.name === 'semantic_cache');
      for (const table of tables) {
        db.getDB().exec(table.schema);
        for (const index of table.indexes) {
          db.getDB().exec(index);
        }
      }
      logger.info('MIGRATIONS', '✅ Migration 012 appliquée (semantic_cache)');
    }
  },
  /**
   * Migration 013: Tables pour le module Mind Map Circuit
   */
  {
    id: 13,
    module: 'mindmap',
    version: 1,
    description: 'Tables pour Mind Map Circuit: circuit_mindmaps, mindmap_nodes, mindmap_embeddings',
    up: async (db: SQLiteCore) => {
      const tables = (await import('./schemas')).getAllSchemas().filter(s => s.module === 'mindmap');
      for (const table of tables) {
        db.getDB().exec(table.schema);
        for (const index of table.indexes) {
          db.getDB().exec(index);
        }
      }
      logger.info('MIGRATIONS', '✅ Migration 013 appliquée (mindmap)');
    }
  },
  // Dans src/ai/core/sqlite/migrations.ts
// Ajouter après la migration 013 dans le tableau ALL_MIGRATIONS :

  /**
   * Migration 014: Ajout colonnes industrielles à mindmap_nodes
   */
  {
    id: 14,
    module: 'mindmap',
    version: 2,
    description: 'Ajout colonnes: kks, unit, criticality, optimal_value, formula_expression',
    up: async (db: SQLiteCore) => {
      const columns = [
        { name: 'kks', type: 'TEXT DEFAULT NULL' },
        { name: 'unit', type: 'TEXT DEFAULT NULL' },
        { name: 'criticality', type: "TEXT DEFAULT 'low'" },
        { name: 'optimal_value', type: 'TEXT DEFAULT NULL' },
        { name: 'formula_expression', type: 'TEXT DEFAULT NULL' },
      ];

      const existingColumns = db.getDB().prepare(`PRAGMA table_info(mindmap_nodes)`).all() as { name: string }[];
      const existingNames = new Set(existingColumns.map(c => c.name));

      for (const col of columns) {
        if (!existingNames.has(col.name)) {
          db.getDB().exec(`ALTER TABLE mindmap_nodes ADD COLUMN ${col.name} ${col.type}`);
          logger.info('MIGRATIONS', `✅ Colonne ${col.name} ajoutée à mindmap_nodes`);
        }
      }
      
      logger.info('MIGRATIONS', '✅ Migration 014 appliquée (colonnes industrielles mindmap)');
    }
  },                      
];

// ============================================================================
// GESTIONNAIRE DE MIGRATIONS
// ============================================================================

export class MigrationManager {
  private db: SQLiteCore;
  private migrationsTable = '_migrations_history';

  constructor() {
    this.db = getSQLiteCore();
  }

  /**
   * Initialise la table d'historique des migrations
   */
  private async initHistoryTable(): Promise<void> {
    this.db.getDB().exec(`
      CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
        id INTEGER PRIMARY KEY,
        module TEXT NOT NULL,
        version INTEGER NOT NULL,
        description TEXT NOT NULL,
        appliedAt INTEGER NOT NULL,
        UNIQUE(id)
      )
    `);
  }

  /**
   * Récupère la liste des migrations déjà appliquées
   */
  private getAppliedMigrations(): Set<number> {
    const rows = this.db.getDB().prepare(`
      SELECT id FROM ${this.migrationsTable} ORDER BY id
    `).all() as { id: number }[];
    
    return new Set(rows.map(r => r.id));
  }

  /**
   * Enregistre une migration comme appliquée
   */
  private recordMigration(migration: Migration): void {
    this.db.getDB().prepare(`
      INSERT INTO ${this.migrationsTable} (id, module, version, description, appliedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(migration.id, migration.module, migration.version, migration.description, Date.now());
  }

  /**
   * Applique les migrations non encore exécutées
   */
  public async migrate(): Promise<{
    applied: number;
    failed: Migration[];
    skipped: number;
  }> {
    await this.initHistoryTable();
    
    const appliedIds = this.getAppliedMigrations();
    const pending = ALL_MIGRATIONS.filter(m => !appliedIds.has(m.id));
    
    logger.info('MIGRATIONS', `📋 ${pending.length} migrations en attente sur ${ALL_MIGRATIONS.length} totales`);
    
    const result = {
      applied: 0,
      failed: [] as Migration[],
      skipped: ALL_MIGRATIONS.length - pending.length
    };

    for (const migration of pending) {
      try {
        logger.info('MIGRATIONS', `🔄 Application migration ${migration.id}: ${migration.description}`);
        await migration.up(this.db);
        this.recordMigration(migration);
        result.applied++;
        logger.info('MIGRATIONS', `✅ Migration ${migration.id} appliquée avec succès`);
      } catch (error) {
        logger.error('MIGRATIONS', `❌ Échec migration ${migration.id}`, error);
        result.failed.push(migration);
      }
    }

    logger.info('MIGRATIONS', `🎉 Migration terminée: ${result.applied} appliquées, ${result.skipped} ignorées, ${result.failed.length} échouées`);
    
    return result;
  }

  /**
   * Retourne la version actuelle du schéma pour un module
   */
  public getCurrentVersion(module: string): number {
    const row = this.db.getDB().prepare(`
      SELECT MAX(version) as version FROM ${this.migrationsTable} WHERE module = ?
    `).get(module) as { version: number | null };
    
    return row?.version || 0;
  }

  /**
   * Liste toutes les migrations appliquées
   */
  public listAppliedMigrations(): MigrationRecord[] {
    return this.db.getDB().prepare(`
      SELECT id, module, version, description, appliedAt
      FROM ${this.migrationsTable}
      ORDER BY id
    `).all() as MigrationRecord[];
  }

  /**
   * Vérifie l'intégrité des migrations (présence de toutes les tables)
   */
  public async verifyIntegrity(): Promise<{
    valid: boolean;
    missingTables: string[];
    missingIndexes: string[];
  }> {
    const missingTables: string[] = [];
    const missingIndexes: string[] = [];

    for (const schema of SCHEMAS) {
      try {
        this.db.getDB().prepare(`SELECT 1 FROM ${schema.name} LIMIT 1`).get();
      } catch {
        missingTables.push(schema.name);
      }
      
      for (const indexSql of schema.indexes) {
        const indexName = indexSql.match(/INDEX IF NOT EXISTS (\w+)/)?.[1] || 
                         indexSql.match(/INDEX (\w+)/)?.[1];
        if (indexName) {
          try {
            this.db.getDB().prepare(`SELECT 1 FROM sqlite_master WHERE type='index' AND name='${indexName}'`).get();
          } catch {
            missingIndexes.push(indexName);
          }
        }
      }
    }

    return {
      valid: missingTables.length === 0 && missingIndexes.length === 0,
      missingTables,
      missingIndexes
    };
  }

  /**
   * Exporte le schéma complet pour backup/documentation
   */
  public exportSchema(): string {
    const schema: Record<string, any> = {
      version: 1,
      generatedAt: new Date().toISOString(),
      tables: {}
    };

    const tables = this.db.getDB().prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_%'
    `).all() as { name: string }[];

    for (const table of tables) {
      const columns = this.db.getDB().prepare(`PRAGMA table_info(${table.name})`).all();
      const indexes = this.db.getDB().prepare(`PRAGMA index_list(${table.name})`).all();
      
      schema.tables[table.name] = {
        columns,
        indexes
      };
    }

    return JSON.stringify(schema, null, 2);
  }
}

// ============================================================================
// SINGLETON ET EXPORT
// ============================================================================

let migrationManagerInstance: MigrationManager | null = null;

export function getMigrationManager(): MigrationManager {
  if (!migrationManagerInstance) {
    migrationManagerInstance = new MigrationManager();
  }
  return migrationManagerInstance;
}

export { ALL_MIGRATIONS };

export default getMigrationManager;