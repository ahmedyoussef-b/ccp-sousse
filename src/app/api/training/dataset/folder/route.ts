export const runtime = 'edge';

// app/api/training/dataset/folder/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { path: parentPath, name } = await request.json();
    
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Nom de dossier requis' }, { status: 400 });
    }
    
    // Sécurité: empêcher les noms de chemin dangereux
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '');
    if (safeName !== name) {
      return NextResponse.json({ error: 'Nom invalide' }, { status: 400 });
    }
    
    const basePath = path.join(process.cwd(), parentPath || 'data');
    const newFolderPath = path.join(basePath, safeName);
    
    if (fs.existsSync(newFolderPath)) {
      return NextResponse.json({ error: 'Le dossier existe déjà' }, { status: 400 });
    }
    
    fs.mkdirSync(newFolderPath, { recursive: true });
    
    return NextResponse.json({ success: true, path: newFolderPath });
  } catch (error) {
    console.error('Error creating folder:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création du dossier' },
      { status: 500 }
    );
  }
}