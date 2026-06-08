export const runtime = 'edge';

// src/app/api/feedback/export/route.ts
// app/api/feedback/export/route.ts
import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET() {
  try {
    const feedbacksPath = path.join(process.cwd(), 'data', 'training', 'feedbacks.json');
    
    if (!fs.existsSync(feedbacksPath)) {
      return NextResponse.json({ error: 'Aucune donnée' }, { status: 404 });
    }
    
    const feedbacks = JSON.parse(fs.readFileSync(feedbacksPath, 'utf-8'));
    
    // Créer le CSV
    const headers = ['ID', 'Question', 'Réponse', 'Note', 'Date', 'Traité'];
    const rows = feedbacks.map((f: any) => [
      f.id,
      `"${f.question.replace(/"/g, '""')}"`,
      `"${f.answer.replace(/"/g, '""').substring(0, 500)}"`,
      f.rating,
      new Date(f.timestamp).toLocaleString(),
      f.processed ? 'Oui' : 'Non'
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    
    // Ajouter BOM pour UTF-8
    const bom = '\uFEFF';
    const csvWithBom = bom + csvContent;
    
    return new NextResponse(csvWithBom, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="feedbacks_${new Date().toISOString().split('T')[0]}.csv"`
      }
    });
    
  } catch (error) {
    console.error('[EXPORT] Erreur:', error);
    return NextResponse.json({ error: 'Erreur export' }, { status: 500 });
  }
}