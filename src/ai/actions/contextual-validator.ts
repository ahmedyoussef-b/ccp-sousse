/**
 * @fileOverview ContextualValidator - Innovation 21.
 * Validation de la sécurité et de la pertinence des actions avant exécution.
 * 
 * @version 5.0.0
 * @author Équipe Agentic
 * @copyright 2026
 * @changes Migration vers Core SQLite - Infrastructure unifiée
 */

import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { callOllama } from '@/ai/providers/ollama-client';
import { sequenceValidator } from '../validation/sequence-validator';
import { Step } from './hierarchical-planner';
import { aiEventBus } from './event-bus';
import { SQLiteCore } from '@/ai/core/sqlite';

// ============================================================================
// CONFIGURATION DU LOGGER STRUCTURÉ
// ============================================================================

const validatorLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.json(),
    format.printf(({ timestamp, level, message, module, actionId, severity, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        module: 'ContextualValidator',
        actionId,
        severity,
        message,
        ...meta
      });
    })
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, actionId, severity, ...meta }) => {
          const prefix = `[${timestamp}] ${level}`;
          const action = actionId ? `[action:${actionId}]` : '';
          const sev = severity ? `[${severity}]` : '';
          return `${prefix} ${action} ${sev} ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    }),
    new DailyRotateFile({
      filename: 'logs/validator-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: format.json()
    })
  ]
});

// ============================================================================
// TYPES ET INTERFACES
// ============================================================================

export interface Action {
  type: 'respond' | 'use_tool' | 'command' | 'delete' | 'plan' | 'PLANIFICATION';
  tool?: string;
  params?: any;
  command?: string;
  backup?: boolean;
  id?: string;
  timestamp?: number;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  severity: 'low' | 'medium' | 'high';
  suggestedAlternative?: Action;
  validationTime?: number;
  validationMethod?: 'basic' | 'llm' | 'fallback';
}

export interface ValidationMetrics {
  totalValidations: number;
  validActions: number;
  invalidActions: number;
  bySeverity: {
    low: number;
    medium: number;
    high: number;
  };
  byType: Record<string, number>;
  averageValidationTime: number;
  lastHourValidations: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const DANGEROUS_COMMANDS = ['rm -rf', 'format', 'mkfs', 'dd', ':(){ :|:& };:', 'chmod 777', 'sudo rm'];
const ALLOWED_TOOLS = ['search', 'read', 'write', 'calculate', 'analyze'];
const MAX_CONTEXT_LENGTH = 500;
const VALIDATION_TIMEOUT = 5000;
const CACHE_NAMESPACE = 'validation';
const CACHE_TTL_SECONDS = 300; // 5 minutes

// ============================================================================
// INITIALISATION CORE SQLITE
// ============================================================================

const db = SQLiteCore.getInstance();
// Initialisation asynchrone - sera appelée au premier usage
let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await db.initialize();
    initialized = true;
  }
}

// Métriques en mémoire
let metrics: ValidationMetrics = {
  totalValidations: 0,
  validActions: 0,
  invalidActions: 0,
  bySeverity: { low: 0, medium: 0, high: 0 },
  byType: {},
  averageValidationTime: 0,
  lastHourValidations: 0
};

let lastMetricsReset = Date.now();

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function generateActionId(action: Action): string {
  return `${action.type || action.tool || 'unknown'}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}

function updateMetrics(result: ValidationResult, actionType: string, validationTime: number): void {
  metrics.totalValidations++;
  
  if (result.valid) {
    metrics.validActions++;
  } else {
    metrics.invalidActions++;
  }
  
  metrics.bySeverity[result.severity]++;
  metrics.byType[actionType] = (metrics.byType[actionType] || 0) + 1;
  
  metrics.averageValidationTime = 
    (metrics.averageValidationTime * (metrics.totalValidations - 1) + validationTime) / metrics.totalValidations;
  
  const now = Date.now();
  if (now - lastMetricsReset > 3600000) {
    metrics.lastHourValidations = 0;
    lastMetricsReset = now;
  }
  metrics.lastHourValidations++;
  
  // Persister la métrique via Core SQLite
  db.recordMetric('validator', 'validation', result.valid ? 1 : 0).catch((err: Error) => 
    validatorLogger.warn('Erreur persistance métrique', { error: err.message })
  );
}

