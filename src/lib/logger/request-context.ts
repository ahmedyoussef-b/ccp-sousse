// src/lib/logger/request-context.ts

// Détection de l'environnement
const isServer = typeof window === 'undefined';

// Interface partagée
interface AIRequestContext {
  sessionId: string;
}

// Type pour AsyncLocalStorage (défini conditionnellement)
type AsyncLocalStorageType = {
  run<T>(store: AIRequestContext, callback: () => T): T;
  getStore(): AIRequestContext | undefined;
};

// Stockage côté serveur
let storage: AsyncLocalStorageType | null = null;

// Chargement conditionnel côté serveur uniquement
if (isServer) {
  try {
    // Utilisation de require pour éviter l'analyse statique côté client
    const asyncHooks = require('async_hooks');
    const ALS = asyncHooks.AsyncLocalStorage;
    // Créer l'instance sans paramètre de type
    storage = new ALS() as AsyncLocalStorageType;
  } catch (e) {
    console.warn('[RequestContext] async_hooks non disponible, fallback sur stockage simple');
    storage = null;
  }
}

// Fallback simple pour le client
const clientStorage = {
  currentSession: 'client-session',
};

/**
 * Exécute une fonction dans le contexte d'une session donnée
 */
export function runWithSession<T>(sessionId: string, fn: () => T): T {
  if (isServer && storage) {
    // Utiliser le storage serveur
    return storage.run({ sessionId }, fn);
  } else {
    // Côté client, on stocke simplement dans une variable
    clientStorage.currentSession = sessionId;
    try {
      return fn();
    } finally {
      // Garder la session pour les appels suivants
    }
  }
}

/**
 * Récupère le sessionId actuel depuis le contexte
 * Fallback sur 'unknown-session' si hors contexte
 */
export function getSessionId(): string {
  if (isServer && storage) {
    const context = storage.getStore();
    return context?.sessionId || 'unknown-session';
  } else {
    return clientStorage.currentSession || 'client-session';
  }
}

/**
 * Réinitialise la session courante (utile pour les tests)
 */
export function resetSession(): void {
  if (!isServer) {
    clientStorage.currentSession = 'client-session';
  }
}

/**
 * Vérifie si le contexte de session est actif
 */
export function hasActiveSession(): boolean {
  if (isServer && storage) {
    return storage.getStore() !== undefined;
  } else {
    return clientStorage.currentSession !== 'client-session';
  }
}