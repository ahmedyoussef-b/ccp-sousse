/**
 * @fileOverview simulate-monitor.ts - Script de test pour la console d'activité.
 * Lance une série d'événements fictifs pour valider le flux SSE et l'UI.
 */

import { aiEventBus } from '../src/ai/actions/event-bus';
import { v4 as uuidv4 } from 'uuid';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSimulation() {
  console.log('🚀 Démarrage de la simulation d\'activité IA...');
  const planId = uuidv4();

  // 1. Planner Start
  aiEventBus.emitAction({
    id: planId,
    module: 'Planner',
    type: 'PLANNING_START',
    status: 'start',
    message: 'Analyse de la requête : "Optimiser la turbine CCP-02"',
    timestamp: Date.now()
  });
  await delay(1500);

  // 2. Validator Warning
  aiEventBus.emitAction({
    id: uuidv4(),
    module: 'Validator',
    type: 'SAFETY_CHECK',
    status: 'progress',
    message: 'Vérification des contraintes thermiques...',
    timestamp: Date.now()
  });
  await delay(1000);

  // 3. Blockage Event
  aiEventBus.emitAction({
    id: uuidv4(),
    module: 'Validator',
    type: 'ACTION_BLOCKED',
    status: 'blocked',
    message: 'ALERTE : Séquence de purge manquante dans le plan !',
    timestamp: Date.now(),
    data: { severity: 'high', constraint: 'HAZOP-04' }
  });
  await delay(2000);

  // 4. Planner Adjustment
  aiEventBus.emitAction({
    id: planId,
    module: 'Planner',
    type: 'PLAN_REVISION',
    status: 'progress',
    message: 'Révision du plan avec étapes de sécurité supplémentaires...',
    timestamp: Date.now()
  });
  await delay(1500);

  // 5. Executor Snapshot
  const actionId = uuidv4();
  aiEventBus.emitAction({
    id: actionId,
    module: 'Executor',
    type: 'SNAPSHOT_CREATED',
    status: 'snapshot',
    message: 'Point de restauration système créé (ID: snp_442a)',
    timestamp: Date.now()
  });
  await delay(800);

  // 6. Success
  aiEventBus.emitAction({
    id: actionId,
    module: 'Executor',
    type: 'EXECUTION_COMPLETE',
    status: 'complete',
    message: 'Action "Injection de vapeur" terminée avec succès.',
    timestamp: Date.now(),
    duration: 5400
  });

  // 7. Health Alert
  aiEventBus.emitAction({
    id: uuidv4(),
    module: 'Predictive',
    type: 'HEALTH_ALERT',
    status: 'prediction',
    message: 'Attention : Légère hausse de latence Ollama (Z-Score: 2.1)',
    timestamp: Date.now()
  });

  console.log('✅ Simulation terminée. Vérifiez l\'interface.');
}

// Exécution si lancé directement
if (require.main === module) {
  runSimulation().catch(console.error);
}

export { runSimulation };
