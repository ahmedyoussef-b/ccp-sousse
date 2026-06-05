/**
 * @fileOverview Phase 2: RAISONNER - Assemble le contexte final pour la génération.
 * @version 3.2.0
 * @lastUpdated 2026-04-07
 * @description Ajout limite stricte 14k tokens pour préserver RAM
 */

import { RetrievalResult, FusedResult } from './intelligent-retriever';
import { createRAGLogger } from './utils/logger';
import { StatsManager } from './utils/stats-manager';
import { getRAGConfig } from './config/rag.config';
import { safeParseQueryAnalysis } from './schemas/query.schema';
import { aiLogger } from '@/lib/logger/ai-logger';

// ============================================================================
// LIMITE STRICTE POUR PRÉSERVER LA RAM (i7-870 / 8 Go)
// ============================================================================

/**
 * Limite stricte de tokens pour le contexte RAG
 * 14 000 tokens au lieu de 128k théoriques pour éviter OOM
 * Marge de sécurité de 1000 tokens par rapport au seuil 15k
 */
const MAX_CONTEXT_TOKENS = 8000;

// ============================================================================
// TOKEN COUNTING AVEC TIKTOKEN (RÉEL)
// ============================================================================

let tiktoken: any = null;
let tokenizerInitialized = false;

async function initTokenizer(): Promise<void> {
  if (tokenizerInitialized) return;
  
  try {
    const { encoding_for_model } = await import('tiktoken');
    tiktoken = encoding_for_model('gpt-3.5-turbo');
    tokenizerInitialized = true;
    logger.info('TOKENIZER', '✅ Tokenizer tiktoken initialisé avec succès');
  } catch (error: any) {
    logger.warning('TOKENIZER', `⚠️ tiktoken non disponible: ${error.message}. Utilisation fallback approximation.`);
    tokenizerInitialized = true;
  }
}

function countTokens(text: string): number {
  if (tiktoken) {
    try {
      return tiktoken.encode(text).length;
    } catch (error) {
      logger.warning('TOKENIZER', 'Erreur tiktoken, fallback approximation');
    }
  }
  // Fallback: approximation 4 caractères par token (standard OpenAI)
  return Math.ceil(text.length / 4);
}

// Initialisation asynchrone
initTokenizer().catch(console.error);

// ============================================================================
// INITIALISATION DES UTILITAIRES
// ============================================================================

const logger = createRAGLogger('[RAG-ASSEMBLER]', {
  maxDataLength: 300,
  enableStructured: process.env.NODE_ENV === 'production'
});

interface AssemblerStats {
  totalAssemblies: number;
  avgTokens: number;
  avgSources: number;
  avgRelevance: number;
  lastAssemblyTime: number | null;
  lastAssemblyDuration: number | null;
  truncationCount: number;
}

const statsManager = new StatsManager<AssemblerStats>({
  initial: {
    totalAssemblies: 0,
    avgTokens: 0,
    avgSources: 0,
    avgRelevance: 0,
    lastAssemblyTime: null,
    lastAssemblyDuration: null,
    truncationCount: 0
  },
  persistIntervalMs: 60000,
  onPersist: async (stats, timestamp) => {
    logger.structured('STATS_PERSIST', { stats, timestamp: timestamp.toISOString() });
  }
});

// ============================================================================
// INTERFACES
// ============================================================================

