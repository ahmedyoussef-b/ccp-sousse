/**
 * @fileOverview API Claude-Compatible — Pont local vers Ollama
 * @description Émule l'API Anthropic Messages (format Claude) en utilisant Ollama en arrière-plan.
 *              Compatible avec tout client SDK Anthropic ou interface Claude.
 * @version 1.0.0
 * @endpoint POST /api/chat/claude-compatible
 *
 * Format de requête (identique à l'API Anthropic) :
 * {
 *   model: "claude-3-haiku..." (ignoré, remplacé par votre modèle local)
 *   max_tokens: 1024,
 *   messages: [{ role: "user" | "assistant", content: "..." }]
 *   system?: "..."
 *   stream?: false
 * }
 */

import { NextResponse } from 'next/server';
import { getOptimalThreadCount, PowerProfile } from '@/lib/utils/performance-optimizer';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

/**
 * Modèle Ollama à utiliser par défaut.
 * Changez selon votre benchmark : 'phi:2.7b', 'tinyllama', 'gemma2:2b'
 */
const DEFAULT_LOCAL_MODEL = process.env.CLAUDE_LOCAL_MODEL || 'gemma2:2b';

/**
 * Map de correspondance Claude → Ollama
 * Permet aux clients de spécifier "claude-haiku" et d'obtenir le bon modèle local
 */
const CLAUDE_TO_OLLAMA_MAP = {
  'claude-3-haiku-20240307':    'Falcon3-7B-Instruct-1.58bit',
  'claude-3-haiku':              'Falcon3-7B-Instruct-1.58bit',
  'claude-haiku':                'Falcon3-7B-Instruct-1.58bit',
  'claude-3-sonnet-20240229':   'gemma2:2b',
  'claude-3-sonnet':             'gemma2:2b',
  'claude-sonnet':               'gemma2:2b',
  'claude-3-opus-20240229':     'gemma2:2b',
  'claude-3-opus':               'gemma2:2b',
  'claude-opus':                 'gemma2:2b',
  'claude-3-5-sonnet-20241022': 'gemma2:2b',
  'claude-3-5-haiku-20241022':  'Falcon3-7B-Instruct-1.58bit',
};

const BITNET_IDENTITY = `Tu es un assistant IA optimisé par BitNet (Microsoft), tournant 100% localement sur CPU.
Tu réponds aux questions techniques industrielles avec précision et rapidité.
## CAPACITÉS SPÉCIFIQUES
- Inférence ultra-rapide sur CPU x86
- Modèle BitNet-b1.58 (2B ou 7B paramètres)
- Mémoire optimisée : 10x moins que modèles traditionnels
- Énergie réduite de 82% par rapport aux modèles FP16`;

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Convertit le modèle Claude demandé en modèle Ollama disponible
 */
function resolveOllamaModel(claudeModel) {
  if (!claudeModel) return DEFAULT_LOCAL_MODEL;
  const mapped = CLAUDE_TO_OLLAMA_MAP[claudeModel];
  if (mapped) return mapped;
  // Si c'est déjà un nom de modèle Ollama direct (ex: "phi:2.7b"), on le garde
  if (claudeModel.includes(':') || !claudeModel.startsWith('claude')) {
    return claudeModel;
  }
  return DEFAULT_LOCAL_MODEL;
}

/**
 * Convertit le tableau de messages Claude en un seul prompt pour Ollama
 * Format Ollama/generate : un prompt texte unique
 */
function messagesToPrompt(messages, systemPrompt) {
  const parts = [];

  // Identité AGENTIC locale
  const isBitNet = systemPrompt?.includes('bitnet') || systemPrompt === undefined;
  
  const identity = systemPrompt || (isBitNet ? BITNET_IDENTITY : 
    "Tu es l'assistant IA AGENTIC, un système industriel local, hors ligne et gratuit. " +
    "Tu es expert en diagnostics industriels, procédures techniques et maintenance. " +
    "Réponds de manière précise, utile et professionnelle en français.");

  parts.push(`SYSTÈME: ${identity}`);
  parts.push('');

  for (const msg of messages) {
    if (msg.role === 'user') {
      const content = typeof msg.content === 'string'
        ? msg.content
        : msg.content.map(c => c.type === 'text' ? c.text : '[Image]').join(' ');
      parts.push(`UTILISATEUR: ${content}`);
    } else if (msg.role === 'assistant') {
      const content = typeof msg.content === 'string'
        ? msg.content
        : msg.content.map(c => c.type === 'text' ? c.text : '').join('');
      parts.push(`ASSISTANT: ${content}`);
    }
  }

  parts.push('ASSISTANT:');
  return parts.join('\n');
}

/**
 * Génère un ID unique au format Anthropic
 */
function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Construit une réponse au format Anthropic Messages API
 */
