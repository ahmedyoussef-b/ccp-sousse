//src/ai/flows/procedure-help-flow.ts
/**
 * @fileOverview Flux d'aide contextuelle pour les procédures techniques.
 * @version 3.0.0
 */

import { callOllama } from '@/ai/providers/ollama-client';
import { selectModel } from '@/ai/config/models.config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
class SimpleLogger {
  private level: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  private logToConsole = true;
  private shouldLog(level: LogLevel): boolean { const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }; return levels[level] >= levels[this.level]; }
  private format(level: LogLevel, module: string, message: string, meta?: Record<string, any>): string { const timestamp = new Date().toISOString(); const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''; return `[${timestamp}] ${level.toUpperCase()} [${module}] ${message}${metaStr}`; }
  debug(message: string, meta?: Record<string, any>): void { if (this.shouldLog('debug') && this.logToConsole) console.log(`\x1b[36m${this.format('debug', 'ProcedureHelp', message, meta)}\x1b[0m`); }
  info(message: string, meta?: Record<string, any>): void { if (this.shouldLog('info') && this.logToConsole) console.log(`\x1b[32m${this.format('info', 'ProcedureHelp', message, meta)}\x1b[0m`); }
  warn(message: string, meta?: Record<string, any>): void { if (this.shouldLog('warn') && this.logToConsole) console.log(`\x1b[33m${this.format('warn', 'ProcedureHelp', message, meta)}\x1b[0m`); }
  error(message: string, meta?: Record<string, any>): void { if (this.shouldLog('error') && this.logToConsole) console.log(`\x1b[31m${this.format('error', 'ProcedureHelp', message, meta)}\x1b[0m`); }
}
const logger = new SimpleLogger();

export interface ProcedureHelpInput { userName?: string; stepTitle: string; instruction: string; problem: string; expectedValue: string; equipment?: string; severity?: 'low' | 'medium' | 'high' | 'critical'; model?: 'phi:2.7b' | 'tinyllama:latest' | 'gemma:2b' | 'phi:2.7b'; temperature?: number; }
export interface ProcedureHelpOutput { advice: string; safetyReminder?: string; technicalChecklist?: string[]; estimatedResolutionTime?: number; escalationRequired?: boolean; alternativeSteps?: string[]; generatedAt?: string; modelUsed?: string; processingTime?: number; }

function detectSafetyRisks(problem: string, severity: string): string[] {
  const risks: string[] = [];
  const problemLower = problem.toLowerCase();
  if (problemLower.includes('pression') || problemLower.includes('pressure')) risks.push('⚠️ Risque de surpression - Vérifier les soupapes de sécurité');
  if (problemLower.includes('temperature') || problemLower.includes('température')) risks.push('🌡️ Risque thermique - Utiliser des équipements de protection adaptés');
  if (problemLower.includes('electrique') || problemLower.includes('électrique') || problemLower.includes('voltage')) risks.push('⚡ Risque électrique - Couper l\'alimentation avant intervention');
  if (problemLower.includes('rotation') || problemLower.includes('moteur')) risks.push('🔄 Risque mécanique - Vérifier l\'arrêt complet avant intervention');
  if (severity === 'critical') risks.push('🔴 SITUATION CRITIQUE - Alerter immédiatement le chef de quart');
  else if (severity === 'high') risks.push('🟠 Intervention urgente - Préparer l\'arrêt d\'urgence si nécessaire');
  return risks;
}

function generateTechnicalChecklist(equipment: string | undefined, problem: string): string[] {
  const checklist: string[] = [];
  const problemLower = problem.toLowerCase();
  checklist.push('✓ Vérifier les instruments de mesure');
  checklist.push('✓ Consulter les logs de l\'équipement');
  if (equipment) checklist.push(`✓ Localiser l'équipement ${equipment} sur le schéma`);
  if (problemLower.includes('valeur') || problemLower.includes('paramètre')) { checklist.push('✓ Comparer avec les valeurs nominales du manuel technique'); checklist.push('✓ Vérifier la cohérence avec les mesures précédentes'); }
  if (problemLower.includes('alarme') || problemLower.includes('warning')) { checklist.push('✓ Confirmer l\'alarme sur le système SCADA'); checklist.push('✓ Vérifier l\'historique des alarmes'); }
  return checklist;
}

