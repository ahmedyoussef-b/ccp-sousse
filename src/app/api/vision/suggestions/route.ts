export const runtime = 'edge';

// app/api/vision/suggestions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { autoFolderClassifier } from '@/ai/innovations/04-auto-folder-classifier';
import visionService from '@/lib/services/visionService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60s max — Ollama peut être lent sur CPU

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const filename = formData.get('filename') as string | null;
    
    if (!imageFile) {
      return NextResponse.json(
        { error: 'Image requise' },
        { status: 400 }
      );
    }
    
    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // 1. Analyse par Gemini Vision (Innovation #4)
    const classification = await autoFolderClassifier.classifyImage(buffer);
    
    // 2. Suggestion par nom de fichier (V2)
    let suggestedFolderId = 'root';
    if (filename || imageFile.name) {
      suggestedFolderId = visionService.suggestFolderByName(filename || imageFile.name) || 'root';
    }

    return NextResponse.json({
      success: true,
      tags: classification.tags,
      equipmentType: classification.equipmentType,
      zone: classification.zone,
      suggestedFolder: classification.suggestedFolder, // Nom suggéré par IA
      suggestedFolderId: suggestedFolderId,          // ID suggéré par nom (V2)
      confidence: classification.confidence,
    });
  } catch (error) {
    console.error('Erreur suggestions:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la génération des suggestions' },
      { status: 500 }
    );
  }
}