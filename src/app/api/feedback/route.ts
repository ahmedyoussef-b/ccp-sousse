export const runtime = 'edge';

// src/app/api/feedback/route.ts
/**
 * @fileOverview API pour enregistrer le feedback utilisateur
 * Version avec gestion des étoiles, cache intelligent et alertes temps réel
 */

import { feedbackLoop } from '@/ai/training/feedback-loop';
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { predictiveCache } from '@/ai/orchestration/innovations/predictive-cache';
import { hybridClassifier } from '@/ai/orchestration/innovations/hybrid-classifier';
import { semanticCacheService } from '@/ai/cache/semantic-cache';
import { hybridRouter } from '@/ai/resilience/hybrid-router';

// Interface pour les feedbacks
interface Feedback {
  id: string;
  messageId: string;
  question: string;
  answer: string;
  rating: number;
  timestamp: string;
  processed: boolean;
  appliedToCache?: boolean;
  modelVersion?: string;
}

interface FeedbackStats {
  total: number;
  averageRating: number;
  distribution: Record<number, number>;
  lastWeek: number;
  improvementRate: number;
}

// Chemin de stockage des feedbacks
const getFeedbacksPath = () => path.join(process.cwd(), 'data', 'training', 'feedbacks.json');

// Lire les feedbacks
function readFeedbacks(): Feedback[] {
  const filePath = getFeedbacksPath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

// Écrire les feedbacks
function writeFeedbacks(feedbacks: Feedback[]) {
  const filePath = getFeedbacksPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(feedbacks, null, 2));
}

// Obtenir les statistiques
function getStats(feedbacks: Feedback[]): FeedbackStats {
  const total = feedbacks.length;
  
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRating = 0;
  let ratingCount = 0;
  
  for (const f of feedbacks) {
    const rating = f.rating;
    if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
      distribution[rating as 1|2|3|4|5]++;
      totalRating += rating;
      ratingCount++;
    }
  }
  
  const avgRating = ratingCount > 0 ? totalRating / ratingCount : 0;
  
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const lastWeek = feedbacks.filter(f => {
    let ts: number;
    if (typeof f.timestamp === 'string') {
      ts = isNaN(parseInt(f.timestamp)) ? new Date(f.timestamp).getTime() : parseInt(f.timestamp);
    } else {
      ts = f.timestamp as unknown as number;
    }
    return ts > oneWeekAgo;
  }).length;

  return {
    total,
    averageRating: parseFloat(avgRating.toFixed(2)),
    distribution,
    lastWeek,
    improvementRate: 0
  };
}

// Mettre à jour le cache basé sur la note
async function updateCacheBasedOnRating(messageId: string, rating: number, question: string, answer: string) {
  if (rating === 5) {
    console.log(`[CACHE] 🔒 Mise en cache permanente pour message ${messageId} (note 5★)`);
    
    // Classer pour avoir la catégorie
    const classified = await hybridClassifier.classify(question);
    
    await predictiveCache.update('anonymous', {
      query: question,
      answer: answer,
      strategy: 'feedback_validated',
      confidence: 1.0,
      category: classified.category,
      displayMode: 'TEXT',
      timestamp: Date.now(),
      expiresAt: Date.now() + (30 * 24 * 3600 * 1000), // 30 jours
      hits: 1,
      lastAccess: Date.now()
    });
  } else if (rating <= 2) {
    console.log(`[CACHE] 🗑️ Invalidation pour message ${messageId} (note ${rating}★) sur tous les niveaux de cache`);
    await predictiveCache.invalidate(question, 'anonymous');
    await semanticCacheService.invalidate(question);
    await hybridRouter.invalidateCache(question);
  }
}

// Message de retour selon la note
function getFeedbackMessage(rating: number): string {
  if (rating === 5) return "⭐ Merci ! Cette réponse sera conservée comme référence.";
  if (rating === 4) return "👍 Merci ! Cette réponse sera améliorée progressivement.";
  if (rating === 3) return "📝 Merci ! Nous allons travailler à améliorer cette réponse.";
  if (rating === 2) return "🔧 Merci ! Cette réponse sera corrigée.";
  if (rating === 1) return "⚠️ Merci ! Cette réponse a été signalée.";
  return "Merci pour votre retour !";
}

