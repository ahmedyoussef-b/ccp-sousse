// src/ai/mindmap/mindmap-circuit-binder.ts

import { getSQLiteCore } from '../core/sqlite';
import { mindMapManager } from './mindmap-manager';
import { mindMapEmbedder } from './mindmap-embedder';
import { MindMapData, MindMapNode, MindMapEdge } from './types';
import { logger } from '../core/sqlite/utils';
import { v4 as uuidv4 } from 'uuid';

export interface CircuitBindingStatus {
  id: string; // circuitId
  zoneId: string;
  name: string;
  description: string | null;
  hasMindmap: boolean;
  mindmapId: string | null;
  mindmapVersion: number | null;
  nodesCount: number;
  updatedAt: number | null;
}

export class MindMapCircuitBinder {
  private static instance: MindMapCircuitBinder;

  private constructor() {}

  public static getInstance(): MindMapCircuitBinder {
    if (!MindMapCircuitBinder.instance) {
      MindMapCircuitBinder.instance = new MindMapCircuitBinder();
    }
    return MindMapCircuitBinder.instance;
  }

  /**
   * Lists all circuits and their corresponding mind map binding status
   */
  public listCircuitsBindingStatus(zoneId?: string): CircuitBindingStatus[] {
    const db = getSQLiteCore().getDB();
    try {
      let sql = `
        SELECT 
          c.id, 
          c.zoneId, 
          c.name, 
          c.description,
          m.id as mindmapId,
          m.version as mindmapVersion,
          m.updated_at as mindmapUpdatedAt,
          (SELECT COUNT(*) FROM mindmap_nodes WHERE mindmap_id = m.id) as nodesCount
        FROM ref_circuits c
        LEFT JOIN circuit_mindmaps m ON m.circuit_id = c.id
      `;
      const params: any[] = [];

      if (zoneId) {
        sql += ` WHERE c.zoneId = ?`;
        params.push(zoneId);
      }

      sql += ` ORDER BY c.id ASC`;

      const rows = db.prepare(sql).all(...params) as any[];

      return rows.map(r => ({
        id: r.id,
        zoneId: r.zoneId,
        name: r.name,
        description: r.description,
        hasMindmap: !!r.mindmapId,
        mindmapId: r.mindmapId || null,
        mindmapVersion: r.mindmapVersion || null,
        nodesCount: r.nodesCount || 0,
        updatedAt: r.mindmapUpdatedAt || null
      }));
    } catch (error) {
      logger.error('MINDMAP-BINDER', 'Error listing circuits binding status', error);
      return [];
    }
  }

  /**
   * Auto-generates a starter mind map skeleton for a circuit using its ref_parametres database records.
   */
  public async autoGenerateFromParameters(circuitId: string): Promise<any> {
    const db = getSQLiteCore().getDB();
    const startTime = Date.now();

    try {
      // 1. Fetch circuit info
      const circuit = db.prepare('SELECT * FROM ref_circuits WHERE id = ?').get(circuitId) as any;
      if (!circuit) {
        throw new Error(`Circuit ${circuitId} non trouvé dans ref_circuits.`);
      }

      // 2. Fetch parameters for this circuit
      const dbParams = db.prepare('SELECT * FROM ref_parametres WHERE circuitId = ?').all(circuitId) as any[];

      logger.info('MINDMAP-BINDER', `Génération automatique d'un Mind Map pour ${circuitId} (${dbParams.length} paramètres trouvés)`);

      const rootNodeId = `root_${uuidv4().substring(0, 8)}`;
      const nodes: Omit<MindMapNode, 'mindmapId'>[] = [
        {
          id: rootNodeId,
          parentId: null,
          type: 'dependency',
          label: circuit.name || circuitId,
          description: circuit.description || `Circuit principal ${circuitId}`,
          positionX: 100,
          positionY: 300,
          style: {
            color: '#ffffff',
            backgroundColor: '#ea580c',
            borderColor: '#f97316',
            shape: 'rectangle',
            fontWeight: 'bold'
          }
        }
      ];

      const edges: MindMapEdge[] = [];

      // Lay out parameters vertically in a right-hand branch
      const startX = 340;
      const spacingY = 100;
      const totalHeight = (dbParams.length - 1) * spacingY;
      const startY = 300 - totalHeight / 2;

      dbParams.forEach((param, index) => {
        const paramNodeId = `p_${uuidv4().substring(0, 8)}`;
        const label = param.name + (param.unit ? ` (${param.unit})` : '');
        
        nodes.push({
          id: paramNodeId,
          parentId: rootNodeId,
          type: 'parameter',
          label,
          description: param.description || `Paramètre de type ${param.dataType}`,
          positionX: startX,
          positionY: startY + index * spacingY,
          style: {
            color: '#ffffff',
            backgroundColor: '#0284c7',
            borderColor: '#38bdf8',
            shape: 'ellipse'
          }
        });

        edges.push({
          id: `e_${rootNodeId}_${paramNodeId}`,
          source: rootNodeId,
          target: paramNodeId,
          type: 'flow'
        });
      });

      // Add a default formula node and a note node for illustrative purposes if no parameters exist
      if (dbParams.length === 0) {
        const docNodeId = `doc_${uuidv4().substring(0, 8)}`;
        nodes.push({
          id: docNodeId,
          parentId: rootNodeId,
          type: 'note',
          label: 'Documentation Technique',
          description: 'Consignes de maintenance et seuils nominaux à documenter.',
          positionX: startX,
          positionY: 300,
          style: {
            color: '#0f172a',
            backgroundColor: '#f1f5f9',
            borderColor: '#cbd5e1',
            shape: 'rectangle'
          }
        });

        edges.push({
          id: `e_${rootNodeId}_${docNodeId}`,
          source: rootNodeId,
          target: docNodeId,
          type: 'flow'
        });
      }

      const mindmapData: MindMapData = {
        nodes,
        edges,
        rootLabel: circuit.name || circuitId,
        layout: 'tree'
      };

      // 3. Save the mindmap to the database
      const mindmap = await mindMapManager.saveMindMap(
        circuitId,
        mindmapData,
        null,
        {
          autoGenerated: true,
          generatedAt: Date.now(),
          parametersCount: dbParams.length
        }
      );

      // 4. Vectorize for ChromaDB search
      await mindMapEmbedder.vectorizeMindMap(mindmap);

      logger.info('MINDMAP-BINDER', `✅ Mind Map auto-généré avec succès pour le circuit: ${circuitId} en ${Date.now() - startTime}ms`);
      return mindmap;
    } catch (error) {
      logger.error('MINDMAP-BINDER', `❌ Échec de la génération automatique pour ${circuitId}`, error);
      throw error;
    }
  }
}

export const mindMapCircuitBinder = MindMapCircuitBinder.getInstance();
