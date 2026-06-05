import { describe, it, expect } from 'vitest';
import { sequenceValidator } from './sequence-validator';
import { Step } from '../actions/hierarchical-planner';
import { v4 as uuidv4 } from 'uuid';

describe('SequenceValidator', () => {
  const createStep = (desc: string): Step => ({
    id: uuidv4(),
    description: desc,
    subSteps: [],
    status: 'pending',
    type: 'atomic'
  });

  it('devrait détecter une séquence dangereuse : Purge -> Fermeture Admission', () => {
    const steps = [
      createStep('Ouverture de la purge basse'),
      createStep('Fermer admission de vapeur')
    ];

    const violations = sequenceValidator.validateSequence(steps);
    
    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain('Purge');
    expect(violations[0].severity).toBe('high');
  });

  it('devrait détecter une séquence critique : Pompe -> Fermeture Refoulement', () => {
    const steps = [
      createStep('Vérification des niveaux'),
      createStep('Demarrer pompe extraction'),
      createStep('Fermer vanne refoulement pompe')
    ];

    const violations = sequenceValidator.validateSequence(steps);
    
    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain('cavitation');
    expect(violations[0].severity).toBe('critical');
  });

  it('devrait autoriser une séquence sûre', () => {
    const steps = [
      createStep('Vérification visuelle'),
      createStep('Ouverture vanne bypass'),
      createStep('Attente équilibrage')
    ];

    const violations = sequenceValidator.validateSequence(steps);
    
    expect(violations.length).toBe(0);
  });
});
