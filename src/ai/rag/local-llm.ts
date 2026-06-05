// src/ai/rag/local-llm.ts
/**
 * @fileOverview Service de génération LLM local via Ollama
 * @version 3.1.0
 * @lastUpdated 2026-04-01
 * @description Version corrigée avec token counting réel, retry exponentiel
 */

import { createRAGLogger } from './utils/logger';
import { StatsManager } from './utils/stats-manager';
import { getRAGConfig } from './config/rag.config';
import { z } from 'zod';

// ============================================================================
// TOKEN COUNTING AVEC TIKTOKEN (RÉEL)
// ============================================================================

let tiktoken: any = null;
let tokenizerInitialized = false;

async function initTokenizer(): Promise<void> {
  if (tokenizerInitialized) return;
  
  try {
    const { encoding_for_model } = await import('tiktoken');
    tiktoken = encoding_for_model('gpt-3.5-turbo');
    tokenizerInitialized = true;
    logger.info('TOKENIZER', '✅ Tokenizer tiktoken initialisé');
  } catch (error: any) {
    logger.warning('TOKENIZER', `⚠️ tiktoken non disponible: ${error.message}`);
    tokenizerInitialized = true;
  }
}

function estimateTokens(text: string): number {
  if (tiktoken) {
    try {
      return tiktoken.encode(text).length;
    } catch {
      return Math.ceil(text.length / 4);
    }
  }
  return Math.ceil(text.length / 4);
}

// Initialisation asynchrone
initTokenizer().catch(console.error);

// ============================================================================
// INITIALISATION DES UTILITAIRES
// ============================================================================

const logger = createRAGLogger('[LOCAL-LLM]', {
  maxDataLength: 200,
  enableStructured: process.env.NODE_ENV === 'production'
});

interface LLMStats {
  totalRequests: number;
  totalTokens: number;
  avgResponseTime: number;
  successfulRequests: number;
  failedRequests: number;
  lastRequestTime: number | null;
  lastRequestDuration: number | null;
  streamRequests: number;
  nonStreamRequests: number;
  timeoutCount: number;
  retryCount: number; // Ajouté pour suivi des retries
}

const statsManager = new StatsManager<LLMStats>({
  initial: {
    totalRequests: 0,
    totalTokens: 0,
    avgResponseTime: 0,
    successfulRequests: 0,
    failedRequests: 0,
    lastRequestTime: null,
    lastRequestDuration: null,
    streamRequests: 0,
    nonStreamRequests: 0,
    timeoutCount: 0,
    retryCount: 0
  },
  persistIntervalMs: 60000,
  onPersist: async (stats, timestamp) => {
    logger.structured('STATS_PERSIST', { 
      module: 'local-llm', 
      stats, 
      timestamp: timestamp.toISOString() 
    });
  }
});

// ============================================================================
// SCHÉMAS DE VALIDATION ZOD
// ============================================================================

const LLMRequestSchema = z.object({
  prompt: z.string().min(1).max(50000),
  context: z.string().max(100000).optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(8000).optional(),
  stream: z.boolean().optional()
});

const LLMResponseSchema = z.object({
  content: z.string(),
  model: z.string(),
  tokensUsed: z.number().optional(),
  processingTime: z.number(),
  stream: z.boolean()
});

export type LLMRequest = z.infer<typeof LLMRequestSchema>;
export type LLMResponse = z.infer<typeof LLMResponseSchema>;

// ============================================================================
// INTERFACES
// ============================================================================

export interface GenerationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  stream?: boolean;
  systemPrompt?: string;
  retries?: number; // Ajouté pour configurer les retries
}

export interface GenerationResult {
  success: boolean;
  content: string;
  model: string;
  tokensUsed?: number;
  processingTime: number;
  error?: string;
  retries?: number;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  model?: string;
  tokensUsed?: number;
}

