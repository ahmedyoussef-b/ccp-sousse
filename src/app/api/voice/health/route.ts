// app/api/voice/health/route.ts
import { NextResponse } from 'next/server';
import sttService from '@/lib/services/sttService';
import ttsService from '@/lib/services/ttsService';

export async function GET() {
  try {
    const [sttHealth, ttsHealth] = await Promise.all([
      sttService.checkHealth(),
      ttsService.checkHealth()
    ]);

    return NextResponse.json({
      stt: sttHealth,
      tts: ttsHealth,
      timestamp: new Date().toISOString(),
      providers: {
        available: {
          stt: Object.entries(sttHealth)
            .filter(([_, available]) => available)
            .map(([name]) => name),
          tts: Object.entries(ttsHealth)
            .filter(([_, available]) => available)
            .map(([name]) => name)
        },
        default: {
          stt: 'vosk',
          tts: process.env.TTS_DEFAULT_PROVIDER || 'piper'
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur health check:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la vérification des services' },
      { status: 500 }
    );
  }
}