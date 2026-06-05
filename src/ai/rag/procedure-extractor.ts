/**
 * @fileOverview Extracteur d'étapes de procédures techniques
 * @version 3.1.0
 * @lastUpdated 2026-04-01
 * @description Version corrigée avec parsing réel des durées via chrono-node
 */

import { createRAGLogger } from './utils/logger';
import { StatsManager } from './utils/stats-manager';
import { z } from 'zod';

// ============================================================================
// PARSING DE DURÉES AVEC CHRONO-NODE (RÉEL)
// ============================================================================

let chrono: any = null;
let chronoInitialized = false;

async function initChrono(): Promise<void> {
  if (chronoInitialized) return;
  
  try {
    // Tentative d'import dynamique de chrono-node
    chrono = await import('chrono-node');
    chronoInitialized = true;
    logger.info('CHRONO', '✅ Chrono-node initialisé pour parsing des durées');
  } catch (error: any) {
    logger.warning('CHRONO', `⚠️ chrono-node non disponible: ${error.message}. Utilisation fallback regex.`);
    chronoInitialized = true;
  }
}

function parseDurationWithChrono(durationStr: string): number | undefined {
  if (!chrono) return undefined;
  
  try {
    // Extraire la durée en minutes
    const parsed = chrono.parse(durationStr);
    if (parsed && parsed.length > 0) {
      const startDate = parsed[0].start.date();
      const endDate = parsed[0].end?.date();
      
      if (endDate) {
        const diffMs = endDate.getTime() - startDate.getTime();
        return Math.round(diffMs / (1000 * 60));
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// Fallback regex améliorée pour les durées
function parseDurationWithRegex(durationStr: string): number | undefined {
  // Patterns étendus pour les durées
  const patterns = [
    { regex: /(\d+)\s*(?:min|minutes|minute|mn)/i, multiplier: 1 },
    { regex: /(\d+)\s*(?:secondes|seconde|sec|s)/i, multiplier: 1 / 60 },
    { regex: /(\d+)\s*(?:heures?|hours?|h)/i, multiplier: 60 },
    { regex: /(?:environ\s*)?(\d+)\s*(?:à|-)\s*(\d+)\s*(?:min|minutes)/i, multiplier: 1, isRange: true },
    { regex: /(\d+)[\s-]*(\d+)\s*min/i, multiplier: 1, isRange: true },
  ];
  
  for (const pattern of patterns) {
    const match = durationStr.match(pattern.regex);
    if (match) {
      if (pattern.isRange && match[2]) {
        const min = parseInt(match[1], 10);
        const max = parseInt(match[2], 10);
        return Math.round((min + max) / 2) * pattern.multiplier;
      }
      if (match[1]) {
        const value = parseInt(match[1], 10);
        return Math.round(value * pattern.multiplier);
      }
    }
  }
  
  return undefined;
}

function parseDurationToMinutes(durationStr: string): number | undefined {
  if (chrono) {
    const result = parseDurationWithChrono(durationStr);
    if (result !== undefined) return result;
  }
  return parseDurationWithRegex(durationStr);
}

// Initialisation asynchrone
initChrono().catch(console.error);

// ============================================================================
// INITIALISATION DES UTILITAIRES
// ============================================================================

const logger = createRAGLogger('[PROCEDURE-EXTRACTOR]', {
  maxDataLength: 200,
  enableStructured: process.env.NODE_ENV === 'production'
});

interface ExtractorStats {
  totalExtractions: number;
  totalStepsExtracted: number;
  avgStepsPerProcedure: number;
  avgProcessingTime: number;
  lastExtractionTime: number | null;
  lastExtractionDuration: number | null;
  jsonExtractions: number;
  textExtractions: number;
  fallbackExtractions: number;
  chronoSuccessCount: number;
  chronoFallbackCount: number;
  featuresDetected: {
    safetyNotes: number;
    verifications: number;
    durations: number;
    subSteps: number;
    prerequisites: number;
    outcomes: number;
  };
}

const statsManager = new StatsManager<ExtractorStats>({
  initial: {
    totalExtractions: 0,
    totalStepsExtracted: 0,
    avgStepsPerProcedure: 0,
    avgProcessingTime: 0,
    lastExtractionTime: null,
    lastExtractionDuration: null,
    jsonExtractions: 0,
    textExtractions: 0,
    fallbackExtractions: 0,
    chronoSuccessCount: 0,
    chronoFallbackCount: 0,
    featuresDetected: {
      safetyNotes: 0,
      verifications: 0,
      durations: 0,
      subSteps: 0,
      prerequisites: 0,
      outcomes: 0
    }
  },
  persistIntervalMs: 60000,
  onPersist: async (stats, timestamp) => {
    logger.structured('STATS_PERSIST', { 
      module: 'procedure-extractor', 
      stats, 
      timestamp: timestamp.toISOString() 
    });
  }
});

// ============================================================================
// SCHÉMAS DE VALIDATION ZOD
// ============================================================================

const StepSchema = z.object({
  number: z.number().min(1),
  description: z.string().min(1).max(2000),
  subSteps: z.array(z.string()).optional(),
  safetyNote: z.string().max(500).optional(),
  verification: z.string().max(500).optional(),
  expectedOutcome: z.string().max(500).optional(),
  duration: z.number().min(0).optional(),
  prerequisites: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional()
});

const ExtractionResultSchema = z.object({
  steps: z.array(StepSchema),
  totalSteps: z.number().min(0),
  hasSafetyNotes: z.boolean(),
  hasVerifications: z.boolean(),
  hasDurations: z.boolean(),
  hasSubSteps: z.boolean(),
  hasPrerequisites: z.boolean(),
  hasOutcomes: z.boolean(),
  processingTime: z.number().min(0),
  extractionMethod: z.enum(['json', 'text', 'fallback'])
});

export interface JsonStep {
  id?: string;
  title: string;
  type?: string;
  details?: string;
  steps?: JsonStep[];
  description?: string;
  safetyNote?: string;
  verification?: string;
  duration?: number;
}

const JsonProcedureSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  steps: z.array(z.any())
});

export type Step = z.infer<typeof StepSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type JsonProcedure = z.infer<typeof JsonProcedureSchema>;

// ============================================================================
// INTERFACES
// ============================================================================

export interface ExtractionOptions {
  maxSteps?: number;
  includeSafetyNotes?: boolean;
  includeVerifications?: boolean;
  includeDurations?: boolean;
  includeSubSteps?: boolean;
  preferJson?: boolean;
  enableCache?: boolean;
  cacheTTL?: number;
  maxDepth?: number;
}

export interface ValidationIssue {
  step: number;
  issue: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  score: number;
}

// ============================================================================
// CONFIGURATION DES PATTERNS
// ============================================================================

const STEP_PATTERNS: RegExp[] = [
  /(?:Étape|Etape|Step)\s+(\d+)[\s:\.\-]+\s*([^\n]+)/gi,
  /^\s*(\d+)\.\s+([^\n]+)/gm,
  /^\s*(\d+)\s*-\s+([^\n]+)/gm,
  /^\s*(\d+)\)\s+([^\n]+)/gm,
  /^\s*(\d+)\s+([A-Z][^\n]+)/gm,
  /^\s*(\d+\.\d+)\s+([^\n]+)/gm,
  /^\s*(\d+\.\d+\.\d+)\s+([^\n]+)/gm,
  /(?:Step|Étape)\s*#?(\d+)[\s:]*([^\n]+)/gi,
  /(?:\n|^|\s)(\d+)\.\s+([A-Z][^.\n]+[.!?])/g // Pattern plus flexible
];

const SAFETY_PATTERNS: RegExp[] = [
  /(?:⚠️|ATTENTION|SÉCURITÉ|PRÉCAUTION|DANGER|WARNING|CAUTION|IMPORTANT)[:\s]*([^.!?]+[.!?])/gi,
  /(?:Sécurité|Safety|Précaution|Precaution)[:\s]*([^.!?]+[.!?])/gi,
  /(?:Ne pas|Ne jamais|Toujours|Obligatoire)[:\s]*([^.!?]+[.!?])/gi,
  /(?:RISQUE|RISK)[:\s]*([^.!?]+[.!?])/gi,
  /(?:PROTECTION|PROTECTIVE|EPI)[:\s]*([^.!?]+[.!?])/gi,
  /(?:DANGER\s*:?)\s*([^.!?]+[.!?])/gi
];

const VERIFICATION_PATTERNS: RegExp[] = [
  /(?:Vérification|Verification|Check|Contrôle|Validation|Verify)[:\s]*([^.!?]+[.!?])/gi,
  /(?:✓|✔|✅)\s*([^.!?]+[.!?])/gi,
  /(?:À vérifier|À contrôler|À valider)[:\s]*([^.!?]+[.!?])/gi,
  /(?:Confirmer|S'assurer|Vérifier que)[:\s]*([^.!?]+[.!?])/gi,
  /(?:VÉRIFIER|CHECK|CONTROL)[:\s]*([^.!?]+[.!?])/gi,
  /(?:Contrôle\s*:?)\s*([^.!?]+[.!?])/gi
];

const OUTCOME_PATTERNS: RegExp[] = [
  /(?:Résultat attendu|Expected outcome|Attendu|Résultat|Result)[:\s]*([^.!?]+[.!?])/gi,
  /(?:→|=>|➜)\s*([^.!?]+[.!?])/gi,
  /(?:On doit obtenir|On doit avoir|Doit être)[:\s]*([^.!?]+[.!?])/gi,
  /(?:État final|Final state)[:\s]*([^.!?]+[.!?])/gi
];

const PREREQUISITE_PATTERNS: RegExp[] = [
  /(?:Prérequis|Prerequisite|Préparation nécessaire|Conditions requises)[:\s]*([^.!?]+[.!?])/gi,
  /(?:Avant de commencer|Before starting)[:\s]*([^.!?]+[.!?])/gi,
  /(?:Conditions préalables|Preconditions)[:\s]*([^.!?]+[.!?])/gi,
  /(?:Équipements requis|Required equipment)[:\s]*([^.!?]+[.!?])/gi,
  /(?:Matériel nécessaire|Tools needed)[:\s]*([^.!?]+[.!?])/gi
];

const SUBSTEP_PATTERNS: RegExp[] = [
  /[•\-*]\s*([^\n]+)/g,
  /○\s*([^\n]+)/g,
  /-\s*([^\n]+)/g,
  /\d+\.\d+\.?\s*([^\n]+)/g,
  /(?:a\.|b\.|c\.|d\.)\s*([^\n]+)/gi
];

// ============================================================================
// CACHE MÉMOIRE
// ============================================================================

interface ExtractionCacheEntry {
  result: Step[];
  timestamp: number;
  contentHash: string;
  ttl: number;
}

const extractionCache = new Map<string, ExtractionCacheEntry>();

function getContentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function getCacheKey(content: string, options: ExtractionOptions): string {
  const hash = getContentHash(content);
  return `${hash}:${JSON.stringify(options)}`;
}

function getCached(key: string): Step[] | null {
  const entry = extractionCache.get(key);
  if (!entry) return null;
  
  const age = Date.now() - entry.timestamp;
  if (age > entry.ttl * 1000) {
    extractionCache.delete(key);
    return null;
  }
  
  return entry.result;
}

function setCache(key: string, steps: Step[], ttl: number, contentHash: string): void {
  extractionCache.set(key, {
    result: steps,
    timestamp: Date.now(),
    contentHash,
    ttl
  });
  
  if (extractionCache.size > 500) {
    const entries = Array.from(extractionCache.entries());
    const oldest = entries.sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) extractionCache.delete(oldest[0]);
  }
}

function clearCache(): void {
  extractionCache.clear();
  logger.info('CACHE', 'Cache d\'extraction vidé');
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function normalizeContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sanitizeText(text: string): string {
  return text
    .replace(/^\s*[•\-*]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// EXTRACTEUR SPÉCIFIQUE POUR PROCÉDURES JSON AVEC LIMITE DE PROFONDEUR
// ============================================================================

function isJsonProcedure(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false;
  }
  
  try {
    const parsed = JSON.parse(trimmed);
    const data = Array.isArray(parsed) ? parsed[0] : parsed;
    return data && (data.steps || Array.isArray(data));
  } catch {
    return false;
  }
}

function flattenJsonSteps(
  jsonSteps: JsonStep[], 
  procedureName: string = '', 
  parentNumber: string = '',
  options: ExtractionOptions,
  depth: number = 0,
  maxDepth: number = 5
): Step[] {
  // Limite de profondeur pour éviter récursion infinie
  if (depth > maxDepth) {
    logger.warning('JSON', `Profondeur maximale atteinte (${maxDepth})`);
    return [];
  }
  
  const steps: Step[] = [];
  let stepCounter = 1;
  
  for (const jsonStep of jsonSteps) {
    const stepNumber = parentNumber ? `${parentNumber}.${stepCounter}` : `${stepCounter}`;
    
    let description = jsonStep.title;
    if (jsonStep.details) {
      description += `: ${jsonStep.details}`;
    }
    if (jsonStep.type) {
      description = `[${jsonStep.type.toUpperCase()}] ${description}`;
    }
    if (jsonStep.description) {
      description += ` - ${jsonStep.description}`;
    }
    
    const step: Step = {
      number: parseFloat(stepNumber),
      description: sanitizeText(description),
      subSteps: options.includeSubSteps !== false ? [] : undefined,
      safetyNote: options.includeSafetyNotes !== false ? jsonStep.safetyNote : undefined,
      verification: options.includeVerifications !== false ? jsonStep.verification : undefined,
      expectedOutcome: undefined,
      duration: options.includeDurations !== false ? jsonStep.duration : undefined
    };
    
    if (jsonStep.steps && jsonStep.steps.length > 0) {
      if (options.includeSubSteps !== false) {
        const subSteps = flattenJsonSteps(jsonStep.steps, procedureName, stepNumber, options, depth + 1, maxDepth);
        if (subSteps.length > 0) {
          step.subSteps = subSteps.map(s => s.description);
        }
      }
      steps.push(step);
    } else {
      steps.push(step);
    }
    
    stepCounter++;
  }
  
  return steps;
}

function extractStepsFromJson(content: string, options: ExtractionOptions): Step[] {
  const steps: Step[] = [];
  
  try {
    const parsed = JSON.parse(content);
    const procedures = Array.isArray(parsed) ? parsed : [parsed];
    
    logger.structured('JSON_PARSED', {
      proceduresCount: procedures.length,
      procedureNames: procedures.map((p: any) => p.name).filter(Boolean)
    });
    
    for (const proc of procedures) {
      if (proc.steps && Array.isArray(proc.steps)) {
        const extractedSteps = flattenJsonSteps(proc.steps, proc.name || 'Unknown', '', options, 0, options.maxDepth || 5);
        steps.push(...extractedSteps);
        logger.metric('JSON', `Procédure "${proc.name || 'Unknown'}"`, `${extractedSteps.length} étapes`);
      }
    }
    
    logger.success('JSON', `${steps.length} étapes extraites du format JSON`);
    
  } catch (error: any) {
    logger.warning('JSON', `Erreur parsing JSON: ${error.message}`);
  }
  
  return steps;
}

// ============================================================================
// FONCTIONS D'EXTRACTION SPÉCIFIQUES
// ============================================================================

function extractSubSteps(content: string, stepStartIndex: number, stepEndIndex: number): string[] {
  const subSteps: string[] = [];
  const start = Math.max(0, stepStartIndex);
  const end = Math.min(content.length, stepEndIndex + 500);
  const section = content.substring(start, end);
  
  for (const pattern of SUBSTEP_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(section)) !== null) {
      const subStep = sanitizeText(match[1]);
      if (subStep && !subStep.match(/^\d+[\.\)]/) && subStep.length > 5 && subStep.length < 500) {
        if (!subSteps.includes(subStep)) {
          subSteps.push(subStep);
        }
      }
    }
    if (subSteps.length > 0) break;
  }
  
  return subSteps;
}

