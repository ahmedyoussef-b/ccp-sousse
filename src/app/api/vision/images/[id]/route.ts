// src/app/api/vision/images/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import visionService from '@/lib/services/visionService';
import { resizeImage } from '@/lib/utils/image-processor';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';
import { intelligentPartMatching } from '@/ai/innovations/09-intelligent-part-matching';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * Convertit un hash MD5 en UUID si nécessaire
 * Cherche dans l'imageCollection l'image dont le hash MD5 correspond
 */
async function resolveImageId(inputId: string): Promise<string | null> {
  // Mapping direct pour l'ID hardcodé d'Ahmed Abbes vers sa vraie image physique
  if (inputId === '8264a477-7dbc-497a-b2db-53fcb5e5bd71') {
    console.log(`🔄 [API] Résolution ID hardcodé Ahmed Abbes -> c29fa1b5-8276-4279-ac42-de163af7d053`);
    return 'c29fa1b5-8276-4279-ac42-de163af7d053';
  }

  // Si c'est déjà un UUID valide, le retourner directement
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(inputId)) {
    return inputId;
  }
  
  // Si c'est un hash MD5 (32 caractères hexadécimaux)
  const md5Regex = /^[a-f0-9]{32}$/i;
  if (md5Regex.test(inputId)) {
    // Chercher l'image correspondante dans la collection
    const allImages = await visionService.listImages();
    const matchingImage = allImages.find(img => {
      const hash = crypto.createHash('md5').update(img.id).digest('hex');
      return hash === inputId;
    });
    
    if (matchingImage) {
      console.log(`🔄 [API] Résolution hash MD5 -> UUID: ${inputId} -> ${matchingImage.id}`);
      return matchingImage.id;
    }
    
    // Essayons aussi de chercher par filename ou path
    const matchingByFilename = allImages.find(img => {
      const hash = crypto.createHash('md5').update(img.filename).digest('hex');
      return hash === inputId;
    });
    
    if (matchingByFilename) {
      console.log(`🔄 [API] Résolution hash filename -> UUID: ${inputId} -> ${matchingByFilename.id}`);
      return matchingByFilename.id;
    }
  }
  
  return null;
}

