export const runtime = 'edge';

// app/api/vision/images/bulk-delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import visionService from '@/lib/services/visionService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { imageIds } = await request.json();
    
    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return NextResponse.json(
        { error: 'Liste d\'identifiants d\'images requise' },
        { status: 400 }
      );
    }

    const result = await visionService.deleteImages(imageIds);
    
    return NextResponse.json({
      success: result,
      deleted: result ? imageIds.length : 0,
      total: imageIds.length,
      message: `${result ? imageIds.length : 0} images supprimées sur ${imageIds.length}`
    });
  } catch (error) {
    console.error('Erreur suppression groupée:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la suppression groupée' },
      { status: 500 }
    );
  }
}