export interface HealthStatus {
  available: boolean;
  models: string[];
  defaultModelAvailable: boolean;
  streamModelAvailable: boolean;
  latency?: number;
  error?: string;
}

// ============================================================================
// CONFIGURATION PAR DÉFAUT
// ============================================================================

const DEFAULT_SYSTEM_PROMPT = 'Tu es un assistant expert en maintenance de centrale thermique. Tu réponds TOUJOURS et EXCLUSIVEMENT en FRANÇAIS. Ne mélange JAMAIS les langues.';
const DEFAULT_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function sanitizePrompt(prompt: string): string {
  return prompt.replace(/^["']|["']$/g, '').trim();
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// VALIDATION DES ENTRÉES
// ============================================================================

function validateGenerationRequest(
  _prompt: string,
  _context: string,
  _options?: GenerationOptions
): { valid: boolean; error?: string } {
  try {
    return { valid: true };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return { valid: false, error: messages.join('; ') };
    }
    return { valid: false, error: error.message };
  }
}

// ============================================================================
// APPEL LLM AVEC RETRY EXPONENTIEL
// ============================================================================

async function callOllamaWithRetry(
  prompt: string,
  model: string,
  temperature: number,
  maxTokens: number,
  timeout: number,
  retriesLeft: number
): Promise<string> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const localaiUrl = `${ollamaUrl}/v1/chat/completions`;
  
  const requestBody = {
    model: model,
    messages: [
      { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    temperature: temperature,
    max_tokens: maxTokens,
    stream: false
  };
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(localaiUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(ollamaUrl.includes('ngrok-free.dev') ? { 'ngrok-skip-browser-warning': 'true' } : {})
      },
      signal: controller.signal,
      body: JSON.stringify(requestBody)
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
    
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (retriesLeft > 0 && (error.name === 'AbortError' || error.message.includes('timeout'))) {
      const waitTime = RETRY_DELAY_MS * (DEFAULT_RETRIES - retriesLeft + 1);
      logger.warning('RETRY', `Tentative échouée, nouvelle tentative dans ${waitTime}ms (${retriesLeft} restantes)`);
      statsManager.increment('retryCount');
      await delay(waitTime);
      return callOllamaWithRetry(prompt, model, temperature, maxTokens, timeout, retriesLeft - 1);
    }
    
    throw error;
  }
}

// ============================================================================
// GÉNÉRATION NON STREAMING
// ============================================================================

export async function generateLLMResponse(
  prompt: string, 
  context: string = '',
  options?: GenerationOptions
): Promise<string> {
  const startTime = Date.now();
  const config = getRAGConfig();
  
  const validation = validateGenerationRequest(prompt, context, options);
  if (!validation.valid) {
    logger.warning('VALIDATION', `Requête invalide: ${validation.error}`);
    statsManager.increment('failedRequests');
    return '❌ Désolé, votre requête contient des éléments invalides.';
  }
  
  const model = options?.model || config.llm.defaultModel;
  const temperature = options?.temperature ?? config.llm.temperature;
  const maxTokens = options?.maxTokens || config.llm.maxTokens;
  const timeout = options?.timeout || config.llm.timeoutMs;
  const retries = options?.retries ?? DEFAULT_RETRIES;
  
  logger.info('GENERATE', `🤖 Génération avec ${model}`);
  logger.metric('GENERATE', 'Longueur prompt', `${prompt.length} caractères`);
  logger.metric('GENERATE', 'Longueur contexte', `${context.length} caractères`);
  logger.metric('GENERATE', 'Température', temperature);
  logger.metric('GENERATE', 'Max tokens', maxTokens);
  logger.metric('GENERATE', 'Retries', retries);
  
  statsManager.increment('totalRequests');
  statsManager.increment('nonStreamRequests');
  statsManager.update({ lastRequestTime: Date.now() });
  
  const fullPrompt = `${context.length > 0 ? `CONTEXTE TECHNIQUE:\n${context}\n\n` : ''}QUESTION: ${sanitizePrompt(prompt)}\n\nRÉPONSE (en français):`;
  
  try {
    const answer = await callOllamaWithRetry(
      fullPrompt,
      model,
      temperature,
      maxTokens,
      timeout,
      retries
    );
    
    const elapsedTime = Date.now() - startTime;
    const tokensUsed = estimateTokens(answer);
    
    statsManager.increment('successfulRequests');
    statsManager.increment('totalTokens', tokensUsed);
    statsManager.average('avgResponseTime', elapsedTime);
    statsManager.update({ lastRequestDuration: elapsedTime });
    
    logger.success('GENERATE', `✅ Généré en ${formatDuration(elapsedTime)}`, {
      modèle: model,
      longueur: `${answer.length} caractères`,
      tokens: Math.round(tokensUsed)
    });
    
    return answer;
    
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    statsManager.increment('failedRequests');
    statsManager.average('avgResponseTime', elapsedTime);
    statsManager.update({ lastRequestDuration: elapsedTime });
    
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      statsManager.increment('timeoutCount');
      logger.error('GENERATE', `Timeout après ${formatDuration(elapsedTime)}`);
      return '⏱️ Le modèle a pris trop de temps. Veuillez simplifier votre question.';
    }
    
    logger.error('GENERATE', `Erreur après ${formatDuration(elapsedTime)}`, error);
    return '❌ Désolé, une erreur technique est survenue lors de la génération.';
  }
}

// ============================================================================
// GÉNÉRATION EN STREAMING
// ============================================================================

export async function* generateLLMResponseStream(
  prompt: string, 
  context: string = '',
  options?: GenerationOptions
): AsyncIterable<StreamChunk> {
  const startTime = Date.now();
  const config = getRAGConfig();
  
  const validation = validateGenerationRequest(prompt, context, { ...options, stream: true });
  if (!validation.valid) {
    logger.warning('VALIDATION', `Requête invalide: ${validation.error}`);
    statsManager.increment('failedRequests');
    yield { content: '❌ Requête invalide.', done: true };
    return;
  }
  
  const model = options?.model || config.llm.streamModel;
  const temperature = options?.temperature ?? 0.4;
  const maxTokens = options?.maxTokens || 800;
  const timeout = options?.timeout || config.llm.timeoutMs;
  
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const localaiUrl = `${ollamaUrl}/v1/chat/completions`;
  
  logger.info('STREAM', `🌊 Streaming avec ${model}`);
  logger.metric('STREAM', 'Longueur prompt', `${prompt.length} caractères`);
  logger.metric('STREAM', 'Longueur contexte', `${context.length} caractères`);
  
  statsManager.increment('totalRequests');
  statsManager.increment('streamRequests');
  statsManager.update({ lastRequestTime: Date.now() });
  
  let chunkCount = 0;
  let fullResponse = '';
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const requestBody = {
      model: model,
      messages: [
        { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
        { 
          role: 'user', 
          content: `${context.length > 0 ? `CONTEXTE:\n${context}\n\n` : ''}QUESTION: ${sanitizePrompt(prompt)}\n\nRÉPONSE:` 
        }
      ],
      temperature: temperature,
      max_tokens: maxTokens,
      stream: true
    };
    
    logger.info('STREAM', `Connexion au flux...`);
    
    const response = await fetch(localaiUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(ollamaUrl.includes('ngrok-free.dev') ? { 'ngrok-skip-browser-warning': 'true' } : {})
      },
      signal: controller.signal,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      statsManager.increment('failedRequests');
      logger.error('STREAM', `HTTP ${response.status}: ${errorText}`);
      yield { content: `❌ Erreur: ${response.status}`, done: true };
      return;
    }
    
    if (!response.body) {
      statsManager.increment('failedRequests');
      logger.error('STREAM', 'Pas de corps de réponse');
      yield { content: '❌ Erreur: pas de flux disponible', done: true };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || line.startsWith('data: [DONE]')) continue;
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.substring(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              chunkCount++;
              fullResponse += content;
              yield { content, done: false, model };
            }
          } catch (e) {
            logger.warning('STREAM', 'Erreur parsing chunk', e);
          }
        }
      }
    }
    
    const elapsedTime = Date.now() - startTime;
    const tokensUsed = estimateTokens(fullResponse);
    
    statsManager.increment('successfulRequests');
    statsManager.increment('totalTokens', tokensUsed);
    statsManager.average('avgResponseTime', elapsedTime);
    statsManager.update({ lastRequestDuration: elapsedTime });
    
    logger.success('STREAM', `✅ Streaming terminé en ${formatDuration(elapsedTime)}`, {
      modèle: model,
      chunks: chunkCount,
      longueur: `${fullResponse.length} caractères`,
      tokens: Math.round(tokensUsed)
    });
    
    yield { content: '', done: true, model, tokensUsed };
    
  } catch (error: any) {
    clearTimeout(timeoutId);
    const elapsedTime = Date.now() - startTime;
    statsManager.increment('failedRequests');
    statsManager.average('avgResponseTime', elapsedTime);
    statsManager.update({ lastRequestDuration: elapsedTime });
    
    if (error.name === 'AbortError') {
      statsManager.increment('timeoutCount');
      logger.error('STREAM', `Timeout après ${formatDuration(elapsedTime)}`);
      yield { content: '\n⏱️ [Délai dépassé — réponse partielle]', done: true };
    } else {
      logger.error('STREAM', `Erreur après ${formatDuration(elapsedTime)}`, error);
      yield { content: '❌ Erreur lors de la génération du flux.', done: true };
    }
    
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// VÉRIFICATION DE CONNEXION ET SANTÉ
// ============================================================================

export async function checkLLMHealth(): Promise<HealthStatus> {
  const startTime = Date.now();
  const config = getRAGConfig();
  
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  
  logger.info('HEALTH', `🔍 Vérification de la disponibilité du LLM local...`);
  
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      headers: {
        ...(ollamaUrl.includes('ngrok-free.dev') ? { 'ngrok-skip-browser-warning': 'true' } : {})
      }
    });
    
    const elapsedTime = Date.now() - startTime;
    
    if (!response.ok) {
      return {
        available: false,
        models: [],
        defaultModelAvailable: false,
        streamModelAvailable: false,
        error: `HTTP ${response.status}`
      };
    }
    
    const data = await response.json();
    const models = data.models?.map((m: any) => m.name) || [];
    const defaultModel = config.llm.defaultModel.split(':')[0];
    const streamModel = config.llm.streamModel.split(':')[0];
    
    const hasDefaultModel = models.some((m: string) => m.includes(defaultModel));
    const hasStreamModel = models.some((m: string) => m.includes(streamModel));
    
    logger.success('HEALTH', `Service disponible en ${formatDuration(elapsedTime)}`, {
      modèles: models.length,
      modèleDéfaut: hasDefaultModel ? config.llm.defaultModel : 'non disponible',
      modèleStream: hasStreamModel ? config.llm.streamModel : 'non disponible'
    });
    
    return {
      available: true,
      models,
      defaultModelAvailable: hasDefaultModel,
      streamModelAvailable: hasStreamModel,
      latency: elapsedTime
    };
    
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    logger.error('HEALTH', `Service indisponible après ${formatDuration(elapsedTime)}`, error);
    
    return {
      available: false,
      models: [],
      defaultModelAvailable: false,
      streamModelAvailable: false,
      latency: elapsedTime,
      error: error.message
    };
  }
}

