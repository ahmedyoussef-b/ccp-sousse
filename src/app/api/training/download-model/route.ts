// app/api/training/download-model/route.ts
import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Route réelle pour le téléchargement des modèles fine-tunés.
 * Sert le dernier modèle disponible dans le répertoire des exports.
 */
export async function POST() {
  try {
    const exportDir = path.join(process.cwd(), 'data', 'models', 'exports');
    
    // S'assurer que le dossier existe
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const files = fs.readdirSync(exportDir)
      .filter(f => f.endsWith('.zip'))
      .map(f => ({
        name: f,
        path: path.join(exportDir, f),
        mtime: fs.statSync(path.join(exportDir, f)).mtime
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    if (files.length === 0) {
      // Fallback sur le dossier uploads si rien dans exports
      const uploadDir = path.join(process.cwd(), 'data', 'models', 'uploads');
      if (fs.existsSync(uploadDir)) {
        const uploadFiles = fs.readdirSync(uploadDir)
          .filter(f => f.endsWith('.zip'))
          .map(f => ({
            name: f,
            path: path.join(uploadDir, f),
            mtime: fs.statSync(path.join(uploadDir, f)).mtime
          }))
          .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
        
        if (uploadFiles.length > 0) {
          files.push(...uploadFiles);
        }
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'Aucun modèle prêt pour le téléchargement. Veuillez d\'abord terminer l\'entraînement sur Colab.' },
        { status: 404 }
      );
    }

    const targetFile = files[0];
    const fileBuffer = fs.readFileSync(targetFile.path);
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${targetFile.name}"`,
      },
    });
    
  } catch (error) {
    console.error('❌ Erreur téléchargement modèle:', error);
    return NextResponse.json(
      { error: 'Erreur lors du téléchargement du modèle' },
      { status: 500 }
    );
  }
}