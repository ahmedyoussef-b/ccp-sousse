// src/ai/mindmap/mindmap-embedder.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mindMapEmbedder } from './mindmap-embedder';
import { embeddingService } from '../vector/embeddings';
import { chromaDBManager } from '../vector/chromadb-manager';
import { getSQLiteCore } from '../core/sqlite';

// Mock dependencies
vi.mock('../vector/embeddings', () => {
  return {
    embeddingService: {
      batchEmbed: vi.fn().mockResolvedValue([[0.1, 0.2], [0.3, 0.4]])
    }
  };
});

vi.mock('../vector/chromadb-manager', () => {
  return {
    chromaDBManager: {
      deleteDocuments: vi.fn(),
      upsertDocuments: vi.fn()
    }
  };
});

vi.mock('../core/sqlite', () => {
  const mockAll = vi.fn().mockReturnValue([{ id: 'old_1' }]);
  const mockRun = vi.fn();
  
  const mockPrepare = vi.fn().mockReturnValue({
    all: mockAll,
    run: mockRun
  });
  
  const mockTransaction = vi.fn().mockImplementation((cb) => {
    return cb;
  });
  
  const mockDb = {
    prepare: mockPrepare,
    transaction: mockTransaction
  };
  
  const mockSQLite = {
    getDB: vi.fn().mockReturnValue(mockDb)
  };
  
  return {
    getSQLiteCore: vi.fn().mockReturnValue(mockSQLite)
  };
});

describe('MindMapEmbedder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Buffer Conversions', () => {
    it('should convert embedding array to buffer and back', () => {
      const embedding = [1.5, -2.3, 0.0, 4.7];
      const buffer = mindMapEmbedder.embeddingToBuffer(embedding);
      
      expect(buffer).toBeInstanceOf(Buffer);
      
      const restored = mindMapEmbedder.bufferToEmbedding(buffer);
      // SQLite binary floats might have slight precision limits but float32 matches
      expect(restored[0]).toBeCloseTo(1.5, 5);
      expect(restored[1]).toBeCloseTo(-2.3, 5);
      expect(restored[2]).toBeCloseTo(0.0, 5);
      expect(restored[3]).toBeCloseTo(4.7, 5);
    });
  });

  describe('generateNodeChunks', () => {
    it('should generate rich textual chunks with structural context', () => {
      const mockMindMap: any = {
        id: 'mm_123',
        circuitId: 'B1CR11',
        mindmapData: {
          nodes: [
            { id: '1', parentId: null, type: 'note', label: 'Echangeur Principal', description: 'Thermal loop exchanger' },
            { id: '2', parentId: '1', type: 'parameter', label: 'TE101', description: 'Input temperature' }
          ]
        }
      };

      const chunks = mindMapEmbedder.generateNodeChunks(mockMindMap);
      
      expect(chunks).toHaveLength(2);
      
      // Node 1 checks
      expect(chunks[0].id).toBe('mm_chunk_mm_123_1');
      expect(chunks[0].text).toContain('Circuit Industriel: B1CR11');
      expect(chunks[0].text).toContain('Nœud de Schéma Mental: "Echangeur Principal"');
      expect(chunks[0].text).toContain('dépend de aucun');
      expect(chunks[0].text).toContain('Éléments dépendants (enfants): "TE101" (parameter)');
      
      // Node 2 checks
      expect(chunks[1].id).toBe('mm_chunk_mm_123_2');
      expect(chunks[1].text).toContain('dépend de "Echangeur Principal" (note)');
      expect(chunks[1].metadata.parentId).toBe('1');
    });
  });

  describe('vectorizeMindMap', () => {
    it('should batch embed texts and save to SQLite and ChromaDB', async () => {
      const mockMindMap: any = {
        id: 'mm_123',
        circuitId: 'B1CR11',
        mindmapData: {
          nodes: [
            { id: '1', parentId: null, type: 'note', label: 'Echangeur Principal' },
            { id: '2', parentId: '1', type: 'parameter', label: 'TE101' }
          ]
        }
      };

      await mindMapEmbedder.vectorizeMindMap(mockMindMap);
      
      // Check batch embedding generation
      expect(embeddingService.batchEmbed).toHaveBeenCalled();
      
      // Check delete documents in ChromaDB was called for old items
      expect(chromaDBManager.deleteDocuments).toHaveBeenCalledWith('MINDMAP', ['old_1']);
      
      // Check ChromaDB sync upsert was called
      expect(chromaDBManager.upsertDocuments).toHaveBeenCalledWith('MINDMAP', expect.any(Array));
    });
  });
});
