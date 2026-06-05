/**
 * @fileOverview TrainingDataCollector - Collecte des données d'entraînement multi-sources
 * @version 2.0.0
 * @lastUpdated 2026-04-02
 */

import { promises as fs } from 'fs';
import path from 'path';
import { TrainingExample } from './types';
import { ChromaDBManager } from '@/ai/vector/chromadb-manager';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[DATA-COLLECTOR]';

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
// INTERFACES
// ============================================================================

export interface CollectionSource {
    name: string;
    type: 'document' | 'chat' | 'correction' | 'action';
    priority: number;
    enabled: boolean;
}

export interface CollectionResult {
    source: string;
    count: number;
    duration: number;
    success: boolean;
    error?: string;
}

// ============================================================================
// CONFIGURATION DES SOURCES
// ============================================================================

const COLLECTION_SOURCES: CollectionSource[] = [
    { name: 'documents', type: 'document', priority: 2, enabled: true },
    { name: 'chats', type: 'chat', priority: 1, enabled: true },
    { name: 'corrections', type: 'correction', priority: 3, enabled: true },
    { name: 'actions', type: 'action', priority: 2, enabled: true }
];

// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

export class TrainingDataCollector {
    private chromaManager: ChromaDBManager;
    private lastTotalExamples: number = 0;
    
    constructor() {
        this.chromaManager = ChromaDBManager.getInstance();
        logInfo('TrainingDataCollector initialisé');
    }
    
    /**
     * Collecte toutes les données d'entraînement
     */
    async collectAll(): Promise<TrainingExample[]> {
        const startTime = Date.now();
        const examples: TrainingExample[] = [];
        const results: CollectionResult[] = [];
        
        logInfo('Démarrage de la collecte de données...');
        
        const sortedSources = [...COLLECTION_SOURCES].sort((a, b) => b.priority - a.priority);
        
        for (const source of sortedSources) {
            if (!source.enabled) continue;
            
            logInfo(`Collecte depuis la source "${source.name}"...`);
            const sourceStartTime = Date.now();
            
            try {
                let sourceExamples: TrainingExample[] = [];
                
                switch (source.type) {
                    case 'document':
                        sourceExamples = await this.extractFromDocuments();
                        break;
                    case 'chat':
                        sourceExamples = await this.extractFromChats();
                        break;
                    case 'correction':
                        sourceExamples = await this.extractFromCorrections();
                        break;
                    case 'action':
                        sourceExamples = await this.extractFromActions();
                        break;
                }
                
                examples.push(...sourceExamples);
                
                results.push({
                    source: source.name,
                    count: sourceExamples.length,
                    duration: Date.now() - sourceStartTime,
                    success: true
                });
                
                logSuccess(`Source "${source.name}": ${sourceExamples.length} exemples collectés`);
                
            } catch (error: any) {
                logError(`Erreur sur source "${source.name}"`, error);
                results.push({
                    source: source.name,
                    count: 0,
                    duration: Date.now() - sourceStartTime,
                    success: false,
                    error: error.message
                });
            }
        }
        
        const totalDuration = Date.now() - startTime;
        logSuccess(`Collecte terminée: ${examples.length} exemples en ${(totalDuration / 1000).toFixed(1)}s`, { results });
        
        this.lastTotalExamples = examples.length;
        return examples;
    }
    