function generateFallbackAdvice(input: ProcedureHelpInput): string {
  const parts: string[] = [];
  parts.push(`🔧 **Diagnostic pour ${input.stepTitle}**\n`);
  parts.push(`**Problème signalé :** ${input.problem}`);
  parts.push(`**Valeur attendue :** ${input.expectedValue}\n`);
  parts.push('**Actions recommandées :**');
  parts.push('1. Vérifier l\'affichage des instruments de mesure');
  parts.push('2. Comparer avec les valeurs des instruments redondants');
  parts.push('3. Consulter l\'historique des alarmes associées');
  if (input.problem.toLowerCase().includes('capteur') || input.problem.toLowerCase().includes('sonde')) { parts.push('4. Inspecter visuellement le capteur pour détecter une anomalie'); parts.push('5. Si accessible, vérifier le raccordement électrique'); }
  parts.push('\n**Si le problème persiste :**');
  parts.push('- Alerter le chef de quart');
  parts.push('- Préparer un basculement sur l\'équipement de secours si disponible');
  return parts.join('\n');
}

async function generateHelpWithLocalLLM(input: ProcedureHelpInput): Promise<{ advice: string; safetyRisks: string[]; escalationRequired: boolean }> {
  const startTime = Date.now();
  const model = input.model || selectModel('thinking').name;
  const temperature = input.temperature ?? 0.3;
  logger.info('Génération d\'aide procédure', { userName: input.userName, stepTitle: input.stepTitle, equipment: input.equipment, severity: input.severity, model, temperature });
  const safetyRisks = detectSafetyRisks(input.problem, input.severity || 'medium');
  const systemPrompt = `Tu es un expert en maintenance industrielle assistant un opérateur ${input.userName || 'sur le terrain'}. Ta mission est de l'aider à résoudre un problème spécifique lors d'une étape de procédure. RÈGLES: 1. Sois très précis et technique 2. Propose des solutions concrètes et actionnables immédiatement 3. Si le problème semble dangereux, insiste sur la sécurité 4. Utilise un langage adapté à un opérateur de salle de contrôle 5. Structure ta réponse en étapes claires. CONTEXTE TECHNIQUE: - Centrale électrique - Équipement: ${input.equipment || 'Non spécifié'} - Sévérité: ${input.severity || 'medium'} - Opérateur: ${input.userName || 'Opérateur'}`;
  const userPrompt = `L'opérateur ${input.userName || 'Opérateur'} rencontre un problème à l'étape : **${input.stepTitle}**\n\n**Instruction originale :** ${input.instruction}\n**Valeur attendue :** ${input.expectedValue}\n**Problème signalé :** ${input.problem}\n\nRisques identifiés : ${safetyRisks.length > 0 ? safetyRisks.join(', ') : 'Aucun risque majeur identifié'}\n\nFournis une aide technique structurée avec : 1. Diagnostic probable 2. Actions à réaliser (étape par étape) 3. Points de vérification 4. Si le problème persiste, prochaine étape`;
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
  try {
    const response = await callOllama(fullPrompt, { model, temperature, maxTokens: 1000 });
    const duration = Date.now() - startTime;
    logger.info('Aide générée avec succès', { userName: input.userName, stepTitle: input.stepTitle, responseLength: response.length, duration: `${duration}ms`, safetyRisksCount: safetyRisks.length });
    const escalationRequired = input.severity === 'critical' || input.problem.toLowerCase().includes('urgence') || input.problem.toLowerCase().includes('arrêt') || safetyRisks.length > 2;
    return { advice: response, safetyRisks, escalationRequired };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    const duration = Date.now() - startTime;
    logger.error('Échec génération aide', { userName: input.userName, stepTitle: input.stepTitle, error: errorMessage, stack: error instanceof Error ? error.stack : undefined, duration: `${duration}ms` });
    const fallbackAdvice = generateFallbackAdvice(input);
    return { advice: fallbackAdvice, safetyRisks, escalationRequired: input.severity === 'high' || input.severity === 'critical' };
  }
}

