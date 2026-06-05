
import { getSQLiteCore } from '../src/ai/core/sqlite/manager';

async function main() {
  const db = getSQLiteCore();
  await db.initialize();
  const rows = db.getDB().prepare('SELECT id, filename, file_hash FROM vision_data WHERE file_hash IS NOT NULL LIMIT 5').all();
  console.log('🔍 Échantillon de données avec hash :');
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

main();
