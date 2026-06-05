// src/ai/mindmap/mindmap-rag-bridge.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mindMapRagBridge } from './mindmap-rag-bridge';
import { mindMapManager } from './mindmap-manager';
import { chromaDBManager } from '../vector/chromadb-manager';
import { embeddingService } from '../vector/embeddings';
import { getSQLiteCore } from '../core/sqlite';

// Mock dependecies
vi.mock('./mindmap-manager', () => {
  return {
    mindMapManager: {
      getMindMapByCircuit: vi.fn()
    }
  };
});

vi.mock('../vector/chromadb-manager', () => {
  return {
    chromaDBManager: {
      search: vi.fn()
    }
  };
});

vi.mock('../vector/embeddings', () => {
  return {
    embeddingService: {
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    }
  };
});

vi.mock('../core/sqlite', () => {
  const mockAll = vi.fn().mockReturnValue([{ circuit_id: 'B1CR11' }]);
  const mockPrepare = vi.fn().mockReturnValue({
    all: mockAll
  });
  const mockDb = {
    prepare: mockPrepare
  };
  const mockSQLite = {
    getDB: vi.fn().mockReturnValue(mockDb)
  };
  return {
    getSQLiteCore: vi.fn().mockReturnValue(mockSQLite)
  };
});

describe('MindMapRagBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMindMapContextForCircuit', () => {
    it('should generate Markdown context representing the mindmap structure', () => {
      const mockMindMapData: any = {
        nodes: [
          { id: '1', parentId: null, type: 'note', label: 'Echangeur Principal', description: 'Unité thermique' },
          { id: '2', parentId: '1', type: 'parameter', label: 'TE101', description: 'Température entrée' },
          { id: '3', parentId: '1', type: 'formula', label: 'DeltaT = TE102 - TE101' }
        ],
        edges: [],
        rootLabel: 'Thermal Loop',
        layout: 'tree'
      };

      vi.mocked(mindMapManager.getMindMapByCircuit).mockReturnValue({
        id: 'mm_1',
        circuitId: 'B1CR11',
        mindmapData: mockMindMapData,
        thumbnailUrl: null,
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1
      });

      const result = mindMapRagBridge.getMindMapContextForCircuit('B1CR11');
      
      expect(result).not.toBeNull();
      expect(result?.circuitId).toBe('B1CR11');
      expect(result?.nodesCount).toBe(3);
      
      // Verify markdown content
      expect(result?.markdown).toContain('### 🧠 SCHÉMA MENTAL INTERACTIF (MIND MAP) - CIRCUIT [B1CR11]');
      expect(result?.markdown).toContain('Hiérarchie Structurelle des Dépendances');
      expect(result?.markdown).toContain('TE101');
      expect(result?.markdown).toContain('DeltaT');
    });

    it('should return null if mindmap does not exist', () => {
      vi.mocked(mindMapManager.getMindMapByCircuit).mockReturnValue(null);
      
      const result = mindMapRagBridge.getMindMapContextForCircuit('UNKNOWN');
      expect(result).toBeNull();
    });
  });

  describe('searchMindMapNodes', () => {
    it('should query ChromaDB and fetch circuit contexts', async () => {
      vi.mocked(chromaDBManager.search).mockResolvedValue({
        metadatas: [{ circuitId: 'B1CR11' }],
        distances: [[0.15]]
      });

      // Mock getMindMapContextForCircuit
      const spyContext = vi.spyOn(mindMapRagBridge, 'getMindMapContextForCircuit').mockReturnValue({
        markdown: 'Mock context',
        circuitId: 'B1CR11',
        nodesCount: 3,
        matchedNodes: []
      });

      const results = await mindMapRagBridge.searchMindMapNodes('TE101', 5);
      
      expect(chromaDBManager.search).toHaveBeenCalledWith('MINDMAP', 'TE101', expect.any(Object));
      expect(results).toHaveLength(1);
      expect(results[0].circuitId).toBe('B1CR11');
      expect(spyContext).toHaveBeenCalledWith('B1CR11');
    });

    it('should fallback to SQLite when ChromaDB search fails', async () => {
      vi.mocked(chromaDBManager.search).mockRejectedValue(new Error('ChromaDB Offline'));

      const spyContext = vi.spyOn(mindMapRagBridge, 'getMindMapContextForCircuit').mockReturnValue({
        markdown: 'Mock SQL context',
        circuitId: 'B1CR11',
        nodesCount: 1,
        matchedNodes: []
      });

      const results = await mindMapRagBridge.searchMindMapNodes('TE101', 5);
      
      expect(results).toHaveLength(1);
      expect(results[0].circuitId).toBe('B1CR11');
      expect(spyContext).toHaveBeenCalledWith('B1CR11');
    });
  });
});
