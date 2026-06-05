import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { episodicMemory, Episode } from './episodic-memory';
import { chromaDBManager } from '../vector/chromadb-manager';

// Mock de ChromaDBManager
vi.mock('../vector/chromadb-manager', () => ({
  chromaDBManager: {
    upsertDocuments: vi.fn().mockResolvedValue(undefined),
    search: vi.fn(),
    getOrCreateCollection: vi.fn().mockResolvedValue({})
  }
}));

describe('EpisodicMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devrait sauvegarder un épisode avec le formatage correct', async () => {
    const episode: Episode = {
      timestamp: Date.now(),
      context: "Démarrage turbine TG1",
      action: { type: 'START', params: { target: 'TG1' } },
      result: { status: 'OK' },
      success: true
    };

    const id = await episodicMemory.saveEpisode(episode);
    
    expect(id).toBeDefined();
    expect(chromaDBManager.upsertDocuments).toHaveBeenCalledWith(
      'MEMOIRE_EPISODIQUE',
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('CONTEXT: Démarrage turbine TG1'),
          metadata: expect.objectContaining({ success: true })
        })
      ])
    );
  });

  it('devrait retourner des épisodes similaires lors du rappel', async () => {
    const mockResults = {
      ids: [['epi_1']],
      metadatas: [[{ timestamp: Date.now(), success: true }]],
      documents: [['CONTEXT: Situations passée\nACTION: {}\nRESULT: {}']],
      distances: [[0.1]]
    };
    
    (chromaDBManager.search as Mock).mockResolvedValue(mockResults);

    const results = await episodicMemory.recallSimilarEpisodes("Comment démarrer ?", 1);
    
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('epi_1');
    expect(results[0].success).toBe(true);
  });
});
