// src/app/api/llm-router/status/route.ts
import { NextResponse } from 'next/server';
import { getLLMHealthStatus } from '@/ai/providers/llm-router';

// Cache simple en mémoire
let cachedHealth: any = null;
let lastFetch = 0;
const CACHE_TTL = 30000; // 30 secondes

export async function GET() {
  const now = Date.now();
  
  // Utiliser le cache si encore valide
  if (cachedHealth && (now - lastFetch) < CACHE_TTL) {
    return NextResponse.json(cachedHealth);
  }
  
  const health = await getLLMHealthStatus();
  const response = {
    providers: health,
    config: {
      groqConfigured: !!process.env.GROQ_API_KEY,
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      cerebrasConfigured: !!process.env.CEREBRAS_API_KEY,
      openrouterConfigured: !!process.env.OPENROUTER_API_KEY,
    },
    timestamp: now
  };
  
  // Mettre en cache
  cachedHealth = response;
  lastFetch = now;
  
  return NextResponse.json(response);
}