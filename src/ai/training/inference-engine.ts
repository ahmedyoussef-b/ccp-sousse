/**
 * @fileOverview InferenceEngine - Moteur d'inférence avec modèles fine-tunés
 * @version 2.0.0
 * @lastUpdated 2026-04-02
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { Prediction, TrainedModel } from './types';
import { modelRegistry } from './model-registry';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[INFERENCE-ENGINE]';

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

function logMetric(message: string, value: any): void {
    console.log(`${LOG_PREFIX} 📈 ${message}: ${value}`);
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface InferenceContext {
    hasRelevantDocs?: boolean;
    relevantSources?: string[];
    userExpertise?: 'débutant' | 'intermédiaire' | 'expert';
    domain?: string;
    previousPredictions?: Prediction[];
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
}

export interface InferenceStats {
    totalPredictions: number;
    avgConfidence: number;
    avgLatency: number;
    modelVersions: Map<string, number>;
    lastPredictionTime: number | null;
    lastPredictionLatency: number | null;
    errors: string[];
}

// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

export class InferenceEngine {
    private currentModel: TrainedModel | null = null;
    private isInitialized: boolean = false;
    private initializationTime: number | null = null;
    private stats: InferenceStats = {
        totalPredictions: 0,
        avgConfidence: 0,
        avgLatency: 0,
        modelVersions: new Map(),
        lastPredictionTime: null,
        lastPredictionLatency: null,
        errors: []
    };
    
    /**
     * Initialise le moteur avec le modèle de production
     */
    async initialize(modelVersion?: string): Promise<boolean> {
        const startTime = Date.now();
        
        logInfo('Initialisation du moteur d\'inférence...');
        
        try {
            if (modelVersion) {
                const model = await modelRegistry.getModel(modelVersion);
                if (model) {
                    this.currentModel = {
                        name: model.name,
                        version: model.version,
                        path: model.path,
                        metrics: model.metrics as any
                    };
                }
            } else {
                const productionModel = await modelRegistry.getCurrentActiveModel();
                this.currentModel = {
                    name: productionModel.name,
                    version: productionModel.version,
                    path: productionModel.path,
                    metrics: productionModel.metrics as any
                };
            }
            
            // Vérifier la disponibilité du modèle via Ollama
            // Correction 1: Vérifier que currentModel n'est pas null
            if (this.currentModel) {
                const modelName = this.getModelNameForPath(this.currentModel.path);
                logInfo(`Vérification du modèle ${modelName}...`);
                
                const testResponse = await callOllama("Test", {
                    model: modelName,
                    temperature: 0.1,
                    maxTokens: 5,
                    timeout: 5000
                }).catch(() => null);
                
                if (testResponse === null) {
                    logError(`Modèle ${modelName} non disponible`);
                    return false;
                }
            } else {
                logError('Aucun modèle disponible');
                return false;
            }
            
            this.isInitialized = true;
            this.initializationTime = Date.now() - startTime;
            
            // Correction 2: Vérifier que currentModel n'est pas null avant accès
            logSuccess(`Moteur initialisé en ${(this.initializationTime / 1000).toFixed(1)}s`, {
                model: this.currentModel?.name,
                version: this.currentModel?.version
            });
            
            return true;
            
        } catch (error: any) {
            logError('Erreur initialisation', error);
            this.isInitialized = false;
            return false;
        }
    }
    
    /**
     * Convertit un chemin de modèle en nom Ollama
     */
    private getModelNameForPath(modelPath: string): string {
        // Si c'est un chemin de modèle fine-tuné
        if (modelPath.includes('data/models/')) {
            // Pour les modèles fine-tunés, on utilise le modèle de base
            return 'phi:2.7b';
        }
        
        // Correction 3: Suppression de la clé dupliquée 'ollama/phi:2.7b'
        const modelMap: Record<string, string> = {
            'ollama/phi:2.7b': 'phi:2.7b',
            'ollama/gemma:2b': 'gemma:2b',
            'ollama/tinyllama:latest': 'tinyllama:latest'
        };
        
        return modelMap[modelPath] || 'phi:2.7b';
    }
    
    /**
     * Génère une prédiction
     */
    async predict(input: string, context?: InferenceContext): Promise<Prediction> {
        const startTime = Date.now();
        
        if (!this.isInitialized) {
            logInfo('Moteur non initialisé, initialisation automatique...');
            await this.initialize();
        }
        
        logInfo('Prédiction', { input: input.substring(0, 100), context });
        
        try {
            // Correction 4: Utiliser optional chaining pour currentModel
            const modelName = this.currentModel 
                ? this.getModelNameForPath(this.currentModel.path)
                : 'phi:2.7b';
            
            const temperature = context?.temperature ?? 0.3;
            const maxTokens = context?.maxTokens ?? 500;
            
            // Construction du prompt avec contexte
            let prompt = input;
            
            if (context?.systemPrompt) {
                prompt = `${context.systemPrompt}\n\n${input}`;
            }
            
            if (context?.relevantSources && context.relevantSources.length > 0) {
                prompt = `Contexte documentaire: ${context.relevantSources.join(', ')}\n\nQuestion: ${input}\n\nRéponse:`;
            }
            
            if (context?.userExpertise === 'expert') {
                prompt = `[Niveau expert] ${prompt}`;
            } else if (context?.userExpertise === 'débutant') {
                prompt = `[Niveau débutant - expliquer simplement] ${prompt}`;
            }
            
            logMetric('Température', temperature);
            logMetric('Max tokens', maxTokens);
            
            const llmStartTime = Date.now();
            const result = await callOllama(prompt, {
                model: modelName,
                temperature,
                maxTokens,
                timeout: 30000
            });
            const llmDuration = Date.now() - llmStartTime;
            
            const confidence = this.calculateConfidence(input, result, context);
            const latency = Date.now() - startTime;
            
            // Mise à jour des stats
            this.updateStats(confidence, latency, this.currentModel?.version || 'unknown');
            
            logSuccess('Prédiction générée', {
                confiance: `${Math.round(confidence * 100)}%`,
                latence: `${latency}ms`,
                llmTime: `${llmDuration}ms`,
                longueur: `${result.length} caractères`
            });
            
            return {
                result,
                confidence,
                modelVersion: this.currentModel?.version || 'base',
                latency
            };
            
        } catch (error: any) {
            const latency = Date.now() - startTime;
            this.stats.errors.push(error.message);
            if (this.stats.errors.length > 100) this.stats.errors.shift();
            
            logError('Erreur prédiction', error);
            
            // Fallback: réponse simple
            return {
                result: `Je n'ai pas pu traiter votre demande: ${error.message}. Veuillez réessayer.`,
                confidence: 0.2,
                modelVersion: this.currentModel?.version || 'base',
                latency
            };
        }
    }
    
    /**
     * Calcule le score de confiance
     */
    private calculateConfidence(input: string, output: string, context?: InferenceContext): number {
        let score = 0.75; // Score de base
        
        // Facteur 1: Longueur de la question
        if (input.length < 10) {
            score -= 0.15;
        } else if (input.length > 50) {
            score += 0.05;
        }
        
        // Facteur 2: Longueur de la réponse
        if (output.length < 20) {
            score -= 0.1;
        } else if (output.length > 200) {
            score += 0.05;
        }
        
        // Facteur 3: Présence de documents contextuels
        if (context?.hasRelevantDocs) {
            score += 0.1;
        }
        
        if (context?.relevantSources && context.relevantSources.length > 2) {
            score += 0.05;
        }
        
        // Facteur 4: Niveau d'expertise utilisateur
        if (context?.userExpertise === 'expert') {
            score += 0.05;
        } else if (context?.userExpertise === 'débutant') {
            score -= 0.05;
        }
        
        // Facteur 5: Présence de mots techniques dans la réponse
        const technicalTerms = ['turbine', 'chaudière', 'pression', 'température', 'débit', 'rendement', 'kW', 'MW'];
        const technicalCount = technicalTerms.filter(term => output.toLowerCase().includes(term)).length;
        if (technicalCount > 2) {
            score += 0.05;
        }
        
        // Limiter entre 0.2 et 0.98
        return Math.min(0.98, Math.max(0.2, score));
    }
    
    /**
     * Met à jour les statistiques
     */
    private updateStats(confidence: number, latency: number, modelVersion: string): void {
        this.stats.totalPredictions++;
        this.stats.avgConfidence = 
            (this.stats.avgConfidence * (this.stats.totalPredictions - 1) + confidence) / this.stats.totalPredictions;
        this.stats.avgLatency = 
            (this.stats.avgLatency * (this.stats.totalPredictions - 1) + latency) / this.stats.totalPredictions;
        this.stats.lastPredictionTime = Date.now();
        this.stats.lastPredictionLatency = latency;
        
        const count = this.stats.modelVersions.get(modelVersion) || 0;
        this.stats.modelVersions.set(modelVersion, count + 1);
    }
    
    /**
     * Change le modèle actif
     */
    async setModel(modelVersion: string): Promise<boolean> {
        logInfo('Changement de modèle', { modelVersion });
        
        const model = await modelRegistry.getModel(modelVersion);
        if (!model) {
            logError('Modèle non trouvé', { modelVersion });
            return false;
        }
        
        this.currentModel = {
            name: model.name,
            version: model.version,
            path: model.path,
            metrics: model.metrics as any
        };
        
        logSuccess('Modèle changé', { modelVersion });
        return true;
    }
    
    /**
     * Récupère le modèle actuel
     */
    getCurrentModel(): TrainedModel | null {
        return this.currentModel;
    }
    
    /**
     * Vérifie si le moteur est prêt
     */
    isReady(): boolean {
        return this.isInitialized;
    }
    
    /**
     * Récupère les statistiques
     */
    getStats(): InferenceStats {
        return {
            ...this.stats,
            modelVersions: new Map(this.stats.modelVersions)
        };
    }
    
    /**
     * Réinitialise les statistiques
     */
    resetStats(): void {
        this.stats = {
            totalPredictions: 0,
            avgConfidence: 0,
            avgLatency: 0,
            modelVersions: new Map(),
            lastPredictionTime: null,
            lastPredictionLatency: null,
            errors: []
        };
        logSuccess('Statistiques réinitialisées');
    }
}

// Instance singleton
export const inferenceEngine = new InferenceEngine();