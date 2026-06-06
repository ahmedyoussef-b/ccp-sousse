/**
 * @fileOverview Client Ollama optimisé pour les appels LLM avec timeout, retry et métriques
 * @version 2.5.0
 * @lastUpdated 2026-04-14
 * @changes Utilisation du modèle fine-tuné ccp-finetuned par défaut, fallback gemma2:2b
 */
import { aiLogger } from '../../lib/logger/ai-logger';
import { healthMonitor } from '../resilience/health-monitor';
import { callGroq } from './groq-provider';
import { isCloudMode } from '../../lib/config/env-mode';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_TIMEOUT = 60000;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 500;

import { getFinetunedModel, getGemmaQuantizedModel, selectModel } from '../config/models.config';

/**
 * Modèle fine-tuné CCP - Spécialiste industriel
 */
const FINETUNED_MODEL = getFinetunedModel();

/**
 * Modèle Gemma quantifié - Fallback technique
 */
const GEMMA_QUANTIZED = getGemmaQuantizedModel();

/**
 * Modèle principal déterminé dynamiquement selon les ressources
 */
const DEFAULT_MODEL = selectModel('thinking').name;

/**
 * Modèle de fallback pour streaming
 */
const DEFAULT_STREAM_MODEL = selectModel('text').name;

// ============================================================================
// LOGS (inchangés)
// ============================================================================

const LOG_PREFIX = '[OLLAMA]';

