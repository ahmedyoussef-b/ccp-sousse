// app/api/vision/image-source/route.ts
import { NextRequest, NextResponse } from 'next/server';
import visionService from '@/lib/services/visionService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return new NextResponse('ID requis', { status: 400 });
    }

    const data = await visionService.getImageData(id);
    if (!data || !data.image) {
      return new NextResponse('Image introuvable', { status: 404 });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(data.image, 'base64');

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });

  } catch (error) {
    console.error('❌ Erreur image-source:', error);
    return new NextResponse('Erreur serveur', { status: 500 });
  }
}
