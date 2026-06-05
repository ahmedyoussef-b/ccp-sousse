// src/app/api/feedback/implicit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// INITIALISATION CORE SQLITE
// ============================================================================

let dbInitialized = false;
let db: SQLiteCore;

async function getDB(): Promise<SQLiteCore> {
  if (!dbInitialized) {
    db = SQLiteCore.getInstance();
    await db.initialize();
    dbInitialized = true;
  }
  return db;
}

// ============================================================================
// GESTION DES CANDIDATS (promotion implicite)
// ============================================================================

interface CandidateEntry {
  question: string;
  answer: string;
  usageCount: number;
  totalScore: number;
  avgScore: number;
  metadata?: Record<string, any>;
}

const CANDIDATES_CACHE = new Map<string, CandidateEntry>();

function generateHash(question: string): string {
  const crypto = require('crypto');
  const normalized = question.toLowerCase().trim().replace(/[?.,!]/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Traite un feedback implicite et promeut au cache permanent si conditions remplies
 */
async function processImplicitFeedback(data: {
  question: string;
  answer: string;
  implicitScore: number;
  metadata?: Record<string, any>;
}): Promise<{ promoted: boolean }> {
  const { question, answer, implicitScore, metadata } = data;
  const hash = generateHash(question);
  
  // Récupérer ou créer le candidat
  let candidate = CANDIDATES_CACHE.get(hash);
  
  if (!candidate) {
    candidate = {
      question,
      answer,
      usageCount: 0,
      totalScore: 0,
      avgScore: 0,
      metadata
    };
  }
  
  // Mettre à jour les scores
  candidate.usageCount++;
  candidate.totalScore += implicitScore;
  candidate.avgScore = candidate.totalScore / candidate.usageCount;
  
  CANDIDATES_CACHE.set(hash, candidate);
  
  console.log(`[IMPLICIT-FEEDBACK] Candidat ${hash.substring(0, 6)}: Usage=${candidate.usageCount}, Score=${candidate.avgScore.toFixed(2)}`);
  
  // 🔥 Promotion conditionnelle: >= 10 utilisations ET score >= 0.8
  if (candidate.usageCount >= 10 && candidate.avgScore >= 0.8) {
    console.log(`[IMPLICIT-FEEDBACK] 🔥 PROMOTION AUTOMATIQUE: "${question.substring(0, 50)}..."`);
    
    // Ajouter au cache permanent SQLite
    const dbInstance = await getDB();
    const permanentHash = generateHash(question);
    
    const newEntry = {
      hash: permanentHash,
      question,
      response: answer,
      zone: metadata?.zone || 'SHARED',
      usageCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: { 
        ...metadata, 
        promoted: true,
        implicitScore: candidate.avgScore,
        usageCount: candidate.usageCount
      }
    };
    
    dbInstance.cache.savePermanentEntry(newEntry);
    
    // Supprimer des candidats
    CANDIDATES_CACHE.delete(hash);
    
    return { promoted: true };
  }
  
  // Limiter la taille du cache candidats
  if (CANDIDATES_CACHE.size > 1000) {
    const oldestKey = Array.from(CANDIDATES_CACHE.keys())[0];
    CANDIDATES_CACHE.delete(oldestKey);
  }
  
  return { promoted: false };
}

/**
 * Enrichit la table implicite avec un terme
 */
async function enrichImplicitMapping(term: string, zone: string, question: string): Promise<void> {
  try {
    const dbInstance = await getDB();
    const mappingKey = `implicit:${term}`;
    
    // Récupérer le mapping existant
    const existing = dbInstance.get<{ zone: string; count: number }>('implicit_mappings', mappingKey);
    
    if (existing) {
      // Incrémenter le compteur
      dbInstance.set('implicit_mappings', mappingKey, {
        zone: existing.zone,
        count: existing.count + 1,
        lastQuestion: question,
        lastUpdated: Date.now()
      }, 86400); // TTL 24h
    } else {
      // Nouveau mapping
      dbInstance.set('implicit_mappings', mappingKey, {
        zone,
        count: 1,
        firstQuestion: question,
        lastUpdated: Date.now()
      }, 86400);
    }
    
    console.log(`[IMPLICIT-FEEDBACK] 📚 Mapping enrichi: "${term}" → ${zone}`);
  } catch (error) {
    console.warn('[IMPLICIT-FEEDBACK] Erreur enrichissement mapping:', error);
  }
}

/**
 * Extrait les termes clés d'une requête
 */
function extractKeyTerms(query: string): string[] {
  const stopWords = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'en', 'dans',
    'pour', 'par', 'avec', 'sans', 'sur', 'sous', 'est', 'sont', 'a', 'ont',
    'donne', 'moi', 'info', 'role', 'que', 'est-ce', 'quelle', 'quel'
  ]);
  
  return query
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));
}

// ============================================================================
// API ROUTE
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { 
      question, 
      answer, 
      dwellTime, 
      scrollDepth, 
      copyCount,
      metadata 
    } = data;

    if (!question || !answer) {
      return NextResponse.json({ error: 'Question et réponse requises' }, { status: 400 });
    }

    // Calcul du score implicite (normalisé 0-1)
    // 60s dwell time = 0.5, 90% scroll = 0.3, copy = 0.2
    let implicitScore = 0;
    if (dwellTime) implicitScore += Math.min(0.5, (dwellTime / 60000) * 0.5);
    if (scrollDepth) implicitScore += Math.min(0.3, (scrollDepth / 100) * 0.3);
    if (copyCount) implicitScore += Math.min(0.2, copyCount * 0.1);

    console.log(`[IMPLICIT-FEEDBACK] Score: ${implicitScore.toFixed(2)} pour: "${question.substring(0, 30)}..."`);

    // Traitement du feedback implicite
    const result = await processImplicitFeedback({
      question,
      answer,
      implicitScore,
      metadata
    });
    
    // Enrichir la table implicite avec les mots-clés
    const terms = extractKeyTerms(question);
    const detectedZone = metadata?.zone || 'SHARED';
    
    for (const term of terms.slice(0, 5)) {
      await enrichImplicitMapping(term, detectedZone, question);
    }

    return NextResponse.json({ 
      success: true, 
      score: implicitScore,
      promoted: result.promoted 
    });
  } catch (error: any) {
    console.error('[IMPLICIT-FEEDBACK] Erreur:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    
    const candidates = Array.from(CANDIDATES_CACHE.entries())
      .map(([hash, data]) => ({
        hash,
        question: data.question,
        usageCount: data.usageCount,
        avgScore: data.avgScore,
        metadata: data.metadata
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, limit);
    
    return NextResponse.json({
      success: true,
      candidates,
      total: CANDIDATES_CACHE.size
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}