/**
 * Module NOMINAL - Recherche par nom de fichier + table implicite + déduplication
 * @version 1.0.0
 * @description Point d'entrée unique pour toutes les fonctionnalités nominales
 */

import { deduplicationService } from './deduplication.service';
import { implicitMappingService } from './implicit-mapping.service';
import { nominalSearchService } from './nominal-search.service';
import { nominalAgent } from './nominal-agent';

export * from './types';

export { nominalSearchService, NominalSearchService } from './nominal-search.service';
export { implicitMappingService, ImplicitMappingService } from './implicit-mapping.service';
export { deduplicationService, DeduplicationService } from './deduplication.service';
export { nominalAgent, NominalAgent } from './nominal-agent';

/**
 * Initialise tous les services du module nominal
 */
export async function initializeNominalModule(): Promise<void> {
  await implicitMappingService.initialize();
  await nominalSearchService.initialize();
  await deduplicationService.initialize();
  console.log('[NOMINAL] ✅ Module initialisé');
}

/**
 * Initialise l'agent nominal (recommandé pour utilisation moderne)
 */
export async function initializeNominalAgent(): Promise<void> {
  await nominalAgent.initialize();
  console.log('[NOMINAL] ✅ Agent nominal initialisé');
}