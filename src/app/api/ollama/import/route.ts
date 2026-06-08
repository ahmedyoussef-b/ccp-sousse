export const runtime = 'edge';

// app/api/ollama/import/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  const logs: string[] = [];
  
  try {
    const { zipPath, modelName } = await request.json();
    
    // Trouver le ZIP si non spécifié
    let finalZipPath = zipPath;
    if (!finalZipPath) {
      const uploadsDir = path.join(process.cwd(), 'data', 'models', 'uploads');
      if (fs.existsSync(uploadsDir)) {
        const zips = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.zip'));
        if (zips.length > 0) {
          finalZipPath = path.join(uploadsDir, zips[0]);
          logs.push(`📁 ZIP trouvé: ${zips[0]}`);
        }
      }
    }
    
    if (!finalZipPath || !fs.existsSync(finalZipPath)) {
      return NextResponse.json({ error: 'Aucun fichier ZIP trouvé' }, { status: 404 });
    }
    
    // Exécuter le script d'import
    const scriptPath = path.join(process.cwd(), 'scripts', 'run-ollama-integration.ts');
    const finalModelName = modelName || `ccp_model_${Date.now()}`;
    
    logs.push(`🚀 Import du modèle: ${finalModelName}`);
    logs.push(`📦 Fichier source: ${finalZipPath}`);
    
    const { stdout, stderr } = await execAsync(
      `npx ts-node "${scriptPath}" --zip "${finalZipPath}" --name "${finalModelName}"`
    );
    
    if (stdout) logs.push(...stdout.split('\n').filter(l => l.trim()));
    if (stderr) logs.push(`⚠️ ${stderr}`);
    
    return NextResponse.json({ 
      success: true, 
      modelName: finalModelName,
      logs 
    });
    
  } catch (error) {
    logs.push(`❌ Erreur: ${error}`);
    return NextResponse.json({ error: String(error), logs }, { status: 500 });
  }
}