function buildAnthropicResponse(text, model, inputTokens = 0, outputTokens = 0, stopReason = 'end_turn') {
  return {
    id: generateMessageId(),
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: text
      }
    ],
    model: model,  // On renvoie le "vrai" modèle Ollama utilisé
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens
    },
    // Métadonnées supplémentaires (non-standard Anthropic, mais utiles)
    _local_info: {
      provider: 'ollama',
      ollama_url: OLLAMA_URL,
      cost: 0,
      offline: true,
      agentic_system: true
    }
  };
}

// ============================================================================
// HANDLER PRINCIPAL — POST
// ============================================================================

export async function POST(request) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    // --- Extraction paramètres format Anthropic ---
    const {
      model: requestedModel,
      messages = [],
      system,
      max_tokens = 1024,
      temperature = 0.7,
      stream = false,
      top_p,
      top_k,
      stop_sequences,
      _power_profile = 'balanced' // Nouveau paramètre AGENTIC
    } = body;

    // Validation minimale
    if (!messages || messages.length === 0) {
      return NextResponse.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'messages array is required and cannot be empty'
        }
      }, { status: 400 });
    }

    // Résolution du modèle Ollama
    let ollamaModel = resolveOllamaModel(requestedModel);

    // Si on est en mode bitnet/turbo et que le modèle par défaut est utilisé, passer à Falcon3
    if (_power_profile === 'turbo' && ollamaModel === DEFAULT_LOCAL_MODEL) {
      ollamaModel = 'Falcon3-7B-Instruct-1.58bit';
    }

    // Calcul des threads dynamiques
    const num_thread = getOptimalThreadCount(_power_profile);

    // Construction du prompt unifié
    const isBitNetModel = ollamaModel.toLowerCase().includes('bitnet') || ollamaModel.toLowerCase().includes('1.58bit');
    const prompt = messagesToPrompt(messages, isBitNetModel ? BITNET_IDENTITY : system);

    console.log(`[CLAUDE-COMPAT] Requête reçue`);
    console.log(`[CLAUDE-COMPAT] Modèle demandé: ${requestedModel || 'non spécifié'} → Ollama: ${ollamaModel}`);
    console.log(`[CLAUDE-COMPAT] Messages: ${messages.length}, Max tokens: ${max_tokens}, Stream: ${stream}`);

    // ================================================================
    // MODE STREAMING
    // ================================================================
    if (stream) {
      const encoder = new TextEncoder();

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            // Envoyer l'événement de début de message (format SSE Anthropic)
            const messageStart = {
              type: 'message_start',
              message: {
                id: generateMessageId(),
                type: 'message',
                role: 'assistant',
                content: [],
                model: ollamaModel,
                stop_reason: null,
                usage: { input_tokens: 0, output_tokens: 0 }
              }
            };
            controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify(messageStart)}\n\n`));

            // Début du bloc de contenu
            const contentStart = { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
            controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(contentStart)}\n\n`));

            // Appel Ollama en streaming
            const ollamaResponse = await fetch(`${OLLAMA_URL}/api/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: ollamaModel,
                prompt,
                stream: true,
                options: {
                  temperature,
                  num_predict: max_tokens,
                  num_thread, // Injection du paramètre dynamique
                  top_p: top_p || 0.9,
                  stop: stop_sequences || ['\n\nUTILISATEUR:', '\n\nSYSTÈME:']
                }
              }),
              signal: AbortSignal.timeout(120000)
            });

            if (!ollamaResponse.ok) {
              throw new Error(`Ollama HTTP ${ollamaResponse.status}`);
            }

            const reader = ollamaResponse.body?.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let outputTokenCount = 0;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const data = JSON.parse(line);
                  if (data.response) {
                    outputTokenCount++;
                    // Envoyer le delta au format Anthropic
                    const delta = {
                      type: 'content_block_delta',
                      index: 0,
                      delta: { type: 'text_delta', text: data.response }
                    };
                    controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(delta)}\n\n`));
                  }
                } catch (_) { /* ligne mal formée, on ignore */ }
              }
            }

            // Fin du bloc de contenu
            const contentStop = { type: 'content_block_stop', index: 0 };
            controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(contentStop)}\n\n`));

            // Événement de fin de message
            const messageDelta = {
              type: 'message_delta',
              delta: { stop_reason: 'end_turn', stop_sequence: null },
              usage: { output_tokens: outputTokenCount }
            };
            controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify(messageDelta)}\n\n`));

            const messageStop = { type: 'message_stop' };
            controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify(messageStop)}\n\n`));

            controller.close();

          } catch (error) {
            const errEvent = {
              type: 'error',
              error: { type: 'api_error', message: error.message }
            };
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(errEvent)}\n\n`));
            controller.close();
          }
        }
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          // Headers de compatibilité Anthropic
          'anthropic-version': '2023-06-01',
          'X-Local-Provider': 'ollama',
          'X-Local-Model': ollamaModel,
          'X-Request-Id': generateMessageId()
        }
      });
    }

    // ================================================================
    // MODE NON-STREAMING (par défaut)
    // ================================================================
    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        prompt,
        stream: false,
        options: {
          temperature,
          num_predict: max_tokens,
          num_thread, // Injection du paramètre dynamique
          top_p: top_p || 0.9,
          stop: stop_sequences || ['\n\nUTILISATEUR:', '\n\nSYSTÈME:']
        }
      }),
      signal: AbortSignal.timeout(120000)
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      console.error(`[CLAUDE-COMPAT] Erreur Ollama: ${ollamaResponse.status} - ${errorText}`);

      return NextResponse.json({
        type: 'error',
        error: {
          type: 'api_error',
          message: `Le modèle local Ollama est indisponible. Vérifiez qu'Ollama tourne sur ${OLLAMA_URL}`,
          details: errorText.substring(0, 200)
        }
      }, { status: 503 });
    }

    const ollamaData = await ollamaResponse.json();
    const generatedText = ollamaData.response?.trim() || '';
    const duration = Date.now() - startTime;

    // Estimation tokens (approximative : 1 token ≈ 4 caractères)
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = ollamaData.eval_count || Math.ceil(generatedText.length / 4);

    console.log(`[CLAUDE-COMPAT] ✅ Réponse générée en ${duration}ms`);
    console.log(`[CLAUDE-COMPAT] Modèle: ${ollamaModel} | Tokens: ${inputTokens} in, ${outputTokens} out`);
    console.log(`[CLAUDE-COMPAT] Vitesse: ${ollamaData.eval_count && ollamaData.eval_duration
      ? ((ollamaData.eval_count / (ollamaData.eval_duration / 1e9)).toFixed(1)) + ' tok/s'
      : 'N/A'}`);

    // Construction de la réponse au format Anthropic
    const anthropicResponse = buildAnthropicResponse(
      generatedText,
      `${ollamaModel} (local)`,
      inputTokens,
      outputTokens
    );

    return NextResponse.json(anthropicResponse, {
      headers: {
        // Headers compatibles Anthropic
        'anthropic-version': '2023-06-01',
        'X-Local-Provider': 'ollama',
        'X-Local-Model': ollamaModel,
        'X-Processing-Time': `${duration}ms`,
        'X-Cost': '0',
        'X-Request-Id': anthropicResponse.id,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version'
      }
    });

  } catch (error) {
    console.error('[CLAUDE-COMPAT] Erreur globale:', error);

    return NextResponse.json({
      type: 'error',
      error: {
        type: 'api_error',
        message: error.message || 'Erreur interne du serveur local',
        details: 'Vérifiez qu\'Ollama est actif : ollama serve'
      }
    }, { status: 500 });
  }
}

