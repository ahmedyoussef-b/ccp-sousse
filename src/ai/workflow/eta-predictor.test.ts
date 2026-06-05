import { describe, it, expect } from 'vitest';
import { ETAPredictor } from './eta-predictor';

describe('ETAPredictor', () => {
  it('devrait calculer un ETA basé sur le lissage exponentiel', () => {
    const predictor = new ETAPredictor();
    const label = 'Etape 1';
    
    // Premier échantillon : 1000ms
    predictor.recordStepDuration(label, 1000);
    
    const remainingSteps = [{ label: 'Etape 1' }];
    const eta1 = predictor.predictRemainingTime(remainingSteps);
    expect(eta1).toBe(1000); // Car ALPHA * 1000 + (1-ALPHA) * 1000 = 1000 au premier coup
    
    // Deuxième échantillon : 2000ms. 
    // Moyenne = 0.3 * 2000 + 0.7 * 1000 = 600 + 700 = 1300ms
    predictor.recordStepDuration(label, 2000);
    const eta2 = predictor.predictRemainingTime(remainingSteps);
    expect(eta2).toBe(1300);
  });

  it('devrait ajuster l\'ETA via le Performance Factor', () => {
    const predictor = new ETAPredictor();
    predictor.recordStepDuration('Task', 1000);
    
    // Si on est 2x plus lent actuellement
    const eta = predictor.predictRemainingTime([{ label: 'Task' }], 2.0);
    expect(eta).toBe(2000);
  });
});
