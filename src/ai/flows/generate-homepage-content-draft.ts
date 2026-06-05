//src/ai/flows/generate-homepage-content-draft.ts
/**
 * @fileOverview A flow for generating a draft of homepage content for the 'InstantPage' application.
 * @version 3.0.0
 */

import { callOllama } from '@/ai/providers/ollama-client';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
class SimpleLogger {
  private level: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  private logToConsole = true;
  private shouldLog(level: LogLevel): boolean { const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }; return levels[level] >= levels[this.level]; }
  private format(level: LogLevel, module: string, message: string, meta?: Record<string, any>): string { const timestamp = new Date().toISOString(); const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''; return `[${timestamp}] ${level.toUpperCase()} [${module}] ${message}${metaStr}`; }
  debug(message: string, meta?: Record<string, any>): void { if (this.shouldLog('debug') && this.logToConsole) console.log(`\x1b[36m${this.format('debug', 'HomepageGenerator', message, meta)}\x1b[0m`); }
  info(message: string, meta?: Record<string, any>): void { if (this.shouldLog('info') && this.logToConsole) console.log(`\x1b[32m${this.format('info', 'HomepageGenerator', message, meta)}\x1b[0m`); }
  warn(message: string, meta?: Record<string, any>): void { if (this.shouldLog('warn') && this.logToConsole) console.log(`\x1b[33m${this.format('warn', 'HomepageGenerator', message, meta)}\x1b[0m`); }
  error(message: string, meta?: Record<string, any>): void { if (this.shouldLog('error') && this.logToConsole) console.log(`\x1b[31m${this.format('error', 'HomepageGenerator', message, meta)}\x1b[0m`); }
}
const logger = new SimpleLogger();

export interface GenerateHomepageContentDraftInput { topicOrDescription: string; model?: 'phi:2.7b' | 'tinyllama:latest' | 'gemma:2b' | 'phi:2.7b'; temperature?: number; maxTokens?: number; }
export interface GenerateHomepageContentDraftOutput { title: string; heroHeadline: string; heroSubheadline: string; description: string; features: string[]; callToAction: string; generatedAt?: string; modelUsed?: string; generationTime?: number; }

const generateHomepageContentPrompt = `You are an expert prompt engineer with 15 years of experience in AI, natural language processing, and creative workflows. Your mission is to generate high-quality homepage content for the 'InstantPage' application.
## APPLICATION CONTEXT: Next.js starter kit with TypeScript, Shadcn UI, Tailwind CSS, ESLint, Prisma, GitHub Actions.
## UI STYLE: Primary blue saphir (#3A6ED0), background subtle white-blue (#F7F8FB), accent turquoise (#7DD2E1), Typography: 'Inter', minimalist icons.
## TASK: Based on topic: "{{topicOrDescription}}", generate homepage content draft.
## REQUIREMENTS: Engaging, modern, clean, professional. Include title, hero headline/subheadline, description, 3-5 features, call to action.
## OUTPUT FORMAT: Valid JSON ONLY: { "title": "string", "heroHeadline": "string", "heroSubheadline": "string", "description": "string", "features": ["string"], "callToAction": "string" }`;

