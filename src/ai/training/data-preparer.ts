/**
 * @fileOverview DataPreparer - Nettoyage et préparation des données pour l'entraînement
 * @version 2.0.0
 * @lastUpdated 2026-04-02
 */

import { TrainingExample } from './types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[DATA-PREPARER]';

function logInfo(message: string, data?: any): void {
    console.log(`${LOG_PREFIX} 📍 ${message}`);
    if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logSuccess(message: string, data?: any): void {
    console.log(`${LOG_PREFIX} ✅ ${message}`);
    if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}


// ============================================================================
// INTERFACES
// ============================================================================

export interface PreparedDataset {
    train: TrainingExample[];
    test: TrainingExample[];
    validation?: TrainingExample[];
    stats: {
        total: number;
        trainSize: number;
        testSize: number;
        validationSize: number;
        typesDistribution: Record<string, number>;
        averageWeight: number;
        minLength: number;
        maxLength: number;
    };
}

export interface PreparationOptions {
    trainRatio?: number;
    validationRatio?: number;
    minInputLength?: number;
    minOutputLength?: number;
    maxInputLength?: number;
    maxOutputLength?: number;
    weightThreshold?: number;
    balanceTypes?: boolean;
    augmentData?: boolean;
    augmentationFactor?: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const DEFAULT_OPTIONS: PreparationOptions = {
    trainRatio: 0.8,
    validationRatio: 0.1,
    minInputLength: 10,
    minOutputLength: 20,
    maxInputLength: 2000,
    maxOutputLength: 1000,
    weightThreshold: 0.5,
    balanceTypes: true,
    augmentData: true,
    augmentationFactor: 2
};

// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

export class DataPreparer {
    
    /**
     * Prépare le dataset pour l'entraînement
     */
    async prepare(
        rawData: TrainingExample[],
        options: PreparationOptions = {}
    ): Promise<PreparedDataset> {
        const startTime = Date.now();
        const opts = { ...DEFAULT_OPTIONS, ...options };
        
        logInfo('Démarrage de la préparation des données', {
            inputSize: rawData.length,
            options: opts
        });
        
        // 1. Nettoyage et filtrage
        let cleaned = this.cleanData(rawData, opts);
        logInfo(`Nettoyage: ${rawData.length} → ${cleaned.length} exemples`);
        
        // 2. Déduplication
        cleaned = this.deduplicate(cleaned);
        logInfo(`Déduplication: ${cleaned.length} exemples uniques`);
        
        // 3. Pondération
        cleaned = this.applyWeights(cleaned);
        
        // 4. Équilibrage des types
        if (opts.balanceTypes) {
            cleaned = this.balanceTypes(cleaned);
            logInfo(`Équilibrage: ${cleaned.length} exemples`);
        }
        
        // 5. Augmentation des données
        if (opts.augmentData) {
            const augmented = this.augmentData(cleaned, opts.augmentationFactor || 2);
            logInfo(`Augmentation: ${cleaned.length} → ${augmented.length} exemples`);
            cleaned = augmented;
        }
        
        // 6. Split en ensembles
        const split = this.splitData(cleaned, opts);
        
        // 7. Statistiques
        const stats = this.computeStats(cleaned, split, opts);
        
        const duration = Date.now() - startTime;
        logSuccess(`Préparation terminée en ${(duration / 1000).toFixed(1)}s`, stats);
        
        return {
            train: split.train,
            test: split.test,
            validation: split.validation,
            stats
        };
    }
    
    /**
     * Nettoie et filtre les données
     */
    private cleanData(data: TrainingExample[], options: PreparationOptions): TrainingExample[] {
        return data.filter(example => {
            // Vérifier les champs requis
            if (!example.input || !example.output) return false;
            if (typeof example.input !== 'string' || typeof example.output !== 'string') return false;
            
            // Vérifier les longueurs
            if (example.input.length < (options.minInputLength || 10)) return false;
            if (example.output.length < (options.minOutputLength || 20)) return false;
            if (example.input.length > (options.maxInputLength || 2000)) return false;
            if (example.output.length > (options.maxOutputLength || 1000)) return false;
            
            // Vérifier le poids
            if ((example.weight || 1) < (options.weightThreshold || 0.5)) return false;
            
            return true;
        });
    }
    
    /**
     * Déduplication basée sur le contenu
     */
    private deduplicate(data: TrainingExample[]): TrainingExample[] {
        const seen = new Map<string, TrainingExample>();
        
        for (const example of data) {
            const key = `${example.input.substring(0, 100)}|${example.output.substring(0, 100)}`;
            
            if (!seen.has(key)) {
                seen.set(key, example);
            } else {
                // Garder l'exemple avec le poids le plus élevé
                const existing = seen.get(key)!;
                if ((example.weight || 1) > (existing.weight || 1)) {
                    seen.set(key, example);
                }
            }
        }
        
        return Array.from(seen.values());
    }
    
    /**
     * Applique les poids aux exemples
     */
    private applyWeights(data: TrainingExample[]): TrainingExample[] {
        return data.map(example => {
            let weight = example.weight || 1.0;
            
            // Ajustement par type
            switch (example.type) {
                case 'correction':
                    weight *= 3.0;
                    break;
                case 'action':
                    weight *= 2.0;
                    break;
                case 'chat_success':
                    weight *= 1.5;
                    break;
                default:
                    weight *= 1.0;
            }
            
            // Ajustement par rating
            if (example.rating) {
                weight *= example.rating / 3;
            }
            
            return { ...example, weight: Math.min(weight, 5.0) };
        });
    }
    
    /**
     * Équilibre les types d'exemples
     */
    private balanceTypes(data: TrainingExample[]): TrainingExample[] {
        const typeCounts = new Map<string, number>();
        
        for (const example of data) {
            const count = typeCounts.get(example.type) || 0;
            typeCounts.set(example.type, count + 1);
        }
        
        const maxPerType = Math.max(...Array.from(typeCounts.values())) * 0.8;
        const balanced: TrainingExample[] = [];
        const typeSeen = new Map<string, number>();
        
        // Mélanger pour éviter l'ordre
        const shuffled = [...data].sort(() => Math.random() - 0.5);
        
        for (const example of shuffled) {
            const seen = typeSeen.get(example.type) || 0;
            if (seen < maxPerType) {
                balanced.push(example);
                typeSeen.set(example.type, seen + 1);
            }
        }
        
        return balanced;
    }
    
    /**
     * Augmente les données par transformation
     */
    private augmentData(data: TrainingExample[], factor: number): TrainingExample[] {
        const augmented = [...data];
        const targetSize = data.length * factor;
        
        while (augmented.length < targetSize) {
            const original = data[Math.floor(Math.random() * data.length)];
            const augmentedExample = this.createAugmentedExample(original);
            augmented.push(augmentedExample);
        }
        
        return augmented;
    }
    
    /**
     * Crée une version augmentée d'un exemple
     */
    private createAugmentedExample(original: TrainingExample): TrainingExample {
        // Variations simples pour l'augmentation
        const prefixes = [
            "Question technique: ",
            "Problème: ",
            "Besoin d'aide: ",
            "Demande: "
        ];
        
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        
        return {
            ...original,
            id: `${original.id}_aug_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            input: original.input.startsWith(prefix) ? original.input : `${prefix}${original.input}`,
            weight: (original.weight || 1) * 0.8 // Poids légèrement réduit pour les augmentations
        };
    }
    
    /**
     * Divise les données en ensembles train/test/validation
     */
    private splitData(
        data: TrainingExample[],
        options: PreparationOptions
    ): { train: TrainingExample[]; test: TrainingExample[]; validation: TrainingExample[] } {
        const shuffled = [...data].sort(() => Math.random() - 0.5);
        const trainRatio = options.trainRatio || 0.8;
        const validationRatio = options.validationRatio || 0.1;
        
        const trainSize = Math.floor(shuffled.length * trainRatio);
        const validationSize = Math.floor(shuffled.length * validationRatio);
        
        const train = shuffled.slice(0, trainSize);
        const validation = shuffled.slice(trainSize, trainSize + validationSize);
        const test = shuffled.slice(trainSize + validationSize);
        
        return { train, test, validation };
    }
    
    /**
     * Calcule les statistiques du dataset
     */
    private computeStats(
        data: TrainingExample[],
        split: { train: TrainingExample[]; test: TrainingExample[]; validation: TrainingExample[] },
        _options: PreparationOptions
    ): PreparedDataset['stats'] {
        const typesDistribution: Record<string, number> = {};
        
        for (const example of data) {
            typesDistribution[example.type] = (typesDistribution[example.type] || 0) + 1;
        }
        
        let totalLength = 0;
        let minLength = Infinity;
        let maxLength = 0;
        
        for (const example of data) {
            const length = example.input.length + example.output.length;
            totalLength += length;
            minLength = Math.min(minLength, length);
            maxLength = Math.max(maxLength, length);
        }
        
        const totalWeight = data.reduce((sum, e) => sum + (e.weight || 1), 0);
        
        return {
            total: data.length,
            trainSize: split.train.length,
            testSize: split.test.length,
            validationSize: split.validation.length,
            typesDistribution,
            averageWeight: totalWeight / data.length,
            minLength,
            maxLength
        };
    }
}

// Instance singleton
export const dataPreparer = new DataPreparer();

// Export pour compatibilité
export async function prepareDataset(rawData: TrainingExample[]): Promise<PreparedDataset> {
    return dataPreparer.prepare(rawData);
}