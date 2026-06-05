// app/api/ollama/models/route.ts
// API pour lister les modèles Ollama

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const { stdout } = await execAsync('ollama list');
    
    const models = [];
    const lines = stdout.split('\n').slice(1); // Skip header
    
    for (const line of lines) {
      if (line.trim()) {
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          models.push({
            name: parts[0],
            size: parts[2] || '?',
            modifiedAt: parts[1] || '?',
            location: getModelLocation(parts[0]),
            isActive: false
          });
        }
      }
    }
    
    return NextResponse.json({ models });
  } catch (error) {
    console.error('Error listing models:', error);
    return NextResponse.json({ models: [], error: 'Ollama not available' }, { status: 503 });
  }
}

function getModelLocation(modelName: string): string {
  const platform = process.platform;
  
  if (platform === 'win32') {
    return `C:\\Users\\${process.env.USERNAME || 'user'}\\.ollama\\models\\${modelName}`;
  } else {
    return `${process.env.HOME || '~'}/.ollama/models/${modelName}`;
  }
}