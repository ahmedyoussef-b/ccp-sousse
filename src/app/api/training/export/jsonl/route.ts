// app/api/training/export/jsonl/route.ts
// API pour exporter le dataset au format JSONL

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
      // Retourner un fichier vide
      return new NextResponse('', {
        headers: {
          'Content-Type': 'application/x-jsonlines',
          'Content-Disposition': 'attachment; filename="dataset.jsonl"',
        },
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
    
    // Convertir en format JSONL pour Colab
    const jsonlContent = examples.map((ex) => 
      JSON.stringify({
        instruction: ex.question,
        response: ex.response,
        quality: ex.quality || 5
      })
    ).join('\n');
    
    return new NextResponse(jsonlContent, {
      headers: {
        'Content-Type': 'application/x-jsonlines',
        'Content-Disposition': 'attachment; filename="dataset.jsonl"',
      },
    });
    
  } catch (error) {
    console.error('Error exporting JSONL:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'export du dataset' },
      { status: 500 }
    );
  }
}