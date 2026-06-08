export const runtime = 'edge';

// app/api/vision/images/route.ts
import { NextRequest, NextResponse } from 'next/server';
import visionService from '@/lib/services/visionService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const folderId = searchParams.get('folderId') || undefined;
    const linkedDocumentId = searchParams.get('linkedDocumentId') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    // Correction: listImages n'accepte pas de paramètres, on récupère toutes les images puis on filtre
    let images = await visionService.listImages();
    console.log(`[API][IMAGES] Total images in collection: ${images.length}`);
    
    // Filtrage manuel des images - utilisation des propriétés disponibles sur VisionData
    if (folderId) {
      // Utiliser folder_id qui est la propriété standard dans l'interface VisionData
      images = images.filter(img => (img as any).folder_id === folderId || (img as any).folderId === folderId);
    }
    
    if (linkedDocumentId) {
      // Utiliser linkedDocumentIds, linked_document_ids, document_id ou metadata.documentId selon la structure
      images = images.filter(img => {
        const linkedDocs = (img as any).linkedDocumentIds || (img as any).linked_document_ids || [];
        const docsArray = Array.isArray(linkedDocs) ? linkedDocs : (typeof linkedDocs === 'string' ? JSON.parse(linkedDocs) : []);
        return docsArray.includes(linkedDocumentId) ||
               (img as any).document_id === linkedDocumentId || 
               (img as any).linkedDocumentId === linkedDocumentId ||
               (img as any).metadata?.documentId === linkedDocumentId;
      });
    }
    
    // Pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedImages = images.slice(start, end);
    
    console.log(`[API][IMAGES] Returning ${paginatedImages.length} images (page ${page}, limit ${limit})`);
    return NextResponse.json({ 
      success: true, 
      images: paginatedImages,
      total: images.length,
      page,
      limit,
      hasMore: end < images.length
    });
  } catch (error) {
    console.error('Erreur listage images:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}