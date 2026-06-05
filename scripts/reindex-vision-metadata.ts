// scripts/reindex-vision-metadata.ts
import fs from 'fs/promises';
import path from 'path';
import { chromaDBManager } from '../src/ai/vector/chromadb-manager';

async function reindexAllImages() {
  console.log('🚀 Réindexation des métadonnées images vers ChromaDB (mode léger)...');
  
  try {
    await chromaDBManager.initialize();
    
    // Dossiers à scanner
    const dirs = [
      path.join(process.cwd(), 'data/images/permanent'),
      path.join(process.cwd(), 'data/images/uploads')
    ];
    
    let totalProcessed = 0;
    
    for (const dir of dirs) {
      try {
        const files = await fs.readdir(dir);
        const jsonFiles = files.filter(f => f.endsWith('.json') && !f.includes('_thumb'));
        
        for (const jsonFile of jsonFiles) {
          const jsonPath = path.join(dir, jsonFile);
          const content = await fs.readFile(jsonPath, 'utf-8');
          const metadata = JSON.parse(content);
          const imageId = metadata.id || jsonFile.replace('.json', '');
          
          // Construire le contenu textuel à indexer
          const contentParts = [
            metadata.description || '',
            (metadata.tags || []).join(' '),
            metadata.location || '',
            metadata.filename || ''
          ];
          const textContent = contentParts.filter(p => p).join(' ');
          
          // Métadonnées pour ChromaDB
          const chromaMetadata = {
            imageId: imageId,
            filename: metadata.filename || '',
            description: metadata.description || '',
            tags: (metadata.tags || []).join(','),
            location: metadata.location || '',
            folderId: metadata.folderId || 'root',
            linkedDocumentIds: (metadata.linkedDocumentIds || []).join(','),
            date: metadata.date || ''
          };
          
          await chromaDBManager.upsertDocuments('VISION', [
            {
              id: `vision_${imageId}`,
              content: textContent,
              metadata: chromaMetadata
            }
          ]);
          
          totalProcessed++;
          if (totalProcessed % 10 === 0) {
            console.log(`📸 ${totalProcessed} images synchronisées...`);
          }
        }
      } catch (err) {
        console.warn(`⚠️ Dossier ${dir} inaccessible ou vide:`, err);
      }
    }
    
    console.log(`\n✅ Réindexation terminée : ${totalProcessed} images synchronisées dans ChromaDB (collection VISION).`);
  } catch (error) {
    console.error('❌ Erreur globale:', error);
    process.exit(1);
  }
}

reindexAllImages().then(() => process.exit(0));