/**
 * GET - Récupère une image, sa miniature ou ses métadonnées
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    
    const type = searchParams.get('type'); // 'metadata' | 'image' | 'thumbnail' | 'preparation'
    const useThumbnail = type === 'thumbnail' || searchParams.get('thumbnail') === 'true';
    const onlyMetadata = type === 'metadata';
    const onlyPreparation = type === 'preparation';

    if (!id || id === 'undefined' || id === 'null') {
      return NextResponse.json({ error: 'ID manquant' }, { status: 400 });
    }

    // 🔥 RÉSOLUTION DE L'ID (hash MD5 -> UUID)
    const resolvedId = await resolveImageId(id);
    if (resolvedId) {
      id = resolvedId;
    }

    // 🔥 0. CAS PRÉPARATION (statut des préparations)
    if (onlyPreparation) {
      const status = await visionService.getPreparationStatus(id);
      return NextResponse.json(status);
    }

    // 🔍 1. CAS MÉTADONNÉES UNIQUEMENT
    if (onlyMetadata) {
      const imageData = await visionService.getImageData(id);
      if (!imageData) return NextResponse.json({ error: 'Image non trouvée' }, { status: 404 });
      const { image, ...metadata } = imageData;
      
      // 🔥 Ajouter le statut de préparation aux métadonnées
      const db = getSQLiteCore();
      await db.initialize();
      const preparation = db.visionPrep?.getPreparation(id);
      
      return NextResponse.json({
        ...metadata,
        preparationStatus: preparation?.status || 'not_started',
        preparationDate: preparation?.preparationDate
      });
    }

    // 🔍 2. CAS IMAGE (Miniature ou Originale)
    const imagePath = await visionService.getImageFilePath(id);
    
    if (imagePath) {
      const isPreGeneratedThumb = imagePath.includes('_thumb');
      
      if (useThumbnail && !isPreGeneratedThumb) {
        console.log(`📸 [API] Redimensionnement dynamique pour ${id}`);
        const imageBuffer = await fs.readFile(imagePath);
        const thumbnailBuffer = await resizeImage(imageBuffer, 400, 400, 90);
        
        return new NextResponse(new Uint8Array(thumbnailBuffer), {
          headers: { 
            'Content-Type': 'image/jpeg',
            'Content-Length': thumbnailBuffer.length.toString(),
            'Cache-Control': 'public, max-age=3600'
          }
        });
      }

      const imageBuffer = await fs.readFile(imagePath);
      const ext = path.extname(imagePath).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

      return new NextResponse(new Uint8Array(imageBuffer), {
        headers: { 
          'Content-Type': contentType,
          'Content-Length': imageBuffer.length.toString(),
          'Cache-Control': useThumbnail ? 'public, max-age=3600' : 'public, max-age=31536000'
        }
      });
    }

    // 🔍 3. FALLBACK BASE DE DONNÉES
    const imageData = await visionService.getImageData(id);
    if (imageData && imageData.image) {
      const imageBuffer = Buffer.from(imageData.image, 'base64');
      
      if (useThumbnail) {
        const thumbnailBuffer = await resizeImage(imageBuffer, 400, 400, 90);
        return new NextResponse(new Uint8Array(thumbnailBuffer), {
          headers: { 
            'Content-Type': 'image/jpeg',
            'Content-Length': thumbnailBuffer.length.toString(),
            'Cache-Control': 'public, max-age=3600'
          }
        });
      }

      return new NextResponse(new Uint8Array(imageBuffer), {
        headers: { 
          'Content-Type': 'image/jpeg',
          'Content-Length': imageBuffer.length.toString(),
          'Cache-Control': 'public, max-age=31536000'
        }
      });
    }
    
    return NextResponse.json({ error: 'Image introuvable' }, { status: 404 });
    
  } catch (error) {
    console.error('❌ Erreur API Vision Image:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * DELETE - Supprime une image physiquement et en base
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let { id } = await params;
    
    // Résolution de l'ID
    const resolvedId = await resolveImageId(id);
    if (resolvedId) {
      id = resolvedId;
    }
    
    console.log(`🗑️ [API] Suppression image: ${id}`);
    
    const success = await visionService.deleteImage(id);
    if (!success) {
      return NextResponse.json({ error: 'Échec de la suppression' }, { status: 400 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur suppression image:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * PATCH - Met à jour partiellement les métadonnées d'une image
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let { id } = await params;
    
    // Résolution de l'ID
    const resolvedId = await resolveImageId(id);
    if (resolvedId) {
      id = resolvedId;
    }
    
    const body = await request.json();
    
    const updates: any = {};
    const fields = [
      'filename', 'description', 'tags', 'location', 'folderId',
      'linkedDocumentIds', 'qaPairs', 'invocationKeywords',
      'equipmentState', 'validUntil', 'linkedProcedure', 'imageType',
      'zoneId', 'circuitId', 'parameterId', 'metadata'
    ];
    
    for (const field of fields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    
    const success = await visionService.updateImageMetadata(id, updates);
    if (!success) {
      return NextResponse.json({ error: 'Image non trouvée' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur mise à jour métadonnées:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * PUT - Met à jour complètement les métadonnées d'une image (pour préparations)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let { id } = await params;
    
    // Résolution de l'ID
    const resolvedId = await resolveImageId(id);
    if (resolvedId) {
      id = resolvedId;
    }
    
    const body = await request.json();
    
    // Récupérer les métadonnées existantes
    const existingData = await visionService.getImageData(id);
    if (!existingData) {
      return NextResponse.json({ error: 'Image non trouvée' }, { status: 404 });
    }
    
    // Fusionner avec les nouvelles données
    const updatedMetadata = {
      ...existingData,
      ...body,
      tags: body.tags || existingData.tags || [],
      linkedDocumentIds: body.linkedDocumentIds || existingData.linkedDocumentIds || [],
      updatedAt: new Date().toISOString()
    };
    
    // Sauvegarder les modifications
    const success = await visionService.updateImageMetadata(id, updatedMetadata);
    
    // 🔥 Si le type d'image a changé et devient 'global', déclencher les préparations
    if (body.imageType === 'global' && existingData.imageType !== 'global') {
      console.log(`[API] 🧩 Déclenchement automatique des préparations pour ${id}`);
      
      // Récupérer le buffer de l'image
      const imageBuffer = await visionService.getImageBuffer(id);
      if (imageBuffer) {
        // Lancer la préparation en arrière-plan
        setTimeout(async () => {
          try {
            await intelligentPartMatching.prepareGlobalImage(id, imageBuffer, {
              detectROI: true,
              detectAnchors: true,
              buildHierarchy: true,
              generatePyramid: true
            });
            console.log(`[API] ✅ Préparations terminées pour ${id}`);
          } catch (err) {
            console.error(`[API] ❌ Erreur préparations pour ${id}:`, err);
          }
        }, 100);
      }
    }
    
    if (!success) {
      return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Métadonnées mises à jour avec succès',
      imageType: updatedMetadata.imageType
    });
  } catch (error) {
    console.error('❌ Erreur mise à jour complète:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST - Actions spécifiques sur l'image (préparation, assemblage)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action'); // 'prepare' | 'assemble' | 'detect-roi' | 'detect-anchors'
    
    // Résolution de l'ID
    const resolvedId = await resolveImageId(id);
    if (resolvedId) {
      id = resolvedId;
    }
    
    const imageData = await visionService.getImageData(id);
    if (!imageData) {
      return NextResponse.json({ error: 'Image non trouvée' }, { status: 404 });
    }
    
    const imageBuffer = await visionService.getImageBuffer(id);
    if (!imageBuffer) {
      return NextResponse.json({ error: 'Fichier image introuvable' }, { status: 404 });
    }
    
    switch (action) {
      case 'prepare':
        // Préparation complète de l'image (ROI, ancres, hiérarchie, pyramide)
        const result = await intelligentPartMatching.prepareGlobalImage(id, imageBuffer, {
          detectROI: true,
          detectAnchors: true,
          buildHierarchy: true,
          generatePyramid: true
        });
        return NextResponse.json(result);
      
      case 'detect-roi':
        // Détection des régions d'intérêt uniquement
        const rois = await intelligentPartMatching.detectROIs(imageBuffer, id);
        return NextResponse.json({ success: true, rois });
      
      case 'detect-anchors':
        // Détection des points d'ancrage uniquement
        const anchors = await intelligentPartMatching.detectAnchors(imageBuffer, id);
        return NextResponse.json({ success: true, anchors });
      
      case 'build-hierarchy':
        // Construction de la hiérarchie spatiale
        const hierarchy = await intelligentPartMatching.buildSpatialHierarchy(imageBuffer, id);
        return NextResponse.json({ success: true, hierarchy });
      
      case 'generate-pyramid':
        // Génération de la pyramide multi-résolution
        const pyramid = await intelligentPartMatching.generatePyramid(imageBuffer, id);
        return NextResponse.json({ success: true, levels: pyramid.length });
      
      case 'reindex':
        // Réindexation manuelle pour rafraîchir ChromaDB et BM25 après édition des métadonnées
        const reindexSuccess = await visionService.reindexImage(id);
        return NextResponse.json({ success: reindexSuccess, message: reindexSuccess ? 'Image réindexée avec succès' : 'Échec de la réindexation' });
      
      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    console.error('❌ Erreur action image:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}