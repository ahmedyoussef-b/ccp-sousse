// app/api/vision/folders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import visionService from '@/lib/services/visionService';

export const dynamic = 'force-dynamic';

// ============================================
// PATCH - Mettre à jour un dossier (renommer ou déplacer)
// ============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { parentId, name } = body;
    
    // Récupérer tous les dossiers
    const folders = await visionService.listFolders();
    const folder = folders.find(f => f.id === id);
    
    if (!folder) {
      return NextResponse.json(
        { error: 'Dossier non trouvé' },
        { status: 404 }
      );
    }
    
    const updates: { parentId?: string | null; name?: string } = {};
    
    if (parentId !== undefined) {
      // Vérifier que le nouveau parent existe (sauf si c'est root)
      if (parentId !== 'root' && parentId !== null) {
        const parentExists = folders.some(f => f.id === parentId);
        if (!parentExists && parentId !== 'root') {
          return NextResponse.json(
            { error: 'Le dossier parent n\'existe pas' },
            { status: 400 }
          );
        }
      }
      updates.parentId = parentId === 'root' ? null : parentId;
    }
    
    if (name !== undefined && name.trim()) {
      updates.name = name.trim();
    }
    
    // Appliquer les mises à jour
    if (Object.keys(updates).length > 0) {
      await visionService.updateFolder(id, updates);
    }
    
    return NextResponse.json({ 
      success: true, 
      folder: { id, ...updates }
    });
    
  } catch (error) {
    console.error('❌ Erreur mise à jour dossier:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE - Supprimer un dossier
// ============================================
export async function DELETE(
  _request: NextRequest,  // 🔥 Préfixé avec _ pour indiquer non utilisé
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (id === 'root') {
      return NextResponse.json(
        { error: 'Impossible de supprimer le dossier racine' },
        { status: 400 }
      );
    }
    
    const success = await visionService.deleteFolder(id);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Impossible de supprimer le dossier' },
        { status: 400 }
      );
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('❌ Erreur suppression dossier:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

// ============================================
// GET - Récupérer un dossier spécifique
// ============================================
export async function GET(
  _request: NextRequest,  // 🔥 Préfixé avec _ pour indiquer non utilisé
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const folders = await visionService.listFolders();
    const folder = folders.find(f => f.id === id);
    
    if (!folder) {
      return NextResponse.json(
        { error: 'Dossier non trouvé' },
        { status: 404 }
      );
    }
    
    // 🔥 getFolderPhysicalPath est privé, on ne peut pas y accéder directement
    // On retourne juste le dossier sans le chemin physique
    return NextResponse.json({ 
      success: true, 
      folder
    });
    
  } catch (error) {
    console.error('❌ Erreur récupération dossier:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}