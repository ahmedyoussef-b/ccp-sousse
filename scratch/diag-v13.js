
const fs = require('fs');
const path = require('path');

const file = 'examples_v13_2026-04-18_20260418_181527.json';
const filePath = path.join(process.cwd(), 'data', 'training', 'versions', file);

console.log(`--- ANALYSE SPECIALE ${file} ---`);

if (!fs.existsSync(filePath)) {
  console.error('❌ Fichier introuvable !');
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf-8');
console.log(`Taille: ${content.length} caractères`);

try {
  const data = JSON.parse(content);
  console.log(`Nombre d'entrées: ${data.length}`);
  
  const target = "Quelles sont les conditions d'ouverture du registre ?";
  const found = data.find(p => p.question === target);
  
  if (found) {
    console.log('✅ MATCH EXACT TROUVÉ !');
    console.log('Réponse:', found.response);
  } else {
    console.log('❌ MATCH EXACT NON TROUVÉ');
    
    // Recherche partielle
    const partial = data.filter(p => p.question && p.question.toLowerCase().includes('registre'));
    console.log(`Trouvé ${partial.length} questions contenant "registre":`);
    partial.forEach(p => console.log(`- "${p.question}"`));
  }
} catch (e) {
  console.error('❌ Erreur JSON:', e.message);
}
