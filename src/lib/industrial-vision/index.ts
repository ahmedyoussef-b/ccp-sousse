// src/lib/industrial-vision/index.ts

import { IndustrialVisionConsole } from './cli/console-manager';
import { IndustrialVisionConfig } from './types/industrial.types';
import * as path from 'path';

// Configuration par défaut
export const defaultConfig: IndustrialVisionConfig = {
  referencesPath: path.join(process.cwd(), 'data', 'industrial-references'),
  capturesPath: path.join(process.cwd(), 'data', 'industrial-captures'),
  seuils: {
    similariteMarche: 0.7,
    similariteArret: 0.7,
    similariteDefaut: 0.7,
    pressionMax: 12,
    temperatureMax: 60
  }
};

export async function startIndustrialVision(config?: Partial<IndustrialVisionConfig>): Promise<void> {
  const fullConfig = { ...defaultConfig, ...config };
  
  // Créer les dossiers nécessaires
  const fs = require('fs');
  if (!fs.existsSync(fullConfig.referencesPath)) {
    fs.mkdirSync(fullConfig.referencesPath, { recursive: true });
    // Créer les sous-dossiers pour les types de référence
    fs.mkdirSync(path.join(fullConfig.referencesPath, 'marche_normale'), { recursive: true });
    fs.mkdirSync(path.join(fullConfig.referencesPath, 'arret_normale'), { recursive: true });
    fs.mkdirSync(path.join(fullConfig.referencesPath, 'defaut'), { recursive: true });
    console.log(`
📁 Structure de dossiers créée:
   data/industrial-references/
   ├── marche_normale/    (mettre ici les images de référence - état normal)
   ├── arret_normale/     (mettre ici les images de référence - à l'arrêt)
   └── defaut/            (mettre ici les images de référence - en défaut)
   
   data/industrial-captures/ (les images analysées seront copiées ici)
`);
  }
  
  const consoleManager = new IndustrialVisionConsole(fullConfig);
  await consoleManager.initialize();
}

// Exporter tous les modules pour usage programmatique
export * from './types/industrial.types';
export * from './core/ImageAnalyzer';
export * from './database/ReferenceDB';
export * from './innovations/level1-functional';
export * from './innovations/level4-dynamic';