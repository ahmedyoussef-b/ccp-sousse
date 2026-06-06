// src/app/api/vision/assemble/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';
import visionService from '@/lib/services/visionService';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

interface AssembleRequest {
  images: string[];        // IDs des images à assembler
  gridRows?: number;       // Nombre de lignes (optionnel)
  gridCols?: number;       // Nombre de colonnes (optionnel)
  name?: string;           // Nom de l'image assemblée
  description?: string;    // Description
  tags?: string[];         // Tags
  folderId?: string;       // Dossier cible
}

interface AssembleResponse {
  success: boolean;
  assembledImageId?: string;
  gridRows?: number;
  gridCols?: number;
  assemblyQuality?: number;
  message?: string;
  error?: string;
}

/**
 * POST - Assemble plusieurs images en une seule image globale (puzzle)
 */
export async function POST(request: NextRequest) {
  console.log('🧩 [API] Assemblage d\'images (puzzle)');
  const startTime = Date.now();
  
  try {
    const body: AssembleRequest = await request.json();
    const { images, gridRows, gridCols, name, description, tags, folderId } = body;
    
    if (!images || images.length === 0) {
      return NextResponse.json({ error: 'Aucune image fournie' }, { status: 400 });
    }
    
    if (images.length < 2) {
      return NextResponse.json({ error: 'Au moins 2 images sont nécessaires' }, { status: 400 });
    }
    
    // Déterminer la grille
    let finalRows = gridRows;
    let finalCols = gridCols;
    
    if (!finalRows || !finalCols) {
      // Grille automatique (essayer de faire une grille carrée ou rectangulaire)
      const total = images.length;
      finalCols = Math.ceil(Math.sqrt(total));
      finalRows = Math.ceil(total / finalCols);
    }
    
    if (finalRows * finalCols < images.length) {
      return NextResponse.json({ 
        error: `Grille ${finalRows}x${finalCols} trop petite pour ${images.length} images` 
      }, { status: 400 });
    }
    
    console.log(`📐 Grille: ${finalRows} x ${finalCols} (${finalRows * finalCols} emplacements, ${images.length} images)`);
    
    // Récupérer les buffers des images
    const imageBuffers: Buffer[] = [];
    const imageMetadatas: any[] = [];
    
    for (let i = 0; i < images.length; i++) {
      const imageId = images[i];
      const buffer = await visionService.getImageBuffer(imageId);
      
      if (!buffer) {
        return NextResponse.json({ error: `Image ${imageId} introuvable` }, { status: 404 });
      }
      
      imageBuffers.push(buffer);
      
      const metadata = await visionService.getImageData(imageId);
      imageMetadatas.push(metadata);
    }
    
    // Charger sharp dynamiquement (évite ERR_DLOPEN_FAILED au build)
    let sharpLib: any;
    try {
      const mod = await import('sharp');
      sharpLib = mod.default || mod;
    } catch (sharpErr) {
      console.warn('⚠️ Sharp non disponible:', sharpErr);
      return NextResponse.json({ error: 'Sharp non disponible sur ce système' }, { status: 503 });
    }

    // Calculer les dimensions optimales pour chaque cellule
    // On prend la plus grande largeur et hauteur parmi toutes les images
    let maxWidth = 0;
    let maxHeight = 0;
    
    for (const buffer of imageBuffers) {
      const metadata = await sharpLib(buffer).metadata();
      maxWidth = Math.max(maxWidth, metadata.width || 0);
      maxHeight = Math.max(maxHeight, metadata.height || 0);
    }
    
    // Ajouter une marge entre les images
    const padding = 10;
    const cellWidth = maxWidth + padding;
    const cellHeight = maxHeight + padding;
    
    const canvasWidth = cellWidth * finalCols;
    const canvasHeight = cellHeight * finalRows;
    
    console.log(`📏 Dimensions: ${canvasWidth}x${canvasHeight} (cellules ${cellWidth}x${cellHeight})`);
    
    // Créer le canvas vide
    let canvas = sharpLib({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: { r: 240, g: 240, b: 240, alpha: 1 }
      }
    });
    
    // Assembler les images sur le canvas
    const composites: any[] = [];
    
    for (let i = 0; i < imageBuffers.length; i++) {
      const row = Math.floor(i / finalCols);
      const col = i % finalCols;
      const x = col * cellWidth;
      const y = row * cellHeight;
      
      composites.push({
        input: imageBuffers[i],
        top: y,
        left: x
      });
      
      console.log(`  📷 Image ${i + 1} → position (${x}, ${y})`);
    }
    
    canvas = canvas.composite(composites);
    
    // Générer l'image assemblée
    const assembledBuffer = await canvas.png().toBuffer();
    
    // Générer un nom pour l'image assemblée
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(assembledBuffer).digest('hex').substring(0, 8);
    const filename = name || `assembled_${timestamp}_${hash}.png`;
    
    // Enregistrer l'image assemblée
    const registerResult = await visionService.registerImage(
      { buffer: assembledBuffer, name: filename }, 
      {
        filename,
      description: description || `Assemblage de ${images.length} images (${finalRows}x${finalCols})`,
      tags: tags || ['assembled', 'puzzle', 'global'],
      folderId: folderId,
      imageType: 'global'
    });
    
    if (!registerResult || !registerResult.id) {
      return NextResponse.json({ error: 'Erreur lors de l\'enregistrement' }, { status: 500 });
    }
    
    // Sauvegarder l'information d'assemblage dans SQLite
    const db = getSQLiteCore();
    const assemblyId = crypto.randomUUID();
    
    db.visionPrep.saveAssembly({
      id: assemblyId,
      result_image_id: registerResult.id,
      source_images: images,
      grid_rows: finalRows,
      grid_cols: finalCols,
      assembly_quality: 1.0,
      created_at: Date.now(),
      metadata: {
        name,
        description,
        tags,
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - startTime
      }
    });
    
    // Enregistrer un log
    db.visionPrep.savePreparationLog({
      image_id: registerResult.id,
      operation: 'ASSEMBLE_IMAGES',
      status: 'success',
      details: `Assemblage de ${images.length} images en grille ${finalRows}x${finalCols}`,
      duration_ms: Date.now() - startTime,
      created_at: Date.now()
    });
    
    console.log(`✅ Image assemblée créée: ${registerResult.id} (${Date.now() - startTime}ms)`);
    
    const response: AssembleResponse = {
      success: true,
      assembledImageId: registerResult.id,
      gridRows: finalRows,
      gridCols: finalCols,
      assemblyQuality: 1.0,
      message: `Assemblage réussi avec ${images.length} images`
    };
    
    return NextResponse.json(response);
    
  } catch (error: any) {
    console.error('❌ Erreur assemblage:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET - Récupère les assemblages existants
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const imageId = searchParams.get('imageId');
    const limit = parseInt(searchParams.get('limit') || '50');
    
    const db = getSQLiteCore();
    
    if (imageId) {
      // Récupérer les assemblages pour une image spécifique
      const assemblies = db.visionPrep.getAssembliesByResultImage(imageId);
      return NextResponse.json({ success: true, assemblies });
    } else {
      // Lister tous les assemblages
      const rows = db.getDB().prepare(`
        SELECT a.*, v.filename, v.createdAt, v.imageType
        FROM image_assemblies a
        JOIN vision_data v ON a.result_image_id = v.id
        ORDER BY a.created_at DESC
        LIMIT ?
      `).all(limit) as any[];
      
      const assemblies = rows.map(row => ({
        id: row.id,
        resultImageId: row.result_image_id,
        filename: row.filename,
        sourceImages: JSON.parse(row.source_images),
        gridRows: row.grid_rows,
        gridCols: row.grid_cols,
        assemblyQuality: row.assembly_quality,
        createdAt: row.created_at,
        imageType: row.imageType
      }));
      
      return NextResponse.json({ success: true, assemblies });
    }
    
  } catch (error: any) {
    console.error('❌ Erreur récupération assemblages:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE - Supprime un assemblage
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const assemblyId = searchParams.get('assemblyId');
    
    if (!assemblyId) {
      return NextResponse.json({ error: 'assemblyId requis' }, { status: 400 });
    }
    
    const db = getSQLiteCore();
    
    // Récupérer l'assemblage pour connaître l'image associée
    const assembly = db.getDB().prepare(`SELECT * FROM image_assemblies WHERE id = ?`).get(assemblyId) as any;
    
    if (!assembly) {
      return NextResponse.json({ error: 'Assemblage non trouvé' }, { status: 404 });
    }
    
    // Supprimer l'image assemblée
    await visionService.deleteImage(assembly.result_image_id);
    
    // Supprimer l'enregistrement d'assemblage
    db.getDB().prepare(`DELETE FROM image_assemblies WHERE id = ?`).run(assemblyId);
    
    return NextResponse.json({ success: true, message: 'Assemblage supprimé' });
    
  } catch (error: any) {
    console.error('❌ Erreur suppression assemblage:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}