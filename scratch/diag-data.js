
const fs = require('fs');
const path = require('path');

const TRAINING_DATA_DIR = path.join(process.cwd(), 'data', 'training');
const TRAINING_VERSIONS_DIR = path.join(TRAINING_DATA_DIR, 'versions');

console.log('--- DIAGNOSTIC DATA TRAINING ---');
console.log('CWD:', process.cwd());
console.log('VERSIONS DIR:', TRAINING_VERSIONS_DIR);

if (!fs.existsSync(TRAINING_VERSIONS_DIR)) {
  console.error('❌ Répertoire versions introuvable !');
  process.exit(1);
}

const files = fs.readdirSync(TRAINING_VERSIONS_DIR).filter(f => f.endsWith('.json'));
console.log(`Trouvé ${files.length} fichiers JSON`);

let totalQuestions = 0;
let foundQuestion = false;

for (const file of files) {
  const content = fs.readFileSync(path.join(TRAINING_VERSIONS_DIR, file), 'utf-8');
  try {
    const data = JSON.parse(content);
    const pairs = Array.isArray(data) ? data : (data.pairs || []);
    totalQuestions += pairs.length;
    
    const match = pairs.find(p => p.question && p.question.includes("registre"));
    if (match) {
      console.log(`✅ Trouvé dans ${file}: "${match.question}"`);
      foundQuestion = true;
    }
  } catch (e) {
    console.error(`❌ Erreur parsing ${file}`);
  }
}

console.log(`Total questions chargées: ${totalQuestions}`);
if (foundQuestion) {
  console.log('🚀 La question existe bien dans les fichiers.');
} else {
  console.log('⚠️ La question est introuvable dans tous les fichiers.');
}
