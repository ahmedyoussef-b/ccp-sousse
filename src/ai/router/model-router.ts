// src/ai/router/model-router.ts
/**
 * Routeur intelligent pour la sélection automatique des modèles
 * @version 1.1.0
 * @lastUpdated 2026-04-02
 * @changes Correction des DEFAULT_MODELS manquants
 */

import { MODELS_CONFIG, DEFAULT_MODELS, ModelConfig, SELECTION_THRESHOLDS } from '@/ai/config/models.config';
import { detectComplexity, detectQueryType } from '../providers/hybrid-provider';

// Configuration étendue des modèles par défaut
const EXTENDED_DEFAULT_MODELS = {
  ...DEFAULT_MODELS,
  image: 'llava:7b',
  embedding: 'nomic-embed-text'
};

export interface ModelSelection {
  model: string;
  config: ModelConfig;
  reason: string;
  confidence: number;
  alternatives: string[];
}

export interface ContextFeatures {
  queryLength: number;
  complexity: number;
  queryType: string;
  needsReasoning: boolean;
  needsCalculation: boolean;
  hasCode: boolean;
  hasImage: boolean;
  urgency: 'high' | 'medium' | 'low';
}

/**
 * Analyse le contexte de la requête
 */
export async function analyzeContext(query: string, metadata?: any): Promise<ContextFeatures> {
  const complexity = detectComplexity(query);
  const queryType = detectQueryType(query);
  const queryLength = query.length;
  
  let complexityScore = 0.3;
  if (complexity === 'simple') complexityScore = 0.2;
  else if (complexity === 'medium') complexityScore = 0.5;
  else if (complexity === 'complex') complexityScore = 0.8;
  
  const lowerQuery = query.toLowerCase();
  
  return {
    queryLength,
    complexity: complexityScore,
    queryType,
    needsReasoning: lowerQuery.includes('comment') || lowerQuery.includes('pourquoi') || 
                    lowerQuery.includes('analyse') || lowerQuery.includes('explique'),
    needsCalculation: lowerQuery.includes('calcul') || lowerQuery.includes('formule') || 
                      /\d+[\+\-\*\/]\d+/.test(query),
    hasCode: lowerQuery.includes('code') || lowerQuery.includes('programme') || 
             lowerQuery.includes('function') || lowerQuery.includes('class'),
    hasImage: metadata?.hasImage || false,
    urgency: queryLength < 50 ? 'high' : 'medium'
  };
}

/**
 * Sélectionne le modèle le plus adapté selon le contexte
 */
