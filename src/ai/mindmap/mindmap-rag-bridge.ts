// src/ai/mindmap/mindmap-rag-bridge.ts

import { mindMapManager } from './mindmap-manager';
import { mindMapEmbedder } from './mindmap-embedder';
import { chromaDBManager } from '../vector/chromadb-manager';
import { embeddingService } from '../vector/embeddings';
import { getSQLiteCore } from '../core/sqlite';
import { DbMindMapNode } from './types';
import { logger } from '../core/sqlite/utils';
import { mindMapCache } from './mindmap-cache';

export interface MindMapContextResult {
  markdown: string;
  circuitId: string;
  nodesCount: number;
  matchedNodes: any[];
}

const CONTEXT_CACHE_PREFIX = 'rag:context:';
const CONTEXT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export class MindMapRagBridge {
  private static instance: MindMapRagBridge;

  private constructor() {}

  public static getInstance(): MindMapRagBridge {
    if (!MindMapRagBridge.instance) {
      MindMapRagBridge.instance = new MindMapRagBridge();
    }
    return MindMapRagBridge.instance;
  }

  /**
   * Generates a rich, structured Markdown context block representing the full mindmap of a circuit.
   * This allows the LLM to understand KKS relationships, parameter dependencies, and specific notes.
   * Results are cached with a 10-minute TTL to avoid redundant regeneration during chat sessions.
   */
  public getMindMapContextForCircuit(circuitId: string): MindMapContextResult | null {
    // Check cache first
    const cacheKey = CONTEXT_CACHE_PREFIX + circuitId;
    const cached = mindMapCache.get<MindMapContextResult>(cacheKey);
    if (cached) {
      logger.info('MINDMAP-RAG', `📦 Contexte RAG récupéré du cache pour ${circuitId}`);
      return cached;
    }

    const mindmap = mindMapManager.getMindMapByCircuit(circuitId);
    if (!mindmap) return null;

    const nodes = mindmap.mindmapData.nodes;
    if (nodes.length === 0) return null;

    const rootLabel = mindmap.mindmapData.rootLabel || circuitId;
    
    // Group nodes by type
    const parameters = nodes.filter(n => n.type === 'parameter');
    const formulas = nodes.filter(n => n.type === 'formula');
    const dependencies = nodes.filter(n => n.type === 'dependency');
    const notes = nodes.filter(n => n.type === 'note');

    // Create a node mapping for parent reference resolution
    const nodeMap = new Map<string, typeof nodes[0]>();
    nodes.forEach(n => nodeMap.set(n.id, n));

    let markdown = `\n### 🧠 SCHÉMA MENTAL INTERACTIF (MIND MAP) - CIRCUIT [${circuitId}]\n`;
    markdown += `*Ce schéma mental présente la structure de compréhension visuelle, les interdépendances industrielles et les formules opérationnelles du circuit "${rootLabel}" (Version ${mindmap.version}).*\n\n`;

    // 1. Structure outline
    markdown += `**📐 Hiérarchie Structurelle des Dépendances :**\n`;
    const roots = nodes.filter(n => !n.parentId);
    
    const printTree = (nodeId: string, indent: string = '  '): string => {
      const node = nodeMap.get(nodeId);
      if (!node) return '';
      let res = `${indent}- **[${node.type.toUpperCase()}]** "${node.label}"`;
      if (node.description) res += ` : *${node.description}*`;
      res += '\n';

      const children = nodes.filter(n => n.parentId === nodeId);
      children.forEach(child => {
        res += printTree(child.id, indent + '    ');
      });
      return res;
    };

    roots.forEach(root => {
      markdown += printTree(root.id, '  ');
    });

    // 2. Parameters detail
    if (parameters.length > 0) {
      markdown += `\n**📊 Paramètres Critiques à Surveiller :**\n`;
      parameters.forEach(p => {
        let pLine = `  - **"${p.label}"**`;
        if (p.description) pLine += ` : ${p.description}`;
        if (p.parentId) {
          const parent = nodeMap.get(p.parentId);
          if (parent) pLine += ` *(lié à "${parent.label}")*`;
        }
        markdown += pLine + '\n';
      });
    }

    // 3. Formulas detail
    if (formulas.length > 0) {
      markdown += `\n**🧮 Formules & Ratios Opérationnels :**\n`;
      formulas.forEach(f => {
        let fLine = `  - **"${f.label}"**`;
        if (f.description) fLine += ` : ${f.description}`;
        // Find inputs (child parameters)
        const inputs = nodes.filter(n => n.parentId === f.id);
        if (inputs.length > 0) {
          fLine += ` *(Entrées requises: ${inputs.map(i => `"${i.label}"`).join(', ')})*`;
        }
        markdown += fLine + '\n';
      });
    }

    // 4. Notes & Operational procedures
    if (notes.length > 0) {
      markdown += `\n**📝 Notes de Réglage & Consignes de Maintenance :**\n`;
      notes.forEach(n => {
        let nLine = `  - "${n.label}"`;
        if (n.description) nLine += ` : *${n.description}*`;
        markdown += nLine + '\n';
      });
    }

    const result: MindMapContextResult = {
      markdown,
      circuitId,
      nodesCount: nodes.length,
      matchedNodes: nodes
    };

    // Store in cache
    mindMapCache.set(cacheKey, result, CONTEXT_CACHE_TTL);
    logger.info('MINDMAP-RAG', `💾 Contexte RAG généré et mis en cache pour ${circuitId} (${nodes.length} nœuds)`);

    return result;
  }

  /**
   * Invalidates the cached context for a specific circuit (call after mindmap update)
   */
  public invalidateContextCache(circuitId: string): void {
    const cacheKey = CONTEXT_CACHE_PREFIX + circuitId;
    mindMapCache.invalidate(cacheKey);
    logger.info('MINDMAP-RAG', `🔄 Cache du contexte RAG invalidé pour ${circuitId}`);
  }

  /**
   * Performs hybrid semantic search (ChromaDB + SQLite fallback) for specific mindmap nodes.
   * Context results are served from cache when available.
   */
  public async searchMindMapNodes(query: string, limit: number = 5): Promise<MindMapContextResult[]> {
    const results: MindMapContextResult[] = [];
    const matchedCircuitIds = new Set<string>();

    try {
      // 1. Semantic search in ChromaDB MINDMAP collection
      try {
        const queryEmbedding = await embeddingService.generateEmbedding(query);
        const searchResults = await chromaDBManager.search('MINDMAP', query, {
          nResults: limit,
          include: ['metadatas', 'distances']
        });

        if (searchResults.metadatas && searchResults.metadatas.length > 0) {
          searchResults.metadatas.forEach((meta: any) => {
            if (meta && meta.circuitId) {
              matchedCircuitIds.add(meta.circuitId);
            }
          });
        }
      } catch (chromaErr) {
        logger.warn('MINDMAP-RAG', 'ChromaDB semantic search failed, falling back to SQLite string search', chromaErr);
        
        // Fallback: SQL search in SQLite mindmap_nodes and circuit_mindmaps
        const db = getSQLiteCore().getDB();
        const sqlMatches = db.prepare(`
          SELECT DISTINCT c.circuit_id 
          FROM circuit_mindmaps c
          JOIN mindmap_nodes n ON n.mindmap_id = c.id
          WHERE n.label LIKE ? OR n.description LIKE ? OR c.circuit_id LIKE ?
          LIMIT ?
        `).all(`%${query}%`, `%${query}%`, `%${query}%`, limit) as { circuit_id: string }[];

        sqlMatches.forEach(m => matchedCircuitIds.add(m.circuit_id));
      }

      // 2. Fetch full structured context for all matching circuits (uses cache internally)
      for (const circuitId of matchedCircuitIds) {
        const context = this.getMindMapContextForCircuit(circuitId);
        if (context) {
          results.push(context);
        }
      }

    } catch (error) {
      logger.error('MINDMAP-RAG', 'Error performing RAG node search', error);
    }

    return results;
  }
}

export const mindMapRagBridge = MindMapRagBridge.getInstance();