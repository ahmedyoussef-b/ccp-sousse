/**
 * @fileOverview ChromaDB Schema - Configuration complète des collections
 * @version 6.0.0
 * @description Zones documentaires, mots-clés techniques, routage dynamique
 * @integration Orchestration - Support multi-zones et classification sémantique
 */

import { EMBEDDING_CONFIG, getCurrentDimension, isDimensionDetected } from './embeddings';

// ============================================================================
// TYPES DE ZONES (COLLECTIONS)
// ============================================================================

export type ZoneType =
  | 'A0_DIVERS'
  | 'B0_AUXILIAIRES'
  | 'B1_HRSG_TG1'
  | 'B2_HRSG_TG2'
  | 'B3_TV_PE'
  | 'TG1'
  | 'TG2'
  | 'RH'
  | 'MAINTENANCE'
  | 'MEMOIRE_EPISODIQUE'
  | 'SHARED'
  | 'VISION'
  | 'PANORAMA_SESSIONS'
  | 'MINDMAP';

export interface ZoneMetadataConfig {
  name: ZoneType;
  collectionName: string;
  displayName: string;
  description: string;
  keywords: string[];
  priority: number;
  enabled: boolean;
  chunkSize: number;
  chunkOverlap: number;
  sourceFolder: string;
  embeddingModel: string;
}

// ============================================================================
// CONFIGURATION DES ZONES
// ============================================================================

