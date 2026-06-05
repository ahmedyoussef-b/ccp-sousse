/**
 * @fileOverview PersonalizedRecommender - Système de recommandation personnalisée
 * @version 2.0.0
 * @lastUpdated 2026-04-02
 */

import { Recommendation, RecommendationContext, UserProfile, Candidate } from './types';  // Suppression de ScoredCandidate
import { ChromaDBManager } from '@/ai/vector/chromadb-manager';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[RECOMMENDER]';

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

export interface RecommendationResult {
    recommendations: Recommendation[];
    processingTime: number;
    candidatesEvaluated: number;
    topScore: number;
}

// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

export class PersonalizedRecommender {
    private userProfileCache: Map<string, { profile: UserProfile; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 3600000; // 1 heure
    private chromaManager: ChromaDBManager;
    
    constructor() {
        this.chromaManager = ChromaDBManager.getInstance();
        logInfo('Recommandeur personnalisé initialisé');
    }
    
    /**
     * Génère des recommandations contextuelles
     */
    async recommend(userId: string, context: RecommendationContext): Promise<RecommendationResult> {
        const startTime = Date.now();
        
        logInfo(`Génération de recommandations pour ${userId}`, { domain: context.domain });
        
        try {
            // 1. Profil utilisateur
            const profile = await this.getUserProfile(userId);
            
            // 2. Candidats depuis la base vectorielle
            const candidates = await this.getCandidates(profile, context);
            
            if (candidates.length === 0) {
                logInfo('Aucun candidat trouvé');
                return {
                    recommendations: [],
                    processingTime: Date.now() - startTime,
                    candidatesEvaluated: 0,
                    topScore: 0
                };
            }
            
            // 3. Scoring
            const scored = candidates.map(candidate => ({
                ...candidate,
                score: this.calculateScore(candidate, profile, context),
                reasons: this.generateReasons(candidate, profile, context)
            }));
            
            const sorted = scored.sort((a, b) => b.score - a.score);
            const limit = context.limit || 3;
            const topRecommendations = sorted.slice(0, limit);
            
            const recommendations: Recommendation[] = topRecommendations.map(r => ({
                id: r.id,
                title: r.title,
                description: r.description,
                category: r.category,
                confidence: r.score,
                reasons: r.reasons
            }));
            
            const processingTime = Date.now() - startTime;
            const topScore = recommendations.length > 0 ? recommendations[0].confidence : 0;
            
            logSuccess(`${recommendations.length} recommandations générées`, {
                temps: `${processingTime}ms`,
                topScore: `${Math.round(topScore * 100)}%`
            });
            
            return {
                recommendations,
                processingTime,
                candidatesEvaluated: candidates.length,
                topScore
            };
            
        } catch (error: any) {
            logError('Erreur recommandation', error);
            return {
                recommendations: [],
                processingTime: Date.now() - startTime,
                candidatesEvaluated: 0,
                topScore: 0
            };
        }
    }
    
    /**
     * Récupère les candidats depuis ChromaDB
     */
    private async getCandidates(profile: UserProfile, context: RecommendationContext): Promise<Candidate[]> {
        const candidates: Candidate[] = [];
        const collections = this.getRelevantCollections(profile, context);
        
        for (const collectionName of collections) {
            try {
                const query = this.buildSearchQuery(profile, context);
                if (!query) continue;
                
                const results = await this.chromaManager.search(collectionName as any, query, {
                    nResults: 10
                });
                
                for (let i = 0; i < results.documents.length; i++) {
                    const doc = results.documents[i];
                    const metadata = results.metadatas[i] || {};
                    const distance = results.distances[i] || 0;
                    const score = 1 - Math.min(1, distance / 2);
                    
                    candidates.push({
                        id: metadata.id || `rec_${Date.now()}_${i}`,
                        title: metadata.title || this.extractTitle(doc),
                        description: doc.substring(0, 300),
                        category: this.determineCategory(metadata, collectionName),
                        confidence: score
                    });
                }
            } catch (error) {
                logError(`Erreur recherche dans ${collectionName}`, error);
            }
        }
        
        return candidates;
    }
    
    /**
     * Détermine les collections pertinentes
     */
    private getRelevantCollections(profile: UserProfile, context: RecommendationContext): string[] {
        const collections: string[] = [];
        
        // Basé sur le contexte
        if (context.domain === 'tg1' || context.domain === 'tg2') {
            collections.push('centrale_equipements_principaux');
        }
        if (context.domain === 'demarrage' || context.domain === 'arret') {
            collections.push('centrale_procedures');
        }
        if (context.domain === 'maintenance') {
            collections.push('centrale_maintenance');
        }
        if (context.domain === 'securite') {
            collections.push('centrale_securite');
        }
        
        // Basé sur les intérêts
        if (profile.interests.includes('formation')) {
            collections.push('centrale_formation');
        }
        if (profile.interests.includes('performance')) {
            collections.push('centrale_analyse_performance');
        }
        
        // Collection par défaut
        if (collections.length === 0) {
            collections.push('centrale_documents_generaux');
        }
        
        return [...new Set(collections)];
    }
    
    /**
     * Construit la requête de recherche
     */
    private buildSearchQuery(profile: UserProfile, context: RecommendationContext): string | null {
        const parts: string[] = [];
        
        if (context.domain) parts.push(context.domain);
        if (context.query) parts.push(context.query);
        if (profile.interests.length > 0) parts.push(profile.interests.slice(0, 2).join(' '));
        
        return parts.length > 0 ? parts.join(' ') : null;
    }
    
    /**
     * Extrait un titre du contenu
     */
    private extractTitle(content: string): string {
        const firstLine = content.split('\n')[0];
        if (firstLine.length > 50) {
            return firstLine.substring(0, 47) + '...';
        }
        return firstLine;
    }
    
    /**
     * Détermine la catégorie
     */
    private determineCategory(metadata: Record<string, any>, collectionName: string): string {
        if (metadata.category) return metadata.category;
        
        const categoryMap: Record<string, string> = {
            'centrale_equipements_principaux': 'Documentation Technique',
            'centrale_procedures': 'Procédures',
            'centrale_maintenance': 'Maintenance',
            'centrale_securite': 'Sécurité',
            'centrale_formation': 'Formation',
            'centrale_analyse_performance': 'Analyse de Performance',
            'centrale_documents_generaux': 'Documentation Générale'
        };
        
        return categoryMap[collectionName] || 'Documentation';
    }
    
    /**
     * Calcule le score de correspondance
     */
    private calculateScore(candidate: Candidate, profile: UserProfile, context: RecommendationContext): number {
        let score = candidate.confidence;
        
        // Bonus par intérêts
        const matchingInterests = profile.interests.filter(interest =>
            candidate.category.toLowerCase().includes(interest) ||
            candidate.title.toLowerCase().includes(interest)
        );
        score += 0.05 * Math.min(matchingInterests.length, 3);
        
        // Bonus par expertise
        if (profile.expertise === 'expert' && (candidate.category === 'Analyse de Performance' || candidate.category === 'Documentation Technique')) {
            score += 0.08;
        } else if (profile.expertise === 'beginner' && candidate.category === 'Formation') {
            score += 0.1;
        }
        
        // Bonus par domaine contextuel
        if (context.domain && candidate.category.toLowerCase().includes(context.domain)) {
            score += 0.12;
        }
        
        return Math.min(score, 1.0);
    }
    
    /**
     * Génère les raisons de la recommandation
     */
    private generateReasons(candidate: Candidate, profile: UserProfile, context: RecommendationContext): string[] {
        const reasons: string[] = [];
        
        // Par intérêts
        const matchingInterests = profile.interests.filter(interest =>
            candidate.category.toLowerCase().includes(interest)
        );
        if (matchingInterests.length > 0) {
            reasons.push(`Basé sur vos intérêts: ${matchingInterests.slice(0, 2).join(', ')}`);
        }
        
        // Par expertise
        if (profile.expertise === 'beginner' && candidate.category === 'Formation') {
            reasons.push("Adapté aux débutants");
        } else if (profile.expertise === 'expert' && candidate.category !== 'Formation') {
            reasons.push("Contenu technique avancé");
        }
        
        // Par contexte
        if (context.domain && candidate.category.toLowerCase().includes(context.domain)) {
            reasons.push(`Lié à votre activité (${context.domain})`);
        }
        
        if (reasons.length === 0) {
            reasons.push("Sujet pertinent pour votre profil");
        }
        
        return reasons;
    }
    
    /**
     * Récupère le profil utilisateur
     */
    private async getUserProfile(userId: string): Promise<UserProfile> {
        // Vérifier le cache
        const cached = this.userProfileCache.get(userId);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.profile;
        }
        
        // Profil par défaut
        const defaultProfile: UserProfile = {
            userId,
            interests: ['maintenance', 'sécurité', 'performance'],
            expertise: 'intermediate',
            preferences: { conciseness: 0.5, detailLevel: 'medium' },
            recentTopics: ['maintenance', 'performance', 'sécurité'],
            documentTypes: ['manuel', 'procédure', 'guide'],
            lastUpdated: Date.now()
        };
        
        // Mise en cache
        this.userProfileCache.set(userId, { profile: defaultProfile, timestamp: Date.now() });
        
        return defaultProfile;
    }
    
    /**
     * Rafraîchit le profil
     */
    async refreshProfile(userId: string): Promise<void> {
        this.userProfileCache.delete(userId);
        logInfo(`Profil ${userId} rafraîchi`);
    }
}

// Instance singleton
export const personalizedRecommender = new PersonalizedRecommender();