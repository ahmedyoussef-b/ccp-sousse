// src/lib/mindmap-adapters/simple-mindmap-exporter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { exportToPDF, exportToSVGRich } from './simple-mindmap-exporter';
import type { MindMapData } from '@/ai/mindmap/types';

// Mock simple-mind-map module to avoid DOM dependencies in Node.js test environment
vi.mock('simple-mind-map', () => {
  return {
    default: class MockMindMap {
      static usePlugin = vi.fn();
      doExport = {
        pdf: vi.fn().mockResolvedValue('data:application/pdf;base64,VEVTVA=='),
        svg: vi.fn().mockResolvedValue('<svg>test</svg>'),
        xmind: vi.fn().mockResolvedValue('data:application/vnd.xmind;base64,UEsDBA==')
      };
      destroy = vi.fn();
      constructor() {}
    }
  };
});
vi.mock('simple-mind-map/src/plugins/Export.js', () => ({ default: {} }));

describe('SimpleMindMapExporter', () => {
  const data: MindMapData = {
    rootLabel: 'Test',
    layout: 'tree',
    nodes: [{ id: '1', parentId: null, type: 'note', label: 'Root' }],
    edges: []
  };

  it('exports PDF as a Blob', async () => {
    const blob = await exportToPDF(data);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
  });

  it('exports SVG string', async () => {
    const svg = await exportToSVGRich(data);
    expect(typeof svg).toBe('string');
    expect(svg).toContain('<svg');
  });
});
