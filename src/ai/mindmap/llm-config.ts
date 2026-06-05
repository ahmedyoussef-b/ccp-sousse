// src/ai/mindmap/llm-config.ts
/**
 * Configuration centralisée pour les providers LLM utilisés par le module Mindmap
 * Évite la duplication de la lecture de .env.llm et des modèles par défaut
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../core/sqlite/utils';

const CONFIG_PATH = path.join(process.cwd(), '.env.llm');

/** Modèle Groq par défaut pour la génération de mindmaps */
export const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

/** Modèle Ollama local par défaut */
export const LOCAL_MODEL = process.env.LOCAL_LLM_MODEL || 'phi:2.7b';

/** Modèle Groq Vision pour l'analyse d'images */
export const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

/** Timeout pour les appels API (ms) */
export const API_TIMEOUT_MS = 45000;

/** Température par défaut pour la génération déterministe */
export const DEFAULT_TEMPERATURE = 0.1;

/** Tokens max par défaut */
export const DEFAULT_MAX_TOKENS = 3000;

/**
 * Vérifie si Groq est activé comme provider principal
 * Ordre de priorité : .env.llm > USE_GROQ env var > false (Ollama par défaut)
 */
export function isGroqEnabled(): boolean {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const match = content.match(/LLM_PROVIDER=(.+)/);
      if (match) {
        return match[1].trim() === 'groq';
      }
    }
  } catch (error) {
    logger.warn('LLM-CONFIG', 'Error reading .env.llm config, falling back to env var', error);
  }
  return process.env.USE_GROQ === 'true';
}

/**
 * Retourne le nom du provider actif pour le logging
 */
export function getActiveProviderName(): string {
  return isGroqEnabled() ? 'Groq (Cloud)' : 'Ollama (Local)';
}