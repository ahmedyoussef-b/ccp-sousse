export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { zeroShotAnomaly } from '@/ai/innovations/01-zero-shot-anomaly';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get('image') as File;
    
    if (!image) {
      return NextResponse.json({ error: 'Aucune image fournie' }, { status: 400 });
    }
    
    const buffer = Buffer.from(await image.arrayBuffer());
    const db = getSQLiteCore();
    
    // 🔧 FORCER LE RAFFRAÎCHISSEMENT DES SOUS-ESPACES
    await zeroShotAnomaly.refreshCache();
    
    // Récupérer les sous-espaces
    const subspaces = await zeroShotAnomaly.listSubspaces();
    console.log('Sous-espaces disponibles:', subspaces);
    
    if (subspaces.length === 0) {
      return NextResponse.json({ 
        error: 'Aucun sous-espace configuré. Veuillez d\'abord créer un sous-espace avec des images de référence.' 
      }, { status: 400 });
    }
    
    // Prendre le premier sous-espace
    const subspaceId = subspaces[0].id;
    console.log('Utilisation du sous-espace:', subspaceId);
    
    const result = await zeroShotAnomaly.detectAnomaly(buffer, subspaceId);
    
    // Sauvegarder dans l'historique
    await db.recordMetric('zero_shot', 'detection_count', 1);
    await db.recordMetric('zero_shot', 'anomaly_score', result.anomalyScore);
    
    return NextResponse.json({
      success: true,
      isAnomaly: result.isAnomaly,
      anomalyScore: result.anomalyScore,
      threshold: result.threshold,
      reconstructionError: result.reconstructionError,
      subspaceId: subspaceId,
      report: result.report,
      recommendation: result.isAnomaly ? '⚠️ Anomalie détectée - Inspection recommandée' : '✅ Équipement normal'
    });
  } catch (error: any) {
    console.error('Erreur zero-shot:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}