export const ZONES_CONFIG: Record<ZoneType, ZoneMetadataConfig> = {
  A0_DIVERS: {
    name: 'A0_DIVERS',
    collectionName: 'A0_DIVERS',
    displayName: 'Zone A0 – Divers',
    description: 'Équipements divers, poste bloc A, locaux généraux',
    keywords: ['a0', 'divers', 'poste bloc a', 'local', 'bâtiment', 'éclairage', 'cvc', 'vestiaire', 'alarme', 'ljp'],
    priority: 3,
    enabled: true,
    chunkSize: 2000,
    chunkOverlap: 200,
    sourceFolder: 'A0_DIVERS',
    embeddingModel: EMBEDDING_CONFIG.defaultModel
  },
  B0_AUXILIAIRES: {
    name: 'B0_AUXILIAIRES',
    collectionName: 'B0_AUXILIAIRES',
    displayName: 'Zone B0 – Auxiliaires communs',
    description: 'Systèmes auxiliaires : eau, air, fuel, électricité, supervision commune',
    keywords: [
      'b0', 'auxiliaire', 'air instrument', 'eau de refroidissement', 'filtration', 'gaz', 'fuel',
      'distribution électrique', 'climatisation', 'poste extérieur', 'traitement eau', 'alimentation gaz',
      'alimentation fioul', 'alarme', 'circuit', 'cfi', 'crf', 'dvc', 'gis', 'kbs', 'kcz', 'kit', 'krg', 'ksa', 'ksc',
      'lba', 'lbb', 'lca', 'lcb', 'lga', 'ljp', 'lka', 'lkb', 'lkn', 'lla', 'llb', 'lln', 'llp', 'lna', 'lsi',
      'test_modbus', 'sap', 'sar', 'ser', 'sir', 'sit', 'skd', 'tkg', 'tpf', 'tpg',
      'filtration eau', 'circuit eau refroidissement', 'climatisation batiments', 'distribution 125v',
      'poste exterieur', 'air de travail', 'air de regul', 'eau dem', 'conditionnement chimique', 'fioul',
      'b0sy11', 'b0sy21', 'b0sy31', 'b0sy32', 'b0gn02', 'b0gn11', 'b0asr1', 'b0gn31', 'b0gn32', 'b0gnr1', 'b0el11', 'b0el21', 'b0el22'
    ],
    priority: 1,
    enabled: true,
    chunkSize: 2500,
    chunkOverlap: 300,
    sourceFolder: 'B0_AUXILIAIRES',
    embeddingModel: EMBEDDING_CONFIG.defaultModel
  },
  B1_HRSG_TG1: {
    name: 'B1_HRSG_TG1',
    collectionName: 'B1_HRSG_TG1',
    displayName: 'Zone B1 – Chaudière HRSC TG1',
    description: 'Chaudière de récupération de la turbine à gaz 1',
    keywords: [
      'b1', 'cr1', 'hrsg tg1', 'chaudière tg1', 'vapeur hp', 'vapeur bp', 'récupération tg1',
      'purge', 'condensat', 'surchauffeur', 'ballon hp', 'ballon bp', 'alarme', 'circuit',
      'aco', 'crf', 'ele', 'fbp', 'flb', 'frg', 'fse', 'fsr', 'gbp', 'ghp', 'gis', 'kbs', 'kcz',
      'kos', 'krg', 'lga', 'ljp', 'lka', 'lla', 'sit', 'tca', 'tev', 'tex', 'tgr', 'tgu', 'tnt',
      'tpa', 'tpf', 'tpg', 'tpt', 'tra', 'tre', 'tri', 'trt', 'tta', 'tvc', 'tvm', 'wp',
      'recup purges', 'prechauffage eau', 'circuits basse pression', 'securite generale',
      'contournement bp', 'contournement hp', 'poste blindé', 'automates logiques',
      'aspiration air', 'evacuation energie', 'excitation alternateur', 'graissage',
      'detection incendie', 'refrigeration', 'b1tg11', 'b1tg21', 'b1tg31', 'b1tg32', 'b1tg33',
      'b1cr11', 'b1cr21', 'b1cr22', 'b1cr31', 'b1tv21', 'b1tv22', 'b1crr1', 'b1el21'
    ],
    priority: 1,
    enabled: true,
    chunkSize: 2500,
    chunkOverlap: 300,
    sourceFolder: 'B1_HRSG_TG1',
    embeddingModel: EMBEDDING_CONFIG.defaultModel
  },
  B2_HRSG_TG2: {
    name: 'B2_HRSG_TG2',
    collectionName: 'B2_HRSG_TG2',
    displayName: 'Zone B2 – Chaudière HRSC TG2',
    description: 'Chaudière de récupération de la turbine à gaz 2',
    keywords: [
      'b2', 'cr2', 'hrsg tg2', 'chaudière tg2', 'vapeur hp', 'vapeur bp', 'récupération tg2',
      'purge', 'condensat', 'surchauffeur', 'ballon hp', 'ballon bp', 'alarme', 'circuit',
      'aco', 'crf', 'ele', 'fbp', 'flb', 'frg', 'fse', 'fsr', 'gbp', 'ghp', 'gis', 'kbs', 'kcz',
      'kos', 'krg', 'lga', 'ljp', 'lka', 'lla', 'sit', 'tca', 'tev', 'tex', 'tgr', 'tgu', 'tnt',
      'tpa', 'tpf', 'tpg', 'tpt', 'tra', 'tre', '333', 'trt', 'tta', 'tvc', 'tvm', 'wp',
      'recup purges', 'prechauffage eau', 'circuits basse pression', 'securite generale',
      'contournement bp', 'contournement hp', 'poste blindé', 'automates logiques',
      'aspiration air', 'evacuation energie', 'excitation alternateur', 'graissage',
      'detection incendie', 'refrigeration', 'b2tg11', 'b2tg21', 'b2tg31', 'b2tg32', 'b2tg33',
      'b2cr11', 'b2cr21', 'b2cr22', 'b2cr31', 'b2tv21', 'b2tv22', 'b2crr1', 'b2el21'
    ],
    priority: 1,
    enabled: true,
    chunkSize: 2500,
    chunkOverlap: 300,
    sourceFolder: 'B2_HRSG_TG2',
    embeddingModel: EMBEDDING_CONFIG.defaultModel
  },
  B3_TV_PE: {
    name: 'B3_TV_PE',
    collectionName: 'B3_TV_PE',
    displayName: 'Zone B3 – Turbine vapeur + Poste d’eau',
    description: 'Turbine à vapeur, condenseur, extraction, poste d’eau, refroidissement, lubrification TV',
    keywords: [
      'b3', 'tv', 'turbine vapeur', 'condenseur', 'extraction', 'poste eau', 'eau déminée',
      'refroidissement', 'lubrification tv', 'graissage', 'by-pass', 'échappement tv', 'alarme', 'circuit',
      'aco', 'adg', 'apb', 'aph', 'arg', 'cap', 'car', 'cet', 'cex', 'cfi', 'cjk', 'crf', 'cta', 'cvi',
      'ele', 'fbp', 'gbp', 'gev', 'gex', 'gfr', 'ggr', 'ghp', 'gma', 'gpa', 'gpv', 'gra', 'gre', 'gse',
      'gsy', 'gth', 'hmi', 'kbs', 'kca', 'kcz', 'kos', 'krg', 'ksc', 'lba', 'lbb', 'lca', 'lcb', 'lga',
      'ljp', 'lka', 'lna', 'ser', 'sit', 'sri', 'sva', 'sxs', 'vri', 'wp',
      'bache alimentaire', 'eau alimentaire', 'controle analogique', 'appoint condenseur',
      'arrosage boites', 'etancheite tv', 'condensation extraction', 'cellule tv',
      'nettoyage condenseur', 'vide condenseur', 'prechauffage eau', 'contournement bp tv',
      'evacuation energie', 'excitation alternateur', 'graissage soulevement virage',
      'surveillance mecanique', 'protection alternateur', 'circuit principal vapeur',
      'refrigeration alternateur', 'synchro couplage', 'traitement h-lub',
      'regulation charge bloc', 'distribution 125v', 'distribution 48v', 'poste exterieur travee tv',
      'eau demineralisee', 'refri eau dem', 'vapeur auxiliaire', 'drainage salle machines',
      'b3pe11', 'b3pe20', 'b3pe21', 'b3pe22', 'b3pe23', 'b3pe24', 'b3pe25', 'b3pe26',
      'b3tv11', 'b3tv21', 'b3tv23', 'b3tv24', 'b3tv31', 'b3per1', 'b3el21', 'b3el22',
      'b3tv41', 'b3tv42', 'b3tv43', 'b3tv44', 'b3tv45', 'b3tv46exp'
    ],
    priority: 1,
    enabled: true,
    chunkSize: 2500,
    chunkOverlap: 300,
    sourceFolder: 'B3_TV_PE',
    embeddingModel: EMBEDDING_CONFIG.defaultModel
  },
  TG1: {
    name: 'TG1',
    collectionName: 'TG1',
    displayName: 'Zone TG1 – Turbine à gaz 1',
    description: 'Turbine à gaz 1 : compresseur, combustion, lubrification, commande, protection',
    keywords: [
      'tg', 'tg1', 'turbine gaz 1', 'turbine à gaz 1', 'compresseur tg1', 'chambre combustion tg1',
      'lubrification tg1', 'igv', 'allumage tg1', 'speedtronic', 'l30txa', 'l86txt', 'l12h', 'bos',
      '63qa', 'vibration tg1', 'alarme', 'circuit', 'b1tg11', 'b1tg21', 'b1tg31', 'b1tg32', 'b1tg33'
    ],
    priority: 1,
    enabled: true,
    chunkSize: 3000,
    chunkOverlap: 350,
    sourceFolder: 'TG1',
    embeddingModel: EMBEDDING_CONFIG.defaultModel
  },
  TG2: {
    name: 'TG2',
    collectionName: 'TG2',
    displayName: 'Zone TG2 – Turbine à gaz 2',
    description: 'Turbine à gaz 2 (identique TG1)',
    keywords: [
      'tg', 'tg2', 'turbine gaz 2', 'turbine à gaz 2', 'compresseur tg2', 'chambre combustion tg2',
      'lubrification tg2', 'igv', 'allumage tg2', 'speedtronic', 'vibration tg2', 'alarme', 'circuit',
      'b2tg11', 'b2tg21', 'b2tg31', 'b2tg32', 'b2tg33'
    ],
    priority: 1,
    enabled: true,
    chunkSize: 3000,
    chunkOverlap: 350,
    sourceFolder: 'TG2',
    embeddingModel: EMBEDDING_CONFIG.defaultModel
  },
  RH: {
    name: 'RH',
    collectionName: 'RH_COLL',
    displayName: 'Ressources Humaines',
    description: 'Organigramme, compétences, formations, plannings, réunions',
    keywords: [
      'rh', 'ressource humaine', 'équipe', 'organigramme', 'compétence', 'habilitation',
      'formation', 'planning', 'astreinte', 'responsable', 'ahmed', 'abbès', 'employé',
      'technicien', 'ingénieur', 'chef de quart', 'chef quart', 'chef de bloc', 'chef bloc',
      'profil', 'profile', 'poste', 'fiche de poste', 'fiche poste', 'opérateur', 'operateur',
      'rôle', 'role', 'attribution', 'mission', 'fonction', 'superviseur', 'parcours',
      'carrière', 'cv', 'curriculum', 'tg1', 'tg2'
    ],
    priority: 2,
    enabled: true,
    chunkSize: 2000,
    chunkOverlap: 200,
    sourceFolder: 'RH',
    embeddingModel: EMBEDDING_CONFIG.defaultModel
  },
  MAINTENANCE: {
    name: 'MAINTENANCE',
    collectionName: 'MAINTENANCE',
    displayName: 'Maintenance',
    description: 'Gammes, plannings, historique interventions, pièces de rechange',
    keywords: [
      'maintenance', 'gamme', 'planning maintenance', 'réparation', 'panne', 'inspection',
      'révision', 'entretien', 'diagnostic', 'dépannage', 'pièce détachée', 'historique intervention',
      'alarme', 'circuit'
    ],
    priority: 2,
    enabled: true,
    chunkSize: 2500,
    chunkOverlap: 300,
    sourceFolder: 'MAINTENANCE',
    embeddingModel: EMBEDDING_CONFIG.defaultModel
  },
  MEMOIRE_EPISODIQUE: {
    name: 'MEMOIRE_EPISODIQUE',
    collectionName: 'MEMOIRE_EPISODIQUE',
    displayName: 'Mémoire Épisodique',
    description: 'Historique des interactions passées et apprentissage continu',
    keywords: ['historique', 'interaction', 'souvenir', 'mémoire', 'précédemment'],
    priority: 4,
    enabled: true,
    chunkSize: 1000,
    chunkOverlap: 100,
    sourceFolder: 'MEMOIRE_EPISODIQUE',
    embeddingModel: EMBEDDING_CONFIG.defaultModel
  },
  SHARED: {
    name: 'SHARED',
    collectionName: 'SHARED',
    displayName: 'Documents transverses',
    description: 'Réglementations, formation commune, sécurité générale, supervision globale',
    keywords: [
      'réglementation', 'norme', 'iso', 'cei', 'sécurité générale', 'formation commune',
      'supervision globale', 'calcul économique', 'synoptique transverse', 'historique général',
      'incident majeur', 'alarme', 'circuit'
    ],
    priority: 3,
    enabled: true,
    chunkSize: 2500,
    chunkOverlap: 300,
    sourceFolder: 'SHARED',
    embeddingModel: EMBEDDING_CONFIG.defaultModel
  },
  VISION: {
    name: 'VISION',
    collectionName: 'VISION_METADATA',
    displayName: 'Métadonnées images vision industrielle',
    description: 'Indexation des métadonnées enrichies des images',
    keywords: ['image', 'vision', 'photo', 'composant', 'défaut', 'inspection', 'caméra', 'schéma', 'visuel'],
    priority: 2,
    enabled: true,
    chunkSize: 1500,
    chunkOverlap: 150,
    sourceFolder: 'data/images',
    embeddingModel: EMBEDDING_CONFIG.defaultModel
  },
  PANORAMA_SESSIONS: {
    name: 'PANORAMA_SESSIONS',
    collectionName: 'PANORAMA_PROJECTS',
    displayName: 'Projets Panoramiques',
    description: 'Configurations d\'assemblage manuel et métadonnées de sessions',
    keywords: ['panorama', 'stitching', 'assemblage', 'manuel', 'session', 'projet'],
    priority: 3,
    enabled: true,
    chunkSize: 1000,
    chunkOverlap: 100,
    sourceFolder: 'data/panoramas',
    embeddingModel: EMBEDDING_CONFIG.defaultModel
  },
  MINDMAP: {
    name: 'MINDMAP',
    collectionName: 'MINDMAP_CHUNKS',
    displayName: 'Mind Maps Circuits',
    description: 'Indexation vectorielle des schémas mentaux, nœuds et interdépendances des circuits',
    keywords: ['mindmap', 'schéma mental', 'circuit', 'nœud', 'dépendance', 'paramètre', 'formule'],
    priority: 2,
    enabled: true,
    chunkSize: 1500,
    chunkOverlap: 150,
    sourceFolder: 'data/mindmaps',
    embeddingModel: EMBEDDING_CONFIG.defaultModel
  }
};

