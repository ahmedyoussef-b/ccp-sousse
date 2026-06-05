/**
 * @fileOverview Configuration centralisée pour le module Agent
 * @version 1.0.0
 * @description Externalise les paramètres pour flexibilité environnementale
 */

import { z } from 'zod';

// ============================================================================
// SCHÉMAS DE CONFIGURATION
// ============================================================================

export const AgentConfigSchema = z.object({
  // Configuration du logger
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    enableConsole: z.boolean().default(true),
    enableFile: z.boolean().default(false),
    maxDataLength: z.number().min(100).max(5000).default(500)
  }).default({}),

  // Configuration des outils
  tools: z.object({
    supportedTools: z.array(z.string()).default(['search', 'email', 'calendar', 'calculator', 'summarize', 'analyze']),
    maxRetries: z.number().min(0).max(5).default(2),
    retryDelay: z.number().min(100).max(5000).default(1000),
    timeout: z.number().min(1000).max(120000).default(30000),
    minReliability: z.number().min(0).max(1).default(0.7)
  }).default({}),

  // Configuration du planificateur
  planner: z.object({
    maxSteps: z.number().min(1).max(50).default(20),
    minConfidence: z.number().min(0).max(1).default(0.6),
    cacheTTL: z.number().min(60000).max(3600000).default(600000), // 10 minutes
    timeout: z.number().min(1000).max(30000).default(10000)
  }).default({}),

  // Configuration de l'exécuteur
  executor: z.object({
    failFast: z.boolean().default(true),
    continueOnNonCritical: z.boolean().default(false),
    maxRetries: z.number().min(0).max(5).default(2),
    retryDelay: z.number().min(100).max(5000).default(1000)
  }).default({}),

  // Configuration des métriques
  metrics: z.object({
    enabled: z.boolean().default(true),
    persistInterval: z.number().min(60000).max(3600000).default(600000),
    maxHistorySize: z.number().min(100).max(10000).default(1000)
  }).default({})
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ============================================================================
// CONFIGURATION PAR DÉFAUT
// ============================================================================

let validatedConfig: AgentConfig | null = null;

export function getAgentConfig(): AgentConfig {
  if (!validatedConfig) {
    const result = AgentConfigSchema.safeParse({
      logging: {
        level: process.env.AGENT_LOG_LEVEL || 'info',
        enableFile: process.env.AGENT_LOG_TO_FILE === 'true',
        maxDataLength: parseInt(process.env.AGENT_LOG_MAX_DATA_LENGTH || '500', 10)
      },
      tools: {
        maxRetries: parseInt(process.env.AGENT_TOOL_MAX_RETRIES || '2', 10),
        retryDelay: parseInt(process.env.AGENT_TOOL_RETRY_DELAY || '1000', 10),
        timeout: parseInt(process.env.AGENT_TOOL_TIMEOUT || '30000', 10),
        minReliability: parseFloat(process.env.AGENT_TOOL_MIN_RELIABILITY || '0.7')
      },
      planner: {
        maxSteps: parseInt(process.env.AGENT_PLANNER_MAX_STEPS || '20', 10),
        minConfidence: parseFloat(process.env.AGENT_PLANNER_MIN_CONFIDENCE || '0.6'),
        timeout: parseInt(process.env.AGENT_PLANNER_TIMEOUT || '10000', 10)
      },
      executor: {
        failFast: process.env.AGENT_EXECUTOR_FAIL_FAST !== 'false',
        continueOnNonCritical: process.env.AGENT_EXECUTOR_CONTINUE_ON_NON_CRITICAL === 'true',
        maxRetries: parseInt(process.env.AGENT_EXECUTOR_MAX_RETRIES || '2', 10),
        retryDelay: parseInt(process.env.AGENT_EXECUTOR_RETRY_DELAY || '1000', 10)
      }
    });

    if (!result.success) {
      console.error('❌ Configuration Agent invalide:', result.error.errors);
      throw new Error('Invalid Agent configuration');
    }
    validatedConfig = result.data;
  }
  return validatedConfig;
}

export function overrideAgentConfig(overrides: Partial<AgentConfig>): void {
  const current = getAgentConfig();
  const merged = AgentConfigSchema.parse({ ...current, ...overrides });
  validatedConfig = merged;
}

export function resetAgentConfig(): void {
  validatedConfig = null;
}

export default {
  getAgentConfig,
  overrideAgentConfig,
  resetAgentConfig,
  schemas: { AgentConfigSchema }
};