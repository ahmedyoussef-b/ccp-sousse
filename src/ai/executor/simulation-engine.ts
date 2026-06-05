/**
 * @fileOverview SimulationEngine - Digital Twin / Sandbox pour commandes industrielles.
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';

export interface SimulationResult {
  id: string;
  status: 'safe' | 'warning' | 'unsafe';
  predictedState: Record<string, any>;
  discrepancies: Array<{
    parameter: string;
    expected: any;
    simulated: any;
    delta: number;
  }>;
  riskScore: number;
}

export class SimulationEngine {
  /**
   * Simule l'exécution d'une action
   */
  public async simulate(action: any, params: any): Promise<SimulationResult> {
    const id = uuidv4();
    const actionType = action.type || 'unknown';
    
    // Simulate prediction (Digital Twin Logic)
    // Dans une implémentation réelle, ceci interrogerait un modèle physique ou une API de simulation
    const predictedState = { ...params.currentState || {} };
    const discrepancies: any[] = [];
    let riskScore = 0;

    // Logique de simulation simplifiée pour la démonstration
    if (actionType === 'SET_TURBINE_SPEED') {
      const currentSpeed = params.speed || 0;
      const targetSpeed = params.targetSpeed || 0;
      
      // Simulation d'une dérive physique (ex: inertie)
      if (Math.abs(targetSpeed - currentSpeed) > 1000) {
          discrepancies.push({
              parameter: 'Vibration',
              expected: 'Normal',
              simulated: 'High',
              delta: 0.8
          });
          riskScore = 0.9;
      }
    }

    if (actionType === 'MODIFY_PRESSURE_VALVE') {
        const currentPressure = params.pressure || 10;
        const adjustment = params.adjustment || 0;
        const simulatedPressure = currentPressure + adjustment;
        
        if (simulatedPressure > 50) {
            discrepancies.push({
                parameter: 'Pressure',
                expected: '< 50 bar',
                simulated: `${simulatedPressure} bar`,
                delta: (simulatedPressure - 50) / 50
            });
            riskScore = 0.95;
        }
    }

    return {
      id,
      status: riskScore > 0.8 ? 'unsafe' : riskScore > 0.4 ? 'warning' : 'safe',
      predictedState,
      discrepancies,
      riskScore
    };
  }

  /**
   * Valide si le résultat de simulation est acceptable selon les règles industrielles
   */
  public validateSimulation(result: SimulationResult): boolean {
    // Si une divergence majeure est détectée (delta > 0.05), on bloque.
    const hasMajorDiscrepancy = result.discrepancies.some(d => d.delta > 0.05);
    return !hasMajorDiscrepancy && result.status !== 'unsafe';
  }
}

export const simulationEngine = new SimulationEngine();
