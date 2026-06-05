/**
 * @fileOverview SpacedRepetition - Innovation 29.
 * Gère la planification des révisions pour optimiser la rétention à long terme.
 * Version corrigée avec Core SQLite - Persistance définitive.
 * 
 * @version 4.0.0
 * @lastUpdated 2026-04-24
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { spacedLogger } from './utils/logger';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// INTERFACES
// ============================================================================

export interface KnowledgeItem {
  id: string;
  content: string;
  concept: string;
  stability: number;
  difficulty: number;
  lastReview: number;
  nextReview: number;
  reviewsCount: number;
  tags: string[];
  domain: string;
}

export interface ReviewStats {
  totalItems: number;
  itemsDueToday: number;
  averageStability: number;
  averageDifficulty: number;
  totalReviews: number;
  successRate: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const MAX_ITEMS = 1000;

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

function formatDays(days: number): string {
  if (days < 1) return `${Math.round(days * 24)}h`;
  return `${Math.round(days)}j`;
}

function generateItemId(): string {
  return `sr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function getPerformanceEmoji(performance: number): string {
  if (performance >= 0.9) return '🌟';
  if (performance >= 0.7) return '👍';
  if (performance >= 0.5) return '😐';
  return '🔴';
}

function getPerformanceLabel(performance: number): string {
  if (performance >= 0.9) return 'Parfait';
  if (performance >= 0.7) return 'Bon';
  if (performance >= 0.5) return 'Moyen';
  if (performance >= 0.3) return 'Faible';
  return 'Oubli';
}

// ============================================================================
// MÉTRIQUES (via Core SQLite)
// ============================================================================

async function updateItemStats(): Promise<void> {
  await ensureInitialized();
  await db.recordMetric('spaced_repetition', 'item_created', 1);
}

async function updateReviewStats(success: boolean): Promise<void> {
  await ensureInitialized();
  await db.recordMetric('spaced_repetition', 'review', success ? 1 : 0);
}

// ============================================================================
// CALCUL DU PROCHAIN INTERVALLE
// ============================================================================

export async function calculateNextReview(
  item: KnowledgeItem, 
  performance: number
): Promise<KnowledgeItem> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  spacedLogger.info('CALCULATE', `🔄 Calcul du prochain intervalle pour "${item.concept}" - Performance: ${getPerformanceEmoji(performance)} ${getPerformanceLabel(performance)} (${Math.round(performance * 100)}%)`);
  spacedLogger.metric('CALCULATE', 'Stabilité actuelle', formatDays(item.stability));
  spacedLogger.metric('CALCULATE', 'Difficulté actuelle', `${Math.round(item.difficulty * 100)}%`);
  
  let newDifficulty = item.difficulty + (0.1 - (1 - performance) * (1 - performance) * 0.15);
  newDifficulty = Math.max(0.1, Math.min(1.0, newDifficulty));
  
  let newStability: number;
  
  if (performance < 0.6) {
    newStability = 1;
    spacedLogger.info('CALCULATE', 'Performance faible, réinitialisation à 1 jour');
  } else {
    if (item.reviewsCount === 0) {
      newStability = 1;
    } else if (item.reviewsCount === 1) {
      newStability = 6;
    } else {
      const growthFactor = 2.5 - newDifficulty * 1.5;
      newStability = Math.round(item.stability * growthFactor);
      spacedLogger.metric('CALCULATE', 'Facteur croissance', growthFactor.toFixed(2));
    }
  }
  
  newStability = Math.min(newStability, 365);
  
  const updatedItem: KnowledgeItem = {
    ...item,
    stability: newStability,
    difficulty: newDifficulty,
    lastReview: Date.now(),
    nextReview: Date.now() + (newStability * 24 * 60 * 60 * 1000),
    reviewsCount: item.reviewsCount + 1
  };
  
  await db.learning.updateKnowledgeItem(updatedItem.id, updatedItem);
  await updateReviewStats(performance >= 0.6);
  
  const elapsedTime = Date.now() - startTime;
  spacedLogger.success('CALCULATE', `Nouvel intervalle calculé en ${formatDuration(elapsedTime)} - Nouvelle stabilité: ${formatDays(newStability)}, Prochaine révision: ${new Date(updatedItem.nextReview).toLocaleDateString('fr-FR')}`);
  
  return updatedItem;
}

export async function getPendingReviews(limit: number = 2): Promise<KnowledgeItem[]> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  spacedLogger.info('PENDING', `🔍 Recherche des révisions en attente`);
  
  const items = await db.learning.getKnowledgeItems(true);
  const selected = items.slice(0, limit);
  
  const elapsedTime = Date.now() - startTime;
  
  if (items.length > 0) {
    spacedLogger.success('PENDING', `${items.length} révision(s) en attente, ${selected.length} sélectionnée(s) - ${formatDuration(elapsedTime)}`);
    for (const it of selected) {
      const now = Date.now();
      const overdue = (now - it.nextReview) / (24 * 60 * 60 * 1000);
      spacedLogger.metric('PENDING', `- ${it.concept}`, `${formatDays(it.stability)} d'intervalle, ${overdue > 0 ? `${formatDays(overdue)} de retard` : 'à jour'}`);
    }
  } else {
    spacedLogger.info('PENDING', `Aucune révision en attente (${formatDuration(elapsedTime)})`);
  }
  
  return selected;
}

export async function generateReviewQuestion(content: string, concept: string): Promise<string> {
  const startTime = Date.now();
  
  spacedLogger.info('QUESTION', `📝 Génération de question de révision pour: "${concept}" - Contenu: ${content.length} caractères`);
  
  try {
    const userPrompt = `Concept: ${concept}
Information technique: ${content.substring(0, 500)}

Question de réactivation (max 15 mots):`;

    const response = await callOllama(userPrompt, {
      model: 'tinyllama:1.1b',
      temperature: 0.5,
      maxTokens: 100,
      timeout: 10000
    });
    
    const question = response.trim();
    const elapsedTime = Date.now() - startTime;
    spacedLogger.success('QUESTION', `Question générée en ${formatDuration(elapsedTime)} - "${question.substring(0, 80)}"`);
    
    return question;
    
  } catch (error: unknown) {
    const elapsedTime = Date.now() - startTime;
    spacedLogger.warning('QUESTION', `Échec génération après ${formatDuration(elapsedTime)}, utilisation fallback`);
    
    return `Question de révision sur "${concept}" : Pouvez-vous résumer son importance technique ?`;
  }
}

export async function createKnowledgeItem(
  content: string,
  concept: string,
  domain: string = 'general',
  tags: string[] = []
): Promise<KnowledgeItem> {
  await ensureInitialized();
  
  const startTime = Date.now();
  
  spacedLogger.info('CREATE', `📚 Création d'un élément de connaissance: "${concept}" - Domaine: ${domain}`);
  
  const item: KnowledgeItem = {
    id: generateItemId(),
    content: content.substring(0, 1000),
    concept,
    stability: 1,
    difficulty: 0.5,
    lastReview: Date.now(),
    nextReview: Date.now() + (24 * 60 * 60 * 1000),
    reviewsCount: 0,
    tags,
    domain
  };
  
  await db.learning.saveKnowledgeItem(item);
  await updateItemStats();
  
  const allItems = await db.learning.getKnowledgeItems();
  if (allItems.length > MAX_ITEMS) {
    const toDelete = allItems.slice(MAX_ITEMS);
    for (const oldItem of toDelete) {
      await db.learning.deleteKnowledgeItem(oldItem.id);
    }
    spacedLogger.info('CREATE', `Nettoyage: ${toDelete.length} anciens éléments supprimés`);
  }
  
  const elapsedTime = Date.now() - startTime;
  spacedLogger.success('CREATE', `Élément créé en ${formatDuration(elapsedTime)} - ID: ${item.id}, Prochaine révision: ${new Date(item.nextReview).toLocaleDateString('fr-FR')}`);
  
  return item;
}

export async function getReviewStats(): Promise<ReviewStats> {
  await ensureInitialized();
  
  const allItems = await db.learning.getKnowledgeItems();
  const now = Date.now();
  const itemsDueToday = allItems.filter(item => item.nextReview <= now).length;
  
  const avgStability = allItems.length > 0 
    ? allItems.reduce((sum, item) => sum + item.stability, 0) / allItems.length 
    : 0;
  const avgDifficulty = allItems.length > 0 
    ? allItems.reduce((sum, item) => sum + item.difficulty, 0) / allItems.length 
    : 0;
  const totalReviews = allItems.reduce((sum, item) => sum + item.reviewsCount, 0);
  
  let successRate = 0;
  if (allItems.length > 0) {
    const successfulItems = allItems.filter(item => item.stability > 1 || item.reviewsCount > 0).length;
    successRate = successfulItems / allItems.length;
  }
  
  spacedLogger.info('STATS', `Statistiques de révision - Total: ${allItems.length}, À réviser: ${itemsDueToday}, Stabilité moyenne: ${formatDays(avgStability)}, Taux succès: ${Math.round(successRate * 100)}%`);
  
  return {
    totalItems: allItems.length,
    itemsDueToday,
    averageStability: avgStability,
    averageDifficulty: avgDifficulty,
    totalReviews,
    successRate: Math.round(successRate * 100) / 100
  };
}

export async function getItem(id: string): Promise<KnowledgeItem | null> {
  await ensureInitialized();
  return db.learning.getKnowledgeItem(id);
}

export async function deleteItem(id: string): Promise<boolean> {
  await ensureInitialized();
  const deleted = await db.learning.deleteKnowledgeItem(id);
  if (deleted) {
    spacedLogger.info('DELETE', `Élément supprimé: ${id}`);
  }
  return deleted;
}

export async function getAllItems(): Promise<KnowledgeItem[]> {
  await ensureInitialized();
  return db.learning.getKnowledgeItems();
}

export async function resetAllItems(): Promise<void> {
  await ensureInitialized();
  const items = await db.learning.getKnowledgeItems();
  for (const item of items) {
    await db.learning.deleteKnowledgeItem(item.id);
  }
  spacedLogger.success('RESET', 'Tous les éléments de répétition espacée ont été réinitialisés');
}

export default {
  calculateNextReview,
  getPendingReviews,
  generateReviewQuestion,
  createKnowledgeItem,
  getReviewStats,
  getItem,
  deleteItem,
  getAllItems,
  resetAllItems
};