function logInfo(step: string, message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 [${step}] ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logSuccess(step: string, message: string, data?: any): void {
  console.log(`${LOG_PREFIX} ✅ [${step}] ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logWarning(step: string, message: string, data?: any): void {
  console.warn(`${LOG_PREFIX} ⚠️ [${step}] ${message}`);
  if (data) console.warn(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logError(step: string, message: string, error?: any): void {
  console.error(`${LOG_PREFIX} ❌ [${step}] ${message}`);
  if (error) console.error(`${LOG_PREFIX} 🔥 ${error.message || error}`);
}

function logMetric(step: string, metric: string, value: any): void {
  console.log(`${LOG_PREFIX} 📈 [${step}] ${metric}: ${value}`);
}

// ============================================================================
// INTERFACES (inchangées)
// ============================================================================

export interface OllamaOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  stream?: boolean;
  images?: string[];
}

export interface OllamaResponse {
  response: string;
  model: string;
  created_at: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface GenerationMetrics {
  totalDuration: number;
  loadDuration: number;
  promptEvalCount: number;
  promptEvalDuration: number;
  evalCount: number;
  evalDuration: number;
  tokensPerSecond: number;
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

// ============================================================================
// STATISTIQUES (inchangées)
// ============================================================================

interface OllamaStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalTokensGenerated: number;
  avgTokensPerCall: number;
  avgResponseTime: number;
  totalResponseTime: number;
  lastCallTime: number | null;
  lastCallDuration: number | null;
  modelUsage: Map<string, number>;
  errors: string[];
}

const stats: OllamaStats = {
  totalCalls: 0,
  successfulCalls: 0,
  failedCalls: 0,
  totalTokensGenerated: 0,
  avgTokensPerCall: 0,
  avgResponseTime: 0,
  totalResponseTime: 0,
  lastCallTime: null,
  lastCallDuration: null,
  modelUsage: new Map(),
  errors: []
};

// ============================================================================
// FONCTIONS UTILITAIRES (inchangées)
// ============================================================================

function updateStats(
  success: boolean, 
  duration: number, 
  model: string, 
  metrics?: GenerationMetrics
): void {
  stats.totalCalls++;
  stats.totalResponseTime += duration;
  stats.avgResponseTime = stats.totalResponseTime / stats.totalCalls;
  stats.lastCallTime = Date.now();
  stats.lastCallDuration = duration;
  
  const currentCount = stats.modelUsage.get(model) || 0;
  stats.modelUsage.set(model, currentCount + 1);
  
  if (success) {
    stats.successfulCalls++;
    if (metrics) {
      stats.totalTokensGenerated += metrics.evalCount;
      stats.avgTokensPerCall = stats.totalTokensGenerated / stats.successfulCalls;
    }
  } else {
    stats.failedCalls++;
  }
}

function addError(error: string): void {
  stats.errors.push(error);
  if (stats.errors.length > 100) stats.errors.shift();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function formatTokensPerSecond(tokens: number, durationMs: number): string {
  const tps = (tokens / (durationMs / 1000)).toFixed(1);
  return `${tps} tok/s`;
}

// ============================================================================
// APPEL OLLAMA (NON STREAMING) - Modifié pour fallback
// ============================================================================

/**
 * Appelle l'API Ollama pour générer une réponse.
 * Utilise le modèle fine-tuné par défaut, avec fallback automatique vers Gemma en cas d'échec.
 */
export async function callOllama(
  prompt: string,
  options: OllamaOptions = {}
): Promise<string> {
  const startTime = Date.now();
  let {
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    timeout = DEFAULT_TIMEOUT,
    stream = false,
    images = []
  } = options;

  logInfo('CALL', `🤖 Appel à ${model} (modèle fine-tuné ou fallback)`);
  logMetric('CALL', 'Longueur prompt', `${prompt.length} caractères`);
  logMetric('CALL', 'Temperature', temperature);
  logMetric('CALL', 'Max tokens', maxTokens);
  logMetric('CALL', 'Timeout', `${timeout}ms`);

  // Tentative avec le modèle demandé (ou par défaut)
  let attemptModel = model;
  let responseText: string | null = null;
  let lastError: Error | null = null;

  // Liste des modèles à essayer en cascade
  const modelCascade = [attemptModel, GEMMA_QUANTIZED, 'tinyllama:latest'];

  for (let i = 0; i < modelCascade.length; i++) {
    const currentModel = modelCascade[i];
    if (i > 0) {
      logWarning('CALL', `Fallback: tentative avec ${currentModel} (${i}/${modelCascade.length - 1})`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: currentModel,
          prompt,
          stream,
          images,
          options: {
            temperature,
            num_predict: maxTokens,
            top_p: 0.9,
            stop: ['\n\n', 'Question:', 'Contexte:']
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const elapsedTime = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
      }

      const data = await response.json() as OllamaResponse;
      responseText = data.response.trim();
      
      const metrics: GenerationMetrics = {
        totalDuration: data.total_duration || 0,
        loadDuration: data.load_duration || 0,
        promptEvalCount: data.prompt_eval_count || 0,
        promptEvalDuration: data.prompt_eval_duration || 0,
        evalCount: data.eval_count || 0,
        evalDuration: data.eval_duration || 0,
        tokensPerSecond: data.eval_count && data.eval_duration 
          ? (data.eval_count / (data.eval_duration / 1e9))
          : 0
      };
      
      updateStats(true, elapsedTime, currentModel, metrics);
      
      if (healthMonitor && typeof (healthMonitor as any).reportLLMLatency === 'function') {
        (healthMonitor as any).reportLLMLatency(elapsedTime);
      } else {
        logInfo('CALL', 'HealthMonitor: reportLLMLatency non disponible, ignoré');
      }
      
      logSuccess('CALL', `✅ Généré en ${formatDuration(elapsedTime)} (modèle: ${currentModel})`, {
        modèle: currentModel,
        tokens: metrics.evalCount,
        vitesse: formatTokensPerSecond(metrics.evalCount, metrics.evalDuration / 1e6),
        réponse: `${responseText.length} caractères`,
        ram_estimate: currentModel === FINETUNED_MODEL ? '~3.8 Go' : (currentModel === GEMMA_QUANTIZED ? '~3.5 Go' : '~0.6 Go')
      });

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🤖 SECTION 8 – Génération IA
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🤖 SECTION 8 – Génération IA');
      console.log('🤖 Modèle utilisé :', currentModel);
      console.log('📈 Vitesse :', metrics.tokensPerSecond.toFixed(1) + ' tok/s');
      console.log('⏱️ Durée totale :', formatDuration(elapsedTime));
      console.log('📝 Réponse (extrait) :', responseText.substring(0, 150) + '...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      aiLogger.logStep(8, 'LLM', 'Inference Success', {
        model: currentModel,
        tokensGenerated: metrics.evalCount,
        vitesse: metrics.tokensPerSecond.toFixed(1) + ' tok/s',
        durationMs: elapsedTime,
        evalDuration: formatDuration(metrics.evalDuration / 1e6)
      });

      // Succès, on sort de la boucle
      break;

    } catch (error: any) {
      clearTimeout(timeoutId);
      const elapsedTime = Date.now() - startTime;
      
      addError(`${currentModel}: ${error.message}`);
      updateStats(false, elapsedTime, currentModel);
      
      if (healthMonitor && typeof (healthMonitor as any).reportError === 'function') {
        (healthMonitor as any).reportError();
      } else {
        logWarning('CALL', 'HealthMonitor: reportError non disponible, ignoré');
      }
      
      lastError = error;
      
      if (error.name === 'AbortError') {
        logError('CALL', `Timeout après ${formatDuration(elapsedTime)} (${timeout}ms)`, error);
      } else {
        logError('CALL', `Échec avec ${currentModel} après ${formatDuration(elapsedTime)}`, error);
      }
      
      // Si c'était le dernier modèle (ou si on est en Cloud), on tente Groq avant d'abandonner
      if (i === modelCascade.length - 1 || isCloudMode()) {
        logWarning('CALL', `Basculement sur Groq (Ultra-rapide)...`);
        try {
          const groqResponse = await callGroq(prompt, { 
            temperature, 
            maxTokens,
            timeout: 15000 
          });
          
          const elapsedTime = Date.now() - startTime;
          logSuccess('CALL', `✅ Groq réussi en ${formatDuration(elapsedTime)}`);
          
          return groqResponse;
        } catch (groqError: any) {
          logError('CALL', `Échec du recours Groq`, groqError);
          throw new Error(`Erreur complète: Ollama=${lastError?.message}, Groq=${groqError.message}`);
        }
      }
      // Sinon, on continue avec le modèle suivant
    }
  }

  return responseText!;
}

// ============================================================================
// APPEL OLLAMA (STREAMING) - Similaire avec fallback
// ============================================================================

/**
 * Appelle l'API Ollama avec streaming (pour les réponses longues).
 * Gère le fallback automatique en cas d'échec du modèle fine-tuné.
 */
export async function* callOllamaStream(
  prompt: string,
  options: OllamaOptions = {}
): AsyncGenerator<string, void, unknown> {
  const startTime = Date.now();
  let {
    model = DEFAULT_STREAM_MODEL,
    temperature = 0.7,
    maxTokens = 500,
    timeout = 60000
  } = options;

  logInfo('STREAM', `🌊 Streaming avec ${model} (fallback actif)`);
  logMetric('STREAM', 'Longueur prompt', `${prompt.length} caractères`);
  logMetric('STREAM', 'Timeout', `${timeout}ms`);

  // Cascade de modèles
  const modelCascade = [model, GEMMA_QUANTIZED, 'tinyllama:latest'];

  for (let attempt = 0; attempt < modelCascade.length; attempt++) {
    const currentModel = modelCascade[attempt];
    if (attempt > 0) {
      logWarning('STREAM', `Fallback streaming: tentative avec ${currentModel} (${attempt}/${modelCascade.length - 1})`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    let chunkCount = 0;
    let fullResponse = '';
    let evalCount = 0;

    try {
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: currentModel,
          prompt,
          stream: true,
          options: {
            temperature,
            num_predict: maxTokens,
            top_p: 0.9
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.response) {
                chunkCount++;
                fullResponse += data.response;
                if (data.eval_count) evalCount = data.eval_count;
                yield data.response;
              }
            } catch (e) {
              // Ignorer les lignes mal formées
            }
          }
        }
      }
      
      const elapsedTime = Date.now() - startTime;
      
      const metrics: GenerationMetrics = {
        totalDuration: elapsedTime * 1e6,
        loadDuration: 0,
        promptEvalCount: 0,
        promptEvalDuration: 0,
        evalCount,
        evalDuration: elapsedTime * 1e6,
        tokensPerSecond: evalCount > 0 ? (evalCount / (elapsedTime / 1000)) : 0
      };
      
      updateStats(true, elapsedTime, currentModel, metrics);
      
      if (healthMonitor && typeof (healthMonitor as any).reportLLMLatency === 'function') {
        (healthMonitor as any).reportLLMLatency(elapsedTime);
      }
      
      logSuccess('STREAM', `✅ Streaming terminé en ${formatDuration(elapsedTime)} (modèle: ${currentModel})`, {
        modèle: currentModel,
        chunks: chunkCount,
        tokens: evalCount,
        vitesse: formatTokensPerSecond(evalCount, elapsedTime),
        réponse: `${fullResponse.length} caractères`
      });

      // Succès, on sort de la boucle
      return;

    } catch (error: any) {
      clearTimeout(timeoutId);
      const elapsedTime = Date.now() - startTime;
      
      addError(`${currentModel}: ${error.message}`);
      updateStats(false, elapsedTime, currentModel);
      
      if (error.name === 'AbortError') {
        logError('STREAM', `Timeout après ${formatDuration(elapsedTime)} (${timeout}ms)`, error);
      } else {
        logError('STREAM', `Échec avec ${currentModel} après ${formatDuration(elapsedTime)}`, error);
      }
      
      // Si c'est le dernier modèle, on propage l'erreur
      if (attempt === modelCascade.length - 1) {
        throw new Error(`Streaming failed for all models. Last error: ${error.message}`);
      }
      // Sinon, on continue avec le modèle suivant
    }
  }
}

// ============================================================================
// UTILITAIRES (inchangés, mais adaptés pour supporter le modèle fine-tuné)
// ============================================================================

/**
 * Vérifie si un modèle est disponible
 */
export async function isModelAvailable(model: string): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) return false;
    
    const data = await response.json();
    const models = data.models || [];
    const available = models.some((m: OllamaModel) => m.name === model);
    
    logMetric('AVAILABLE', `${model}`, available ? '✅' : '❌');
    return available;
    
  } catch (error: any) {
    logWarning('AVAILABLE', `Erreur vérification ${model}`, error.message);
    return false;
  }
}

/**
 * Vérifie spécifiquement si le modèle fine-tuné est disponible
 */
export async function isFinetunedAvailable(): Promise<boolean> {
  return isModelAvailable(FINETUNED_MODEL);
}

/**
 * Vérifie si le modèle Gemma quantifié est disponible (fallback)
 */
export async function isGemmaQuantizedAvailable(): Promise<boolean> {
  return isModelAvailable(GEMMA_QUANTIZED);
}

/**
 * Récupère la liste des modèles disponibles
 */
export async function getAvailableModels(): Promise<string[]> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) return [];
    
    const data = await response.json();
    const models: OllamaModel[] = data.models || [];
    const modelNames = models.map((m: OllamaModel) => m.name);
    const elapsedTime = Date.now() - startTime;
    
    logSuccess('MODELS', `${modelNames.length} modèles disponibles en ${formatDuration(elapsedTime)}`);
    modelNames.forEach((name: string, i: number) => {
      logMetric('MODELS', `${i + 1}.`, name);
    });
    
    // Vérifier si le modèle fine-tuné est présent
    const hasFinetuned = modelNames.some(name => name === FINETUNED_MODEL);
    if (!hasFinetuned) {
      logWarning('MODELS', `⚠️ Modèle fine-tuné ${FINETUNED_MODEL} non trouvé. Assurez-vous de l'avoir importé: ollama create ${FINETUNED_MODEL} -f Modelfile`);
    }
    
    return modelNames;
    
  } catch (error: any) {
    logError('MODELS', 'Erreur récupération modèles', error);
    return [];
  }
}

