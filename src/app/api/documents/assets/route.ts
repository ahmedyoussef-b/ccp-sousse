import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { DOCUMENTS_ROOT } from '@/lib/document-manager/config';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    // Dossier cible pour les assets
    const assetsDir = path.join(DOCUMENTS_ROOT, '_assets', 'images');
    await mkdir(assetsDir, { recursive: true });

    // Nettoyage du nom de fichier
    const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fullPath = path.join(assetsDir, fileName);
    
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(fullPath, buffer);

    // Chemin relatif à DOCUMENTS_ROOT (ou slash-based pour l'accès web)
    const relativePath = `/_assets/images/${fileName}`;

    return NextResponse.json({ 
      success: true, 
      path: relativePath,
      fileName: fileName
    });
    
  } catch (error: any) {
    console.error('[API][ASSETS] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
