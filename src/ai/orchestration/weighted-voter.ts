/**
 * @fileOverview WeightedVoter - Système de vote pondéré pour la réponse finale
 * @version 1.2.0
 * @description Combine les réponses candidates par vote avec pondération par source
 * @innovation 5
 * @note Stateless - Aucune donnée persistante
 */

import type { SourceResult } from './multi-source-fetcher';

// ============================================================================
// TYPES
// ============================================================================

export interface VoteCandidate {
  id: string;
  content: string;
  sourceType: string;
  originalScore: number;
  weight: number;
  weightedVote: number;
  metadata: Record<string, any>;
}

export interface VoteResult {
  winner: VoteCandidate | null;
  allCandidates: VoteCandidate[];
  totalVotes: number;
  consensusScore: number;      // 0-1, niveau d'accord entre les sources
  voteDistribution: Record<string, number>;
  processingTime?: number;
}

export interface VoteOptions {
  deduplicate?: boolean;       // Éliminer les réponses similaires
  similarityThreshold?: number; // Seuil pour considérer deux réponses comme similaires
  minVotesToWin?: number;      // Nombre minimum de votes pour déclarer un gagnant
  fallbackToHighestScore?: boolean; // Si pas de consensus, prendre le plus haut score
  includeConfidence?: boolean;  // 🔥 NOUVEAU - Utiliser la confiance dans le vote
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_OPTIONS: VoteOptions = {
  deduplicate: true,
  similarityThreshold: 0.8,
  minVotesToWin: 2,
  fallbackToHighestScore: true,
  includeConfidence: true
};

// Poids par défaut selon le type de source (avec QR Index en priorité)
const SOURCE_VOTE_WEIGHTS: Record<string, number> = {
  qr_index: 1.8,    // 🔥 Haute précision
  cache: 1.5,
  nominal: 1.3,
  rag: 1.0,
  inverted: 0.7,
  vision: 0.5,
  training: 2.0     // 📚🎓 Données d'entraînement pré-préparées - POIDS MAXIMUM
};

// Bonus de confiance par recommandation
const CONFIDENCE_BONUS: Record<string, number> = {
  high: 0.15,
  medium: 0.05,
  low: 0,
  reject: -0.2
};

// ============================================================================
// LOGS STRUCTURÉS
// ============================================================================

const LOG_SEPARATOR = '═'.repeat(70);
const LOG_SUBSEPARATOR = '─'.repeat(50);

function logInfo(message: string, data?: any): void {
  console.log(`[VOTER] 📍 ${message}`);
  if (data) console.log(`[VOTER] 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logSuccess(message: string, data?: any): void {
  console.log(`[VOTER] ✅ ${message}`);
  if (data) console.log(`[VOTER] 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logWarning(message: string, data?: any): void {
  console.warn(`[VOTER] ⚠️ ${message}`);
  if (data) console.warn(`[VOTER] 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================================
// SERVICE
// ============================================================================

export class WeightedVoter {
  private options: VoteOptions;
  private sourceWeights: Record<string, number>;

  constructor(options?: Partial<VoteOptions>, customWeights?: Record<string, number>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.sourceWeights = { ...SOURCE_VOTE_WEIGHTS, ...customWeights };
  }

  /**
   * Normalise une chaîne pour comparaison
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Calcule la similarité entre deux textes (approche basée sur les mots-clés)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const normalized1 = this.normalizeText(text1);
    const normalized2 = this.normalizeText(text2);
    
    if (normalized1 === normalized2) return 1.0;
    
    const words1 = new Set(normalized1.split(/\s+/));
    const words2 = new Set(normalized2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Calcule le vote pondéré d'un candidat (intègre la confiance)
   */
  private calculateWeightedVote(candidate: VoteCandidate, confidence?: number, recommendation?: string): number {
    let vote = candidate.weightedVote;
    
    if (this.options.includeConfidence && confidence !== undefined) {
      // Bonus basé sur la recommandation
      const bonus = CONFIDENCE_BONUS[recommendation || 'medium'];
      vote = vote * (1 + bonus);
      
      // Bonus supplémentaire pour QR Index
      if (candidate.sourceType === 'qr_index') {
        vote = vote * 1.1;
      }
    }
    
    return Math.min(1.5, Math.max(0, vote));
  }

  /**
   * Déduplique les candidats similaires (garde celui avec le meilleur vote)
   */
  private deduplicateCandidates(candidates: VoteCandidate[]): VoteCandidate[] {
    const unique: VoteCandidate[] = [];
    const used = new Set<number>();
    
    for (let i = 0; i < candidates.length; i++) {
      if (used.has(i)) continue;
      
      let best = candidates[i];
      const similarIndices = [i];
      
      for (let j = i + 1; j < candidates.length; j++) {
        if (used.has(j)) continue;
        
        const similarity = this.calculateSimilarity(
          candidates[i].content,
          candidates[j].content
        );
        
        if (similarity >= (this.options.similarityThreshold || 0.8)) {
          similarIndices.push(j);
          if (candidates[j].weightedVote > best.weightedVote) {
            best = candidates[j];
          }
        }
      }
      
      for (const idx of similarIndices) {
        used.add(idx);
      }
      unique.push(best);
    }
    
    const removedCount = candidates.length - unique.length;
    if (removedCount > 0) {
      logInfo(`Déduplication: ${removedCount} candidats similaires fusionnés`);
    }
    
    return unique;
  }

  /**
   * Prépare les candidats à partir des résultats sources
   * 🔥 Version améliorée avec prise en compte de la confiance
   */
  prepareCandidates(sources: SourceResult[]): VoteCandidate[] {
    const candidates: VoteCandidate[] = [];
    
    for (const source of sources) {
      const contentHash = this.normalizeText(source.content).substring(0, 100);
      const candidateId = `${source.type}_${contentHash.replace(/\s+/g, '_')}`;
      
      // Calculer le vote pondéré avec confiance
      const weightedVote = this.calculateWeightedVote(
        source as any, 
        (source as any).confidence, 
        (source as any).recommendation
      );
      
      candidates.push({
        id: candidateId,
        content: source.content,
        sourceType: source.type,
        originalScore: source.score,
        weight: this.sourceWeights[source.type] || 1.0,
        weightedVote: weightedVote,
        metadata: {
          ...source.metadata,
          confidence: (source as any).confidence,
          recommendation: (source as any).recommendation
        }
      });
    }
    
    return candidates;
  }

  /**
   * Calcule la distribution des votes
   */
  private calculateVoteDistribution(candidates: VoteCandidate[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const candidate of candidates) {
      const key = this.normalizeText(candidate.content).substring(0, 50);
      distribution[key] = (distribution[key] || 0) + candidate.weightedVote;
    }
    
    return distribution;
  }

  /**
   * Calcule le score de consensus (niveau d'accord entre les sources)
   */
  private calculateConsensusScore(candidates: VoteCandidate[]): number {
    if (candidates.length <= 1) return 1.0;
    
    const totalVotes = candidates.reduce((sum, c) => sum + c.weightedVote, 0);
    if (totalVotes === 0) return 0;
    
    const maxVote = Math.max(...candidates.map(c => c.weightedVote));
    const topCandidates = candidates.filter(c => c.weightedVote === maxVote);
    
    if (topCandidates.length === 1) {
      const winnerVoteShare = maxVote / totalVotes;
      return Math.min(1, winnerVoteShare * 2);
    }
    
    return 0.3;
  }

  /**
   * Vote pondéré principal
   */
  async vote(
    sources: SourceResult[],
    options?: Partial<VoteOptions>
  ): Promise<VoteResult> {
    const startTime = Date.now();
    const opts = { ...this.options, ...options };
    
    console.log(`\n${LOG_SEPARATOR}`);
    logInfo(`🗳️ DÉBUT DU VOTE PONDÉRÉ`);
    logInfo(`📊 Sources reçues: ${sources.length}`);
    console.log(LOG_SUBSEPARATOR);
    
    // 1. Préparer les candidats
    let candidates = this.prepareCandidates(sources);
    logInfo(`📝 Candidats préparés: ${candidates.length}`);
    
    // Afficher la répartition des sources
    const sourceCount: Record<string, number> = {};
    for (const c of candidates) {
      sourceCount[c.sourceType] = (sourceCount[c.sourceType] || 0) + 1;
    }
    logInfo(`📊 Répartition: ${Object.entries(sourceCount).map(([k, v]) => `${k}:${v}`).join(', ')}`);
    
    // 2. Déduplication si demandée
    if (opts.deduplicate) {
      candidates = this.deduplicateCandidates(candidates);
      logInfo(`📝 Après déduplication: ${candidates.length}`);
    }
    
    // 3. Trier par vote pondéré
    candidates.sort((a, b) => b.weightedVote - a.weightedVote);
    
    // 4. Calculer la distribution
    const voteDistribution = this.calculateVoteDistribution(candidates);
    
    // 5. Calculer le score de consensus
    const consensusScore = this.calculateConsensusScore(candidates);
    
    // 6. Déterminer le gagnant
    let winner: VoteCandidate | null = null;
    
    if (candidates.length > 0) {
      const topCandidate = candidates[0];
      const topVoteShare = topCandidate.weightedVote / candidates.reduce((sum, c) => sum + c.weightedVote, 0);
      
      const hasEnoughVotes = topVoteShare >= 0.4 || (opts.minVotesToWin && candidates.length >= opts.minVotesToWin);
      
      if (hasEnoughVotes || opts.fallbackToHighestScore) {
        winner = topCandidate;
      }
    }
    
    const totalVotes = candidates.reduce((sum, c) => sum + c.weightedVote, 0);
    const processingTime = Date.now() - startTime;
    
    console.log(LOG_SUBSEPARATOR);
    logInfo(`📊 RÉSULTAT DU VOTE:`);
    logInfo(`   ├─ Total votes: ${totalVotes.toFixed(2)}`);
    logInfo(`   ├─ Consensus: ${(consensusScore * 100).toFixed(0)}%`);
    logInfo(`   └─ Gagnant: ${winner ? '✅ ' + winner.sourceType : '❌ Aucun'}`);
    
    if (winner) {
      logInfo(`   └─ Détails gagnant:`);
      logInfo(`       ├─ Type: ${winner.sourceType}`);
      logInfo(`       ├─ Score original: ${winner.originalScore.toFixed(3)}`);
      logInfo(`       ├─ Poids: ${winner.weight}`);
      logInfo(`       ├─ Vote pondéré: ${winner.weightedVote.toFixed(3)}`);
      if (winner.metadata?.confidence) {
        logInfo(`       ├─ Confiance: ${((winner.metadata.confidence || 0) * 100).toFixed(0)}%`);
      }
      if (winner.metadata?.filename) {
        logInfo(`       └─ Fichier: ${winner.metadata.filename}`);
      }
    }
    
    if (candidates.length > 0) {
      console.log(LOG_SUBSEPARATOR);
      logInfo(`📊 DÉTAIL DES VOTES:`);
      for (let i = 0; i < Math.min(candidates.length, 5); i++) {
        const c = candidates[i];
        const emoji = c.sourceType === 'qr_index'  ? '⭐' :
                      c.sourceType === 'cache'     ? '💾' :
                      c.sourceType === 'nominal'   ? '📁' :
                      c.sourceType === 'rag'       ? '🔍' :
                      c.sourceType === 'inverted'  ? '📚' :
                      c.sourceType === 'vision'    ? '🖼️' :
                      c.sourceType === 'training'  ? '📚🎓' : '❓';
        logInfo(`   ${emoji} ${c.sourceType.toUpperCase()}: vote=${c.weightedVote.toFixed(3)}, score=${(c.originalScore * 100).toFixed(0)}%`);
        if (c.metadata?.confidence) {
          logInfo(`       └─ confiance: ${((c.metadata.confidence || 0) * 100).toFixed(0)}%`);
        }
      }
      if (candidates.length > 5) {
        logInfo(`   ... et ${candidates.length - 5} autres candidats`);
      }
    }
    
    logSuccess(`Vote terminé en ${formatDuration(processingTime)}`);
    console.log(LOG_SEPARATOR);
    
    return {
      winner,
      allCandidates: candidates,
      totalVotes,
      consensusScore,
      voteDistribution,
      processingTime
    };
  }

  /**
   * Version simplifiée : retourne directement le meilleur candidat
   */
  async getWinner(sources: SourceResult[]): Promise<VoteCandidate | null> {
    const result = await this.vote(sources);
    return result.winner;
  }

  /**
   * Récupère les poids actuels des sources
   */
  getSourceWeights(): Record<string, number> {
    return { ...this.sourceWeights };
  }

  /**
   * Met à jour le poids d'une source
   */
  setSourceWeight(sourceType: string, weight: number): void {
    if (this.sourceWeights[sourceType] !== undefined) {
      this.sourceWeights[sourceType] = weight;
      logSuccess(`Poids mis à jour: ${sourceType} = ${weight}`);
    } else {
      logWarning(`Source non reconnue: ${sourceType}`);
    }
  }

  /**
   * Ajoute ou met à jour un poids pour une nouvelle source
   */
  addSourceWeight(sourceType: string, weight: number): void {
    this.sourceWeights[sourceType] = weight;
    logSuccess(`Nouvelle source ajoutée: ${sourceType} = ${weight}`);
  }

  /**
   * Réinitialise les poids aux valeurs par défaut
   */
  resetWeights(): void {
    this.sourceWeights = { ...SOURCE_VOTE_WEIGHTS };
    logSuccess(`Poids réinitialisés aux valeurs par défaut`);
  }

  /**
   * Récupère les statistiques de vote
   */
  getStats(): { sourceWeights: Record<string, number>; options: VoteOptions } {
    return {
      sourceWeights: { ...this.sourceWeights },
      options: { ...this.options }
    };
  }
}

export const weightedVoter = new WeightedVoter();

export default {
  WeightedVoter,
  weightedVoter
};