/**
 * @fileOverview ModelRegistry - Gestion des versions de modèles et déploiement
 * @version 2.0.0
 * @lastUpdated 2026-04-02
 */

import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[MODEL-REGISTRY]';
const REGISTRY_PATH = path.join(process.cwd(), 'data/models/registry.json');
const MODELS_DIR = path.join(process.cwd(), 'data/models');

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
// TYPES
// ============================================================================

export interface ModelVersion {
    id: string;
    name: string;
    version: string;
    path: string;
    accuracy: number;
    status: 'production' | 'backup' | 'candidate' | 'archived';
    deployedAt?: number;
    metrics?: {
        loss?: number;
        trainingTime?: string;
        samplesProcessed?: number;
        hallucinationRate?: number;
        instructionFollowing?: number;
        [key: string]: any;
    };
    metadata?: Record<string, any>;
}

// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

export class ModelRegistry {
    private registry: ModelVersion[] = [];
    private initialized: boolean = false;
    
    constructor() {
        this.init();
    }
    
    /**
     * Initialise le registre
     */
    private async init(): Promise<void> {
        try {
            await this.loadRegistry();
            this.initialized = true;
            logSuccess('Registre initialisé', { modelsCount: this.registry.length });
        } catch (error) {
            logError('Erreur initialisation registre', error);
            await this.createDefaultRegistry();
            this.initialized = true;
        }
    }
    
    /**
     * Charge le registre depuis le disque
     */
    private async loadRegistry(): Promise<void> {
        try {
            const data = await fs.readFile(REGISTRY_PATH, 'utf-8');
            this.registry = JSON.parse(data);
        } catch (error) {
            await this.createDefaultRegistry();
        }
    }
    
    /**
     * Sauvegarde le registre sur disque
     */
    private async saveRegistry(): Promise<void> {
        await fs.mkdir(path.dirname(REGISTRY_PATH), { recursive: true });
        await fs.writeFile(REGISTRY_PATH, JSON.stringify(this.registry, null, 2));
    }
    
    /**
     * Crée un registre par défaut
     */
    private async createDefaultRegistry(): Promise<void> {
        const defaultModel: ModelVersion = {
            id: 'v1-base',
            name: 'phi-2.7b-base',
            version: '1.0.0',
            path: 'ollama/phi:2.7b',
            accuracy: 0.72,
            status: 'production',
            deployedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
            metrics: {
                loss: 0.5,
                trainingTime: '0s',
                samplesProcessed: 0,
                hallucinationRate: 0.15,
                instructionFollowing: 0.85
            }
        };
        
        this.registry = [defaultModel];
        await this.saveRegistry();
        logInfo('Registre par défaut créé');
    }
    
    /**
     * Enregistre un nouveau modèle
     */
    async registerModel(
        modelPath: string,
        accuracy: number,
        metrics?: ModelVersion['metrics'],
        metadata?: Record<string, any>
    ): Promise<ModelVersion> {
        await this.ensureInitialized();
        
        const versionNumber = this.registry.length + 1;
        const modelId = `v${versionNumber}-${Date.now().toString().slice(-6)}`;
        
        const newVersion: ModelVersion = {
            id: modelId,
            name: `agentic-model-${modelId}`,
            version: `${versionNumber}.0.0`,
            path: modelPath,
            accuracy,
            status: 'candidate',
            metrics: {
                ...metrics,
                hallucinationRate: metrics?.hallucinationRate || 0.1,
                instructionFollowing: metrics?.instructionFollowing || 0.9
            },
            metadata
        };
        
        this.registry.push(newVersion);
        await this.saveRegistry();
        
        logSuccess('Modèle enregistré', { modelId, accuracy: `${(accuracy * 100).toFixed(1)}%` });
        
        return newVersion;
    }
    
    /**
     * Tente de déployer un modèle candidat
     */
    async deployCandidate(candidateId: string): Promise<boolean> {
        await this.ensureInitialized();
        
        const candidate = this.registry.find(m => m.id === candidateId);
        if (!candidate) {
            logError('Candidat non trouvé', { candidateId });
            return false;
        }
        
        if (candidate.status !== 'candidate') {
            logError('Le modèle n\'est pas un candidat', { candidateId, status: candidate.status });
            return false;
        }
        
        const currentProd = this.registry.find(m => m.status === 'production');
        
        if (!currentProd || candidate.accuracy > currentProd.accuracy) {
            // Déployer le nouveau modèle
            if (currentProd) {
                currentProd.status = 'backup';
                logInfo('Modèle précédent passé en backup', { modelId: currentProd.id });
            }
            
            candidate.status = 'production';
            candidate.deployedAt = Date.now();
            
            await this.saveRegistry();
            
            logSuccess('Modèle déployé en production', {
                modelId: candidate.id,
                accuracy: `${(candidate.accuracy * 100).toFixed(1)}%`,
                previousAccuracy: currentProd ? `${(currentProd.accuracy * 100).toFixed(1)}%` : 'N/A'
            });
            
            return true;
        } else {
            logInfo('Candidat non déployé (performance inférieure)', {
                candidateAccuracy: `${(candidate.accuracy * 100).toFixed(1)}%`,
                productionAccuracy: `${(currentProd.accuracy * 100).toFixed(1)}%`
            });
            
            candidate.status = 'archived';
            await this.saveRegistry();
            
            return false;
        }
    }
    
