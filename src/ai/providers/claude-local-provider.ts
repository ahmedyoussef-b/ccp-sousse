/**
 * @fileOverview Claude Local Provider — Wrapper TypeScript pour l'API Claude-Compatible locale
 * @description Permet d'utiliser le format API Anthropic Claude avec Ollama en local.
 *              Intégration dans l'écosystème AGENTIC existant.
 * @version 1.0.0
 * @lastUpdated 2026-04-07
 */

// ============================================================================
// INTERFACES ANTHROPIC (subset compatible)
// ============================================================================

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

export interface ClaudeContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface ClaudeRequestOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
  stream?: boolean;
  topP?: number;
  stopSequences?: string[];
}

export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  _local_info?: {
    provider: string;
    ollama_url: string;
    cost: number;
    offline: boolean;
    agentic_system: boolean;
  };
}

export interface ClaudeProviderConfig {
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[CLAUDE-LOCAL]';

const DEFAULT_CONFIG: Required<ClaudeProviderConfig> = {
  baseUrl: '/api/chat/claude-compatible',   // Notre route locale Next.js
  defaultModel: 'claude-3-sonnet',          // Mappé vers gemma2:2b dans notre route
  timeout: 120000
};

// Modèles Claude disponibles (alias) → décrit en termes de performance locale
export const CLAUDE_LOCAL_MODELS = {
  'claude-haiku':  { description: 'Rapide (~tinyllama)', speed: 'fast',   quality: 'basic'  },
  'claude-sonnet': { description: 'Équilibré (~gemma2:2b)', speed: 'medium', quality: 'good' },
  'claude-opus':   { description: 'Puissant (~gemma2:2b)', speed: 'slow',  quality: 'good'  },
} as const;

export type ClaudeModelAlias = keyof typeof CLAUDE_LOCAL_MODELS;

// ============================================================================
// PROVIDER PRINCIPAL
// ============================================================================

export class ClaudeLocalProvider {
  private config: Required<ClaudeProviderConfig>;

  constructor(config: ClaudeProviderConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log(`${LOG_PREFIX} ✅ Provider initialisé (local, 0€, hors-ligne)`);
    console.log(`${LOG_PREFIX} 📍 Base URL: ${this.config.baseUrl}`);
    console.log(`${LOG_PREFIX} 🤖 Modèle par défaut: ${this.config.defaultModel}`);
  }

  // --------------------------------------------------------------------------
  // APPEL SIMPLE (non-streaming)
  // --------------------------------------------------------------------------

  /**
   * Envoie des messages et reçoit une réponse complète (format Anthropic).
   */
  async messages(
    messages: ClaudeMessage[],
    options: ClaudeRequestOptions = {}
  ): Promise<ClaudeResponse> {
    const startTime = Date.now();

    const {
      model = this.config.defaultModel,
      maxTokens = 1024,
      temperature = 0.7,
      system,
      topP,
      stopSequences
    } = options;

    console.log(`${LOG_PREFIX} 📤 Envoi requête Claude-local`);
    console.log(`${LOG_PREFIX} 🤖 Modèle: ${model} | MaxTokens: ${maxTokens}`);
    console.log(`${LOG_PREFIX} 💬 Messages: ${messages.length}`);

    const body = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      system,
      top_p: topP,
      stop_sequences: stopSequences,
      stream: false
    };

    try {
      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Pas besoin de vraie clé API — on est local !
          'x-api-key': 'local-ollama-no-key-needed',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`Claude-local API error ${response.status}: ${errorData.error?.message || 'Erreur inconnue'}`);
      }

      const data: ClaudeResponse = await response.json();
      const duration = Date.now() - startTime;

      console.log(`${LOG_PREFIX} ✅ Réponse reçue en ${duration}ms`);
      console.log(`${LOG_PREFIX} 📊 Tokens: ${data.usage.input_tokens} in, ${data.usage.output_tokens} out`);

