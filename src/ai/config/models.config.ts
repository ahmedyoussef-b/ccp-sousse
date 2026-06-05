//src/ai/config/models.config.ts
/**
 * Configuration des modèles Ollama par type et capacité
 * @version 1.3.0
 * @description Configuration centralisée des modèles LLM avec validation
 * @changes Ajout de ccp-finetuned (modèle fine-tuné industriel)
 */

export interface ModelConfig {
  name: string;
  type: 'embedding' | 'text' | 'thinking' | 'image' | 'code' | 'math';
  capabilities: string[];
  contextLength: number;
  speed: 'fast' | 'medium' | 'slow';
  accuracy: number; // 0-1
  memory: number; // MB
  useCases: string[];
  enabled?: boolean; // Pour activer/désactiver un modèle
}

export const MODELS_CONFIG: Record<string, ModelConfig> = {
  'nomic-embed-text': {
    name: 'nomic-embed-text',
    type: 'embedding',
    capabilities: ['semantic_search', 'similarity', 'clustering'],
    contextLength: 8192,
    speed: 'fast',
    accuracy: 0.92,
    memory: 274,
    useCases: ['recherche_sémantique', 'similarité_documents', 'classification'],
    enabled: true
  },

  /**
   * Modèle fine-tuné CCP - Expert industriel sur CPU
   * RAM optimisée : ~3.5-4 Go
   * Spécialisé dans les procédures et connaissances internes
   */
  'ccp-finetuned': {
    name: 'ccp-finetuned:latest',
    type: 'thinking',
    capabilities: ['technical_analysis', 'industrial_expert', 'procedure_knowledge', 'rag_enhanced'],
    contextLength: 4096,
    speed: 'medium',
    accuracy: 0.94,
    memory: 3800,
    useCases: ['analyse_industrielle', 'support_technique', 'procédures_internes', 'recherche_RH'],
    enabled: true
  },
  
  /**
   * Gemma 4 E2B - Version quantifiée IQ4_XS
   * RAM réduite : 3.5 Go (contre 5-6 Go pour version non quantifiée)
   * Modèle principal pour analyses techniques complexes
   */
  'gemma2:2b': {
    name: 'gemma4:e2b',
    type: 'thinking',
    capabilities: ['technical_analysis', 'reasoning', 'multimodal', 'industrial_expert'],
    contextLength: 128000,
    speed: 'medium',
    accuracy: 0.95,
    memory: 3500,
    useCases: ['analyse_industrielle', 'support_technique', 'tâches_complexes'],
    enabled: true
  },

  'qwen3-vl:8b': {
    name: 'qwen3-vl:8b',
    type: 'image',
    capabilities: ['industrial_vision', 'segmentation', 'diagnosis', 'ocr'],
    contextLength: 32000,
    speed: 'medium',
    accuracy: 0.92,
    memory: 5500,
    useCases: ['vision_industrielle', 'diagnostic_composant', 'analyse_défauts'],
    enabled: true
  },
  
  'tinyllama': {
    name: 'tinyllama',
    type: 'text',
    capabilities: ['fallback', 'low_memory'],
    contextLength: 2048,
    speed: 'fast',
    accuracy: 0.70,
    memory: 600,
    useCases: ['fallback_ram_basse'],
    enabled: true
  },
  
  'llama3:8b': {
    name: 'llama3:8b',
    type: 'thinking',
    capabilities: ['deep_reasoning', 'complex_analysis', 'creative_writing'],
    contextLength: 8192,
    speed: 'slow',
    accuracy: 0.93,
    memory: 4700,
    useCases: ['raisonnement_complexe', 'analyse_approfondie', 'synthèse'],
    enabled: true
  }
};

export const DEFAULT_MODELS = {
  embedding: 'nomic-embed-text',
  text: 'tinyllama', 
  thinking: 'ccp-finetuned', 
  image: 'qwen3-vl:8b', 
  code: 'ccp-finetuned', // Par défaut sur l'expert industriel
  math: 'ccp-finetuned'
};

export const SELECTION_THRESHOLDS = {
  complexitySimple: 0.3,
  complexityMedium: 0.6,
  lengthShort: 100,
  lengthMedium: 500
};

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Récupère la configuration d'un modèle
 */
export function getModelConfig(modelName: string): ModelConfig | undefined {
  // Normaliser le nom (enlever le suffixe :latest si présent)
  const normalized = modelName.replace(/:latest$/, '');
  return MODELS_CONFIG[normalized] || MODELS_CONFIG[modelName];
}

/**
 * Récupère tous les modèles actifs
 */
export function getActiveModels(): ModelConfig[] {
  return Object.values(MODELS_CONFIG).filter(m => m.enabled !== false);
}

import { getAvailableMemoryMB } from '@/lib/utils/performance-optimizer';

/**
 * Sélectionne un modèle en fonction du type, de la complexité et des ressources (RAM)
 */
export function selectModel(
  type: ModelConfig['type'], 
  complexity: number = 0.5,
  availableRAM: number = getAvailableMemoryMB() // Par défaut utilise la RAM réelle
): ModelConfig {
  const candidates = getActiveModels().filter(m => m.type === type);
  
  // 1. Filtrer par RAM disponible si spécifié
  const viableCandidates = availableRAM 
    ? candidates.filter(m => m.memory <= availableRAM)
    : candidates;

  if (viableCandidates.length === 0) {
    // Fallback critique sur TinyLlama si tout échoue
    return MODELS_CONFIG['tinyllama'] || Object.values(MODELS_CONFIG)[0];
  }
  
  // 2. Sélection par complexité sur les candidats viables
  let selected: ModelConfig;
  
  if (complexity < SELECTION_THRESHOLDS.complexitySimple) {
    selected = viableCandidates.find(m => m.speed === 'fast') || viableCandidates[0];
  } else if (complexity > SELECTION_THRESHOLDS.complexityMedium) {
    selected = viableCandidates.sort((a, b) => b.accuracy - a.accuracy)[0];
  } else {
    // Priorité au modèle fine-tuné ccp-finetuned pour l'usage général industriel
    const finetuned = viableCandidates.find(m => m.name.includes('ccp-finetuned'));
    selected = finetuned || viableCandidates[0];
  }

  console.log(`[MODEL-SELECT] Type: ${type}, Complexité: ${complexity}, RAM: ${availableRAM || 'N/A'} MB -> Sélectionné: ${selected.name}`);
  return selected;
}

/**
 * Vérifie si un modèle a une capacité spécifique
 */
export function hasCapability(modelName: string, capability: string): boolean {
  const config = getModelConfig(modelName);
  return config?.capabilities.includes(capability) || false;
}

/**
 * Retourne le nom du modèle Gemma quantifié
 */
export function getGemmaQuantizedModel(): string {
  return MODELS_CONFIG['gemma2:2b']?.name || 'gemma2:2b';
}

/**
 * Retourne le nom du modèle fine-tuné
 */
export function getFinetunedModel(): string {
  return MODELS_CONFIG['ccp-finetuned']?.name || 'ccp-finetuned:latest';
}

// ============================================================================
// EXPORT POUR TESTING
// ============================================================================

export const __testables__ = {
  SELECTION_THRESHOLDS,
  DEFAULT_MODELS
};