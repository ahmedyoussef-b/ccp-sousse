// src/ai/mindmap/types.ts

export type MindMapNodeType = 'parameter' | 'formula' | 'dependency' | 'note';

export interface MindMapNodeStyle {
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  shape?: 'rectangle' | 'circle' | 'ellipse' | 'rhombus';
  fontSize?: number;
  fontWeight?: string;
  [key: string]: any;
}

export interface MindMapNode {
  id: string;
  mindmapId?: string;
  parentId?: string | null;
  type: MindMapNodeType;
  label: string;
  description?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  style?: MindMapNodeStyle;
  
  // 📊 Métadonnées industrielles enrichies (Phase 4)
  kks?: string | null;                                  // Code KKS (ex: 10CRF011)
  unit?: string | null;                                 // Unité physique (ex: °C, bar)
  criticality?: 'low' | 'medium' | 'high' | 'critical'; // Criticité opérationnelle
  optimalValue?: string | null;                         // Valeur nominale/optimale (ex: "1.5 - 2.0 bar")
  formulaExpression?: string | null;                    // Expression ou calcul (ex: "Q = A * V")
  customAttributes?: Record<string, any> | null;        // Autres attributs industriels personnalisés
}

export interface MindMapEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: 'dependency' | 'flow' | 'formula_input';
  style?: Record<string, any>;
}

export interface MindMapData {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  rootLabel?: string;
  layout?: 'tree' | 'radial' | 'dagre' | 'manual';
  [key: string]: any;
}

export interface CircuitMindMap {
  id: string;
  circuitId: string;
  mindmapData: MindMapData;
  thumbnailUrl?: string | null;
  metadata: Record<string, any>;
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface MindMapEmbedding {
  id: string;
  mindmapId: string;
  chunkText: string;
  embedding: number[];
  metadata: Record<string, any>;
}

// Data models as stored in SQLite
export interface DbCircuitMindMap {
  id: string;
  circuit_id: string;
  mindmap_data: string; // JSON
  thumbnail_url: string | null;
  metadata: string; // JSON
  created_at: number;
  updated_at: number;
  version: number;
}

export interface DbMindMapNode {
  id: string;
  mindmap_id: string;
  parent_id: string | null;
  type: string;
  label: string;
  description: string | null;
  position_x: number | null;
  position_y: number | null;
  style: string; // JSON
}

export interface DbMindMapEmbedding {
  id: string;
  mindmap_id: string;
  chunk_text: string;
  embedding: Buffer;
  metadata: string; // JSON
}
