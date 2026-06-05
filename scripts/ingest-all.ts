// scripts/ingest-all.ts
/**
 * Script d'ingestion initiale – Architecture par zones
 * Parcourt data/centrale_documents et indexe tous les documents dans ChromaDB.
 * Exécution: npx ts-node scripts/ingest-all.ts
 */

import fs from 'fs/promises';
import path from 'path';
import { ChromaDBManager } from '../src/ai/vector/chromadb-manager';
import { ZONES_CONFIG, type ZoneType } from '../src/ai/vector/chromadb-schema';
import { DocumentProcessor } from '../src/lib/document-manager/document-processor';
import { DOCUMENTS_ROOT } from '../src/lib/document-manager/config';

// Configuration
const BATCH_SIZE = 5; // Nombre de fichiers traités en parallèle
const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.json', '.pdf', '.jpg', '.jpeg', '.png'];

// Logger simple
const log = {
  info: (msg: string) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg: string) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  warn: (msg: string) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  error: (msg: string) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  progress: (current: number, total: number, file: string) => {
    const percent = ((current / total) * 100).toFixed(1);
    process.stdout.write(`\r\x1b[36m[PROGRESS]\x1b[0m ${percent}% (${current}/${total}) - ${file.padEnd(40)}`);
  }
};

/**
 * Parcourt récursivement un dossier et retourne la liste des fichiers supportés
 */
async function walkDirectory(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await walkDirectory(fullPath);
      files.push(...subFiles);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

/**
 * Détermine la zone à partir du chemin (premier segment après DOCUMENTS_ROOT)
 */
function getZoneFromPath(filePath: string): ZoneType | null {
  const relative = path.relative(DOCUMENTS_ROOT, filePath);
  const parts = relative.split(path.sep);
  const firstSegment = parts[0];
  
  if (firstSegment && ZONES_CONFIG[firstSegment as ZoneType]) {
    return firstSegment as ZoneType;
  }
  return null;
}

/**
 * Détermine le type de document à partir du chemin (sous-dossier)
 */
function inferDocumentType(filePath: string): string {
  const relative = path.relative(DOCUMENTS_ROOT, filePath);
  const parts = relative.split(path.sep);
  
  // Le type est généralement dans le deuxième segment (ex: equipements/, alarmes/, procedures/)
  if (parts.length >= 2) {
    const subfolder = parts[1].toLowerCase();
    const typeMap: Record<string, string> = {
      'equipements': 'equipement',
      'alarmes': 'alarme_hmi',
      'alarmes_techniques': 'alarme_technique',
      'procedures': 'procedure',
      'images': 'image',
      'synoptiques': 'synoptique',
      'composants': 'composant',
      'organigramme': 'rh',
      'gammes': 'maintenance',
      'documents_bruts': 'document_brut'
    };
    if (typeMap[subfolder]) return typeMap[subfolder];
  }
  return 'document_brut';
}

/**
 * Traite un lot de fichiers
 */
async function processBatch(files: string[], processor: DocumentProcessor): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  
  const promises = files.map(async (filePath) => {
    try {
      const zone = getZoneFromPath(filePath);
      if (!zone) {
        log.warn(`Zone non déterminée pour ${filePath}, ignoré`);
        failed++;
        return;
      }
      
      const documentType = inferDocumentType(filePath);
      log.info(`Traitement: ${path.basename(filePath)} (zone: ${zone}, type: ${documentType})`);
      
      await processor.processDocument(filePath, { zone, documentType });
      success++;
    } catch (error: any) {
      log.error(`Échec pour ${path.basename(filePath)}: ${error.message}`);
      failed++;
    }
  });
  
  await Promise.all(promises);
  return { success, failed };
}

/**
 * Fonction principale
 */
async function main() {
  log.info('========================================');
  log.info('Début de l\'ingestion initiale des documents');
  log.info('========================================');
  
  // Vérifier que DOCUMENTS_ROOT existe
  try {
    await fs.access(DOCUMENTS_ROOT);
    log.info(`Racine des documents: ${DOCUMENTS_ROOT}`);
  } catch {
    log.error(`Le dossier ${DOCUMENTS_ROOT} n'existe pas. Vérifiez votre configuration.`);
    process.exit(1);
  }
  
  // Lister toutes les zones présentes
  const zones = Object.keys(ZONES_CONFIG);
  log.info(`Zones définies: ${zones.join(', ')}`);
  
  // Parcourir les dossiers racine pour trouver les zones existantes
  const entries = await fs.readdir(DOCUMENTS_ROOT, { withFileTypes: true });
  const existingZones = entries
    .filter(e => e.isDirectory() && ZONES_CONFIG[e.name as ZoneType])
    .map(e => e.name);
  
  if (existingZones.length === 0) {
    log.warn('Aucun dossier de zone trouvé dans DOCUMENTS_ROOT. Création des zones...');
    for (const zone of zones) {
      const zonePath = path.join(DOCUMENTS_ROOT, zone);
      await fs.mkdir(zonePath, { recursive: true });
      log.info(`Créé: ${zonePath}`);
    }
  } else {
    log.info(`Zones existantes: ${existingZones.join(', ')}`);
  }
  
  // Récupérer tous les fichiers à indexer
  log.info('Scanning des fichiers...');
  let allFiles: string[] = [];
  for (const zone of zones) {
    const zonePath = path.join(DOCUMENTS_ROOT, zone);
    try {
      const files = await walkDirectory(zonePath);
      allFiles.push(...files);
      log.info(`Zone ${zone}: ${files.length} fichiers`);
    } catch (err) {
      log.warn(`Zone ${zone} introuvable ou vide`);
    }
  }
  
  if (allFiles.length === 0) {
    log.warn('Aucun fichier trouvé à indexer.');
    return;
  }
  
  log.info(`Total des fichiers à traiter: ${allFiles.length}`);
  
  // Initialiser le processeur de documents
  const processor = new DocumentProcessor((stage, percent, detail) => {
    // Optionnel: afficher la progression en temps réel
    if (percent % 20 === 0) {
      log.info(`[PIPELINE] ${stage} - ${percent}%`);
    }
  });
  
  // Traiter par lots
  let processed = 0;
  let totalSuccess = 0;
  let totalFailed = 0;
  
  for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
    const batch = allFiles.slice(i, i + BATCH_SIZE);
    const { success, failed } = await processBatch(batch, processor);
    totalSuccess += success;
    totalFailed += failed;
    processed += batch.length;
    log.progress(processed, allFiles.length, batch[batch.length - 1]?.split(path.sep).slice(-2).join('/') || '');
  }
  
  console.log(); // Nouvelle ligne après la barre de progression
  
  log.success('========================================');
  log.success(`Ingestion terminée: ${totalSuccess} succès, ${totalFailed} échecs`);
  log.success('========================================');
}

// Exécution
main().catch(error => {
  log.error(`Erreur fatale: ${error.message}`);
  process.exit(1);
});