// ============================================================================
// COLLECTIONS PRINCIPALES
// ============================================================================

export const ChromaCollections = Object.fromEntries(
  Object.entries(ZONES_CONFIG).map(([key, config]) => [
    key,
    {
      name: config.collectionName,
      displayName: config.displayName,
      description: config.description,
      metadata: {
        version: "6.0",
        category: "zone",
        priority: config.priority,
        "hnsw:space": "cosine",
        "hnsw:construction_ef": config.priority === 1 ? 250 : 200,
        "hnsw:M": config.priority === 1 ? 48 : 32
      },
      sourceFolder: config.sourceFolder,
      embeddingModel: config.embeddingModel,
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      embeddingDimension: key === 'VISION' ? 768 : EMBEDDING_CONFIG.defaultDimension
    }
  ])
) as Record<ZoneType, any>;

export type CollectionName = ZoneType;

// ============================================================================
// FONCTIONS DE RECHERCHE DE ZONES
// ============================================================================

export function getZoneConfig(zoneName: ZoneType): ZoneMetadataConfig {
  return ZONES_CONFIG[zoneName];
}

/**
 * Détecte les zones pertinentes pour une requête
 * Version optimisée pour l'orchestration
 */
export function getRelevantZones(query: string): ZoneType[] {
  const queryLower = query.toLowerCase();
  const scores: Map<ZoneType, number> = new Map();

  // Détection RH (incluant formulations de profil)
  const rhKeywords = [
    'rh', 'ressource humaine', 'congé', 'absence', 'planning', 'astreinte',
    'compétence', 'formation', 'employé', 'embauche', 'recrutement',
    'salaire', 'contrat', 'entretien', 'évaluation', 'profil', 'profile', 'fiche de poste',
    'qui est', 'quel est le profil', 'coordonnées', 'téléphone', 'email',
    'remplacer', 'cv', 'curriculum', 'parcours', 'carrière', 'ahmed', 'abbès', 'abbes',
    'collaborateur', 'salarié', 'agent', 'personnel'
  ];
  
  let isRHQuery = rhKeywords.some(kw => queryLower.includes(kw));
  if (isRHQuery) console.log(`[getRelevantZones] 🔍 Requête RH détectée`);

  // Parcours des zones
  for (const [zone, config] of Object.entries(ZONES_CONFIG)) {
    if (!config.enabled) continue;
    if (zone === 'RH' && !isRHQuery) continue;

    let score = 0;
    let matchedKeywords = 0;

    for (const keyword of config.keywords) {
      if (queryLower.includes(keyword)) {
        const isExactMatch = new RegExp(`\\b${keyword}\\b`, 'i').test(queryLower);
        score += isExactMatch ? 15 : 10;
        matchedKeywords++;
      }
    }

    // Bonus de priorité
    score += (6 - config.priority) * 2;
    
    // Bonus si le nom de la zone est mentionné
    if (queryLower.includes(zone.toLowerCase())) score += 30;

    if (score > 0) {
      scores.set(zone as ZoneType, score);
      if (zone === 'RH') console.log(`[getRelevantZones] ✅ Zone RH: score ${score} (${matchedKeywords} mots-clés)`);
    }
  }

  // Ajout prioritaire de VISION
  const visionKeywords = ['image', 'photo', 'montre', 'affiche', 'visuel', 'schéma'];
  let visionScore = visionKeywords.reduce((sum, kw) => sum + (queryLower.includes(kw) ? 35 : 0), 0);
  if (visionScore > 0) scores.set('VISION', visionScore);

  if (scores.size === 0) {
    return ['SHARED', 'B0_AUXILIAIRES'];
  }

  // Tri et retour des 3 meilleures zones
  const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  const result = sorted.slice(0, 3).map(([name]) => name);
  console.log(`[getRelevantZones] Zones: ${result.join(', ')}`);
  return result;
}

