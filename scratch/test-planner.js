/**
 * Script de test du Planificateur Neuro-Symbolique
 */
const { getHierarchicalPlan, formatHierarchicalPlan } = require('../src/ai/actions/hierarchical-planner');

async function testNeuroSymbolic() {
  console.log('--- TEST DU PLANIFICATEUR NEURO-SYMBOLIQUE ---');
  
  const dangerousTask = "Ouvrir la vanne de gaz HV701 pour maintenance";
  const context = "Intervention sur la conduite principale. La pression doit être vérifiée.";

  console.log(`\n\n[TEST] Tâche dangereuse : "${dangerousTask}"`);
  console.log('[TEST] Génération du plan avec validation symbolique...');

  try {
    const plan = await getHierarchicalPlan(dangerousTask, context, { maxDepth: 1 });
    const formatted = await formatHierarchicalPlan(plan);
    
    console.log('\n--- RÉSULTAT DU PLAN ---');
    console.log(formatted);
    
    if (plan.metadata && plan.metadata.warnings && plan.metadata.warnings.length > 0) {
      console.log('\n⚠️ WARNINGS RÉSISELS :');
      plan.metadata.warnings.forEach(w => console.log(`- ${w}`));
    } else {
      console.log('\n✅ AUCUNE VIOLATION LOGIQUE DÉTECTÉE (Le plan a été corrigé ou est sûr)');
    }

  } catch (error) {
    console.error('[TEST ERROR]', error);
  }
}

testNeuroSymbolic();
