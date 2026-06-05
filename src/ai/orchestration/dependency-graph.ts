/**
 * @fileOverview DependencyGraph - Graphe de dépendances des mots-clés
 * @version 2.0.0
 * @description Mappe les relations entre termes techniques pour guider la recherche
 * @innovation 4
 * @migration SQLite Core - Remplacement du stockage JSON
 */

import { getSQLiteCore } from '@/ai/core/sqlite/manager';

// ============================================================================
// TYPES
// ============================================================================

export interface KeywordNode {
  keyword: string;
  relations: KeywordRelation[];
  weight: number;           // Importance du terme (0-10)
  documents: string[];      // Documents associés
  lastUsed: number;
}

export interface KeywordRelation {
  target: string;
  type: 'type_of' | 'part_of' | 'related_to' | 'function_of' | 'component_of';
  strength: number;         // Force de la relation (0-1)
}

export interface KeywordGraphStats {
  nodeCount: number;
  relationCount: number;
  lastUpdated: string;
}

// ============================================================================
// LOGS STRUCTURÉS
// ============================================================================

const LOG_PREFIX = '[DEPENDENCY-GRAPH]';

function logInfo(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logSuccess(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} ✅ ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logWarning(message: string, data?: any): void {
  console.warn(`${LOG_PREFIX} ⚠️ ${message}`);
  if (data) console.warn(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

// ============================================================================
// GRAPHE PAR DÉFAUT (PRÉ-REMPLI POUR L'INDUSTRIE)
// ============================================================================

const DEFAULT_NODES: KeywordNode[] = [
  {
    keyword: 'accouplement',
    weight: 8,
    documents: ['ACCOUPLEMENTS.pdf', 'maintenance_accouplements.pdf'],
    lastUsed: Date.now(),
    relations: [
      { target: 'auxiliaire', type: 'type_of', strength: 0.9 },
      { target: 'puissance', type: 'type_of', strength: 0.9 },
      { target: 'flexible', type: 'type_of', strength: 0.8 },
      { target: 'rigide', type: 'type_of', strength: 0.8 },
      { target: 'turbine', type: 'part_of', strength: 0.7 },
      { target: 'alternateur', type: 'part_of', strength: 0.7 },
      { target: 'transmettre couple', type: 'function_of', strength: 0.95 },
      { target: 'dentures', type: 'component_of', strength: 0.8 },
      { target: 'manchon', type: 'component_of', strength: 0.8 },
      { target: 'bride', type: 'component_of', strength: 0.7 }
    ]
  },
  {
    keyword: 'turbine',
    weight: 10,
    documents: ['TG1/', 'TG2/', 'specifications_turbine.pdf'],
    lastUsed: Date.now(),
    relations: [
      { target: 'gaz', type: 'type_of', strength: 0.9 },
      { target: 'vapeur', type: 'type_of', strength: 0.9 },
      { target: 'accouplement', type: 'component_of', strength: 0.8 },
      { target: 'alternateur', type: 'related_to', strength: 0.9 }
    ]
  },
  {
    keyword: 'lubrification',
    weight: 7,
    documents: ['HUILE_DE_CONTROLE_TG.pdf', 'maintenance_lubrification.pdf'],
    lastUsed: Date.now(),
    relations: [
      { target: 'huile', type: 'related_to', strength: 0.9 },
      { target: 'palier', type: 'part_of', strength: 0.8 },
      { target: 'accouplement', type: 'related_to', strength: 0.6 }
    ]
  }
];

// ============================================================================
// SERVICE
// ============================================================================

export class DependencyGraph {
  private db = getSQLiteCore();
  private initialized = false;
  private cacheNodes: Map<string, KeywordNode> | null = null;

  constructor() {}

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.db.initialize();
      
      // Vérifier si des nœuds existent déjà
      const existingNodes = await this.getAllNodesFromDB();
      
      if (existingNodes.length === 0) {
        // Initialiser avec le graphe par défaut
        logInfo('Aucun nœud trouvé, initialisation avec graphe par défaut...');
        for (const node of DEFAULT_NODES) {
          await this.saveNodeToDB(node);
        }
        logSuccess(`Initialisé avec ${DEFAULT_NODES.length} nœuds par défaut`);
      } else {
        logSuccess(`Chargé: ${existingNodes.length} nœuds depuis SQLite`);
      }
      
      this.initialized = true;
      // Invalider le cache
      this.cacheNodes = null;
    } catch (error) {
      logWarning(`Erreur initialisation: ${error}`);
      throw error;
    }
  }

  private async saveNodeToDB(node: KeywordNode): Promise<void> {
    await this.db.orchestration.saveKeywordNode(
      node.keyword,
      node.weight,
      node.documents,
      node.relations
    );
  }

  private async getAllNodesFromDB(): Promise<KeywordNode[]> {
    const rows = this.db.getDB().prepare(`
      SELECT keyword, weight, documents, lastUsed, relations 
      FROM orchestration_keyword_graph 
      ORDER BY weight DESC
    `).all() as any[];
    
    return rows.map(row => ({
      keyword: row.keyword,
      weight: row.weight,
      documents: JSON.parse(row.documents),
      lastUsed: row.lastUsed,
      relations: JSON.parse(row.relations)
    }));
  }

  private async loadAllNodesToCache(): Promise<void> {
    if (this.cacheNodes === null) {
      const nodes = await this.getAllNodesFromDB();
      this.cacheNodes = new Map();
      for (const node of nodes) {
        this.cacheNodes.set(node.keyword, node);
      }
    }
  }

  private invalidateCache(): void {
    this.cacheNodes = null;
  }

  /**
   * Extrait les mots-clés d'une requête
   */
  private extractKeywords(query: string): string[] {
    const stopWords = new Set([
      'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'en', 'dans',
      'pour', 'par', 'avec', 'sans', 'sur', 'sous', 'est', 'sont', 'a', 'ont',
      'donne', 'moi', 'info', 'role', 'que', 'est-ce', 'quelle', 'quel'
    ]);

    return query
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
  }

  /**
   * Trouve le nœud le plus pertinent dans le graphe
   */
  private async findBestNode(keywords: string[]): Promise<KeywordNode | null> {
    await this.loadAllNodesToCache();
    
    let bestNode: KeywordNode | null = null;
    let bestScore = 0;

    for (const kw of keywords) {
      const node = this.cacheNodes?.get(kw);
      if (node && node.weight > bestScore) {
        bestScore = node.weight;
        bestNode = node;
      }
    }

    return bestNode;
  }

  /**
   * Enrichit une requête avec les mots-clés liés
   */
  async enrichQuery(query: string, maxRelated: number = 5): Promise<{
    original: string;
    enriched: string;
    relatedKeywords: string[];
    confidence: number;
  }> {
    await this.initialize();

    const keywords = this.extractKeywords(query);
    const bestNode = await this.findBestNode(keywords);

    if (!bestNode) {
      logInfo(`Aucun nœud trouvé pour: ${keywords.join(', ')}`);
      return {
        original: query,
        enriched: query,
        relatedKeywords: [],
        confidence: 0
      };
    }

    const related = bestNode.relations
      .sort((a, b) => b.strength - a.strength)
      .slice(0, maxRelated)
      .map(r => r.target);

    const enriched = `${query} ${related.join(' ')}`;

    logInfo(`Enrichissement: "${bestNode.keyword}" → +${related.length} termes`);
    logInfo(`   ├─ Termes liés: ${related.join(', ')}`);

    return {
      original: query,
      enriched,
      relatedKeywords: related,
      confidence: bestNode.weight / 10
    };
  }

  /**
   * Ajoute ou met à jour un nœud
   */
  async addOrUpdateNode(
    keyword: string,
    weight: number,
    documents: string[],
    relations: KeywordRelation[]
  ): Promise<KeywordNode> {
    await this.initialize();

    const existing = await this.db.orchestration.getKeywordNode(keyword);
    
    const node: KeywordNode = {
      keyword,
      weight: existing ? Math.max(existing.weight, weight) : weight,
      documents: [...new Set([...(existing?.documents || []), ...documents])],
      lastUsed: Date.now(),
      relations: existing ? this.mergeRelations(existing.relations, relations) : relations
    };

    await this.saveNodeToDB(node);
    this.invalidateCache();
    
    logSuccess(`Nœud mis à jour: "${keyword}" (poids: ${node.weight}, ${node.relations.length} relations)`);

    return node;
  }

  private mergeRelations(
    existing: KeywordRelation[],
    incoming: KeywordRelation[]
  ): KeywordRelation[] {
    const merged = new Map<string, KeywordRelation>();

    for (const rel of existing) {
      merged.set(rel.target, rel);
    }
    for (const rel of incoming) {
      const existingRel = merged.get(rel.target);
      if (existingRel) {
        existingRel.strength = Math.max(existingRel.strength, rel.strength);
      } else {
        merged.set(rel.target, rel);
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Récupère un nœud par mot-clé
   */
  async getNode(keyword: string): Promise<KeywordNode | null> {
    await this.initialize();
    return this.db.orchestration.getKeywordNode(keyword);
  }

  /**
   * Récupère tous les nœuds
   */
  async getNodes(): Promise<KeywordNode[]> {
    await this.initialize();
    return this.getAllNodesFromDB();
  }

  /**
   * Supprime un nœud
   */
  async deleteNode(keyword: string): Promise<boolean> {
    await this.initialize();
    const result = this.db.getDB().prepare(`DELETE FROM orchestration_keyword_graph WHERE keyword = ?`).run(keyword.toLowerCase());
    this.invalidateCache();
    return result.changes > 0;
  }

  /**
   * Récupère les statistiques du graphe
   */
  async getStats(): Promise<{
    nodeCount: number;
    relationCount: number;
    topKeywords: Array<{ keyword: string; weight: number }>;
    lastUpdated: string;
  }> {
    await this.initialize();

    const nodes = await this.getAllNodesFromDB();
    
    const topKeywords = nodes
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
      .map(n => ({ keyword: n.keyword, weight: n.weight }));

    const relationCount = nodes.reduce((acc, n) => acc + n.relations.length, 0);

    return {
      nodeCount: nodes.length,
      relationCount,
      topKeywords,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Met à jour le poids d'un nœud
   */
  async updateWeight(keyword: string, delta: number): Promise<void> {
    await this.initialize();
    const node = await this.getNode(keyword);
    if (node) {
      const newWeight = Math.min(10, Math.max(1, node.weight + delta));
      await this.addOrUpdateNode(keyword, newWeight, node.documents, node.relations);
    }
  }

  /**
   * Enregistre une utilisation de mot-clé (augmente le poids)
   */
  async recordUsage(keyword: string): Promise<void> {
    await this.updateWeight(keyword, 0.2);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: DependencyGraph | null = null;

export function getDependencyGraph(): DependencyGraph {
  if (!instance) {
    instance = new DependencyGraph();
  }
  return instance;
}

export const dependencyGraph = getDependencyGraph();

// ============================================================================
// EXPORT PAR DÉFAUT
// ============================================================================

export default {
  DependencyGraph,
  dependencyGraph,
  getDependencyGraph
};