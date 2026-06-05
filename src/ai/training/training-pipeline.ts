/**
 * @fileOverview TrainingPipeline - Pipeline d'entraînement complet
 * @version 2.0.0
 * @lastUpdated 2026-04-02
 */

import { trainingDataCollector } from './data-collector';
import { dataPreparer } from './data-preparer';
import { modelTrainer } from './model-trainer';
import { modelEvaluator } from './model-evaluator';
import { modelRegistry, registerAndDeployModel } from './model-registry';  // ← Ajout de registerAndDeployModel
import { PipelineResult, TrainingExample, TrainingOptions, TrainingMetrics } from './types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[TRAINING-PIPELINE]';

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

export class TrainingPipeline {
    
    /**
     * Exécute un cycle complet d'entraînement
     */
    async runFullCycle(options?: TrainingOptions): Promise<PipelineResult> {
        const startTime = Date.now();
        const warnings: string[] = [];
        const errors: string[] = [];
        
        logInfo('🚀 Démarrage du pipeline d\'entraînement complet');
        
        // Créer un objet metrics par défaut conforme à TrainingMetrics
        const defaultMetrics: TrainingMetrics = {
            accuracy: 0,
            loss: 0,
            trainingTime: '0s',
            trainingTimeMs: 0,
            samplesProcessed: 0,
            convergence: 'Normal',
            rank: options?.loraRank || 8,
            alpha: options?.loraAlpha || 16,
            epochsCompleted: 0,
            finalLoss: 0
        };
        
        const result: PipelineResult = {
            success: false,
            modelVersion: '',
            trainingSize: 0,
            metrics: defaultMetrics,
            timestamp: Date.now(),
            processingTime: 0,
            stages: {
                collection: { duration: 0, count: 0, success: false },
                preparation: { duration: 0, count: 0, success: false },
                training: { duration: 0, success: false },
                evaluation: { duration: 0, success: false, accuracy: 0 },
                deployment: { duration: 0, success: false }
            },
            warnings,
            errors,
            result: {
                technicalPrecision: 0,
                hallucinationRate: 0,
                instructionFollowing: 0
            }
        };
        
        try {
            // Étape 1: Collecte
            logInfo('📚 Étape 1/5: Collecte des données...');
            const collectStart = Date.now();
            let rawData: TrainingExample[] = [];
            
            try {
                rawData = await trainingDataCollector.collectAll();
                result.stages.collection = {
                    duration: Date.now() - collectStart,
                    count: rawData.length,
                    success: true
                };
                logSuccess(`Collecte: ${rawData.length} exemples en ${(result.stages.collection.duration / 1000).toFixed(1)}s`);
            } catch (error: any) {
                result.stages.collection = {
                    duration: Date.now() - collectStart,
                    count: 0,
                    success: false
                };
                errors.push(`Collecte: ${error.message}`);
                throw error;
            }
            
            if (rawData.length < 10) {
                warnings.push(`Peu de données: ${rawData.length} exemples seulement`);
            }
            
            // Étape 2: Préparation
            logInfo('🔧 Étape 2/5: Préparation des données...');
            const prepStart = Date.now();
            let prepared;
            
            try {
                prepared = await dataPreparer.prepare(rawData);
                result.stages.preparation = {
                    duration: Date.now() - prepStart,
                    count: prepared.train.length + prepared.test.length,
                    success: true
                };
                logSuccess(`Préparation: ${prepared.train.length} train, ${prepared.test.length} test`);
            } catch (error: any) {
                result.stages.preparation = {
                    duration: Date.now() - prepStart,
                    count: 0,
                    success: false
                };
                errors.push(`Préparation: ${error.message}`);
                throw error;
            }
            
            // Étape 3: Entraînement
            logInfo('🏋️ Étape 3/5: Entraînement du modèle...');
            const trainStart = Date.now();
            let trainingResult;
            
            try {
                trainingResult = await modelTrainer.train(prepared.train, options || {
                    timeout: 3600000,
                    validationSplit: 0.15,
                    epochs: 3
                });
                result.stages.training = {
                    duration: Date.now() - trainStart,
                    success: true,
                    modelName: trainingResult.name
                };
                result.modelVersion = trainingResult.version;
                result.trainingSize = prepared.train.length;
                logSuccess(`Entraînement: ${trainingResult.version} en ${(result.stages.training.duration / 1000).toFixed(1)}s`);
            } catch (error: any) {
                result.stages.training = {
                    duration: Date.now() - trainStart,
                    success: false
                };
                errors.push(`Entraînement: ${error.message}`);
                throw error;
            }
            
            // Étape 4: Évaluation
            logInfo('📊 Étape 4/5: Évaluation du modèle...');
            const evalStart = Date.now();
            let evaluation;
            
            try {
                evaluation = await modelEvaluator.evaluate(trainingResult.path, prepared.test);
                result.stages.evaluation = {
                    duration: Date.now() - evalStart,
                    success: true,
                    accuracy: evaluation.accuracy
                };
                
                // Mapper les métriques d'évaluation vers TrainingMetrics
                result.metrics = {
                    ...defaultMetrics,
                    accuracy: evaluation.accuracy,
                    loss: 1 - evaluation.accuracy,
                    trainingTimeMs: result.stages.training.duration,
                    trainingTime: `${(result.stages.training.duration / 1000).toFixed(1)}s`,
                    samplesProcessed: result.trainingSize,
                    finalLoss: 1 - evaluation.accuracy
                };
                
                // Mettre à jour result.technicalPrecision si disponible
                if (evaluation.metrics) {
                    result.result.technicalPrecision = evaluation.metrics.technicalPrecision || evaluation.accuracy;
                    result.result.hallucinationRate = evaluation.metrics.hallucinationRate || (1 - evaluation.accuracy);
                    result.result.instructionFollowing = evaluation.metrics.instructionFollowing || evaluation.accuracy;
                }
                
                logSuccess(`Évaluation: accuracy=${(evaluation.accuracy * 100).toFixed(1)}%`);
            } catch (error: any) {
                result.stages.evaluation = {
                    duration: Date.now() - evalStart,
                    success: false,
                    accuracy: 0
                };
                errors.push(`Évaluation: ${error.message}`);
                throw error;
            }
            
            // Étape 5: Déploiement (si amélioration significative)
            logInfo('🚀 Étape 5/5: Déploiement...');
            const deployStart = Date.now();
            
            try {
                const currentModel = await modelRegistry.getCurrentActiveModel();
                const improvement = evaluation.accuracy - (currentModel?.accuracy || 0.7);
                
                if (improvement > 0.02 && evaluation.isReliable) {
                    // Correction: Utiliser la fonction importée registerAndDeployModel
                    await registerAndDeployModel(
                        trainingResult.path,
                        evaluation.accuracy,
                        result.result
                    );
                    result.stages.deployment = {
                        duration: Date.now() - deployStart,
                        success: true
                    };
                    logSuccess(`Déploiement: nouveau modèle (gain +${(improvement * 100).toFixed(1)}%)`);
                } else {
                    result.stages.deployment = {
                        duration: Date.now() - deployStart,
                        success: false
                    };
                    logInfo(`Déploiement ignoré (gain: +${(improvement * 100).toFixed(1)}%)`);
                }
            } catch (error: any) {
                result.stages.deployment = {
                    duration: Date.now() - deployStart,
                    success: false
                };
                errors.push(`Déploiement: ${error.message}`);
            }
            
            // Finalisation
            result.success = errors.length === 0;
            result.processingTime = Date.now() - startTime;
            result.warnings = warnings;
            result.errors = errors;
            
            logSuccess(`Pipeline terminé en ${(result.processingTime / 1000).toFixed(1)}s`, {
                success: result.success,
                warnings: warnings.length,
                errors: errors.length
            });
            
            return result;
            
        } catch (error: any) {
            result.processingTime = Date.now() - startTime;
            result.errors.push(`Critique: ${error.message}`);
            logError('Pipeline échoué', error);
            return result;
        }
    }
    
    /**
     * Exécute un cycle rapide (pour test)
     */
    async runQuickCycle(): Promise<PipelineResult> {
        logInfo('🏃 Exécution du cycle rapide...');
        return this.runFullCycle({
            timeout: 60000,
            validationSplit: 0.2,
            epochs: 1,
            loraRank: 8
        });
    }
}

// Instance singleton
export const trainingPipeline = new TrainingPipeline();

// Export pour compatibilité
export async function runFullTrainingCycle(_context: any): Promise<any> {
    const result = await trainingPipeline.runFullCycle();
    return {
        status: result.success ? 'completed' : 'failed',
        newModel: result.modelVersion,
        accuracy: result.stages.evaluation.accuracy,
        deployed: result.stages.deployment.success,
        gain: result.stages.evaluation.accuracy ? result.stages.evaluation.accuracy - 0.72 : 0
    };
}