export async function selectOptimalModel(query: string, metadata?: any): Promise<ModelSelection> {
  const context = await analyzeContext(query, metadata);
  
  console.log(`[MODEL-ROUTER] Analyse du contexte:`, context);
  
  let selectedModel: string = EXTENDED_DEFAULT_MODELS.text;
  let reason = '';
  let confidence = 0.7;
  let alternatives: string[] = [];
  
  // Cas 1: Requête avec image
  if (context.hasImage) {
    selectedModel = EXTENDED_DEFAULT_MODELS.image;
    reason = 'Requête contenant une image à analyser';
    confidence = 0.9;
    alternatives = [EXTENDED_DEFAULT_MODELS.thinking, EXTENDED_DEFAULT_MODELS.text];
  }
  
  // Cas 2: Requête de code
  else if (context.hasCode) {
    selectedModel = EXTENDED_DEFAULT_MODELS.code;
    reason = 'Requête liée au développement/code';
    confidence = 0.85;
    alternatives = [EXTENDED_DEFAULT_MODELS.thinking, EXTENDED_DEFAULT_MODELS.math];
  }
  
  // Cas 3: Requête de calcul
  else if (context.needsCalculation) {
    selectedModel = EXTENDED_DEFAULT_MODELS.math;
    reason = 'Requête nécessitant des calculs/formules';
    confidence = 0.88;
    alternatives = [EXTENDED_DEFAULT_MODELS.thinking, EXTENDED_DEFAULT_MODELS.text];
  }
  
  // Cas 4: Requête complexe nécessitant du raisonnement
  else if (context.needsReasoning && context.complexity > 0.6) {
    selectedModel = EXTENDED_DEFAULT_MODELS.thinking;
    reason = 'Requête complexe nécessitant du raisonnement approfondi';
    confidence = 0.85;
    alternatives = [EXTENDED_DEFAULT_MODELS.math, EXTENDED_DEFAULT_MODELS.code];
  }
  
  // Cas 5: Requête longue ou technique
  else if (context.queryLength > SELECTION_THRESHOLDS.lengthMedium || context.queryType === 'procedure') {
    selectedModel = EXTENDED_DEFAULT_MODELS.thinking;
    reason = 'Requête longue ou technique nécessitant une analyse poussée';
    confidence = 0.8;
    alternatives = [EXTENDED_DEFAULT_MODELS.text];
  }
  
  // Cas 6: Requête simple et courte
  else if (context.queryLength < SELECTION_THRESHOLDS.lengthShort && context.complexity < SELECTION_THRESHOLDS.complexitySimple) {
    selectedModel = EXTENDED_DEFAULT_MODELS.text;
    reason = 'Requête simple nécessitant une réponse rapide';
    confidence = 0.95;
    alternatives = [EXTENDED_DEFAULT_MODELS.thinking];
  }
  
  // Cas 7: Requête de recherche sémantique
  else if (context.queryType === 'general' && context.complexity < 0.5) {
    selectedModel = EXTENDED_DEFAULT_MODELS.embedding;
    reason = 'Recherche sémantique recommandée';
    confidence = 0.9;
    alternatives = [EXTENDED_DEFAULT_MODELS.text];
  }
  
  // Cas par défaut
  else {
    selectedModel = EXTENDED_DEFAULT_MODELS.thinking;
    reason = 'Requête standard nécessitant une réponse équilibrée';
    confidence = 0.75;
    alternatives = [EXTENDED_DEFAULT_MODELS.text, EXTENDED_DEFAULT_MODELS.math];
  }
  
  // Vérifier que le modèle sélectionné est disponible
  const config = MODELS_CONFIG[selectedModel];
  if (!config) {
    console.warn(`[MODEL-ROUTER] Modèle ${selectedModel} non configuré, fallback sur ${EXTENDED_DEFAULT_MODELS.text}`);
    return {
      model: EXTENDED_DEFAULT_MODELS.text,
      config: MODELS_CONFIG[EXTENDED_DEFAULT_MODELS.text],
      reason: 'Fallback: modèle par défaut',
      confidence: 0.6,
      alternatives: []
    };
  }
  
  console.log(`[MODEL-ROUTER] ✅ Modèle sélectionné: ${selectedModel} (${reason})`);
  
  return {
    model: selectedModel,
    config,
    reason,
    confidence,
    alternatives
  };
}

/**
 * Sélectionne un modèle de fallback en cas d'échec
 */
export async function getFallbackModel(failedModel: string, query: string): Promise<ModelSelection> {
  console.log(`[MODEL-ROUTER] Recherche fallback pour ${failedModel}`);
  
  // Déterminer le type de fallback selon le modèle qui a échoué
  const failedConfig = MODELS_CONFIG[failedModel];
  
  if (failedConfig?.type === 'embedding') {
    return await selectOptimalModel(query, { fallbackFrom: 'embedding' });
  }
  
  if (failedConfig?.type === 'text') {
    return {
      model: EXTENDED_DEFAULT_MODELS.thinking,
      config: MODELS_CONFIG[EXTENDED_DEFAULT_MODELS.thinking],
      reason: `Fallback: ${failedModel} a échoué, passage à un modèle plus puissant`,
      confidence: 0.7,
      alternatives: [EXTENDED_DEFAULT_MODELS.math, EXTENDED_DEFAULT_MODELS.code]
    };
  }
  
  // Fallback ultime
  return {
    model: EXTENDED_DEFAULT_MODELS.text,
    config: MODELS_CONFIG[EXTENDED_DEFAULT_MODELS.text],
    reason: 'Fallback ultime vers modèle léger',
    confidence: 0.6,
    alternatives: []
  };
}

// Export des modèles étendus
export { EXTENDED_DEFAULT_MODELS };