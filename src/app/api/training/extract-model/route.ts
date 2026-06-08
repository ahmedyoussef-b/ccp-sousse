export const runtime = 'edge';

// app/api/training/extract-model/route.ts
// API pour extraire le fichier ZIP

import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

export async function POST() {
  try {
    const modelsDir = path.join(process.cwd(), 'data', 'models');
    const extractDir = path.join(modelsDir, 'extracted');
    
    // Trouver le dernier fichier ZIP
    const files = fs.readdirSync(modelsDir);
    const zipFiles = files.filter(f => f.endsWith('.zip') && f.startsWith('ccp_model'));
    
    if (zipFiles.length === 0) {
      return NextResponse.json({ error: 'Aucun fichier ZIP trouvé' }, { status: 404 });
    }
    
    // Prendre le plus récent
    const latestZip = zipFiles.sort().reverse()[0];
    const zipPath = path.join(modelsDir, latestZip);
    
    // Nettoyer le dossier d'extraction
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });
    
    // Extraire
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);
    
    // Lister les fichiers extraits
    const extractedFiles = fs.readdirSync(extractDir, { recursive: true }) as string[];
    
    return NextResponse.json({
      success: true,
      files: extractedFiles,
      extractPath: extractDir
    });
    
  } catch (error) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'extraction' },
      { status: 500 }
    );
  }
}