/**
 * Test la connexion à Ollama
 */
export async function testOllamaConnection(): Promise<{ 
  connected: boolean; 
  models: string[]; 
  error?: string;
  latency?: number;
  hasFinetuned?: boolean;
  hasGemmaQuantized?: boolean;
}> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000)
    });
    
    const elapsedTime = Date.now() - startTime;
    
    if (!response.ok) {
      return { 
        connected: false, 
        models: [], 
        error: `HTTP ${response.status}`,
        latency: elapsedTime
      };
    }
    
    const data = await response.json();
    const models: string[] = data.models?.map((m: OllamaModel) => m.name) || [];
    const hasFinetuned = models.some(m => m === FINETUNED_MODEL);
    const hasGemmaQuantized = models.some(m => m === GEMMA_QUANTIZED);
    
    logSuccess('CONNECTION', `Connecté en ${formatDuration(elapsedTime)}`, {
      modèles: models.length,
      url: OLLAMA_URL,
      finetuned: hasFinetuned ? '✅ disponible' : '❌ absent',
      gemma_quantized: hasGemmaQuantized ? '✅ disponible' : '❌ absent'
    });
    
    if (!hasFinetuned) {
      logWarning('CONNECTION', `Le modèle fine-tuné ${FINETUNED_MODEL} n'est pas disponible. Utilisez 'ollama create ${FINETUNED_MODEL} -f Modelfile' pour l'importer.`);
    }
    
    return { 
      connected: true, 
      models,
      latency: elapsedTime,
      hasFinetuned,
      hasGemmaQuantized
    };
    
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    logError('CONNECTION', `Échec après ${formatDuration(elapsedTime)}`, error);
    return { 
      connected: false, 
      models: [], 
      error: error.message,
      latency: elapsedTime
    };
  }
}