/**
 * Détermine le type de réponse attendu
 */
export function getExpectedResponseType(query: string): 'list' | 'detail' | 'step' | 'definition' | 'comparison' {
  const queryLower = query.toLowerCase();
  if (queryLower.includes('liste') || queryLower.includes('quels') || queryLower.includes('quelles')) return 'list';
  if (queryLower.includes('étape') || queryLower.includes('procédure')) return 'step';
  if (queryLower.includes('définition') || queryLower.includes("qu'est-ce")) return 'definition';
  if (queryLower.includes('différence') || queryLower.includes('versus')) return 'comparison';
  return 'detail';
}

// ============================================================================
// CONFIGURATION GLOBALE
// ============================================================================

export const CHROMA_CONFIG = {
  hnsw: { space: "cosine", construction_ef: 200, M: 32, search_ef: 150 },
  search: { defaultResults: 10, maxResults: 50, minConfidence: 0.3, rerankingEnabled: true },
  optimization: { batchSize: 100, maxConcurrent: 3, retryAttempts: 3, retryDelay: 1000, timeout: 15000 },
  cache: { enabled: true, ttl: 3600, maxSize: 1000 }
};

// ============================================================================
// TYPES ET INTERFACES
// ============================================================================

export interface StandardMetadata {
  id: string;
  titre: string;
  type: string;
  categorie: string;
  sous_categorie?: string;
  sourceFolder: string;
  equipement?: string;
  zone?: ZoneType;
  pupitre?: string;
  tags: string[];
  mots_cles: string[];
  version: string;
  date_creation: string;
  date_modification: string;
  auteur: string;
  source: string;
  confidence?: number;
  chunk_index?: number;
  chunk_total?: number;
  is_chunk?: boolean;
  parent_id?: string;
  embedding_dimension?: number;
  [key: string]: any;
}

