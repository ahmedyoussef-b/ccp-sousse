/**
 * @fileOverview API Route — Sélection et statut des modèles locaux
 * @description Status en temps réel de tous les modèles Ollama disponibles,
 *              mapping Claude, et recommendation du meilleur modèle.
 * @endpoint GET /api/chat/claude-compatible/models
 */

import { NextResponse } from 'next/server';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Correspondance modèles Ollama → méta-informations
const KNOWN_MODELS = {
  'gemma2:2b': {
    claude_alias: 'claude-sonnet',
    display_name: 'Gemma 2B',
    type: 'balanced',
    quality_score: 0.88,
    speed_score: 0.72,
    ram_mb: 3500,
    description: 'Meilleur équilibre qualité/vitesse — Recommandé',
    recommended: true
  },
  'tinyllama': {
    claude_alias: 'claude-haiku',
    display_name: 'TinyLlama',
    type: 'fast',
    quality_score: 0.70,
    speed_score: 0.95,
    ram_mb: 600,
    description: 'Ultra rapide, idéal pour requêtes simples',
    recommended: false
  },
  'tinyllama:latest': {
    claude_alias: 'claude-haiku',
    display_name: 'TinyLlama (latest)',
    type: 'fast',
    quality_score: 0.70,
    speed_score: 0.95,
    ram_mb: 600,
    description: 'Ultra rapide, idéal pour requêtes simples',
    recommended: false
  },
  'phi:2.7b': {
    claude_alias: 'claude-sonnet',
    display_name: 'Phi 2.7B',
    type: 'balanced',
    quality_score: 0.82,
    speed_score: 0.80,
    ram_mb: 2000,
    description: 'Modèle compact et efficace de Microsoft',
    recommended: false
  },
  'bitnet:1.58b': {
    claude_alias: 'claude-haiku',
    display_name: 'BitNet 1.58B',
    type: 'fast',
    quality_score: 0.75,
    speed_score: 0.92,
    ram_mb: 1000,
    description: 'Modèle 1-bit ultra économique',
    recommended: false
  },
  'BitNet-b1.58-2B': {
    claude_alias: 'claude-haiku',
    display_name: 'BitNet 2B (b1.58)',
    type: 'fast',
    quality_score: 0.84,
    speed_score: 0.96,
    ram_mb: 800,
    description: 'Modèle Microsoft 1.58-bit natif',
    recommended: false
  },
  'Falcon3-7B-Instruct-1.58bit': {
    claude_alias: 'claude-sonnet',
    display_name: 'Falcon 3 7B (BitNet)',
    type: 'fast',
    quality_score: 0.88,
    speed_score: 0.98,
    ram_mb: 1800,
    description: 'Le modèle BitNet le plus puissant (TII)',
    recommended: false
  },
  'llama3:8b': {
    claude_alias: 'claude-opus',
    display_name: 'Llama 3 8B',
    type: 'powerful',
    quality_score: 0.93,
    speed_score: 0.50,
    ram_mb: 4700,
    description: 'Puissant mais lent — Pour tâches complexes',
    recommended: false
  },
  'qwen3-vl:8b': {
    claude_alias: 'claude-opus',
    display_name: 'Qwen3-VL 8B',
    type: 'vision',
    quality_score: 0.92,
    speed_score: 0.55,
    ram_mb: 5500,
    description: 'Vision industrielle — Analyse d\'images',
    recommended: false
  }
};

export async function GET(request) {
  const startTime = Date.now();

  try {
    // 1. Récupérer les modèles installés sur Ollama
    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!ollamaResponse.ok) {
      return NextResponse.json({
        success: false,
        error: `Ollama indisponible (HTTP ${ollamaResponse.status})`,
        fix: 'Lancez Ollama : ollama serve',
        models: []
      }, { status: 503 });
    }

    const ollamaData = await ollamaResponse.json();
    const installedModels = ollamaData.models || [];
    const installedNames = installedModels.map(m => m.name);

    // 2. Enrichir avec les méta-informations
    const models = installedNames.map(name => {
      const known = KNOWN_MODELS[name];
      const ollamaModel = installedModels.find(m => m.name === name);

      return {
        id: name,
        name: name,
        display_name: known?.display_name || name,
        claude_alias: known?.claude_alias || 'claude-sonnet',
        type: known?.type || 'balanced',
        quality_score: known?.quality_score || 0.75,
        speed_score: known?.speed_score || 0.75,
        ram_mb: known?.ram_mb || Math.round((ollamaModel?.size || 0) / (1024 * 1024)),
        description: known?.description || 'Modèle Ollama local',
        recommended: known?.recommended || false,
        available: true,
        size_bytes: ollamaModel?.size || 0,
        modified_at: ollamaModel?.modified_at
      };
    });

    // 3. Trier : recommandés en premier, puis par score qualité
    models.sort((a, b) => {
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      return b.quality_score - a.quality_score;
    });

    // 4. Déterminer le meilleur modèle disponible
    const bestModel = models.find(m => m.recommended) || models[0];

    const latency = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      ollama_url: OLLAMA_URL,
      latency_ms: latency,
      models,
      best_model: bestModel?.id || null,
      total_installed: models.length,
      claude_mapping: installedNames.reduce((acc, name) => {
        const known = KNOWN_MODELS[name];
        if (known) acc[known.claude_alias] = name;
        return acc;
      }, {})
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      fix: 'Vérifiez qu\'Ollama est actif : ollama serve',
      models: []
    }, { status: 503 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
