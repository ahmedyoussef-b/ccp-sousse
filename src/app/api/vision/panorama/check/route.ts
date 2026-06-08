export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';
import visionService from '@/lib/services/visionService';

/**
 * API pour vérifier la compatibilité de deux images pour un panorama
 * @route POST /api/vision/panorama/check
 */
export async function POST(req: Request) {
  try {
    const { imageAId, imageBId } = await req.json();

    if (!imageAId || !imageBId) {
      return NextResponse.json({ error: 'IDs d\'images requis' }, { status: 400 });
    }

    console.log(`[Panorama-Check] 🔍 Vérification d'overlap entre ${imageAId} et ${imageBId}`);

    const db = getSQLiteCore();
    
    // 1. Récupérer les métadonnées
    const imgA = db.vision?.getImage?.(imageAId);
    const imgB = db.vision?.getImage?.(imageBId);

    if (!imgA || !imgB) {
      return NextResponse.json({ 
        error: 'Une ou plusieurs images introuvables en base',
        details: { imgA: !!imgA, imgB: !!imgB }
      }, { status: 404 });
    }

    // 2. Récupérer les features (pour estimer l'overlap)
    // Note: Dans un système réel, on utiliserait SIFT/SURF ou des descripteurs locaux.
    // Ici on utilise la similarité globale comme indicateur rapide.
    
    const featuresA = await visionService.getFeatures(imageAId);
    const featuresB = await visionService.getFeatures(imageBId);

    if (!featuresA || !featuresB) {
      return NextResponse.json({ 
        canStitch: false, 
        confidence: 0,
        reason: 'Descripteurs visuels manquants'
      });
    }

    // Calcul de similarité cosinus (déjà implémenté dans SQLiteCore mais on le refait ici pour clarté)
    const similarity = cosineSimilarity(featuresA, featuresB);
    
    // Seuil empirique pour l'overlap de panorama
    const canStitch = similarity > 0.45;
    
    return NextResponse.json({
      canStitch,
      confidence: similarity,
      suggestedOverlap: Math.round(similarity * 100),
      metadata: {
        imgA: { filename: imgA.filename, type: imgA.image_type },
        imgB: { filename: imgB.filename, type: imgB.image_type }
      }
    });

  } catch (error: any) {
    console.error('[Panorama-Check] ❌ Erreur:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}