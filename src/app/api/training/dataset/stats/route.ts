export const runtime = 'edge';

// app/api/training/dataset/stats/route.ts
// API pour les statistiques du dataset

import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

interface TrainingExample {
  id?: string;
  question: string;
  response: string;
  quality?: number;
  source?: string;
  createdAt?: string;
}

export async function GET() {
  try {
    const examplesPath = path.join(process.cwd(), 'data', 'training', 'examples.json');
    
    if (!fs.existsSync(examplesPath)) {
      return NextResponse.json({
        examples: 0,
        fileSize: '0 KB',
        lastUpdated: null,
        avgQuality: 0,
        bySource: { manual: 0, import: 0, feedback: 0 }
      });
    }
    
    const fileContent = fs.readFileSync(examplesPath, 'utf-8');
    let examples: TrainingExample[] = [];
    
    try {
      examples = JSON.parse(fileContent);
    } catch (parseError) {
      console.error('Error parsing examples.json:', parseError);
      examples = [];
    }
    
    const stats = fs.statSync(examplesPath);
    const fileSizeKB = (stats.size / 1024).toFixed(1);
    
    // Calculer la qualité moyenne
    const avgQuality = examples.length > 0
      ? examples.reduce((acc, ex) => acc + (ex.quality || 0), 0) / examples.length
      : 0;
    
    // Compter par source
    const bySource = {
      manual: examples.filter(ex => ex.source === 'manual').length,
      import: examples.filter(ex => ex.source === 'import').length,
      feedback: examples.filter(ex => ex.source === 'feedback').length,
    };
    
    return NextResponse.json({
      examples: examples.length,
      fileSize: `${fileSizeKB} KB`,
      lastUpdated: stats.mtime,
      avgQuality: Math.round(avgQuality * 10) / 10,
      bySource
    });
    
  } catch (error) {
    console.error('Error getting dataset stats:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques' },
      { status: 500 }
    );
  }
}