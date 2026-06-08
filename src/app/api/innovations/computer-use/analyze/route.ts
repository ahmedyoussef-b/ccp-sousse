export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { computerUseAgent } from '@/ai/innovations/02-computer-use-agent';
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
    
    const analysis = await computerUseAgent.analyzeScreen(buffer);
    
    // Sauvegarder dans l'historique
    await db.recordMetric('computer_use', 'analysis_count', 1);
    await db.recordMetric('computer_use', 'elements_detected', analysis.detectedElements.length);
    
    // Sauvegarder l'analyse détaillée
    db.getDB().prepare(`
      INSERT INTO innovation_analysis_history (id, innovation_type, analysis_data, detected_elements, suggested_actions, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `cu_${Date.now()}`,
      'computer_use',
      JSON.stringify({ summary: 'Screen analysis completed' }),
      JSON.stringify(analysis.detectedElements),
      JSON.stringify(analysis.suggestedActions),
      Date.now()
    );
    
    return NextResponse.json({
      success: true,
      detectedElements: analysis.detectedElements,
      suggestedActions: analysis.suggestedActions,
      hasCriticalAlarms: computerUseAgent.hasCriticalAlarms(analysis),
      summary: analysis.rawResponse?.slice(0, 500) || 'Analyse terminée'
    });
  } catch (error: any) {
    console.error('Erreur computer-use:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}