import { NextRequest, NextResponse } from 'next/server';
import { fewShotDefectTrainer } from '@/ai/innovations/06-few-shot-defect-trainer';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get('image') as File;
    const action = formData.get('action') as string || 'detect';
    const sessionId = formData.get('sessionId') as string;
    
    if (!image) {
      return NextResponse.json({ error: 'Aucune image fournie' }, { status: 400 });
    }
    
    const buffer = Buffer.from(await image.arrayBuffer());
    const db = getSQLiteCore();
    
    if (action === 'train' && sessionId) {
      // Entraînement
      const result = await fewShotDefectTrainer.trainDetector(sessionId);
      await db.recordMetric('few_shot', 'training_count', 1);
      if (result.success) {
        await db.recordMetric('few_shot', 'training_success', 1);
      }
      return NextResponse.json(result);
    } else {
      // Détection
      const detectors = fewShotDefectTrainer.listDetectors();
      if (detectors.length === 0) {
        return NextResponse.json({ 
          error: 'Aucun détecteur configuré. Créez d\'abord un détecteur avec quelques exemples.' 
        }, { status: 400 });
      }
      
      const results = await fewShotDefectTrainer.detectAnyDefect(buffer);
      await db.recordMetric('few_shot', 'detection_count', 1);
      
      return NextResponse.json({
        success: true,
        defects: results.filter(r => r.detected),
        allResults: results
      });
    }
  } catch (error: any) {
    console.error('Erreur few-shot:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}