async function generateWithLocalLLM(topicOrDescription: string, options: { model?: string; temperature?: number; maxTokens?: number }): Promise<GenerateHomepageContentDraftOutput> {
  const startTime = Date.now();
  const model = options.model || 'phi:2.7b';
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens || 1500;
  logger.info('Début génération contenu homepage', { topic: topicOrDescription.substring(0, 100), model, temperature, maxTokens });
  const prompt = generateHomepageContentPrompt.replace('{{topicOrDescription}}', topicOrDescription.replace(/[{}]/g, '\\$&'));
  try {
    const response = await callOllama(prompt, { model, temperature, maxTokens });
    const duration = Date.now() - startTime;
    logger.debug('Réponse LLM reçue', { model, responseLength: response.length, duration: `${duration}ms` });
    let jsonStr = response.trim().replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Aucun JSON valide trouvé dans la réponse');
    const parsed = JSON.parse(jsonMatch[0]);
    const requiredFields = ['title', 'heroHeadline', 'heroSubheadline', 'description', 'features', 'callToAction'];
    for (const field of requiredFields) { if (!parsed[field]) { logger.warn(`Champ manquant dans la réponse: ${field}`, { parsed }); throw new Error(`Champ requis manquant: ${field}`); } }
    if (!Array.isArray(parsed.features)) parsed.features = [parsed.features];
    if (parsed.features.length > 5) parsed.features = parsed.features.slice(0, 5);
    const output: GenerateHomepageContentDraftOutput = { title: parsed.title, heroHeadline: parsed.heroHeadline, heroSubheadline: parsed.heroSubheadline, description: parsed.description, features: parsed.features, callToAction: parsed.callToAction, generatedAt: new Date().toISOString(), modelUsed: model, generationTime: duration };
    logger.info('Génération terminée avec succès', { title: output.title, featuresCount: output.features.length, generationTime: `${duration}ms` });
    return output;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    const duration = Date.now() - startTime;
    logger.error('Échec génération contenu', { topic: topicOrDescription.substring(0, 100), model, error: errorMessage, stack: error instanceof Error ? error.stack : undefined, duration: `${duration}ms` });
    return getFallbackContent(topicOrDescription, model, duration);
  }
}

function getFallbackContent(topicOrDescription: string, model: string, generationTime: number): GenerateHomepageContentDraftOutput {
  logger.warn('Utilisation du contenu de fallback', { topic: topicOrDescription.substring(0, 50) });
  return { title: `InstantPage - ${topicOrDescription.substring(0, 30)}`, heroHeadline: "Launch Your Next.js App Instantly", heroSubheadline: "Build beautiful web applications with Next.js, TypeScript, Shadcn UI, and Tailwind CSS - all pre-configured and ready to go.", description: `InstantPage is the ultimate starter kit for rapid web development. Whether you're building a personal project or a professional application, we provide everything you need to get started quickly. ${topicOrDescription}`, features: ["⚡️ Next.js 15 with App Router", "🎨 Beautiful Shadcn UI Components", "🟦 TypeScript for Type Safety", "🎯 Tailwind CSS for Styling", "🚀 CI/CD Ready with GitHub Actions"], callToAction: "Get Started Now", generatedAt: new Date().toISOString(), modelUsed: model, generationTime };
}

export async function generateHomepageContentDraft(input: GenerateHomepageContentDraftInput): Promise<GenerateHomepageContentDraftOutput> {
  const startTime = Date.now();
  logger.info('Début flow génération homepage', { topicLength: input.topicOrDescription.length, topicPreview: input.topicOrDescription.substring(0, 100), model: input.model, temperature: input.temperature });
  try {
    const result = await generateWithLocalLLM(input.topicOrDescription, { model: input.model, temperature: input.temperature, maxTokens: input.maxTokens });
    const totalDuration = Date.now() - startTime;
    logger.info('Flow terminé avec succès', { title: result.title, totalDuration: `${totalDuration}ms`, generationTime: `${result.generationTime}ms` });
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    const totalDuration = Date.now() - startTime;
    logger.error('Échec du flow', { error: errorMessage, stack: error instanceof Error ? error.stack : undefined, totalDuration: `${totalDuration}ms` });
    return getFallbackContent(input.topicOrDescription, input.model || 'phi:2.7b', totalDuration);
  }
}

export async function generateHomepageContentSimple(topic: string): Promise<string> {
  const result = await generateHomepageContentDraft({ topicOrDescription: topic, model: 'phi:2.7b', temperature: 0.7, maxTokens: 1500 });
  return `# ${result.title}\n\n## ${result.heroHeadline}\n${result.heroSubheadline}\n\n${result.description}\n\n### Features\n${result.features.map(f => `- ${f}`).join('\n')}\n\n[${result.callToAction}]`.trim();
}

export const __testables__ = { generateWithLocalLLM, getFallbackContent, generateHomepageContentPrompt };