/**
 * Obtenir des informations sur un modèle
 */
export async function getModelInfo(model: string): Promise<any | null> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    logSuccess('INFO', `Informations pour ${model} récupérées`);
    
    return data;
    
  } catch (error: any) {
    logError('INFO', `Erreur récupération infos ${model}`, error);
    return null;
  }
}

/**
 * Génère des embeddings avec Ollama (ou Together.ai en cloud)
 */
export async function generateEmbeddings(text: string, model: string = 'nomic-embed-text'): Promise<number[]> {
  const startTime = Date.now();
  
  if (isCloudMode()) {
    logWarning('EMBED', `Mode Cloud actif, mais Together AI a été retiré (Option Groq). Fallback sur Ollama local pour les embeddings.`);
    // Nous passons à la suite pour utiliser Ollama localement.
  }

  logInfo('EMBED', `🔢 Génération d'embedding local avec ${model}`);
  logMetric('EMBED', 'Texte longueur', `${text.length} caractères`);
  
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text })
    });
    
    const elapsedTime = Date.now() - startTime;
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const embedding = data.embedding;
    
    logSuccess('EMBED', `Embedding généré en ${formatDuration(elapsedTime)}`, {
      modèle: model,
      dimension: embedding?.length || 0
    });
    
    return embedding;
    
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    logError('EMBED', `Échec après ${formatDuration(elapsedTime)}`, error);
    throw error;
  }
}

