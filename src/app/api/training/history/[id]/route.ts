import { NextRequest, NextResponse } from 'next/server';
import { deleteModel } from '@/ai/training/model-registry';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const success = await deleteModel(params.id);
    if (!success) {
      return NextResponse.json(
        { error: 'Impossible de supprimer ce modèle (il est peut-être en production ou introuvable)' }, 
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API][HISTORY][DELETE] Erreur:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
