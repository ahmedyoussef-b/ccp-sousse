import { NextRequest, NextResponse } from 'next/server';
import { dualConsensusVision } from '@/ai/innovations/03-dual-consensus-vision';
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
    
    const result = await dualConsensusVision.readPlate(buffer);
    
    // Sauvegarder dans l'historique
    await db.recordMetric('dual_consensus', 'reading_count', 1);
    await db.recordMetric('dual_consensus', 'confidence', result.confidence);
    
    return NextResponse.json({
      success: true,
      text: result.text,
      confidence: result.confidence,
      consensus: result.consensus,
      validatedFields: result.validatedFields,
      conflictingFields: result.conflictingFields,
      recommendation: result.consensus === 'full' ? '✅ Lecture fiable' : 
                      result.consensus === 'partial' ? '⚠️ Vérification recommandée' : 
                      '❌ Relecture nécessaire'
    });
  } catch (error: any) {
    console.error('Erreur dual-consensus:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}