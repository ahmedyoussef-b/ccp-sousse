export const runtime = 'edge';

// app/api/training/examples/route.ts
// API CRUD pour les exemples d'entraînement

import { NextRequest, NextResponse } from 'next/server';
import { readAllExamples, writeExample, deleteAllExamples, analyzeContextAndLinks, TrainingExample } from './store';

// GET - Récupérer tous les exemples
export async function GET() {
  try {
    const examples = readAllExamples();
    return NextResponse.json({ examples, count: examples.length });
  } catch (error) {
    console.error('GET /api/training/examples error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des exemples' },
      { status: 500 }
    );
  }
}

// POST - Ajouter un nouvel exemple avec contextualisation intelligente
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, response, quality, source = 'manual' } = body;
    
    if (!question || !response) {
      return NextResponse.json(
        { error: 'La question et la réponse sont requises' },
        { status: 400 }
      );
    }
    
    // Analyse du contexte via l'IA
    const contextData = await analyzeContextAndLinks(question, response);
    
    const newExample: TrainingExample = {
      id: Date.now().toString(),
      question: question.trim(),
      response: response.trim(),
      quality: quality || undefined,
      source,
      createdAt: new Date().toISOString(),
      context: contextData?.context || 'general',
      suggestedResources: {
        images: contextData?.imagesKeywords || [],
        mindMapNodes: contextData?.mindMapNodes || []
      }
    };
    
    // Sauvegarde dans le fichier {contexte}.json approprié
    writeExample(newExample);
    
    return NextResponse.json({ success: true, example: newExample });
  } catch (error) {
    console.error('POST /api/training/examples error:', error);
    return NextResponse.json(
      { error: `Erreur lors de l'ajout de l'exemple: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

// DELETE - Tout vider
export async function DELETE() {
  try {
    deleteAllExamples();
    return NextResponse.json({ success: true, message: 'Tous les exemples ont été supprimés' });
  } catch (error) {
    console.error('DELETE /api/training/examples error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la suppression des exemples' },
      { status: 500 }
    );
  }
}