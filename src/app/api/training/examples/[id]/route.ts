// app/api/training/examples/[id]/route.ts
// API pour la gestion d'un exemple spécifique (DELETE, PUT)

import { NextRequest, NextResponse } from 'next/server';
import { updateExampleGlobal, deleteExampleGlobal } from '../store';

// DELETE - Supprimer un exemple
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const wasDeleted = deleteExampleGlobal(id);
    
    if (!wasDeleted) {
      return NextResponse.json(
        { error: 'Exemple non trouvé' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, message: 'Exemple supprimé' });
  } catch (error) {
    console.error('DELETE /api/training/examples/[id] error:', error);
    return NextResponse.json(
      { error: `Erreur lors de la suppression: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

// PUT - Modifier un exemple
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { question, response, quality } = body;
    
    if (!question || !response) {
      return NextResponse.json(
        { error: 'La question et la réponse sont requises' },
        { status: 400 }
      );
    }
    
    const updatedExample = updateExampleGlobal(id, {
      question: question.trim(),
      response: response.trim(),
      quality: quality !== undefined ? quality : undefined
    });
    
    if (!updatedExample) {
      return NextResponse.json(
        { error: 'Exemple non trouvé' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, example: updatedExample });
  } catch (error) {
    console.error('PUT /api/training/examples/[id] error:', error);
    return NextResponse.json(
      { error: `Erreur lors de la modification: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}