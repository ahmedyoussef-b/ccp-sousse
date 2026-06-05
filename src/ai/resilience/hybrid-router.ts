/**
 * Routeur Hybride Résilient - Groq primary, Phi-3.5 fallback
 * @version 2.0.0
 * @lastUpdated 2026-04-25
 * @changes Migration Core SQLite - Remplacement cache persistant
 */

import { healthMonitor, SystemMode } from './health-monitor';
import { modelManager } from './model-manager';
import { callGroq } from '../providers/groq-provider';
import { callOllama } from '../providers/ollama-client';
import { getSQLiteCore, SQLiteCore } from '../core/sqlite/manager';

// ============================================================================
// INITIALISATION CORE SQLITE
// ============================================================================

let dbInitialized = false;
let db: SQLiteCore;

async function getDB(): Promise<SQLiteCore> {
  if (!dbInitialized) {
    db = getSQLiteCore();
    await db.initialize();
    dbInitialized = true;
  }
  return db;
}

// ============================================================================
// CACHE SSD PERSISTANT (via SQLite)
// ============================================================================

const CACHE_NAMESPACE = 'hybrid_router';
const CACHE_TTL_SECONDS = 3600; // 1 heure

async function persistentCacheGet(query: string): Promise<string | null> {
  try {
    const dbInstance = await getDB();
    const cached = dbInstance.get<{ response: string; timestamp: number }>(CACHE_NAMESPACE, query);
    if (cached && cached.response) {
      console.log(`[HYBRID-ROUTER] ✅ Cache SQLite hit pour: "${query.substring(0, 50)}..."`);
      return cached.response;
    }
  } catch (error) {
    console.warn('[HYBRID-ROUTER] Erreur cache SQLite get:', error);
  }
  return null;
}

async function persistentCacheSet(query: string, response: string): Promise<void> {
  try {
    const dbInstance = await getDB();
    dbInstance.set(CACHE_NAMESPACE, query, { response, timestamp: Date.now() }, CACHE_TTL_SECONDS);
    console.log(`[HYBRID-ROUTER] 💾 Réponse mise en cache SQLite`);
  } catch (error) {
    console.warn('[HYBRID-ROUTER] Erreur cache SQLite set:', error);
  }
}

async function persistentCacheDelete(query: string): Promise<boolean> {
  try {
    const dbInstance = await getDB();
    const deleted = dbInstance.delete(CACHE_NAMESPACE, query);
    if (deleted) {
      console.log(`[HYBRID-ROUTER] 🗑️ Cache SQLite supprimé pour: "${query.substring(0, 50)}..."`);
    }
    return deleted;
  } catch (error) {
    console.warn('[HYBRID-ROUTER] Erreur cache SQLite delete:', error);
    return false;
  }
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface HybridResponse {
  answer: string;
  mode: SystemMode;
  model: string;
  latency: number;
  tokens?: number;
  source: 'cache' | 'cloud' | 'local';
  isDegraded: boolean;
  message: string;
}

export interface HybridOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  context?: string;
}

// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

class HybridRouter {
  private readonly GROQ_TIMEOUT = 10000;      // 10s (acceptable pour fallback)
  private readonly MIN_FALLBACK_DURATION = 120000; // 2 minutes avant retour Groq
  private lastFallbackTime: number = 0;

  /**
   * Point d'entrée unique du routage
   */
  public async route(query: string, options: HybridOptions = {}): Promise<HybridResponse> {
    const startTime = Date.now();
    
    // Construction du prompt avec contexte RAG éventuel
    const fullPrompt = options.context 
      ? `Contexte technique:\n${options.context}\n\nQuestion:\n${query}`
      : query;

    // 1️⃣ Cache SSD persistant (SQLite)
    try {
      const cachedResponse = await persistentCacheGet(query);
      if (cachedResponse && typeof cachedResponse === 'string') {
        return {
          answer: cachedResponse,
          mode: healthMonitor.getStatus().mode,
          model: 'Cache Persistant (SQLite)',
          latency: Date.now() - startTime,
          source: 'cache',
          isDegraded: false,
          message: 'Réponse immédiate depuis le cache local (SQLite)'
        };
      }
    } catch (cacheError) {
      console.warn('[HYBRID-ROUTER] Erreur cache persistant:', cacheError);
    }

    // 2️⃣ État du système
    const status = healthMonitor.getStatus();
    
    const canUseCloud = status.groqAvailable || 
                       (status.mode === SystemMode.NOMINAL && 
                        Date.now() - this.lastFallbackTime > this.MIN_FALLBACK_DURATION);

    // 3️⃣ Mode nominal : Groq Cloud
    if (canUseCloud) {
      try {
        console.log('[HYBRID-ROUTER] 🚀 Tentative Groq Cloud...');
        const groqModel = options.model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
        const response = await callGroq(fullPrompt, {
          timeout: this.GROQ_TIMEOUT,
          model: groqModel,
          temperature: options.temperature ?? 0.3,
          maxTokens: options.maxTokens ?? 1000
        });

        const latency = Date.now() - startTime;
        
        // Stockage asynchrone sans bloquer la réponse
        persistentCacheSet(query, response).catch(err => 
          console.warn('[HYBRID-ROUTER] Échec mise en cache:', err)
        );

        return {
          answer: response,
          mode: SystemMode.NOMINAL,
          model: `Groq (${groqModel})`,
          latency,
          source: 'cloud',
          isDegraded: false,
          message: 'Groq Cloud - réponse instantanée'
        };
      } catch (error: any) {
        console.warn(`[HYBRID-ROUTER] ⚠️ Échec Groq (${error.message}). Basculement vers local...`);
        this.lastFallbackTime = Date.now();
      }
    }

    // 4️⃣ Mode dégradé / offline : modèle local (Phi-3.5 Mini via ModelManager)
    console.log('[HYBRID-ROUTER] 🖥️ Exécution locale de secours...');
    modelManager.markActivity();
    
    const localModel = modelManager.getTargetLocalModel();
    const constraints = modelManager.getConstraints();
    
    const systemPrompt = constraints.textOnly 
      ? "Réponds uniquement en format texte brut. Sois très concis."
      : "Tu es un assistant industriel de secours. Réponds précisément et de manière utile.";

    try {
      const localResponse = await callOllama(`${systemPrompt}\n\n${fullPrompt}`, {
        model: localModel,
        temperature: options.temperature ?? 0.3,
        maxTokens: Math.min(options.maxTokens ?? 1000, constraints.contextSize / 4),
        timeout: 60000
      });

      const totalLatency = Date.now() - startTime;
      const isFirstFallback = Date.now() - this.lastFallbackTime < 5000;

      return {
        answer: localResponse,
        mode: status.mode,
        model: localModel,
        latency: totalLatency,
        source: 'local',
        isDegraded: true,
        message: isFirstFallback 
          ? "Chargement du moteur local (Phi-3.5) – première exécution, patience..."
          : "Mode local actif – qualité optimale maintenue"
      };
    } catch (localError: any) {
      console.error('[HYBRID-ROUTER] Échec du modèle local:', localError);
      
      return {
        answer: "Je suis désolé, le service est actuellement indisponible. Veuillez réessayer dans quelques instants.",
        mode: status.mode,
        model: 'Fallback d\'urgence',
        latency: Date.now() - startTime,
        source: 'local',
        isDegraded: true,
        message: 'Erreur critique – aucun modèle disponible'
      };
    }
  }

  /**
   * Invalide une entrée du cache persistant
   */
  public async invalidateCache(query: string): Promise<boolean> {
    return persistentCacheDelete(query);
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const hybridRouter = new HybridRouter();