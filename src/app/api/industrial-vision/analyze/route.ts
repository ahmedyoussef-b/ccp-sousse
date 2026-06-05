// src/app/api/industrial-vision/analyze/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getIndustrialVisionIntegration } from '@/lib/industrial-vision/integration.service';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;
    const pathParam = request.nextUrl.searchParams.get('path');
    
    let filepath: string;
    let filename: string;

    if (file) {
      // Sauvegarder l'image uploadée
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      const uploadDir = path.join(process.cwd(), 'data', 'industrial-captures');
      await mkdir(uploadDir, { recursive: true });
      
      filename = `${Date.now()}_${file.name}`;
      filepath = path.join(uploadDir, filename);
      await writeFile(filepath, buffer);
    } else if (pathParam) {
      // Utiliser le chemin fourni
      filepath = path.isAbsolute(pathParam) ? pathParam : path.join(process.cwd(), pathParam);
      filename = path.basename(filepath);
    } else {
      return NextResponse.json({ error: 'Aucune image ou chemin fourni' }, { status: 400 });
    }
    
    // Initialiser et utiliser le service d'intégration
    const visionService = getIndustrialVisionIntegration();
    await visionService.initialize();
    
    // Traiter l'image (analyse + similarité)
    const analysisResult = await visionService.processImage(filepath);
    
    // Formater la réponse pour la compatibilité avec le frontend
    const result = {
      success: true,
      image: filename,
      path: filepath,
      timestamp: analysisResult.timestamp,
      analysis: analysisResult.analysis,
      similarity: analysisResult.similarity,
      diagnostic: generateDiagnostic(analysisResult.similarity),
      recommandations: generateRecommandations(analysisResult.similarity)
    };
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Erreur API Vision:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// Fonctions utilitaires pour le formatage (peuvent être déplacées dans un helper)
function generateDiagnostic(similarity: any): string {
  if (similarity.bestMatch === 'defaut') return '⚠️ ALARME - Anomalie détectée';
  if (similarity.bestMatch === 'arret_normale') return '⏸️ Installation à l\'arrêt';
  return '✅ Fonctionnement normal';
}

function generateRecommandations(similarity: any): string[] {
  if (similarity.bestMatch === 'defaut') return ['Vérifier les paramètres critiques', 'Contacter la maintenance'];
  return ['Surveillance continue'];
}