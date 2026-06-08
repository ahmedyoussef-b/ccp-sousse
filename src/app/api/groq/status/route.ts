export const runtime = 'edge';

// src/app/api/groq/status/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const useGroq = process.env.USE_GROQ === 'true';
  const groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const hasApiKey = !!process.env.GROQ_API_KEY;
  
  // Vérifier la connexion à Groq (optionnel)
  let connected = false;
  if (useGroq && hasApiKey) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        signal: AbortSignal.timeout(5000)
      });
      connected = response.ok;
    } catch {
      connected = false;
    }
  }
  
  return NextResponse.json({
    enabled: useGroq,
    connected,
    model: groqModel,
    hasApiKey
  });
}