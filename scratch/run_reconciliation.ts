
import visionService from '../src/lib/services/visionService';

async function main() {
  console.log('🚀 Démarrage de la réconciliation globale de la vision...');
  try {
    await visionService.reconcile();
    console.log('✅ Réconciliation terminée avec succès !');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de la réconciliation:', error);
    process.exit(1);
  }
}

main();