// ============================================================================
// STATISTIQUES (inchangées)
// ============================================================================

export function getOllamaStats(): {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  successRate: number;
  totalTokensGenerated: number;
  avgTokensPerCall: number;
  avgResponseTime: number;
  lastCallTime: number | null;
  lastCallDuration: number | null;
  modelUsage: Record<string, number>;
  recentErrors: string[];
} {
  const successRate = stats.totalCalls > 0 
    ? stats.successfulCalls / stats.totalCalls 
    : 0;
  
  const modelUsageObj: Record<string, number> = {};
  const modelUsageEntries = Array.from(stats.modelUsage.entries());
  for (const [key, value] of modelUsageEntries) {
    modelUsageObj[key] = value;
  }
  
  return {
    totalCalls: stats.totalCalls,
    successfulCalls: stats.successfulCalls,
    failedCalls: stats.failedCalls,
    successRate: Math.round(successRate * 100) / 100,
    totalTokensGenerated: stats.totalTokensGenerated,
    avgTokensPerCall: Math.round(stats.avgTokensPerCall),
    avgResponseTime: Math.round(stats.avgResponseTime),
    lastCallTime: stats.lastCallTime,
    lastCallDuration: stats.lastCallDuration,
    modelUsage: modelUsageObj,
    recentErrors: stats.errors.slice(-10)
  };
}

export function resetOllamaStats(): void {
  stats.totalCalls = 0;
  stats.successfulCalls = 0;
  stats.failedCalls = 0;
  stats.totalTokensGenerated = 0;
  stats.avgTokensPerCall = 0;
  stats.avgResponseTime = 0;
  stats.totalResponseTime = 0;
  stats.lastCallTime = null;
  stats.lastCallDuration = null;
  stats.modelUsage.clear();
  stats.errors = [];
  logSuccess('STATS', 'Statistiques Ollama réinitialisées');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  callOllama,
  callOllamaStream,
  isModelAvailable,
  isFinetunedAvailable,
  isGemmaQuantizedAvailable,
  getAvailableModels,
  testOllamaConnection,
  getModelInfo,
  generateEmbeddings,
  getOllamaStats,
  resetOllamaStats,
  DEFAULT_MODEL,
  FINETUNED_MODEL,
  GEMMA_QUANTIZED
};