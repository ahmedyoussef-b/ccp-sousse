export const runtime = 'edge';

// app/api/vision/process/route.ts
import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import visionService from '@/lib/services/visionService';
import { smartRouter } from '@/ai/router/smart-router';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const task = formData.get('task') as string | null; // 'metadata' | 'description' | 'features'

    if (!imageFile) {
      return NextResponse.json({ error: 'Image requise' }, { status: 400 });
    }

    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (task === 'features') {
      const features = await visionService.extractFeatures(buffer);
      return NextResponse.json({ success: true, features });
    }

    if (task === 'metadata') {
      const prompt = `Extrais les métadonnées techniques de cette image industrielle sous format JSON pur. 
Champs requis: { 
  "location": "lieu probable", 
  "equipmentType": "type d'équipement", 
  "brand": "marque si visible", 
  "state": "normal|degraded|critical", 
  "tags": ["tag1", "tag2"],
  "serialNumber": "si visible"
}`;
      const base64Image = buffer.toString('base64');
      const result = await smartRouter.route(prompt, { image: base64Image });
      
      // Essayer d'extraire le bloc JSON de la réponse
      try {
        const jsonMatch = result.response.match(/\{[\s\S]*\}/);
        const metadata = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: result.response };
        return NextResponse.json({ success: true, metadata });
      } catch (e) {
        return NextResponse.json({ success: true, metadata: { raw: result.response } });
      }
    }

    if (task === 'description') {
      const prompt = "Génère une description technique détaillée et naturelle de cet équipement industriel et de son environnement immédiat.";
      const base64Image = buffer.toString('base64');
      const result = await smartRouter.route(prompt, { image: base64Image });
      return NextResponse.json({ success: true, description: result.response });
    }

    return NextResponse.json({ error: 'Task invalide ou manquante' }, { status: 400 });

  } catch (error) {
    console.error('❌ Erreur process vision:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
