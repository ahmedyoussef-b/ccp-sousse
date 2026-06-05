/**
 * @fileOverview ContinuousTraining - Cycle d'entraînement continu
 * @version 2.1.0
 * @lastUpdated 2026-04-02
 */

import { trainingDataCollector } from './data-collector';
import { dataPreparer } from './data-preparer';
import { modelTrainer } from './model-trainer';
import { modelEvaluator } from './model-evaluator';
import { modelRegistry } from './model-registry';
import { TrainingResult, TrainingMetrics } from './types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[CONTINUOUS-TRAINING]';

function logInfo(message: string, data?: any): void {
    console.log(`${LOG_PREFIX} 📍 ${message}`);
    if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logSuccess(message: string, data?: any): void {
    console.log(`${LOG_PREFIX} ✅ ${message}`);
    if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logError(message: string, error?: any): void {
    console.error(`${LOG_PREFIX} ❌ ${message}`);
    if (error) console.error(`${LOG_PREFIX} 🔥 ${error.message || error}`);
}


// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

export class ContinuousTraining {
    private minSamplesThreshold: number = 50;
    private deploymentThreshold: number = 0.02; // 2% d'amélioration
    
    /**
     * Exécute le cycle d'entraînement quotidien
     */
    async runDailyTraining(_context: { memory: any[]; documents: any[] }): Promise<TrainingResult> {
        
        logInfo('🌙 Démarrage du cycle d\'entraînement continu...');
        
        try {
            // 1. Collecte des données
            logInfo('Phase 1: Collecte des données...');
            const rawData = await trainingDataCollector.collectAll();
            
            if (rawData.length < this.minSamplesThreshold) {
                logInfo(`Données insuffisantes (${rawData.length}/${this.minSamplesThreshold}). Cycle reporté.`);
                return {
                    status: 'skipped',
                    reason: `Volume de données insuffisant (${rawData.length}/${this.minSamplesThreshold})`
                };
            }
            
            logSuccess(`Collecte terminée: ${rawData.length} exemples`);
            
            // 2. Préparation des données
            logInfo('Phase 2: Préparation des données...');
            const prepared = await dataPreparer.prepare(rawData);
            logSuccess(`Dataset préparé: ${prepared.train.length} train, ${prepared.test.length} test`);
            
            // 3. Entraînement
            logInfo('Phase 3: Entraînement du modèle...');
            const trainingResult = await modelTrainer.train(prepared.train, {
                timeout: 3600000,
                validationSplit: 0.15,
                epochs: 3,
                loraRank: 16,
                useRsLORA: true
            });
            logSuccess(`Entraînement terminé: ${trainingResult.version}`);
            
            // 4. Évaluation
            logInfo('Phase 4: Évaluation du modèle...');
            const evaluation = await modelEvaluator.evaluate(
                trainingResult.path,
                prepared.test
            );
            logSuccess(`Évaluation: accuracy=${(evaluation.accuracy * 100).toFixed(1)}%`);
            
            // 5. Comparaison avec modèle actuel
            const currentModel = await modelRegistry.getCurrentActiveModel();
            const improvement = evaluation.accuracy - (currentModel.accuracy || 0.72);
            
            logInfo(`Amélioration: +${(improvement * 100).toFixed(2)}%`);
            
            // Construire les métriques complètes pour TrainingResult
            const metrics: TrainingMetrics = {
                accuracy: evaluation.accuracy,
                loss: 1 - evaluation.accuracy,
                trainingTime: trainingResult.metrics.trainingTime,
                trainingTimeMs: trainingResult.metrics.trainingTimeMs,
                samplesProcessed: trainingResult.metrics.samplesProcessed,
                convergence: improvement > 0.02 ? 'Excellent' : 'Acceptable',
                rank: trainingResult.metrics.rank,
                alpha: trainingResult.metrics.alpha,
                epochsCompleted: trainingResult.metrics.epochsCompleted,
                finalLoss: trainingResult.metrics.finalLoss
            };
            
            // 6. Décision de déploiement
            if (improvement > this.deploymentThreshold && evaluation.isReliable) {
                logInfo('Phase 5: Déploiement du nouveau modèle...');
                
                // CORRECTION: Utiliser registerModel + deployCandidate au lieu de registerAndDeployModel
                const registeredModel = await modelRegistry.registerModel(
                    trainingResult.path,
                    evaluation.accuracy,
                    {
                        loss: metrics.finalLoss,
                        hallucinationRate: evaluation.metrics.hallucinationRate,
                        instructionFollowing: evaluation.metrics.instructionFollowing
                    }
                );
                
                const deployed = await modelRegistry.deployCandidate(registeredModel.id);
                
                if (deployed) {
                    logSuccess(`✅ Nouveau modèle déployé! Gain: +${(improvement * 100).toFixed(1)}%`);
                    return {
                        status: 'completed',
                        deployed: true,
                        gain: improvement,
                        version: trainingResult.version,
                        metrics: metrics
                    };
                }
            }
            
            // Modèle archivé (pas déployé)
            logInfo(`Modèle archivé (amélioration insuffisante: +${(improvement * 100).toFixed(1)}%)`);
            
            return {
                status: 'completed',
                deployed: false,
                gain: improvement,
                reason: `Amélioration sous le seuil de ${(this.deploymentThreshold * 100).toFixed(0)}%`,
                version: trainingResult.version,
                metrics: metrics
            };
            
        } catch (error: any) {
            logError('Échec critique du cycle d\'entraînement', error);
            return {
                status: 'failed',
                reason: error.message
            };
        }
    }
    
    /**
     * Configure les seuils
     */
    setThresholds(minSamples: number, deploymentThreshold: number): void {
        this.minSamplesThreshold = minSamples;
        this.deploymentThreshold = deploymentThreshold;
        logInfo('Seuils configurés', { minSamples, deploymentThreshold });
    }
    
    /**
     * Récupère la configuration actuelle
     */
    getConfig(): { minSamples: number; deploymentThreshold: number } {
        return {
            minSamples: this.minSamplesThreshold,
            deploymentThreshold: this.deploymentThreshold
        };
    }
}

// Instance singleton
export const continuousTraining = new ContinuousTraining();