function extractSafetyNote(content: string, stepNumber: number, stepStartIndex: number): string | undefined {
  const stepSpecificPattern = new RegExp(
    `(?:Étape\\s*${stepNumber}|${stepNumber}[\\.\\)])\\s*.*?(?:⚠️|ATTENTION|SÉCURITÉ|PRÉCAUTION|DANGER)[:\\s]*([^.!?]+[.!?])`,
    'i'
  );
  
  let match = stepSpecificPattern.exec(content);
  if (match && match[1]) {
    return sanitizeText(match[1]);
  }
  
  const start = Math.max(0, stepStartIndex - 200);
  const end = Math.min(content.length, stepStartIndex + 500);
  const context = content.substring(start, end);
  
  for (const pattern of SAFETY_PATTERNS) {
    pattern.lastIndex = 0;
    match = pattern.exec(context);
    if (match && match[1]) {
      return sanitizeText(match[1]);
    }
  }
  
  return undefined;
}

function extractVerification(content: string, stepNumber: number, stepStartIndex: number): string | undefined {
  const stepSpecificPattern = new RegExp(
    `(?:Étape\\s*${stepNumber}|${stepNumber}[\\.\\)])\\s*.*?(?:Vérification|Check|Contrôle|Vérifier)[:\\s]*([^.!?]+[.!?])`,
    'i'
  );
  
  let match = stepSpecificPattern.exec(content);
  if (match && match[1]) {
    return sanitizeText(match[1]);
  }
  
  const start = Math.max(0, stepStartIndex - 100);
  const end = Math.min(content.length, stepStartIndex + 400);
  const context = content.substring(start, end);
  
  for (const pattern of VERIFICATION_PATTERNS) {
    pattern.lastIndex = 0;
    match = pattern.exec(context);
    if (match && match[1]) {
      return sanitizeText(match[1]);
    }
  }
  
  return undefined;
}

