/**
 * Innovation 8 : Calibration de la Confiance et Vérification Humaine
 * 
 * Principe : Afficher un score de fiabilité pour chaque prédiction et
 * permettre à l'opérateur de donner un feedback simple (👍/👎).
 * 
 * VERSION MIGRÉE : Persistance SQLite via Core SQLite
 * 
 * @module innovations/confidence-feedback
 * @version 3.0.0 - SQLite Persistence
 */

import { ConfidenceMetadata, FeedbackStats } from './types';
import { getSQLiteCore } from '../core/sqlite/manager';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
  enabled: true,
  storeFeedbackLocally: true,
  autoAdjustThresholds: true,
  minFeedbacksForAdjustment: 10,
  adjustmentRate: 0.05,
};

// ============================================================================
// TYPES INTERNES
// ============================================================================

interface ExistingFeedback {
  id: string;
  messageId: string;
  question: string;
  answer: string;
  rating: number;
  timestamp: string;
  processed: boolean;
  modelVersion: string;
}

interface VisionFeedbackExtended extends ExistingFeedback {
  feedbackType: 'vision_search' | 'vision_diagnostic';
  imageId?: string;
  predictionId?: string;
  similarityScore?: number;
  confidenceScore?: number;
  userFeedback?: 'confirm' | 'correct' | 'reject';
  correction?: string;
}

interface ConfidenceThresholds {
  high: number;
  medium: number;
  low: number;
}

// ============================================================================
// CLASSE PRINCIPALE (MIGRÉE SQLite)
// ============================================================================

export class ConfidenceFeedback {
  private config = DEFAULT_CONFIG;
  private db = getSQLiteCore();
  private thresholds: ConfidenceThresholds = {
    high: 0.95,   // Correspondance certaine (Information fiable à 100%)
    medium: 0.90, // Correspondance stricte (Plaque signalétique probable)
    low: 0.80,    // Correspondance suspecte
  };

  private stats: FeedbackStats = {
    totalFeedbacks: 0,
    confirmationRate: 0,
    correctionRate: 0,
    rejectionRate: 0,
    averageConfidenceWhenCorrect: 0,
    averageConfidenceWhenWrong: 0,
    thresholdRecommendations: {
      high: 0.95,
      medium: 0.90,
      low: 0.80,
    },

  };
  private feedbacksCache: VisionFeedbackExtended[] = [];

  constructor() {
    console.log('[Confidence] ✅ Service initialisé (mode SQLite)');
    this.loadFromSQLite();
    this.loadThresholdsFromSQLite();
  }

  /**
   * Charge les seuils depuis SQLite
   */
  private async loadThresholdsFromSQLite(): Promise<void> {
    try {
      const savedThresholds = this.db.innovations?.getLatestThresholds?.('confidence');
      if (savedThresholds) {
        this.thresholds = savedThresholds;
        this.stats.thresholdRecommendations = savedThresholds;
        console.log('[Confidence] ✅ Seuils chargés depuis SQLite');
      }
    } catch (error) {
      console.error('[Confidence] Erreur chargement seuils:', error);
    }
  }

  /**
   * Sauvegarde les seuils dans SQLite
   */
  private async saveThresholdsToSQLite(): Promise<void> {
    try {
      this.db.innovations?.saveThresholds?.('confidence', this.thresholds);
    } catch (error) {
      console.error('[Confidence] Erreur sauvegarde seuils:', error);
    }
  }