export function generateDocumentId(prefix: string, source: string): string {
  const timestamp = Date.now();
  const hash = source.split('').reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0);
  return `${prefix}_${timestamp}_${Math.abs(hash).toString(36)}`;
}

export function createStandardMetadata(
  params: Partial<StandardMetadata> & { titre: string; type: string; source: string }
): StandardMetadata {
  const now = new Date().toISOString();
  const { titre, type, source, ...optionalParams } = params;
  return {
    id: params.id || generateDocumentId(type, source),
    titre,
    type,
    categorie: params.categorie || 'general',
    sourceFolder: params.sourceFolder || 'unknown',
    tags: params.tags || [],
    mots_cles: params.mots_cles || [],
    version: params.version || '6.0',
    date_creation: params.date_creation || now,
    date_modification: params.date_modification || now,
    auteur: params.auteur || 'system',
    source,
    embedding_dimension: getEmbeddingDimension(),
    ...optionalParams
  };
}

export function getEmbeddingDimension(): number {
  return getCurrentDimension();
}

export function isEmbeddingDimensionReady(): boolean {
  return isDimensionDetected();
}

export function getHNSWConfig(zoneName: ZoneType) {
  const config = ChromaCollections[zoneName];
  return {
    "hnsw:space": config.metadata["hnsw:space"] || CHROMA_CONFIG.hnsw.space,
    "hnsw:construction_ef": config.metadata["hnsw:construction_ef"] || CHROMA_CONFIG.hnsw.construction_ef,
    "hnsw:M": config.metadata["hnsw:M"] || CHROMA_CONFIG.hnsw.M
  };
}