// ============================================================================
// FONCTIONS PRINCIPALES
// ============================================================================

export async function validateAction(
  action: Action, 
  context: string,
  options?: { 
    skipCache?: boolean;
    timeout?: number;
    strict?: boolean;
    lookaheadActions?: Step[];
  }
): Promise<ValidationResult> {
  await ensureInitialized();
  
  const startTime = Date.now();
  const actionId = action.id || generateActionId(action);
  const actionType = action.type || action.tool || 'unknown';
  
  validatorLogger.info('Début de validation', {
    actionId,
    actionType,
    action,
    contextLength: context.length,
    options
  });
  
  // Vérification du cache SQLite via Core
  const cacheKey = `${JSON.stringify(action)}-${context.substring(0, 100)}`;
  if (!options?.skipCache) {
    const cached = db.get<ValidationResult>(CACHE_NAMESPACE, cacheKey);
    if (cached) {
      validatorLogger.debug('Validation récupérée du cache', {
        actionId,
        valid: cached.valid,
        severity: cached.severity
      });
      return { ...cached, validationTime: Date.now() - startTime };
    }
  }
  
  let result: ValidationResult = { valid: false, severity: 'low', reason: 'Initialisation' };
  let validationMethod: 'basic' | 'llm' | 'fallback' = 'basic';
  
  try {
    // 1. Vérifications de base
    const basicCheck = checkBasicSafety(action, actionId);
    
    if (!basicCheck.valid) {
      validatorLogger.warn('Échec des vérifications de base', {
        actionId,
        reason: basicCheck.reason,
        severity: basicCheck.severity
      });
      result = basicCheck;
    } else {
      // 2. Vérification de pertinence contextuelle via LLM
      if (context.length > 100) {
        try {
          const llmResult = await validateWithLLM(action, context, actionId, options?.timeout);
          result = llmResult;
          validationMethod = 'llm';
          
          validatorLogger.info('Validation LLM terminée', {
            actionId,
            valid: result.valid,
            severity: result.severity,
            reason: result.reason
          });
        } catch (llmError) {
          validatorLogger.warn('Échec de la validation LLM, repli sur sécurité de base', {
            actionId,
            error: llmError instanceof Error ? llmError.message : 'Unknown error'
          });
          result = { valid: true, severity: 'low' };
          validationMethod = 'fallback';
        }
      } else {
        // Contexte trop court, validation basique suffit
        result = { valid: true, severity: 'low' };
        validationMethod = 'basic';
      }

      // 🔍 INNOVATION : Validation de Séquence (Lookahead)
      if (options?.lookaheadActions && options.lookaheadActions.length > 0) {
        validatorLogger.info('Validation de séquence détectée (Lookahead)', { 
          actionId, 
          lookaheadCount: options.lookaheadActions.length 
        });
        
        const currentStep: Step = {
          id: actionId,
          description: action.command || action.tool || action.type,
          subSteps: [],
          status: 'pending',
          type: 'atomic'
        };
        const sequence = [currentStep, ...options.lookaheadActions];
        const sequenceViolations = sequenceValidator.validateSequence(sequence);

        if (sequenceViolations.length > 0) {
          const violation = sequenceViolations[0];
          validatorLogger.warn('Violation de séquence détectée', { actionId, violation });
          result = {
            valid: false,
            reason: `SÉQUENCE DANGEREUSE : ${violation.message}`,
            severity: violation.severity as any
          };
          validationMethod = 'basic';
        }
      }
    }
    
    result.validationMethod = validationMethod;
    result.validationTime = Date.now() - startTime;
    
    // Sauvegarder dans le cache SQLite via Core
    if (!options?.skipCache && result.valid) {
      db.set(CACHE_NAMESPACE, cacheKey, result, CACHE_TTL_SECONDS);
    }
    
    updateMetrics(result, actionType, result.validationTime);
    
    validatorLogger.info('Validation terminée', {
      actionId,
      valid: result.valid,
      severity: result.severity,
      reason: result.reason,
      validationTime: result.validationTime,
      method: validationMethod
    });
    
    if (!result.valid && (result.severity === 'high' || result.severity === 'medium')) {
      aiEventBus.emitAction({
        id: actionId,
        module: 'Validator',
        type: 'ACTION_BLOCKED',
        status: 'blocked',
        message: `Sécurité : Action bloquée (${result.severity}) : ${result.reason}`,
        timestamp: Date.now(),
        data: { action, reason: result.reason, severity: result.severity }
      });
    }

    return result;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    validatorLogger.error('Erreur lors de la validation', {
      actionId,
      error: errorMessage,
      duration: Date.now() - startTime
    });
    
    return {
      valid: true,
      reason: `Erreur de validation: ${errorMessage}. Action autorisée par sécurité.`,
      severity: 'medium',
      validationTime: Date.now() - startTime,
      validationMethod: 'fallback'
    };
  }
}

