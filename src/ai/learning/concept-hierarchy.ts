/**
 * @fileOverview ConceptHierarchy - Innovation 32.1.
 * Construit et gère la hiérarchie sémantique des concepts techniques.
 * Version corrigée avec Core SQLite - Persistance définitive.
 * 
 * @version 4.0.0
 * @lastUpdated 2026-04-24
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { conceptLogger } from './utils/logger';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// INTERFACES
// ============================================================================

export interface ConceptNode {
  id: string;
  name: string;
  level: number;
  parentId: string | null;
  description: string;
  synonyms?: string[];
  importance?: number;
}

export interface ConceptRelation {
  sourceId: string;
  targetId: string;
  type: 'IS_A' | 'PART_OF' | 'RELATED_TO';
}

export interface HierarchyExtractionResult {
  nodes: ConceptNode[];
  relations: ConceptRelation[];
  processingTime: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const MAX_NODES_PER_EXTRACTION = 50;

// ============================================================================
// INITIALISATION CORE SQLITE
// ============================================================================

const db = SQLiteCore.getInstance();
let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await db.initialize();
    initialized = true;
  }
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function calculateLevel(node: ConceptNode, nodes: ConceptNode[]): number {
  if (node.level !== undefined && node.level !== 0) return node.level;
  
  if (!node.parentId) return 0;
  
  const parent = nodes.find(n => n.id === node.parentId);
  if (parent) {
    return calculateLevel(parent, nodes) + 1;
  }
  
  return 0;
}

async function updateExtractionStats(
  success: boolean,
  processingTime: number,
  nodesCount: number,
  relationsCount: number
): Promise<void> {
  await ensureInitialized();
  await db.recordMetric('concept_hierarchy', 'extraction', success ? 1 : 0);
  await db.recordMetric('concept_hierarchy', 'extraction_duration', processingTime);
  await db.recordMetric('concept_hierarchy', 'nodes_extracted', nodesCount);
  await db.recordMetric('concept_hierarchy', 'relations_extracted', relationsCount);
}

// ============================================================================
// EXTRACTION DE HIÉRARCHIE
// ============================================================================

export async function extractHierarchicalConcepts(text: string): Promise<HierarchyExtractionResult> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  conceptLogger.info('EXTRACT', `🔍 Extraction de la hiérarchie conceptuelle (${text.length} caractères)`);
  
  const result: HierarchyExtractionResult = {
    nodes: [],
    relations: [],
    processingTime: 0,
    success: false
  };
  
  try {
    const userPrompt = `Analyse ce texte technique et identifie les concepts clés et leurs relations hiérarchiques.
    
Format JSON STRICT: 
{
  "concepts": [
    {"id": "tg1", "name": "Turbine TG1", "parent": null, "desc": "Turbine à gaz principale", "synonyms": ["TG1", "Turbine gaz"]},
    {"id": "compresseur", "name": "Compresseur", "parent": "tg1", "desc": "Compresseur axial", "synonyms": []}
  ],
  "relations": [
    {"from": "compresseur", "to": "tg1", "type": "PART_OF"}
  ]
}

Texte: "${text.substring(0, 2000)}"`;

    const response = await callOllama(userPrompt, {
      model: 'phi:2.7b',
      temperature: 0.3,
      maxTokens: 1000,
      timeout: 30000
    });
    
    const elapsedTime = Date.now() - startTime;
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      
      const nodes: ConceptNode[] = (data.concepts || []).slice(0, MAX_NODES_PER_EXTRACTION).map((c: Record<string, any>) => ({
        id: c.id,
        name: c.name,
        level: 0,
        parentId: c.parent || null,
        description: c.desc || '',
        synonyms: c.synonyms || [],
        importance: 5
      }));
      
      for (const node of nodes) {
        node.level = calculateLevel(node, nodes);
      }
      
      const relations: ConceptRelation[] = (data.relations || []).map((r: Record<string, any>) => ({
        sourceId: r.from,
        targetId: r.to,
        type: r.type === 'PART_OF' ? 'PART_OF' : 
              r.type === 'IS_A' ? 'IS_A' : 'RELATED_TO'
      }));
      
      result.nodes = nodes;
      result.relations = relations;
      result.success = true;
      result.processingTime = elapsedTime;
      
      await updateExtractionStats(true, elapsedTime, nodes.length, relations.length);
      
      // Sauvegarder en SQLite
      const dbInstance = db.getDB();
      
      for (const node of nodes) {
        dbInstance.prepare(`
          INSERT OR REPLACE INTO learning_concept_nodes (id, name, level, parentId, description, synonyms, importance)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(node.id, node.name, node.level, node.parentId, node.description, JSON.stringify(node.synonyms || []), node.importance || 5);
      }
      
      for (const relation of relations) {
        dbInstance.prepare(`
          INSERT OR REPLACE INTO learning_concept_relations (sourceId, targetId, type)
          VALUES (?, ?, ?)
        `).run(relation.sourceId, relation.targetId, relation.type);
      }
      
      conceptLogger.success('EXTRACT', `✅ Hiérarchie extraite en ${formatDuration(elapsedTime)} - ${nodes.length} nœuds, ${relations.length} relations`);
      
      const rootNodes = nodes.filter(n => !n.parentId);
      for (const node of rootNodes) {
        conceptLogger.metric('EXTRACT', `Concept racine: ${node.name}`, `niveau ${node.level}`);
      }
      
    } else {
      throw new Error('Aucun JSON trouvé dans la réponse');
    }
    
  } catch (error: unknown) {
    const err = error as Error;
    const elapsedTime = Date.now() - startTime;
    await updateExtractionStats(false, elapsedTime, 0, 0);
    result.error = err.message;
    
    conceptLogger.error('EXTRACT', `❌ Échec extraction après ${formatDuration(elapsedTime)}`, { error: err.message });
  }
  
  return result;
}

export async function expandHierarchicalContext(query: string): Promise<string> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  const dbInstance = db.getDB();
  const nodesRows = dbInstance.prepare(`SELECT * FROM learning_concept_nodes ORDER BY level ASC`).all() as any[];
  const availableNodes = nodesRows.map((row: Record<string, any>) => ({
    id: row.id,
    name: row.name,
    level: row.level,
    parentId: row.parentId,
    description: row.description,
    synonyms: JSON.parse(row.synonyms || '[]'),
    importance: row.importance || 5
  }));
  
  if (availableNodes.length === 0) {
    conceptLogger.info('EXPAND', 'Aucun nœud disponible pour expansion');
    return "";
  }
  
  conceptLogger.info('EXPAND', `🔍 Expansion contextuelle pour: "${query.substring(0, 50)}..." - ${availableNodes.length} nœuds disponibles`);
  
  const q = query.toLowerCase();
  
  const matchedNodes = availableNodes.filter(n => 
    q.includes(n.name.toLowerCase()) ||
    (n.synonyms && n.synonyms.some((s: string) => q.includes(s.toLowerCase())))
  );
  
  if (matchedNodes.length === 0) {
    conceptLogger.info('EXPAND', 'Aucun concept correspondant trouvé');
    return "";
  }
  
  conceptLogger.metric('EXPAND', 'Concepts matchés', matchedNodes.length);
  
  let context = `\n--- HIÉRARCHIE CONCEPTUELLE ---\n`;
  
  for (const matchedNode of matchedNodes) {
    context += `\n📌 Concept: **${matchedNode.name}** (niveau ${matchedNode.level})\n`;
    context += `   Description: ${matchedNode.description || 'Non spécifiée'}\n`;
    
    if (matchedNode.parentId) {
      const parent = availableNodes.find(n => n.id === matchedNode.parentId);
      if (parent) {
        context += `   ⬆️ Parent: ${parent.name}\n`;
      }
    }
    
    const children = availableNodes.filter(n => n.parentId === matchedNode.id);
    if (children.length > 0) {
      context += `   ⬇️ Enfants: ${children.map(c => c.name).join(', ')}\n`;
    }
  }
  
  const elapsedTime = Date.now() - startTime;
  conceptLogger.success('EXPAND', `Contexte étendu en ${formatDuration(elapsedTime)} - ${matchedNodes.length} concepts, ${context.length} caractères`);
  
  return context;
}

export async function getAllConceptNodes(): Promise<ConceptNode[]> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  const rows = dbInstance.prepare(`SELECT * FROM learning_concept_nodes ORDER BY level ASC`).all() as any[];
  
  return rows.map((row: Record<string, any>) => ({
    id: row.id,
    name: row.name,
    level: row.level,
    parentId: row.parentId,
    description: row.description,
    synonyms: JSON.parse(row.synonyms || '[]'),
    importance: row.importance || 5
  }));
}

export async function getAllConceptRelations(): Promise<ConceptRelation[]> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  return dbInstance.prepare(`SELECT * FROM learning_concept_relations`).all() as ConceptRelation[];
}

export async function getConceptById(id: string): Promise<ConceptNode | undefined> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  const row = dbInstance.prepare(`SELECT * FROM learning_concept_nodes WHERE id = ?`).get(id) as any;
  
  if (!row) return undefined;
  
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    parentId: row.parentId,
    description: row.description,
    synonyms: JSON.parse(row.synonyms || '[]'),
    importance: row.importance || 5
  };
}

export async function getDescendants(rootId: string): Promise<ConceptNode[]> {
  await ensureInitialized();
  
  const allNodes = await getAllConceptNodes();
  const descendants: ConceptNode[] = [];
  const children = allNodes.filter(n => n.parentId === rootId);
  
  for (const child of children) {
    descendants.push(child);
    descendants.push(...(await getDescendants(child.id)));
  }
  
  return descendants;
}

export async function getAncestors(nodeId: string): Promise<ConceptNode[]> {
  await ensureInitialized();
  
  const ancestors: ConceptNode[] = [];
  const node = await getConceptById(nodeId);
  
  if (node && node.parentId) {
    const parent = await getConceptById(node.parentId);
    if (parent) {
      ancestors.push(parent);
      ancestors.push(...await getAncestors(parent.id));
    }
  }
  
  return ancestors;
}

export async function formatHierarchy(): Promise<string> {
  await ensureInitialized();
  
  const rootNodes = await getRootNodes();
  let output = '';
  
  async function formatNode(node: ConceptNode, indent: number = 0): Promise<void> {
    const prefix = '  '.repeat(indent);
    output += `${prefix}📁 ${node.name}`;
    if (node.description) {
      output += ` - ${node.description.substring(0, 50)}`;
    }
    output += '\n';
    
    const children = await getChildren(node.id);
    for (const child of children) {
      await formatNode(child, indent + 1);
    }
  }
  
  for (const root of rootNodes) {
    await formatNode(root);
  }
  
  return output;
}

export async function getRootNodes(): Promise<ConceptNode[]> {
  await ensureInitialized();
  
  const allNodes = await getAllConceptNodes();
  return allNodes.filter(n => !n.parentId);
}

export async function getChildren(nodeId: string): Promise<ConceptNode[]> {
  await ensureInitialized();
  
  const allNodes = await getAllConceptNodes();
  return allNodes.filter(n => n.parentId === nodeId);
}

export async function deleteConceptNode(id: string): Promise<boolean> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  
  // Supprimer d'abord les relations
  dbInstance.prepare(`DELETE FROM learning_concept_relations WHERE sourceId = ? OR targetId = ?`).run(id, id);
  
  // Supprimer le nœud
  const result = dbInstance.prepare(`DELETE FROM learning_concept_nodes WHERE id = ?`).run(id);
  
  return result.changes > 0;
}

export async function clearAllConcepts(): Promise<void> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  dbInstance.prepare(`DELETE FROM learning_concept_nodes`).run();
  dbInstance.prepare(`DELETE FROM learning_concept_relations`).run();
  
  conceptLogger.success('CLEAR', 'Tous les concepts ont été supprimés');
}

export async function getHierarchyStats(): Promise<{
  totalExtractions: number;
  successfulExtractions: number;
  failedExtractions: number;
  successRate: number;
  totalNodesExtracted: number;
  totalRelationsExtracted: number;
  avgNodesPerExtraction: number;
  avgProcessingTime: number;
  lastExtractionTime: number | null;
  lastExtractionDuration: number | null;
}> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  
  // Récupérer les métriques depuis la table metrics
  const extractions = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'concept_hierarchy' AND metricName = 'extraction'
  `).all() as any[];
  
  const durations = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'concept_hierarchy' AND metricName = 'extraction_duration'
  `).all() as any[];
  
  const nodesExtracted = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'concept_hierarchy' AND metricName = 'nodes_extracted'
  `).all() as any[];
  
  const relationsExtracted = dbInstance.prepare(`
    SELECT * FROM metrics WHERE module = 'concept_hierarchy' AND metricName = 'relations_extracted'
  `).all() as any[];
  
  const totalExtractions = extractions.length;
  const successfulExtractions = extractions.filter((m: { metricValue: number }) => m.metricValue === 1).length;
  const failedExtractions = totalExtractions - successfulExtractions;
  const successRate = totalExtractions > 0 ? successfulExtractions / totalExtractions : 0;
  
  const totalNodesExtracted = nodesExtracted.reduce((sum: number, m: { metricValue: number }) => sum + m.metricValue, 0);
  const totalRelationsExtracted = relationsExtracted.reduce((sum: number, m: { metricValue: number }) => sum + m.metricValue, 0);
  const avgNodesPerExtraction = totalExtractions > 0 ? totalNodesExtracted / totalExtractions : 0;
  
  const avgProcessingTime = durations.length > 0
    ? durations.reduce((sum: number, m: { metricValue: number }) => sum + m.metricValue, 0) / durations.length
    : 0;
  
  const lastExtraction = extractions[extractions.length - 1];
  const lastExtractionTime = lastExtraction?.timestamp || null;
  const lastExtractionDuration = durations[durations.length - 1]?.metricValue || null;
  
  return {
    totalExtractions,
    successfulExtractions,
    failedExtractions,
    successRate: Math.round(successRate * 100) / 100,
    totalNodesExtracted,
    totalRelationsExtracted,
    avgNodesPerExtraction: Math.round(avgNodesPerExtraction * 100) / 100,
    avgProcessingTime: Math.round(avgProcessingTime),
    lastExtractionTime,
    lastExtractionDuration
  };
}

export async function resetHierarchyStats(): Promise<void> {
  await ensureInitialized();
  
  const dbInstance = db.getDB();
  
  // Supprimer toutes les données
  dbInstance.prepare(`DELETE FROM learning_concept_nodes`).run();
  dbInstance.prepare(`DELETE FROM learning_concept_relations`).run();
  
  conceptLogger.success('STATS', 'Statistiques de hiérarchie réinitialisées');
}

export default {
  extractHierarchicalConcepts,
  expandHierarchicalContext,
  getAllConceptNodes,
  getAllConceptRelations,
  getConceptById,
  getDescendants,
  getAncestors,
  formatHierarchy,
  getRootNodes,
  getChildren,
  deleteConceptNode,
  clearAllConcepts,
  getHierarchyStats,
  resetHierarchyStats
};