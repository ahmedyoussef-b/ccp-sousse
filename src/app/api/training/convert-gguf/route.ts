// app/api/training/convert-gguf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { modelName } = await request.json();
    
    console.log('[convert-gguf] Conversion optionnelle pour:', modelName);
    
    const modelsDir = path.join(process.cwd(), 'data', 'models');
    const mergedDir = path.join(modelsDir, 'merged', modelName);
    const ggufDir = path.join(modelsDir, 'gguf', modelName);
    
    if (!fs.existsSync(mergedDir)) {
      return NextResponse.json({ error: 'Modèle fusionné non trouvé' }, { status: 404 });
    }
    
    // Créer le dossier gguf
    if (!fs.existsSync(ggufDir)) {
      fs.mkdirSync(ggufDir, { recursive: true });
    }
    
    // Copier simplement les fichiers (pas de conversion réelle)
    const files = fs.readdirSync(mergedDir);
    for (const file of files) {
      const src = path.join(mergedDir, file);
      const dest = path.join(ggufDir, file);
      if (fs.statSync(src).isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
      } else {
        fs.copyFileSync(src, dest);
      }
    }
    
    console.log('[convert-gguf] Préparation terminée');
    
    return NextResponse.json({
      success: true,
      message: 'Modèle préparé (conversion GGUF optionnelle ignorée)',
      outputPath: ggufDir,
      skipped: true
    });
    
  } catch (error) {
    console.error('[convert-gguf] Erreur:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de la préparation' },
      { status: 500 }
    );
  }
}