// ============================================================================
// PROFILS UTILISATEURS
// ============================================================================

export const ProfileToZonesMap: Record<string, ZoneType[]> = {
  'chef_bloc_TG1': ['TG1', 'B1_HRSG_TG1', 'B0_AUXILIAIRES', 'SHARED'],
  'chef_bloc_TG2': ['TG2', 'B2_HRSG_TG2', 'B0_AUXILIAIRES', 'SHARED'],
  'operateur_TV': ['B3_TV_PE', 'B0_AUXILIAIRES', 'SHARED'],
  'chef_quart': ['B0_AUXILIAIRES', 'RH', 'SHARED', 'MAINTENANCE', 'TG1', 'TG2', 'B3_TV_PE'],
  'superviseur': ['SHARED', 'MAINTENANCE', 'RH', 'B0_AUXILIAIRES', 'TG1', 'TG2', 'B3_TV_PE'],
  'maintenance': ['MAINTENANCE', 'TG1', 'TG2', 'B0_AUXILIAIRES', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE', 'SHARED']
};

export function getZonesForProfile(profile: string): ZoneType[] {
  return ProfileToZonesMap[profile] || ['SHARED', 'B0_AUXILIAIRES'];
}

export function hasZoneAccess(profile: string, zone: ZoneType): boolean {
  return getZonesForProfile(profile).includes(zone);
}

export function getRecommendedChunkSize(zoneName: ZoneType): number {
  return ZONES_CONFIG[zoneName]?.chunkSize || 2000;
}

export function getRecommendedChunkOverlap(zoneName: ZoneType): number {
  return ZONES_CONFIG[zoneName]?.chunkOverlap || 200;
}

export function getAllZones(): ZoneType[] {
  return Object.keys(ZONES_CONFIG) as ZoneType[];
}

export function getMainZones(): ZoneType[] {
  return (Object.keys(ZONES_CONFIG) as ZoneType[]).filter(zone => ZONES_CONFIG[zone].priority <= 2);
}

export function getZoneMetadata(zoneName: ZoneType): Record<string, any> {
  const config = ChromaCollections[zoneName];
  return {
    ...config.metadata,
    "embedding_dimension": getEmbeddingDimension(),
    "embedding_model": config.embeddingModel,
    "created_by": "AGENTIC",
    "version": config.metadata.version || "6.0"
  };
}

// ============================================================================
// ROUTAGE DYNAMIQUE
// ============================================================================

const TECHNICAL_ZONES: ZoneType[] = [
  'B0_AUXILIAIRES', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE',
  'TG1', 'TG2', 'MAINTENANCE', 'SHARED', 'A0_DIVERS'
];

let technicalKeywordsCache: string[] | null = null;

export function getAllTechnicalKeywords(): string[] {
  if (technicalKeywordsCache) return technicalKeywordsCache;
  
  const keywordsSet = new Set<string>();
  for (const zone of TECHNICAL_ZONES) {
    ZONES_CONFIG[zone]?.keywords.forEach(kw => keywordsSet.add(kw.toLowerCase()));
  }
  technicalKeywordsCache = Array.from(keywordsSet);
  console.log(`[CHROMADB-SCHEMA] ✅ Mots-clés techniques: ${technicalKeywordsCache.length} termes`);
  return technicalKeywordsCache;
}

export function getProcedureKeywords(): string[] {
  return getAllTechnicalKeywords();
}

// Initialisation silencieuse
getAllTechnicalKeywords();