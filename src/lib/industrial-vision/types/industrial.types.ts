// src/lib/industrial-vision/types/industrial.types.ts

export interface OrganePosition {
  nom: string;
  bbox: [number, number, number, number]; // x1, y1, x2, y2
  texte?: string;
  confiance: number;
}

export interface VoyantState {
  organe: string;
  couleur: 'vert' | 'jaune' | 'rouge' | 'eteint';
  timestamp: number;
}

export interface MesureCadran {
  organe: string;
  valeur: number;
  unite: string;
  angle: number;
  timestamp: number;
}

export interface ReferenceImage {
  id: string;
  nom: string;
  type: 'marche_normale' | 'arret_normale' | 'defaut';
  chemin: string;
  metadata: any;
  features: number[];
  fileHash?: string;
  organes: OrganePosition[];
  voyants: VoyantState[];
  mesures: MesureCadran[];
}

export interface AnalyseResult {
  imageAnalysee: string;
  timestamp: number;
  etatGlobal: 'normal' | 'attention' | 'alerte' | 'critique';
  voyantsDetectes: VoyantState[];
  mesuresLues: MesureCadran[];
  incoherences: string[];
  tendances: any[];
  evenements: any[];
  similariteReference: {
    arret_normale: number;
    marche_normale: number;
    marche: number;
    arret: number;
    defaut: number;
  };
  diagnostic: string;
  recommandations: string[];
}

export interface IndustrialVisionConfig {
  referencesPath: string;
  capturesPath: string;
  seuils: {
    similariteMarche: number;
    similariteArret: number;
    similariteDefaut: number;
    pressionMax: number;
    temperatureMax: number;
  };
}

export interface Innovation {
  id: number;
  name: string;
  level: number;
  description: string;
  keywords: string[];
  categories: string[];
  requiresData: ('voyants' | 'cadrans' | 'organes' | 'features' | 'temporal')[];
  confidence: number;
}

export interface InnovationDetectionResult {
  id(id: any, userQuery: string): unknown;
  innovationId: number;
  innovationName: string;
  score: number;
  matchedKeywords: string[];
  category: string;
  reason: string;
}

export interface PlannedAction {
  innovationId: number;
  priority: number;
  needsAnalysis: boolean;
  params: Record<string, any>;
  estimatedTokens: number;
}

export interface UserIntent {
  primary: string;
  secondary: string[];
  entities: string[];
  confidence: number;
}