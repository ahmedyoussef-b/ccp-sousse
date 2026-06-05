import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReversibleExecutor } from '../actions/reversible-executor';
import { simulationEngine } from './simulation-engine';
import { riskAssessor } from './risk-assessor';

describe('ReversibleExecutor Simulation Mode', () => {
  let executor: ReversibleExecutor;

  beforeEach(() => {
    executor = new ReversibleExecutor();
    vi.clearAllMocks();
  });

  it('devrait bloquer une exécution réelle si la simulation échoue (Risque élevé)', async () => {
    // 1. Mocker le risk assessor pour forcer un risque élevé (> 0.8)
    vi.spyOn(riskAssessor, 'evaluate').mockReturnValue({
        score: 0.95,
        recommendSnapshot: true,
        criticalFactors: ['HIGH_RELIABILITY_REQUIRED']
    } as any);

    // 2. Mocker la simulation pour qu'elle échoue
    vi.spyOn(simulationEngine, 'simulate').mockResolvedValue({
        id: 'sim_fail',
        status: 'unsafe',
        predictedState: {},
        discrepancies: [{ parameter: 'Vibration', expected: 'Normal', simulated: 'High', delta: 0.9 }],
        riskScore: 0.95
    });

    const action = { type: 'SET_TURBINE_SPEED', execute: vi.fn() };
    const params = { targetSpeed: 5000 };

    const result = await executor.execute(action, params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Simulation non validée');
    expect(action.execute).not.toHaveBeenCalled(); // L'action réelle n'a jamais été appelée !
  });

  it('devrait autoriser l\'exécution réelle si la simulation réussit', async () => {
    vi.spyOn(riskAssessor, 'evaluate').mockReturnValue({ score: 0.9 } as any);
    vi.spyOn(simulationEngine, 'simulate').mockResolvedValue({
        id: 'sim_ok',
        status: 'safe',
        predictedState: {},
        discrepancies: [],
        riskScore: 0.1
    });

    const action = { type: 'SET_TURBINE_SPEED', execute: vi.fn().mockResolvedValue('DONE') };
    const params = { targetSpeed: 100 };

    const result = await executor.execute(action, params);

    expect(result.success).toBe(true);
    expect(action.execute).toHaveBeenCalled();
  });
});