function extractExpectedOutcome(content: string, _stepNumber: number, stepStartIndex: number): string | undefined {
  const start = Math.max(0, stepStartIndex - 50);
  const end = Math.min(content.length, stepStartIndex + 300);
  const context = content.substring(start, end);
  
  for (const pattern of OUTCOME_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(context);
    if (match && match[1]) {
      return sanitizeText(match[1]);
    }
  }
  
  return undefined;
}

function extractDuration(content: string, _stepNumber: number, stepStartIndex: number): number | undefined {
  const start = Math.max(0, stepStartIndex - 100);
  const end = Math.min(content.length, stepStartIndex + 300);
  const context = content.substring(start, end);
  
  // Utiliser le parsing réel avec chrono-node
  const result = parseDurationToMinutes(context);
  
  if (result !== undefined) {
    statsManager.increment('chronoSuccessCount');
    return result;
  }
  
  statsManager.increment('chronoFallbackCount');
  return undefined;
}

function extractPrerequisites(content: string): string[] {
  const prerequisites: string[] = [];
  
  for (const pattern of PREREQUISITE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const prereq = sanitizeText(match[1]);
      if (prereq && prereq.length > 5 && prereq.length < 500) {
        if (!prerequisites.includes(prereq)) {
          prerequisites.push(prereq);
        }
      }
    }
  }
  
  return prerequisites;
}

