// src/ai/mindmap/mindmap-chat-enricher.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MindMapChatEnricher } from './mindmap-chat-enricher';
import { mindMapRagBridge } from './mindmap-rag-bridge';
import { getSQLiteCore } from '../core/sqlite';

// Mock getSQLiteCore and mindmap-rag-bridge
vi.mock('../core/sqlite', () => {
  const mockAll = vi.fn().mockReturnValue([
    { circuit_id: 'B1CR11' },
    { circuit_id: 'B1CR12' }
  ]);
  const mockGet = vi.fn().mockReturnValue(null);
  
  const mockPrepare = vi.fn().mockReturnValue({
    all: mockAll,
    get: mockGet
  });
  
  const mockDb = {
    prepare: mockPrepare
  };
  
  const mockSQLite = {
    getDB: vi.fn().mockReturnValue(mockDb)
  };
  
  return {
    getSQLiteCore: vi.fn().mockReturnValue(mockSQLite),
    SQLiteCore: {
      getInstance: vi.fn().mockReturnValue(mockSQLite)
    }
  };
});

vi.mock('./mindmap-rag-bridge', () => {
  return {
    mindMapRagBridge: {
      getMindMapContextForCircuit: vi.fn().mockImplementation((circuitId: string) => {
        if (circuitId === 'B1CR11') {
          return {
            markdown: '### Topology of B1CR11\n- Node A connects to Node B.',
            hasImage: false
          };
        }
        return null;
      })
    }
  };
});

describe('MindMapChatEnricher', () => {
  let enricher: MindMapChatEnricher;

  beforeEach(() => {
    vi.clearAllMocks();
    enricher = MindMapChatEnricher.getInstance();
  });

  describe('detectCircuitIds', () => {
    it('should detect circuits mentioned in query based on database records', () => {
      const query = 'Comment diagnostiquer le circuit B1CR11 ?';
      const results = enricher.detectCircuitIds(query);
      
      expect(results).toContain('B1CR11');
      expect(results).not.toContain('B1CR12');
    });

    it('should be case-insensitive when detecting circuits', () => {
      const query = 'circuit b1cr11 hs';
      const results = enricher.detectCircuitIds(query);
      
      expect(results).toContain('B1CR11');
    });

    it('should return empty list if no circuit is mentioned', () => {
      const query = 'Bonjour, quel est le planning RH ?';
      const results = enricher.detectCircuitIds(query);
      
      expect(results).toEqual([]);
    });
  });

  describe('getClientEnrichmentMetadata', () => {
    it('should return correct metadata format when circuits are detected', () => {
      const circuits = ['B1CR11'];
      const metadata = enricher.getClientEnrichmentMetadata(circuits);
      
      expect(metadata).toEqual({
        type: 'mindmap_enrichment',
        circuits: ['B1CR11'],
        hasMindmap: true,
        messageHint: '🧠 Schéma mental interactif disponible pour le(s) circuit(s) B1CR11.'
      });
    });

    it('should return null when no circuits are detected', () => {
      const metadata = enricher.getClientEnrichmentMetadata([]);
      expect(metadata).toBeNull();
    });
  });

  describe('enrichPromptContext', () => {
    it('should append mindmap markdown to existing context if circuit is matched', async () => {
      const query = 'Circuit B1CR11';
      const originalContext = 'Informations de base.';
      
      const { enrichedContext, detectedCircuits } = await enricher.enrichPromptContext(query, originalContext);
      
      expect(detectedCircuits).toContain('B1CR11');
      expect(enrichedContext).toContain('=== 🧠 COMPRÉHENSION TOPOLOGIQUE DU CIRCUIT ===');
      expect(enrichedContext).toContain('### Topology of B1CR11');
    });

    it('should return original context unmodified if no circuits are matched', async () => {
      const query = 'Aucun rapport';
      const originalContext = 'Informations de base.';
      
      const { enrichedContext, detectedCircuits } = await enricher.enrichPromptContext(query, originalContext);
      
      expect(detectedCircuits).toEqual([]);
      expect(enrichedContext).toBe(originalContext);
    });
  });
});
