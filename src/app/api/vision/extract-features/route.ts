// app/api/vision/extract-features/route.ts
import { NextRequest, NextResponse } from 'next/server';
import visionService from '@/lib/services/visionService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    
    if (!imageFile) {
      return NextResponse.json({ error: 'Image requise' }, { status: 400 });
    }
    
    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const features = await visionService.extractFeatures(buffer);
    
    return NextResponse.json({ success: true, features });
  } catch (error) {
    console.error('Erreur extraction features:', error);
    return NextResponse.json(
      { error: 'Erreur extraction features' },
      { status: 500 }
    );
  }
}