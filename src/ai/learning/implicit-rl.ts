/**
 * @fileOverview ImplicitRL - Innovation 26.
 * Apprentissage par renforcement basé sur les signaux implicites de l'utilisateur.
 * Version corrigée avec Core SQLite - Persistance définitive.
 * 
 * @version 4.0.0
 * @lastUpdated 2026-04-24
 */

import { implicitLogger } from './utils/logger';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// INTERFACES
// ============================================================================

export interface UserPreferenceProfile {
  conciseness: number;
  technicality: number;
  formality: number;
  creativity: number;
  lastUpdated: number;
  adaptationCount: number;
  history: string[];
}

export type RewardSignal = 
  | 'CORRECTION'
  | 'ACCEPTANCE'
  | 'REFORMULATION'
  | 'USAGE'
  | 'HESITATION';

export interface RewardSignalContext {
  isLong?: boolean;
  isTechnical?: boolean;
  modelUsed?: string;
  responseTime?: number;
  queryLength?: number;
  userId?: string;
}

export interface RewardStats {
  totalSignals: number;
  signalDistribution: Record<string, number>;
  averageReward: number;
  totalReward: number;
  lastSignal: RewardSignal | null;
  lastSignalTime: number | null;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const DEFAULT_PROFILE: UserPreferenceProfile = {
  conciseness: 0.5,
  technicality: 0.7,
  formality: 0.6,
  creativity: 0.4,
  lastUpdated: Date.now(),
  adaptationCount: 0,
  history: []
};

// ============================================================================
// INITIALISATION CORE SQLITE
// ============================================================================

const db = SQLiteCore.getInstance();
let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await db.initialize();
    initialized = true;
  }
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function getRewardValue(signal: RewardSignal): number {
  switch (signal) {
    case 'CORRECTION': return -2.0;
    case 'ACCEPTANCE': return 1.0;
    case 'REFORMULATION': return -1.0;
    case 'USAGE': return 1.5;
    case 'HESITATION': return -0.5;
    default: return 0;
  }
}

function getRewardEmoji(signal: RewardSignal): string {
  switch (signal) {
    case 'CORRECTION': return '🔴';
    case 'ACCEPTANCE': return '✅';
    case 'REFORMULATION': return '🟡';
    case 'USAGE': return '⭐';
    case 'HESITATION': return '⏳';
    default: return '❓';
  }
}

function getRewardLabel(signal: RewardSignal): string {
  switch (signal) {
    case 'CORRECTION': return 'Correction (forte négative)';
    case 'ACCEPTANCE': return 'Acceptation (positive)';
    case 'REFORMULATION': return 'Reformulation (négative)';
    case 'USAGE': return 'Utilisation outil (forte positive)';
    case 'HESITATION': return 'Hésitation (faible négative)';
    default: return 'Inconnu';
  }
}

function formatReward(reward: number): string {
  const sign = reward > 0 ? '+' : '';
  return `${sign}${reward.toFixed(1)}`;
}

async function updateSignalStats(signal: RewardSignal, reward: number): Promise<void> {
  await ensureInitialized();
  await db.recordMetric('implicit_rl', 'signal', 1);
  await db.recordMetric('implicit_rl', `signal_${signal}`, 1);
  await db.recordMetric('implicit_rl', 'reward_total', reward);
}

// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

export class ImplicitRLEngine {
  private profile: UserPreferenceProfile;
  private learningRate = 0.05;
  private userId: string = 'default';
  private adaptationHistory: { timestamp: number; oldProfile: UserPreferenceProfile; newProfile: UserPreferenceProfile }[] = [];

  constructor() {
    this.profile = { ...DEFAULT_PROFILE };
  }

  async initialize(userId: string = 'default'): Promise<void> {
    await ensureInitialized();
    this.userId = userId;
    await this.loadProfile();
  }

