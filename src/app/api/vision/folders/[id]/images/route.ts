// app/api/vision/folders/[id]/images/route.ts
import { NextRequest, NextResponse } from 'next/server';
import visionService from '@/lib/services/visionService';

export const dynamic = 'force-dynamic';

// ============================================
// GET - Récupérer toutes les images d'un dossier
// ============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Vérifier que le dossier existe (sauf pour root)
    if (id !== 'root') {
      const folders = await visionService.listFolders();
      const folderExists = folders.some(f => f.id === id);
      
      if (!folderExists) {
        return NextResponse.json(
          { error: 'Dossier non trouvé' },
          { status: 404 }
        );
      }
    }
    
    // Utiliser le service existant avec filtrage par folderId
    const images = await visionService.listImages();
    
    return NextResponse.json({ 
      success: true, 
      images,
      folderId: id,
      total: images.length
    });
    
  } catch (error) {
    console.error('❌ Erreur récupération images du dossier:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

// ============================================
// POST - Upload d'images vers un dossier
// ============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Vérifier que le dossier existe (sauf pour root)
    if (id !== 'root') {
      const folders = await visionService.listFolders();
      const folderExists = folders.some(f => f.id === id);
      
      if (!folderExists) {
        return NextResponse.json(
          { error: 'Dossier non trouvé' },
          { status: 404 }
        );
      }
    }
    
    // Récupérer les fichiers du FormData
    const formData = await request.formData();
    const files = formData.getAll('images') as File[];
    
    if (files.length === 0) {
      return NextResponse.json(
        { error: 'Aucun fichier uploadé' },
        { status: 400 }
      );
    }
    
    const uploadedImages = [];
    const errors = [];
    
    for (const file of files) {
      try {
        // Créer un nouveau FormData pour l'API register
        const uploadFormData = new FormData();
        uploadFormData.append('image', file);
        
        // Ajouter le folderId aux métadonnées
        const metadata = {
          folderId: id === 'root' ? undefined : id,
          uploadedVia: 'folder-api'
        };
        uploadFormData.append('metadata', JSON.stringify(metadata));
        
        // Appeler l'API register existante
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const uploadRes = await fetch(`${baseUrl}/api/vision/register`, {
          method: 'POST',
          body: uploadFormData
        });
        
        if (uploadRes.ok) {
          const result = await uploadRes.json();
          uploadedImages.push(result);
        } else {
          errors.push({ fileName: file.name, error: `Upload failed: ${uploadRes.status}` });
        }
      } catch (error) {
        errors.push({ fileName: file.name, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
    
    return NextResponse.json({ 
      success: true,
      uploaded: uploadedImages.length,
      failed: errors.length,
      images: uploadedImages,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('❌ Erreur upload images:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}