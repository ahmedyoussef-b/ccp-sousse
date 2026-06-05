import { describe, it, expect } from 'vitest';
import { Plan } from './hierarchical-planner';
import { sequenceValidator } from '../validation/sequence-validator';

describe('HierarchicalPlanner (Sequence Integration)', () => {
  it('devrait identifier une violation de séquence dans un plan complexe', async () => {
    // Création d'un plan contenant une séquence interdite selon HAZOP (Pompe -> Fermeture Refoulement)
    const dangerousPlan: Plan = {
        task: "Démarrage pompe extraction",
        steps: [
            { id: '1', description: 'Demarrer pompe extraction', subSteps: [], status: 'pending', type: 'atomic' },
            { id: '2', description: 'Fermer vanne refoulement pompe', subSteps: [], status: 'pending', type: 'atomic' }
        ]
    };

    const violations = sequenceValidator.validateSequence(dangerousPlan.steps);
    
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].message).toContain('cavitation');
  });
});
