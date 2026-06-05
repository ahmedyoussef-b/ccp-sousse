// src/lib/mindmap-adapters/mind-elixir-adapter.ts
//
// Bidirectional adapter: MindMapData (flat list) <-> mind-elixir NodeObj (tree)
// Preserves ALL business metadata: kks, unit, criticality, formulaExpression,
// customAttributes, positionX, positionY, style — nothing is lost.
//
// This module has NO side-effects and is safe to import in any environment.

import type { MindMapData, MindMapNode, MindMapEdge, MindMapNodeType } from '@/ai/mindmap/types';

// ─── Mind-Elixir compatible types (avoid runtime import issues in SSR) ─────────

export interface MindElixirNodeObj {
  id: string;
  topic: string;
  root?: boolean;
  children?: MindElixirNodeObj[];
  // Extended metadata stored as JSON in `note` field
  note?: string;
  // Visual
  style?: {
    color?: string;
    background?: string;
    border?: string;
    fontSize?: string;
    fontWeight?: string;
  };
}

export interface MindElixirData {
  nodeData: MindElixirNodeObj;
  linkData?: Record<string, unknown>;
  direction?: number; // 0 = left, 1 = right, 2 = both
}

// ─── Internal metadata envelope (serialised into node.note) ───────────────────

interface NodeMeta {
  type: MindMapNodeType;
  description?: string | null;
  kks?: string | null;
  unit?: string | null;
  criticality?: 'low' | 'medium' | 'high' | 'critical';
  optimalValue?: string | null;
  formulaExpression?: string | null;
  customAttributes?: Record<string, unknown> | null;
  positionX?: number | null;
  positionY?: number | null;
  mindmapId?: string;
  originalStyle?: Record<string, unknown>;
}

// ─── toMindElixir ─────────────────────────────────────────────────────────────

/**
 * Converts our internal MindMapData (flat nodes + edges list) into a
 * mind-elixir compatible NodeObj tree.
 *
 * Algorithm:
 * 1. Find the root node (parentId == null or the node referenced by no edge target)
 * 2. Build a recursive tree using parentId references
 * 3. Orphaned nodes (broken parentId) are attached to root as children
 */
export function toMindElixir(data: MindMapData): MindElixirData {
  if (!data.nodes || data.nodes.length === 0) {
    return {
      nodeData: {
        id: 'root',
        topic: data.rootLabel || 'Mind Map',
        root: true,
        children: [],
      },
    };
  }

  // Pre-process: infer parentId from edges if missing (backward compatibility)
  if (data.edges && data.edges.length > 0) {
    data.nodes.forEach(n => {
      if (!n.parentId) {
        const edge = data.edges.find(e => e.target === n.id);
        if (edge) {
          n.parentId = edge.source;
        }
      }
    });
  }

  // Find root(s) — nodes with no parentId or parentId not pointing to any existing node
  const nodeIds = new Set(data.nodes.map((n) => n.id));
  const roots = data.nodes.filter((n) => !n.parentId || !nodeIds.has(n.parentId));

  // Use the first root; if multiple roots exist (disconnected graph), wrap them under a synthetic root
  let primaryRoot: MindMapNode;
  let extraRoots: MindMapNode[] = [];

  if (roots.length === 0) {
    // Fallback: pick the first node
    primaryRoot = data.nodes[0];
    extraRoots = [];
  } else if (roots.length === 1) {
    primaryRoot = roots[0];
  } else {
    // Multiple disconnected sub-trees — pick the one with the most children
    const childCount = new Map<string, number>();
    data.nodes.forEach((n) => {
      if (n.parentId) {
        childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
      }
    });
    roots.sort((a, b) => (childCount.get(b.id) ?? 0) - (childCount.get(a.id) ?? 0));
    primaryRoot = roots[0];
    extraRoots = roots.slice(1);
  }

  // Build adjacency: parentId -> children
  const childrenMap = new Map<string, MindMapNode[]>();
  data.nodes.forEach((n) => {
    const pid = n.parentId ?? '__root__';
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(n);
  });

  function buildNode(node: MindMapNode): MindElixirNodeObj {
    const meta: NodeMeta = {
      type: node.type,
      description: node.description,
      kks: node.kks,
      unit: node.unit,
      criticality: node.criticality,
      optimalValue: node.optimalValue,
      formulaExpression: node.formulaExpression,
      customAttributes: node.customAttributes,
      positionX: node.positionX,
      positionY: node.positionY,
      mindmapId: node.mindmapId,
      originalStyle: node.style as Record<string, unknown>,
    };

    const meNode: MindElixirNodeObj = {
      id: node.id,
      topic: node.label,
      note: JSON.stringify(meta),
      children: (childrenMap.get(node.id) ?? []).map(buildNode),
    };

    // Map our style to mind-elixir style
    if (node.style) {
      meNode.style = {
        color: node.style.color,
        background: node.style.backgroundColor,
        border: node.style.borderColor ? `1px solid ${node.style.borderColor}` : undefined,
        fontSize: node.style.fontSize ? `${node.style.fontSize}px` : undefined,
        fontWeight: node.style.fontWeight,
      };
    }

    return meNode;
  }

  const rootNode = buildNode(primaryRoot);
  rootNode.root = true;

  // Attach extra disconnected roots as children of primary root (graceful handling)
  if (extraRoots.length > 0) {
    if (!rootNode.children) rootNode.children = [];
    extraRoots.forEach((er) => {
      rootNode.children!.push(buildNode(er));
    });
  }

  return { nodeData: rootNode };
}

