export const runtime = 'edge';

// app/api/vision/fs-folder/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { path: targetPath, name } = await request.json();
    
    if (!name) {
      return NextResponse.json({ error: 'Nom du dossier requis' }, { status: 400 });
    }
    
    let fullPath: string;
    if (targetPath) {
      fullPath = path.join(process.cwd(), targetPath, name);
    } else {
      fullPath = path.join(process.cwd(), 'data/banque_images_ia', name);
    }
    
    await fs.mkdir(fullPath, { recursive: true });
    
    return NextResponse.json({ 
      success: true, 
      path: path.relative(process.cwd(), fullPath).replace(/\\/g, '/')
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { path: folderPath } = await request.json();
    
    if (!folderPath) {
      return NextResponse.json({ error: 'Chemin du dossier requis' }, { status: 400 });
    }
    
    const fullPath = path.join(process.cwd(), folderPath);
    await fs.rm(fullPath, { recursive: true, force: true });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}