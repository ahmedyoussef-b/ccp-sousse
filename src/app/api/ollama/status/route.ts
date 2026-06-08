export const runtime = 'edge';

// app/api/ollama/status/route.ts
// API pour vérifier le statut d'Ollama

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // Vérifier si Ollama est en cours d'exécution
    const { stdout: psStdout } = await execAsync('ollama list').catch(() => ({ stdout: '' }));
    
    const isRunning = psStdout.length > 0;
    
    // Obtenir la liste des modèles installés
    const models = [];
    if (isRunning) {
      const lines = psStdout.split('\n').slice(1);
      for (const line of lines) {
        if (line.trim()) {
          const parts = line.split(/\s+/);
          if (parts[0]) {
            models.push({ name: parts[0] });
          }
        }
      }
    }
    
    // Emplacement des modèles Ollama
    const ollamaPath = process.platform === 'win32'
      ? path.join(process.env.USERPROFILE || '', '.ollama', 'models')
      : path.join(process.env.HOME || '', '.ollama', 'models');
    
    return NextResponse.json({
      available: isRunning,
      models,
      modelsPath: ollamaPath,
      version: await getOllamaVersion()
    });
    
  } catch (error) {
    console.error('Ollama status error:', error);
    return NextResponse.json(
      { available: false, error: 'Ollama n\'est pas disponible' },
      { status: 503 }
    );
  }
}

async function getOllamaVersion(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('ollama --version');
    return stdout.trim();
  } catch {
    return null;
  }
}