/**
 * Validation via LLM avec timeout - UNIFIÉ via ollama-client
 */
async function validateWithLLM(
  action: Action,
  context: string,
  actionId: string,
  timeout: number = VALIDATION_TIMEOUT
): Promise<ValidationResult> {
  const startTime = Date.now();
  
  validatorLogger.debug('Appel LLM pour validation', { actionId, timeout });
  
  const prompt = `Tu es un Contrôleur de Sécurité IA. Évalue si l'action proposée est sûre et pertinente.
    Règles de sécurité absolues:
    - Aucune action destructive sans confirmation
    - Protection des données sensibles
    - Respect des procédures opérationnelles
    
    Action proposée: ${JSON.stringify(action)}
    Contexte actuel: ${context.substring(0, MAX_CONTEXT_LENGTH)}
    
    Cette action est-elle pertinente et sans risque majeur (sécurité, perte de données) ?
    Réponds UNIQUEMENT en JSON STRICT: { "valid": boolean, "reason": "explication concise", "severity": "low|medium|high" }`;

  try {
    const response = await callOllama(prompt, {
      timeout,
      temperature: 0.1,
      maxTokens: 200
    });
    
    validatorLogger.debug('Réponse LLM reçue', {
      actionId,
      responseLength: response.length,
      duration: Date.now() - startTime
    });
    
    const match = response.match(/\{.*\}/s);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return {
          valid: parsed.valid === true,
          reason: parsed.reason || 'Validation LLM',
          severity: parsed.severity || 'low'
        };
      } catch (parseError) {
        validatorLogger.error('Erreur parsing JSON LLM', {
          actionId,
          error: parseError instanceof Error ? parseError.message : 'Unknown',
          responseText: response.substring(0, 200)
        });
        throw new Error('Invalid JSON response from LLM');
      }
    }
    
    throw new Error('No JSON found in LLM response');
    
  } catch (error) {
    validatorLogger.error('Erreur appel LLM', {
      actionId,
      error: error instanceof Error ? error.message : 'Unknown'
    });
    throw error;
  }
}

/**
 * Vérification des règles de sécurité de base
 */
