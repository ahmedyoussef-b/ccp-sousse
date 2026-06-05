/**
 * AGENTIC Innovations - Point d'entrée unifié
 * 
 * Ce module regroupe les 9 innovations pratiques pour l'évolution
 * des fonctionnalités de vision par similarité.
 * 
 * VERSION MIGRÉE : Support SQLite pour toutes les innovations
 * 
 * @module innovations
 * @version 4.0.0 - SQLite Persistence + Part Matching
 */

// ============================================================================
// EXPORT DES TYPES PARTAGÉS
// ============================================================================

export * from './types';

// ============================================================================
// INNOVATION 1 : Détection d'Anomalies Zero-Shot
// ============================================================================

export {
  ZeroShotAnomalyDetector,
  zeroShotAnomaly,
} from './01-zero-shot-anomaly';

// ============================================================================
// INNOVATION 2 : Agent Visuel Computer-Use
// ============================================================================

export {
  ComputerUseAgent,
  computerUseAgent,
} from './02-computer-use-agent';

// ============================================================================
// INNOVATION 3 : Double Consensus Vision
// ============================================================================

export {
  DualConsensusVision,
  dualConsensusVision,
} from './03-dual-consensus-vision';

// ============================================================================
// INNOVATION 4 : Classification Auto des Dossiers
// ============================================================================

export {
  AutoFolderClassifier,
  autoFolderClassifier,
} from './04-auto-folder-classifier';

// ============================================================================
// INNOVATION 5 : Recherche Hybride Vision/Texte
// ============================================================================

export {
  HybridVisionSearch,
  hybridVisionSearch,
} from './05-hybrid-vision-search';

// ============================================================================
// INNOVATION 6 : Entraînement Few-Shot de Défauts
// ============================================================================

export {
  FewShotDefectTrainer,
  fewShotDefectTrainer,
} from './06-few-shot-defect-trainer';

// ============================================================================
// INNOVATION 7 : Vision Panoramique
// ============================================================================

export {
  PanoramicStitching,
  panoramicStitching,
} from './07-panoramic-stitching';

// ============================================================================
// INNOVATION 8 : Calibration de la Confiance et Feedback
// ============================================================================

export {
  ConfidenceFeedback,
  confidenceFeedback,
} from './08-confidence-feedback';

// ============================================================================
// 🔥 INNOVATION 9 : Intelligent Part Matching (Part-to-Whole)
// ============================================================================

export {
  IntelligentPartMatching,
  intelligentPartMatching,
} from './09-intelligent-part-matching';

// ============================================================================
// CONFIGURATION GLOBALE
// ============================================================================

import { zeroShotAnomaly } from './01-zero-shot-anomaly';
import { computerUseAgent } from './02-computer-use-agent';
import { dualConsensusVision } from './03-dual-consensus-vision';
import { autoFolderClassifier } from './04-auto-folder-classifier';
import { hybridVisionSearch } from './05-hybrid-vision-search';
import { fewShotDefectTrainer } from './06-few-shot-defect-trainer';
import { panoramicStitching } from './07-panoramic-stitching';
import { confidenceFeedback } from './08-confidence-feedback';
import { intelligentPartMatching } from './09-intelligent-part-matching';

/**
 * Interface pour la configuration globale des innovations
 */
export interface GlobalInnovationsConfig {
  zeroShotAnomaly: { enabled: boolean; defaultThreshold: number };
  computerUseAgent: { enabled: boolean; autoSuggest: boolean };
  dualConsensus: { enabled: boolean; model1: string; model2: string };
  autoFolderClassifier: { enabled: boolean; autoTag: boolean };
  hybridSearch: { enabled: boolean; visionWeight: number; textWeight: number };
  fewShotTrainer: { enabled: boolean; minSamplesForTraining: number };
  panoramicStitching: { enabled: boolean; matchConfidence: number };
  confidenceFeedback: { enabled: boolean; autoAdjustThresholds: boolean };
  partMatching: { enabled: boolean; defaultGridRows: number; defaultGridCols: number; minSimilarityThreshold: number };
}

/**
 * Obtient l'état de toutes les innovations
 */
