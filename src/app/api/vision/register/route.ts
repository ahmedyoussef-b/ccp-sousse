export const runtime = 'edge';

// app/api/vision/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import visionService from '@/lib/services/visionService';
import { hybridVisionSearch } from '@/ai/innovations/05-hybrid-vision-search';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function POST(request: NextRequest) {
  console.group('📝 ENREGISTREMENT IMAGE');
  const startTime = Date.now();
  
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const metadataStr = formData.get('metadata') as string | null;
    const folderId = formData.get('folderId') as string | null;
    const targetPath = formData.get('targetPath') as string | null;
    const ocrText = formData.get('ocrText') as string | null;

    
    console.log('🔍 DEBUG FORM DATA:');
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        console.log(`  - ${key}: FILE (${value.name})`);
      } else {
        console.log(`  - ${key}: ${value}`);
      }
    }
    
    if (!imageFile) {
      console.log('❌ Aucune image reçue');
      console.groupEnd();
      return NextResponse.json(
        { error: 'Image requise' },
        { status: 400 }
      );
    }

    // Valider le type d'image
    if (!imageFile.type.startsWith('image/')) {
      console.log('❌ Type de fichier non supporté:', imageFile.type);
      console.groupEnd();
      return NextResponse.json(
        { error: 'Format d\'image non supporté' },
        { status: 400 }
      );
    }

    // Parser les métadonnées
    let metadata: any = {};
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch (e) {
        console.log('❌ Métadonnées invalides');
        console.groupEnd();
        return NextResponse.json(
          { error: 'Métadonnées invalides' },
          { status: 400 }
        );
      }
    }

    // Gestion du dossier si folderNamePath - Priorité HAUTE pour créer le dossier AVANT utilisation
    if (metadata.folderNamePath) {
      const folders = await visionService.listFolders();
      const pathName = metadata.folderNamePath;
      let existingFolder = folders.find(f => f.name === pathName);
      if (!existingFolder) {
        // Correction: createFolder attend un objet { name, parentId } et non deux arguments
        existingFolder = await visionService.createFolder({ name: pathName, parentId: 'root' });
      }
      metadata.folderId = existingFolder.id;
      delete metadata.folderNamePath;
      console.log(`📁 Dossier créé depuis folderNamePath: ${pathName} -> ID: ${existingFolder.id}`);
    }
    
    // Priorité: Utiliser folderId du formulaire (seulement si pas déjà défini par folderNamePath)
    if (folderId && !metadata.folderId) {
      metadata.folderId = folderId;
      console.log(`📁 Dossier cible (folderId): ${folderId}`);
    }
    
    if (targetPath) {
      metadata.targetPath = targetPath;
      console.log(`📁 Chemin cible (targetPath): ${targetPath}`);
    }

    if (ocrText) {
      metadata.ocrText = ocrText;
      console.log(`📝 OCR Texte reçu (${ocrText.length} caractères)`);
    }

    console.log('💾 Enregistrement image avec métadonnées:', metadata);


    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const tempPath = join(tmpdir(), `vision-${Date.now()}.jpg`);
    await writeFile(tempPath, buffer);

    try {
      // Correction: registerImage attend 2 arguments (file, meta) et non 3
      const result = await visionService.registerImage(
        {
          buffer: buffer,
          name: imageFile.name,
          originalname: imageFile.name
        },
        {
          filename: imageFile.name,
          ...metadata,
          date: new Date().toISOString()
        }
      );

      // 🔥 NOUVEAU: Synchroniser l'index BM25 pour la recherche textuelle
      const db = getSQLiteCore();
      const textForIndex = [
        metadata.description || '',
        (metadata.tags || []).join(' '),
        metadata.filename || imageFile.name,
        metadata.equipmentType || '',
        metadata.zone || '',
        metadata.location || '',
        ocrText || ''
      ].filter(Boolean).join(' ');

      
      if (textForIndex.trim()) {
        await hybridVisionSearch.addToIndex(result.id, textForIndex);
        console.log(`📝 Index BM25 mis à jour pour ${result.id}`);
      }
      
      // 🔥 NOUVEAU: Enregistrer les métriques
      await db.recordMetric('vision_register', 'image_count', 1);
      await db.recordMetric('vision_register', 'duration_ms', Date.now() - startTime);
      
      if (metadata.tags && metadata.tags.length > 0) {
        await db.recordMetric('vision_register', 'tags_count', metadata.tags.length);
      }
      
      // 🔥 NOUVEAU: Mettre à jour les statistiques de l'innovation
      await db.recordMetric('hybrid_search', 'index_size', 
        (await hybridVisionSearch.getStats()).indexSize);

      console.log('✅ Image enregistrée avec ID:', result.id);
      console.log(`📁 Dossier final: ${metadata.folderId || 'root'}`);
      console.log(`⏱️ Durée totale: ${Date.now() - startTime}ms`);
      console.groupEnd();
      
      return NextResponse.json({
        success: true,
        imageId: result.id,
        folderId: metadata.folderId || 'root',
        message: 'Image enregistrée avec succès',
        indexUpdated: true,
        durationMs: Date.now() - startTime
      });
      
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  } catch (error) {
    console.error('❌ Erreur enregistrement:', error);
    console.groupEnd();
    
    // 🔥 NOUVEAU: Enregistrer l'erreur dans les métriques
    try {
      const db = getSQLiteCore();
      await db.recordMetric('vision_register', 'error_count', 1);
    } catch (metricError) {
      console.error('Erreur enregistrement métrique:', metricError);
    }
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.stack || error.message : 'Erreur inconnue', 
        details: String(error) 
      },
      { status: 500 }
    );
  }
}