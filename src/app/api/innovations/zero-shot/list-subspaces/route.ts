export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function GET() {
  try {
    const db = getSQLiteCore();
    
    // Lire directement dans la table SQLite
    const subspaces = db.getDB().prepare(`
      SELECT id, name, type, created_at, updated_at 
      FROM innovations_tech_subspaces 
      ORDER BY created_at DESC
    `).all();
    
    console.log('📊 Sous-espaces trouvés:', subspaces.length);
    
    return NextResponse.json({
      success: true,
      subspaces: subspaces,
      count: subspaces.length
    });
  } catch (error: any) {
    console.error('Erreur:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      subspaces: [],
      count: 0
    });
  }
}