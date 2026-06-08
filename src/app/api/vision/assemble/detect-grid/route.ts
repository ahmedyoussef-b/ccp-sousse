export const runtime = 'edge';

// src/app/api/vision/assemble/detect-grid/route.ts
import { NextRequest, NextResponse } from 'next/server';
import visionService from '@/lib/services/visionService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { imageIds } = await request.json();
    
    if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
      return NextResponse.json({ error: 'IDs d\'images manquants' }, { status: 400 });
    }

    // Récupérer les métadonnées pour analyser les noms de fichiers
    const metadatas = await Promise.all(
      imageIds.map(id => visionService.getImageData(id))
    );

    // Tentative de détection par nom de fichier (ex: image_R1_C1.jpg)
    let detectedRows = 0;
    let detectedCols = 0;

    const rowRegex = /[rR](\d+)/;
    const colRegex = /[cC](\d+)/;

    const rowIndices = new Set<number>();
    const colIndices = new Set<number>();

    metadatas.forEach(meta => {
      if (!meta) return;
      const rowMatch = meta.filename.match(rowRegex);
      const colMatch = meta.filename.match(colRegex);
      
      if (rowMatch) rowIndices.add(parseInt(rowMatch[1]));
      if (colMatch) colIndices.add(parseInt(colMatch[1]));
    });

    if (rowIndices.size > 0 && colIndices.size > 0) {
      detectedRows = rowIndices.size;
      detectedCols = colIndices.size;
    } else {
      // Fallback: grille carrée
      detectedCols = Math.ceil(Math.sqrt(imageIds.length));
      detectedRows = Math.ceil(imageIds.length / detectedCols);
    }

    return NextResponse.json({
      success: true,
      rows: detectedRows,
      cols: detectedCols,
      method: rowIndices.size > 0 ? 'filename_parsing' : 'square_fallback'
    });

  } catch (error: any) {
    console.error('❌ Erreur détection grille:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
