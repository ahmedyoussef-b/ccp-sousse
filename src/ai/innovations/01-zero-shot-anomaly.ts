/**
 * Innovation 1 : Détection d'Anomalies Zero-Shot par Sous-Espace Statistique
 * 
 * Principe : L'opérateur fournit 2-3 photos d'un équipement en état normal.
 * Le système extrait les caractéristiques, crée un sous-espace PCA, 
 * et détecte toute déviation comme anomalie.
 * 
 * VERSION MIGRÉE : Persistance SQLite via Core SQLite
 * 
 * @module innovations/zero-shot-anomaly
 * @version 3.0.0 - SQLite Persistence
 */

import { NormalSubspace, AnomalyDetectionResult } from './types';
import { getSQLiteCore } from '../core/sqlite/manager';
import { callGemini, GEMINI_MODELS } from '../providers/gemini-provider';
import { callGroq } from '../providers/groq-provider';
import { callCerebras } from '../providers/cerebras-provider';

// ============================================================================
// FONCTIONS MATHÉMATIQUES (PCA Manuelle)
// ============================================================================

function computeMean(vectors: number[][]): number[] {
  const dim = vectors[0].length;
  const mean = new Array(dim).fill(0);
  
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      mean[i] += vec[i];
    }
  }
  
  for (let i = 0; i < dim; i++) {
    mean[i] /= vectors.length;
  }
  
  return mean;
}

function centerVectors(vectors: number[][], mean: number[]): number[][] {
  return vectors.map(vec => vec.map((v, i) => v - mean[i]));
}

function computeCovariance(centered: number[][]): number[][] {
  const n = centered.length;
  const dim = centered[0].length;
  const cov = Array(dim).fill(0).map(() => Array(dim).fill(0));
  
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += centered[k][i] * centered[k][j];
      }
      cov[i][j] = sum / (n - 1);
      cov[j][i] = cov[i][j];
    }
  }
  
  return cov;
}

function powerIteration(matrix: number[][], numComponents: number = 10): {
  eigenvalues: number[];
  eigenvectors: number[][];
} {
  const dim = matrix.length;
  const eigenvectors: number[][] = [];
  const eigenvalues: number[] = [];
  
  let workingMatrix = matrix.map(row => [...row]);
  
  for (let comp = 0; comp < Math.min(numComponents, dim); comp++) {
    let vector = Array(dim).fill(0).map(() => Math.random());
    
    let norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    vector = vector.map(v => v / norm);
    
    for (let iter = 0; iter < 100; iter++) {
      const newVector = Array(dim).fill(0);
      for (let i = 0; i < dim; i++) {
        for (let j = 0; j < dim; j++) {
          newVector[i] += workingMatrix[i][j] * vector[j];
        }
      }
      
      norm = Math.sqrt(newVector.reduce((s, v) => s + v * v, 0));
      vector = newVector.map(v => v / norm);
      
      if (iter > 10) {
        const diff = vector.reduce((s, v, i) => s + Math.abs(v - (vector[i] || 0)), 0);
        if (diff < 1e-6) break;
      }
    }
    
    const Av = Array(dim).fill(0);
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        Av[i] += matrix[i][j] * vector[j];
      }
    }
    const eigenvalue = vector.reduce((s, v, i) => s + v * Av[i], 0);
    
    eigenvectors.push(vector);
    eigenvalues.push(eigenvalue);
    
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        workingMatrix[i][j] -= eigenvalue * vector[i] * vector[j];
      }
    }
  }
  
  return { eigenvalues, eigenvectors };
}

function computeReconstructionError(
  vector: number[],
  mean: number[],
  components: number[][],
  _eigenvalues: number[]
): number {
  const centered = vector.map((v, i) => v - mean[i]);
  
  let reconstruction = new Array(vector.length).fill(0);
  
  for (let k = 0; k < components.length; k++) {
    const component = components[k];
    
    let projection = 0;
    for (let i = 0; i < centered.length; i++) {
      projection += centered[i] * component[i];
    }
    
    for (let i = 0; i < centered.length; i++) {
      reconstruction[i] += projection * component[i];
    }
  }
  
  let totalError = 0;
  for (let i = 0; i < centered.length; i++) {
    const diff = centered[i] - reconstruction[i];
    totalError += diff * diff;
  }
  
  return Math.sqrt(totalError);
}

// ============================================================================
// CLASSE PRINCIPALE (MIGRÉE SQLite)
// ============================================================================

