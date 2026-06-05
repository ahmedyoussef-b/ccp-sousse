// src/app/api/innovations/part-matching/match-detail/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { intelligentPartMatching } from '@/ai/innovations/09-intelligent-part-matching';

export const dynamic = 'force-dynamic';

interface MatchDetailResponse {
  success: boolean;
  found: boolean;
  globalImage?: {
    id: string;
    filename: string;
    image?: string;
  };
  matchedZone?: {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  };
  similarity: number;
  message?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  console.group('🔍 [PART-MATCHING] RECHERCHE DE LOCALISATION');

  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const globalImageId = formData.get('globalImageId') as string | null;
    const threshold = formData.get('threshold') ? parseFloat(formData.get('threshold') as string) : undefined;

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
    if (globalImageId) {
      console.log('🎯 Recherche limitée à l\'image globale:', globalImageId);
    }
    if (threshold) {
      console.log('🎚️ Seuil de similarité:', threshold);
    }

    // Sauvegarder temporairement
    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const tempPath = join(tmpdir(), `part-match-${Date.now()}.jpg`);
    await writeFile(tempPath, buffer);

    try {
      // Rechercher la localisation
      const result = await intelligentPartMatching.findPartLocation({
        imageBuffer: buffer,
        globalImageId: globalImageId || undefined,
        threshold: threshold || 0.55,
        maxResults: 5
      });

      console.log(`📊 Résultat: ${result.found ? '✅ Trouvé' : '❌ Non trouvé'}`);
      if (result.found) {
        console.log(`   Similarité: ${Math.round(result.similarity * 100)}%`);
        console.log(`   Zone: x=${result.matchedZone?.x}, y=${result.matchedZone?.y}, ${result.matchedZone?.width}x${result.matchedZone?.height}`);
      }

      // 🔥 CONSTRUCTION D'UNE RÉPONSE JSON VALIDE
      const response: MatchDetailResponse = {
        success: true,
        found: result.found || false,
        similarity: result.similarity || 0,
        message: result.message || (result.found ? 'Localisation trouvée' : 'Aucune localisation trouvée')
      };

      if (result.found && result.globalImage) {
        let base64Image = undefined;
        try {
          const { default: visionService } = await import('@/lib/services/visionService');
          const rawImageId = result.globalImage.id.replace(/^vision_/, '');
          const imgData = await visionService.getImageData(rawImageId);
          if (imgData && imgData.image) {
            base64Image = imgData.image;
          }
        } catch (e) {
          console.error("Erreur récupération image globale base64:", e);
        }

        response.globalImage = {
          id: result.globalImage.id,
          filename: result.globalImage.filename || 'unknown',
          image: base64Image
        };
        response.matchedZone = result.matchedZone ? {
          x: result.matchedZone.x,
          y: result.matchedZone.y,
          width: result.matchedZone.width,
          height: result.matchedZone.height,
          confidence: result.matchedZone.confidence || result.similarity
        } : undefined;
      }

      console.groupEnd();
      return NextResponse.json(response);
      
    } finally {
      // Nettoyer fichier temporaire
      await unlink(tempPath).catch(() => {});
    }
  } catch (error) {
    console.error('❌ Erreur recherche localisation:', error);
    console.groupEnd();
    // 🔥 TOUJOURS RETOURNER UN JSON VALIDE
    return NextResponse.json(
      { 
        success: false, 
        found: false,
        similarity: 0,
        error: error instanceof Error ? error.message : 'Erreur inconnue' 
      },
      { status: 500 }
    );
  }
}