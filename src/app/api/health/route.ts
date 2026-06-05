// src/app/api/health/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const health = {
    chromaDB: false,
    ollama: false,
    embeddings: false,
    lastCheck: new Date().toISOString()
  };

  // Vérifier ChromaDB (v2 d'abord, puis fallback v1)
  try {
    const chromaV2Res = await fetch('http://127.0.0.1:8000/api/v2/heartbeat', {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    if (chromaV2Res.ok) {
      health.chromaDB = true;
    } else {
      // Fallback API v1
      const chromaV1Res = await fetch('http://127.0.0.1:8000/api/v1/heartbeat', {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      health.chromaDB = chromaV1Res.ok;
    }
  } catch {
    health.chromaDB = false;
  }

  // Vérifier Ollama
  try {
    const ollamaRes = await fetch('http://127.0.0.1:11434/api/tags', {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    health.ollama = ollamaRes.ok;
    
    // Note: Le check des embeddings a été supprimé du heartbeat périodique pour alléger la charge.
    health.embeddings = health.ollama; 
  } catch {
    health.ollama = false;
    health.embeddings = false;
  }

  return NextResponse.json(health);
}