    /**
     * Récupère le modèle actif en production
     */
    async getCurrentActiveModel(): Promise<ModelVersion> {
        await this.ensureInitialized();
        
        const production = this.registry.find(m => m.status === 'production');
        if (production) return production;
        
        // Fallback sur le premier modèle
        return this.registry[0] || {
            id: 'fallback',
            name: 'fallback-model',
            version: '0.0.0',
            path: 'ollama/phi:2.7b',
            accuracy: 0.5,
            status: 'production',
            deployedAt: Date.now()
        };
    }
    
    /**
     * Liste tous les modèles
     */
    async listAllModels(): Promise<ModelVersion[]> {
        await this.ensureInitialized();
        return [...this.registry].sort((a, b) => (b.deployedAt || 0) - (a.deployedAt || 0));
    }
    
    /**
     * Liste les modèles par statut
     */
    async listModelsByStatus(status: ModelVersion['status']): Promise<ModelVersion[]> {
        await this.ensureInitialized();
        return this.registry.filter(m => m.status === status);
    }
    
    /**
     * Récupère un modèle par son ID
     */
    async getModel(id: string): Promise<ModelVersion | undefined> {
        await this.ensureInitialized();
        return this.registry.find(m => m.id === id);
    }
    
    /**
     * Met à jour un modèle
     */
    async updateModel(id: string, updates: Partial<ModelVersion>): Promise<ModelVersion | undefined> {
        await this.ensureInitialized();
        
        const index = this.registry.findIndex(m => m.id === id);
        if (index === -1) return undefined;
        
        this.registry[index] = { ...this.registry[index], ...updates };
        await this.saveRegistry();
        
        logInfo('Modèle mis à jour', { id, updates: Object.keys(updates) });
        
        return this.registry[index];
    }
    
    /**
     * Archive un modèle
     */
    async archiveModel(id: string): Promise<boolean> {
        await this.ensureInitialized();
        
        const model = this.registry.find(m => m.id === id);
        if (!model) return false;
        
        if (model.status === 'production') {
            logError('Impossible d\'archiver le modèle en production');
            return false;
        }
        
        model.status = 'archived';
        await this.saveRegistry();
        
        logInfo('Modèle archivé', { id });
        
        return true;
    }
    
    /**
     * Nettoie les modèles archivés trop anciens
     */
    async cleanupArchivedModels(maxAgeDays: number = 30): Promise<number> {
        await this.ensureInitialized();
        
        const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
        const archived = this.registry.filter(m => m.status === 'archived');
        
        let deletedCount = 0;
        
        for (const model of archived) {
            if (model.deployedAt && model.deployedAt < cutoff) {
                const index = this.registry.findIndex(m => m.id === model.id);
                if (index !== -1) {
                    this.registry.splice(index, 1);
                    deletedCount++;
                    
                    // Supprimer les fichiers du modèle
                    try {
                        const modelPath = path.join(MODELS_DIR, model.id);
                        await fs.rm(modelPath, { recursive: true, force: true });
                    } catch (e) {
                        // Ignorer les erreurs de suppression
                    }
                }
            }
        }
        
        if (deletedCount > 0) {
            await this.saveRegistry();
            logInfo('Nettoyage des modèles archivés', { deletedCount });
        }
        
        return deletedCount;
    }
    
    /**
     * Statistiques du registre
     */
    async getStats(): Promise<{
        totalModels: number;
        productionCount: number;
        backupCount: number;
        candidateCount: number;
        archivedCount: number;
        averageAccuracy: number;
        bestAccuracy: number;
        latestDeployment: ModelVersion | null;
    }> {
        await this.ensureInitialized();
        
        const production = this.registry.filter(m => m.status === 'production');
        const backup = this.registry.filter(m => m.status === 'backup');
        const candidate = this.registry.filter(m => m.status === 'candidate');
        const archived = this.registry.filter(m => m.status === 'archived');
        
        const accuracies = this.registry.map(m => m.accuracy);
        const averageAccuracy = accuracies.reduce((a, b) => a + b, 0) / (accuracies.length || 1);
        const bestAccuracy = Math.max(...accuracies, 0);
        
        const deployed = this.registry.filter(m => m.deployedAt);
        const latestDeployment = deployed.sort((a, b) => (b.deployedAt || 0) - (a.deployedAt || 0))[0] || null;
        
        return {
            totalModels: this.registry.length,
            productionCount: production.length,
            backupCount: backup.length,
            candidateCount: candidate.length,
            archivedCount: archived.length,
            averageAccuracy,
            bestAccuracy,
            latestDeployment
        };
    }
    
    /**
     * Vérifie que le registre est initialisé
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }
    }
}

// Instance singleton
export const modelRegistry = new ModelRegistry();

// Exports pour compatibilité
export async function registerAndDeployModel(
    modelPath: string,
    accuracy: number,
    metrics?: any
): Promise<boolean> {
    const model = await modelRegistry.registerModel(modelPath, accuracy, metrics);
    return modelRegistry.deployCandidate(model.id);
}

export async function getCurrentActiveModel(): Promise<ModelVersion> {
    return modelRegistry.getCurrentActiveModel();
}

export async function listAllModels(): Promise<ModelVersion[]> {
    return modelRegistry.listAllModels();
}