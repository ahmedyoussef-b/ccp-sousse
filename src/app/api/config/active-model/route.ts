// app/api/config/active-model/route.ts
// API pour gérer le modèle actif dans l'application

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET() {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    let activeModel = 'phi:2.7b'; // Valeur par défaut
    
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const match = envContent.match(/OLLAMA_MODEL=(.+)/);
      if (match) {
        activeModel = match[1].trim();
      }
    }
    
    return NextResponse.json({ model: activeModel });
  } catch (error) {
    return NextResponse.json({ model: 'phi:2.7b' });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { model } = await request.json();
    
    if (!model) {
      return NextResponse.json({ error: 'Nom de modèle requis' }, { status: 400 });
    }
    
    const envPath = path.join(process.cwd(), '.env.local');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }
    
    // Mettre à jour OLLAMA_MODEL
    if (envContent.includes('OLLAMA_MODEL=')) {
      envContent = envContent.replace(/OLLAMA_MODEL=.*/, `OLLAMA_MODEL=${model}`);
    } else {
      envContent += `\nOLLAMA_MODEL=${model}\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    
    return NextResponse.json({ success: true, model });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
  }
}