// app/api/voice/voices/route.ts
import { NextResponse } from 'next/server';
import ttsService from '@/lib/services/ttsService';

export async function GET() {
  try {
    const voices = await ttsService.listVoices();
    const health = await ttsService.checkHealth();
    
    return NextResponse.json({
      voices,
      health,
      defaultProvider: process.env.TTS_DEFAULT_PROVIDER || 'piper',
      defaultVoice: process.env.TTS_DEFAULT_VOICE || 'female-1'
    });
    
  } catch (error) {
    console.error('Erreur liste voix:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des voix' },
      { status: 500 }
    );
  }
}