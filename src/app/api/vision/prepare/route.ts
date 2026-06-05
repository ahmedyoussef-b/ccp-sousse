// src/app/api/vision/prepare/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';
import visionService from '@/lib/services/visionService';
import { intelligentPartMatching } from '@/ai/innovations/09-intelligent-part-matching';

export const dynamic = 'force-dynamic';

interface PreparationRequest {
  imageId: string;
  options?: {
    detectROI?: boolean;
    detectAnchors?: boolean;
    buildHierarchy?: boolean;
    generatePyramid?: boolean;
    forceRefresh?: boolean;
  };
}

/**
 * POST - Déclenche les préparations sur une image (ROI, ancres, hiérarchie, pyramide)
 */
export async function POST(request: NextRequest) {
  console.log('🛠️ [API] Préparation d\'image');
  
  try {
    const body: PreparationRequest = await request.json();
    const { imageId, options } = body;
    
    if (!imageId) {
      return NextResponse.json({ error: 'imageId requis' }, { status: 400 });
    }
    
    // Vérifier que l'image existe
    const imageData = await visionService.getImageData(imageId);
    if (!imageData) {
      return NextResponse.json({ error: 'Image non trouvée' }, { status: 404 });
    }
    
    // Vérifier le statut actuel
    const db = getSQLiteCore();
    const existingPrep = db.visionPrep.getPreparation(imageId);
    
    if (existingPrep?.status === 'completed' && !options?.forceRefresh) {
      return NextResponse.json({
        success: true,
        message: 'Image déjà préparée',
        status: existingPrep.status,
        preparationDate: existingPrep.preparationDate
      });
    }
    
    // Récupérer le buffer de l'image
    const imageBuffer = await visionService.getImageBuffer(imageId);
    if (!imageBuffer) {
      return NextResponse.json({ error: 'Fichier image introuvable' }, { status: 404 });
    }
    
    // Lancer la préparation
    const result = await intelligentPartMatching.prepareGlobalImage(imageId, imageBuffer, {
      detectROI: options?.detectROI !== false,
      detectAnchors: options?.detectAnchors !== false,
      buildHierarchy: options?.buildHierarchy !== false,
      generatePyramid: options?.generatePyramid !== false
    });
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('❌ Erreur préparation image:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET - Récupère le statut et les données de préparation d'une image
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const imageId = searchParams.get('imageId');
    
    if (!imageId) {
      return NextResponse.json({ error: 'imageId requis' }, { status: 400 });
    }
    
    const db = getSQLiteCore();
    const preparation = db.visionPrep.getPreparation(imageId);
    const logs = db.visionPrep.getPreparationLogs(imageId, 20);
    
    return NextResponse.json({
      imageId,
      prepared: !!preparation && preparation.status === 'completed',
      status: preparation?.status || 'not_started',
      preparationDate: preparation?.preparationDate,
      logs,
      data: preparation ? {
        rois: preparation.rois,
        anchors: preparation.anchors,
        spatialHierarchy: preparation.spatialHierarchy,
        pyramidLevels: preparation.pyramidLevels
      } : null
    });
    
  } catch (error: any) {
    console.error('❌ Erreur récupération préparation:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE - Supprime les préparations d'une image
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const imageId = searchParams.get('imageId');
    
    if (!imageId) {
      return NextResponse.json({ error: 'imageId requis' }, { status: 400 });
    }
    
    const db = getSQLiteCore();
    
    // Supprimer les préparations
    db.getDB().prepare(`DELETE FROM image_preparations WHERE image_id = ?`).run(imageId);
    db.getDB().prepare(`DELETE FROM preparation_logs WHERE image_id = ?`).run(imageId);
    
    db.visionPrep.savePreparationLog({
      image_id: imageId,
      operation: 'DELETE_PREPARATION',
      status: 'success',
      details: 'Préparations supprimées',
      created_at: Date.now()
    });
    
    return NextResponse.json({ success: true, message: 'Préparations supprimées' });
    
  } catch (error: any) {
    console.error('❌ Erreur suppression préparations:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}