export class ZeroShotAnomalyDetector {
  private db = getSQLiteCore();
  private cache: Map<string, NormalSubspace> = new Map(); // Cache mémoire pour performances

  constructor() {
    console.log('[ZeroShot] ✅ Service initialisé (mode SQLite)');
    this.loadSubspacesFromSQLite();
  }

  /**
   * Charge les sous-espaces depuis SQLite
   */
  private async loadSubspacesFromSQLite(): Promise<void> {
    try {
      const subspaces = this.db.innovationsTech?.listSubspaces?.('zero_shot') || [];
      
      for (const subspaceInfo of subspaces) {
        if (!subspaceInfo.id) continue;
        const subspace = this.db.innovationsTech?.getSubspace?.(subspaceInfo.id);
        if (subspace && subspace.subspaceData) {
          this.cache.set(subspaceInfo.id, {
            mean: subspace.subspaceData.mean || [],
            components: subspace.subspaceData.components || [],
            explainedVariance: subspace.subspaceData.explainedVariance || [],
            threshold: subspace.subspaceData.threshold || 0.85,
            referenceImages: subspace.referenceImages || [],
            createdAt: subspace.createdAt ? String(subspace.createdAt) : new Date().toISOString()
          });
        }
      }
      
      console.log(`[ZeroShot] ✅ ${this.cache.size} sous-espaces chargés depuis SQLite`);
    } catch (error) {
      console.error('[ZeroShot] Erreur chargement SQLite:', error);
    }
  }

  private async saveSubspaceToSQLite(id: string, subspace: NormalSubspace): Promise<void> {
    try {
      this.db.innovationsTech?.saveSubspace?.({
        id,
        name: id,
        type: 'zero_shot',
        subspaceData: {
          mean: subspace.mean,
          components: subspace.components,
          explainedVariance: subspace.explainedVariance,
          threshold: subspace.threshold
        },
        referenceImages: subspace.referenceImages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: { createdAt: subspace.createdAt }
      });
    } catch (error) {
      console.error('[ZeroShot] Erreur sauvegarde SQLite:', error);
    }
  }

  /**
   * Supprime un sous-espace de SQLite
   */
  private async deleteSubspaceFromSQLite(id: string): Promise<void> {
    try {
      this.db.innovationsTech?.deleteSubspace?.(id);
    } catch (error) {
      console.error('[ZeroShot] Erreur suppression SQLite:', error);
    }
  }

  /**
   * Convertit un Buffer en Blob
   */
  private bufferToBlob(buffer: Buffer): Blob {
    // @ts-ignore
    return new Blob([buffer], { type: 'image/jpeg' });
  }

  /**
   * Extrait les features d'une image via l'API
   */
  private async extractFeaturesViaAPI(imageBuffer: Buffer): Promise<number[]> {
    const formData = new FormData();
    const blob = this.bufferToBlob(imageBuffer);
    formData.append('image', blob);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/vision/extract-features`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Erreur extraction features');
    }

    const data = await response.json();
    return data.features || [];
  }

  private async getImageDataViaAPI(imageId: string): Promise<Record<string, any> | null> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const url = `${baseUrl}/api/vision/images/${imageId}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
  }

