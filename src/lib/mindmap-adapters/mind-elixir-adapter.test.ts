import { describe, it, expect } from 'vitest';
import { toMindElixir, fromMindElixir, roundTrip } from './mind-elixir-adapter';
import type { MindMapData } from '@/ai/mindmap/types';

describe('MindElixirAdapter', () => {
  it('preserves all metadata on round-trip (kks, criticality, customAttributes)', () => {
    const data: MindMapData = {
      rootLabel: 'Test Root',
      layout: 'tree',
      nodes: [
        {
          id: 'root',
          parentId: null,
          type: 'dependency',
          label: 'Root Node',
          positionX: 100,
          positionY: 200,
        },
        {
          id: 'n1',
          parentId: 'root',
          type: 'parameter',
          label: 'Param Node',
          kks: 'KKS-123',
          unit: 'Bar',
          criticality: 'high',
          customAttributes: { test: true },
          positionX: 300,
          positionY: 400,
          style: { color: '#fff', backgroundColor: '#000' }
        }
      ],
      edges: [
        { id: 'e1', source: 'root', target: 'n1', type: 'flow' }
      ]
    };

    const rt = roundTrip(data);
    
    // Structure checks
    expect(rt.nodes.length).toBe(2);
    expect(rt.edges.length).toBe(1);
    
    // Metadata preservation checks
    const n1 = rt.nodes.find(n => n.id === 'n1');
    expect(n1?.kks).toBe('KKS-123');
    expect(n1?.unit).toBe('Bar');
    expect(n1?.criticality).toBe('high');
    expect(n1?.customAttributes).toEqual({ test: true });
    expect(n1?.positionX).toBe(300);
    expect(n1?.positionY).toBe(400);
    expect(n1?.style?.backgroundColor).toBe('#000');
  });

  it('handles orphaned nodes gracefully by attaching to root', () => {
    const data: MindMapData = {
      rootLabel: 'Fallback',
      layout: 'tree',
      nodes: [
        { id: 'r1', parentId: null, type: 'note', label: 'Root 1' },
        { id: 'n1', parentId: 'non-existent', type: 'note', label: 'Orphan' }
      ],
      edges: []
    };

    const meTree = toMindElixir(data);
    expect(meTree.nodeData.topic).toBe('Root 1');
    expect(meTree.nodeData.children?.[0].topic).toBe('Orphan');
    
    const rt = fromMindElixir(meTree);
    const orphanNode = rt.nodes.find(n => n.id === 'n1');
    expect(orphanNode?.parentId).toBe('r1');
  });
});
