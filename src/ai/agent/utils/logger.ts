/**
 * @fileOverview Logger centralisé pour le module Agent
 * @version 1.0.1
 * @description Réutilise le logger RAG pour uniformiser les logs
 */

import { createRAGLogger } from '@/ai/rag/utils/logger';
import { getAgentConfig } from '../config/agent.config';

// Valeurs par défaut pour éviter les erreurs d'initialisation
const DEFAULT_MAX_DATA_LENGTH = 500;
const DEFAULT_ENABLE_STRUCTURED = false;

// Fonction pour obtenir la config de façon sécurisée
function getSafeConfig() {
  try {
    const config = getAgentConfig();
    return {
      maxDataLength: config.logging?.maxDataLength ?? DEFAULT_MAX_DATA_LENGTH,
      enableStructured: config.logging?.level === 'debug'
    };
  } catch (error) {
    // Si la config n'est pas encore initialisée, utiliser les valeurs par défaut
    console.warn('[AGENT-LOGGER] Configuration non disponible, utilisation des valeurs par défaut');
    return {
      maxDataLength: DEFAULT_MAX_DATA_LENGTH,
      enableStructured: DEFAULT_ENABLE_STRUCTURED
    };
  }
}

const safeConfig = getSafeConfig();

// Logger pour le module Agent
export const agentLogger = createRAGLogger('[AGENT]', {
  maxDataLength: safeConfig.maxDataLength,
  enableStructured: safeConfig.enableStructured
});

// Logger pour MCP
export const mcpLogger = createRAGLogger('[MCP]', {
  maxDataLength: safeConfig.maxDataLength,
  enableStructured: safeConfig.enableStructured
});

// Logger pour TaskPlanner
export const plannerLogger = createRAGLogger('[PLANNER]', {
  maxDataLength: safeConfig.maxDataLength,
  enableStructured: safeConfig.enableStructured
});

// Logger pour TaskExecutor
export const executorLogger = createRAGLogger('[EXECUTOR]', {
  maxDataLength: safeConfig.maxDataLength,
  enableStructured: safeConfig.enableStructured
});

// Logger pour ToolRegistry
export const toolRegistryLogger = createRAGLogger('[TOOL-REGISTRY]', {
  maxDataLength: safeConfig.maxDataLength,
  enableStructured: safeConfig.enableStructured
});

// Logger pour AgentLearner
export const learnerLogger = createRAGLogger('[LEARNER]', {
  maxDataLength: safeConfig.maxDataLength,
  enableStructured: safeConfig.enableStructured
});

export default {
  agentLogger,
  mcpLogger,
  plannerLogger,
  executorLogger,
  toolRegistryLogger,
  learnerLogger
};