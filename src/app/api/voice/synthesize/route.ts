import { NextRequest, NextResponse } from 'next/server';
import ttsService from '@/lib/services/ttsService';
import { cleanTextForTTS } from '@/lib/utils/textCleaner';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type doit être application/json' }, { status: 400 });
    }

    const bodyText = await request.text();
    if (!bodyText) {
      return NextResponse.json({ error: 'Corps de requête vide' }, { status: 400 });
    }

    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      return NextResponse.json({ error: 'JSON malformé' }, { status: 400 });
    }

    let { text, provider, voice, language, speed, cache } = body;
    
    if (!text) {
      return NextResponse.json(
        { error: 'Texte requis' },
        { status: 400 }
      );
    }

    // AHMED: On nettoie systématiquement le texte pour enlever le Markdown
    const cleanText = cleanTextForTTS(text);

    const result = await ttsService.synthesize({
      text: cleanText,
      provider,
      voice,
      language,
      speed,
      cache
    });

    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('Erreur synthèse API:', error);
    return NextResponse.json(
      { error: error.message || 'Erreur lors de la synthèse vocale' },
      { status: 500 }
    );
  }
}