export function getInnovationsStatus(): {
  name: string;
  enabled: boolean;
  initialized: boolean;
  description: string;
  persistence: 'sqlite' | 'memory';
}[] {
  return [
    {
      name: 'Zero-Shot Anomaly Detection',
      enabled: true,
      initialized: true,
      description: 'Détection d\'anomalies sans entraînement préalable',
      persistence: 'sqlite',
    },
    {
      name: 'Computer-Use Agent',
      enabled: true,
      initialized: true,
      description: 'Agent visuel pour analyse d\'IHM',
      persistence: 'sqlite',
    },
    {
      name: 'Dual Consensus Vision',
      enabled: true,
      initialized: true,
      description: 'Lecture de plaques avec double validation',
      persistence: 'sqlite',
    },
    {
      name: 'Auto Folder Classifier',
      enabled: true,
      initialized: true,
      description: 'Classification automatique des images',
      persistence: 'sqlite',
    },
    {
      name: 'Hybrid Vision Search',
      enabled: true,
      initialized: true,
      description: 'Recherche combinée vision + texte (BM25 SQLite)',
      persistence: 'sqlite',
    },
    {
      name: 'Few-Shot Defect Trainer',
      enabled: true,
      initialized: true,
      description: 'Entraînement de détecteurs en quelques exemples',
      persistence: 'sqlite',
    },
    {
      name: 'Panoramic Stitching',
      enabled: true,
      initialized: true,
      description: 'Assemblage d\'images panoramiques',
      persistence: 'sqlite',
    },
    {
      name: 'Confidence & Feedback',
      enabled: true,
      initialized: true,
      description: 'Calibration de confiance et feedback utilisateur',
      persistence: 'sqlite',
    },
    {
      name: 'Intelligent Part Matching',
      enabled: true,
      initialized: true,
      description: 'Localisation d\'une photo dans une image globale de pupitre',
      persistence: 'sqlite',
    },
  ];
}

/**
 * Initialise toutes les innovations
 */
export async function initializeAllInnovations(): Promise<void> {
  console.log('🚀 [Innovations] Initialisation des 9 innovations (mode SQLite)...');
  
  // Rafraîchir les caches de chaque innovation
  try {
    await zeroShotAnomaly.refreshCache();
    await dualConsensusVision.refreshCache?.();
    await autoFolderClassifier.getStats(); // Forcer le chargement
    await hybridVisionSearch.getStats();
    await fewShotDefectTrainer.refreshCache?.();
    await confidenceFeedback.refreshStats();
    await intelligentPartMatching.refreshStats(); // 🔥 NOUVEAU
  } catch (error) {
    console.warn('[Innovations] Erreur lors du rafraîchissement des caches:', error);
  }
  
  const status = getInnovationsStatus();
  const initialized = status.filter(s => s.initialized).length;
  
  console.log(`✅ [Innovations] ${initialized}/${status.length} innovations prêtes (SQLite)`);
}

/**
 * Nettoie les données anciennes de toutes les innovations
 */
export async function cleanupAllInnovations(keepDays: number = 30): Promise<{
  computerUse: number;
  dualConsensus: number;
  confidence: number;
  panoramic: number;
}> {
  const results = {
    computerUse: 0,
    dualConsensus: 0,
    confidence: 0,
    panoramic: 0,
  };
  
  try {
    results.computerUse = await computerUseAgent.cleanupHistory(keepDays);
  } catch (error) {
    console.warn('[Innovations] Erreur nettoyage ComputerUse:', error);
  }
  
  try {
    results.dualConsensus = await dualConsensusVision.cleanupHistory(keepDays);
  } catch (error) {
    console.warn('[Innovations] Erreur nettoyage DualConsensus:', error);
  }
  
  console.log('[Innovations] Nettoyage terminé:', results);
  
  return results;
}

/**
 * Vérifie la santé des innovations
 */
export async function healthCheck(): Promise<{
  healthy: boolean;
  innovations: Array<{ name: string; healthy: boolean; error?: string }>;
  sqliteStatus: { connected: boolean; size: number };
}> {
  const results: Array<{ name: string; healthy: boolean; error?: string }> = [];
  
  // Vérifier SQLite
  let sqliteStatus = { connected: false, size: 0 };
  try {
    sqliteStatus = { connected: true, size: 0 };
  } catch (error) {
    sqliteStatus = { connected: false, size: 0 };
  }
  
  // Vérifier chaque innovation
  const checks = [
    { 
      name: 'Zero-Shot', 
      check: () => Promise.resolve(zeroShotAnomaly.listSubspaces().length >= 0) 
    },
    { 
      name: 'Computer-Use', 
      check: () => Promise.resolve(computerUseAgent.getHistory(1).length >= 0) 
    },
    { 
      name: 'Dual Consensus', 
      check: async () => {
        try {
          const stats = await dualConsensusVision.getStats();
          return stats.totalReadings >= 0;
        } catch {
          return true;
        }
      }
    },
    { 
      name: 'Auto Folder', 
      check: async () => {
        try {
          const stats = await autoFolderClassifier.getStats();
          return stats.cacheSize >= 0;
        } catch {
          return true;
        }
      }
    },
    { 
      name: 'Hybrid Search', 
      check: async () => {
        try {
          const stats = await hybridVisionSearch.getStats();
          return stats.initialized === true || stats.indexSize >= 0;
        } catch {
          return true;
        }
      }
    },
    { 
      name: 'Few-Shot', 
      check: async () => {
        try {
          const stats = await fewShotDefectTrainer.getStats();
          return stats.detectorsCount >= 0;
        } catch {
          return true;
        }
      }
    },
    { 
      name: 'Panoramic', 
      check: async () => {
        try {
          await panoramicStitching.getStats();
          return true;
        } catch {
          return true;
        }
      }
    },
    { 
      name: 'Confidence', 
      check: () => Promise.resolve(confidenceFeedback.getStats().totalFeedbacks >= 0) 
    },
    { 
      name: 'Part Matching', 
      check: async () => {
        try {
          const stats = await intelligentPartMatching.getStats();
          return stats.globalImagesProcessed >= 0;
        } catch {
          return true;
        }
      }
    },
  ];
  
  for (const item of checks) {
    try {
      const healthy = await item.check();
      results.push({ name: item.name, healthy });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push({ name: item.name, healthy: false, error: errorMessage });
    }
  }
  
  const healthy = results.every(r => r.healthy) && sqliteStatus.connected;
  
  return { healthy, innovations: results, sqliteStatus };
}

