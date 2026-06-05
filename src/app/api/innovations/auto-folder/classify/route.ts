import { NextRequest, NextResponse } from 'next/server';
import { autoFolderClassifier } from '@/ai/innovations/04-auto-folder-classifier';
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
    
    const classification = await autoFolderClassifier.classifyImage(buffer);
    
    // Sauvegarder dans l'historique
    await db.recordMetric('auto_folder', 'classification_count', 1);
    await db.recordMetric('auto_folder', 'confidence', classification.confidence);
    
    return NextResponse.json({
      success: true,
      suggestedFolder: classification.suggestedFolder,
      confidence: classification.confidence,
      equipmentType: classification.equipmentType,
      zone: classification.zone,
      tags: classification.tags,
      alternativeFolders: classification.alternativeFolders
    });
  } catch (error: any) {
    console.error('Erreur auto-folder:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}