// ============================================================================
// GET — Health check + infos modèles disponibles
// ============================================================================

export async function GET() {
  try {
    // Vérifier Ollama
    const ollamaCheck = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    });

    if (!ollamaCheck.ok) {
      return NextResponse.json({
        status: 'degraded',
        message: 'Ollama non disponible',
        ollama_url: OLLAMA_URL
      }, { status: 503 });
    }

    const ollamaData = await ollamaCheck.json();
    const availableModels = ollamaData.models?.map(m => m.name) || [];

    return NextResponse.json({
      status: 'healthy',
      service: 'claude-compatible-local',
      description: 'API Claude émulée localement via Ollama — 100% gratuit, hors-ligne',
      version: '1.0.0',
      ollama: {
        url: OLLAMA_URL,
        connected: true,
        available_models: availableModels
      },
      default_model: DEFAULT_LOCAL_MODEL,
      model_mapping: CLAUDE_TO_OLLAMA_MAP,
      compatibility: {
        anthropic_sdk: true,
        streaming: true,
        messages_format: true,
        system_prompts: true
      },
      cost: '0€',
      offline: true,
      endpoints: {
        POST: '/api/chat/claude-compatible — Envoyer un message (format Anthropic)',
        GET: '/api/chat/claude-compatible — Health check'
      },
      example: {
        url: '/api/chat/claude-compatible',
        method: 'POST',
        body: {
          model: 'claude-3-haiku-20240307',
          max_tokens: 512,
          messages: [{ role: 'user', content: 'Bonjour AGENTIC !' }]
        }
      }
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: error.message,
      fix: 'Lancez Ollama avec: ollama serve'
    }, { status: 503 });
  }
}

// ============================================================================
// OPTIONS — CORS pour les clients SDK Anthropic
// ============================================================================

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, anthropic-beta'
    }
  });
}