  /**
   * Charge les données depuis SQLite
   */
  private async loadFromSQLite(): Promise<void> {
    try {
      // Charger les feedbacks depuis SQLite
      const feedbacks = this.db.getDB().prepare(`
        SELECT * FROM innovation_feedback 
        WHERE innovation_type = 'vision_search' OR innovation_type = 'vision_diagnostic'
        ORDER BY created_at DESC
        LIMIT 1000
      `).all() as Record<string, unknown>[];
      
      this.feedbacksCache = feedbacks.map((f) => ({
        id: String(f.id),
        messageId: String(f.prediction_id),
        question: `[VISION] Recherche similarité - Image ${f.image_id || 'unknown'}`,
        answer: `Score: ${((Number(f.similarity_score) || 0) * 100).toFixed(0)}% - ${f.user_feedback}`,
        rating: f.user_feedback === 'confirm' ? 5 : (f.user_feedback === 'correct' ? 3 : 1),
        // Parsing date safely: tolerate numeric timestamps, ISO strings, or invalid values
        timestamp: (() => {
          try {
            const raw = f.created_at;
            // If it's numeric-like, convert to number
            const asNum = Number(raw);
            const date = (!isNaN(asNum) && asNum > 0) ? new Date(asNum) : new Date(String(raw));
            if (isNaN(date.getTime())) return new Date().toISOString();
            return date.toISOString();
          } catch (err) {
            return new Date().toISOString();
          }
        })(),
        processed: f.processed === 1,
        modelVersion: 'vision-mobilenet',
        feedbackType: f.innovation_type as 'vision_search' | 'vision_diagnostic',
        imageId: f.image_id != null ? String(f.image_id) : undefined,
        predictionId: f.prediction_id != null ? String(f.prediction_id) : undefined,
        similarityScore: Number(f.similarity_score) || 0,
        confidenceScore: Number(f.confidence_score) || 0,
        userFeedback: f.user_feedback as 'confirm' | 'correct' | 'reject',
        correction: f.correction ? String(f.correction) : undefined,
      }));
      
      this.recalculateStats();
      console.log(`[Confidence] ✅ ${this.feedbacksCache.length} feedbacks chargés depuis SQLite`);
    } catch (error) {
      console.error('[Confidence] Erreur chargement SQLite:', error);
    }
  }

  /**
   * Sauvegarde un feedback dans SQLite
   */
  private async saveFeedbackToSQLite(feedback: VisionFeedbackExtended): Promise<void> {
    try {
      this.db.innovations?.saveFeedback?.({
        id: feedback.id,
        predictionId: feedback.predictionId || feedback.messageId,
        imageId: feedback.imageId,
        innovationType: feedback.feedbackType,
        userFeedback: feedback.userFeedback || (feedback.rating >= 4 ? 'confirm' : (feedback.rating === 3 ? 'correct' : 'reject')),
        correction: feedback.correction,
        confidenceScore: feedback.confidenceScore,
        similarityScore: feedback.similarityScore
      });
    } catch (error) {
      console.error('[Confidence] Erreur sauvegarde SQLite:', error);
    }
  }

  /**
   * Recalcule les statistiques à partir des feedbacks en cache
   */
  private recalculateStats(): void {
    const visionFeedbacks = this.feedbacksCache;
    
    if (visionFeedbacks.length === 0) {
      return;
    }
    
    const confirms = visionFeedbacks.filter(f => f.userFeedback === 'confirm' || f.rating >= 4);
    const corrections = visionFeedbacks.filter(f => f.userFeedback === 'correct' || f.rating === 3);
    const rejections = visionFeedbacks.filter(f => f.userFeedback === 'reject' || f.rating <= 2);
    
    const correctConfidences = confirms
      .map(f => f.confidenceScore || f.similarityScore || 0)
      .filter(s => s > 0);
    
    const wrongConfidences = rejections
      .map(f => f.confidenceScore || f.similarityScore || 0)
      .filter(s => s > 0);
    
    const avgCorrect = correctConfidences.length > 0 
      ? correctConfidences.reduce((a, b) => a + b, 0) / correctConfidences.length 
      : 0.85;
    
    const avgWrong = wrongConfidences.length > 0 
      ? wrongConfidences.reduce((a, b) => a + b, 0) / wrongConfidences.length 
      : 0.45;
    
    this.stats = {
      totalFeedbacks: visionFeedbacks.length,
      confirmationRate: confirms.length / visionFeedbacks.length,
      correctionRate: corrections.length / visionFeedbacks.length,
      rejectionRate: rejections.length / visionFeedbacks.length,
      averageConfidenceWhenCorrect: avgCorrect,
      averageConfidenceWhenWrong: avgWrong,
      thresholdRecommendations: this.thresholds,
    };
    
    if (this.config.autoAdjustThresholds && visionFeedbacks.length >= this.config.minFeedbacksForAdjustment) {
      this.adjustThresholdsFromData(correctConfidences, wrongConfidences);
    }
  }

