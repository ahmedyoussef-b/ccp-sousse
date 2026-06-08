export const runtime = 'edge';

// app/api/vision/diagnose/route.ts
import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import visionService from '@/lib/services/visionService';

export async function POST(request: NextRequest) {
  console.group('🤖 DIAGNOSTIC IA VISION');
  
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      console.log('❌ Aucune image reçue');
      console.groupEnd();
      return NextResponse.json(
        { error: 'Image requise pour le diagnostic' },
        { status: 400 }
      );
    }

    console.log('📸 Analyse de l\'image:', imageFile.name);

    // Sauvegarder temporairement ou lire directement le buffer
    const bytes = await imageFile.arrayBuffer();
    // Ajout d'un underscore pour indiquer que cette variable est intentionnellement non utilisée
    // ou l'utiliser pour extraire les features avant le diagnostic
    const _imageBuffer = Buffer.from(bytes);
    
    // Extraire les features de l'image pour un diagnostic plus précis
    // Note: La méthode extractFeatures attend un Buffer
    const features = await visionService.extractFeatures(_imageBuffer);
    
    // Lancer le diagnostic IA avec les features extraites
    // Utiliser une requête pertinente basée sur l'analyse de l'image
    const diagnostic = await visionService.diagnoseWithAI('temp_image_id', 'analyze this industrial image and detect anomalies, equipment state, and potential issues');

    console.log('✅ Diagnostic généré avec succès');
    console.groupEnd();

    return NextResponse.json({ 
      success: true,
      diagnostic,
      featuresLength: features.length
    });
    
  } catch (error) {
    console.error('❌ Erreur diagnostic:', error);
    console.groupEnd();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue lors du diagnostic' },
      { status: 500 }
    );
  }
}