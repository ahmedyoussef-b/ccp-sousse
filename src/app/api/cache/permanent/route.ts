export const runtime = 'edge';

// src/app/api/cache/permanent/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SQLiteCore } from '@/ai/core/sqlite';

// Interface pour les entrées du cache permanent
interface PermanentCacheEntry {
  hash: string;
  question: string;
  response: string;
  zone: string;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
}

// Initialisation SQLite
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const zone = searchParams.get('zone');
    
    const dbInstance = await getDB();
    
    // Récupérer toutes les entrées du cache permanent
    let entries: PermanentCacheEntry[] = [];
    
    if (zone) {
      entries = dbInstance.cache.searchPermanentEntries(zone) as PermanentCacheEntry[];
    } else {
      // Récupérer toutes les entrées de toutes les zones
      const allZones = ['SHARED', 'TG1', 'TG2', 'RH', 'MAINTENANCE', 'PROCEDURES'];
      for (const z of allZones) {
        const zoneEntries = dbInstance.cache.searchPermanentEntries(z) as PermanentCacheEntry[];
        entries.push(...zoneEntries);
      }
    }
    
    // Grouper par zone
    const zonesMap = new Map<string, { count: number; questions: any[] }>();
    
    for (const entry of entries) {
      if (!zonesMap.has(entry.zone)) {
        zonesMap.set(entry.zone, { count: 0, questions: [] });
      }
      const zoneData = zonesMap.get(entry.zone)!;
      zoneData.count++;
      zoneData.questions.push({
        question: entry.question,
        hash: entry.hash,
        timestamp: entry.createdAt,
        usageCount: entry.usageCount
      });
    }
    
    const result: any = {
      totalZones: zonesMap.size,
      zones: Array.from(zonesMap.entries()).map(([name, data]) => ({
        name,
        count: data.count,
        questions: data.questions
      }))
    };
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API CACHE] Erreur GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get('hash');
    const zone = searchParams.get('zone');

    if (!hash || !zone) {
      return NextResponse.json({ error: 'Hash et zone requis' }, { status: 400 });
    }

    const dbInstance = await getDB();
    
    // Vérifier si l'entrée existe
    const entry = dbInstance.cache.getPermanentEntry(hash);
    
    if (!entry || entry.zone !== zone) {
      return NextResponse.json({ error: 'Entrée non trouvée' }, { status: 404 });
    }
    
    // Supprimer l'entrée (à implémenter dans cache manager)
    // Pour l'instant, on utilise une méthode directe SQLite
    const dbConnection = dbInstance.getDB();
    const result = dbConnection.prepare(`
      DELETE FROM cache_permanent_entries WHERE hash = ? AND zone = ?
    `).run(hash, zone);
    
    if (result.changes > 0) {
      console.log(`[API CACHE] ✅ Entrée supprimée: ${hash} (zone: ${zone})`);
      return NextResponse.json({ success: true, message: 'Entrée supprimée' });
    }
    
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
  } catch (error: any) {
    console.error('[API CACHE] Erreur DELETE:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, answer, zone, rating } = body;
    
    if (!question || !answer) {
      return NextResponse.json({ error: 'Question et réponse requises' }, { status: 400 });
    }
    
    const dbInstance = await getDB();
    const hash = generateHash(question);
    
    // Vérifier si l'entrée existe déjà
    const existing = dbInstance.cache.getPermanentEntry(hash);
    
    if (existing) {
      // Mettre à jour l'usage count
      dbInstance.cache.incrementUsage(hash);
      return NextResponse.json({ 
        success: true, 
        message: 'Entrée mise à jour',
        hash,
        existing: true
      });
    }
    
    // Créer une nouvelle entrée
    const newEntry = {
      hash,
      question,
      response: answer,
      zone: zone || 'SHARED',
      usageCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: { rating: rating || 5, source: 'api' }
    };
    
    dbInstance.cache.savePermanentEntry(newEntry);
    
    console.log(`[API CACHE] ✅ Nouvelle entrée ajoutée: ${hash} (zone: ${zone || 'SHARED'})`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Entrée ajoutée au cache permanent',
      hash,
      existing: false
    });
  } catch (error: any) {
    console.error('[API CACHE] Erreur POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function generateHash(question: string): string {
  const crypto = require('crypto');
  const normalized = question.toLowerCase().trim().replace(/[?.,!]/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}