import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReversibleExecutor } from './reversible-executor';
import { modelManager, MemoryLevel } from '../resilience/model-manager';

// Mocks
vi.mock('../resilience/model-manager', () => ({
  modelManager: {
    getMemoryLevel: vi.fn()
  },
  MemoryLevel: {
      NORMAL: 'NORMAL',
      SURVIVAL: 'SURVIVAL'
  }
}));

describe('ReversibleExecutor (Adaptatif)', () => {
  let executor: ReversibleExecutor;

  beforeEach(() => {
    executor = new ReversibleExecutor();
    vi.clearAllMocks();
  });

  it('devrait créer un snapshot pour une action à HAUT RISQUE', async () => {
    (modelManager.getMemoryLevel as any).mockReturnValue(MemoryLevel.NORMAL);
    
    // Action critique (mot-clé "ouverture vanne") via objet compatible
    const action = { 
        type: 'VALVE_OPEN', 
        description: 'Ouverture vanne HP',
        execute: async () => ({ ok: true }) 
    };
    const result = await executor.execute(action, {}, { snapshot: true });
    
    expect(result.snapshotId).toBeDefined();
  });

  it('devrait SAUTER le snapshot pour une action à FAIBLE RISQUE', async () => {
    (modelManager.getMemoryLevel as any).mockReturnValue(MemoryLevel.NORMAL);
    
    // Action inoffensive via objet compatible
    const action = { 
        type: 'CHECK', 
        description: 'Vérification visuelle',
        execute: async () => ({ ok: true }) 
    };
    const result = await executor.execute(action, {}, { snapshot: true });
    
    expect(result.snapshotId).toBeUndefined();
    
    const stats = executor.getStats();
    expect((stats as any).optimization.savedSnapshots).toBe(1);
  });

  it('devrait SAUTER le snapshot en mode SURVIVAL même pour risque élevé (sauf critique)', async () => {
    (modelManager.getMemoryLevel as any).mockReturnValue(MemoryLevel.SURVIVAL);
    
    // Risque élevé mais pas critique
    const result = await executor.execute(async () => ({ ok: true }), { type: 'START', description: 'Démarrage pompe' }, { snapshot: true });
    
    expect(result.snapshotId).toBeUndefined();
  });
});
