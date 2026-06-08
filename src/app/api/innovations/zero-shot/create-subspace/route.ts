export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { zeroShotAnomaly } from '@/ai/innovations/01-zero-shot-anomaly';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const name = formData.get('name') as string || `subspace_${Date.now()}`;
    
    // Récupérer les images uploadées
    const imageFiles: File[] = [];
    let i = 0;
    while (true) {
      const file = formData.get(`image${i}`) as File;
      if (!file) break;
      imageFiles.push(file);
      i++;
    }
    
    if (imageFiles.length < 2) {
      return NextResponse.json({ error: 'Au moins 2 images nécessaires' }, { status: 400 });
    }
    
    const referenceImageIds: string[] = [];
    
    // Étape 1: Enregistrer chaque image
    for (const imageFile of imageFiles) {
      const uploadFormData = new FormData();
      uploadFormData.append('image', imageFile);
      uploadFormData.append('metadata', JSON.stringify({
        filename: imageFile.name,
        source: 'zero-shot-reference',
        createdAt: new Date().toISOString()
      }));
      
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const uploadResponse = await fetch(`${baseUrl}/api/vision/register`, {
        method: 'POST',
        body: uploadFormData,
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`Erreur upload: ${imageFile.name}`);
      }
      
      const uploadData = await uploadResponse.json();
      referenceImageIds.push(uploadData.imageId);
    }
    
    // Étape 2: Créer le sous-espace via l'innovation
    await zeroShotAnomaly.createSubspace(referenceImageIds, { name });

    
    return NextResponse.json({
      success: true,
      subspaceId: name,
      referenceImageIds,
      message: `Sous-espace "${name}" créé avec ${imageFiles.length} images`
    });
    
  } catch (error: any) {
    console.error('Erreur:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}