    /**
     * Extrait des exemples depuis les documents
     */
    private async extractFromDocuments(): Promise<TrainingExample[]> {
        const examples: TrainingExample[] = [];
        const dataPath = path.join(process.cwd(), 'data', 'centrale_documents');
        
        try {
            await fs.access(dataPath);
            const files = await fs.readdir(dataPath);
            
            for (const file of files) {
                if (file.endsWith('.md') || file.endsWith('.txt')) {
                    const content = await fs.readFile(path.join(dataPath, file), 'utf-8');
                    
                    // Extraire les sections pertinentes
                    const sections = this.extractSections(content);
                    
                    for (const section of sections) {
                        examples.push({
                            id: `${file}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                            type: 'document_knowledge',
                            input: `Contenu du document ${file}: ${section.title || 'Extrait'}`,
                            output: section.content,
                            source: file,
                            weight: 1.0,
                            timestamp: Date.now(),
                            metadata: { fileName: file, section: section.title }
                        });
                    }
                }
            }
        } catch (error) {
            logError('Erreur extraction documents', error);
        }
        
        return examples;
    }
    
    /**
     * Extrait des sections d'un document
     */
    private extractSections(content: string): Array<{ title: string; content: string }> {
        const sections: Array<{ title: string; content: string }> = [];
        const lines = content.split('\n');
        let currentTitle = '';
        let currentContent: string[] = [];
        
        for (const line of lines) {
            if (line.startsWith('#') && line.length < 100) {
                if (currentContent.length > 0) {
                    sections.push({
                        title: currentTitle,
                        content: currentContent.join('\n').substring(0, 1000)
                    });
                    currentContent = [];
                }
                currentTitle = line.replace(/^#+\s*/, '').trim();
            } else if (line.trim()) {
                currentContent.push(line);
            }
        }
        
        if (currentContent.length > 0) {
            sections.push({
                title: currentTitle,
                content: currentContent.join('\n').substring(0, 1000)
            });
        }
        
        return sections;
    }
    
    /**
     * Extrait des exemples depuis les chats (mémoire épisodique)
     */
    private async extractFromChats(): Promise<TrainingExample[]> {
        const examples: TrainingExample[] = [];
        
        try {
            const results = await this.chromaManager.search('MEMOIRE_EPISODIQUE', 'RAG_SUCCESS', { nResults: 100 });
            
            for (let i = 0; i < results.documents.length; i++) {
                const content = results.documents[i];
                const metadata = results.metadatas[i] || {};
                
                if (content && content.length > 50) {
                    examples.push({
                        id: metadata.id || `chat_${Date.now()}_${i}`,
                        type: 'chat_success',
                        input: metadata.query || 'Question utilisateur',
                        output: content,
                        source: 'chromadb_episodic_memory',
                        rating: metadata.rating || 4,
                        weight: metadata.rating ? metadata.rating / 5 : 0.8,
                        timestamp: metadata.timestamp || Date.now(),
                        metadata
                    });
                }
            }
        } catch (error) {
            logError('Erreur extraction chats', error);
        }
        
        return examples;
    }
    
    /**
     * Extrait des exemples depuis les corrections utilisateur
     */
    private async extractFromCorrections(): Promise<TrainingExample[]> {
        const examples: TrainingExample[] = [];
        
        try {
            const results = await this.chromaManager.search('MEMOIRE_EPISODIQUE', 'LEÇON APPRISE', { nResults: 100 });
            
            for (let i = 0; i < results.documents.length; i++) {
                const content = results.documents[i];
                const metadata = results.metadatas[i] || {};
                
                if (content && metadata.correction) {
                    examples.push({
                        id: metadata.id || `correction_${Date.now()}_${i}`,
                        type: 'correction',
                        input: metadata.query || 'Question corrigée',
                        output: metadata.correction || content,
                        weight: 3.0, // Poids élevé pour les corrections
                        source: 'chromadb_user_corrections',
                        correction: metadata.correction,
                        timestamp: metadata.timestamp || Date.now(),
                        metadata
                    });
                }
            }
        } catch (error) {
            logError('Erreur extraction corrections', error);
        }
        
        return examples;
    }
    
    /**
     * Extrait des exemples depuis les actions
     */
    private async extractFromActions(): Promise<TrainingExample[]> {
        // Actions prédéfinies pour l'entraînement
        const actionExamples: TrainingExample[] = [
            {
                id: `action_calc_${Date.now()}`,
                type: 'action',
                input: "Calculer le rendement énergétique de la turbine TG1",
                output: "Le rendement se calcule par la formule: Puissance_sortie / Puissance_entrée × 100. Pour TG1, les valeurs nominales sont 95 MW pour 100 MW absorbés.",
                weight: 2.0,
                source: 'tool_execution_logs',
                timestamp: Date.now()
            },
            {
                id: `action_search_${Date.now()}`,
                type: 'action',
                input: "Rechercher la procédure de démarrage de la chaudière",
                output: "Utiliser l'outil de recherche avec les termes 'procédure démarrage chaudière CR1' pour trouver la documentation technique.",
                weight: 2.0,
                source: 'tool_execution_logs',
                timestamp: Date.now()
            },
            {
                id: `action_maintenance_${Date.now()}`,
                type: 'action',
                input: "Planifier la maintenance préventive du groupe turbo-alternateur",
                output: "Consulter le planning de maintenance dans le système GMAO. Intervalle recommandé: 8000 heures ou 1 an.",
                weight: 2.0,
                source: 'tool_execution_logs',
                timestamp: Date.now()
            }
        ];
        
        return actionExamples;
    }
    
    /**
     * Récupère les statistiques de collecte
     */
    getStats(): {
        collections: CollectionSource[];
        totalExamples: number;
        lastCollectionTime?: number;
    } {
        return {
            collections: COLLECTION_SOURCES,
            totalExamples: this.lastTotalExamples
        };
    }
}

// Instance singleton
export const trainingDataCollector = new TrainingDataCollector();

// Export pour compatibilité
export async function collectTrainingData(_context?: any): Promise<TrainingExample[]> {
    return trainingDataCollector.collectAll();
}