// src/ai/training/feedback-loop.ts
/**
 * @fileOverview FeedbackLoop - Surveillance active de la satisfaction
 * @version 2.1.0
 * @lastUpdated 2026-04-05
 */

import { UserInteraction, PredictionRecord, TrainingExample } from './types';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[FEEDBACK-LOOP]';

function logInfo(message: string, data?: any): void {
    console.log(`${LOG_PREFIX} 📍 ${message}`);
    if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logSuccess(message: string, data?: any): void {
    console.log(`${LOG_PREFIX} ✅ ${message}`);
    if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logWarning(message: string, data?: any): void {
    console.warn(`${LOG_PREFIX} ⚠️ ${message}`);
    if (data) console.warn(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logError(message: string, error?: any): void {
    console.error(`${LOG_PREFIX} ❌ ${message}`);
    if (error) console.error(`${LOG_PREFIX} 🔥 ${error.message || error}`);
}


// ============================================================================
// INTERFACES
// ============================================================================

export interface FeedbackStats {
    totalInteractions: number;
    avgRating: number;
    lowRatingCount: number;
    highRatingCount: number;
    ratingDistribution: Record<number, number>;
    recentFeedback: {
        input: string;
        rating?: number;
        correction?: string;
        timestamp: number;
    }[];
    periodStart: number;
    periodEnd: number;
}

export interface FeedbackAlert {
    type: 'warning' | 'critical' | 'info';
    message: string;
    timestamp: number;
    data?: any;
}

export interface StarRatingFeedback {
    messageId: string;
    question: string;
    answer: string;
    rating: number;
    timestamp: string;
}

// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

export class FeedbackLoop {
    private interactions: Map<string, PredictionRecord> = new Map();
    private starFeedbacks: Map<string, StarRatingFeedback> = new Map();
    private alertCallbacks: ((alert: FeedbackAlert) => void)[] = [];
    private monitoringInterval: NodeJS.Timeout | null = null;
    private isMonitoring: boolean = false;
    private stats: {
        totalRecorded: number;
        totalAlerts: number;
        lastAlertTime: number | null;
        lastAlertType: string | null;
        avgRatingHistory: number[];
        lastAnalysisTime: number | null;
        errors: string[];
        totalStarFeedbacks: number;
        averageStarRating: number;
    } = {
        totalRecorded: 0,
        totalAlerts: 0,
        lastAlertTime: null,
        lastAlertType: null,
        avgRatingHistory: [],
        lastAnalysisTime: null,
        errors: [],
        totalStarFeedbacks: 0,
        averageStarRating: 0
    };
    
    // Chemin de stockage
    private feedbacksPath: string;
    
    constructor() {
        this.feedbacksPath = path.join(process.cwd(), 'data', 'training', 'feedbacks.json');
        this.loadStoredFeedbacks();
    }
    
    /**
     * Charge les feedbacks stockés
     */
    private loadStoredFeedbacks(): void {
        try {
            if (fs.existsSync(this.feedbacksPath)) {
                const data = fs.readFileSync(this.feedbacksPath, 'utf-8');
                const stored = JSON.parse(data);
                if (Array.isArray(stored)) {
                    stored.forEach((fb: StarRatingFeedback) => {
                        this.starFeedbacks.set(fb.messageId, fb);
                        this.updateStarRatingStats(fb.rating);
                    });
                    logSuccess(`${this.starFeedbacks.size} feedbacks chargés depuis le stockage`);
                }
            }
        } catch (error) {
            logError('Erreur chargement feedbacks', error);
        }
    }
    
    /**
     * Sauvegarde un feedback
     */
    private saveFeedback(feedback: StarRatingFeedback): void {
        try {
            let existing: StarRatingFeedback[] = [];
            if (fs.existsSync(this.feedbacksPath)) {
                existing = JSON.parse(fs.readFileSync(this.feedbacksPath, 'utf-8'));
            }
            
            // Éviter les doublons
            const existingIndex = existing.findIndex(f => f.messageId === feedback.messageId);
            if (existingIndex >= 0) {
                existing[existingIndex] = feedback;
            } else {
                existing.push(feedback);
            }
            
            // Garder seulement les 1000 derniers
            if (existing.length > 1000) {
                existing = existing.slice(-1000);
            }
            
            fs.writeFileSync(this.feedbacksPath, JSON.stringify(existing, null, 2));
            logSuccess(`Feedback sauvegardé: ${feedback.messageId} (${feedback.rating}★)`);
        } catch (error) {
            logError('Erreur sauvegarde feedback', error);
        }
    }
    
    /**
     * Met à jour les statistiques des étoiles
     */
    private updateStarRatingStats(rating: number): void {
        this.stats.totalStarFeedbacks++;
        const total = this.stats.totalStarFeedbacks;
        const currentAvg = this.stats.averageStarRating;
        this.stats.averageStarRating = ((currentAvg * (total - 1)) + rating) / total;
    }
    
    /**
     * Enregistre un feedback par étoiles
     */
    async recordStarFeedback(feedback: StarRatingFeedback): Promise<void> {
        logInfo(`⭐ Nouveau feedback: ${feedback.rating}★ pour "${feedback.question.substring(0, 50)}..."`);
        
        this.starFeedbacks.set(feedback.messageId, feedback);
        this.updateStarRatingStats(feedback.rating);
        this.saveFeedback(feedback);
        
        // Alerte si note très basse
        if (feedback.rating <= 2) {
            const alert: FeedbackAlert = {
                type: 'warning',
                message: `⚠️ Mauvaise note détectée (${feedback.rating}★)`,
                timestamp: Date.now(),
                data: {
                    messageId: feedback.messageId,
                    question: feedback.question.substring(0, 100),
                    answer: feedback.answer.substring(0, 100)
                }
            };
            this.notifyAlertCallbacks(alert);
        }
        
        // Si note très haute, renforcer le cache
        if (feedback.rating >= 4) {
            await this.reinforceCache(feedback);
        }
        
        // Si note très basse, invalider le cache
        if (feedback.rating <= 2) {
            await this.invalidateCache(feedback);
        }
    }
    
    /**
     * Renforce le cache pour une bonne réponse
     */
    private async reinforceCache(feedback: StarRatingFeedback): Promise<void> {
        logInfo(`🔒 Renforcement du cache (${feedback.rating}★)`);
        try {
            await fetch('http://localhost:3000/api/cache/reinforce', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: feedback.question,
                    answer: feedback.answer,
                    rating: feedback.rating
                })
            }).catch(() => {});
        } catch {
            // Cache non disponible
        }
    }
    
    /**
     * Invalide le cache pour une mauvaise réponse
     */
    private async invalidateCache(feedback: StarRatingFeedback): Promise<void> {
        logInfo(`🗑️ Invalidation du cache (${feedback.rating}★)`);
        try {
            await fetch('http://localhost:3000/api/cache/invalidate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: feedback.question })
            }).catch(() => {});
        } catch {
            // Cache non disponible
        }
    }
    
    /**
     * Démarre la surveillance active
     */
    startMonitoring(intervalMs: number = 3600000): void {
        if (this.isMonitoring) {
            logWarning('La surveillance est déjà active');
            return;
        }
        
        logInfo(`Démarrage de la surveillance active (intervalle: ${intervalMs / 1000}s)`);
        
        this.isMonitoring = true;
        
        // Analyse initiale
        this.analyzePerformance();
        
        // Analyse périodique
        if (typeof setInterval !== 'undefined') {
            this.monitoringInterval = setInterval(() => this.analyzePerformance(), intervalMs);
            logSuccess(`Surveillance active avec analyse toutes les ${intervalMs / 1000}s`);
        }
    }
    
    /**
     * Arrête la surveillance
     */
    stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        this.isMonitoring = false;
        logSuccess('Surveillance active arrêtée');
    }
    
    /**
     * Enregistre une interaction utilisateur
     */
    async recordInteraction(interaction: UserInteraction): Promise<string> {
        const id = `feedback_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const rating = interaction.feedback?.rating;
        
        logInfo('Enregistrement d\'une interaction', { rating });
        
        const record: PredictionRecord = {
            ...interaction,
            id,
            timestamp: Date.now()
        };
        
        this.interactions.set(id, record);
        this.stats.totalRecorded++;
        
        if (rating !== undefined) {
            this.stats.avgRatingHistory.push(rating);
            if (this.stats.avgRatingHistory.length > 100) this.stats.avgRatingHistory.shift();
        }
        
        // Alerte si feedback très négatif
        if (rating !== undefined && rating < 2) {
            const alert: FeedbackAlert = {
                type: 'warning',
                message: `⚠️ Insatisfaction détectée (note: ${rating}/5)`,
                timestamp: Date.now(),
                data: {
                    interactionId: id,
                    input: interaction.input?.substring(0, 100),
                    rating,
                    correction: interaction.feedback?.correction
                }
            };
            
            this.stats.totalAlerts++;
            this.stats.lastAlertTime = Date.now();
            this.stats.lastAlertType = 'warning';
            
            this.notifyAlertCallbacks(alert);
            logWarning('Alerte insatisfaction', alert.data);
        }
        
        logSuccess(`Interaction enregistrée: ${id}`);
        
        // Si correction fournie, ajouter aux données d'entraînement
        if (interaction.feedback?.correction) {
            await this.addCorrectionToTraining(interaction);
        }
        
        return id;
    }
    
    /**
     * Ajoute une correction aux données d'entraînement
     */
    private async addCorrectionToTraining(interaction: UserInteraction): Promise<void> {
        if (!interaction.feedback?.correction) return;
        
        const correctionExample: TrainingExample = {
            id: `correction_${Date.now()}`,
            type: 'correction',
            input: interaction.input,
            output: interaction.feedback.correction,
            weight: 3.0,
            source: 'user_feedback',
            rating: interaction.feedback.rating,
            timestamp: Date.now(),
            metadata: {
                originalPrediction: interaction.prediction,
                modelVersion: interaction.modelVersion
            }
        };
        
        logInfo('Correction ajoutée aux données d\'entraînement', {
            input: correctionExample.input?.substring(0, 50),
            output: correctionExample.output?.substring(0, 50)
        });
    }
    
    /**
     * Analyse les performances récentes
     */
    private analyzePerformance(): void {
        const now = Date.now();
        const last24h = Array.from(this.interactions.values()).filter(i => i.timestamp > now - 86400000);
        const lastWeek = Array.from(this.interactions.values()).filter(i => i.timestamp > now - 604800000);
        
        this.stats.lastAnalysisTime = now;
        
        if (last24h.length === 0) {
            logInfo('Aucune interaction dans les dernières 24h');
            return;
        }
        
        const avgRating24h = last24h.reduce((acc, i) => acc + (i.feedback?.rating || 4), 0) / last24h.length;
        const avgRatingWeek = lastWeek.length > 0 
            ? lastWeek.reduce((acc, i) => acc + (i.feedback?.rating || 4), 0) / lastWeek.length
            : avgRating24h;
        
        const lowRatingCount = last24h.filter(i => i.feedback?.rating !== undefined && i.feedback.rating < 3).length;
        const highRatingCount = last24h.filter(i => i.feedback?.rating !== undefined && i.feedback.rating >= 4).length;
        
        logInfo('Analyse des performances', {
            interactions24h: last24h.length,
            satisfaction24h: `${avgRating24h.toFixed(2)}/5`,
            satisfaction7j: `${avgRatingWeek.toFixed(2)}/5`,
            notesBasses: lowRatingCount,
            notesHautes: highRatingCount,
            moyenneEtoiles: this.stats.averageStarRating.toFixed(2)
        });
        
        // Alerte si baisse de qualité
        if (avgRating24h < 3.5 && last24h.length > 5) {
            const alert: FeedbackAlert = {
                type: 'warning',
                message: `🚨 Dégradation de la qualité détectée (${avgRating24h.toFixed(2)}/5)`,
                timestamp: Date.now(),
                data: { avgRating24h, avgRatingWeek, interactionsCount: last24h.length }
            };
            
            this.stats.totalAlerts++;
            this.stats.lastAlertTime = Date.now();
            this.stats.lastAlertType = 'warning';
            
            this.notifyAlertCallbacks(alert);
            logWarning('Qualité en baisse', alert.data);
        }
    }
    
    /**
     * Ajoute un callback d'alerte
     */
    onAlert(callback: (alert: FeedbackAlert) => void): void {
        this.alertCallbacks.push(callback);
        logInfo('Callback d\'alerte enregistré');
    }
    
    /**
     * Notifie les callbacks
     */
    private notifyAlertCallbacks(alert: FeedbackAlert): void {
        for (const callback of this.alertCallbacks) {
            try {
                callback(alert);
            } catch (error: any) {
                this.stats.errors.push(error.message);
                logError('Erreur dans callback', error);
            }
        }
    }
    
    /**
     * Récupère les statistiques récentes
     */
    async getRecentStats(hours: number = 24): Promise<FeedbackStats> {
        const now = Date.now();
        const periodStart = now - hours * 3600000;
        const interactions = Array.from(this.interactions.values()).filter(i => i.timestamp > periodStart);
        
        const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let totalRating = 0;
        let ratingCount = 0;
        let lowRatingCount = 0;
        let highRatingCount = 0;
        
        for (const interaction of interactions) {
            const rating = interaction.feedback?.rating;
            if (rating !== undefined) {
                ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
                totalRating += rating;
                ratingCount++;
                
                if (rating < 3) lowRatingCount++;
                if (rating >= 4) highRatingCount++;
            }
        }
        
        const avgRating = ratingCount > 0 ? totalRating / ratingCount : 0;
        
        const recentFeedback = interactions
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 10)
            .map(i => ({
                input: i.input?.substring(0, 100) || '',
                rating: i.feedback?.rating,
                correction: i.feedback?.correction,
                timestamp: i.timestamp
            }));
        
        return {
            totalInteractions: interactions.length,
            avgRating: Math.round(avgRating * 100) / 100,
            lowRatingCount,
            highRatingCount,
            ratingDistribution,
            recentFeedback,
            periodStart,
            periodEnd: now
        };
    }
    
    /**
     * Récupère les statistiques globales
     */
    getStats(): {
        totalRecorded: number;
        totalAlerts: number;
        lastAlertTime: number | null;
        lastAlertType: string | null;
        avgRatingTrend: number[];
        lastAnalysisTime: number | null;
        isMonitoring: boolean;
        recentErrors: string[];
        totalStarFeedbacks: number;
        averageStarRating: number;
    } {
        return {
            totalRecorded: this.stats.totalRecorded,
            totalAlerts: this.stats.totalAlerts,
            lastAlertTime: this.stats.lastAlertTime,
            lastAlertType: this.stats.lastAlertType,
            avgRatingTrend: this.stats.avgRatingHistory.slice(-20),
            lastAnalysisTime: this.stats.lastAnalysisTime,
            isMonitoring: this.isMonitoring,
            recentErrors: this.stats.errors.slice(-10),
            totalStarFeedbacks: this.stats.totalStarFeedbacks,
            averageStarRating: this.stats.averageStarRating
        };
    }
    
    /**
     * Récupère les feedbacks par étoiles
     */
    getStarFeedbacks(limit?: number, minRating?: number): StarRatingFeedback[] {
        let feedbacks = Array.from(this.starFeedbacks.values());
        
        if (minRating !== undefined) {
            feedbacks = feedbacks.filter(f => f.rating >= minRating);
        }
        
        feedbacks.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        if (limit) {
            feedbacks = feedbacks.slice(0, limit);
        }
        
        return feedbacks;
    }
    
    /**
     * Réinitialise les statistiques
     */
    resetStats(): void {
        this.stats = {
            totalRecorded: 0,
            totalAlerts: 0,
            lastAlertTime: null,
            lastAlertType: null,
            avgRatingHistory: [],
            lastAnalysisTime: null,
            errors: [],
            totalStarFeedbacks: 0,
            averageStarRating: 0
        };
        logSuccess('Statistiques réinitialisées');
    }
}

// Instance singleton
export const feedbackLoop = new FeedbackLoop();