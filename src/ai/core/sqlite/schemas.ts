/**
 * Définitions des tables SQLite pour TOUS les modules
 * Version centralisée - chaque module a son namespace
 */

export interface TableDefinition {
  name: string;
  schema: string;
  indexes: string[];
  module: string; // 'actions' | 'learning' | 'orchestration' | 'agent' | 'cache' | 'core' | 'qr' | 'part_matching' | 'vision_prep'
  version: number;
}

/**
 * Toutes les tables organisées par module
 */
export const SCHEMAS: TableDefinition[] = [
  // =============================================================
  // MODULE ACTIONS
  // =============================================================
  {
    module: 'actions',
    version: 1,
    name: 'actions_caches',
    schema: `
      CREATE TABLE IF NOT EXISTS actions_caches (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        PRIMARY KEY (namespace, key)
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_actions_caches_expires ON actions_caches(expiresAt)',
      'CREATE INDEX IF NOT EXISTS idx_actions_caches_namespace ON actions_caches(namespace)'
    ]
  },
  {
    module: 'actions',
    version: 1,
    name: 'actions_policies',
    schema: `
      CREATE TABLE IF NOT EXISTS actions_policies (
        id TEXT PRIMARY KEY,
        contextPattern TEXT NOT NULL,
        actionTemplate TEXT NOT NULL,
        confidence REAL NOT NULL,
        demonstrationCount INTEGER NOT NULL DEFAULT 0,
        successRate REAL NOT NULL DEFAULT 100,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        lastUsed INTEGER NOT NULL DEFAULT 0,
        tags TEXT DEFAULT '[]'
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_actions_policies_confidence ON actions_policies(confidence)'
    ]
  },
  {
    module: 'actions',
    version: 1,
    name: 'actions_demonstrations',
    schema: `
      CREATE TABLE IF NOT EXISTS actions_demonstrations (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        context TEXT NOT NULL,
        action TEXT NOT NULL,
        result TEXT NOT NULL,
        userId TEXT,
        sessionId TEXT,
        success INTEGER NOT NULL DEFAULT 1,
        tags TEXT DEFAULT '[]',
        duration INTEGER NOT NULL DEFAULT 0
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_actions_demos_timestamp ON actions_demonstrations(timestamp)'
    ]
  },
  {
    module: 'actions',
    version: 1,
    name: 'actions_snapshots',
    schema: `
      CREATE TABLE IF NOT EXISTS actions_snapshots (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL,
        workflowId TEXT
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_actions_snapshots_expires ON actions_snapshots(expiresAt)'
    ]
  },

  // =============================================================
  // MODULE LEARNING
  // =============================================================
  {
    module: 'learning',
    version: 1,
    name: 'learning_episodic_memory',
    schema: `
      CREATE TABLE IF NOT EXISTS learning_episodic_memory (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        context TEXT NOT NULL,
        action TEXT NOT NULL,
        result TEXT NOT NULL,
        success INTEGER NOT NULL,
        embedding TEXT,
        metadata TEXT DEFAULT '{}'
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_learning_episodic_timestamp ON learning_episodic_memory(timestamp)'
    ]
  },
  {
    module: 'learning',
    version: 1,
    name: 'learning_spaced_repetition',
    schema: `
      CREATE TABLE IF NOT EXISTS learning_spaced_repetition (
        id TEXT PRIMARY KEY,
        concept TEXT NOT NULL,
        lastReview INTEGER NOT NULL,
        nextReview INTEGER NOT NULL,
        interval INTEGER NOT NULL,
        easeFactor REAL NOT NULL,
        repetitions INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_learning_spaced_next ON learning_spaced_repetition(nextReview)'
    ]
  },

  // =============================================================
  // MODULE ORCHESTRATION - VERSION 1
  // =============================================================
  {
    module: 'orchestration',
    version: 1,
    name: 'orchestration_transitions',
    schema: `
      CREATE TABLE IF NOT EXISTS orchestration_transitions (
        source_hash TEXT NOT NULL,
        target_hash TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        lastUsed INTEGER NOT NULL,
        PRIMARY KEY (source_hash, target_hash)
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_orchestration_transitions_source ON orchestration_transitions(source_hash)'
    ]
  },
  {
    module: 'orchestration',
    version: 1,
    name: 'orchestration_stats',
    schema: `
      CREATE TABLE IF NOT EXISTS orchestration_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        component TEXT NOT NULL,
        statType TEXT NOT NULL,
        statValue TEXT NOT NULL
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_orchestration_stats_component ON orchestration_stats(component)',
      'CREATE INDEX IF NOT EXISTS idx_orchestration_stats_timestamp ON orchestration_stats(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_orchestration_stats_type ON orchestration_stats(statType)'
    ]
  },
  {
    module: 'orchestration',
    version: 1,
    name: 'orchestration_keyword_graph',
    schema: `
      CREATE TABLE IF NOT EXISTS orchestration_keyword_graph (
        keyword TEXT PRIMARY KEY,
        weight REAL NOT NULL DEFAULT 5.0,
        documents TEXT NOT NULL DEFAULT '[]',
        lastUsed INTEGER NOT NULL,
        relations TEXT NOT NULL DEFAULT '[]'
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_orchestration_keyword_weight ON orchestration_keyword_graph(weight)',
      'CREATE INDEX IF NOT EXISTS idx_orchestration_keyword_lastUsed ON orchestration_keyword_graph(lastUsed)'
    ]
  },

  // =============================================================
  // MODULE LEARNING (Tables supplémentaires)
  // =============================================================
  {
    module: 'learning',
    version: 1,
    name: 'learning_insights',
    schema: `
      CREATE TABLE IF NOT EXISTS learning_insights (
        id TEXT PRIMARY KEY,
        instanceId TEXT NOT NULL,
        domain TEXT NOT NULL,
        pattern TEXT NOT NULL,
        instruction TEXT NOT NULL,
        confidence REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        originalRule TEXT
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_learning_insights_domain ON learning_insights(domain)',
      'CREATE INDEX IF NOT EXISTS idx_learning_insights_confidence ON learning_insights(confidence)'
    ]
  },
  {
    module: 'learning',
    version: 1,
    name: 'learning_patterns',
    schema: `
      CREATE TABLE IF NOT EXISTS learning_patterns (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        domain TEXT NOT NULL,
        confidence REAL NOT NULL,
        usageCount INTEGER DEFAULT 0,
        applicability TEXT,
        timestamp INTEGER,
        tags TEXT
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_learning_patterns_domain ON learning_patterns(domain)',
      'CREATE INDEX IF NOT EXISTS idx_learning_patterns_confidence ON learning_patterns(confidence)'
    ]
  },
  {
    module: 'learning',
    version: 1,
    name: 'learning_concept_nodes',
    schema: `
      CREATE TABLE IF NOT EXISTS learning_concept_nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        level INTEGER NOT NULL,
        parentId TEXT,
        description TEXT,
        synonyms TEXT,
        importance REAL
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_learning_concept_nodes_level ON learning_concept_nodes(level)',
      'CREATE INDEX IF NOT EXISTS idx_learning_concept_nodes_parent ON learning_concept_nodes(parentId)'
    ]
  },
  {
    module: 'learning',
    version: 1,
    name: 'learning_concept_relations',
    schema: `
      CREATE TABLE IF NOT EXISTS learning_concept_relations (
        sourceId TEXT NOT NULL,
        targetId TEXT NOT NULL,
        type TEXT NOT NULL,
        PRIMARY KEY (sourceId, targetId)
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_learning_concept_relations_source ON learning_concept_relations(sourceId)',
      'CREATE INDEX IF NOT EXISTS idx_learning_concept_relations_target ON learning_concept_relations(targetId)'
    ]
  },
  {
    module: 'learning',
    version: 1,
    name: 'learning_episodes',
    schema: `
      CREATE TABLE IF NOT EXISTS learning_episodes (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        context TEXT NOT NULL,
        importance REAL NOT NULL,
        tags TEXT,
        metadata TEXT
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_learning_episodes_timestamp ON learning_episodes(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_learning_episodes_type ON learning_episodes(type)',
      'CREATE INDEX IF NOT EXISTS idx_learning_episodes_importance ON learning_episodes(importance)'
    ]
  },
  {
    module: 'learning',
    version: 1,
    name: 'learning_knowledge_items',
    schema: `
      CREATE TABLE IF NOT EXISTS learning_knowledge_items (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        concept TEXT NOT NULL,
        stability REAL NOT NULL,
        difficulty REAL NOT NULL,
        lastReview INTEGER NOT NULL,
        nextReview INTEGER NOT NULL,
        reviewsCount INTEGER NOT NULL,
        tags TEXT,
        domain TEXT
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_learning_knowledge_next ON learning_knowledge_items(nextReview)',
      'CREATE INDEX IF NOT EXISTS idx_learning_knowledge_concept ON learning_knowledge_items(concept)',
      'CREATE INDEX IF NOT EXISTS idx_learning_knowledge_domain ON learning_knowledge_items(domain)'
    ]
  },
  {
    module: 'learning',
    version: 1,
    name: 'learning_profiles',
    schema: `
      CREATE TABLE IF NOT EXISTS learning_profiles (
        userId TEXT PRIMARY KEY,
        conciseness REAL NOT NULL DEFAULT 0.5,
        technicality REAL NOT NULL DEFAULT 0.7,
        formality REAL NOT NULL DEFAULT 0.6,
        creativity REAL NOT NULL DEFAULT 0.4,
        lastUpdated INTEGER NOT NULL,
        adaptationCount INTEGER DEFAULT 0,
        history TEXT
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_learning_profiles_lastUpdated ON learning_profiles(lastUpdated)'
    ]
  },
  {
    module: 'learning',
    version: 1,
    name: 'learning_rules',
    schema: `
      CREATE TABLE IF NOT EXISTS learning_rules (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        pattern TEXT NOT NULL,
        instruction TEXT NOT NULL,
        confidence REAL NOT NULL,
        timestamp INTEGER,
        usageCount INTEGER DEFAULT 0,
        tags TEXT
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_learning_rules_domain ON learning_rules(domain)',
      'CREATE INDEX IF NOT EXISTS idx_learning_rules_confidence ON learning_rules(confidence)'
    ]
  },
  {
    module: 'learning',
    version: 1,
    name: 'learning_domain_mappings',
    schema: `
      CREATE TABLE IF NOT EXISTS learning_domain_mappings (
        sourceDomain TEXT NOT NULL,
        targetDomain TEXT NOT NULL,
        conceptFrom TEXT NOT NULL,
        conceptTo TEXT NOT NULL,
        confidence REAL NOT NULL,
        usageCount INTEGER DEFAULT 0,
        lastUsed INTEGER,
        PRIMARY KEY (sourceDomain, targetDomain, conceptFrom)
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_learning_domain_mappings_source ON learning_domain_mappings(sourceDomain)',
      'CREATE INDEX IF NOT EXISTS idx_learning_domain_mappings_target ON learning_domain_mappings(targetDomain)',
      'CREATE INDEX IF NOT EXISTS idx_learning_domain_mappings_confidence ON learning_domain_mappings(confidence)'
    ]
  },
  {
    module: 'learning',
    version: 1,
    name: 'learning_performance_history',
    schema: `
      CREATE TABLE IF NOT EXISTS learning_performance_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        strategyId TEXT NOT NULL,
        success INTEGER NOT NULL,
        quality REAL NOT NULL,
        timeSpent INTEGER NOT NULL,
        confidence REAL,
        query TEXT
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_learning_performance_strategy ON learning_performance_history(strategyId)',
      'CREATE INDEX IF NOT EXISTS idx_learning_performance_timestamp ON learning_performance_history(timestamp)'
    ]
  },

  // =============================================================
  // MODULE CORE
  // =============================================================
  {
    module: 'core',
    version: 1,
    name: 'metrics',
    schema: `
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        module TEXT NOT NULL,
        metricName TEXT NOT NULL,
        metricValue REAL NOT NULL
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_metrics_module ON metrics(module)',
      'CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metricName)'
    ]
  },

  // =============================================================
  // MODULE AGENT
  // =============================================================
  {
    module: 'agent',
    version: 1,
    name: 'agent_states',
    schema: `
      CREATE TABLE IF NOT EXISTS agent_states (
        agentId TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        currentTask TEXT,
        memory TEXT NOT NULL DEFAULT '{}',
        lastActive INTEGER NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}'
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_agent_states_status ON agent_states(status)',
      'CREATE INDEX IF NOT EXISTS idx_agent_states_lastActive ON agent_states(lastActive)'
    ]
  },

  // =============================================================
  // MODULE CACHE (permanent)
  // =============================================================
  {
    module: 'cache',
    version: 1,
    name: 'cache_permanent_entries',
    schema: `
      CREATE TABLE IF NOT EXISTS cache_permanent_entries (
        hash TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        response TEXT NOT NULL,
        zone TEXT NOT NULL,
        usageCount INTEGER NOT NULL DEFAULT 0,
        embedding TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_cache_permanent_zone ON cache_permanent_entries(zone)',
      'CREATE INDEX IF NOT EXISTS idx_cache_permanent_usage ON cache_permanent_entries(usageCount DESC)',
      'CREATE INDEX IF NOT EXISTS idx_cache_permanent_created ON cache_permanent_entries(createdAt)'
    ]
  },
  {
    module: 'cache',
    version: 1,
    name: 'cache_embeddings',
    schema: `
      CREATE TABLE IF NOT EXISTS cache_embeddings (
        hash TEXT PRIMARY KEY,
        embedding TEXT NOT NULL,
        model TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_cache_embeddings_model ON cache_embeddings(model)'
    ]
  },

  // =============================================================
  // MODULE ORCHESTRATION - VERSION 2 (Tables supplémentaires)
  // =============================================================
  {
    module: 'orchestration',
    version: 2,
    name: 'orchestration_cache',
    schema: `
      CREATE TABLE IF NOT EXISTS orchestration_cache (
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        namespace TEXT NOT NULL DEFAULT 'default',
        createdAt INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL,
        hits INTEGER DEFAULT 0,
        PRIMARY KEY (key, namespace)
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_orchestration_cache_namespace ON orchestration_cache(namespace)',
      'CREATE INDEX IF NOT EXISTS idx_orchestration_cache_expires ON orchestration_cache(expiresAt)'
    ]
  },
  {
    module: 'orchestration',
    version: 2,
    name: 'orchestration_dependencies',
    schema: `
      CREATE TABLE IF NOT EXISTS orchestration_dependencies (
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'depends_on',
        weight REAL DEFAULT 1.0,
        PRIMARY KEY (source, target)
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_orchestration_deps_source ON orchestration_dependencies(source)',
      'CREATE INDEX IF NOT EXISTS idx_orchestration_deps_target ON orchestration_dependencies(target)',
      'CREATE INDEX IF NOT EXISTS idx_orchestration_deps_type ON orchestration_dependencies(type)'
    ]
  },
  {
    module: 'orchestration',
    version: 2,
    name: 'orchestration_workflows',
    schema: `
      CREATE TABLE IF NOT EXISTS orchestration_workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        steps TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        executionCount INTEGER DEFAULT 0,
        avgDuration INTEGER DEFAULT 0,
        lastExecuted INTEGER,
        createdAt INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_orchestration_workflows_status ON orchestration_workflows(status)',
      'CREATE INDEX IF NOT EXISTS idx_orchestration_workflows_name ON orchestration_workflows(name)',
      'CREATE INDEX IF NOT EXISTS idx_orchestration_workflows_lastExecuted ON orchestration_workflows(lastExecuted)'
    ]
  },
  {
    module: 'orchestration',
    version: 2,
    name: 'orchestration_sessions',
    schema: `
      CREATE TABLE IF NOT EXISTS orchestration_sessions (
        sessionId TEXT PRIMARY KEY,
        userId TEXT,
        state TEXT NOT NULL,
        context TEXT NOT NULL DEFAULT '{}',
        history TEXT NOT NULL DEFAULT '[]',
        createdAt INTEGER NOT NULL,
        lastActivity INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_user ON orchestration_sessions(userId)',
      'CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_expires ON orchestration_sessions(expiresAt)',
      'CREATE INDEX IF NOT EXISTS idx_orchestration_sessions_state ON orchestration_sessions(state)'
    ]
  },
  {
    module: 'orchestration',
    version: 2,
    name: 'orchestration_votes',
    schema: `
      CREATE TABLE IF NOT EXISTS orchestration_votes (
        id TEXT PRIMARY KEY,
        pollId TEXT NOT NULL,
        voterId TEXT NOT NULL,
        choice TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        timestamp INTEGER NOT NULL,
        reasoning TEXT,
        UNIQUE(pollId, voterId)
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_orchestration_votes_poll ON orchestration_votes(pollId)',
      'CREATE INDEX IF NOT EXISTS idx_orchestration_votes_timestamp ON orchestration_votes(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_orchestration_votes_choice ON orchestration_votes(choice)'
    ]
  },

  // =============================================================
  // MODULE QR INDEX (Questions/Réponses)
  // =============================================================
  {
    module: 'qr',
    version: 1,
    name: 'qr_index',
    schema: `
      CREATE TABLE IF NOT EXISTS qr_index (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        sourceFile TEXT NOT NULL,
        sourcePath TEXT NOT NULL,
        zone TEXT NOT NULL,
        embedding TEXT NOT NULL,
        keywords TEXT NOT NULL,
        confidence REAL DEFAULT 0.8,
        usageCount INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        category TEXT DEFAULT 'general',
        language TEXT DEFAULT 'fr'
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_qr_zone ON qr_index(zone)',
      'CREATE INDEX IF NOT EXISTS idx_qr_confidence ON qr_index(confidence DESC)',
      'CREATE INDEX IF NOT EXISTS idx_qr_usage ON qr_index(usageCount DESC)',
      'CREATE INDEX IF NOT EXISTS idx_qr_category ON qr_index(category)',
      'CREATE INDEX IF NOT EXISTS idx_qr_source ON qr_index(sourceFile)'
    ]
  },
  {
    module: 'qr',
    version: 1,
    name: 'qr_embeddings',
    schema: `
      CREATE TABLE IF NOT EXISTS qr_embeddings (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        embedding TEXT NOT NULL,
        model TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY (id) REFERENCES qr_index(id) ON DELETE CASCADE
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_qr_embeddings_model ON qr_embeddings(model)'
    ]
  },

  // =============================================================
  // MODULE INNOVATIONS TECHNIQUES (8 IA Pro)
  // =============================================================
  {
    module: 'innovations_tech',
    version: 1,
    name: 'innovations_tech_history',
    schema: `
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
        metadata TEXT DEFAULT '{}'
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_innovations_tech_type ON innovations_tech_history(innovation_type)',
      'CREATE INDEX IF NOT EXISTS idx_innovations_tech_created ON innovations_tech_history(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_innovations_tech_success ON innovations_tech_history(success)'
    ]
  },
  {
    module: 'innovations_tech',
    version: 1,
    name: 'innovations_tech_metrics',
    schema: `
      CREATE TABLE IF NOT EXISTS innovations_tech_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        innovation_id INTEGER NOT NULL,
        innovation_name TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_innovations_metrics_id ON innovations_tech_metrics(innovation_id)',
      'CREATE INDEX IF NOT EXISTS idx_innovations_metrics_timestamp ON innovations_tech_metrics(timestamp)'
    ]
  },
  {
    module: 'innovations_tech',
    version: 1,
    name: 'innovations_tech_subspaces',
    schema: `
      CREATE TABLE IF NOT EXISTS innovations_tech_subspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        subspace_data TEXT NOT NULL,
        reference_images TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_innovations_subspaces_type ON innovations_tech_subspaces(type)'
    ]
  },
  {
    module: 'innovations_tech',
    version: 1,
    name: 'innovations_tech_feedback',
    schema: `
      CREATE TABLE IF NOT EXISTS innovations_tech_feedback (
        id TEXT PRIMARY KEY,
        prediction_id TEXT NOT NULL,
        image_id TEXT,
        innovation_type TEXT NOT NULL,
        user_feedback TEXT NOT NULL,
        correction TEXT,
        confidence_score REAL,
        created_at INTEGER NOT NULL
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_innovations_feedback_prediction ON innovations_tech_feedback(prediction_id)',
      'CREATE INDEX IF NOT EXISTS idx_innovations_feedback_type ON innovations_tech_feedback(innovation_type)'
    ]
  },

  // =============================================================
  // MODULE INNOVATIONS (Vision par similarité)
  // =============================================================
  {
    module: 'innovations',
    version: 1,
    name: 'innovation_subspaces',
    schema: `
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
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_innovation_subspaces_type ON innovation_subspaces(type)',
      'CREATE INDEX IF NOT EXISTS idx_innovation_subspaces_name ON innovation_subspaces(name)',
      'CREATE INDEX IF NOT EXISTS idx_innovation_subspaces_created ON innovation_subspaces(created_at)'
    ]
  },
  {
    module: 'innovations',
    version: 1,
    name: 'innovation_analysis_history',
    schema: `
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
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_innovation_analysis_type ON innovation_analysis_history(innovation_type)',
      'CREATE INDEX IF NOT EXISTS idx_innovation_analysis_created ON innovation_analysis_history(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_innovation_analysis_user ON innovation_analysis_history(user_id)'
    ]
  },
  {
    module: 'innovations',
    version: 1,
    name: 'innovation_feedback',
    schema: `
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
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_innovation_feedback_prediction ON innovation_feedback(prediction_id)',
      'CREATE INDEX IF NOT EXISTS idx_innovation_feedback_type ON innovation_feedback(innovation_type)',
      'CREATE INDEX IF NOT EXISTS idx_innovation_feedback_created ON innovation_feedback(created_at)'
    ]
  },
  {
    module: 'innovations',
    version: 1,
    name: 'innovation_bm25_index',
    schema: `
      CREATE TABLE IF NOT EXISTS innovation_bm25_index (
        term TEXT NOT NULL,
        document_id TEXT NOT NULL,
        tf REAL NOT NULL,
        doc_length INTEGER NOT NULL,
        PRIMARY KEY (term, document_id)
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_innovation_bm25_term ON innovation_bm25_index(term)',
      'CREATE INDEX IF NOT EXISTS idx_innovation_bm25_document ON innovation_bm25_index(document_id)'
    ]
  },
  {
    module: 'innovations',
    version: 1,
    name: 'innovation_training_sessions',
    schema: `
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
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_innovation_sessions_status ON innovation_training_sessions(status)',
      'CREATE INDEX IF NOT EXISTS idx_innovation_sessions_created ON innovation_training_sessions(created_at)'
    ]
  },
  {
    module: 'innovations',
    version: 1,
    name: 'innovation_thresholds',
    schema: `
      CREATE TABLE IF NOT EXISTS innovation_thresholds (
        id TEXT PRIMARY KEY,
        threshold_type TEXT NOT NULL,
        high REAL NOT NULL,
        medium REAL NOT NULL,
        low REAL NOT NULL,
        version INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_innovation_thresholds_type ON innovation_thresholds(threshold_type)',
      'CREATE INDEX IF NOT EXISTS idx_innovation_thresholds_version ON innovation_thresholds(version)'
    ]
  },

  // =============================================================
  // 🔥 MODULE VISION (Table principale des images)
  // =============================================================
  {
    module: 'vision',
    version: 1,
    name: 'vision_data',
    schema: `
      CREATE TABLE IF NOT EXISTS vision_data (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        thumbnail_path TEXT,
        description TEXT,
        tags TEXT DEFAULT '[]',
        location TEXT,
        folder_id TEXT,
        date TEXT,
        created_at INTEGER NOT NULL,
        qa_pairs TEXT,
        invocation_keywords TEXT,
        equipment_state TEXT DEFAULT 'normal',
        valid_until INTEGER,
        linked_procedure TEXT,
        image_base64 TEXT,
        image TEXT,
        image_type TEXT DEFAULT 'simple',
        width INTEGER,
        height INTEGER,
        file_size INTEGER,
        mime_type TEXT,
        file_hash TEXT,
        linked_document_ids TEXT,
        author TEXT,
        document_type TEXT,
        related_docs TEXT,
        ocr_text TEXT,
        metadata TEXT DEFAULT '{}'

      )

    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_vision_data_filename ON vision_data(filename)',
      'CREATE INDEX IF NOT EXISTS idx_vision_data_folder ON vision_data(folder_id)',
      'CREATE INDEX IF NOT EXISTS idx_vision_data_type ON vision_data(image_type)',
      'CREATE INDEX IF NOT EXISTS idx_vision_data_created ON vision_data(created_at)'
    ]
  },
  {
    module: 'vision',
    version: 1,
    name: 'vision_folders',
    schema: `
      CREATE TABLE IF NOT EXISTS vision_folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        parentId TEXT,
        createdAt INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_vision_folders_path ON vision_folders(path)',
      'CREATE INDEX IF NOT EXISTS idx_vision_folders_parent ON vision_folders(parentId)'
    ]
  },

  // =============================================================
  // MODULE PART MATCHING (Innovation #9)
  // =============================================================
  {
    module: 'part_matching',
    version: 1,
    name: 'part_matching_global_images',
    schema: `
      CREATE TABLE IF NOT EXISTS part_matching_global_images (
        id TEXT PRIMARY KEY,
        image_id TEXT NOT NULL,
        grid_rows INTEGER NOT NULL,
        grid_cols INTEGER NOT NULL,
        overlap REAL DEFAULT 0.2,
        patch_size INTEGER DEFAULT 256,
        total_parts INTEGER,
        processed_at INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (image_id) REFERENCES vision_data(id) ON DELETE CASCADE
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_part_matching_global_image_id ON part_matching_global_images(image_id)',
      'CREATE INDEX IF NOT EXISTS idx_part_matching_global_processed ON part_matching_global_images(processed_at)'
    ]
  },
  {
    module: 'part_matching',
    version: 1,
    name: 'part_matching_patches',
    schema: `
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
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_part_matching_patches_global ON part_matching_patches(global_image_id)',
      'CREATE INDEX IF NOT EXISTS idx_part_matching_patches_grid ON part_matching_patches(grid_row, grid_col)',
      'CREATE INDEX IF NOT EXISTS idx_part_matching_patches_position ON part_matching_patches(position_x, position_y)'
    ]
  },
  {
    module: 'part_matching',
    version: 1,
    name: 'part_matching_hierarchy',
    schema: `
      CREATE TABLE IF NOT EXISTS part_matching_hierarchy (
        child_id TEXT PRIMARY KEY,
        parent_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL DEFAULT 'part_of',
        matched_zone TEXT,
        confidence REAL DEFAULT 0.0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (child_id) REFERENCES vision_data(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES vision_data(id) ON DELETE CASCADE
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_part_matching_hierarchy_parent ON part_matching_hierarchy(parent_id)',
      'CREATE INDEX IF NOT EXISTS idx_part_matching_hierarchy_child ON part_matching_hierarchy(child_id)',
      'CREATE INDEX IF NOT EXISTS idx_part_matching_hierarchy_type ON part_matching_hierarchy(relationship_type)'
    ]
  },
  {
    module: 'part_matching',
    version: 1,
    name: 'part_matching_stats',
    schema: `
      CREATE TABLE IF NOT EXISTS part_matching_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        global_images_count INTEGER DEFAULT 0,
        total_patches_count INTEGER DEFAULT 0,
        successful_matches INTEGER DEFAULT 0,
        total_searches INTEGER DEFAULT 0,
        last_updated INTEGER NOT NULL
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_part_matching_stats_updated ON part_matching_stats(last_updated)'
    ]
  },
  // =============================================================
  // 🔥 NOUVEAU: MODULE VISION PREPARATION (Métadonnées enrichies)
  // =============================================================
  {
    module: 'vision_prep',
    version: 1,
    name: 'image_preparations',
    schema: `
      CREATE TABLE IF NOT EXISTS image_preparations (
        image_id TEXT PRIMARY KEY,
        rois TEXT,
        anchors TEXT,
        spatial_hierarchy TEXT,
        saliency_map TEXT,
        segmentation TEXT,
        pyramid_levels TEXT,
        enhancement_params TEXT,
        preparation_date INTEGER NOT NULL,
        preparation_version INTEGER DEFAULT 1,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY (image_id) REFERENCES vision_data(id) ON DELETE CASCADE
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_image_preparations_status ON image_preparations(status)',
      'CREATE INDEX IF NOT EXISTS idx_image_preparations_date ON image_preparations(preparation_date)'
    ]
  },

  {
    module: 'vision_prep',
    version: 1,
    name: 'image_assemblies',
    schema: `
      CREATE TABLE IF NOT EXISTS image_assemblies (
        id TEXT PRIMARY KEY,
        result_image_id TEXT NOT NULL,
        source_images TEXT NOT NULL,
        grid_rows INTEGER NOT NULL,
        grid_cols INTEGER NOT NULL,
        assembly_quality REAL DEFAULT 0.0,
        created_at INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (result_image_id) REFERENCES vision_data(id) ON DELETE CASCADE
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_image_assemblies_result ON image_assemblies(result_image_id)',
      'CREATE INDEX IF NOT EXISTS idx_image_assemblies_quality ON image_assemblies(assembly_quality DESC)',
      'CREATE INDEX IF NOT EXISTS idx_image_assemblies_created ON image_assemblies(created_at)'
    ]
  },
  {
    module: 'vision_prep',
    version: 1,
    name: 'preparation_logs',
    schema: `
      CREATE TABLE IF NOT EXISTS preparation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL,
        details TEXT,
        duration_ms INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (image_id) REFERENCES vision_data(id) ON DELETE CASCADE
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_preparation_logs_image ON preparation_logs(image_id)',
      'CREATE INDEX IF NOT EXISTS idx_preparation_logs_operation ON preparation_logs(operation)',
      'CREATE INDEX IF NOT EXISTS idx_preparation_logs_created ON preparation_logs(created_at)'
    ]
  },
  {
    module: 'cache',
    version: 1,
    name: 'semantic_cache',
    schema: `
      CREATE TABLE IF NOT EXISTS semantic_cache (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        embedding_compressed BLOB NOT NULL,
        response TEXT NOT NULL,
        usage_count INTEGER DEFAULT 1,
        last_used INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_semantic_cache_usage ON semantic_cache(usage_count)',
      'CREATE INDEX IF NOT EXISTS idx_semantic_cache_last_used ON semantic_cache(last_used)'
    ]
  },

  // =============================================================
  // 📚 MODULE REFERENCE (Bibliothèque d'IDs structurés)
  // =============================================================
  {
    module: 'reference',
    version: 1,
    name: 'ref_zones',
    schema: `
      CREATE TABLE IF NOT EXISTS ref_zones (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_ref_zones_name ON ref_zones(name)'
    ]
  },
  {
    module: 'reference',
    version: 1,
    name: 'ref_circuits',
    schema: `
      CREATE TABLE IF NOT EXISTS ref_circuits (
        id TEXT PRIMARY KEY,
        zoneId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (zoneId) REFERENCES ref_zones(id) ON DELETE CASCADE
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_ref_circuits_zone ON ref_circuits(zoneId)',
      'CREATE INDEX IF NOT EXISTS idx_ref_circuits_name ON ref_circuits(name)'
    ]
  },
  {
    module: 'reference',
    version: 1,
    name: 'ref_parametres',
    schema: `
      CREATE TABLE IF NOT EXISTS ref_parametres (
        id TEXT PRIMARY KEY,
        circuitId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        unit TEXT,
        dataType TEXT DEFAULT 'numeric',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (circuitId) REFERENCES ref_circuits(id) ON DELETE CASCADE
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_ref_parametres_circuit ON ref_parametres(circuitId)',
      'CREATE INDEX IF NOT EXISTS idx_ref_parametres_name ON ref_parametres(name)'
    ]
  },
  {
    module: 'reference',
    version: 1,
    name: 'ref_aliases',
    schema: `
      CREATE TABLE IF NOT EXISTS ref_aliases (
        entityId TEXT NOT NULL,
        alias TEXT NOT NULL,
        entityType TEXT NOT NULL, -- 'zone', 'circuit', 'parametre'
        createdAt INTEGER NOT NULL,
        PRIMARY KEY (entityId, alias)
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_ref_aliases_alias ON ref_aliases(alias)',
      'CREATE INDEX IF NOT EXISTS idx_ref_aliases_entity ON ref_aliases(entityId)'
    ]
  },
  {
    module: 'mindmap',
    version: 1,
    name: 'circuit_mindmaps',
    schema: `
      CREATE TABLE IF NOT EXISTS circuit_mindmaps (
        id TEXT PRIMARY KEY,
        circuit_id TEXT NOT NULL,
        mindmap_data TEXT NOT NULL,
        thumbnail_url TEXT,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        version INTEGER DEFAULT 1,
        FOREIGN KEY (circuit_id) REFERENCES ref_circuits(id) ON DELETE CASCADE
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_circuit_mindmaps_circuit ON circuit_mindmaps(circuit_id)',
      'CREATE INDEX IF NOT EXISTS idx_circuit_mindmaps_created ON circuit_mindmaps(created_at)'
    ]
  },
  {
    module: 'mindmap',
    version: 1,
    name: 'mindmap_nodes',
    schema: `
      CREATE TABLE IF NOT EXISTS mindmap_nodes (
        id TEXT PRIMARY KEY,
        mindmap_id TEXT NOT NULL,
        parent_id TEXT,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        position_x REAL,
        position_y REAL,
        style TEXT DEFAULT '{}',
        FOREIGN KEY (mindmap_id) REFERENCES circuit_mindmaps(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES mindmap_nodes(id) ON DELETE SET NULL
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_mindmap_nodes_mindmap ON mindmap_nodes(mindmap_id)',
      'CREATE INDEX IF NOT EXISTS idx_mindmap_nodes_parent ON mindmap_nodes(parent_id)',
      'CREATE INDEX IF NOT EXISTS idx_mindmap_nodes_type ON mindmap_nodes(type)'
    ]
  },
  {
    module: 'mindmap',
    version: 1,
    name: 'mindmap_embeddings',
    schema: `
      CREATE TABLE IF NOT EXISTS mindmap_embeddings (
        id TEXT PRIMARY KEY,
        mindmap_id TEXT NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding BLOB NOT NULL,
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (mindmap_id) REFERENCES circuit_mindmaps(id) ON DELETE CASCADE
      )
    `,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_mindmap_embeddings_mindmap ON mindmap_embeddings(mindmap_id)'
    ]
  }
];

export function getSchemasByModule(module: string): TableDefinition[] {
  return SCHEMAS.filter(s => s.module === module);
}

export function getAllSchemas(): TableDefinition[] {
  return SCHEMAS;
}

export function getSchemasByVersion(module: string, version: number): TableDefinition[] {
  return SCHEMAS.filter(s => s.module === module && s.version === version);
}

export function getLatestSchemas(module: string): TableDefinition[] {
  const moduleSchemas = SCHEMAS.filter(s => s.module === module);
  const latestVersion = Math.max(...moduleSchemas.map(s => s.version));
  return moduleSchemas.filter(s => s.version === latestVersion);
}