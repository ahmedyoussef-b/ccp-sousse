import { NextRequest, NextResponse } from 'next/server';
import { panoramicStitching } from '@/ai/innovations/07-panoramic-stitching';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const images: Buffer[] = [];
    
    // Récupérer toutes les images
    let i = 0;
    while (true) {
      const image = formData.get(`image${i}`) as File;
      if (!image) break;
      images.push(Buffer.from(await image.arrayBuffer()));
      i++;
    }
    
    if (images.length < 2) {
      return NextResponse.json({ error: 'Au moins 2 images sont nécessaires' }, { status: 400 });
    }
    
    const db = getSQLiteCore();
    const result = await panoramicStitching.stitchPanorama(images);
    
    // Sauvegarder dans l'historique
    await db.recordMetric('panoramic', 'stitch_count', 1);
    await db.recordMetric('panoramic', 'stitch_quality', result.quality);
    
    return NextResponse.json({
      success: result.success,
      stitchedCount: result.stitchedCount,
      quality: result.quality,
      message: result.message
    });
  } catch (error: any) {
    console.error('Erreur panoramic:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}