// app/api/voice/stt/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import sttService from '@/lib/services/sttService';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    
    // ✅ CORRECTION: Typer correctement le modèle
    const modelParam = formData.get('model') as string | null;
    const language = formData.get('language') as string || 'fr-FR';

    // ✅ Conversion sécurisée vers le type attendu
    let model: 'vosk' | 'webspeech' | 'whisper' | undefined = 'vosk';
    
    if (modelParam === 'vosk' || modelParam === 'webspeech' || modelParam === 'whisper') {
      model = modelParam;
    }

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Fichier audio requis' },
        { status: 400 }
      );
    }

    // Sauvegarder temporairement le fichier
    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const tempDir = path.join(process.cwd(), 'data/stt/temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const tempFile = path.join(tempDir, `${crypto.randomUUID()}.wav`);
    await fs.writeFile(tempFile, buffer);

    try {
      // Transcrire l'audio avec le modèle typé correctement
      const text = await sttService.transcribeFile(buffer, { 
        model, 
        language 
      });
      
      return NextResponse.json({ text });
      
    } finally {
      // Nettoyer
      await fs.unlink(tempFile).catch(() => {});
    }

  } catch (error) {
    console.error('❌ Erreur STT API:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la reconnaissance vocale' },
      { status: 500 }
    );
  }
}