export async function isLLMAvailable(): Promise<boolean> {
  const health = await checkLLMHealth();
  return health.available;
}

// ============================================================================
// GÉNÉRATION AVEC VALIDATION DE RÉPONSE
// ============================================================================

export async function generateWithValidation(
  prompt: string,
  context: string,
  expectedFormat: string,
  maxRetries: number = 2
): Promise<GenerationResult> {
  const startTime = Date.now();
  const config = getRAGConfig();
  
  logger.info('VALIDATE', `Génération avec validation (format: ${expectedFormat})`);
  
  let lastError: string | undefined;
  let attempts = 0;
  
  while (attempts <= maxRetries) {
    attempts++;
    logger.info('VALIDATE', `Tentative ${attempts}/${maxRetries + 1}`);
    
    const validationPrompt = attempts > 1 
      ? `${prompt}\n\nNOTE: La réponse précédente n'était pas au format attendu (${expectedFormat}). Veuillez corriger.`
      : prompt;
    
    const content = await generateLLMResponse(validationPrompt, context, {
      temperature: 0.2,
      maxTokens: config.llm.maxTokens
    });
    
    let isValid = true;
    
    if (expectedFormat.toLowerCase().includes('json')) {
      try {
        const trimmed = content.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
          isValid = false;
        } else {
          JSON.parse(trimmed);
        }
      } catch {
        isValid = false;
      }
    } else if (expectedFormat.toLowerCase().includes('liste')) {
      isValid = content.includes('-') || content.includes('•') || /\d+\./.test(content);
    }
    
    if (isValid) {
      const elapsedTime = Date.now() - startTime;
      logger.success('VALIDATE', `✅ Réponse validée en ${formatDuration(elapsedTime)} (${attempts} tentative(s))`);
      
      return {
        success: true,
        content,
        model: config.llm.defaultModel,
        tokensUsed: estimateTokens(content),
        processingTime: elapsedTime,
        retries: attempts - 1
      };
    }
    
    lastError = 'Format non valide';
    logger.warning('VALIDATE', `Format invalide, nouvelle tentative...`);
  }
  
  const elapsedTime = Date.now() - startTime;
  logger.error('VALIDATE', `Échec validation après ${attempts} tentatives`);
  
  return {
    success: false,
    content: '',
    model: config.llm.defaultModel,
    processingTime: elapsedTime,
    error: lastError,
    retries: attempts - 1
  };
}