// Calcul du poids d'apprentissage
function getLearningWeight(rating: number, hasCorrection: boolean): number {
  if (hasCorrection) return 3.0;
  if (rating === 5) return 1.66;
  if (rating === 4) return 1.33;
  if (rating === 3) return 1.0;
  if (rating === 2) return 0.66;
  if (rating === 1) return 0.33;
  return 1.0;
}

// ============================================
// HANDLERS
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      question, 
      answer, 
      rating, 
      correction,
      metadata 
    } = body;

    // Validation
    if (!question) {
      return NextResponse.json({ error: 'Question requise' }, { status: 400 });
    }
    
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating doit être entre 1 et 5' }, { status: 400 });
    }

    console.log(`[FEEDBACK] ⭐ Nouveau feedback: ${rating}★ pour "${question.substring(0, 50)}..."`);

    // Créer l'objet feedback
    const feedback: Feedback = {
      id: `feedback_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      messageId: `msg_${Date.now()}`,
      question,
      answer: answer || '',
      rating: Number(rating),
      timestamp: Date.now().toString(),
      processed: false,
      modelVersion: 'current'
    };

    // Sauvegarder
    const existingFeedbacks = readFeedbacks();
    existingFeedbacks.push(feedback);
    writeFeedbacks(existingFeedbacks);

    // Mettre à jour le cache
    await updateCacheBasedOnRating(feedback.messageId, rating, question, answer);

    // Enregistrer dans le feedbackLoop existant
    const interaction = {
      id: feedback.id,
      input: question,
      prediction: answer,
      feedback: {
        rating: rating,
        correction: correction || undefined
      },
      modelVersion: 'current',
      timestamp: Date.now(),
      metadata: { ...metadata, messageId: feedback.messageId }
    };

    try {
      await feedbackLoop.recordInteraction(interaction);
      console.log(`[FEEDBACK-LOOP] ✅ Interaction enregistrée`);
    } catch (loopError) {
      console.error('[FEEDBACK-LOOP] Erreur:', loopError);
    }

    const weight = getLearningWeight(rating, !!correction);
    const message = getFeedbackMessage(rating);

    return NextResponse.json({
      success: true,
      message,
      weight,
      rating,
      feedbackId: feedback.id
    });

  } catch (error) {
    console.error('[FEEDBACK] Erreur:', error);
    return NextResponse.json({ 
      error: 'Erreur serveur lors de l\'enregistrement du feedback' 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const rating = searchParams.get('rating');
    
    let feedbacks = readFeedbacks();
    
    if (rating) {
      const ratingNum = parseInt(rating);
      feedbacks = feedbacks.filter(f => f.rating === ratingNum);
    }
    
    feedbacks.sort((a, b) => {
      let tsA: number, tsB: number;
      tsA = typeof a.timestamp === 'string' ? 
        (isNaN(parseInt(a.timestamp)) ? new Date(a.timestamp).getTime() : parseInt(a.timestamp)) : 
        a.timestamp as unknown as number;
      tsB = typeof b.timestamp === 'string' ? 
        (isNaN(parseInt(b.timestamp)) ? new Date(b.timestamp).getTime() : parseInt(b.timestamp)) : 
        b.timestamp as unknown as number;
      return tsB - tsA;
    });
    
    const stats = getStats(feedbacks);
    
    return NextResponse.json({
      success: true,
      feedbacks: feedbacks.slice(0, limit),
      stats,
      total: feedbacks.length
    });
    
  } catch (error) {
    console.error('[FEEDBACK] Erreur GET:', error);
    return NextResponse.json({ 
      error: 'Erreur lors de la récupération des feedbacks' 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }
    
    let feedbacks = readFeedbacks();
    const filtered = feedbacks.filter(f => f.id !== id);
    
    if (filtered.length === feedbacks.length) {
      return NextResponse.json({ error: 'Feedback non trouvé' }, { status: 404 });
    }
    
    writeFeedbacks(filtered);
    
    return NextResponse.json({
      success: true,
      message: 'Feedback supprimé'
    });
    
  } catch (error) {
    console.error('[FEEDBACK] Erreur DELETE:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}