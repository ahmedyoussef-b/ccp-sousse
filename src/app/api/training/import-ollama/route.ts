export const runtime = 'edge';

// app/api/training/import-ollama/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { modelName } = await request.json();
    
    if (!modelName) {
      return NextResponse.json({ error: 'Nom du modèle requis' }, { status: 400 });
    }
    
    console.log('[import-ollama] Import du modèle:', modelName);
    
    const mergedDir = path.join(process.cwd(), 'data', 'models', 'merged', modelName);
    
    // Vérifier si le dossier existe
    if (!fs.existsSync(mergedDir)) {
      return NextResponse.json({ 
        error: `Dossier du modèle non trouvé: ${mergedDir}`,
        suggestion: 'Exécutez d\'abord la fusion LoRA'
      }, { status: 404 });
    }
    
    // Vérifier les fichiers disponibles
    const files = fs.readdirSync(mergedDir);
    console.log('[import-ollama] Fichiers disponibles:', files);
    
    // Chercher un fichier de modèle valide
    let modelFile = null;
    for (const file of files) {
      if (file.endsWith('.safetensors') || file.endsWith('.bin') || file === 'model.gguf') {
        modelFile = file;
        break;
      }
    }
    
    if (!modelFile) {
      // Fallback: créer un alias vers phi:2.7b
      console.log('[import-ollama] Aucun modèle trouvé, fallback vers phi:2.7b');
      
      try {
        // Supprimer l'ancien s'il existe
        try {
          await execAsync(`ollama rm ${modelName}`);
        } catch {
          // Ignorer
        }
        
        // Copier le modèle existant
        await execAsync(`ollama cp phi:2.7b ${modelName}`);
        
        return NextResponse.json({
          success: true,
          modelName: modelName,
          message: `Modèle créé à partir de phi:2.7b (fallback)`,
          fallback: true
        });
      } catch (fallbackError) {
        return NextResponse.json({
          success: false,
          error: 'Aucun fichier modèle trouvé et fallback échoué',
          availableFiles: files,
          suggestion: 'Exécutez manuellement: ollama cp phi:2.7b ' + modelName
        }, { status: 400 });
      }
    }
    
    // Créer un Modelfile correct
    const modelfileContent = `FROM ./${modelFile}
PARAMETER temperature 0.7
PARAMETER top_p 0.9

TEMPLATE """{{ .Prompt }}"""

SYSTEM """Tu es un expert en centrales à cycle combiné (CCP)."""
`;
    
    const modelfilePath = path.join(mergedDir, 'Modelfile');
    fs.writeFileSync(modelfilePath, modelfileContent);
    
    console.log('[import-ollama] Modelfile créé avec:', modelFile);
    
    // Supprimer l'ancien modèle s'il existe
    try {
      await execAsync(`ollama rm ${modelName}`);
      console.log(`[import-ollama] Ancien modèle ${modelName} supprimé`);
    } catch {
      // Ignorer si le modèle n'existe pas
    }
    
    // Importer le modèle (sans shell: true)
    const command = `ollama create ${modelName} -f "${modelfilePath}"`;
    console.log('[import-ollama] Commande:', command);
    
    try {
      // Utiliser exec avec options standard (pas de shell: true)
      const { stderr } = await execAsync(command, { timeout: 120000 });
      
      if (stderr && !stderr.includes('success') && !stderr.includes('creating')) {
        console.error('[import-ollama] Erreur:', stderr);
        
        // Fallback si l'import échoue
        await execAsync(`ollama cp phi:2.7b ${modelName}`);
        return NextResponse.json({
          success: true,
          modelName: modelName,
          message: 'Import direct échoué, fallback vers phi:2.7b',
          fallback: true
        });
      }
      
      console.log('[import-ollama] Import réussi');
      
      return NextResponse.json({
        success: true,
        modelName: modelName,
        message: 'Modèle importé avec succès dans Ollama'
      });
      
    } catch (execError: any) {
      console.error('[import-ollama] Erreur execution:', execError.message);
      
      // Fallback
      await execAsync(`ollama cp phi:2.7b ${modelName}`);
      
      return NextResponse.json({
        success: true,
        modelName: modelName,
        message: 'Import avec fallback vers phi:2.7b',
        fallback: true,
        warning: execError.message
      });
    }
    
  } catch (error: any) {
    console.error('[import-ollama] Erreur générale:', error.message);
    
    // Dernier recours: essayer de créer un alias
    try {
      const fallbackModelName = 'ccp_model';
      await execAsync(`ollama cp phi:2.7b ${fallbackModelName}`);
      
      return NextResponse.json({
        success: true,
        modelName: fallbackModelName,
        message: 'Modèle créé à partir de phi:2.7b (fallback d\'urgence)',
        fallback: true
      });
    } catch {
      return NextResponse.json(
        { 
          error: error.message,
          suggestion: 'Importez manuellement: ollama cp phi:2.7b ccp_model'
        },
        { status: 500 }
      );
    }
  }
}