/**
 * Innovation 6 : Entraînement Local de Défauts (Few-Shot Learning)
 * 
 * Principe : Permettre à l'opérateur d'apprendre à l'IA un nouveau défaut visuel
 * en quelques clics, sans code, en utilisant 5-10 images d'exemple.
 * 
 * VERSION MIGRÉE : Persistance SQLite via Core SQLite
 * 
 * @module innovations/few-shot-defect-trainer
 * @version 3.0.0 - SQLite Persistence
 */

import { zeroShotAnomaly } from './01-zero-shot-anomaly';
import { DefectDetector, TrainDefectResult } from './types';
import { getSQLiteCore } from '../core/sqlite/manager';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
  enabled: true,
  minSamplesForTraining: 3,
  autoValidate: true,
  validationSplit: 0.2,
};

// ============================================================================
// TYPES INTERNES
// ============================================================================

interface TrainingSession {
  id: string;
  defectName: string;
  description: string;
  positiveSamples: string[];
  negativeSamples: string[];
  createdAt: string;
  status: 'collecting' | 'training' | 'completed' | 'failed';
}

// ============================================================================
// CLASSE PRINCIPALE (MIGRÉE SQLite)
// ============================================================================

export class FewShotDefectTrainer {
  private config = DEFAULT_CONFIG;
  private db = getSQLiteCore();
  private detectorsCache: Map<string, DefectDetector> = new Map();
  private sessionsCache: Map<string, TrainingSession> = new Map();

  constructor() {
    console.log('[FewShot] ✅ Service initialisé (mode SQLite)');
    this.loadFromSQLite();
  }

  /**
   * Charge les données depuis SQLite
   */
  private async loadFromSQLite(): Promise<void> {
    try {
      // Charger les détecteurs
      const detectors = this.db.innovations?.listSubspaces?.('defect_detector') || [];
      for (const detectorInfo of detectors) {
        if (!detectorInfo.id) continue;
        const subspace = this.db.innovations?.getSubspace?.(detectorInfo.id);
        if (subspace) {
          const detector: DefectDetector = {
            id: detectorInfo.id,
            name: detectorInfo.name || '',
            description: subspace.metadata?.description || '',
            referenceImageIds: subspace.referenceImages || [],
            subspace: {
              mean: subspace.mean || [],
              components: subspace.components || [],
              explainedVariance: subspace.explainedVariance || [],
              threshold: subspace.threshold || 0.85,
              referenceImages: subspace.referenceImages || [],
              createdAt: subspace.createdAt ? String(subspace.createdAt) : new Date().toISOString()
            },
            createdAt: subspace.createdAt ? String(subspace.createdAt) : new Date().toISOString(),
            updatedAt: subspace.updatedAt ? String(subspace.updatedAt) : new Date().toISOString(),
            sampleCount: subspace.referenceImages?.length || 0
          };
          this.detectorsCache.set(detectorInfo.id, detector);
        }
      }
      
      // Charger les sessions d'entraînement
      const sessions = this.db.innovations?.listTrainingSessions?.() || [];
      for (const session of sessions) {
        this.sessionsCache.set(session.id, {
          id: session.id,
          defectName: session.defectName,
          description: session.description || '',
          positiveSamples: session.positiveSamples || [],
          negativeSamples: session.negativeSamples || [],
          createdAt: session.createdAt ? new Date(session.createdAt).toISOString() : new Date().toISOString(),
          status: session.status === 'pending' ? 'collecting' : session.status === 'processing' ? 'training' : session.status
        });
      }
      
      console.log(`[FewShot] ✅ ${this.detectorsCache.size} détecteurs, ${this.sessionsCache.size} sessions chargés depuis SQLite`);
    } catch (error) {
      console.error('[FewShot] Erreur chargement SQLite:', error);
    }
  }

  /**
   * Sauvegarde une session dans SQLite
   */
  private async saveSessionToSQLite(session: TrainingSession): Promise<void> {
    try {
      this.db.innovations?.saveTrainingSession?.({
        id: session.id,
        defectName: session.defectName,
        description: session.description,
        positiveSamples: session.positiveSamples,
        negativeSamples: session.negativeSamples,
        status: (session.status === 'collecting' || session.status === 'training') ? 'processing' : session.status,
        detectorId: session.status === 'completed' ? session.id : undefined,
        createdAt: new Date(session.createdAt).getTime()
      });
    } catch (error) {
      console.error('[FewShot] Erreur sauvegarde session SQLite:', error);
    }
  }