  /**
   * Ajuste les seuils en fonction des données
   */
  private adjustThresholdsFromData(correctConfidences: number[], wrongConfidences: number[]): void {
    if (correctConfidences.length < 5 || wrongConfidences.length < 5) return;
    
    correctConfidences.sort((a, b) => a - b);
    wrongConfidences.sort((a, b) => a - b);
    
    const wrong90th = wrongConfidences[Math.floor(wrongConfidences.length * 0.9)];
    const correctMedian = correctConfidences[Math.floor(correctConfidences.length * 0.5)];
    
    const newHigh = Math.min(0.95, Math.max(wrong90th + 0.05, correctMedian));
    const wrong75th = wrongConfidences[Math.floor(wrongConfidences.length * 0.75)];
    const newLow = Math.min(0.60, Math.max(0.40, wrong75th));
    const newMedium = (newHigh + newLow) / 2;
    
    const rate = this.config.adjustmentRate;
    this.thresholds = {
      high: this.thresholds.high * (1 - rate) + newHigh * rate,
      medium: this.thresholds.medium * (1 - rate) + newMedium * rate,
      low: this.thresholds.low * (1 - rate) + newLow * rate,
    };
    
    this.stats.thresholdRecommendations = this.thresholds;
    
    // Sauvegarder les nouveaux seuils
    this.saveThresholdsToSQLite();
  }

  /**
   * Calcule les métadonnées de confiance
   */
  calculateSearchConfidence(
    similarityScore: number,
    matchesCount: number,
    bestMatchScore: number,
    secondBestScore: number = 0
  ): ConfidenceMetadata {
    const margin = bestMatchScore - secondBestScore;
    const marginFactor = Math.min(1, margin * 10);
    const matchesFactor = Math.min(1, matchesCount / 5);
    
    const factors = [
      { name: 'score_similarité', value: similarityScore, weight: 0.5 },
      { name: 'marge_confiance', value: marginFactor, weight: 0.3 },
      { name: 'nombre_correspondances', value: matchesFactor, weight: 0.2 },
    ];
    
    let weightedScore = factors.reduce((sum, f) => sum + f.value * f.weight, 0);
    
    // 🔥 FORCE 100% si match exact par hash
    if (similarityScore >= 1.0) {
      weightedScore = 1.0;
    }
    
    let level: 'high' | 'medium' | 'low';
    let recommendation: 'trust' | 'verify' | 'reject';
    
    if (weightedScore >= this.thresholds.high) {
      level = 'high';
      recommendation = 'trust';
    } else if (weightedScore >= this.thresholds.medium) {
      level = 'medium';
      recommendation = 'verify';
    } else if (weightedScore >= this.thresholds.low) {
      level = 'low';
      recommendation = 'verify';
    } else {
      level = 'low';
      recommendation = 'reject';
    }
    
    return { score: weightedScore, level, factors, recommendation };
  }

