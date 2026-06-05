import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteCore } from '@/ai/core/sqlite/manager';

export async function GET() {
  try {
    const sqlite = getSQLiteCore();
    const hierarchy = sqlite.reference.getHierarchy();
    return NextResponse.json({ zones: hierarchy });
  } catch (error) {
    console.error('Error in reference/enrich GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sqlite = getSQLiteCore();
    const { action, data } = body;

    if (action === 'updateZone') {
      sqlite.reference.saveZone({
        id: data.zone_id,
        name: data.zone_name,
        description: data.zone_description,
        metadata: { created_by: data.created_by }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'linkImage') {
      const { imageId, entityId, entityType } = data;
      const image = sqlite.vision.getImage(imageId);
      if (!image) return NextResponse.json({ error: 'Image not found' }, { status: 404 });

      const updatedMetadata = { 
        ...(image.metadata || {}), 
        [`${entityType}Id`]: entityId 
      };

      sqlite.vision.updateImage(imageId, { 
        ...image, 
        metadata: updatedMetadata 
      });

      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error('Error in reference/enrich POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
