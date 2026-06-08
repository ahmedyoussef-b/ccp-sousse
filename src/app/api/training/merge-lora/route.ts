export const runtime = 'edge';

// app/api/training/merge-lora/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { modelName } = await request.json();
    
    console.log('[merge-lora] Début fusion pour:', modelName);
    
    // Dossiers
    const uploadsDir = path.join(process.cwd(), 'data', 'models', 'uploads');
    const extractedDir = path.join(process.cwd(), 'data', 'models', 'extracted');
    const mergedDir = path.join(process.cwd(), 'data', 'models', 'merged', modelName);
    
    // Trouver le dernier ZIP uploadé
    if (!fs.existsSync(uploadsDir)) {
      return NextResponse.json({ error: 'Aucun fichier uploadé' }, { status: 404 });
    }
    
    const zipFiles = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.zip') && f !== 'test.zip');
    if (zipFiles.length === 0) {
      return NextResponse.json({ error: 'Aucun fichier ZIP trouvé' }, { status: 404 });
    }
    
    // Prendre le plus récent (exclure test.zip)
    const latestZip = zipFiles.sort().reverse()[0];
    const zipPath = path.join(uploadsDir, latestZip);
    
    console.log(`[merge-lora] ZIP source: ${latestZip}`);
    
    // Nettoyer et recréer le dossier extracted
    if (fs.existsSync(extractedDir)) {
      fs.rmSync(extractedDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractedDir, { recursive: true });
    
    // Extraire le ZIP
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractedDir, true);
    
    console.log(`[merge-lora] Fichiers extraits:`, fs.readdirSync(extractedDir));
    
    // Créer le dossier merged
    if (!fs.existsSync(mergedDir)) {
      fs.mkdirSync(mergedDir, { recursive: true });
    }
    
    // Chercher le dossier du modèle (peut être dans un sous-dossier)
    let modelSourceDir = extractedDir;
    const subDirs = fs.readdirSync(extractedDir).filter(f => {
      const fullPath = path.join(extractedDir, f);
      return fs.statSync(fullPath).isDirectory();
    });
    
    // Si le ZIP contient un seul dossier, c'est probablement le modèle
    if (subDirs.length === 1 && !fs.existsSync(path.join(extractedDir, 'model.safetensors'))) {
      modelSourceDir = path.join(extractedDir, subDirs[0]);
      console.log(`[merge-lora] Dossier modèle trouvé: ${subDirs[0]}`);
    }
    
    // Copier les fichiers du modèle
    const copyRecursive = (src: string, dest: string) => {
      if (!fs.existsSync(src)) return;
      
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
          copyRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };
    
    copyRecursive(modelSourceDir, mergedDir);
    
    // Vérifier les fichiers copiés
    const copiedFiles = fs.readdirSync(mergedDir);
    console.log(`[merge-lora] Fichiers copiés:`, copiedFiles);
    
    // Créer un Modelfile pour Ollama
    const modelfileContent = `FROM ${mergedDir}
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER stop "</s>"

TEMPLATE """{{ .Prompt }}"""

SYSTEM """Tu es un expert en centrales à cycle combiné (CCP).
Tu connais les procédures, les spécifications techniques et les bonnes pratiques 
pour l'exploitation des turbines à gaz (TG1, TG2) et des turbines à vapeur (TV).

Réponds de manière précise et concise en te basant sur les connaissances techniques.
Si tu n'es pas sûr, indique-le clairement et propose de consulter la documentation."""
`;
    
    fs.writeFileSync(path.join(mergedDir, 'Modelfile'), modelfileContent);
    
    console.log('[merge-lora] Fusion terminée avec succès');
    
    return NextResponse.json({
      success: true,
      message: 'Modèle fusionné avec succès',
      outputPath: mergedDir,
      files: copiedFiles
    });
    
  } catch (error) {
    console.error('[merge-lora] Erreur:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de la fusion' },
      { status: 500 }
    );
  }
}