// app/api/training/versions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const VERSIONS_DIR = path.join(process.cwd(), 'data', 'training', 'versions');
const EXAMPLES_PATH = path.join(process.cwd(), 'data', 'training', 'examples.json');

interface VersionInfo {
  id: string;
  filename: string;
  date: string;
  examplesCount: number;
  size: string;
  comment?: string;
}

export async function GET() {
  try {
    if (!fs.existsSync(VERSIONS_DIR)) {
      return NextResponse.json({ versions: [] });
    }
    
    const files = fs.readdirSync(VERSIONS_DIR);
    const versions: VersionInfo[] = [];
    
    for (const file of files) {
      if (file.startsWith('examples_v') && file.endsWith('.json')) {
        const filePath = path.join(VERSIONS_DIR, file);
        const stats = fs.statSync(filePath);
        
        // Lire le contenu pour compter les exemples
        const content = fs.readFileSync(filePath, 'utf-8');
        const examples = JSON.parse(content);
        
        // Extraire la date du nom de fichier
        const dateMatch = file.match(/_(\d{4}-\d{2}-\d{2})_/);
        
        versions.push({
          id: file.replace('.json', ''),
          filename: file,
          date: dateMatch ? dateMatch[1] : stats.mtime.toISOString().split('T')[0],
          examplesCount: examples.length,
          size: `${(stats.size / 1024).toFixed(1)} KB`,
          comment: await getCommentForVersion(file)
        });
      }
    }
    
    // Trier par numéro de version décroissant (le plus récent d'abord)
    versions.sort((a, b) => {
      const matchA = a.filename.match(/^examples_v(\d+)_/);
      const matchB = b.filename.match(/^examples_v(\d+)_/);
      const numA = matchA ? parseInt(matchA[1], 10) : 0;
      const numB = matchB ? parseInt(matchB[1], 10) : 0;
      return numB - numA;
    });
    
    // On ne veut afficher que la dernière version
    const latestVersions = versions.length > 0 ? [versions[0]] : [];
    
    return NextResponse.json({ versions: latestVersions });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la lecture des versions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, versionId, comment } = await request.json();
    
    if (action === 'restore') {
      // Restaurer une version
      const versionPath = path.join(VERSIONS_DIR, `${versionId}.json`);
      if (!fs.existsSync(versionPath)) {
        return NextResponse.json({ error: 'Version non trouvée' }, { status: 404 });
      }
      
      // Sauvegarder la version actuelle avant restauration dans archive/
      if (fs.existsSync(EXAMPLES_PATH)) {
        const currentContent = fs.readFileSync(EXAMPLES_PATH, 'utf-8');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archiveDir = path.join(process.cwd(), 'data', 'training', 'archive');
        if (!fs.existsSync(archiveDir)) {
          fs.mkdirSync(archiveDir, { recursive: true });
        }
        const backupPath = path.join(archiveDir, `examples_before_restore_${timestamp}.json`);
        fs.writeFileSync(backupPath, currentContent);
      }
      
      // Restaurer
      fs.copyFileSync(versionPath, EXAMPLES_PATH);
      
      return NextResponse.json({ success: true, message: 'Version restaurée avec succès' });
    }
    
    if (action === 'create') {
      // Trouver la version maximale actuelle
      let maxVersion = 0;
      if (fs.existsSync(VERSIONS_DIR)) {
        const files = fs.readdirSync(VERSIONS_DIR);
        for (const file of files) {
          const match = file.match(/^examples_v(\d+)_/);
          if (match) {
            const val = parseInt(match[1], 10);
            if (val > maxVersion) {
              maxVersion = val;
            }
          }
        }
      }
      const nextVersionNum = maxVersion + 1;

      // Créer une nouvelle version manuellement
      const content = fs.readFileSync(EXAMPLES_PATH, 'utf-8');
      const examples = JSON.parse(content);
      
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timestampStr = now.getFullYear().toString() +
                           (now.getMonth() + 1).toString().padStart(2, '0') +
                           now.getDate().toString().padStart(2, '0') + '_' +
                           now.getHours().toString().padStart(2, '0') +
                           now.getMinutes().toString().padStart(2, '0') +
                           now.getSeconds().toString().padStart(2, '0'); // YYYYMMDD_HHMMSS
      const versionFile = `examples_v${nextVersionNum}_${dateStr}_${timestampStr}.json`;
      const versionPath = path.join(VERSIONS_DIR, versionFile);
      
      fs.writeFileSync(versionPath, content);
      
      // Sauvegarder le commentaire
      if (comment) {
        const commentPath = path.join(VERSIONS_DIR, `${versionFile}.comment`);
        fs.writeFileSync(commentPath, comment);
      }
      
      // Nettoyer toutes les anciennes versions pour ne garder que la nouvelle
      if (fs.existsSync(VERSIONS_DIR)) {
        const files = fs.readdirSync(VERSIONS_DIR);
        for (const file of files) {
          // Ne pas supprimer le fichier que l'on vient de créer ni son commentaire
          if (file !== versionFile && file !== `${versionFile}.comment`) {
            if (file.startsWith('examples_v') || file.endsWith('.comment') || file.endsWith('.metadata.json')) {
              try {
                fs.unlinkSync(path.join(VERSIONS_DIR, file));
              } catch (err) {
                console.error(`Erreur suppression ancien fichier ${file}:`, err);
              }
            }
          }
        }
      }
      
      return NextResponse.json({ 
        success: true, 
        version: versionFile,
        examplesCount: examples.length 
      });
    }
    
    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de l\'opération' }, { status: 500 });
  }
}

async function getCommentForVersion(filename: string): Promise<string | undefined> {
  const commentPath = path.join(VERSIONS_DIR, `${filename}.comment`);
  if (fs.existsSync(commentPath)) {
    return fs.readFileSync(commentPath, 'utf-8');
  }
  return undefined;
}