  async processSignal(signal: RewardSignal, context: RewardSignalContext = {}): Promise<void> {
    await ensureInitialized();
    
    const startTime = Date.now();
    const reward = getRewardValue(signal);
    
    implicitLogger.info('SIGNAL', `${getRewardEmoji(signal)} Signal reçu: ${getRewardLabel(signal)} (récompense: ${formatReward(reward)})`);
    
    const oldProfile = { ...this.profile };
    
    this.adjustProfile(context, reward);
    
    if (!this.profile.history) this.profile.history = [];
    this.profile.history.push(signal);
    if (this.profile.history.length > 100) this.profile.history.shift();
    
    this.profile.adaptationCount++;
    this.profile.lastUpdated = Date.now();
    
    await updateSignalStats(signal, reward);
    
    this.adaptationHistory.push({
      timestamp: Date.now(),
      oldProfile,
      newProfile: { ...this.profile }
    });
    if (this.adaptationHistory.length > 50) this.adaptationHistory.shift();
    
    await this.saveProfile();
    
    const elapsedTime = Date.now() - startTime;
    
    implicitLogger.success('SIGNAL', `Profil mis à jour en ${formatDuration(elapsedTime)} - Concision: ${Math.round(this.profile.conciseness * 100)}%, Technicité: ${Math.round(this.profile.technicality * 100)}%, Créativité: ${Math.round(this.profile.creativity * 100)}%`);
  }

  private adjustProfile(context: RewardSignalContext, weight: number): void {
    const impact = this.learningRate * Math.abs(weight);
    const oldConciseness = this.profile.conciseness;
    
    if (weight < 0) {
      if (context.isLong) {
        this.profile.conciseness = Math.min(1, this.profile.conciseness + impact);
      } else {
        this.profile.conciseness = Math.max(0, this.profile.conciseness - impact);
      }
      this.profile.creativity = Math.min(1, this.profile.creativity + 0.05);
      
      implicitLogger.info('ADAPT', `Récompense négative: concision ${Math.round(oldConciseness * 100)}% → ${Math.round(this.profile.conciseness * 100)}%`);
    } else {
      if (context.isLong) {
        this.profile.conciseness = Math.max(0, this.profile.conciseness - impact);
      } else {
        this.profile.conciseness = Math.min(1, this.profile.conciseness + impact);
      }
      this.profile.creativity = Math.max(0, this.profile.creativity - 0.03);
      
      implicitLogger.info('ADAPT', `Récompense positive: concision ${Math.round(oldConciseness * 100)}% → ${Math.round(this.profile.conciseness * 100)}%`);
    }
    
    if (context.isTechnical !== undefined) {
      if (weight > 0 && context.isTechnical) {
        this.profile.technicality = Math.min(1, this.profile.technicality + 0.03);
      } else if (weight < 0 && !context.isTechnical) {
        this.profile.technicality = Math.max(0, this.profile.technicality - 0.03);
      }
    }
    
    this.profile.conciseness = Math.min(1, Math.max(0, this.profile.conciseness));
    this.profile.technicality = Math.min(1, Math.max(0, this.profile.technicality));
    this.profile.creativity = Math.min(1, Math.max(0, this.profile.creativity));
    
    this.profile.conciseness = Number(this.profile.conciseness.toFixed(3));
    this.profile.technicality = Number(this.profile.technicality.toFixed(3));
    this.profile.creativity = Number(this.profile.creativity.toFixed(3));
    this.profile.formality = Number(this.profile.formality.toFixed(3));
  }

  getSystemDirective(): string {
    const p = this.profile;
    let directive = "\n[POLITIQUE APPRISE (INNOVATION 26)] : ";
    
    if (p.conciseness > 0.75) {
      directive += "Sois extrêmement laconique. ";
    } else if (p.conciseness < 0.25) {
      directive += "Fournis des explications très détaillées et pédagogiques. ";
    } else {
      directive += "Sois équilibré dans la longueur des réponses. ";
    }
    
    if (p.technicality > 0.8) {
      directive += "Utilise un langage technique de haut niveau, sans vulgarisation. ";
    } else if (p.technicality < 0.3) {
      directive += "Explique les termes complexes simplement (vulgarisation). ";
    } else {
      directive += "Utilise un langage technique modéré, vulgarise les termes complexes. ";
    }
    
    if (p.creativity > 0.7) {
      directive += "Propose des solutions innovantes et hors-pistes. ";
    } else if (p.creativity < 0.3) {
      directive += "Reste strictement factuel et conservateur. ";
    } else {
      directive += "Propose des solutions standard éprouvées. ";
    }
    
    implicitLogger.info('DIRECTIVE', `Directive générée (concision: ${Math.round(p.conciseness * 100)}%, technicité: ${Math.round(p.technicality * 100)}%)`);
    
    return directive;
  }