  /**
   * Enregistre un feedback de vision
   */
  async recordVisionFeedback(
    predictionId: string,
    imageId: string,
    similarityScore: number,
    userFeedback: 'confirm' | 'correct' | 'reject',
    options?: { correction?: string; confidenceScore?: number }
  ): Promise<VisionFeedbackExtended> {
    const confidence = options?.confidenceScore || similarityScore;
    
    const newFeedback: VisionFeedbackExtended = {
      id: `vision_fb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      messageId: predictionId,
      question: `[VISION] Recherche similarité - Image ${imageId}`,
      answer: `Score: ${(similarityScore * 100).toFixed(0)}% - ${userFeedback}`,
      rating: userFeedback === 'confirm' ? 5 : (userFeedback === 'correct' ? 3 : 1),
      timestamp: new Date().toISOString(),
      processed: false,
      modelVersion: 'vision-mobilenet',
      feedbackType: 'vision_search',
      imageId,
      predictionId,
      similarityScore,
      confidenceScore: confidence,
      userFeedback,
      correction: options?.correction,
    };
    
    // Sauvegarder dans SQLite
    await this.saveFeedbackToSQLite(newFeedback);
    
    // Mettre à jour le cache
    this.feedbacksCache.unshift(newFeedback);
    if (this.feedbacksCache.length > 1000) {
      this.feedbacksCache.pop();
    }
    this.recalculateStats();
    
    // Enregistrer les métriques
    await this.db.recordMetric('confidence', 'feedback_count', 1);
    await this.db.recordMetric('confidence', `feedback_${userFeedback}`, 1);
    await this.db.recordMetric('confidence', 'similarity_score', similarityScore);
    
    console.log(`[Confidence] 📝 Feedback enregistré : ${userFeedback} (SQLite)`);
    return newFeedback;
  }

  /**
   * Enregistre un feedback rapide (👍/👎)
   */
  async quickVisionFeedback(
    predictionId: string,
    imageId: string,
    similarityScore: number,
    isCorrect: boolean
  ): Promise<VisionFeedbackExtended> {
    return this.recordVisionFeedback(
      predictionId,
      imageId,
      similarityScore,
      isCorrect ? 'confirm' : 'reject'
    );
  }

  /**
   * Obtient les statistiques
   */
  getStats(): FeedbackStats {
    return this.stats;
  }

  /**
   * Obtient les statistiques depuis SQLite (plus précises)
   */
  async getSQLiteStats(): Promise<FeedbackStats> {
    const stats = this.db.innovations?.getFeedbackStats?.('vision_search');
    if (stats) {
      return {
        totalFeedbacks: stats.total,
        confirmationRate: stats.confirmRate,
        correctionRate: stats.correctRate,
        rejectionRate: stats.rejectRate,
        averageConfidenceWhenCorrect: stats.avgConfidenceWhenCorrect,
        averageConfidenceWhenWrong: stats.avgConfidenceWhenWrong,
        thresholdRecommendations: this.thresholds,
      };
    }
    return this.stats;
  }

  /**
   * Obtient les seuils actuels
   */
  getThresholds(): ConfidenceThresholds {
    return this.thresholds;
  }

  /**
   * Formate un message de confiance pour affichage
   */
  formatConfidenceMessage(confidence: ConfidenceMetadata): {
    icon: string;
    color: string;
    message: string;
    suggestion: string;
  } {
    const percent = Math.round(confidence.score * 100);
    
    if (percent >= 100) {
      return {
        icon: '🛡️',
        color: 'text-blue-600 font-black animate-pulse',
        message: 'CERTIFIÉ CONFORME (100%)',
        suggestion: 'Signature numérique identique',
      };
    }

    switch (confidence.level) {
      case 'high':
        return {
          icon: '✅',
          color: 'text-green-600',
          message: `Fiabilité élevée (${percent}%)`,
          suggestion: 'Résultat fiable',
        };
      case 'medium':
        return {
          icon: '⚠️',
          color: 'text-yellow-600',
          message: `Fiabilité moyenne (${percent}%)`,
          suggestion: 'Vérifiez avant d\'agir',
        };
      case 'low':
        return {
          icon: '❌',
          color: 'text-red-600',
          message: `Fiabilité faible (${percent}%)`,
          suggestion: 'Résultat incertain',
        };
    }
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(updates: Partial<typeof DEFAULT_CONFIG>): void {
    this.config = { ...this.config, ...updates };
    console.log('[Confidence] Configuration mise à jour');
  }

  /**
   * Rafraîchit les statistiques
   */
  async refreshStats(): Promise<FeedbackStats> {
    await this.loadFromSQLite();
    this.recalculateStats();
    return this.stats;
  }

  /**
   * Réinitialise les seuils aux valeurs par défaut
   */
  async resetThresholds(): Promise<void> {
    this.thresholds = {
      high: 0.95,
      medium: 0.90,
      low: 0.80,
    };

    await this.saveThresholdsToSQLite();
    this.recalculateStats();
    console.log('[Confidence] Seuils réinitialisés');
  }

  /**
   * Exporte tous les feedbacks
   */
  async exportFeedbacks(): Promise<string> {
    return JSON.stringify(this.feedbacksCache, null, 2);
  }
}

// Export singleton
export const confidenceFeedback = new ConfidenceFeedback();