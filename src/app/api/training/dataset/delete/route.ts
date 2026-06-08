export const runtime = 'edge';

// app/api/training/dataset/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function DELETE(request: NextRequest) {
  try {
    const { path: itemPath } = await request.json();
    
    if (!itemPath) {
      return NextResponse.json({ error: 'Chemin requis' }, { status: 400 });
    }
    
    // Sécurité: ne pas permettre la suppression des dossiers critiques
    const forbiddenPaths = ['data/training/examples.json', 'data/models/registry.json'];
    if (forbiddenPaths.includes(itemPath)) {
      return NextResponse.json({ error: 'Ce fichier est protégé' }, { status: 403 });
    }
    
    const fullPath = path.join(process.cwd(), itemPath);
    
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: 'Élément non trouvé' }, { status: 404 });
    }
    
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting item:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la suppression' },
      { status: 500 }
    );
  }
}