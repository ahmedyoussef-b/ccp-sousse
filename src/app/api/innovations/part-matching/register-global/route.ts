// src/app/api/innovations/part-matching/register-global/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { intelligentPartMatching } from '@/ai/innovations/09-intelligent-part-matching';

export const dynamic = 'force-dynamic';

interface RegisterGlobalResponse {
  success: boolean;
  globalImageId?: string;
  patchesCount?: number;
  gridRows?: number;
  gridCols?: number;
  error?: string;
  message?: string;
}

export async function POST(request: NextRequest) {
  console.group('📸 [PART-MATCHING] ENREGISTREMENT IMAGE GLOBALE');

  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const gridRows = formData.get('gridRows') ? parseInt(formData.get('gridRows') as string) : undefined;
    const gridCols = formData.get('gridCols') ? parseInt(formData.get('gridCols') as string) : undefined;
    const overlap = formData.get('overlap') ? parseFloat(formData.get('overlap') as string) : undefined;
    const patchSize = formData.get('patchSize') ? parseInt(formData.get('patchSize') as string) : undefined;
    const autoGrid = formData.get('autoGrid') === 'true';
    
    // Métadonnées optionnelles
    const description = formData.get('description') as string || '';
    const zone = formData.get('zone') as string || '';
    const equipmentType = formData.get('equipmentType') as string || 'pupitre';
    const tags = formData.get('tags') ? JSON.parse(formData.get('tags') as string) : [];

    if (!imageFile) {
      console.log('❌ Aucune image reçue');
      console.groupEnd();
      return NextResponse.json(
        { success: false, error: 'Image requise' },
        { status: 400 }
      );
    }

    // Vérifier le type de fichier
    if (!imageFile.type.startsWith('image/')) {
      console.log('❌ Type de fichier non supporté:', imageFile.type);
      console.groupEnd();
      return NextResponse.json(
        { success: false, error: 'Format d\'image non supporté' },
        { status: 400 }
      );
    }

    console.log('📸 Image reçue:', imageFile.name);
    console.log('📏 Dimensions grille:', autoGrid ? 'auto' : `${gridRows || 'auto'}x${gridCols || 'auto'}`);
    console.log('📁 Métadonnées:', { description, zone, equipmentType, tags });

    // Sauvegarder temporairement
    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const tempPath = join(tmpdir(), `part-matching-${Date.now()}.jpg`);
    await writeFile(tempPath, buffer);

    try {
      // Calculer la grille automatiquement si demandé
      let finalGridRows = gridRows;
      let finalGridCols = gridCols;
      
      if (autoGrid) {
        // Récupérer les dimensions de l'image pour calcul optimal
        // Pour l'instant, valeurs par défaut
        finalGridRows = finalGridRows || 3;
        finalGridCols = finalGridCols || 4;
      }

      // Enregistrer l'image globale
      const result = await intelligentPartMatching.registerGlobalImage({
        imageBuffer: buffer,
        filename: imageFile.name,
        gridRows: finalGridRows,
        gridCols: finalGridCols,
        overlap,
        patchSize,
        metadata: {
          description,
          zone,
          equipmentType,
          tags
        }
      });

      if (result.success) {
        console.log(`✅ Image globale enregistrée: ${result.globalImageId}`);
        console.log(`   Patches créés: ${result.patchesCount}`);
        
        const response: RegisterGlobalResponse = {
          success: true,
          globalImageId: result.globalImageId,
          patchesCount: result.patchesCount,
          gridRows: finalGridRows,
          gridCols: finalGridCols,
          message: `Image globale enregistrée avec ${result.patchesCount} patches`
        };
        
        console.groupEnd();
        return NextResponse.json(response);
      } else {
        console.log('❌ Échec enregistrement');
        console.groupEnd();
        return NextResponse.json(
          { success: false, error: 'Échec de l\'enregistrement' },
          { status: 500 }
        );
      }
      
    } finally {
      // Nettoyer fichier temporaire
      await unlink(tempPath).catch(() => {});
    }
  } catch (error) {
    console.error('❌ Erreur enregistrement image globale:', error);
    console.groupEnd();
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}