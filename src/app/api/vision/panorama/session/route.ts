export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';
import { chromaDBManager } from '@/ai/vector/chromadb-manager';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

const db = getSQLiteCore();

/**
 * GET /api/vision/panorama/session
 * Récupère une session d'assemblage panoramique par son ID
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID requis' }, { status: 400 });
    }

    const session = db.orchestration.sessions.get(sessionId);

    if (!session) {
      return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 });
    }

    // Le contexte contient l'état de l'assemblage (ImageItem[])
    return NextResponse.json({
      success: true,
      session: {
        id: session.sessionId,
        state: session.state,
        data: session.context,
        updatedAt: session.lastActivity
      }
    });
  } catch (error) {
    console.error('[Panorama Session API] Error GET:', error);
    return NextResponse.json({ error: 'Erreur lors de la récupération de la session' }, { status: 500 });
  }
}

/**
 * POST /api/vision/panorama/session
 * Crée ou met à jour une session d'assemblage panoramique
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, data, userId } = body;

    const id = sessionId || `pano-session-${uuidv4().slice(0, 8)}`;
    
    // Vérifier si la session existe déjà
    const existing = db.orchestration.sessions.get(id);

    if (existing) {
      // Mise à jour
      db.orchestration.sessions.update(id, {
        context: data,
        state: 'active'
      });
    } else {
      // Création
      // On utilise 7 jours de TTL par défaut pour les sessions panorama
      const ttl = 7 * 24 * 3600; 
      db.orchestration.sessions.create(id, userId || 'anonymous', data, ttl);
    }

    // Sauvegarde parallèle dans ChromaDB pour indexation sémantique
    try {
      const projectSummary = `Projet Panoramique: ${id}. Comprend ${Array.isArray(data) ? data.length : 0} images. Configuration manuelle enregistrée.`;
      await chromaDBManager.upsertDocuments('PANORAMA_SESSIONS', [{
        id: id,
        content: projectSummary,
        metadata: {
          userId: userId || 'anonymous',
          imageCount: Array.isArray(data) ? data.length : 0,
          timestamp: new Date().toISOString(),
          type: 'panorama_session',
          // On évite de mettre trop de données binaires dans les métadonnées Chroma
          // mais on garde les positions pour recherche future
          layout: JSON.stringify(data).substring(0, 1000)
        }
      }]);
    } catch (chromaError) {
      console.warn('[Panorama Session API] ChromaDB indexing failed, skipping:', chromaError);
    }

    return NextResponse.json({
      success: true,
      sessionId: id,
      message: existing ? 'Session mise à jour' : 'Session créée'
    });
  } catch (error) {
    console.error('[Panorama Session API] Error POST:', error);
    return NextResponse.json({ error: 'Erreur lors de la sauvegarde de la session' }, { status: 500 });
  }
}

/**
 * DELETE /api/vision/panorama/session
 * Supprime une session
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID requis' }, { status: 400 });
    }

    const deleted = db.orchestration.sessions.delete(sessionId);

    return NextResponse.json({
      success: true,
      deleted,
      message: deleted ? 'Session supprimée' : 'Session non trouvée'
    });
  } catch (error) {
    console.error('[Panorama Session API] Error DELETE:', error);
    return NextResponse.json({ error: 'Erreur lors de la suppression de la session' }, { status: 500 });
  }
}
