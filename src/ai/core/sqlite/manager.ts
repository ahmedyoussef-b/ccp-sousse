//src/ai/core/sqlite/manager.ts
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getAllSchemas } from './schemas';
import { logger, formatDuration } from './utils';
import {
  ActionPolicy,
  ActionDemonstration,
  ActionSnapshot,
  LearningInsight,
  LearningPattern,
  ConceptNode,
  ConceptRelation,
  LearningEpisode,
  KnowledgeItem,
  LearningProfile,
  LearningRule,
  PerformanceMetrics,
  DomainMapping,
  WorkflowRecord,
  SessionRecord,
  VoteRecord,
  GlobalImageRecord,
  PatchRecord,
  HierarchyRelation,
  PatchSearchResult,
  QREntry,
  ImagePreparation,
  ImageAssembly,
  PreparationLog,
  InnovationSubspace,
  InnovationAnalysis,
  InnovationFeedback,
  InnovationTrainingSession,
  TechAnalysis,
  TechMetric,
  TechSubspace,
  TechFeedback
} from './types';


// CONSTANTES
const DB_PATH = process.env.AI_SQLITE_PATH || path.join(process.cwd(), 'data', 'ai-core.db');
const MIGRATIONS_TABLE = '_migrations';

// CLASSE PRINCIPALE
export class SQLiteCore {
  private static instance: SQLiteCore;
  private db: Database.Database;
  private initialized: boolean = false;
  private appliedMigrations: Set<string> = new Set();
  public visionFolders = {
    insertFolder: (folder: any) => {
      this.db.prepare(`
        INSERT OR REPLACE INTO vision_folders (id, name, path, parentId, createdAt, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(folder.id, folder.name, folder.path, folder.parentId, folder.createdAt, JSON.stringify(folder.metadata || {}));
    },
    getFolder: (id: string) => {
      const row = this.db.prepare(`SELECT * FROM vision_folders WHERE id = ?`).get(id) as any;
      return row ? { ...row, metadata: JSON.parse(row.metadata || '{}') } : null;
    },
    listFolders: () => {
      const rows = this.db.prepare(`SELECT * FROM vision_folders`).all() as any[];
      return rows.map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
    },
    updateFolder: (id: string, folder: any) => {
      this.db.prepare(`
        UPDATE vision_folders SET name = ?, path = ?, parentId = ?, metadata = ?
        WHERE id = ?
      `).run(folder.name, folder.path, folder.parentId, JSON.stringify(folder.metadata || {}), id);
    },
    deleteFolder: (id: string) => {
      this.db.prepare(`DELETE FROM vision_folders WHERE id = ?`).run(id);
    }
  };

  public visionImages = {
    saveImage: (data: any) => this.vision.saveImage(data),
    getImage: (id: string) => this.vision.getImage(id),
    updateImage: (id: string, data: any) => this.vision.updateImage(id, data),
    deleteImage: (id: string) => this.vision.deleteImage(id)
  };

  public semanticCache = {
    get: (id: string) => {
      const row = this.db.prepare(`SELECT * FROM semantic_cache WHERE id = ?`).get(id) as any;
      return row ? { ...row, metadata: JSON.parse(row.metadata || '{}'), embedding_compressed: row.embedding_compressed } : null;
    },
    set: (data: { id: string, query: string, embedding_compressed: Buffer, response: string, metadata?: any }) => {
      this.db.prepare(`
        INSERT OR REPLACE INTO semantic_cache (id, query, embedding_compressed, response, last_used, created_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.id, 
        data.query, 
        data.embedding_compressed, 
        data.response, 
        Date.now(), 
        Date.now(), 
        JSON.stringify(data.metadata || {})
      );
    },
    updateUsage: (id: string) => {
      this.db.prepare(`UPDATE semantic_cache SET usage_count = usage_count + 1, last_used = ? WHERE id = ?`)
        .run(Date.now(), id);
    },
    getAll: () => {
      return this.db.prepare(`SELECT id, embedding_compressed FROM semantic_cache`).all() as { id: string, embedding_compressed: Buffer }[];
    },
    deleteByQuery: (query: string) => {
      const result = this.db.prepare(`DELETE FROM semantic_cache WHERE query = ?`).run(query);
      return result.changes > 0;
    }
  };
  
  private constructor() {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('cache_size = -2000'); // 2MB cache
    this.db.pragma('temp_store = MEMORY'); // Store temp tables in RAM
    logger.info('CORE', `Base SQLite initialisée: ${DB_PATH}`);
  }
  
  public static getInstance(): SQLiteCore {
    if (!SQLiteCore.instance) {
      SQLiteCore.instance = new SQLiteCore();
    }
    return SQLiteCore.instance;
  }
  
  // INITIALISATION ET MIGRATIONS
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    const startTime = Date.now();
    logger.info('CORE', 'Démarrage de l\'initialisation SQLite...');
    
    // S'assurer que la table des migrations existe
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        module TEXT NOT NULL,
        tableName TEXT NOT NULL,
        version INTEGER NOT NULL,
        appliedAt INTEGER NOT NULL,
        PRIMARY KEY (module, tableName)
      )
    `);

    const existing = this.db.prepare(`

      SELECT module, tableName, version FROM ${MIGRATIONS_TABLE}
    `).all() as { module: string; tableName: string; version: number }[];
    for (const row of existing) {
      this.appliedMigrations.add(`${row.module}:${row.tableName}`);
    }
    const schemas = getAllSchemas();
    let appliedCount = 0;
    for (const schema of schemas) {
      const key = `${schema.module}:${schema.name}`;
      if (!this.appliedMigrations.has(key)) {
        try {
          this.db.exec(schema.schema);
          for (const indexSql of schema.indexes) {
            this.db.exec(indexSql);
          }
          this.db.prepare(`
            INSERT INTO ${MIGRATIONS_TABLE} (module, tableName, version, appliedAt)
            VALUES (?, ?, ?, ?)
          `).run(schema.module, schema.name, schema.version, Date.now());        
          this.appliedMigrations.add(key);
          appliedCount++;
          logger.info('CORE', `✅ Table créée: ${schema.module}/${schema.name} v${schema.version}`);
        } catch (error) {
          logger.error('CORE', `❌ Erreur création table ${schema.name}`, error);
          throw error;
        }
      }
    }
    this.initialized = true;
    

    
  

    logger.info('CORE', `Initialisation terminée: ${appliedCount} tables créées en ${formatDuration(Date.now() - startTime)}`);
  }
  
  // MÉTHODES GÉNÉRIQUES DE CACHE
  public get<T = any>(namespace: string, key: string): T | undefined {
    const row = this.db.prepare(`
      SELECT value FROM actions_caches 
      WHERE namespace = ? AND key = ? AND expiresAt > ?
    `).get(namespace, key, Date.now()) as { value: string } | undefined;
    return row ? JSON.parse(row.value) as T : undefined;
  }
  
  public set<T = any>(namespace: string, key: string, value: T, ttlSeconds: number = 300): void {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    const stringValue = JSON.stringify(value);
    this.db.prepare(`
      INSERT OR REPLACE INTO actions_caches (namespace, key, value, expiresAt, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(namespace, key, stringValue, expiresAt, Date.now());
  }
  
  public delete(namespace: string, key: string): boolean {
    const result = this.db.prepare(`
      DELETE FROM actions_caches WHERE namespace = ? AND key = ?
    `).run(namespace, key);
    return result.changes > 0;
  }
  