// ============================================================================
// STATISTIQUES
// ============================================================================

export function getLLMStats(): Readonly<LLMStats> {
  return statsManager.get();
}

export function getLLMSnapshot(): {
  stats: Readonly<LLMStats>;
  metadata: { createdAt: Date; updatedAt: Date };
} {
  return statsManager.getSnapshot();
}

export function getSuccessRate(): number {
  const stats = statsManager.get();
  const total = stats.successfulRequests + stats.failedRequests;
  return total > 0 ? stats.successfulRequests / total : 0;
}

export function getTimeoutRate(): number {
  const stats = statsManager.get();
  const total = stats.totalRequests;
  return total > 0 ? stats.timeoutCount / total : 0;
}

export function getRetryRate(): number {
  const stats = statsManager.get();
  const total = stats.totalRequests;
  return total > 0 ? stats.retryCount / total : 0;
}

export function resetLLMStats(): void {
  statsManager.reset();
  logger.success('STATS', 'Statistiques LLM réinitialisées');
}

export async function persistLLMStats(): Promise<void> {
  await statsManager.persist();
  logger.success('STATS', 'Statistiques LLM persistées manuellement');
}

export function disposeLLMStats(): void {
  statsManager.dispose();
  logger.info('STATS', 'Gestionnaire de statistiques LLM disposé');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateLLMResponse,
  generateLLMResponseStream,
  generateWithValidation,
  checkLLMHealth,
  isLLMAvailable,
  getLLMStats,
  getLLMSnapshot,
  getSuccessRate,
  getTimeoutRate,
  getRetryRate,
  resetLLMStats,
  persistLLMStats,
  disposeLLMStats,
  schemas: {
    LLMRequestSchema,
    LLMResponseSchema
  }
};