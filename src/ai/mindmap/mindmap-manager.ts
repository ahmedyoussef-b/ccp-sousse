// src/ai/mindmap/mindmap-manager.ts

import { getSQLiteCore } from '../core/sqlite';
import { 
  CircuitMindMap, 
  MindMapNode, 
  MindMapData, 
  DbCircuitMindMap, 
  DbMindMapNode 
} from './types';
import { logger } from '../core/sqlite/utils';
import { v4 as uuidv4 } from 'uuid';

// Type complet pour un nœud avec les colonnes industrielles additionnelles
interface FullDbMindMapNode extends DbMindMapNode {
  kks: string | null;
  unit: string | null;
  criticality: string | null;
  optimal_value: string | null;
  formula_expression: string | null;
}

export class MindMapManager {
  private static instance: MindMapManager;

  private constructor() {}

  public static getInstance(): MindMapManager {
    if (!MindMapManager.instance) {
      MindMapManager.instance = new MindMapManager();
    }
    return MindMapManager.instance;
  }

  /**
   * Generates a deterministic hash for a node to detect changes efficiently
   */
  private hashNode(node: MindMapNode): string {
    const key = [
      node.id,
      node.parentId ?? '__root__',
      node.type,
      node.label,
      node.description ?? '',
      node.positionX ?? -1,
      node.positionY ?? -1,
      node.kks ?? '',
      node.unit ?? '',
      node.criticality ?? 'low',
      node.optimalValue ?? '',
      node.formulaExpression ?? ''
    ].join('|');
    
    // Simple fast hash (FNV-1a inspired)
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash.toString(36);
  }