  /**
   * Sauvegarde un détecteur dans SQLite
   */
  private async saveDetectorToSQLite(detector: DefectDetector): Promise<void> {
    try {
      this.db.innovations?.saveSubspace?.(detector.id, {
        id: detector.id,
        name: detector.name,
        type: 'defect_detector',
        mean: detector.subspace.mean,
        components: detector.subspace.components,
        explainedVariance: detector.subspace.explainedVariance,
        threshold: detector.subspace.threshold,
        referenceImages: detector.referenceImageIds,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          description: detector.description,
          sampleCount: detector.sampleCount
        }
      });
      
      // Mettre à jour le statut de la session associée
      if (detector.id.startsWith('defect_')) {
        this.db.innovations?.updateTrainingSessionStatus?.(detector.id, 'completed', detector.id);
      }
    } catch (error) {
      console.error('[FewShot] Erreur sauvegarde détecteur SQLite:', error);
    }
  }

  /**
   * Supprime un détecteur de SQLite
   */
  private async deleteDetectorFromSQLite(detectorId: string): Promise<void> {
    try {
      this.db.innovations?.deleteSubspace?.(detectorId);
    } catch (error) {
      console.error('[FewShot] Erreur suppression détecteur SQLite:', error);
    }
  }

  /**
   * Supprime une session de SQLite
   */
  private async deleteSessionFromSQLite(sessionId: string): Promise<void> {
    try {
      this.db.getDB().prepare(`
        DELETE FROM innovation_training_sessions WHERE id = ?
      `).run(sessionId);
    } catch (error) {
      console.error('[FewShot] Erreur suppression session SQLite:', error);
    }
  }

  /**
   * Récupère les données d'une image via l'API
   */
  private async getImageDataViaAPI(imageId: string): Promise<Record<string, any> | null> {
    const response = await fetch(`/api/vision/images/${imageId}`);
    if (!response.ok) return null;
    return response.json();
  }

  /**
   * Crée une nouvelle session d'entraînement
   */
  async createTrainingSession(defectName: string, description: string): Promise<TrainingSession> {
    const id = `defect_${Date.now()}_${defectName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    
    const session: TrainingSession = {
      id,
      defectName,
      description,
      positiveSamples: [],
      negativeSamples: [],
      createdAt: new Date().toISOString(),
      status: 'collecting',
    };
    
    this.sessionsCache.set(id, session);
    await this.saveSessionToSQLite(session);
    
    // Enregistrer la métrique
    await this.db.recordMetric('few_shot', 'session_created', 1);
    
    console.log(`[FewShot] Session créée : ${defectName} (${id}) (SQLite)`);
    
    return session;
  }

  /**
   * Ajoute un échantillon positif
   */
  async addPositiveSample(sessionId: string, imageId: string): Promise<boolean> {
    const session = this.sessionsCache.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} non trouvée`);
    if (session.status !== 'collecting') throw new Error(`Session non en mode collecte`);
    
    const imageData = await this.getImageDataViaAPI(imageId);
    if (!imageData) throw new Error(`Image ${imageId} non trouvée`);
    
    if (!session.positiveSamples.includes(imageId)) {
      session.positiveSamples.push(imageId);
      this.sessionsCache.set(sessionId, session);
      await this.saveSessionToSQLite(session);
      await this.db.recordMetric('few_shot', 'positive_sample_added', 1);
    }
    
    console.log(`[FewShot] Échantillon positif ajouté : ${imageId} (SQLite)`);
    return true;
  }

  /**
   * Ajoute un échantillon négatif
   */
  async addNegativeSample(sessionId: string, imageId: string): Promise<boolean> {
    const session = this.sessionsCache.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} non trouvée`);
    if (session.status !== 'collecting') throw new Error(`Session non en mode collecte`);
    
    const imageData = await this.getImageDataViaAPI(imageId);
    if (!imageData) throw new Error(`Image ${imageId} non trouvée`);
    
    if (!session.negativeSamples.includes(imageId)) {
      session.negativeSamples.push(imageId);
      this.sessionsCache.set(sessionId, session);
      await this.saveSessionToSQLite(session);
      await this.db.recordMetric('few_shot', 'negative_sample_added', 1);
    }
    
    console.log(`[FewShot] Échantillon négatif ajouté : ${imageId} (SQLite)`);
    return true;
  }

  /**
   * Ajoute plusieurs échantillons à la fois
   */
  async addSamples(
    sessionId: string,
    positiveImageIds: string[],
    negativeImageIds: string[]
  ): Promise<{ positiveAdded: number; negativeAdded: number }> {
    let positiveAdded = 0;
    let negativeAdded = 0;
    
    for (const id of positiveImageIds) {
      try {
        await this.addPositiveSample(sessionId, id);
        positiveAdded++;
      } catch (e) {
        console.warn(`[FewShot] Erreur ajout positif ${id}:`, e);
      }
    }
    
    for (const id of negativeImageIds) {
      try {
        await this.addNegativeSample(sessionId, id);
        negativeAdded++;
      } catch (e) {
        console.warn(`[FewShot] Erreur ajout négatif ${id}:`, e);
      }
    }
    
    return { positiveAdded, negativeAdded };
  }

  /**
   * Lance l'entraînement du détecteur
   */
  async trainDetector(sessionId: string): Promise<TrainDefectResult> {
    const session = this.sessionsCache.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} non trouvée`);
    
    const minSamples = this.config.minSamplesForTraining;
    
    if (session.positiveSamples.length < minSamples) {
      throw new Error(`Pas assez d'échantillons positifs (${session.positiveSamples.length}/${minSamples})`);
    }
    
    if (session.negativeSamples.length < minSamples) {
      throw new Error(`Pas assez d'échantillons négatifs (${session.negativeSamples.length}/${minSamples})`);
    }
    
    console.log(`[FewShot] 🎯 Démarrage entraînement : ${session.defectName}`);
    session.status = 'training';
    this.sessionsCache.set(sessionId, session);
    await this.saveSessionToSQLite(session);
    
    try {
      const allImageIds = [...session.positiveSamples, ...session.negativeSamples];
      const subspaceId = sessionId;
      
      let validationScore: number | undefined;
      
      // Créer le sous-espace avec les échantillons négatifs
      const finalSubspace = await zeroShotAnomaly.createSubspace(session.negativeSamples, {
        name: subspaceId,
      });
      
      const detector: DefectDetector = {
        id: sessionId,
        name: session.defectName,
        description: session.description,
        referenceImageIds: allImageIds,
        subspace: finalSubspace,
        createdAt: session.createdAt,
        updatedAt: new Date().toISOString(),
        sampleCount: session.positiveSamples.length + session.negativeSamples.length,
      };
      
      this.detectorsCache.set(sessionId, detector);
      await this.saveDetectorToSQLite(detector);
      
      session.status = 'completed';
      this.sessionsCache.set(sessionId, session);
      await this.saveSessionToSQLite(session);
      
      // Enregistrer les métriques
      await this.db.recordMetric('few_shot', 'training_success', 1);
      await this.db.recordMetric('few_shot', 'samples_count', detector.sampleCount);
      
      console.log(`[FewShot] ✅ Détecteur "${session.defectName}" entraîné avec succès (SQLite)`);
      
      return {
        success: true,
        detectorId: sessionId,
        message: `Détecteur entraîné avec ${detector.sampleCount} échantillons`,
        validationScore,
      };
      
    } catch (error) {
      session.status = 'failed';
      this.sessionsCache.set(sessionId, session);
      await this.saveSessionToSQLite(session);
      
      await this.db.recordMetric('few_shot', 'training_failed', 1);
      
      console.error('[FewShot] Échec entraînement:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        detectorId: sessionId,
        message: `Échec entraînement: ${errorMessage}`,
      };
    }
  }

  /**
   * Détecte un défaut sur une image
   */
  async detectDefect(
    imageBuffer: Buffer,
    detectorId: string
  ): Promise<{
    detected: boolean;
    confidence: number;
    defectName: string;
    threshold: number;
    reconstructionError: number;
  }> {
    const detector = this.detectorsCache.get(detectorId);
    if (!detector) throw new Error(`Détecteur ${detectorId} non trouvé`);
    
    const result = await zeroShotAnomaly.detectAnomaly(imageBuffer, detector.id);
    
    // Enregistrer la détection
    if (result.isAnomaly) {
      await this.db.recordMetric('few_shot', 'defect_detected', 1);
      await this.db.recordMetric('few_shot', 'defect_confidence', result.anomalyScore);
    }
    
    return {
      detected: result.isAnomaly,
      confidence: result.anomalyScore,
      defectName: detector.name,
      threshold: result.threshold,
      reconstructionError: result.reconstructionError,
    };
  }

  /**
   * Détecte parmi tous les détecteurs disponibles
   */
  async detectAnyDefect(imageBuffer: Buffer): Promise<Array<{
    detectorId: string;
    defectName: string;
    detected: boolean;
    confidence: number;
  }>> {
    const results: Array<{
      detectorId: string;
      defectName: string;
      detected: boolean;
      confidence: number;
    }> = [];
    
    for (const [id, detector] of this.detectorsCache.entries()) {
      try {
        const result = await zeroShotAnomaly.detectAnomaly(imageBuffer, detector.id);
        results.push({
          detectorId: id,
          defectName: detector.name,
          detected: result.isAnomaly,
          confidence: result.anomalyScore,
        });
      } catch (error) {
        console.warn(`[FewShot] Erreur détection ${detector.name}:`, error);
      }
    }
    
    results.sort((a, b) => b.confidence - a.confidence);
    return results;
  }

  /**
   * Liste les détecteurs
   */
  listDetectors(): DefectDetector[] {
    return Array.from(this.detectorsCache.values());
  }

  /**
   * Liste les sessions
   */
  listSessions(): TrainingSession[] {
    return Array.from(this.sessionsCache.values());
  }

  /**
   * Obtient un détecteur par ID
   */
  getDetector(detectorId: string): DefectDetector | undefined {
    return this.detectorsCache.get(detectorId);
  }

  /**
   * Obtient une session par ID
   */
  getSession(sessionId: string): TrainingSession | undefined {
    return this.sessionsCache.get(sessionId);
  }

  /**
   * Supprime un détecteur
   */
  async deleteDetector(detectorId: string): Promise<boolean> {
    const deleted = this.detectorsCache.delete(detectorId);
    if (deleted) {
      await zeroShotAnomaly.deleteSubspace(detectorId);
      await this.deleteDetectorFromSQLite(detectorId);
      await this.db.recordMetric('few_shot', 'detector_deleted', 1);
      console.log(`[FewShot] Détecteur ${detectorId} supprimé (SQLite)`);
    }
    return deleted;
  }

  /**
   * Supprime une session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const deleted = this.sessionsCache.delete(sessionId);
    if (deleted) {
      await this.deleteSessionFromSQLite(sessionId);
      console.log(`[FewShot] Session ${sessionId} supprimée (SQLite)`);
    }
    return deleted;
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(updates: Partial<typeof DEFAULT_CONFIG>): void {
    this.config = { ...this.config, ...updates };
    console.log('[FewShot] Configuration mise à jour');
  }

  /**
   * Obtient les statistiques
   */
  async getStats(): Promise<{
    detectorsCount: number;
    sessionsCount: number;
    activeSessions: number;
    config: typeof DEFAULT_CONFIG;
    totalTrainings: number;
    successRate: number;
  }> {
    const activeSessions = Array.from(this.sessionsCache.values())
      .filter(s => s.status === 'collecting').length;
    
    // Récupérer les métriques depuis SQLite
    const totalTrainings = this.db.getMetricStats('few_shot', 'training_success');
    const failedTrainings = this.db.getMetricStats('few_shot', 'training_failed');
    const total = totalTrainings.count + failedTrainings.count;
    const successRate = total > 0 ? totalTrainings.count / total : 0;
    
    return {
      detectorsCount: this.detectorsCache.size,
      sessionsCount: this.sessionsCache.size,
      activeSessions,
      config: this.config,
      totalTrainings: total,
      successRate
    };
  }

  /**
   * Exporte un détecteur
   */
  async exportDetector(detectorId: string): Promise<string> {
    const detector = this.detectorsCache.get(detectorId);
    if (!detector) throw new Error(`Détecteur ${detectorId} non trouvé`);
    return JSON.stringify(detector, null, 2);
  }

  /**
   * Importe un détecteur
   */
  async importDetector(jsonData: string): Promise<DefectDetector> {
    const detector: DefectDetector = JSON.parse(jsonData);
    this.detectorsCache.set(detector.id, detector);
    await this.saveDetectorToSQLite(detector);
    console.log(`[FewShot] Détecteur "${detector.name}" importé (SQLite)`);
    return detector;
  }

  /**
   * Rafraîchit le cache depuis SQLite
   */
  async refreshCache(): Promise<void> {
    this.detectorsCache.clear();
    this.sessionsCache.clear();
    await this.loadFromSQLite();
  }
}

// Export singleton
export const fewShotDefectTrainer = new FewShotDefectTrainer();