  /**
   * Récupère le buffer brut d'une image via l'API
   */
  private async getImageBufferViaAPI(imageId: string): Promise<Buffer | null> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/vision/images/${imageId}?raw=true`);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Crée un sous-espace de normalité à partir d'images de référence
   */
  async createSubspace(
    referenceImageIds: string[],
    options: { name?: string; threshold?: number } = {}
  ): Promise<NormalSubspace> {
    const vectors: number[][] = [];
    
    for (const imageId of referenceImageIds) {
      const imageData = await this.getImageDataViaAPI(imageId);
      if (!imageData) {
        throw new Error(`Image ${imageId} non trouvée`);
      }
      
      let features: number[];
      if (imageData.features) {
        features = imageData.features;
      } else {
        const imageBuffer = await this.getImageBufferViaAPI(imageId);
        if (!imageBuffer) {
          throw new Error(`Buffer de l'image ${imageId} introuvable`);
        }
        features = await this.extractFeaturesViaAPI(imageBuffer);
      }
      
      vectors.push(features);
    }
    
    if (vectors.length < 2) {
      throw new Error('Au moins 2 images de référence sont nécessaires');
    }
    
    const mean = computeMean(vectors);
    const centered = centerVectors(vectors, mean);
    const covariance = computeCovariance(centered);
    
    const numComponents = Math.min(10, vectors[0].length);
    const { eigenvalues, eigenvectors } = powerIteration(covariance, numComponents);
    
    let maxError = 0;
    for (const vec of vectors) {
      const error = computeReconstructionError(vec, mean, eigenvectors, eigenvalues);
      maxError = Math.max(maxError, error);
    }
    const threshold = options.threshold || maxError * 1.5;
    
    const subspace: NormalSubspace = {
      mean,
      components: eigenvectors,
      explainedVariance: eigenvalues,
      threshold,
      referenceImages: referenceImageIds,
      createdAt: new Date().toISOString(),
    };
    
    const id = options.name || `subspace_${Date.now()}`;
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    // Sauvegarde SQLite
    this.cache.set(safeId, subspace);
    await this.saveSubspaceToSQLite(safeId, subspace);
    
    console.log(`[ZeroShot] ✅ Sous-espace "${safeId}" créé avec ${vectors.length} références (SQLite)`);
    
    return subspace;
  }

  /**
   * Détecte si une image présente une anomalie par rapport au sous-espace
   */
  async detectAnomaly(
    imageBuffer: Buffer,
    subspaceId: string
  ): Promise<AnomalyDetectionResult> {
    // Vérifier d'abord dans le cache
    let subspace = this.cache.get(subspaceId);
    
    // Si pas dans cache, charger depuis SQLite
    if (!subspace) {
      const loaded = this.db.innovationsTech?.getSubspace?.(subspaceId);
      if (loaded && loaded.subspaceData) {
        subspace = {
          mean: loaded.subspaceData.mean || [],
          components: loaded.subspaceData.components || [],
          explainedVariance: loaded.subspaceData.explainedVariance || [],
          threshold: loaded.subspaceData.threshold || 0.85,
          referenceImages: loaded.referenceImages || [],
          createdAt: loaded.createdAt ? String(loaded.createdAt) : new Date().toISOString()
        };
        this.cache.set(subspaceId, subspace);
      }
    }
    
    if (!subspace) {
      throw new Error(`Sous-espace "${subspaceId}" non trouvé`);
    }
    
    const features = await this.extractFeaturesViaAPI(imageBuffer);
    
    const reconstructionError = computeReconstructionError(
      features,
      subspace.mean,
      subspace.components,
      subspace.explainedVariance
    );
    
    const safeThreshold = (subspace.threshold > 0) ? subspace.threshold : 0.0001;
    const isAnomaly = reconstructionError > safeThreshold;
    const anomalyScore = Math.min(1, reconstructionError / (safeThreshold * 2));
    
    // Génération du rapport détaillé via Gemini 2.5 Flash
    let report = "";
    try {
      const base64Image = imageBuffer.toString('base64');
      const prompt = `Agis comme un inspecteur industriel expert. J'ai analysé cette image d'équipement avec un modèle mathématique PCA (Zero-Shot Anomaly).
Résultat mathématique:
- Erreur de reconstruction PCA: ${reconstructionError.toFixed(4)}
- Seuil de normalité défini: ${subspace.threshold.toFixed(4)}
- Score d'anomalie calculé: ${Math.round(anomalyScore * 100)}%
- Statut: ${isAnomaly ? 'ANOMALIE DÉTECTÉE' : 'ÉQUIPEMENT NORMAL'}

Rédige un court rapport technique d'inspection (3 à 4 phrases maximum) pour le technicien de maintenance. Explique ce que tu vois sur l'image et confirme le diagnostic mathématique de façon claire et professionnelle. S'il n'y a pas d'anomalie, rassure sur le bon état.`;

      report = await callGemini(prompt, {
        model: GEMINI_MODELS.GEMINI_1_5_FLASH,
        temperature: 0.3,
        maxTokens: 250,
        images: [base64Image]
      });
    } catch (e) {
      console.warn('[ZeroShot] Gemini a échoué, tentative avec Groq (texte uniquement):', e);
      try {
        const promptTextOnly = `Agis comme un inspecteur industriel expert. J'ai analysé cette image d'équipement avec un modèle mathématique PCA (Zero-Shot Anomaly).
Résultat mathématique:
- Erreur de reconstruction PCA: ${reconstructionError.toFixed(4)}
- Seuil de normalité défini: ${subspace.threshold.toFixed(4)}
- Score d'anomalie calculé: ${Math.round(anomalyScore * 100)}%
- Statut: ${isAnomaly ? 'ANOMALIE DÉTECTÉE' : 'ÉQUIPEMENT NORMAL'}

Rédige un court rapport technique d'inspection (3 à 4 phrases maximum) basé sur ces métriques pour le technicien de maintenance. Confirme le diagnostic mathématique de façon claire.`;

        report = await callGroq(promptTextOnly, {
          temperature: 0.3,
          maxTokens: 200
        });
      } catch (groqError) {
        console.warn('[ZeroShot] Groq a échoué, tentative avec Cerebras (Ultra-rapide):', groqError);
        try {
          const promptTextOnly = `Agis comme un inspecteur industriel expert. J'ai analysé cette image d'équipement avec un modèle mathématique PCA (Zero-Shot Anomaly).
Résultat mathématique:
- Erreur de reconstruction PCA: ${reconstructionError.toFixed(4)}
- Seuil de normalité défini: ${subspace.threshold.toFixed(4)}
- Score d'anomalie calculé: ${Math.round(anomalyScore * 100)}%
- Statut: ${isAnomaly ? 'ANOMALIE DÉTECTÉE' : 'ÉQUIPEMENT NORMAL'}

Rédige un court rapport technique d'inspection (3 à 4 phrases maximum) basé sur ces métriques pour le technicien de maintenance. Confirme le diagnostic mathématique de façon claire.`;

          report = await callCerebras(promptTextOnly, {
            temperature: 0.3,
            maxTokens: 200
          });
        } catch (cerebrasError) {
          console.error('[ZeroShot] Échec total du rapport LLM:', cerebrasError);
          report = "Le système mathématique a terminé son analyse mais les modèles d'interprétation (Gemini/Groq/Cerebras) n'ont pas pu générer de rapport détaillé.";
        }
      }
    }
    
    // Enregistrer la détection dans l'historique
    this.db.innovationsTech?.saveAnalysis?.({
      id: `anomaly_${Date.now()}_${subspaceId}`,
      innovationType: 'zero_shot',
      analysisData: { subspaceId, reconstructionError, isAnomaly, anomalyScore, report },
      detectedElements: isAnomaly ? [{ type: 'anomaly', confidence: anomalyScore }] : [],
      suggestedActions: isAnomaly ? ['Vérifier l\'équipement', 'Comparer avec référence'] : []
    });
    
    return {
      isAnomaly,
      anomalyScore,
      threshold: subspace.threshold,
      reconstructionError,
      report
    };
  }

  /**
   * Liste tous les sous-espaces disponibles
   */
  listSubspaces(): Array<{ id: string; name: string; referenceCount: number; createdAt: string }> {
    const subspaces = this.db.innovationsTech?.listSubspaces?.('zero_shot') || [];
    
    // Enrichir avec les données du cache si disponibles
    return subspaces.map(space => {
      const cached = this.cache.get(space.id!);
      return {
        id: space.id || '',
        name: space.name || '',
        referenceCount: cached?.referenceImages?.length || 0,
        createdAt: space.createdAt ? String(space.createdAt) : new Date().toISOString()
      };
    }).filter(space => space.id); // Filter out entries without id
  }

  /**
   * Supprime un sous-espace
   */
  async deleteSubspace(subspaceId: string): Promise<boolean> {
    const exists = this.cache.has(subspaceId) || 
                   this.db.innovationsTech?.getSubspace?.(subspaceId);
    
    if (!exists) {
      return false;
    }
    
    this.cache.delete(subspaceId);
    await this.deleteSubspaceFromSQLite(subspaceId);
    
    console.log(`[ZeroShot] ✅ Sous-espace "${subspaceId}" supprimé (SQLite)`);
    return true;
  }

  /**
   * Ajoute une image de référence à un sous-espace existant
   */
  async addReferenceImage(subspaceId: string, imageId: string): Promise<boolean> {
    const subspace = this.cache.get(subspaceId);
    if (!subspace) {
      return false;
    }
    
    const imageData = await this.getImageDataViaAPI(imageId);
    if (!imageData) {
      return false;
    }
    
    const newReferenceIds = [...subspace.referenceImages, imageId];
    
    try {
      await this.createSubspace(newReferenceIds, { name: subspaceId });
      return true;
    } catch (error) {
      console.error('[ZeroShot] Erreur ajout référence:', error);
      return false;
    }
  }

  /**
   * Rafraîchit le cache depuis SQLite
   */
  async refreshCache(): Promise<void> {
    this.cache.clear();
    await this.loadSubspacesFromSQLite();
  }
}

// Export singleton
export const zeroShotAnomaly = new ZeroShotAnomalyDetector();