import { describe, it, expect, beforeEach } from 'vitest';
import { SymbolicValidator } from './symbolic-validator';
import { Step } from '../actions/hierarchical-planner';
import { v4 as uuidv4 } from 'uuid';

describe('SymbolicValidator', () => {
  let validator: SymbolicValidator;

  beforeEach(() => {
    // Initialise avec les règles par défaut
    validator = new SymbolicValidator();
  });

  it('devrait détecter une violation si une vanne est ouverte sans préparation', async () => {
    const steps: Step[] = [
      {
        id: uuidv4(),
        description: "Ouvrir la vanne HV701",
        subSteps: [],
        status: 'pending',
        type: 'atomic'
      }
    ];

    const violations = await validator.validatePlan(steps);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].ruleId).toBe('RULE_VALVE_PRESSURE');
  });

  it('devrait valider un plan si la préparation est présente', async () => {
    const steps: Step[] = [
      {
        id: uuidv4(),
        description: "Vérifier la pression et installer la consignation",
        subSteps: [],
        status: 'pending',
        type: 'atomic'
      },
      {
        id: uuidv4(),
        description: "Ouvrir la vanne HV701",
        subSteps: [],
        status: 'pending',
        type: 'atomic'
      }
    ];

    const violations = await validator.validatePlan(steps);
    expect(violations.length).toBe(0);
  });

  it('devrait détecter une violation de la norme API 670', async () => {
    const steps: Step[] = [
      {
        id: uuidv4(),
        description: "Démarrer la turbine à vapeur",
        subSteps: [],
        status: 'pending',
        type: 'atomic'
      }
    ];

    const violations = await validator.validatePlan(steps);
    expect(violations.some(v => v.ruleId === 'RULE_API670_STARTUP')).toBe(true);
  });
});