      return data;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`${LOG_PREFIX} ❌ Erreur après ${duration}ms: ${error.message}`);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // MÉTHODE SIMPLIFIÉE — Texte vers texte
  // --------------------------------------------------------------------------

  /**
   * Interface simplifiée : envoie un texte et reçoit un texte.
   * Pratique pour remplacer callOllama() dans le code existant.
   */
  async complete(
    userMessage: string,
    options: ClaudeRequestOptions & { system?: string } = {}
  ): Promise<string> {
    const response = await this.messages(
      [{ role: 'user', content: userMessage }],
      options
    );

    return response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');
  }

  // --------------------------------------------------------------------------
  // STREAMING — Retourne un AsyncGenerator de tokens
  // --------------------------------------------------------------------------

  /**
   * Streaming en mode Server-Sent Events (format Anthropic).
   * Compatible avec l'interface de callOllamaStream() du système existant.
   */
  async *stream(
    messages: ClaudeMessage[],
    options: ClaudeRequestOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    const {
      model = this.config.defaultModel,
      maxTokens = 1024,
      temperature = 0.7,
      system,
      topP,
      stopSequences
    } = options;

    console.log(`${LOG_PREFIX} 🌊 Démarrage streaming Claude-local`);

    const body = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      system,
      top_p: topP,
      stop_sequences: stopSequences,
      stream: true
    };

    const response = await fetch(this.config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'local-ollama-no-key-needed',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      throw new Error(`Streaming error: HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body for streaming');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;

            try {
              const event = JSON.parse(jsonStr);

              // Extraire le texte du delta (format Anthropic)
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                yield event.delta.text;
              }
            } catch (_) { /* ligne mal formée */ }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    console.log(`${LOG_PREFIX} ✅ Streaming terminé`);
  }

  // --------------------------------------------------------------------------
  // MÉTHODE CHAT COMPATIBLE — Format historique de messages
  // --------------------------------------------------------------------------

  /**
   * Interface chat complète avec historique.
   * Remplaçable directement dans les routes existantes.
   */
  async chat(
    userMessage: string,
    history: ClaudeMessage[] = [],
    options: ClaudeRequestOptions = {}
  ): Promise<{
    text: string;
    usage: { input_tokens: number; output_tokens: number };
    model: string;
    duration: number;
  }> {
    const startTime = Date.now();

    const messages: ClaudeMessage[] = [
      ...history,
      { role: 'user', content: userMessage }
    ];

    const response = await this.messages(messages, options);
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');

    return {
      text,
      usage: response.usage,
      model: response.model,
      duration: Date.now() - startTime
    };
  }

  // --------------------------------------------------------------------------
  // SANTÉ & DIAGNOSTIC
  // --------------------------------------------------------------------------

  /**
   * Vérifie la disponibilité de l'API locale
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    ollama_connected: boolean;
    available_models: string[];
    default_model: string;
    latency: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      const response = await fetch(this.config.baseUrl, {
        signal: AbortSignal.timeout(5000)
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          healthy: false,
          ollama_connected: false,
          available_models: [],
          default_model: this.config.defaultModel,
          latency,
          error: `HTTP ${response.status}`
        };
      }

      const data = await response.json();

      return {
        healthy: data.status === 'healthy',
        ollama_connected: data.ollama?.connected || false,
        available_models: data.ollama?.available_models || [],
        default_model: data.default_model || this.config.defaultModel,
        latency
      };
    } catch (error: any) {
      return {
        healthy: false,
        ollama_connected: false,
        available_models: [],
        default_model: this.config.defaultModel,
        latency: Date.now() - startTime,
        error: error.message
      };
    }
  }
}

// ============================================================================
// SINGLETON EXPORTÉ — Prêt à l'emploi
// ============================================================================

export const claudeLocal = new ClaudeLocalProvider();

/**
 * Fonction utilitaire directe — remplace callOllama() dans le code existant
 * Usage: const reponse = await callClaudeLocal("Votre question");
 */
export async function callClaudeLocal(
  prompt: string,
  options: ClaudeRequestOptions = {}
): Promise<string> {
  return claudeLocal.complete(prompt, options);
}

/**
 * Générateur streaming — remplace callOllamaStream() dans le code existant
 */
export async function* callClaudeLocalStream(
  prompt: string,
  options: ClaudeRequestOptions = {}
): AsyncGenerator<string, void, unknown> {
  yield* claudeLocal.stream(
    [{ role: 'user', content: prompt }],
    options
  );
}

export default claudeLocal;
