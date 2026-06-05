/**
 * Point d'entrée unique pour SQLite dans toute l'application
 * Usage: import { getSQLiteCore } from '@/ai/core/sqlite';
 */

import getSQLiteCore from './manager';
import getMigrationManager from './migrations';

export { SQLiteCore, getSQLiteCore } from './manager';
export { getSchemasByModule, getAllSchemas, SCHEMAS } from './schemas';
export { hashString, formatDuration, logger } from './utils';
async function initializeDatabase() {
  const db = getSQLiteCore();
  await db.initialize();
  
  const migrator = getMigrationManager();
  const result = await migrator.migrate();
  
  if (result.failed.length > 0) {
    console.error('❌ Certaines migrations ont échoué:', result.failed);
    process.exit(1);
  }
  
  // Vérification d'intégrité (optionnel)
  const integrity = await migrator.verifyIntegrity();
  if (!integrity.valid) {
    console.warn('⚠️ Tables manquantes:', integrity.missingTables);
  }
  
  console.log('✅ Base de données prête');
}

// Appeler au démarrage
initializeDatabase().catch(console.error);