// ─── fromMindElixir ───────────────────────────────────────────────────────────

/**
 * Converts a mind-elixir NodeObj tree back into our internal MindMapData.
 * Restores all business metadata from the serialised `note` field.
 */
export function fromMindElixir(
  meData: MindElixirData,
  originalRootLabel?: string
): MindMapData {
  const nodes: MindMapNode[] = [];
  const edges: MindMapEdge[] = [];

  function walkNode(meNode: MindElixirNodeObj, parentId: string | null) {
    // Parse metadata from note field
    let meta: NodeMeta = { type: 'dependency' };
    if (meNode.note) {
      try {
        meta = JSON.parse(meNode.note) as NodeMeta;
      } catch {
        // note field may contain plain text (user typed it) — treat gracefully
        meta = { type: 'dependency', description: meNode.note };
      }
    }

    const node: MindMapNode = {
      id: meNode.id,
      mindmapId: meta.mindmapId,
      parentId: parentId ?? null,
      type: meta.type || 'dependency',
      label: meNode.topic,
      description: meta.description ?? null,
      positionX: meta.positionX ?? null,
      positionY: meta.positionY ?? null,
      kks: meta.kks ?? null,
      unit: meta.unit ?? null,
      criticality: meta.criticality,
      optimalValue: meta.optimalValue ?? null,
      formulaExpression: meta.formulaExpression ?? null,
      customAttributes: meta.customAttributes ?? null,
      style: meta.originalStyle as MindMapNode['style'] ?? {
        color: meNode.style?.color,
        backgroundColor: meNode.style?.background,
        borderColor: meNode.style?.border?.match(/#[\da-fA-F]+/)?.[0],
      },
    };

    nodes.push(node);

    if (parentId) {
      edges.push({
        id: `e_${parentId}_${meNode.id}`,
        source: parentId,
        target: meNode.id,
        type: 'flow',
      });
    }

    (meNode.children ?? []).forEach((child) => walkNode(child, meNode.id));
  }

  walkNode(meData.nodeData, null);

  return {
    nodes,
    edges,
    rootLabel: originalRootLabel ?? meData.nodeData.topic,
    layout: 'tree',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Round-trip test helper: converts to mind-elixir and back.
 * Useful in tests to verify no data is lost.
 */
export function roundTrip(data: MindMapData): MindMapData {
  return fromMindElixir(toMindElixir(data), data.rootLabel);
}