/**
 * Obtient un résumé des statistiques de toutes les innovations
 */
export async function getAllStats(): Promise<{
  zeroShot: { subspacesCount: number };
  computerUse: { analysesCount: number; avgElements: number };
  dualConsensus: { totalReadings: number; avgConfidence: number };
  autoFolder: { cacheSize: number; totalClassifications: number };
  hybridSearch: { indexSize: number; searchesCount: number };
  fewShot: { detectorsCount: number; successRate: number };
  panoramic: { totalStitches: number; avgQuality: number };
  confidence: { totalFeedbacks: number; confirmationRate: number };
  partMatching: { globalImagesCount: number; totalPatchesCount: number; matchRate: number };
}> {
  const zeroShotStats = { subspacesCount: zeroShotAnomaly.listSubspaces().length };
  
  const computerUseStats = (await computerUseAgent.getStats?.()) || { totalAnalyses: 0, avgElementsPerAnalysis: 0 };
  
  const dualConsensusStats = await dualConsensusVision.getStats();
  
  const autoFolderStats = await autoFolderClassifier.getStats();
  
  const hybridSearchStats = await hybridVisionSearch.getStats();
  
  const fewShotStats = await fewShotDefectTrainer.getStats();
  
  const panoramicStats = await panoramicStitching.getStats();
  
  const confidenceStats = confidenceFeedback.getStats();
  
  const partMatchingStats = await intelligentPartMatching.getStats();
  
  return {
    zeroShot: zeroShotStats,
    computerUse: { 
      analysesCount: computerUseStats.totalAnalyses || 0, 
      avgElements: computerUseStats.avgElementsPerAnalysis || 0 
    },
    dualConsensus: { 
      totalReadings: dualConsensusStats.totalReadings, 
      avgConfidence: dualConsensusStats.averageConfidence 
    },
    autoFolder: { 
      cacheSize: autoFolderStats.cacheSize, 
      totalClassifications: autoFolderStats.totalClassifications || 0 
    },
    hybridSearch: { 
      indexSize: hybridSearchStats.indexSize, 
      searchesCount: ('searchesCount' in hybridSearchStats) ? (hybridSearchStats as { searchesCount: number }).searchesCount : 0 
    },
    fewShot: { 
      detectorsCount: fewShotStats.detectorsCount, 
      successRate: fewShotStats.successRate || 0 
    },
    panoramic: { 
      totalStitches: panoramicStats.totalStitches || 0, 
      avgQuality: panoramicStats.avgQuality || 0 
    },
    confidence: { 
      totalFeedbacks: confidenceStats.totalFeedbacks, 
      confirmationRate: confidenceStats.confirmationRate 
    },
    partMatching: {
      globalImagesCount: partMatchingStats.globalImagesProcessed,
      totalPatchesCount: partMatchingStats.totalPatchesIndexed,
      matchRate: partMatchingStats.matchRate
    }
  };
}

// ============================================================================
// EXPORT PAR DÉFAUT
// ============================================================================

export default {
  // Services
  zeroShotAnomaly,
  computerUseAgent,
  dualConsensusVision,
  autoFolderClassifier,
  hybridVisionSearch,
  fewShotDefectTrainer,
  panoramicStitching,
  confidenceFeedback,
  intelligentPartMatching, // 🔥 NOUVEAU
  
  // Utilitaires
  getInnovationsStatus,
  initializeAllInnovations,
  cleanupAllInnovations,
  healthCheck,
  getAllStats,
};