export interface AssembledContext {
  text: string;
  sources: {
    source: string;
    title: string;
    relevance: number;
    score: number;
    type: string;
  }[];
  tokenCount: number;
  metadata: {
    totalContexts: number;
    limitedContexts: number;
    truncated: boolean;
    processingTime: number;
    sourceBreakdown: Record<string, number>;
    avgRelevance: number;
  };
  fallback: any;
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function calculateFinalScore(context: FusedResult, sourceWeights: Record<string, number>): number {
  const sourceWeight = sourceWeights[context.source] || 0.8;
  return context.finalScore * sourceWeight;
}

function getDefaultTitle(source: string): string {
  const titles: Record<string, string> = {
    'document': '📄 Manuel technique',
    'lesson': '💡 Leçon apprise',
    'interaction': '💬 Historique chat',
    'hierarchy': '🏛️ Hiérarchie conceptuelle',
    'pattern': '🎯 Pattern identifié',
    'procedure': '📋 Procédure',
    'alarme': '🚨 Alarme',
    'hmi': '🖥️ Interface HMI',
    'episodic': '📝 Mémoire épisodique',
    'mindmap': '🧠 Schéma mental (Mind Map)'
  };
  return titles[source] || '📌 Info Système';
}

function getSourceBreakdown(contexts: FusedResult[]): Record<string, number> {
  const breakdown: Record<string, number> = {};
  contexts.forEach(ctx => {
    const source = ctx.source;
    breakdown[source] = (breakdown[source] || 0) + 1;
  });
  return breakdown;
}

function getSourceEmoji(source: string): string {
  const emojis: Record<string, string> = {
    'document': '📄',
    'lesson': '💡',
    'interaction': '💬',
    'hierarchy': '🏛️',
    'pattern': '🎯',
    'procedure': '📋',
    'alarme': '🚨',
    'hmi': '🖥️',
    'episodic': '📝',
    'mindmap': '🧠'
  };
  return emojis[source] || '📌';
}

/**
 * Troncature d'un document trop long
 * Garde le début et la fin si nécessaire
 */
function truncateDocument(content: string, maxChars: number = 2000): string {
  if (content.length <= maxChars) return content;
  
  const keepStart = Math.floor(maxChars * 0.7);
  const keepEnd = Math.floor(maxChars * 0.3);
  
  return content.substring(0, keepStart) + 
         "\n[... TRONCATURE POUR PRÉSERVER RAM ...]\n" + 
         content.substring(content.length - keepEnd);
}

// ============================================================================
// LIMITATION DE LA TAILLE DU CONTEXTE (VERSION RENFORCÉE)
// ============================================================================
/**
 * Limitation stricte du contexte pour préserver RAM et temps de réponse
 * Version optimisée : tokens réduits, troncature agressive
 */
function limitContextSize(
  contexts: FusedResult[], 
  maxTokens: number
): { limited: FusedResult[]; truncated: boolean; totalTokens: number } {
  let totalTokens = 0;
  const limited: FusedResult[] = [];
  let truncated = false;
  
  // Utiliser maxTokens passé en paramètre (sera 8000 depuis l'appel)
  const EFFECTIVE_MAX_TOKENS = Math.min(maxTokens, 8000); // ← Forcé à 8000 max
  
  logger.info('LIMIT', `🔒 Limitation stricte du contexte à ${EFFECTIVE_MAX_TOKENS} tokens (optimisé RAM)`);
  logger.metric('LIMIT', 'Contextes initiaux', contexts.length);
  
  // Trier par score décroissant pour prioriser les plus pertinents
  const sortedByScore = [...contexts].sort((a, b) => b.finalScore - a.finalScore);
  
  // Limiter le nombre de contextes à 3 maximum pour la vitesse
  const MAX_CONTEXTS = 3;
  let contextsProcessed = 0;
  
  for (const ctx of sortedByScore) {
    if (contextsProcessed >= MAX_CONTEXTS) {
      logger.warning('LIMIT', `Nombre max de contextes atteint (${MAX_CONTEXTS}), arrêt`);
      truncated = true;
      break;
    }
    
    // Troncature agressive du document
    let content = ctx.content;
    const MAX_CHARS_PER_DOC = 1200; // ← Réduit de 2000 à 1200
    if (content.length > MAX_CHARS_PER_DOC) {
      content = truncateDocument(content, MAX_CHARS_PER_DOC);
      logger.warning('LIMIT', `Document tronqué: ${ctx.source} (${ctx.content.length} -> ${content.length} chars)`);
    }
    
    const tokens = countTokens(content);
    if (totalTokens + tokens <= EFFECTIVE_MAX_TOKENS) {
      limited.push({ ...ctx, content });
      totalTokens += tokens;
      contextsProcessed++;
    } else if (limited.length === 0 && tokens > EFFECTIVE_MAX_TOKENS) {
      // Cas extrême: un seul document dépasse la limite → troncature forcée
      const maxCharsForSingleDoc = Math.floor(EFFECTIVE_MAX_TOKENS * 3.5); // ~3.5 chars/token
      const truncatedContent = truncateDocument(content, maxCharsForSingleDoc);
      limited.push({ ...ctx, content: truncatedContent });
      totalTokens = countTokens(truncatedContent);
      truncated = true;
      statsManager.increment('truncationCount');
      logger.warning('LIMIT', `Document unique dépassant la limite, troncature forcée`);
      break;
    } else {
      truncated = true;
      statsManager.increment('truncationCount');
      logger.warning('LIMIT', `Troncature après ${limited.length} contextes (${totalTokens} tokens / ${EFFECTIVE_MAX_TOKENS} max)`);
      break;
    }
  }
  
  logger.metric('LIMIT', 'Contextes conservés', limited.length);
  logger.metric('LIMIT', 'Tokens utilisés', totalTokens);
  logger.metric('LIMIT', 'Utilisation RAM', `${Math.round((totalTokens / EFFECTIVE_MAX_TOKENS) * 100)}%`);
  
  if (totalTokens > EFFECTIVE_MAX_TOKENS) {
    logger.warning('LIMIT', `⚠️ Dépassement limite: ${totalTokens} > ${EFFECTIVE_MAX_TOKENS} tokens`);
  }
  
  return { limited, truncated, totalTokens };
}

// ============================================================================
// FORMATAGE POUR LE LLM
// ============================================================================

function formatForLLM(contexts: FusedResult[], sourceWeights: Record<string, number>): string {
  if (contexts.length === 0) {
    logger.warning('FORMAT', 'Aucun contexte à formater');
    return "NOTE: Aucun contexte spécifique trouvé.";
  }
  
  logger.info('FORMAT', `Formatage de ${contexts.length} contextes...`);
  
  let formatted = "### 📚 CONTEXTE TECHNIQUE DE RÉFÉRENCE\n\n";
  
  contexts.forEach((ctx, i) => {
    const relevance = (calculateFinalScore(ctx, sourceWeights) * 100).toFixed(0);
    const sourceEmoji = getSourceEmoji(ctx.source);
    formatted += `[Source ${i + 1}] ${sourceEmoji} ${ctx.source.toUpperCase()} - Confiance: ${relevance}%\n`;
    formatted += `${ctx.content}\n\n`;
  });
  
  formatted += "### 🎯 FIN DU CONTEXTE\n";
  formatted += "Instructions: Utilise UNIQUEMENT les informations ci-dessus pour répondre.\n";
  formatted += `⚠️ Limite technique: ${MAX_CONTEXT_TOKENS} tokens max pour préserver RAM.\n`;
  
  logger.metric('FORMAT', 'Longueur formatée', formatted.length);
  logger.metric('FORMAT', 'Tokens formatés', countTokens(formatted));
  
  return formatted;
}

// ============================================================================
// AJOUT DE MÉTA-INSTRUCTIONS
// ============================================================================

function addMetadata(
  text: string, 
  retrievalResult: RetrievalResult, 
  thresholds: { proceduralThreshold: number; complexityThreshold: number }
): string {
  const instructions: string[] = [];
  
  logger.info('METADATA', 'Ajout des méta-instructions...');
  
  const analysis = safeParseQueryAnalysis(retrievalResult.analysis);
  
  if (analysis?.type === 'procedural') {
    instructions.push("📋 DIRECTIVE: Détailler la procédure étape par étape.");
    logger.metric('METADATA', 'Type détecté', 'procédural');
  }
  
  if (analysis?.complexity && analysis.complexity > thresholds.complexityThreshold) {
    instructions.push("🧠 DIRECTIVE: Problématique complexe, décomposer le raisonnement.");
    logger.metric('METADATA', 'Complexité', `${Math.round(analysis.complexity * 100)}%`);
  }
  
  if (instructions.length > 0) {
    logger.success('METADATA', `${instructions.length} instruction(s) ajoutée(s)`);
    return `${instructions.join('\n')}\n\n${text}`;
  }
  
  return text;
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

export async function assembleContext(retrievalResult: RetrievalResult): Promise<AssembledContext> {
  const startTime = Date.now();
  const config = getRAGConfig();
  
  logger.printSeparator();
  logger.info('START', `🚀 DÉMARRAGE DE L'ASSEMBLAGE`);
  logger.metric('START', 'Contextes bruts', retrievalResult.contexts?.length || 0);
  logger.metric('START', 'Analyse disponible', !!retrievalResult.analysis);
  logger.metric('START', 'Limite tokens', `${MAX_CONTEXT_TOKENS} (RAM sécurisée)`);
  logger.printSeparator();
  
  statsManager.increment('totalAssemblies');
  statsManager.update({ lastAssemblyTime: Date.now() });
  
  try {
    // 1. Trier par pertinence finale
    logger.info('SORT', '🔀 Tri par pertinence...');
    const sorted = [...retrievalResult.contexts].sort((a, b) => {
      const scoreA = calculateFinalScore(a, config.retrieval.sourceWeights);
      const scoreB = calculateFinalScore(b, config.retrieval.sourceWeights);
      return scoreB - scoreA;
    });
    
    if (sorted.length > 0) {
      const topScore = calculateFinalScore(sorted[0], config.retrieval.sourceWeights);
      logger.metric('SORT', 'Meilleur score', `${(topScore * 100).toFixed(0)}%`);
    }
    
    // 2. Limiter la taille selon limite stricte (14k tokens)
    const { limited, truncated } = limitContextSize(
      sorted, 
      MAX_CONTEXT_TOKENS  // ← Utilise la constante stricte
    );
    
    // 3. Formater pour le LLM
    const formatted = formatForLLM(limited, config.retrieval.sourceWeights);
    
    // 4. Ajouter des méta-instructions basées sur l'analyse
    const withMetadata = addMetadata(formatted, retrievalResult, {
      proceduralThreshold: config.context.proceduralThreshold,
      complexityThreshold: config.context.complexityThreshold
    });

    const tokenCount = countTokens(withMetadata);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 📄 SECTION 7 – Préparation du contexte
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📄 SECTION 7 – Préparation du contexte');
    console.log('📚 Nombre de sources incluses :', limited.length);
    console.log('📏 Taille totale (tokens) :', tokenCount);
    console.log('✂️ Troncature effectuée :', truncated ? 'OUI' : 'NON');
    console.log('📊 Répartition :', JSON.stringify(getSourceBreakdown(limited)));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    aiLogger.logStep(7, 'CONTEXT', 'Context Assembly Result', {
      sourceCount: limited.length,
      totalTokens: tokenCount,
      truncated,
      sourceBreakdown: getSourceBreakdown(limited)
    });
    const elapsedTime = Date.now() - startTime;
    
    // Vérification post-assemblage
    if (tokenCount > MAX_CONTEXT_TOKENS + 1000) {
      logger.warning('ASSEMBLY', `⚠️ Dépassement sévère: ${tokenCount} > ${MAX_CONTEXT_TOKENS + 1000} tokens`);
    }
    
    // Mise à jour des statistiques
    statsManager.update({ lastAssemblyDuration: elapsedTime });
    statsManager.average('avgTokens', tokenCount);
    statsManager.average('avgSources', limited.length);
    
    const avgRelevance = limited.length > 0 
      ? limited.reduce((sum, ctx) => sum + calculateFinalScore(ctx, config.retrieval.sourceWeights), 0) / limited.length
      : 0;
    statsManager.average('avgRelevance', avgRelevance);
    
    const sourceBreakdown = getSourceBreakdown(limited);
    
    logger.printSeparator();
    logger.success('ASSEMBLY', `✅ ASSEMBLAGE TERMINÉ en ${logger.formatDuration(elapsedTime)}`);
    logger.metric('ASSEMBLY', 'Tokens totaux (réels)', tokenCount);
    logger.metric('ASSEMBLY', 'Limite sécurisée', `${MAX_CONTEXT_TOKENS}`);
    logger.metric('ASSEMBLY', 'Sources incluses', limited.length);
    logger.metric('ASSEMBLY', 'Pertinence moyenne', `${(avgRelevance * 100).toFixed(0)}%`);
    logger.metric('ASSEMBLY', 'Troncature', truncated ? 'OUI' : 'NON');
    
    if (tokenCount > MAX_CONTEXT_TOKENS) {
      logger.warning('ASSEMBLY', `⚠️ DANGER RAM: ${tokenCount} > ${MAX_CONTEXT_TOKENS} tokens`);
    } else {
      logger.success('ASSEMBLY', `✅ RAM sécurisée: ${tokenCount}/${MAX_CONTEXT_TOKENS} tokens`);
    }
    
    if (Object.keys(sourceBreakdown).length > 0) {
      logger.info('ASSEMBLY', 'Répartition des sources', sourceBreakdown);
    }
    logger.printSeparator();
    
    return {
      text: withMetadata,
      sources: limited.map(c => ({
        source: c.source,
        title: c.metadata?.title || getDefaultTitle(c.source),
        relevance: calculateFinalScore(c, config.retrieval.sourceWeights),
        score: c.finalScore,
        type: c.source
      })),
      tokenCount,
      metadata: {
        totalContexts: retrievalResult.contexts.length,
        limitedContexts: limited.length,
        truncated,
        processingTime: elapsedTime,
        sourceBreakdown,
        avgRelevance
      },
      fallback: retrievalResult.analysis?.fallback || null
    };
    
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    logger.error('ASSEMBLY', `Échec après ${logger.formatDuration(elapsedTime)}`, error);
    statsManager.increment('truncationCount');
    
    return {
      text: "NOTE: Une erreur est survenue lors de l'assemblage du contexte.",
      sources: [],
      tokenCount: 0,
      metadata: {
        totalContexts: 0,
        limitedContexts: 0,
        truncated: false,
        processingTime: elapsedTime,
        sourceBreakdown: {},
        avgRelevance: 0
      },
      fallback: { error: true, message: error.message }
    };
  }
}

// ============================================================================
// EXPOSITION DE LA CONSTANTE POUR USAGE EXTERNE
// ============================================================================

export function getMaxContextTokens(): number {
  return MAX_CONTEXT_TOKENS;
}

// ============================================================================
// STATISTIQUES ET UTILITAIRES - EXPORTS COMPLETS
// ============================================================================

export function getAssemblerStats(): Readonly<AssemblerStats> {
  return statsManager.get();
}

export function getAssemblerSnapshot(): {
  stats: Readonly<AssemblerStats>;
  metadata: { createdAt: Date; updatedAt: Date };
} {
  return statsManager.getSnapshot();
}

export function resetAssemblerStats(): void {
  statsManager.reset();
  logger.success('STATS', 'Statistiques de l\'assembleur réinitialisées');
}

export async function persistAssemblerStats(): Promise<void> {
  await statsManager.persist();
  logger.success('STATS', 'Statistiques persistées manuellement');
}

export function disposeAssemblerStats(): void {
  statsManager.dispose();
  logger.info('STATS', 'Gestionnaire de statistiques disposé');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  assembleContext,
  getAssemblerStats,
  getAssemblerSnapshot,
  resetAssemblerStats,
  persistAssemblerStats,
  disposeAssemblerStats,
  getMaxContextTokens
};