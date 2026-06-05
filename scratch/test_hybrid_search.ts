
import { hybridVisionSearch } from '../src/ai/innovations/05-hybrid-vision-search';

async function test() {
  console.log('--- TEST RECHERCHE HYBRIDE ---');
  
  // Test 1: Recherche textuelle "pupitre"
  console.log('\n1. Recherche textuelle "pupitre":');
  const results1 = await hybridVisionSearch.enhancedSearch({
    textQuery: 'pupitre',
    visionWeight: 0,
    textWeight: 1,
    maxResults: 5

  });
  
  console.log(`Trouvé ${results1.results.length} résultats.`);
  results1.results.forEach(r => {
    console.log(`- ${r.metadata.filename} (Score: ${r.combinedScore.toFixed(3)})`);
  });

  // Test 2: Recherche textuelle "gaz"
  console.log('\n2. Recherche textuelle "gaz":');
  const results2 = await hybridVisionSearch.enhancedSearch({
    textQuery: 'gaz',
    visionWeight: 0,
    textWeight: 1,
    maxResults: 5

  });
  
  console.log(`Trouvé ${results2.results.length} résultats.`);
  results2.results.forEach(r => {
    console.log(`- ${r.metadata.filename} (Score: ${r.combinedScore.toFixed(3)})`);
  });

  process.exit(0);
}

test().catch(err => {
  console.error('Erreur test:', err);
  process.exit(1);
});