  /**
   * Saves or updates a full mindmap for a circuit
   * Uses differential update: only modified/new nodes are written, deleted nodes are removed
   */
  public async saveMindMap(
    circuitId: string, 
    data: MindMapData, 
    thumbnailUrl?: string | null,
    metadata: Record<string, any> = {}
  ): Promise<CircuitMindMap> {
    const dbCore = getSQLiteCore();
    const db = dbCore.getDB();

    // Check if a mindmap already exists for this circuit
    const existing = db.prepare(`
      SELECT * FROM circuit_mindmaps WHERE circuit_id = ?
    `).get(circuitId) as DbCircuitMindMap | undefined;

    const id = existing ? existing.id : uuidv4();
    const now = Date.now();
    const version = existing ? existing.version + 1 : 1;
    const isUpdate = !!existing;

    const mindmap: CircuitMindMap = {
      id,
      circuitId,
      mindmapData: data,
      thumbnailUrl: thumbnailUrl || (existing ? existing.thumbnail_url : null),
      metadata,
      createdAt: existing ? existing.created_at : now,
      updatedAt: now,
      version
    };

    // Run in a transaction to update mindmap and nodes atomically
    const transaction = db.transaction(() => {
      // 1. Insert or replace the mindmap
      db.prepare(`
        INSERT OR REPLACE INTO circuit_mindmaps 
        (id, circuit_id, mindmap_data, thumbnail_url, metadata, created_at, updated_at, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        mindmap.id,
        mindmap.circuitId,
        JSON.stringify(mindmap.mindmapData),
        mindmap.thumbnailUrl || null,
        JSON.stringify(mindmap.metadata),
        mindmap.createdAt,
        mindmap.updatedAt,
        mindmap.version
      );

      if (!data.nodes || data.nodes.length === 0) {
        // No nodes: delete all existing
        db.prepare(`DELETE FROM mindmap_nodes WHERE mindmap_id = ?`).run(mindmap.id);
        return;
      }

      if (isUpdate) {
        // ── Differential update: only write changed nodes ──
        
        // Fetch existing nodes with all columns
        const existingNodes = db.prepare(`
          SELECT * FROM mindmap_nodes WHERE mindmap_id = ?
        `).all(mindmap.id) as FullDbMindMapNode[];

        const existingMap = new Map<string, FullDbMindMapNode>();
        existingNodes.forEach(n => existingMap.set(n.id, n));

        // Build set of new node IDs
        const newNodeIds = new Set(data.nodes.map(n => n.id || ''));

        // Delete nodes that no longer exist in the new data
        const idsToDelete = existingNodes.filter(n => !newNodeIds.has(n.id)).map(n => n.id);
        if (idsToDelete.length > 0) {
          const deleteStmt = db.prepare(`DELETE FROM mindmap_nodes WHERE id = ?`);
          idsToDelete.forEach(nodeId => deleteStmt.run(nodeId));
          logger.info('MINDMAP', `🗑️ ${idsToDelete.length} nœuds supprimés (obsolètes) pour ${circuitId}`);
        }

        // Insert new nodes + update changed nodes
        const insertStmt = db.prepare(`
          INSERT OR REPLACE INTO mindmap_nodes 
          (id, mindmap_id, parent_id, type, label, description, position_x, position_y, style, kks, unit, criticality, optimal_value, formula_expression)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let insertedCount = 0;
        let updatedCount = 0;

        for (const node of data.nodes) {
          const nodeId = node.id || uuidv4();
          const existingNode = existingMap.get(nodeId);
          const newHash = this.hashNode(node);
          
          // Compute hash of existing node if present
          let existingHash = '';
          if (existingNode) {
            existingHash = this.hashNode({
              id: existingNode.id,
              parentId: existingNode.parent_id,
              type: existingNode.type as any,
              label: existingNode.label,
              description: existingNode.description,
              positionX: existingNode.position_x,
              positionY: existingNode.position_y,
              kks: existingNode.kks ?? null,
              unit: existingNode.unit ?? null,
              criticality: (existingNode.criticality as any) ?? 'low',
              optimalValue: existingNode.optimal_value ?? null,
              formulaExpression: existingNode.formula_expression ?? null,
              style: JSON.parse(existingNode.style || '{}')
            });
          }

          // Only write if node is new or has changed
          if (!existingNode || existingHash !== newHash) {
            insertStmt.run(
              nodeId,
              mindmap.id,
              node.parentId || null,
              node.type,
              node.label,
              node.description || null,
              node.positionX !== undefined && node.positionX !== null ? node.positionX : null,
              node.positionY !== undefined && node.positionY !== null ? node.positionY : null,
              JSON.stringify(node.style || {}),
              node.kks || null,
              node.unit || null,
              node.criticality || 'low',
              node.optimalValue || null,
              node.formulaExpression || null
            );
            if (existingNode) {
              updatedCount++;
            } else {
              insertedCount++;
            }
          }
        }

        if (insertedCount > 0 || updatedCount > 0 || idsToDelete.length > 0) {
          logger.info('MINDMAP', `📝 Nœuds: +${insertedCount} ajoutés, ~${updatedCount} modifiés, -${idsToDelete.length} supprimés pour ${circuitId}`);
        }
      } else {
        // ── First time creation: insert all nodes ──
        const insertStmt = db.prepare(`
          INSERT INTO mindmap_nodes 
          (id, mindmap_id, parent_id, type, label, description, position_x, position_y, style, kks, unit, criticality, optimal_value, formula_expression)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const node of data.nodes) {
          const nodeId = node.id || uuidv4();
          insertStmt.run(
            nodeId,
            mindmap.id,
            node.parentId || null,
            node.type,
            node.label,
            node.description || null,
            node.positionX !== undefined && node.positionX !== null ? node.positionX : null,
            node.positionY !== undefined && node.positionY !== null ? node.positionY : null,
            JSON.stringify(node.style || {}),
            node.kks || null,
            node.unit || null,
            node.criticality || 'low',
            node.optimalValue || null,
            node.formulaExpression || null
          );
        }
      }
    });

    try {
      transaction();
      logger.info('MINDMAP', `✅ Mind Map sauvegardé pour le circuit: ${circuitId} (version ${version}, ${data.nodes?.length || 0} nœuds)`);
      return mindmap;
    } catch (error) {
      logger.error('MINDMAP', `❌ Échec de la sauvegarde du Mind Map pour ${circuitId}`, error);
      throw error;
    }
  }

  /**
   * Retrieves the mindmap for a circuit
   * Priority: use the full JSON data from circuit_mindmaps.mindmap_data as the source of truth,
   * enriched with any additional runtime properties from mindmap_nodes table.
   */
  public getMindMapByCircuit(circuitId: string): CircuitMindMap | null {
    const dbCore = getSQLiteCore();
    const db = dbCore.getDB();

    try {
      const row = db.prepare(`
        SELECT * FROM circuit_mindmaps WHERE circuit_id = ?
      `).get(circuitId) as DbCircuitMindMap | undefined;

      if (!row) return null;

      const parsedData = JSON.parse(row.mindmap_data) as MindMapData;

      const dbNodes = db.prepare(`
        SELECT * FROM mindmap_nodes WHERE mindmap_id = ?
      `).all(row.id) as FullDbMindMapNode[];

      const dbNodeMap = new Map<string, FullDbMindMapNode>();
      dbNodes.forEach(n => dbNodeMap.set(n.id, n));

      const nodes: Omit<MindMapNode, 'mindmapId'>[] = (parsedData.nodes || []).map(jsonNode => {
        const dbNode = dbNodeMap.get(jsonNode.id);
        return {
          id: jsonNode.id,
          parentId: jsonNode.parentId ?? null,
          type: jsonNode.type,
          label: jsonNode.label,
          description: jsonNode.description ?? null,
          positionX: jsonNode.positionX ?? dbNode?.position_x ?? null,
          positionY: jsonNode.positionY ?? dbNode?.position_y ?? null,
          style: jsonNode.style || (dbNode?.style ? JSON.parse(dbNode.style) : {}),
          kks: jsonNode.kks ?? dbNode?.kks ?? null,
          unit: jsonNode.unit ?? dbNode?.unit ?? null,
          criticality: jsonNode.criticality ?? (dbNode?.criticality as any) ?? 'low',
          optimalValue: jsonNode.optimalValue ?? dbNode?.optimal_value ?? null,
          formulaExpression: jsonNode.formulaExpression ?? dbNode?.formula_expression ?? null,
        };
      });

      const mindmapData: MindMapData = {
        nodes,
        edges: parsedData.edges || [],
        rootLabel: parsedData.rootLabel || parsedData.nodes?.[0]?.label || row.circuit_id,
        layout: parsedData.layout || 'tree'
      };

      return {
        id: row.id,
        circuitId: row.circuit_id,
        mindmapData,
        thumbnailUrl: row.thumbnail_url,
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        version: row.version
      };
    } catch (error) {
      logger.error('MINDMAP', `❌ Échec de la récupération du Mind Map pour le circuit: ${circuitId}`, error);
      return null;
    }
  }

  /**
   * Deletes the mindmap for a circuit
   */
  public deleteMindMap(circuitId: string): boolean {
    const dbCore = getSQLiteCore();
    const db = dbCore.getDB();

    try {
      const row = db.prepare(`
        SELECT id FROM circuit_mindmaps WHERE circuit_id = ?
      `).get(circuitId) as { id: string } | undefined;

      if (!row) return false;

      const result = db.prepare(`
        DELETE FROM circuit_mindmaps WHERE id = ?
      `).run(row.id);

      logger.info('MINDMAP', `🗑️ Mind Map supprimé pour le circuit: ${circuitId}`);
      return result.changes > 0;
    } catch (error) {
      logger.error('MINDMAP', `❌ Échec de la suppression du Mind Map pour ${circuitId}`, error);
      return false;
    }
  }

  /**
   * Retrieves nodes of a specific type across all or single mindmap
   */
  public getNodesByType(type: string, mindmapId?: string): MindMapNode[] {
    const db = getSQLiteCore().getDB();
    try {
      let query = `SELECT * FROM mindmap_nodes WHERE type = ?`;
      const params: any[] = [type];

      if (mindmapId) {
        query += ` AND mindmap_id = ?`;
        params.push(mindmapId);
      }

      const rows = db.prepare(query).all(...params) as FullDbMindMapNode[];
      return rows.map(n => ({
        id: n.id,
        mindmapId: n.mindmap_id,
        parentId: n.parent_id,
        type: n.type as any,
        label: n.label,
        description: n.description,
        positionX: n.position_x,
        positionY: n.position_y,
        style: JSON.parse(n.style || '{}'),
        kks: n.kks ?? null,
        unit: n.unit ?? null,
        criticality: (n.criticality as any) ?? 'low',
        optimalValue: n.optimal_value ?? null,
        formulaExpression: n.formula_expression ?? null
      }));
    } catch (error) {
      logger.error('MINDMAP', `❌ Échec de getNodesByType (${type})`, error);
      return [];
    }
  }
}

export const mindMapManager = MindMapManager.getInstance();