function extractWarnings(content: string, stepStartIndex: number): string[] {
  const warnings: string[] = [];
  const start = Math.max(0, stepStartIndex - 100);
  const end = Math.min(content.length, stepStartIndex + 300);
  const context = content.substring(start, end);
  
  const warningPatterns = [
    /(?:AVERTISSEMENT|WARNING)[:\s]*([^.!?]+[.!?])/gi,
    /(?:Attention\s*:?)\s*([^.!?]+[.!?])/gi,
    /(?:⚠️)\s*([^.!?]+[.!?])/gi
  ];
  
  for (const pattern of warningPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(context)) !== null) {
      const warning = sanitizeText(match[1]);
      if (warning && !warnings.includes(warning)) {
        warnings.push(warning);
      }
    }
  }
  
  return warnings;
}

// ============================================================================
// VALIDATION DES ÉTAPES
// ============================================================================

export function validateSteps(steps: Step[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  let score = 100;
  
  if (steps.length === 0) {
    issues.push({ step: 0, issue: 'Aucune étape détectée', severity: 'error' });
    return { valid: false, issues, score: 0 };
  }
  
  for (let i = 0; i < steps.length; i++) {
    const expectedNumber = i + 1;
    const step = steps[i];
    
    if (step.number !== expectedNumber) {
      issues.push({ 
        step: step.number, 
        issue: `Numéro d'étape incohérent: attendu ${expectedNumber}, trouvé ${step.number}`, 
        severity: 'warning' 
      });
      score -= 5;
    }
    
    if (!step.description || step.description.trim() === '') {
      issues.push({ step: step.number, issue: 'Description vide', severity: 'error' });
      score -= 10;
    } else if (step.description.length < 10) {
      issues.push({ step: step.number, issue: `Description trop courte (${step.description.length} caractères)`, severity: 'warning' });
      score -= 3;
    } else if (step.description.length > 1000) {
      issues.push({ step: step.number, issue: `Description trop longue (${step.description.length} caractères)`, severity: 'info' });
      score -= 1;
    }
    
    if (step.subSteps && step.subSteps.length > 0) {
      for (let j = 0; j < step.subSteps.length; j++) {
        if (step.subSteps[j].length < 5) {
          issues.push({ step: step.number, issue: `Sous-étape ${j + 1} trop courte`, severity: 'info' });
          score -= 1;
        }
      }
    }
  }
  
  const hasSafety = steps.some(s => s.safetyNote);
  const hasVerification = steps.some(s => s.verification);
  const hasDuration = steps.some(s => s.duration);
  const hasOutcome = steps.some(s => s.expectedOutcome);
  
  if (hasSafety) score = Math.min(score + 5, 100);
  if (hasVerification) score = Math.min(score + 5, 100);
  if (hasDuration) score = Math.min(score + 3, 100);
  if (hasOutcome) score = Math.min(score + 3, 100);
  
  const valid = issues.filter(i => i.severity === 'error').length === 0;
  
  if (!valid) {
    logger.warning('VALIDATE', `${issues.filter(i => i.severity === 'error').length} erreur(s) critique(s) détectée(s)`);
  } else {
    logger.success('VALIDATE', `Séquence d'étapes valide (${steps.length} étapes, score: ${score}/100)`);
  }
  
  return { valid, issues, score: Math.max(score, 0) };
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

export function extractStepsFromContent(
  content: string, 
  options: ExtractionOptions = {}
): Step[] {
  const startTime = Date.now();
  const config = {
    maxSteps: options.maxSteps ?? 100,
    includeSafetyNotes: options.includeSafetyNotes ?? true,
    includeVerifications: options.includeVerifications ?? true,
    includeDurations: options.includeDurations ?? true,
    includeSubSteps: options.includeSubSteps ?? true,
    preferJson: options.preferJson ?? true,
    enableCache: true,
    cacheTTL: 3600,
    maxDepth: options.maxDepth ?? 5
  };
  
  let steps: Step[] = [];
  let extractionMethod: 'json' | 'text' | 'fallback' = 'text';
  
  logger.structured('INPUT_CONTENT', {
    contentLength: content.length,
    isJson: content.trim().startsWith('{') || content.trim().startsWith('['),
    contentPreview: content.substring(0, 300)
  });
  
  logger.info('EXTRACT', `🔍 Extraction des étapes (${content.length} caractères)`);
  logger.metric('EXTRACT', 'Options', JSON.stringify(config).substring(0, 200));
  
  statsManager.increment('totalExtractions');
  statsManager.update({ lastExtractionTime: Date.now() });
  
  if (!content || content.length === 0) {
    logger.warning('EXTRACT', 'Contenu vide');
    statsManager.increment('fallbackExtractions');
    return [];
  }
  
  if (config.enableCache) {
    const cacheKey = getCacheKey(content, options);
    const cached = getCached(cacheKey);
    
    if (cached) {
      const elapsedTime = Date.now() - startTime;
      statsManager.average('avgProcessingTime', elapsedTime);
      logger.success('CACHE', `✅ Hit cache en ${formatDuration(elapsedTime)}`);
      logger.metric('RESULT', 'Étapes', cached.length);
      return cached;
    }
  }
  
  if (config.preferJson && isJsonProcedure(content)) {
    extractionMethod = 'json';
    logger.info('EXTRACT', '📋 Format JSON détecté, utilisation de l\'extracteur JSON');
    
    const jsonSteps = extractStepsFromJson(content, config);
    if (jsonSteps.length > 0) {
      steps = jsonSteps;
      statsManager.increment('jsonExtractions');
      logger.success('EXTRACT', `✅ ${steps.length} étapes extraites du JSON`);
    }
  }
  
  if (steps.length === 0) {
    extractionMethod = 'text';
    const normalizedContent = normalizeContent(content);
    
    const stepMap = new Map<number, Step>();
    const prerequisites = config.includeSafetyNotes !== false ? extractPrerequisites(normalizedContent) : [];
    
    if (prerequisites.length > 0) {
      logger.metric('EXTRACT', 'Prérequis détectés', prerequisites.length);
      statsManager.update({ 
        featuresDetected: { 
          ...statsManager.get().featuresDetected, 
          prerequisites: statsManager.get().featuresDetected.prerequisites + 1 
        } 
      });
    }
    
    for (const pattern of STEP_PATTERNS) {
      pattern.lastIndex = 0;
      const matches: Array<{ number: number; description: string; fullMatch: string; index: number }> = [];
      
      let match;
      while ((match = pattern.exec(normalizedContent)) !== null) {
        let stepNumber: number;
        const rawStepNumber = match[1];
        
        if (!rawStepNumber || typeof rawStepNumber !== 'string') {
          continue;
        }
        
        if (rawStepNumber.includes('.')) {
          stepNumber = parseFloat(rawStepNumber);
        } else {
          stepNumber = parseInt(rawStepNumber, 10);
        }
        
        if (isNaN(stepNumber)) {
          continue;
        }
        
        const description = match[2]?.trim() || '';
        if (!description) continue;
        
        const cleanDescription = sanitizeText(description);
        
        if (cleanDescription.length > 5 && cleanDescription.length < 2000) {
          matches.push({
            number: stepNumber,
            description: cleanDescription,
            fullMatch: match[0],
            index: match.index
          });
        }
      }
      
      if (matches.length > 0) {
        logger.metric('EXTRACT', `Pattern trouvé (${pattern.source.substring(0, 30)}...)`, `${matches.length} étapes`);
        
        for (const m of matches) {
          if (stepMap.has(m.number)) continue;
          
          let stepEndIndex = normalizedContent.length;
          const nextStep = matches.find(s => s.number > m.number);
          if (nextStep) {
            stepEndIndex = nextStep.index;
          }
          
          const subSteps = config.includeSubSteps !== false ? extractSubSteps(normalizedContent, m.index, stepEndIndex) : [];
          const safetyNote = config.includeSafetyNotes !== false ? extractSafetyNote(normalizedContent, m.number, m.index) : undefined;
          const verification = config.includeVerifications !== false ? extractVerification(normalizedContent, m.number, m.index) : undefined;
          const expectedOutcome = extractExpectedOutcome(normalizedContent, m.number, m.index);
          const duration = config.includeDurations !== false ? extractDuration(normalizedContent, m.number, m.index) : undefined;
          const warnings = extractWarnings(normalizedContent, m.index);
          
          stepMap.set(m.number, {
            number: m.number,
            description: m.description,
            subSteps: subSteps.length > 0 ? subSteps : undefined,
            safetyNote,
            verification,
            expectedOutcome,
            duration,
            prerequisites: prerequisites.length > 0 ? prerequisites : undefined,
            warnings: warnings.length > 0 ? warnings : undefined
          });
          
          const features = statsManager.get().featuresDetected;
          if (subSteps.length > 0) features.subSteps++;
          if (safetyNote) features.safetyNotes++;
          if (verification) features.verifications++;
          if (duration) features.durations++;
          if (expectedOutcome) features.outcomes++;
        }
        
        if (stepMap.size > 0) {
          break;
        }
      }
    }
    
    steps = Array.from(stepMap.values());
    steps.sort((a, b) => a.number - b.number);
    
    if (steps.length > 0) {
      const maxNumber = Math.max(...steps.map(s => s.number));
      const expectedCount = Math.floor(maxNumber);
      
      if (steps.length < expectedCount * 0.8) {
        logger.warning('EXTRACT', `Trous détectés: ${steps.length}/${expectedCount} étapes trouvées`);
        for (let i = 0; i < steps.length; i++) {
          const expectedNum = i + 1;
          if (steps[i].number !== expectedNum) {
            logger.metric('EXTRACT', `Réindexation étape ${steps[i].number} → ${expectedNum}`, {});
            steps[i].number = expectedNum;
          }
        }
      }
    }
    
    if (steps.length > config.maxSteps) {
      logger.warning('EXTRACT', `Limitation à ${config.maxSteps} étapes (trouvé: ${steps.length})`);
      steps = steps.slice(0, config.maxSteps);
    }
    
    statsManager.increment('textExtractions');
  }
  
  if (steps.length === 0) {
    extractionMethod = 'fallback';
    statsManager.increment('fallbackExtractions');
    
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 20);
    
    if (paragraphs.length > 0 && paragraphs.length <= 50) {
      logger.info('EXTRACT', `Fallback: utilisation des ${paragraphs.length} paragraphes comme étapes`);
      
      for (let i = 0; i < paragraphs.length && i < config.maxSteps; i++) {
        const para = sanitizeText(paragraphs[i]);
        if (para.length > 20 && para.length < 1000) {
          steps.push({
            number: i + 1,
            description: para.substring(0, 1000),
            subSteps: undefined,
            safetyNote: undefined,
            verification: undefined,
            expectedOutcome: undefined,
            duration: undefined
          });
        }
      }
      
      if (steps.length > 0) {
        logger.success('EXTRACT', `✅ ${steps.length} étapes extraites via fallback`);
      }
    }
  }
  
  const elapsedTime = Date.now() - startTime;
  
  statsManager.average('avgProcessingTime', elapsedTime);
  statsManager.average('avgStepsPerProcedure', steps.length);
  statsManager.update({ lastExtractionDuration: elapsedTime });
  
  const validation = validateSteps(steps);
  
  if (steps.length > 0) {
    logger.success('EXTRACT', `✅ ${steps.length} étapes extraites en ${formatDuration(elapsedTime)} (méthode: ${extractionMethod})`);
    logger.metric('EXTRACT', 'Plage étapes', `${steps[0].number} → ${steps[steps.length - 1].number}`);
    logger.metric('EXTRACT', 'Score validation', `${validation.score}/100`);
    logger.metric('EXTRACT', 'Notes sécurité', steps.some(s => s.safetyNote) ? '✅' : '❌');
    logger.metric('EXTRACT', 'Vérifications', steps.some(s => s.verification) ? '✅' : '❌');
    logger.metric('EXTRACT', 'Durées (chrono)', steps.some(s => s.duration) ? '✅' : '❌');
    logger.metric('EXTRACT', 'Sous-étapes', steps.some(s => s.subSteps?.length) ? '✅' : '❌');
    
    const displayCount = Math.min(5, steps.length);
    for (let i = 0; i < displayCount; i++) {
      const step = steps[i];
      const preview = step.description.length > 60 ? step.description.substring(0, 60) + '...' : step.description;
      logger.info('STEPS', `Étape ${step.number}: ${preview}`);
    }
    if (steps.length > displayCount) {
      logger.metric('STEPS', 'Etc.', `${steps.length - displayCount} étapes supplémentaires`);
    }
  } else {
    logger.warning('EXTRACT', `Aucune étape détectée en ${formatDuration(elapsedTime)}`);
  }
  
  logger.structured('EXTRACT_RESULT', {
    stepsCount: steps.length,
    extractionMethod,
    processingTimeMs: elapsedTime,
    validationScore: validation.score,
    issues: validation.issues.length,
    chronoSuccess: statsManager.get().chronoSuccessCount,
    chronoFallback: statsManager.get().chronoFallbackCount,
    steps: steps.slice(0, 10).map(s => ({
      number: s.number,
      description: s.description.substring(0, 300),
      hasSubSteps: !!(s.subSteps?.length),
      hasSafetyNote: !!s.safetyNote,
      hasVerification: !!s.verification,
      hasDuration: !!s.duration
    }))
  });
  
  if (config.enableCache && steps.length > 0) {
    const cacheKey = getCacheKey(content, options);
    const contentHash = getContentHash(content);
    setCache(cacheKey, steps, config.cacheTTL, contentHash);
  }
  
  return steps;
}

// ============================================================================
// FONCTIONS UTILITAIRES AVANCÉES
// ============================================================================

export function formatStepsForDisplay(steps: Step[], format: 'text' | 'markdown' | 'html' = 'markdown'): string {
  if (!steps || steps.length === 0) return '';
  
  let output = '';
  
  for (const step of steps) {
    if (format === 'markdown') {
      output += `\n### ${step.number}. ${step.description}\n`;
      
      if (step.duration) {
        output += `⏱️ **Durée**: ${step.duration} min\n`;
      }
      
      if (step.prerequisites && step.prerequisites.length > 0 && step.number === 1) {
        output += `\n📋 **Prérequis**:\n`;
        for (const prereq of step.prerequisites) {
          output += `- ${prereq}\n`;
        }
      }
      
      if (step.subSteps && step.subSteps.length > 0) {
        output += `\n**Sous-étapes**:\n`;
        for (const sub of step.subSteps) {
          output += `- ${sub}\n`;
        }
      }
      
      if (step.safetyNote) {
        output += `\n⚠️ **Sécurité**: ${step.safetyNote}\n`;
      }
      
      if (step.warnings && step.warnings.length > 0) {
        output += `\n**Avertissements**:\n`;
        for (const warning of step.warnings) {
          output += `- ${warning}\n`;
        }
      }
      
      if (step.verification) {
        output += `\n✓ **Vérification**: ${step.verification}\n`;
      }
      
      if (step.expectedOutcome) {
        output += `\n→ **Résultat attendu**: ${step.expectedOutcome}\n`;
      }
    } else if (format === 'text') {
      output += `\n${step.number}. ${step.description}`;
      if (step.duration) output += ` (${step.duration} min)`;
      if (step.safetyNote) output += ` [⚠️ ${step.safetyNote}]`;
      if (step.verification) output += ` [✓ ${step.verification}]`;
      output += '\n';
    } else if (format === 'html') {
      output += `<div class="procedure-step" data-step="${step.number}">`;
      output += `<h3>${step.number}. ${step.description}</h3>`;
      if (step.duration) output += `<p class="duration">⏱️ ${step.duration} min</p>`;
      if (step.safetyNote) output += `<p class="safety">⚠️ ${step.safetyNote}</p>`;
      if (step.verification) output += `<p class="verification">✓ ${step.verification}</p>`;
      output += `</div>`;
    }
  }
  
  return output.trim();
}

export function calculateTotalDuration(steps: Step[]): number | undefined {
  let total = 0;
  let hasDurations = false;
  
  for (const step of steps) {
    if (step.duration) {
      total += step.duration;
      hasDurations = true;
    }
  }
  
  if (hasDurations) {
    logger.metric('DURATION', `Durée totale estimée`, `${total} minutes`);
    return total;
  }
  
  return undefined;
}

export function extractSafetyNotes(steps: Step[]): string[] {
  return steps
    .filter(s => s.safetyNote)
    .map(s => s.safetyNote!)
    .filter((note, index, self) => self.indexOf(note) === index);
}

export function extractVerifications(steps: Step[]): string[] {
  return steps
    .filter(s => s.verification)
    .map(s => s.verification!)
    .filter((v, index, self) => self.indexOf(v) === index);
}

export function compareExtractions(steps1: Step[], steps2: Step[]): {
  added: Step[];
  removed: Step[];
  modified: Array<{ old: Step; new: Step }>;
  unchanged: number;
} {
  const map1 = new Map(steps1.map(s => [s.number, s]));
  const map2 = new Map(steps2.map(s => [s.number, s]));
  
  const added: Step[] = [];
  const removed: Step[] = [];
  const modified: Array<{ old: Step; new: Step }> = [];
  let unchanged = 0;
  
  for (const [num, step2] of map2) {
    const step1 = map1.get(num);
    if (!step1) {
      added.push(step2);
    } else if (step1.description !== step2.description) {
      modified.push({ old: step1, new: step2 });
    } else {
      unchanged++;
    }
  }
  
  for (const [num, step1] of map1) {
    if (!map2.has(num)) {
      removed.push(step1);
    }
  }
  
  logger.info('COMPARE', `Comparaison: +${added.length} -${removed.length} ~${modified.length} =${unchanged}`);
  
  return { added, removed, modified, unchanged };
}

// ============================================================================
// STATISTIQUES
// ============================================================================

export function getExtractorStats(): Readonly<ExtractorStats> {
  return statsManager.get();
}

export function getExtractorSnapshot(): {
  stats: Readonly<ExtractorStats>;
  metadata: { createdAt: Date; updatedAt: Date };
} {
  return statsManager.getSnapshot();
}

export function getChronoSuccessRate(): number {
  const stats = statsManager.get();
  const total = stats.chronoSuccessCount + stats.chronoFallbackCount;
  return total > 0 ? stats.chronoSuccessCount / total : 0;
}

export function resetExtractorStats(): void {
  statsManager.reset();
  logger.success('STATS', 'Statistiques de l\'extracteur réinitialisées');
}

export async function persistExtractorStats(): Promise<void> {
  await statsManager.persist();
  logger.success('STATS', 'Statistiques persistées manuellement');
}

export function disposeExtractorStats(): void {
  statsManager.dispose();
  logger.info('STATS', 'Gestionnaire de statistiques disposé');
}

export function clearExtractionCache(): void {
  clearCache();
}

export function getCacheSize(): number {
  return extractionCache.size;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  extractStepsFromContent,
  formatStepsForDisplay,
  validateSteps,
  calculateTotalDuration,
  extractSafetyNotes,
  extractVerifications,
  compareExtractions,
  getExtractorStats,
  getExtractorSnapshot,
  getChronoSuccessRate,
  resetExtractorStats,
  persistExtractorStats,
  disposeExtractorStats,
  clearExtractionCache,
  getCacheSize,
  schemas: {
    StepSchema,
    ExtractionResultSchema,
    JsonProcedureSchema
  }
};