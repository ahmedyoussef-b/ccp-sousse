// src/app/api/circuit-mindmap/sync-parameter/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite';
import { mindMapCache } from '@/ai/mindmap/mindmap-cache';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { circuitId, parameterId, name, unit, description } = await request.json();

    if (!circuitId || !name) {
      return NextResponse.json(
        { success: false, error: 'circuitId et name sont requis pour la synchronisation.' },
        { status: 400 }
      );
    }

    const db = getSQLiteCore().getDB();
    const now = Date.now();

    // 1. Try to find the parameter by ID or name
    let existingParam = null;
    if (parameterId) {
      existingParam = db.prepare('SELECT id FROM ref_parametres WHERE id = ?').get(parameterId) as any;
    }
    if (!existingParam) {
      existingParam = db.prepare('SELECT id FROM ref_parametres WHERE circuitId = ? AND name = ?').get(circuitId, name) as any;
    }

    if (existingParam) {
      // Update existing record
      db.prepare(`
        UPDATE ref_parametres 
        SET name = ?, unit = ?, description = ?, updatedAt = ?
        WHERE id = ?
      `).run(name, unit || null, description || null, now, existingParam.id);
      
      console.log(`[SYNC-PARAMETER] 🔄 Paramètre mis à jour dans SQLite: ${name} (${existingParam.id})`);
    } else {
      // Create new record to ensure perfect synchronization!
      const newId = `p_${Math.random().toString(36).substring(2, 9)}`;
      db.prepare(`
        INSERT INTO ref_parametres (id, circuitId, name, description, unit, dataType, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, 'numeric', ?, ?)
      `).run(newId, circuitId, name, description || null, unit || null, now, now);
      
      console.log(`[SYNC-PARAMETER] ➕ Nouveau paramètre créé dans SQLite: ${name} (${newId})`);
    }

    // 🚀 Performance: Invalidate the cache to ensure the RAG and map are perfectly updated
    mindMapCache.invalidate(`mindmap:${circuitId}`);

    return NextResponse.json({
      success: true,
      message: `Paramètre '${name}' synchronisé avec succès dans la base de données.`
    });

  } catch (error) {
    console.error('[API-MINDMAP-SYNC-PARAMETER] ❌ Erreur de synchronisation:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