  private async saveProfile(): Promise<void> {
    await ensureInitialized();
    try {
      await db.learning.saveProfile(this.userId, this.profile);
      implicitLogger.info('SAVE', 'Profil sauvegardé en SQLite');
    } catch (error: unknown) {
      const err = error as Error;
      implicitLogger.warning('SAVE', `Erreur sauvegarde: ${err.message}`);
    }
  }

  private async loadProfile(): Promise<void> {
    await ensureInitialized();
    try {
      const stored = await db.learning.getProfile(this.userId);
      if (stored) {
        this.profile = { ...DEFAULT_PROFILE, ...stored };
        if (!this.profile.history) this.profile.history = [];
        if (!this.profile.adaptationCount) this.profile.adaptationCount = 0;
        implicitLogger.success('LOAD', `Profil chargé - Concision: ${Math.round(this.profile.conciseness * 100)}%, Technicité: ${Math.round(this.profile.technicality * 100)}%, Adaptations: ${this.profile.adaptationCount}`);
      } else {
        await this.saveProfile();
        implicitLogger.info('LOAD', 'Nouveau profil créé');
      }
    } catch (error: unknown) {
      const err = error as Error;
      implicitLogger.warning('LOAD', `Erreur chargement: ${err.message}`);
    }
  }

  async resetProfile(): Promise<void> {
    const oldProfile = { ...this.profile };
    this.profile = { ...DEFAULT_PROFILE, lastUpdated: Date.now(), adaptationCount: 0, history: [] };
    await this.saveProfile();
    
    implicitLogger.success('RESET', `Profil réinitialisé - Avant: ${Math.round(oldProfile.conciseness * 100)}% → Après: 50%`);
  }

  getProfile(): UserPreferenceProfile {
    return { ...this.profile };
  }

  async getStats(): Promise<RewardStats & {
    profileChanges: number;
    adaptationHistoryLength: number;
    recentErrors: string[];
  }> {
    await ensureInitialized();
    
    // Récupérer les métriques depuis SQLite
    let totalSignals = 0;
    const signalDistribution: Record<string, number> = {};
    let totalReward = 0;
    let lastSignal: RewardSignal | null = null;
    let lastSignalTime: number | null = null;
    
    try {
      // Simplifié - les métriques détaillées peuvent être ajoutées ultérieurement
      totalSignals = this.profile.adaptationCount;
      totalReward = 0; // À calculer si besoin
    } catch (error) {
      implicitLogger.warning('STATS', `Erreur récupération stats: ${error}`);
    }
    
    const averageReward = totalSignals > 0 ? totalReward / totalSignals : 0;
    
    return {
      totalSignals,
      signalDistribution,
      averageReward: Math.round(averageReward * 100) / 100,
      totalReward: Math.round(totalReward * 100) / 100,
      lastSignal,
      lastSignalTime,
      profileChanges: this.profile.adaptationCount,
      adaptationHistoryLength: this.adaptationHistory.length,
      recentErrors: []
    };
  }

  getAdaptationHistory(): { timestamp: number; oldProfile: UserPreferenceProfile; newProfile: UserPreferenceProfile }[] {
    return [...this.adaptationHistory];
  }

  setLearningRate(rate: number): void {
    this.learningRate = Math.min(0.2, Math.max(0.01, rate));
    implicitLogger.info('LEARNING', `Taux d'apprentissage: ${this.learningRate}`);
  }

  setUserId(userId: string): void {
    this.userId = userId;
    this.loadProfile();
  }
}

export const implicitRL = new ImplicitRLEngine();

export default implicitRL;