  public clearNamespace(namespace: string): number {
    const result = this.db.prepare(`DELETE FROM actions_caches WHERE namespace = ?`).run(namespace);
    return result.changes;
  }
  
  
  // MODULE ACTIONS  
  public actions = {
    getCache: <T = any>(namespace: string, key: string): T | undefined => this.get<T>(namespace, key),
    setCache: <T = any>(namespace: string, key: string, value: T, ttlSeconds?: number): void => this.set<T>(namespace, key, value, ttlSeconds),
    deleteCache: (namespace: string, key: string): boolean => this.delete(namespace, key),
    clearNamespace: (namespace: string): number => this.clearNamespace(namespace),
    savePolicy: (policy: ActionPolicy): void => {
      this.db.prepare(`
        INSERT OR REPLACE INTO actions_policies 
        (id, contextPattern, actionTemplate, confidence, demonstrationCount, successRate, createdAt, updatedAt, lastUsed, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(policy.id, policy.contextPattern, JSON.stringify(policy.actionTemplate), policy.confidence, policy.demonstrationCount, policy.successRate, policy.createdAt, policy.updatedAt, policy.lastUsed, JSON.stringify(policy.tags));
    },
    getPolicy: (id: string): ActionPolicy | null => {
      const row = this.db.prepare(`SELECT * FROM actions_policies WHERE id = ?`).get(id) as any;
      return row ? { ...row, actionTemplate: JSON.parse(row.actionTemplate), tags: JSON.parse(row.tags) } as ActionPolicy : null;
    },
    getAllPolicies: (minConfidence?: number): ActionPolicy[] => {
      const sql = minConfidence ? `SELECT * FROM actions_policies WHERE confidence >= ? ORDER BY confidence DESC` : `SELECT * FROM actions_policies ORDER BY confidence DESC`;
      const rows = this.db.prepare(sql).all(minConfidence || 0) as any[];
      return rows.map((row: any) => ({ ...row, actionTemplate: JSON.parse(row.actionTemplate), tags: JSON.parse(row.tags) } as ActionPolicy));
    },  
    deletePolicy: (id: string): boolean => {
      const result = this.db.prepare(`DELETE FROM actions_policies WHERE id = ?`).run(id);
      return result.changes > 0;
    },
    updatePolicyUsage: (id: string, success: boolean): void => {
      const policy = this.actions.getPolicy(id);
      if (policy) {
        const newCount = policy.demonstrationCount + 1;
        const newRate = ((policy.successRate * policy.demonstrationCount) + (success ? 100 : 0)) / newCount;
        const newConfidence = Math.min(0.95, Math.max(0.1, policy.confidence + (success ? 0.02 : -0.05)));  
        this.db.prepare(`
          UPDATE actions_policies 
          SET demonstrationCount = ?, successRate = ?, confidence = ?, lastUsed = ?, updatedAt = ?
          WHERE id = ?
        `).run(newCount, newRate, newConfidence, Date.now(), Date.now(), id);
      }
    },
    saveDemonstration: (demo: ActionDemonstration): void => {
      this.db.prepare(`
        INSERT OR REPLACE INTO actions_demonstrations 
        (id, timestamp, context, action, result, userId, sessionId, success, tags, duration)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(demo.id, demo.timestamp, JSON.stringify(demo.context), JSON.stringify(demo.action), JSON.stringify(demo.result), demo.userId, demo.sessionId, demo.success ? 1 : 0, JSON.stringify(demo.tags), demo.duration);
    },
    saveSnapshot: (id: string, state: any, workflowId?: string): void => {
      this.db.prepare(`INSERT OR REPLACE INTO actions_snapshots (id, state, createdAt, expiresAt, workflowId) VALUES (?, ?, ?, ?, ?)`).run(id, JSON.stringify(state), Date.now(), Date.now() + (24 * 60 * 60 * 1000), workflowId || null);
    },
    getSnapshot: (id: string): ActionSnapshot | null => {
      const row = this.db.prepare(`SELECT * FROM actions_snapshots WHERE id = ? AND expiresAt > ?`).get(id, Date.now()) as any;
      return row ? { ...row, state: JSON.parse(row.state) } as ActionSnapshot : null;
    },
    deleteSnapshot: (id: string): boolean => {
      const result = this.db.prepare(`DELETE FROM actions_snapshots WHERE id = ?`).run(id);
      return result.changes > 0;
    }
  };
  
  // MODULE LEARNING (IMPLEMENTATIONS RÉELLES)  
  public learning = {
    saveInsight: (insight: LearningInsight): LearningInsight => {
      this.db.prepare(`
        INSERT OR REPLACE INTO learning_insights (id, instanceId, domain, pattern, instruction, confidence, timestamp, originalRule)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(insight.id, insight.instanceId, insight.domain, insight.pattern, insight.instruction, insight.confidence, insight.timestamp, insight.originalRule || null);
      return insight;
    },
    getInsights: (limit?: number, domain?: string): LearningInsight[] => {
      let sql = `SELECT * FROM learning_insights ORDER BY timestamp DESC`;
      const params: any[] = [];
      if (domain) {
        sql = `SELECT * FROM learning_insights WHERE domain = ? ORDER BY timestamp DESC`;
        params.push(domain);
      }
      if (limit) {
        sql += ` LIMIT ?`;
        params.push(limit);
      }
      return this.db.prepare(sql).all(...params) as LearningInsight[];
    },
    deleteInsight: (id: string): boolean => {
      const result = this.db.prepare(`DELETE FROM learning_insights WHERE id = ?`).run(id);
      return result.changes > 0;
    },
    savePattern: (pattern: LearningPattern): LearningPattern => {
      this.db.prepare(`
        INSERT OR REPLACE INTO learning_patterns (id, description, domain, confidence, usageCount, applicability, timestamp, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(pattern.id, pattern.description, pattern.domain, pattern.confidence, pattern.usageCount || 1, pattern.applicability || 'Usage général', pattern.timestamp, JSON.stringify(pattern.tags || []));
      return pattern;
    },
     getPatterns: (minConfidence?: number): LearningPattern[] => {
      let sql = `SELECT * FROM learning_patterns ORDER BY confidence DESC`;
      const params: any[] = [];
      if (minConfidence !== undefined) {
        sql = `SELECT * FROM learning_patterns WHERE confidence >= ? ORDER BY confidence DESC`;
        params.push(minConfidence);
      }
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map((row: any) => ({ ...row, tags: JSON.parse(row.tags) } as LearningPattern));
    },
    deletePattern: (id: string): boolean => {
      const result = this.db.prepare(`DELETE FROM learning_patterns WHERE id = ?`).run(id);
      return result.changes > 0;
    },
    incrementPatternUsage: (id: string): void => {
      this.db.prepare(`UPDATE learning_patterns SET usageCount = usageCount + 1 WHERE id = ?`).run(id);
    },
    saveConceptNode: (node: ConceptNode): ConceptNode => {
      this.db.prepare(`
        INSERT OR REPLACE INTO learning_concept_nodes (id, name, level, parentId, description, synonyms, importance)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(node.id, node.name, node.level, node.parentId || null, node.description || '', JSON.stringify(node.synonyms || []), node.importance || 5);
      return node;
    },
    getConceptNodes: (): ConceptNode[] => {
      const rows = this.db.prepare(`SELECT * FROM learning_concept_nodes ORDER BY level ASC`).all() as any[];
      return rows.map((row: any) => ({ ...row, synonyms: JSON.parse(row.synonyms) } as ConceptNode));
    },
    getConceptNode: (id: string): ConceptNode | null => {
      const row = this.db.prepare(`SELECT * FROM learning_concept_nodes WHERE id = ?`).get(id) as any;
      return row ? { ...row, synonyms: JSON.parse(row.synonyms) } as ConceptNode : null;
    },
    deleteConceptNode: (id: string): boolean => {
      const result = this.db.prepare(`DELETE FROM learning_concept_nodes WHERE id = ?`).run(id);
      return result.changes > 0;
    },
    saveConceptRelation: (relation: ConceptRelation): ConceptRelation => {
      this.db.prepare(`
        INSERT OR REPLACE INTO learning_concept_relations (sourceId, targetId, type)
        VALUES (?, ?, ?)
      `).run(relation.sourceId, relation.targetId, relation.type);
      return relation;
    },
    getConceptRelations: (): ConceptRelation[] => {
      return this.db.prepare(`SELECT * FROM learning_concept_relations`).all() as ConceptRelation[];
    },
    saveEpisode: (episode: LearningEpisode): LearningEpisode => {
      this.db.prepare(`
        INSERT OR REPLACE INTO learning_episodes (id, timestamp, type, content, context, importance, tags, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(episode.id, episode.timestamp, episode.type, episode.content, episode.context, episode.importance, JSON.stringify(episode.tags || []), JSON.stringify(episode.metadata || {}));
      return episode;
    },
    getEpisodes: (limit: number = 100, type?: string): LearningEpisode[] => {
      let sql = `SELECT * FROM learning_episodes ORDER BY timestamp DESC`;
      const params: any[] = [];
      if (type) {
        sql = `SELECT * FROM learning_episodes WHERE type = ? ORDER BY timestamp DESC`;
        params.push(type);
      }
      if (limit) {
        sql += ` LIMIT ?`;
        params.push(limit);
      }
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map((row: any) => ({ ...row, tags: JSON.parse(row.tags), metadata: JSON.parse(row.metadata) } as LearningEpisode));
    },
    
    deleteOldEpisodes: (beforeTimestamp: number): number => {
      const result = this.db.prepare(`DELETE FROM learning_episodes WHERE timestamp < ?`).run(beforeTimestamp);
      return result.changes;
    },
    saveKnowledgeItem: (item: KnowledgeItem): KnowledgeItem => {
      this.db.prepare(`
        INSERT OR REPLACE INTO learning_knowledge_items 
        (id, content, concept, stability, difficulty, lastReview, nextReview, reviewsCount, tags, domain)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(item.id, item.content, item.concept, item.stability, item.difficulty, item.lastReview, item.nextReview, item.reviewsCount, JSON.stringify(item.tags || []), item.domain || 'general');
      return item;
    },
    getKnowledgeItems: (dueOnly: boolean = false): KnowledgeItem[] => {
      let sql = `SELECT * FROM learning_knowledge_items`;
      const params: any[] = [];
      if (dueOnly) {
        sql += ` WHERE nextReview <= ?`;
        params.push(Date.now());
      }
      sql += ` ORDER BY nextReview ASC`;
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map((row: any) => ({ ...row, tags: JSON.parse(row.tags) } as KnowledgeItem));
    },
     getKnowledgeItem: (id: string): KnowledgeItem | null => {
      const row = this.db.prepare(`SELECT * FROM learning_knowledge_items WHERE id = ?`).get(id) as any;
      return row ? { ...row, tags: JSON.parse(row.tags) } as KnowledgeItem : null;
    },
    updateKnowledgeItem: (id: string, item: Partial<KnowledgeItem>): void => {
      this.db.prepare(`
        UPDATE learning_knowledge_items 
        SET stability = COALESCE(?, stability), 
            difficulty = COALESCE(?, difficulty), 
            lastReview = COALESCE(?, lastReview), 
            nextReview = COALESCE(?, nextReview), 
            reviewsCount = COALESCE(?, reviewsCount)
        WHERE id = ?
      `).run(item.stability, item.difficulty, item.lastReview, item.nextReview, item.reviewsCount, id);
    },
    deleteKnowledgeItem: (id: string): boolean => {
      const result = this.db.prepare(`DELETE FROM learning_knowledge_items WHERE id = ?`).run(id);
      return result.changes > 0;
    },
    saveProfile: (userId: string, profile: LearningProfile): LearningProfile => {
      this.db.prepare(`
        INSERT OR REPLACE INTO learning_profiles (userId, conciseness, technicality, formality, creativity, lastUpdated, adaptationCount, history)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, profile.conciseness, profile.technicality, profile.formality, profile.creativity, profile.lastUpdated, profile.adaptationCount, JSON.stringify(profile.history || []));
      return profile;
    },
    getProfile: (userId: string): LearningProfile | null => {
      const row = this.db.prepare(`SELECT * FROM learning_profiles WHERE userId = ?`).get(userId) as any;
      if (!row) return null;
      return {
        conciseness: row.conciseness,
        technicality: row.technicality,
        formality: row.formality,
        creativity: row.creativity,
        lastUpdated: row.lastUpdated,
        adaptationCount: row.adaptationCount,
        history: JSON.parse(row.history)
      };
    },
    saveRule: (rule: LearningRule): LearningRule => {
      this.db.prepare(`
        INSERT OR REPLACE INTO learning_rules (id, domain, pattern, instruction, confidence, timestamp, usageCount, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(rule.id, rule.domain, rule.pattern, rule.instruction, rule.confidence, rule.timestamp, rule.usageCount || 0, JSON.stringify(rule.tags || []));
      return rule;
    },
    getRules: (domain?: string, minConfidence?: number): LearningRule[] => {
      let sql = `SELECT * FROM learning_rules`;
      const conditions: string[] = [];
      const params: any[] = [];
      if (domain) {
        conditions.push(`domain = ?`);
        params.push(domain);
      }
      if (minConfidence !== undefined) {
        conditions.push(`confidence >= ?`);
        params.push(minConfidence);
      }
      if (conditions.length > 0) {
        sql += ` WHERE ` + conditions.join(' AND ');
      }
      sql += ` ORDER BY confidence DESC`;
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map((row: any) => ({ ...row, tags: JSON.parse(row.tags) } as LearningRule));
    },
    
    incrementRuleUsage: (id: string): void => {
      this.db.prepare(`UPDATE learning_rules SET usageCount = usageCount + 1 WHERE id = ?`).run(id);
    },
    savePerformance: (metrics: PerformanceMetrics): PerformanceMetrics => {
      this.db.prepare(`
        INSERT INTO learning_performance_history (timestamp, strategyId, success, quality, timeSpent, confidence, query)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(metrics.timestamp, metrics.strategyId, metrics.success ? 1 : 0, metrics.quality, metrics.timeSpent, metrics.confidence || null, metrics.query || null);
      return metrics;
    },
    getPerformanceHistory: (strategyId?: string, limit: number = 100): PerformanceMetrics[] => {
      let sql = `SELECT * FROM learning_performance_history`;
      const params: any[] = [];
      if (strategyId) {
        sql += ` WHERE strategyId = ?`;
        params.push(strategyId);
      }
      sql += ` ORDER BY timestamp DESC LIMIT ?`;
      params.push(limit);
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map((row: any) => ({ ...row, success: row.success === 1 } as PerformanceMetrics));
    },
    getStrategyStats: (strategyId: string): any => {
      const rows = this.db.prepare(`
        SELECT 
          COUNT(*) as totalUsage,
          SUM(success) as successCount,
          AVG(quality) as avgQuality,
          AVG(timeSpent) as avgTimeSpent
        FROM learning_performance_history 
        WHERE strategyId = ?
      `).get(strategyId) as any;
      return {
        totalUsage: rows?.totalUsage || 0,
        successCount: rows?.successCount || 0,
        successRate: (rows?.totalUsage || 0) > 0 ? rows.successCount / rows.totalUsage : 0,
        avgQuality: rows?.avgQuality || 0,
        avgTimeSpent: rows?.avgTimeSpent || 0,
        lastUsed: null
      };
    },
    saveDomainMapping: (mapping: DomainMapping): DomainMapping => {
      this.db.prepare(`
        INSERT OR REPLACE INTO learning_domain_mappings (sourceDomain, targetDomain, conceptFrom, conceptTo, confidence, usageCount, lastUsed)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(mapping.sourceDomain, mapping.targetDomain, mapping.conceptFrom, mapping.conceptTo, mapping.confidence, mapping.usageCount || 0, mapping.lastUsed || Date.now());
      return mapping;
    },
     getDomainMappings: (sourceDomain?: string, targetDomain?: string): DomainMapping[] => {
      let sql = `SELECT * FROM learning_domain_mappings`;
      const conditions: string[] = [];
      const params: any[] = [];
      if (sourceDomain) {
        conditions.push(`sourceDomain = ?`);
        params.push(sourceDomain);
      }
      if (targetDomain) {
        conditions.push(`targetDomain = ?`);
        params.push(targetDomain);
      }
      if (conditions.length > 0) {
        sql += ` WHERE ` + conditions.join(' AND ');
      }
      sql += ` ORDER BY confidence DESC`;
      return this.db.prepare(sql).all(...params) as DomainMapping[];
    },
    incrementMappingUsage: (sourceDomain: string, targetDomain: string, conceptFrom: string): void => {
      this.db.prepare(`
        UPDATE learning_domain_mappings 
        SET usageCount = usageCount + 1, lastUsed = ? 
        WHERE sourceDomain = ? AND targetDomain = ? AND conceptFrom = ?
      `).run(Date.now(), sourceDomain, targetDomain, conceptFrom);
    }
  };

  // MODULE ORCHESTRATION
   public orchestration = {
    recordTransition: (sourceHash: string, targetHash: string): void => {
      this.db.prepare(`
        INSERT INTO orchestration_transitions (source_hash, target_hash, count, lastUsed)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(source_hash, target_hash) DO UPDATE SET 
          count = count + 1,
          lastUsed = excluded.lastUsed
      `).run(sourceHash, targetHash, Date.now());
    },
    getSuggestions: (sourceHash: string, limit: number = 2): Array<{ target_hash: string; count: number }> => {
      return this.db.prepare(`
        SELECT target_hash, count FROM orchestration_transitions 
        WHERE source_hash = ? ORDER BY count DESC LIMIT ?
      `).all(sourceHash, limit) as Array<{ target_hash: string; count: number }>;
    },
    saveKeywordNode: (keyword: string, weight: number, documents: string[], relations: any[]): void => {
      this.db.prepare(`
        INSERT OR REPLACE INTO orchestration_keyword_graph (keyword, weight, documents, lastUsed, relations)
        VALUES (?, ?, ?, ?, ?)
      `).run(keyword.toLowerCase(), weight, JSON.stringify(documents), Date.now(), JSON.stringify(relations));
    },
    getKeywordNode: (keyword: string): any | null => {
      const row = this.db.prepare(`SELECT * FROM orchestration_keyword_graph WHERE keyword = ?`).get(keyword.toLowerCase()) as any;
      return row ? { ...row, documents: JSON.parse(row.documents), relations: JSON.parse(row.relations) } : null;
    },
    getAllKeywordNodes: (): any[] => {
      const rows = this.db.prepare(`SELECT * FROM orchestration_keyword_graph ORDER BY weight DESC`).all() as any[];
      return rows.map(row => ({ ...row, documents: JSON.parse(row.documents), relations: JSON.parse(row.relations) }));
    },
    deleteKeywordNode: (keyword: string): boolean => {
      const result = this.db.prepare(`DELETE FROM orchestration_keyword_graph WHERE keyword = ?`).run(keyword.toLowerCase());
      return result.changes > 0;
    },
    cache: {
      get: <T>(key: string, namespace: string = 'default'): T | null => {
        const row = this.db.prepare(`
          SELECT value FROM orchestration_cache 
          WHERE key = ? AND namespace = ? AND expiresAt > ?
        `).get(key, namespace, Date.now()) as { value: string } | undefined;
        return row ? JSON.parse(row.value) as T : null;
      },
      set: <T>(key: string, value: T, namespace: string = 'default', ttlSeconds: number = 3600): void => {
        const expiresAt = Date.now() + (ttlSeconds * 1000);
        this.db.prepare(`
          INSERT OR REPLACE INTO orchestration_cache (key, value, namespace, createdAt, expiresAt, hits)
          VALUES (?, ?, ?, ?, ?, 0)
        `).run(key, JSON.stringify(value), namespace, Date.now(), expiresAt);
      },
      delete: (key: string, namespace: string = 'default'): boolean => {
        const result = this.db.prepare(`
          DELETE FROM orchestration_cache WHERE key = ? AND namespace = ?
        `).run(key, namespace);
        return result.changes > 0;
      },
      clear: (namespace?: string): number => {
        if (namespace) {
          const result = this.db.prepare(`DELETE FROM orchestration_cache WHERE namespace = ?`).run(namespace);
          return result.changes;
        } else {
          const result = this.db.prepare(`DELETE FROM orchestration_cache`).run();
          return result.changes;
        }
      },
      incrementHit: (key: string, namespace: string = 'default'): void => {
        this.db.prepare(`
          UPDATE orchestration_cache SET hits = hits + 1 
          WHERE key = ? AND namespace = ?
        `).run(key, namespace);
      },
      getStats: (namespace?: string): { totalEntries: number; totalHits: number } => {
        let sql = `SELECT COUNT(*) as totalEntries, COALESCE(SUM(hits), 0) as totalHits FROM orchestration_cache`;
        const params: any[] = [];
        if (namespace) {
          sql += ` WHERE namespace = ?`;
          params.push(namespace);
        }
        const row = this.db.prepare(sql).get(...params) as any;
        return { totalEntries: row?.totalEntries || 0, totalHits: row?.totalHits || 0 };
      }
    },
    dependencies: {
      add: (source: string, target: string, type: string = 'depends_on', weight: number = 1.0): void => {
        this.db.prepare(`
          INSERT OR REPLACE INTO orchestration_dependencies (source, target, type, weight)
          VALUES (?, ?, ?, ?)
        `).run(source, target, type, weight);
      },
      get: (source: string): Array<{ target: string; type: string; weight: number }> => {
        const rows = this.db.prepare(`
          SELECT target, type, weight FROM orchestration_dependencies WHERE source = ?
        `).all(source) as Array<{ target: string; type: string; weight: number }>;
        return rows;
      },
      getDependents: (target: string): Array<{ source: string; type: string; weight: number }> => {
        const rows = this.db.prepare(`
          SELECT source, type, weight FROM orchestration_dependencies WHERE target = ?
        `).all(target) as Array<{ source: string; type: string; weight: number }>;
        return rows;
      },
      remove: (source: string, target: string): boolean => {
        const result = this.db.prepare(`
          DELETE FROM orchestration_dependencies WHERE source = ? AND target = ?
        `).run(source, target);
        return result.changes > 0;
      },
      getAll: (): Array<{ source: string; target: string; type: string; weight: number }> => {
        const rows = this.db.prepare(`SELECT * FROM orchestration_dependencies`).all() as Array<{ source: string; target: string; type: string; weight: number }>;
        return rows;
      },
       getByType: (type: string): Array<{ source: string; target: string; weight: number }> => {
        return this.db.prepare(`SELECT source, target, weight FROM orchestration_dependencies WHERE type = ?`).all(type) as Array<{ source: string; target: string; weight: number }>;
      }
    },
    workflows: {
      save: (workflow: Partial<WorkflowRecord> & { id: string; name: string; steps: any[] }): void => {
        this.db.prepare(`
          INSERT OR REPLACE INTO orchestration_workflows 
          (id, name, steps, status, executionCount, avgDuration, lastExecuted, createdAt, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          workflow.id, 
          workflow.name, 
          JSON.stringify(workflow.steps), 
          workflow.status || 'active', 
          workflow.executionCount || 0, 
          workflow.avgDuration || 0, 
          workflow.lastExecuted || null, 
          workflow.createdAt || Date.now(), 
          JSON.stringify(workflow.metadata || {})
        );
      },
       get: (id: string): WorkflowRecord | null => {
        const row = this.db.prepare(`SELECT * FROM orchestration_workflows WHERE id = ?`).get(id) as any;
        if (!row) return null;
        return {
          ...row,
          steps: JSON.parse(row.steps),
          metadata: JSON.parse(row.metadata)
        } as WorkflowRecord;
      },
      list: (status?: string): WorkflowRecord[] => {
        let sql = `SELECT * FROM orchestration_workflows`;
        const params: any[] = [];
        if (status) {
          sql += ` WHERE status = ?`;
          params.push(status);
        }
        sql += ` ORDER BY createdAt DESC`;
        const rows = this.db.prepare(sql).all(...params) as any[];
        return rows.map(row => ({
          ...row,
          steps: JSON.parse(row.steps),
          metadata: JSON.parse(row.metadata)
        } as WorkflowRecord));
      },
       updateStatus: (id: string, status: string): void => {
        this.db.prepare(`UPDATE orchestration_workflows SET status = ? WHERE id = ?`).run(status, id);
      },
       recordExecution: (id: string, durationMs: number): void => {
        const workflow = this.orchestration.workflows.get(id);
        if (workflow) {
          const newCount = workflow.executionCount + 1;
          const newAvg = ((workflow.avgDuration * workflow.executionCount) + durationMs) / newCount;
          this.db.prepare(`
            UPDATE orchestration_workflows 
            SET executionCount = ?, avgDuration = ?, lastExecuted = ?
            WHERE id = ?
          `).run(newCount, Math.round(newAvg), Date.now(), id);
        }
      },
      delete: (id: string): boolean => {
        const result = this.db.prepare(`DELETE FROM orchestration_workflows WHERE id = ?`).run(id);
        return result.changes > 0;
      },
      getStats: (): { total: number; active: number; avgExecutions: number } => {
        const total = this.db.prepare(`SELECT COUNT(*) as count FROM orchestration_workflows`).get() as any;
        const active = this.db.prepare(`SELECT COUNT(*) as count FROM orchestration_workflows WHERE status = 'active'`).get() as any;
        const avgExec = this.db.prepare(`SELECT AVG(executionCount) as avg FROM orchestration_workflows`).get() as any;
        return {
          total: total?.count || 0,
          active: active?.count || 0,
          avgExecutions: Math.round(avgExec?.avg || 0)
        };
      }
    },
    sessions: {
      create: (sessionId: string, userId?: string, context?: any, ttlSeconds: number = 3600): void => {
        const expiresAt = Date.now() + (ttlSeconds * 1000);
        this.db.prepare(`
          INSERT OR REPLACE INTO orchestration_sessions 
          (sessionId, userId, state, context, history, createdAt, lastActivity, expiresAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sessionId, 
          userId || null, 
          'active', 
          JSON.stringify(context || {}), 
          JSON.stringify([]), 
          Date.now(), 
          Date.now(), 
          expiresAt
        );
      },
      get: (sessionId: string): SessionRecord | null => {
        const row = this.db.prepare(`SELECT * FROM orchestration_sessions WHERE sessionId = ?`).get(sessionId) as any;
        if (!row) return null;
        return {
          ...row,
          context: JSON.parse(row.context),
          history: JSON.parse(row.history)
        } as SessionRecord;
      },
      update: (sessionId: string, updates: { state?: string; context?: any; history?: any[] }): void => {
        const fields: string[] = [];
        const params: any[] = [];
        
        if (updates.state !== undefined) {
          fields.push('state = ?');
          params.push(updates.state);
        }
        if (updates.context !== undefined) {
          fields.push('context = ?');
          params.push(JSON.stringify(updates.context));
        }
        if (updates.history !== undefined) {
          fields.push('history = ?');
          params.push(JSON.stringify(updates.history));
        }
        fields.push('lastActivity = ?');
        params.push(Date.now());
        params.push(sessionId);
        
        this.db.prepare(`UPDATE orchestration_sessions SET ${fields.join(', ')} WHERE sessionId = ?`).run(...params);
      },
      addToHistory: (sessionId: string, entry: any): void => {
        const session = this.orchestration.sessions.get(sessionId);
        if (session) {
          const newHistory = [...session.history, { ...entry, timestamp: Date.now() }];
          this.orchestration.sessions.update(sessionId, { history: newHistory });
        }
      },
      cleanup: (): number => {
        const result = this.db.prepare(`DELETE FROM orchestration_sessions WHERE expiresAt < ?`).run(Date.now());
        return result.changes;
      },
       delete: (sessionId: string): boolean => {
        const result = this.db.prepare(`DELETE FROM orchestration_sessions WHERE sessionId = ?`).run(sessionId);
        return result.changes > 0;
      },
       getActiveCount: (): number => {
        const row = this.db.prepare(`SELECT COUNT(*) as count FROM orchestration_sessions WHERE expiresAt > ?`).get(Date.now()) as any;
        return row?.count || 0;
      }
    },
    votes: {
      cast: (vote: VoteRecord): void => {
        this.db.prepare(`
          INSERT OR REPLACE INTO orchestration_votes (id, pollId, voterId, choice, weight, timestamp, reasoning)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          vote.id, 
          vote.pollId, 
          vote.voterId, 
          vote.choice, 
          vote.weight || 1.0, 
          Date.now(), 
          vote.reasoning || null
        );
      },
      getResults: (pollId: string): Array<{ choice: string; totalWeight: number; count: number }> => {
        const rows = this.db.prepare(`
          SELECT 
            choice,
            SUM(weight) as totalWeight,
            COUNT(*) as count
          FROM orchestration_votes 
          WHERE pollId = ?
          GROUP BY choice
          ORDER BY totalWeight DESC
        `).all(pollId) as any[];
        return rows;
      },
      hasVoted: (pollId: string, voterId: string): boolean => {
        const row = this.db.prepare(`
          SELECT 1 FROM orchestration_votes WHERE pollId = ? AND voterId = ? LIMIT 1
        `).get(pollId, voterId);
        return !!row;
      },
      getVotesByPoll: (pollId: string): VoteRecord[] => {
        const rows = this.db.prepare(`SELECT * FROM orchestration_votes WHERE pollId = ? ORDER BY timestamp DESC`).all(pollId) as any[];
        return rows as VoteRecord[];
      },
       clearPoll: (pollId: string): number => {
        const result = this.db.prepare(`DELETE FROM orchestration_votes WHERE pollId = ?`).run(pollId);
        return result.changes;
      },
      getVoterHistory: (voterId: string, limit: number = 50): VoteRecord[] => {
        const rows = this.db.prepare(`
          SELECT * FROM orchestration_votes WHERE voterId = ? ORDER BY timestamp DESC LIMIT ?
        `).all(voterId, limit) as any[];
        return rows as VoteRecord[];
      }
    },
    stats: {
      record: (component: string, statType: string, statValue: any): void => {
        this.db.prepare(`
          INSERT INTO orchestration_stats (timestamp, component, statType, statValue)
          VALUES (?, ?, ?, ?)
        `).run(Date.now(), component, statType, JSON.stringify(statValue));
      },
       getByComponent: (component: string, limit: number = 100): any[] => {
        const rows = this.db.prepare(`
          SELECT * FROM orchestration_stats 
          WHERE component = ? 
          ORDER BY timestamp DESC 
          LIMIT ?
        `).all(component, limit) as any[];
        return rows.map(row => ({
          ...row,
          statValue: JSON.parse(row.statValue)
        }));
      },
      getByType: (statType: string, limit: number = 100): any[] => {
        const rows = this.db.prepare(`
          SELECT * FROM orchestration_stats 
          WHERE statType = ? 
          ORDER BY timestamp DESC 
          LIMIT ?
        `).all(statType, limit) as any[];
        return rows.map(row => ({
          ...row,
          statValue: JSON.parse(row.statValue)
        }));
      },
      getAggregated: (component: string, statType: string): { count: number; avg?: number; sum?: number } => {
        const rows = this.db.prepare(`
          SELECT statValue FROM orchestration_stats 
          WHERE component = ? AND statType = ?
        `).all(component, statType) as any[];
        
        const values = rows.map(r => {
          const v = JSON.parse(r.statValue);
          return typeof v === 'number' ? v : (v.value || v.score || 0);
        });
        if (values.length === 0) return { count: 0 };
        return {
          count: values.length,
          sum: values.reduce((a, b) => a + b, 0),
          avg: values.reduce((a, b) => a + b, 0) / values.length
        };
      },
       cleanup: (olderThanMs: number = 7 * 24 * 60 * 60 * 1000): number => {
        const cutoff = Date.now() - olderThanMs;
        const result = this.db.prepare(`DELETE FROM orchestration_stats WHERE timestamp < ?`).run(cutoff);
        return result.changes;
      }
    }
  };
  
  // MODULE AGENT  
  public agent = {
    saveState: (agentId: string, state: { status: string; currentTask?: string; memory?: any; lastActive: number; metadata?: any }) => {
      this.db.prepare(`
        INSERT OR REPLACE INTO agent_states (agentId, status, currentTask, memory, lastActive, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(agentId, state.status, state.currentTask || null, JSON.stringify(state.memory || {}), state.lastActive, JSON.stringify(state.metadata || {}));
    },
    getState: (agentId: string): any | null => {
      const row = this.db.prepare(`SELECT * FROM agent_states WHERE agentId = ?`).get(agentId) as any;
      return row ? { ...row, memory: JSON.parse(row.memory), metadata: JSON.parse(row.metadata) } : null;
    },
    listStates: (status?: string): any[] => {
      let sql = `SELECT * FROM agent_states`;
      const params: any[] = [];
      if (status) {
        sql += ` WHERE status = ?`;
        params.push(status);
      }
      sql += ` ORDER BY lastActive DESC`;
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => ({
        ...row,
        memory: JSON.parse(row.memory),
        metadata: JSON.parse(row.metadata)
      }));
    },
    deleteState: (agentId: string): boolean => {
      const result = this.db.prepare(`DELETE FROM agent_states WHERE agentId = ?`).run(agentId);
      return result.changes > 0;
    },
    cleanupInactive: (olderThanMs: number = 24 * 60 * 60 * 1000): number => {
      const cutoff = Date.now() - olderThanMs;
      const result = this.db.prepare(`DELETE FROM agent_states WHERE lastActive < ?`).run(cutoff);
      return result.changes;
    }
  };
  
  // MODULE CACHE  
  public cache = {
    savePermanentEntry: (entry: any): void => {
      this.db.prepare(`
        INSERT OR REPLACE INTO cache_permanent_entries 
        (hash, question, response, zone, usageCount, embedding, metadata, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(entry.hash, entry.question, entry.response, entry.zone, entry.usageCount || 0, entry.embedding || null, JSON.stringify(entry.metadata || {}), entry.createdAt || Date.now(), entry.updatedAt || Date.now());
    },
     getPermanentEntry: (hash: string): any | null => {
      const row = this.db.prepare(`SELECT * FROM cache_permanent_entries WHERE hash = ?`).get(hash) as any;
      return row ? { ...row, metadata: JSON.parse(row.metadata) } : null;
    },
    searchPermanentEntries: (zone?: string, minUsage: number = 0): any[] => {
      let sql = `SELECT * FROM cache_permanent_entries WHERE usageCount >= ?`;
      const params: any[] = [minUsage];
      if (zone) {
        sql += ` AND zone = ?`;
        params.push(zone);
      }
      sql += ` ORDER BY usageCount DESC`;
      return this.db.prepare(sql).all(...params) as any[];
    },
    searchByQuestion: (question: string, zone?: string): any | null => {
      let sql = `SELECT * FROM cache_permanent_entries WHERE question LIKE ?`;
      const params: any[] = [`%${question}%`];
      if (zone) {
        sql += ` AND zone = ?`;
        params.push(zone);
      }
      sql += ` ORDER BY usageCount DESC LIMIT 1`;
      const row = this.db.prepare(sql).get(...params) as any;
      return row ? { ...row, metadata: JSON.parse(row.metadata) } : null;
    },
     incrementUsage: (hash: string): void => {
      this.db.prepare(`UPDATE cache_permanent_entries SET usageCount = usageCount + 1, updatedAt = ? WHERE hash = ?`).run(Date.now(), hash);
    },
     saveEmbedding: (hash: string, embedding: number[], model: string): void => {
      this.db.prepare(`INSERT OR REPLACE INTO cache_embeddings (hash, embedding, model, createdAt) VALUES (?, ?, ?, ?)`).run(hash, JSON.stringify(embedding), model, Date.now());
    },
    getEmbedding: (hash: string): number[] | null => {
      const row = this.db.prepare(`SELECT embedding FROM cache_embeddings WHERE hash = ?`).get(hash) as any;
      return row ? JSON.parse(row.embedding) : null;
    },
    deleteOldEntries: (olderThanMs: number = 30 * 24 * 60 * 60 * 1000): number => {
      const cutoff = Date.now() - olderThanMs;
      const result = this.db.prepare(`DELETE FROM cache_permanent_entries WHERE updatedAt < ? AND usageCount = 0`).run(cutoff);
      return result.changes;
    }
  };
  
  // 🔥 NOUVEAU: MODULE QR INDEX  
  public qr = {
    save: (entry: QREntry): void => {
      const now = Date.now();
      this.db.prepare(`
        INSERT OR REPLACE INTO qr_index 
        (id, question, answer, sourceFile, sourcePath, zone, embedding, keywords, confidence, usageCount, createdAt, updatedAt, category, language)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.id, entry.question, entry.answer, entry.sourceFile, entry.sourcePath,
        entry.zone, JSON.stringify(entry.embedding), JSON.stringify(entry.keywords),
        entry.confidence, entry.usageCount || 0, entry.createdAt || now, entry.updatedAt || now,
        entry.category || 'general', entry.language || 'fr'
      );
    },

    get: (id: string): QREntry | null => {
      const row = this.db.prepare(`SELECT * FROM qr_index WHERE id = ?`).get(id) as any;
      if (!row) return null;
      return {
        ...row,
        embedding: JSON.parse(row.embedding),
        keywords: JSON.parse(row.keywords)
      } as QREntry;
    },

    searchBySimilarity: (embedding: number[], threshold: number = 0.75, zone?: string): QREntry[] => {
      let sql = `SELECT * FROM qr_index WHERE 1=1`;
      const params: any[] = [];
      
      if (zone) {
        sql += ` AND zone = ?`;
        params.push(zone);
      }
      
      sql += ` ORDER BY confidence DESC LIMIT 10`;
      const rows = this.db.prepare(sql).all(...params) as any[];
      
      const results: QREntry[] = [];
      for (const row of rows) {
        const rowEmbedding = JSON.parse(row.embedding);
        const similarity = this.cosineSimilarity(embedding, rowEmbedding);
        if (similarity >= threshold) {
          results.push({
            ...row,
            embedding: rowEmbedding,
            keywords: JSON.parse(row.keywords),
            similarity
          } as any);
        }
      }
      
      return (results as any).sort((a: any, b: any) => b.similarity - a.similarity);
    },

    searchByKeywords: (keywords: string[], zone?: string): QREntry[] => {
      let sql = `SELECT * FROM qr_index WHERE 1=1`;
      const params: any[] = [];
      
      if (zone) {
        sql += ` AND zone = ?`;
        params.push(zone);
      }
      
      const rows = this.db.prepare(sql).all(...params) as any[];
      
      const results: QREntry[] = [];
      for (const row of rows) {
        const rowKeywords = JSON.parse(row.keywords);
        const matchCount = keywords.filter(k => rowKeywords.includes(k)).length;
        if (matchCount > 0) {
          results.push({
            ...row,
            embedding: JSON.parse(row.embedding),
            keywords: rowKeywords,
            matchScore: matchCount / keywords.length
          } as any);
        }
      }
      
      return (results as any).sort((a: any, b: any) => b.matchScore - a.matchScore);
    },

    searchHybrid: (query: string, embedding: number[], zone?: string): QREntry | null => {
      const embeddingResults = this.qr.searchBySimilarity(embedding, 0.7, zone);
      const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const keywordResults = this.qr.searchByKeywords(keywords, zone);
      
      const merged = new Map<string, { entry: QREntry; score: number }>();
      
      for (const r of embeddingResults) {
        merged.set(r.id, { entry: r, score: ((r as any).similarity || 0) * 0.7 });
      }
      
      for (const r of keywordResults) {
        const existing = merged.get(r.id);
        if (existing) {
          existing.score += ((r as any).matchScore || 0) * 0.3;
        } else {
          merged.set(r.id, { entry: r, score: ((r as any).matchScore || 0) * 0.3 });
        }
      }
      
      const best = Array.from(merged.values()).sort((a, b) => b.score - a.score)[0];
      return best?.entry || null;
    },

    incrementUsage: (id: string): void => {
      this.db.prepare(`UPDATE qr_index SET usageCount = usageCount + 1, updatedAt = ? WHERE id = ?`).run(Date.now(), id);
    },

    delete: (id: string): boolean => {
      const result = this.db.prepare(`DELETE FROM qr_index WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    getStats: (): { total: number; byZone: Record<string, number>; avgConfidence: number } => {
      const total = this.db.prepare(`SELECT COUNT(*) as count FROM qr_index`).get() as any;
      
      const byZoneRows = this.db.prepare(`SELECT zone, COUNT(*) as count FROM qr_index GROUP BY zone`).all() as any[];
      
      const byZone: Record<string, number> = {};
      for (const row of byZoneRows) {
        byZone[row.zone] = row.count;
      }
      
      const avgConfidence = this.db.prepare(`SELECT AVG(confidence) as avg FROM qr_index`).get() as any;
      
      return {
        total: total?.count || 0,
        byZone,
        avgConfidence: avgConfidence?.avg || 0
      };
    },

    cleanup: (olderThanMs: number = 90 * 24 * 60 * 60 * 1000, minUsage: number = 0): number => {
      const cutoff = Date.now() - olderThanMs;
      const result = this.db.prepare(`DELETE FROM qr_index WHERE updatedAt < ? AND usageCount <= ?`).run(cutoff, minUsage);
      return result.changes;
    }
  };

  // ==========================================================================
  // 🔥 MODULE INNOVATIONS (Vision par similarité)
  // ==========================================================================

  public innovations = {
    // Sous-espaces (Zero-Shot & Few-Shot)
    saveSubspace: (id: string, subspace: InnovationSubspace): void => {
      this.db.prepare(`
        INSERT OR REPLACE INTO innovation_subspaces 
        (id, name, type, subspace_data, reference_images, created_at, updated_at, version, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        subspace.name || id,
        subspace.type || 'zero_shot',
        JSON.stringify({
          mean: subspace.mean,
          components: subspace.components,
          explainedVariance: subspace.explainedVariance,
          threshold: subspace.threshold
        }),
        JSON.stringify(subspace.referenceImages || []),
        subspace.createdAt ? new Date(subspace.createdAt).getTime() : Date.now(),
        Date.now(),
        subspace.version || 1,
        JSON.stringify(subspace.metadata || {})
      );
    },

    getSubspace: (id: string): InnovationSubspace | null => {
      const row = this.db.prepare(`SELECT * FROM innovation_subspaces WHERE id = ?`).get(id) as any;
      if (!row) return null;
      const subspaceData = JSON.parse(row.subspace_data);
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        mean: subspaceData.mean,
        components: subspaceData.components,
        explainedVariance: subspaceData.explainedVariance,
        threshold: subspaceData.threshold,
        referenceImages: JSON.parse(row.reference_images),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        version: row.version,
        metadata: JSON.parse(row.metadata)
      };
    },

    listSubspaces: (type?: string): Partial<InnovationSubspace>[] => {
      let sql = `SELECT id, name, type, created_at, updated_at FROM innovation_subspaces`;
      const params: any[] = [];
      if (type) {
        sql += ` WHERE type = ?`;
        params.push(type);
      }
      sql += ` ORDER BY created_at DESC`;
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    },

    deleteSubspace: (id: string): boolean => {
      const result = this.db.prepare(`DELETE FROM innovation_subspaces WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    // Analyse historique (Computer-Use, Dual Consensus)
    saveAnalysis: (analysis: InnovationAnalysis): void => {
      this.db.prepare(`
        INSERT INTO innovation_analysis_history 
        (id, innovation_type, analysis_data, detected_elements, suggested_actions, raw_response, user_id, session_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        analysis.id,
        analysis.innovationType,
        JSON.stringify(analysis.analysisData),
        analysis.detectedElements ? JSON.stringify(analysis.detectedElements) : null,
        analysis.suggestedActions ? JSON.stringify(analysis.suggestedActions) : null,
        analysis.rawResponse || null,
        analysis.userId || null,
        analysis.sessionId || null,
        Date.now()
      );
    },

    getAnalysisHistory: (innovationType?: string, limit: number = 100): InnovationAnalysis[] => {
      let sql = `SELECT * FROM innovation_analysis_history`;
      const params: any[] = [];
      if (innovationType) {
        sql += ` WHERE innovation_type = ?`;
        params.push(innovationType);
      }
      sql += ` ORDER BY created_at DESC LIMIT ?`;
      params.push(limit);
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => ({
        id: row.id,
        innovationType: row.innovation_type,
        analysisData: JSON.parse(row.analysis_data),
        detectedElements: row.detected_elements ? JSON.parse(row.detected_elements) : [],
        suggestedActions: row.suggested_actions ? JSON.parse(row.suggested_actions) : [],
        rawResponse: row.raw_response,
        userId: row.user_id,
        sessionId: row.session_id,
        createdAt: row.created_at
      }));
    },

    // Feedback utilisateur
    saveFeedback: (feedback: InnovationFeedback): void => {
      this.db.prepare(`
        INSERT INTO innovation_feedback 
        (id, prediction_id, image_id, innovation_type, user_feedback, correction, confidence_score, similarity_score, user_id, created_at, processed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        feedback.id,
        feedback.predictionId,
        feedback.imageId || null,
        feedback.innovationType,
        feedback.userFeedback,
        feedback.correction || null,
        feedback.confidenceScore || null,
        feedback.similarityScore || null,
        feedback.userId || null,
        Date.now()
      );
    },

    getFeedbackStats: (innovationType?: string): {
      total: number;
      confirmRate: number;
      correctRate: number;
      rejectRate: number;
      avgConfidenceWhenCorrect: number;
      avgConfidenceWhenWrong: number;
    } => {
      let sql = `SELECT user_feedback, confidence_score, similarity_score FROM innovation_feedback`;
      const params: any[] = [];
      if (innovationType) {
        sql += ` WHERE innovation_type = ?`;
        params.push(innovationType);
      }
      const rows = this.db.prepare(sql).all(...params) as any[];
      
      const confirms = rows.filter(r => r.user_feedback === 'confirm');
      const corrections = rows.filter(r => r.user_feedback === 'correct');
      const rejects = rows.filter(r => r.user_feedback === 'reject');
      
      const correctConfidences = [...confirms, ...corrections]
        .map(r => r.confidence_score || r.similarity_score || 0)
        .filter(s => s > 0);
      
      const wrongConfidences = rejects
        .map(r => r.confidence_score || r.similarity_score || 0)
        .filter(s => s > 0);
      
      return {
        total: rows.length,
        confirmRate: rows.length > 0 ? confirms.length / rows.length : 0,
        correctRate: rows.length > 0 ? corrections.length / rows.length : 0,
        rejectRate: rows.length > 0 ? rejects.length / rows.length : 0,
        avgConfidenceWhenCorrect: correctConfidences.length > 0 ? 
          correctConfidences.reduce((a,b) => a + b, 0) / correctConfidences.length : 0,
        avgConfidenceWhenWrong: wrongConfidences.length > 0 ? 
          wrongConfidences.reduce((a,b) => a + b, 0) / wrongConfidences.length : 0
      };
    },

    // BM25 Index pour recherche hybride
    addToBM25Index: (term: string, documentId: string, tf: number, docLength: number): void => {
      this.db.prepare(`
        INSERT OR REPLACE INTO innovation_bm25_index (term, document_id, tf, doc_length)
        VALUES (?, ?, ?, ?)
      `).run(term.toLowerCase(), documentId, tf, docLength);
    },

    searchBM25: (terms: string[], limit: number = 10): Array<{ documentId: string; score: number }> => {
      if (terms.length === 0) return [];
      
      const placeholders = terms.map(() => '?').join(',');
      const rows = this.db.prepare(`
        SELECT document_id, SUM(tf) as total_tf, AVG(doc_length) as avg_len
        FROM innovation_bm25_index
        WHERE term IN (${placeholders})
        GROUP BY document_id
        ORDER BY total_tf DESC
        LIMIT ?
      `).all(...terms.map(t => t.toLowerCase()), limit) as any[];
      
      return rows.map(row => ({
        documentId: row.document_id,
        score: Math.min(1, row.total_tf / 10)
      }));
    },

    clearBM25Index: (): number => {
      const result = this.db.prepare(`DELETE FROM innovation_bm25_index`).run();
      return result.changes;
    },

    // Sessions d'entraînement Few-Shot
    saveTrainingSession: (session: InnovationTrainingSession): void => {
      this.db.prepare(`
        INSERT OR REPLACE INTO innovation_training_sessions 
        (id, defect_name, description, positive_samples, negative_samples, status, detector_id, created_at, completed_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        session.id,
        session.defectName,
        session.description || null,
        JSON.stringify(session.positiveSamples),
        JSON.stringify(session.negativeSamples),
        session.status,
        session.detectorId || null,
        Date.now(),
        session.status === 'completed' ? Date.now() : null,
        JSON.stringify(session.metadata || {})
      );
    },

    updateTrainingSessionStatus: (id: string, status: string, detectorId?: string): void => {
      const completedAt = status === 'completed' ? Date.now() : null;
      this.db.prepare(`
        UPDATE innovation_training_sessions 
        SET status = ?, detector_id = ?, completed_at = COALESCE(?, completed_at)
        WHERE id = ?
      `).run(status, detectorId || null, completedAt, id);
    },

    getTrainingSession: (id: string): InnovationTrainingSession | null => {
      const row = this.db.prepare(`SELECT * FROM innovation_training_sessions WHERE id = ?`).get(id) as any;
      if (!row) return null;
      return {
        id: row.id,
        defectName: row.defect_name,
        description: row.description,
        positiveSamples: JSON.parse(row.positive_samples),
        negativeSamples: JSON.parse(row.negative_samples),
        status: row.status as any,
        detectorId: row.detector_id,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        metadata: JSON.parse(row.metadata)
      };
    },

    listTrainingSessions: (status?: string): InnovationTrainingSession[] => {
      let sql = `SELECT * FROM innovation_training_sessions`;
      const params: any[] = [];
      if (status) {
        sql += ` WHERE status = ?`;
        params.push(status);
      }
      sql += ` ORDER BY created_at DESC`;
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => ({
        id: row.id,
        defectName: row.defect_name,
        description: row.description,
        positiveSamples: JSON.parse(row.positive_samples),
        negativeSamples: JSON.parse(row.negative_samples),
        status: row.status as any,
        detectorId: row.detector_id,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        metadata: JSON.parse(row.metadata)
      }));
    },

    // Seuils de confiance
    saveThresholds: (thresholdType: string, thresholds: { high: number; medium: number; low: number }): void => {
      const existing = this.db.prepare(`SELECT version FROM innovation_thresholds WHERE threshold_type = ? ORDER BY version DESC LIMIT 1`)
        .get(thresholdType) as any;
      const newVersion = (existing?.version || 0) + 1;
      
      this.db.prepare(`
        INSERT INTO innovation_thresholds (id, threshold_type, high, medium, low, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `${thresholdType}_v${newVersion}`,
        thresholdType,
        thresholds.high,
        thresholds.medium,
        thresholds.low,
        newVersion,
        Date.now(),
        Date.now()
      );
    },

    getLatestThresholds: (thresholdType: string): { high: number; medium: number; low: number } | null => {
      const row = this.db.prepare(`
        SELECT high, medium, low FROM innovation_thresholds 
        WHERE threshold_type = ? ORDER BY version DESC LIMIT 1
      `).get(thresholdType) as any;
      return row ? { high: row.high, medium: row.medium, low: row.low } : null;
    }
  };

  // ==========================================================================
  // 🔥 MODULE INNOVATIONS TECH (8 IA Pro)
  // ==========================================================================

  public innovationsTech = {
    // Sauvegarder une analyse
    saveAnalysis: (analysis: TechAnalysis): void => {
      this.db.prepare(`
        INSERT INTO innovations_tech_history 
        (id, innovation_type, analysis_data, detected_elements, suggested_actions, confidence, success, created_at, user_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        analysis.id,
        analysis.innovationType,
        JSON.stringify(analysis.analysisData),
        analysis.detectedElements ? JSON.stringify(analysis.detectedElements) : null,
        analysis.suggestedActions ? JSON.stringify(analysis.suggestedActions) : null,
        analysis.confidence || null,
        analysis.success !== false ? 1 : 0,
        Date.now(),
        analysis.userId || null,
        JSON.stringify(analysis.metadata || {})
      );
    },

    // Récupérer l'historique
    getHistory: (innovationType?: string, limit: number = 50): TechAnalysis[] => {
      let sql = `SELECT * FROM innovations_tech_history`;
      const params: any[] = [];
      if (innovationType) {
        sql += ` WHERE innovation_type = ?`;
        params.push(innovationType);
      }
      sql += ` ORDER BY created_at DESC LIMIT ?`;
      params.push(limit);
      
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => ({
        id: row.id,
        innovationType: row.innovation_type,
        analysisData: JSON.parse(row.analysis_data),
        detectedElements: row.detected_elements ? JSON.parse(row.detected_elements) : [],
        suggestedActions: row.suggested_actions ? JSON.parse(row.suggested_actions) : [],
        confidence: row.confidence,
        success: row.success === 1,
        createdAt: row.created_at,
        userId: row.user_id,
        metadata: JSON.parse(row.metadata)
      }));
    },

    // Enregistrer une métrique
    recordMetric: (innovationId: number, innovationName: string, metricName: string, metricValue: number): void => {
      this.db.prepare(`
        INSERT INTO innovations_tech_metrics (innovation_id, innovation_name, metric_name, metric_value, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run(innovationId, innovationName, metricName, metricValue, Date.now());
    },

    // Obtenir les métriques par innovation
    getMetrics: (innovationId: number, metricName?: string, limit: number = 100): TechMetric[] => {
      let sql = `SELECT * FROM innovations_tech_metrics WHERE innovation_id = ?`;
      const params: any[] = [innovationId];
      if (metricName) {
        sql += ` AND metric_name = ?`;
        params.push(metricName);
      }
      sql += ` ORDER BY timestamp DESC LIMIT ?`;
      params.push(limit);
      
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => ({
        innovationId: row.innovation_id,
        innovationName: row.innovation_name,
        metricName: row.metric_name,
        metricValue: row.metric_value,
        timestamp: row.timestamp
      }));
    },

    // Sauvegarder un sous-espace (pour Zero-Shot et Few-Shot)
    saveSubspace: (subspace: TechSubspace): void => {
      this.db.prepare(`
        INSERT OR REPLACE INTO innovations_tech_subspaces 
        (id, name, type, subspace_data, reference_images, created_at, updated_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        subspace.id,
        subspace.name,
        subspace.type,
        JSON.stringify(subspace.subspaceData),
        JSON.stringify(subspace.referenceImages),
        Date.now(),
        Date.now(),
        JSON.stringify(subspace.metadata || {})
      );
    },

    // Récupérer un sous-espace
    getSubspace: (id: string): TechSubspace | null => {
      const row = this.db.prepare(`SELECT * FROM innovations_tech_subspaces WHERE id = ?`).get(id) as any;
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        subspaceData: JSON.parse(row.subspace_data),
        referenceImages: JSON.parse(row.reference_images),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: JSON.parse(row.metadata)
      };
    },

    // Lister les sous-espaces
    listSubspaces: (type?: string): Partial<TechSubspace>[] => {
      let sql = `SELECT id, name, type, created_at, updated_at FROM innovations_tech_subspaces`;
      const params: any[] = [];
      if (type) {
        sql += ` WHERE type = ?`;
        params.push(type);
      }
      sql += ` ORDER BY created_at DESC`;
      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    },

    // Supprimer un sous-espace
    deleteSubspace: (id: string): boolean => {
      const result = this.db.prepare(`DELETE FROM innovations_tech_subspaces WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    // Sauvegarder un feedback
    saveFeedback: (feedback: TechFeedback): void => {
      this.db.prepare(`
        INSERT INTO innovations_tech_feedback (id, prediction_id, image_id, innovation_type, user_feedback, correction, confidence_score, created_at, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        feedback.id,
        feedback.predictionId,
        feedback.imageId || null,
        feedback.innovationType,
        feedback.userFeedback,
        feedback.correction || null,
        feedback.confidenceScore || null,
        Date.now(),
        feedback.userId || null
      );
    },

    // Obtenir les statistiques de feedback
    getFeedbackStats: (innovationType?: string): {
      total: number;
      confirmRate: number;
      correctRate: number;
      rejectRate: number;
      avgConfidence: number;
    } => {
      let sql = `SELECT user_feedback, confidence_score FROM innovations_tech_feedback`;
      const params: any[] = [];
      if (innovationType) {
        sql += ` WHERE innovation_type = ?`;
        params.push(innovationType);
      }
      const rows = this.db.prepare(sql).all(...params) as any[];
      
      const total = rows.length;
      if (total === 0) {
        return { total: 0, confirmRate: 0, correctRate: 0, rejectRate: 0, avgConfidence: 0 };
      }
      
      const confirms = rows.filter(r => r.user_feedback === 'confirm').length;
      const corrections = rows.filter(r => r.user_feedback === 'correct').length;
      const rejects = rows.filter(r => r.user_feedback === 'reject').length;
      const avgConfidence = rows.reduce((sum, r) => sum + (r.confidence_score || 0), 0) / total;
      
      return {
        total,
        confirmRate: confirms / total,
        correctRate: corrections / total,
        rejectRate: rejects / total,
        avgConfidence
      };
    }
  };

  // ==========================================================================
  // 🔥 MODULE PART MATCHING (Innovation #9)
  // ==========================================================================
  public partMatching = {
    // Récupérer une image globale par ID
    getGlobalImage: (imageId: string): GlobalImageRecord | null => {
      const row = this.db.prepare(`
        SELECT * FROM part_matching_global_images 
        WHERE image_id = ? OR id = ?
        LIMIT 1
      `).get(imageId, imageId) as GlobalImageRecord | undefined;
      
      if (!row) return null;
      return {
        ...row,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
      } as GlobalImageRecord;
    },

    // Lister toutes les images globales
    listGlobalImages: (): GlobalImageRecord[] => {
      const rows = this.db.prepare(`
        SELECT * FROM part_matching_global_images
        ORDER BY processed_at DESC
      `).all() as GlobalImageRecord[];
      
      return rows.map(row => ({
        ...row,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
      } as GlobalImageRecord));
    },

    // Sauvegarder une image globale
    saveGlobalImage: (data: GlobalImageRecord): void => {
      this.db.prepare(`
        INSERT OR REPLACE INTO part_matching_global_images 
        (id, image_id, grid_rows, grid_cols, overlap, patch_size, total_parts, processed_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.id, data.imageId, data.gridRows, data.gridCols, 
        data.overlap, data.patchSize, data.totalParts, 
        Date.now(), JSON.stringify(data.metadata || {})
      );
    },

    // Récupérer les patches similaires
    searchSimilarPatches: (features: number[], limit: number = 10): PatchSearchResult[] => {
      const allPatches = this.db.prepare(`
        SELECT * FROM part_matching_patches
      `).all() as any[];
      
      const cosineSimilarity = (a: number[], b: number[]) => {
        const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
        const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
        const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
        return magA && magB ? dot / (magA * magB) : 0;
      };
      
      const results = allPatches.map(row => {
        const patchFeatures = JSON.parse(row.features);
        return {
          id: row.id,
          globalImageId: row.global_image_id,
          position: { x: row.position_x, y: row.position_y, width: row.width, height: row.height },
          gridPosition: { row: row.grid_row, col: row.grid_col },
          features: patchFeatures,
          tags: JSON.parse(row.tags),
          confidence: row.confidence,
          createdAt: row.created_at,
          similarity: cosineSimilarity(features, patchFeatures)
        } as PatchSearchResult;
      }).filter(p => p.similarity > 0.5)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
      
      return results;
    },

    // Récupérer un patch par ID
    getPatch: (patchId: string): PatchRecord | null => {
      const row = this.db.prepare(`SELECT * FROM part_matching_patches WHERE id = ?`).get(patchId) as Record<string, any> | undefined;
      if (!row) return null;
      return {
        id: row.id,
        globalImageId: row.global_image_id,
        position: { x: row.position_x, y: row.position_y, width: row.width, height: row.height },
        gridPosition: { row: row.grid_row, col: row.grid_col },
        features: JSON.parse(row.features),
        tags: JSON.parse(row.tags),
        confidence: row.confidence,
        createdAt: row.created_at
      } as PatchRecord;
    },

    // Sauvegarder un patch
    savePatch: (patch: PatchRecord): void => {
      this.db.prepare(`
        INSERT OR REPLACE INTO part_matching_patches 
        (id, global_image_id, position_x, position_y, width, height, grid_row, grid_col, features, tags, confidence, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        patch.id, patch.globalImageId, patch.position.x, patch.position.y,
        patch.position.width, patch.position.height, patch.gridPosition.row,
        patch.gridPosition.col, JSON.stringify(patch.features),
        JSON.stringify(patch.tags), patch.confidence, Date.now()
      );
    },

    // Sauvegarder une relation hiérarchique
    saveHierarchy: (relation: HierarchyRelation): void => {
      this.db.prepare(`
        INSERT OR REPLACE INTO part_matching_hierarchy 
        (child_id, parent_id, relationship_type, matched_zone, confidence, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        relation.childId, relation.parentId, relation.relationshipType,
        JSON.stringify(relation.matchedZone), relation.confidence, Date.now()
      );
    },

    // Obtenir le parent
    getParent: (childId: string): HierarchyRelation | null => {
      const row = this.db.prepare(`
        SELECT * FROM part_matching_hierarchy 
        WHERE child_id = ?
        ORDER BY confidence DESC LIMIT 1
      `).get(childId) as Record<string, any> | undefined;
      
      if (!row) return null;
      return {
        childId: row.child_id,
        parentId: row.parent_id,
        relationshipType: row.relationship_type,
        matchedZone: JSON.parse(row.matched_zone),
        confidence: row.confidence,
        createdAt: row.created_at
      } as HierarchyRelation;
    },

    // Obtenir les enfants
    getChildren: (parentId: string): HierarchyRelation[] => {
      const rows = this.db.prepare(`
        SELECT * FROM part_matching_hierarchy 
        WHERE parent_id = ?
        ORDER BY confidence DESC
      `).all(parentId) as Array<Record<string, any>>;
      
      return rows.map(row => ({
        childId: row.child_id,
        parentId: row.parent_id,
        relationshipType: row.relationship_type,
        matchedZone: JSON.parse(row.matched_zone),
        confidence: row.confidence,
        createdAt: row.created_at
      } as HierarchyRelation));
    },

    // Obtenir les statistiques
    getStats: (): { globalImagesCount: number; totalPatchesCount: number; successfulMatches: number; totalSearches: number; lastUpdated: number | null } => {
      const row = this.db.prepare(`SELECT * FROM part_matching_stats WHERE id = 1`).get() as Record<string, any> | undefined;
      if (!row) {
        return {
          globalImagesCount: 0,
          totalPatchesCount: 0,
          successfulMatches: 0,
          totalSearches: 0,
          lastUpdated: null
        };
      }
      return {
        globalImagesCount: row.global_images_count,
        totalPatchesCount: row.total_patches_count,
        successfulMatches: row.successful_matches,
        totalSearches: row.total_searches,
        lastUpdated: row.last_updated
      };
    },

    // Mettre à jour les statistiques
    updateStats: (stats: any): void => {
      this.db.prepare(`
        UPDATE part_matching_stats SET
          global_images_count = ?,
          total_patches_count = ?,
          successful_matches = ?,
          total_searches = ?,
          last_updated = ?
        WHERE id = 1
      `).run(
        stats.globalImagesCount ?? 0,
        stats.totalPatchesCount ?? 0,
        stats.successfulMatches ?? 0,
        stats.totalSearches ?? 0,
        Date.now()
      );
    },

    // Incrémenter les compteurs de recherche
    incrementSearchCount: (success: boolean = false): void => {
      const current = this.partMatching.getStats();
      this.partMatching.updateStats({
        totalSearches: (current.totalSearches || 0) + 1,
        successfulMatches: (current.successfulMatches || 0) + (success ? 1 : 0)
      });
    }
  };

  // ==========================================================================
  // 📚 MODULE REFERENCE (Bibliothèque d'IDs structurés)
  // ==========================================================================
  public reference = {
    // Zones
    getZones: () => {
      return this.db.prepare(`SELECT * FROM ref_zones ORDER BY name ASC`).all() as any[];
    },
    saveZone: (zone: any) => {
      const now = Date.now();
      this.db.prepare(`
        INSERT OR REPLACE INTO ref_zones (id, name, description, createdAt, updatedAt, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(zone.id, zone.name, zone.description || '', zone.createdAt || now, now, JSON.stringify(zone.metadata || {}));
    },
    deleteZone: (id: string) => {
      this.db.prepare(`DELETE FROM ref_zones WHERE id = ?`).run(id);
    },

    // Circuits
    getCircuits: (zoneId?: string) => {
      let sql = `SELECT * FROM ref_circuits`;
      const params: any[] = [];
      if (zoneId) {
        sql += ` WHERE zoneId = ?`;
        params.push(zoneId);
      }
      sql += ` ORDER BY name ASC`;
      return this.db.prepare(sql).all(...params) as any[];
    },
    saveCircuit: (circuit: any) => {
      const now = Date.now();
      this.db.prepare(`
        INSERT OR REPLACE INTO ref_circuits (id, zoneId, name, description, createdAt, updatedAt, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(circuit.id, circuit.zoneId, circuit.name, circuit.description || '', circuit.createdAt || now, now, JSON.stringify(circuit.metadata || {}));
    },
    deleteCircuit: (id: string) => {
      this.db.prepare(`DELETE FROM ref_circuits WHERE id = ?`).run(id);
    },

    // Paramètres
    getParametres: (circuitId?: string) => {
      let sql = `SELECT * FROM ref_parametres`;
      const params: any[] = [];
      if (circuitId) {
        sql += ` WHERE circuitId = ?`;
        params.push(circuitId);
      }
      sql += ` ORDER BY name ASC`;
      return this.db.prepare(sql).all(...params) as any[];
    },
    saveParametre: (param: any) => {
      const now = Date.now();
      this.db.prepare(`
        INSERT OR REPLACE INTO ref_parametres (id, circuitId, name, description, unit, dataType, createdAt, updatedAt, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(param.id, param.circuitId, param.name, param.description || '', param.unit || '', param.dataType || 'numeric', param.createdAt || now, now, JSON.stringify(param.metadata || {}));
    },
    deleteParametre: (id: string) => {
      this.db.prepare(`DELETE FROM ref_parametres WHERE id = ?`).run(id);
    },

    // Hiérarchie complète
    getHierarchy: () => {
      const zones = this.reference.getZones();
      const circuits = this.reference.getCircuits();
      const params = this.reference.getParametres();

      return zones.map(z => ({
        ...z,
        circuits: circuits.filter(c => c.zoneId === z.id).map(c => ({
          ...c,
          parametres: params.filter(p => p.circuitId === c.id)
        }))
      }));
    },

    // Stats
    getStats: () => {
      const zones = this.db.prepare(`SELECT COUNT(*) as count FROM ref_zones`).get() as any;
      const circuits = this.db.prepare(`SELECT COUNT(*) as count FROM ref_circuits`).get() as any;
      const params = this.db.prepare(`SELECT COUNT(*) as count FROM ref_parametres`).get() as any;
      const linkedImages = this.db.prepare(`
        SELECT COUNT(*) as count FROM vision_data 
        WHERE metadata LIKE '%zoneId%' OR metadata LIKE '%circuitId%' OR metadata LIKE '%parameterId%'
      `).get() as any;

      return {
        zones: zones?.count || 0,
        circuits: circuits?.count || 0,
        parametres: params?.count || 0,
        linkedImages: linkedImages?.count || 0
      };
    },

    // Recherche
    search: (query: string) => {
      const q = `%${query}%`;
      const zones = this.db.prepare(`SELECT 'zone' as type, id, name, description FROM ref_zones WHERE name LIKE ? OR id LIKE ?`).all(q, q);
      const circuits = this.db.prepare(`SELECT 'circuit' as type, id, name, description FROM ref_circuits WHERE name LIKE ? OR id LIKE ?`).all(q, q);
      const params = this.db.prepare(`SELECT 'parametre' as type, id, name, description FROM ref_parametres WHERE name LIKE ? OR id LIKE ?`).all(q, q);
      const aliases = this.db.prepare(`SELECT entityType as type, entityId as id, alias as name, 'Alias' as description FROM ref_aliases WHERE alias LIKE ?`).all(q);

      return [...zones, ...circuits, ...params, ...aliases];
    },

    // Aliases
    saveAlias: (aliasData: { entityId: string; alias: string; entityType: string }) => {
      this.db.prepare(`
        INSERT OR REPLACE INTO ref_aliases (entityId, alias, entityType, createdAt)
        VALUES (?, ?, ?, ?)
      `).run(aliasData.entityId, aliasData.alias, aliasData.entityType, Date.now());
    },
    getAliases: (entityId: string) => {
      return this.db.prepare(`SELECT * FROM ref_aliases WHERE entityId = ?`).all(entityId) as any[];
    },
    // Linked Images
    getLinkedImages: (entityId: string, entityType: 'zone' | 'circuit' | 'parametre') => {
      const field = entityType === 'zone' ? 'zoneId' : entityType === 'circuit' ? 'circuitId' : 'parametreId';
      // Utilisation de JSON_EXTRACT si possible, sinon LIKE
      try {
        return this.db.prepare(`
          SELECT * FROM vision_data 
          WHERE json_extract(metadata, '$.${field}') = ?
        `).all(entityId) as any[];
      } catch (e) {
        return this.db.prepare(`
          SELECT * FROM vision_data 
          WHERE metadata LIKE ?
        `).all(`%\"${field}\":\"${entityId}\"%`) as any[];
      }
    }
  };

  // ==========================================================================
  // 🔥 MODULE VISION (Table principale des images)
  // ==========================================================================
  
  public vision = {
    saveImage: (data: any): void => {
      this.db.prepare(`
        INSERT OR REPLACE INTO vision_data 
        (id, filename, filepath, thumbnail_path, description, tags, location, folder_id, date, created_at, 
         qa_pairs, invocation_keywords, equipment_state, valid_until, linked_procedure, image_base64, 
         image_type, width, height, file_size, mime_type, file_hash, linked_document_ids, author, 
         document_type, related_docs, ocr_text, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.id,
        data.filename,
        data.filepath || '',
        data.thumbnail_path || data.thumbnailPath || null,
        data.description || null,
        JSON.stringify(data.tags || []),
        data.location || null,
        data.folder_id || data.folderId || 'root',
        data.date || new Date().toISOString(),
        data.created_at || data.createdAt || Date.now(),
        data.qa_pairs || data.qaPairs || null,
        data.invocation_keywords || data.invocationKeywords || null,
        data.equipment_state || data.equipmentState || 'normal',
        data.valid_until || data.validUntil || null,
        data.linked_procedure || data.linkedProcedure || null,
        data.image_base64 || data.image || null,
        data.image_type || data.imageType || 'simple',
        data.width || null,
        data.height || null,
        data.file_size || data.fileSize || null,
        data.mime_type || data.mimeType || 'image/jpeg',
        data.file_hash || data.hash || data.fileHash || null,
        data.linked_document_ids ? JSON.stringify(data.linked_document_ids) : (data.linkedDocumentIds ? JSON.stringify(data.linkedDocumentIds) : null),
        data.author || null,
        data.document_type || data.documentType || null,
        data.related_docs ? JSON.stringify(data.related_docs) : (data.relatedDocs ? JSON.stringify(data.relatedDocs) : null),
        data.ocr_text || data.ocrText || null,
        JSON.stringify(data.metadata || {})
      );
    },
    getImage: (id: string): any | null => {
      const row = this.db.prepare(`SELECT * FROM vision_data WHERE id = ?`).get(id) as Record<string, any> | undefined;
      if (!row) return null;
      const linkedDocs = row.linked_document_ids ? JSON.parse(row.linked_document_ids) : [];
      const related = row.related_docs ? JSON.parse(row.related_docs) : [];
      return {
        ...row,
        tags: JSON.parse(row.tags || '[]'),
        metadata: JSON.parse(row.metadata || '{}'),
        linkedDocumentIds: linkedDocs,
        linked_document_ids: linkedDocs,
        relatedDocs: related,
        related_docs: related,
        image: row.image_base64,
        folderId: row.folder_id,
        createdAt: row.created_at,
        imageType: row.image_type,
        qaPairs: row.qa_pairs,
        invocationKeywords: row.invocation_keywords,
        equipmentState: row.equipment_state,
        validUntil: row.valid_until,
        linkedProcedure: row.linked_procedure,
        fileSize: row.file_size,
        mimeType: row.mime_type,
        fileHash: row.file_hash,
        documentType: row.document_type,
        ocrText: row.ocr_text
      };
    },
    getImageByHash: (hash: string): any | null => {
      const row = this.db.prepare(`SELECT * FROM vision_data WHERE file_hash = ?`).get(hash) as Record<string, any> | undefined;
      if (!row) return null;
      const linkedDocs = row.linked_document_ids ? JSON.parse(row.linked_document_ids) : [];
      const related = row.related_docs ? JSON.parse(row.related_docs) : [];
      return {
        ...row,
        tags: JSON.parse(row.tags || '[]'),
        metadata: JSON.parse(row.metadata || '{}'),
        linkedDocumentIds: linkedDocs,
        linked_document_ids: linkedDocs,
        relatedDocs: related,
        related_docs: related,
        image: row.image_base64,
        folderId: row.folder_id,
        createdAt: row.created_at,
        imageType: row.image_type,
        qaPairs: row.qa_pairs,
        invocationKeywords: row.invocation_keywords,
        equipmentState: row.equipment_state,
        validUntil: row.valid_until,
        linkedProcedure: row.linked_procedure,
        fileSize: row.file_size,
        mimeType: row.mime_type,
        fileHash: row.file_hash,
        documentType: row.document_type,
        ocrText: row.ocr_text
      };
    },
    updateImage: (id: string, data: any): void => {
      this.vision.saveImage({ ...data, id });
    },
    deleteImage: (id: string): void => {
      this.db.prepare(`DELETE FROM vision_data WHERE id = ?`).run(id);
      this.db.prepare(`DELETE FROM image_preparations WHERE image_id = ?`).run(id);
    },
    getAllImages: (limit: number = 1000): any[] => {
      const rows = this.db.prepare(`
        SELECT * 
        FROM vision_data 
        ORDER BY created_at DESC 
        LIMIT ?
      `).all(limit) as any[];
      
      return rows.map(row => {
        const linkedDocs = row.linked_document_ids ? JSON.parse(row.linked_document_ids) : [];
        const related = row.related_docs ? JSON.parse(row.related_docs) : [];
        return {
          ...row,
          tags: JSON.parse(row.tags || '[]'),
          metadata: JSON.parse(row.metadata || '{}'),
          linkedDocumentIds: linkedDocs,
          linked_document_ids: linkedDocs,
          relatedDocs: related,
          related_docs: related,
          image: row.image_base64,
          folderId: row.folder_id,
          createdAt: row.created_at,
          imageType: row.image_type,
          qaPairs: row.qa_pairs,
          invocationKeywords: row.invocation_keywords,
          equipmentState: row.equipment_state,
          validUntil: row.valid_until,
          linkedProcedure: row.linked_procedure,
          fileSize: row.file_size,
          mimeType: row.mime_type,
          fileHash: row.file_hash,
          documentType: row.document_type,
          ocrText: row.ocr_text
        };
      });
    }
  };

  // ==========================================================================
  // 🔥 NOUVEAU: MODULE VISION PREPARATION (Métadonnées enrichies)
  // ==========================================================================

  public visionPrep = {
    // Sauvegarder les préparations d'une image
   savePreparation: (imageId: string, data: ImagePreparation): void => {
  // Utiliser les données de 'data' qui contiennent toutes les informations
  const preparationData = data;
  
  this.db.prepare(`
    INSERT OR REPLACE INTO image_preparations 
    (image_id, rois, anchors, spatial_hierarchy, saliency_map, segmentation, pyramid_levels, enhancement_params, preparation_date, preparation_version, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    preparationData.imageId || imageId,
    JSON.stringify(preparationData.rois || null),
    JSON.stringify(preparationData.anchors || null),
    JSON.stringify(preparationData.spatialHierarchy || null),
    JSON.stringify(preparationData.saliencyMap || null),
    JSON.stringify(preparationData.segmentation || null),
    JSON.stringify(preparationData.pyramidLevels || preparationData.pyramid || null),
    JSON.stringify(preparationData.enhancementParams || null),
    preparationData.preparationDate || Date.now(),
    preparationData.preparationVersion || 1,
    preparationData.status || 'pending'
  );
},

    // Récupérer les préparations d'une image
    getPreparation: (imageId: string): ImagePreparation | null => {
      const row = this.db.prepare(`SELECT * FROM image_preparations WHERE image_id = ?`).get(imageId) as Record<string, any> | undefined;
      if (!row) return null;
      return {
  imageId: row.image_id,
  rois: typeof row.rois === 'string' ? JSON.parse(row.rois) : (row.rois || []),
  anchors: typeof row.anchors === 'string' ? JSON.parse(row.anchors) : (row.anchors || []),
  spatialHierarchy: typeof row.spatial_hierarchy === 'string' ? JSON.parse(row.spatial_hierarchy) : (row.spatial_hierarchy || {}),
  saliencyMap: typeof row.saliency_map === 'string' ? JSON.parse(row.saliency_map) : row.saliency_map,
  segmentation: typeof row.segmentation === 'string' ? JSON.parse(row.segmentation) : row.segmentation,
  pyramidLevels: typeof row.pyramid_levels === 'string' ? JSON.parse(row.pyramid_levels) : row.pyramid_levels,
  enhancementParams: typeof row.enhancement_params === 'string' ? JSON.parse(row.enhancement_params) : row.enhancement_params,
  preparationDate: row.preparation_date,
  preparationVersion: row.preparation_version,
  status: row.status as any,
  pyramid: []
};
    },

    // Sauvegarder un assemblage
    saveAssembly: (data: ImageAssembly): void => {
      this.db.prepare(`
        INSERT OR REPLACE INTO image_assemblies 
        (id, result_image_id, source_images, grid_rows, grid_cols, assembly_quality, created_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.id,
        data.result_image_id,
        JSON.stringify(data.source_images),
        data.grid_rows,
        data.grid_cols,
        data.assembly_quality,
        data.created_at || Date.now(),
        JSON.stringify(data.metadata || {})
      );
    },

    // Récupérer un assemblage
    getAssembly: (id: string): ImageAssembly | null => {
      const row = this.db.prepare(`SELECT * FROM image_assemblies WHERE id = ?`).get(id) as any;
      if (!row) return null;
      return {
        ...row,
        source_images: JSON.parse(row.source_images),
        metadata: JSON.parse(row.metadata || '{}')
      } as ImageAssembly;
    },

    // Récupérer les assemblages par image résultat
    getAssembliesByResultImage: (resultImageId: string): ImageAssembly[] => {
      const rows = this.db.prepare(`
        SELECT * FROM image_assemblies WHERE result_image_id = ? ORDER BY created_at DESC
      `).all(resultImageId) as any[];
      return rows.map(row => ({
        ...row,
        source_images: JSON.parse(row.source_images),
        metadata: JSON.parse(row.metadata || '{}')
      } as ImageAssembly));
    },

    // Sauvegarder un log de préparation
    savePreparationLog: (data: PreparationLog): void => {
      this.db.prepare(`
        INSERT INTO preparation_logs (image_id, operation, status, details, duration_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        data.image_id,
        data.operation,
        data.status,
        data.details || null,
        data.duration_ms || null,
        data.created_at || Date.now()
      );
    },

    // Récupérer les logs d'une image
    getPreparationLogs: (imageId: string, limit: number = 50): PreparationLog[] => {
      const rows = this.db.prepare(`
        SELECT * FROM preparation_logs 
        WHERE image_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `).all(imageId, limit) as any[];
      return rows.map(row => ({
        ...row,
        image_id: row.image_id,
        duration_ms: row.duration_ms,
        created_at: row.created_at
      } as PreparationLog));
    },

    // Mettre à jour le statut de préparation
    updatePreparationStatus: (imageId: string, status: string): void => {
      this.db.prepare(`
        UPDATE image_preparations SET status = ? WHERE image_id = ?
      `).run(status, imageId);
    },

   // Lister les images par statut de préparation
listPreparationsByStatus: (status: string): (ImagePreparation & { filename: string; image_type: string })[] => {
  const rows = this.db.prepare(`
    SELECT p.*, v.filename, v.image_type 
    FROM image_preparations p
    JOIN vision_data v ON p.image_id = v.id
    WHERE p.status = ?
    ORDER BY p.preparation_date DESC
  `).all(status) as any[];
  
  return rows.map(row => ({
    imageId: row.image_id,
    rois: row.rois ? JSON.parse(row.rois) : [],
    anchors: row.anchors ? JSON.parse(row.anchors) : [],
    spatialHierarchy: row.spatial_hierarchy ? JSON.parse(row.spatial_hierarchy) : {},
    saliencyMap: row.saliency_map ? JSON.parse(row.saliency_map) : null,
    segmentation: row.segmentation ? JSON.parse(row.segmentation) : null,
    pyramidLevels: row.pyramid_levels ? JSON.parse(row.pyramid_levels) : null,
    enhancementParams: row.enhancement_params ? JSON.parse(row.enhancement_params) : null,
    preparationDate: row.preparation_date,
    preparationVersion: row.preparation_version,
    status: row.status as any,
    pyramid: row.pyramid_levels ? JSON.parse(row.pyramid_levels) : [],
    filename: row.filename,
    image_type: row.image_type
  }));
}
  };

  // ==========================================================================
  // MÉTRIQUES
  // ==========================================================================

  public async recordMetric(module: string, metricName: string, metricValue: number): Promise<void> {
    try {
      const safeValue = (typeof metricValue !== 'number' || isNaN(metricValue)) ? 0 : metricValue;
      this.db.prepare(`
        INSERT INTO metrics (timestamp, module, metricName, metricValue)
        VALUES (?, ?, ?, ?)
      `).run(Date.now(), module, metricName, safeValue);
    } catch (error) {
      logger.error('CORE', `Erreur enregistrement métrique ${module}/${metricName}`, error);
    }
  }

  public getMetrics(module?: string, metricName?: string, limit: number = 1000): any[] {
    let sql = `SELECT * FROM metrics WHERE 1=1`;
    const params: any[] = [];
    
    if (module) {
      sql += ` AND module = ?`;
      params.push(module);
    }
    
    if (metricName) {
      sql += ` AND metricName = ?`;
      params.push(metricName);
    }
    
    sql += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);
    
    return this.db.prepare(sql).all(...params);
  }

  public getMetricStats(module?: string, metricName?: string): { avg: number; min: number; max: number; count: number } {
    let sql = `SELECT AVG(metricValue) as avg, MIN(metricValue) as min, MAX(metricValue) as max, COUNT(*) as count FROM metrics WHERE 1=1`;
    const params: any[] = [];
    
    if (module) {
      sql += ` AND module = ?`;
      params.push(module);
    }
    
    if (metricName) {
      sql += ` AND metricName = ?`;
      params.push(metricName);
    }
    
    const row = this.db.prepare(sql).get(...params) as any;
    return {
      avg: row?.avg || 0,
      min: row?.min || 0,
      max: row?.max || 0,
      count: row?.count || 0
    };
  }

  public getStats(): Array<{ namespace: string; size: number; hitRate: number; totalHits: number; totalMisses: number }> {
    const sizes = this.db.prepare(`
      SELECT namespace, COUNT(*) as size
      FROM actions_caches
      GROUP BY namespace
    `).all() as { namespace: string; size: number }[];
    
    return sizes.map(row => ({
      namespace: row.namespace,
      size: row.size,
      hitRate: 0,
      totalHits: 0,
      totalMisses: 0
    }));
  }
  
  // UTILITAIRES
  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }
  
  // MAINTENANCE
  public cleanup(): void {
    const now = Date.now();
    const expired = this.db.prepare(`DELETE FROM actions_caches WHERE expiresAt < ?`).run(now);
    const expiredSnapshots = this.db.prepare(`DELETE FROM actions_snapshots WHERE expiresAt < ?`).run(now);
    const expiredSessions = this.orchestration.sessions.cleanup();
    const expiredStats = this.orchestration.stats.cleanup();
    const expiredCacheEntries = this.cache.deleteOldEntries();
    const inactiveAgents = this.agent.cleanupInactive();
    const expiredQREntries = this.qr.cleanup();
    
    if (expired.changes > 0 || expiredSnapshots.changes > 0 || expiredSessions > 0 || expiredStats > 0 || expiredCacheEntries > 0 || inactiveAgents > 0 || expiredQREntries > 0) {
      logger.info('CORE', `Nettoyage: ${expired.changes} caches, ${expiredSnapshots.changes} snapshots, ${expiredSessions} sessions, ${expiredStats} stats, ${expiredCacheEntries} cache entries, ${inactiveAgents} agents, ${expiredQREntries} QR entries`);
    }
  }
  
  public vacuum(): void {
    this.db.exec('VACUUM');
    logger.info('CORE', 'Base SQLite optimisée (VACUUM)');
  }
  
  public backup(backupPath: string): void {
  try {
    // Ensure the backup directory exists
    const dir = path.dirname(backupPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Copy the SQLite database file to the backup location
    const sourcePath = DB_PATH;
    fs.copyFileSync(sourcePath, backupPath);
    logger.info('CORE', `Backup créé: ${backupPath}`);
  } catch (err) {
    logger.error('CORE', `Erreur lors du backup vers ${backupPath}`, err);
    throw err;
  }
}
  
  public getDB(): Database.Database {
    return this.db;
  }
  
  public close(): void {
    this.db.close();
    logger.info('CORE', 'Connexion SQLite fermée');
  }
}

// SINGLETON EXPORT
export function getSQLiteCore(): SQLiteCore {
  return SQLiteCore.getInstance();
}

export default getSQLiteCore;