function checkBasicSafety(action: Action, actionId?: string): ValidationResult {
  const type = action.type?.toLowerCase() || '';
  const tool = action.tool?.toLowerCase() || '';
  const command = action.command?.toLowerCase() || '';
  
  // Règle 1: Pas de suppression sans backup
  if (type === 'delete' || tool.includes('delete') || (type === 'command' && command.includes('delete'))) {
    if (!action.backup) {
      validatorLogger.warn('Suppression sans backup détectée', { actionId });
      return {
        valid: false,
        reason: "Action de suppression refusée : Aucun backup détecté dans les paramètres.",
        severity: 'high'
      };
    }
  }
  
  // Règle 2: Commandes système dangereuses
  if (action.command) {
    const foundDangerous = DANGEROUS_COMMANDS.find(dangerous => 
      command.includes(dangerous) || dangerous.includes(command)
    );
    
    if (foundDangerous) {
      validatorLogger.warn('Commande dangereuse détectée', { actionId, command, matchedPattern: foundDangerous });
      return {
        valid: false,
        reason: `Commande système interdite détectée: ${foundDangerous} (risque de destruction).`,
        severity: 'high'
      };
    }
  }
  
  // Règle 3: Vérification des outils autorisés
  if (action.tool && !ALLOWED_TOOLS.includes(tool) && type === 'use_tool') {
    validatorLogger.warn('Outil non autorisé', { actionId, tool });
    return {
      valid: false,
      reason: `Outil "${tool}" non autorisé. Outils autorisés: ${ALLOWED_TOOLS.join(', ')}`,
      severity: 'medium'
    };
  }
  
  return { valid: true, severity: 'low' };
}

/**
 * Propose une alternative plus sûre si l'action est rejetée.
 */
export async function suggestAlternative(
  action: Action, 
  reason: string,
  options?: { timeout?: number }
): Promise<Action | null> {
  const startTime = Date.now();
  const actionId = action.id || generateActionId(action);
  
  validatorLogger.info('Recherche d\'alternative', { actionId, actionType: action.type || action.tool, reason });
  
  try {
    const timeout = options?.timeout || VALIDATION_TIMEOUT;
    
    const prompt = `Tu es un conseiller en sécurité technique. Propose une alternative sûre et constructive.
    
    Action refusée: ${JSON.stringify(action)}
    Raison du refus: ${reason}
    
    Propose une alternative qui respecte les règles de sécurité tout en atteignant l'objectif.
    Réponds UNIQUEMENT en JSON: { "type": "respond", "params": { "suggestion": "alternative concrète" } }`;

    const response = await callOllama(prompt, {
      model: 'tinyllama:latest',
      timeout,
      temperature: 0.3,
      maxTokens: 150
    });
    
    const match = response.match(/\{.*\}/s);
    if (match) {
      const alternative = JSON.parse(match[0]);
      validatorLogger.info('Alternative proposée', { actionId, alternative, duration: Date.now() - startTime });
      return alternative;
    }
    
    validatorLogger.warn('Aucune alternative trouvée', { actionId });
    return null;
    
  } catch (error) {
    validatorLogger.error('Erreur lors de la suggestion d\'alternative', {
      actionId,
      error: error instanceof Error ? error.message : 'Unknown'
    });
    return null;
  }
}

export function getValidationMetrics(): ValidationMetrics {
  return { ...metrics };
}

export function resetValidationMetrics(): void {
  validatorLogger.info('Réinitialisation des métriques');
  metrics = {
    totalValidations: 0,
    validActions: 0,
    invalidActions: 0,
    bySeverity: { low: 0, medium: 0, high: 0 },
    byType: {},
    averageValidationTime: 0,
    lastHourValidations: 0
  };
  lastMetricsReset = Date.now();
}

export async function clearValidationCache(): Promise<void> {
  await ensureInitialized();
  const count = db.clearNamespace(CACHE_NAMESPACE);
  validatorLogger.info('Cache de validation nettoyé', { clearedCount: count });
}

// ============================================================================
// NETTOYAGE PÉRIODIQUE (géré par Core SQLite)
// ============================================================================

// Le Core SQLite gère déjà le nettoyage automatique des caches expirés

// ============================================================================
// EXPORT POUR TESTING
// ============================================================================

export const __testables__ = {
  checkBasicSafety,
  validateWithLLM,
  updateMetrics,
  DANGEROUS_COMMANDS,
  ALLOWED_TOOLS,
  MAX_CONTEXT_LENGTH,
  CACHE_NAMESPACE,
  ensureInitialized
};

// ============================================================================
// GESTION DES SIGNAUX
// ============================================================================

if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    validatorLogger.info('Signal SIGTERM reçu, fermeture propre');
  });
  process.on('SIGINT', () => {
    validatorLogger.info('Signal SIGINT reçu, fermeture propre');
  });
}