export async function getProcedureHelp(input: ProcedureHelpInput): Promise<ProcedureHelpOutput> {
  const startTime = Date.now();
  logger.info('Début aide procédure', { userName: input.userName, stepTitle: input.stepTitle, problem: input.problem.substring(0, 100), severity: input.severity });
  try {
    const { advice, safetyRisks, escalationRequired } = await generateHelpWithLocalLLM(input);
    const technicalChecklist = generateTechnicalChecklist(input.equipment, input.problem);
    let safetyReminder = "⚠️ **Consignes de sécurité**\n";
    if (safetyRisks.length > 0) safetyReminder += safetyRisks.map(risk => `- ${risk}`).join('\n');
    else { safetyReminder += "- Respecter les consignes de sécurité standards\n"; safetyReminder += "- Vérifier vos équipements de protection individuelle\n"; safetyReminder += "- Maintenir une communication avec la salle de contrôle"; }
    if (input.severity === 'high' || input.severity === 'critical') { safetyReminder += "\n\n🛡️ **AVANT INTERVENTION :**\n"; safetyReminder += "- Casque de protection\n"; safetyReminder += "- Lunettes de sécurité\n"; safetyReminder += "- Gants adaptés\n"; safetyReminder += "- Chaussures de sécurité\n"; safetyReminder += "- Détecteur de gaz (si applicable)"; }
    let estimatedResolutionTime = 15;
    if (input.severity === 'low') estimatedResolutionTime = 10;
    if (input.severity === 'medium') estimatedResolutionTime = 20;
    if (input.severity === 'high') estimatedResolutionTime = 30;
    if (input.severity === 'critical') estimatedResolutionTime = 45;
    const alternativeSteps: string[] = [];
    if (input.equipment?.toLowerCase().includes('tg')) { alternativeSteps.push('Basculer sur le groupe de secours si disponible'); alternativeSteps.push('Réduire la charge pour maintenir la stabilité'); }
    if (input.problem.toLowerCase().includes('capteur')) { alternativeSteps.push('Utiliser la valeur du capteur redondant'); alternativeSteps.push('Passer en mode manuel si possible'); }
    const processingTime = Date.now() - startTime;
    logger.info('Aide procédure terminée', { userName: input.userName, stepTitle: input.stepTitle, escalationRequired, safetyRisksCount: safetyRisks.length, processingTime: `${processingTime}ms` });
    return { advice, safetyReminder, technicalChecklist: technicalChecklist.length > 0 ? technicalChecklist : undefined, estimatedResolutionTime, escalationRequired, alternativeSteps: alternativeSteps.length > 0 ? alternativeSteps : undefined, generatedAt: new Date().toISOString(), modelUsed: input.model || 'phi:2.7b', processingTime };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    const processingTime = Date.now() - startTime;
    logger.error('Échec de l\'aide procédure', { userName: input.userName, stepTitle: input.stepTitle, error: errorMessage, stack: error instanceof Error ? error.stack : undefined, processingTime: `${processingTime}ms` });
    const fallbackAdvice = generateFallbackAdvice(input);
    const safetyRisks = detectSafetyRisks(input.problem, input.severity || 'medium');
    return { advice: `${fallbackAdvice}\n\n⚠️ **Note technique** : Assistance IA temporairement indisponible. Contactez le support technique.`, safetyReminder: safetyRisks.length > 0 ? `⚠️ **Risques identifiés**\n${safetyRisks.map(r => `- ${r}`).join('\n')}` : "⚠️ Respectez les consignes de sécurité standard", technicalChecklist: generateTechnicalChecklist(input.equipment, input.problem), estimatedResolutionTime: 30, escalationRequired: input.severity === 'high' || input.severity === 'critical', generatedAt: new Date().toISOString(), modelUsed: `${input.model || 'phi:2.7b'} (fallback)`, processingTime };
  }
}

export const __testables__ = { detectSafetyRisks, generateTechnicalChecklist, generateFallbackAdvice, generateHelpWithLocalLLM };