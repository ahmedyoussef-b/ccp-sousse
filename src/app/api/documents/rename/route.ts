// src/app/api/documents/rename/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fileService } from '@/lib/document-manager/file-service';

export async function POST(req: NextRequest) {
  try {
    const { path, newName } = await req.json();
    
    if (!path || !newName) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    const newPath = await fileService.renameItem(path, newName);
    
    return NextResponse.json({ 
      success: true, 
      newPath,
      message: 'Élément renommé avec succès.' 
    });
  } catch (error: any) {
    console.error('[API][RENAME] Erreur:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
