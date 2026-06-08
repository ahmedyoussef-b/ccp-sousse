export const runtime = 'edge';

// app/api/training/receive-model/route.ts - Version corrigée
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { writeFile } from 'fs/promises';



export async function POST(request: NextRequest) {
  try {
    console.log('[receive-model] Début upload');
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier reçu' }, { status: 400 });
    }
    
    if (!file.name.endsWith('.zip')) {
      return NextResponse.json({ error: 'Format non supporté. Seul le format ZIP est accepté.' }, { status: 400 });
    }
    
    console.log(`[receive-model] Fichier: ${file.name}, Taille: ${file.size} bytes`);
    
    // Créer le dossier uploads (pas models directement)
    const uploadsDir = path.join(process.cwd(), 'data', 'models', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log(`[receive-model] Dossier créé: ${uploadsDir}`);
    }
    
    // Sauvegarder avec le nom original
    const filepath = path.join(uploadsDir, file.name);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);
    
    console.log(`[receive-model] Fichier sauvegardé: ${filepath}`);
    
    return NextResponse.json({
      success: true,
      message: 'Modèle reçu avec succès',
      filename: file.name,
      size: file.size,
      path: filepath
    });
    
  } catch (error) {
    console.error('[receive-model] Erreur:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la réception du modèle: ' + (error instanceof Error ? error.message : 'Erreur inconnue') },
      { status: 500 }
    );
  }
}