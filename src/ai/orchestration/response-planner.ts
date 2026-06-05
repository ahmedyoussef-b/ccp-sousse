// @ts-nocheck
/**
 * @fileOverview ResponsePlanner - Planificateur de réponse avec Groq
 * @version 1.3.0
 * @description Utilise Groq pour décider la stratégie de réponse et générer la réponse IA
 * @note Stateless - Aucune donnée persistante
 */

import { callGroq } from '@/ai/providers/groq-provider';
import type { SourceResult } from './multi-source-fetcher';
import type { VoteCandidate } from './weighted-voter';
import type { CoherenceResult } from './coherence-validator';

// ============================================================================
// TYPES
// ============================================================================

export interface StrategyDecision {
  strategy: 'direct_file' | 'rag_synthesis' | 'hybrid' | 'vision' | 'not_found';
  primarySource: string | null;
  confidence: number;
  reasoning: string;
  suggestedActions: string[];
  processingTime?: number;
}

export interface PlanOptions {
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  includeMetadata?: boolean;
}

export interface PlanningContext {
  query: string;
  bestSource: SourceResult | null;
  voteWinner: VoteCandidate | null;
  coherenceResult: CoherenceResult | null;
  allSources: SourceResult[];
  enrichedQuery?: string;
  relatedKeywords?: string[];
  visionContext?: string;
  detectedInnovations?: any[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_OPTIONS: PlanOptions = {
  maxTokens: 800,
  temperature: 0.2,
  timeout: 15000,
  includeMetadata: true
};

// ============================================================================
// LOGS STRUCTURÉS
// ============================================================================

const LOG_SEPARATOR = '═'.repeat(70);
const LOG_SUBSEPARATOR = '─'.repeat(50);

function logInfo(message: string, data?: any): void {
  console.log(`[PLANNER] 📍 ${message}`);
  if (data) console.log(`[PLANNER] 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logSuccess(message: string, data?: any): void {
  console.log(`[PLANNER] ✅ ${message}`);
  if (data) console.log(`[PLANNER] 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logWarning(message: string, data?: any): void {
  console.warn(`[PLANNER] ⚠️ ${message}`);
  if (data) console.warn(`[PLANNER] 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logError(message: string, error?: any): void {
  console.error(`[PLANNER] ❌ ${message}`);
  if (error) console.error(`[PLANNER] 🔥 ${error.message || error}`);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================================
// SERVICE
// ============================================================================

export class ResponsePlanner {
  private options: PlanOptions;

  constructor(options?: Partial<PlanOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Construit le prompt pour Groq (planification)
   */
  private buildPlanningPrompt(context: PlanningContext): string {
    const { query, bestSource, voteWinner, coherenceResult, allSources, enrichedQuery, relatedKeywords, visionContext, detectedInnovations } = context;
    
    let sourcesSummary = '';
    for (let i = 0; i < Math.min(allSources.length, 5); i++) {
      const s = allSources[i];
      sourcesSummary += `\n${i + 1}. [${s.type.toUpperCase()}] Score: ${(s.score * 100).toFixed(0)}%, Poids: ${s.weight}, Pondéré: ${s.weightedScore.toFixed(3)}`;
      if (s.metadata?.filename) sourcesSummary += `\n   Fichier: ${s.metadata.filename}`;
    }
    
    return `Tu es un planificateur de réponse pour un assistant industriel AGENTIC. Tu dois décider de la meilleure stratégie pour répondre à la question de l'utilisateur.

=== CONTEXTE ===
Question utilisateur: "${query}"
${enrichedQuery ? `Requête enrichie: "${enrichedQuery}"` : ''}
${relatedKeywords ? `Mots-clés liés: ${relatedKeywords.join(', ')}` : ''}

=== SOURCES DISPONIBLES ===
${sourcesSummary || 'Aucune source disponible'}

=== ANALYSE SUPPLÉMENTAIRE ===
${bestSource ? `Meilleure source: ${bestSource.type} (score pondéré: ${bestSource.weightedScore.toFixed(3)})` : 'Pas de meilleure source'}
${voteWinner ? `Gagnant du vote: ${voteWinner.sourceType} (vote: ${voteWinner.weightedVote.toFixed(3)})` : 'Pas de gagnant'}
${coherenceResult ? `Cohérence: ${(coherenceResult.score * 100).toFixed(0)}% - ${coherenceResult.reasoning}` : 'Cohérence non évaluée'}

=== ANALYSE VISION INDUSTRIELLE ===
${visionContext ? visionContext : 'Aucune analyse vision en cours'}
${detectedInnovations && detectedInnovations.length > 0 ? `Innovations actives: ${detectedInnovations.map(i => i.innovationName || i.id).join(', ')}` : ''}

=== STRATÉGIES POSSIBLES ===
1. direct_file: Utiliser directement le contenu d'un fichier
2. rag_synthesis: Synthétiser les résultats du RAG
3. hybrid: Combiner fichier direct + RAG
4. vision: Réponse basée sur des images
5. not_found: Aucune information trouvée

=== INSTRUCTIONS ===
Réponds UNIQUEMENT au format JSON suivant:
{
  "strategy": "direct_file" | "rag_synthesis" | "hybrid" | "vision" | "not_found",
  "primarySource": "cache|nominal|rag|vision|none",
  "confidence": 0-1,
  "reasoning": "Courte explication",
  "suggestedActions": ["action1", "action2"]
}`;
  }

  /**
   * Construit le prompt pour générer la réponse IA (Groq)
   */
  private buildResponsePrompt(
    content: string,
    fileName: string,
    query: string,
    sourceType: string
  ): string {
    const maxContentLength = 12000;
    const truncatedContent = content.length > maxContentLength 
      ? content.substring(0, maxContentLength) + "\n\n[Contenu tronqué...]"
      : content;
    
    return `Tu es un assistant industriel expert pour AGENTIC. Génère une réponse précise, structurée et exhaustive basée sur les SOURCES fournies ci-dessous.

=== DOCUMENTS SOURCES ===
Noms: ${fileName}
Type: ${sourceType}
Date: ${new Date().toLocaleDateString()}

=== CONTENU DES SOURCES ===
${truncatedContent}

=== QUESTION DE L'UTILISATEUR ===
${query}

=== INSTRUCTIONS DE SYNTHÈSE ===
1. RASSEMBLE toutes les informations pertinentes de TOUTES les sources fournies.
2. Si les sources se complètent, fusionne-les dans une réponse cohérente.
3. Si les sources se contredisent, mentionne les différentes versions.
4. Synthétise une réponse claire, structurée et professionnelle.
5. Utilise un langage technique adapté à l'industrie.
6. Si l'information n'est dans aucune des sources, dis-le clairement.
7. UTILISE UN FORMATAGE RICHE : Listes à puces (-), Tableaux Markdown si pertinent, **Gras** pour les termes clés.
8. Structure ta réponse avec des sections (ex: ## Conditions, ## Seuils).
9. **RÉSEAUX & CIRCUITS** : Si la question porte sur un composant fluide, décris précisément son rôle dans le cycle global.
10. **TRANSPARENCE** : Si une information semble partielle, indique-le.

=== RÉPONSE STRUCTURÉE (Markdown riche, sans JSON) ===`;
  }

  /**
   * Génère une réponse IA via Groq (prioritaire) ou Ollama (fallback)
   */
  private async generateAIResponse(
    content: string,
    fileName: string,
    query: string,
    sourceType: string,
    _confidence: number
  ): Promise<string> {
    const prompt = this.buildResponsePrompt(content, fileName, query, sourceType);
    
    // PRIORITÉ 1: GROQ
    try {
      console.log(`[PLANNER] 🤖 Appel Groq pour génération réponse...`);
      
      const groqResponse = await callGroq(prompt, {
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        maxTokens: 2000,
        timeout: 30000
      });
      
      if (groqResponse && groqResponse.trim().length > 50) {
        logSuccess(`Réponse générée par Groq (${groqResponse.length} caractères)`);
        return groqResponse;
      }
    } catch (error: any) {
      logWarning(`Groq échoué: ${error.message}, fallback vers Ollama`);
    }
    
    // FALLBACK: OLLAMA
    try {
      const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
      const llmModel = process.env.LLM_MODEL || 'gemma2:2b';
      
      console.log(`[PLANNER] 🤖 Fallback Ollama: ${llmModel}`);
      
      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: llmModel,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.3,
            top_p: 0.9,
            max_tokens: 2000
          }
        }),
        signal: AbortSignal.timeout(60000)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.response && data.response.trim().length > 50) {
          logSuccess(`Réponse générée par Ollama (${data.response.length} caractères)`);
          return data.response;
        }
      }
    } catch (error: any) {
      logError(`Ollama également échoué: ${error.message}`);
    }
    
    // DERNIER FALLBACK: Message explicatif
    logWarning(`Aucun LLM disponible, retour d'un message d'erreur élégant`);
    
    return `Je dispose d'un document intitulé "${fileName}" qui contient des informations sur votre question. Cependant, je ne peux pas générer une réponse structurée pour le moment. Veuillez réessayer ou consulter directement le document.`;
  }

  /**
   * Planifie la stratégie de réponse
   */
  async plan(context: PlanningContext, options?: Partial<PlanOptions>): Promise<StrategyDecision> {
    const startTime = Date.now();
    const opts = { ...this.options, ...options };
    
    console.log(`\n${LOG_SEPARATOR}`);
    logInfo(`🎯 PLANIFICATION DE LA RÉPONSE`);
    logInfo(`📝 Question: "${context.query.substring(0, 80)}${context.query.length > 80 ? '...' : ''}"`);
    logInfo(`📊 Sources disponibles: ${context.allSources.length}`);
    console.log(LOG_SUBSEPARATOR);
    
    // Cas simple : pas de sources
    if (context.allSources.length === 0) {
      return {
        strategy: 'not_found',
        primarySource: null,
        confidence: 0,
        reasoning: 'Aucune source trouvée',
        suggestedActions: ['Reformuler la question'],
        processingTime: Date.now() - startTime
      };
    }
    
    // Cas simple : demande explicite d'image
    const isImageQuery = /(image|photo|schéma|visuel|dessin|illustration)/i.test(context.query);
    if (isImageQuery && context.allSources.some(s => s.type === 'vision')) {
      return {
        strategy: 'vision',
        primarySource: 'vision',
        confidence: 0.85,
        reasoning: 'La question demande explicitement une image',
        suggestedActions: ['Afficher l\'image'],
        processingTime: Date.now() - startTime
      };
    }
    
    const bestSource = context.bestSource;
    
    // Cas simple : source nominale de haute confiance
    if (bestSource && bestSource.type === 'nominal' && bestSource.weightedScore >= 0.7) {
      logInfo(`📁 Source nominale haute confiance, stratégie = direct_file`);
      return {
        strategy: 'direct_file',
        primarySource: 'nominal',
        confidence: Math.min(0.95, bestSource.weightedScore + 0.1),
        reasoning: `Fichier trouvé avec score ${(bestSource.weightedScore * 100).toFixed(0)}%`,
        suggestedActions: ['Générer réponse IA'],
        processingTime: Date.now() - startTime
      };
    }
    
    // Cas simple : cache permanent
    if (bestSource && bestSource.type === 'cache' && bestSource.weightedScore >= 0.8) {
      return {
        strategy: 'direct_file',
        primarySource: 'cache',
        confidence: Math.min(0.98, bestSource.weightedScore),
        reasoning: `Réponse validée trouvée en cache`,
        suggestedActions: ['Afficher réponse validée'],
        processingTime: Date.now() - startTime
      };
    }

    // 📚🎓 Cas simple : données d'entraînement pré-préparées (réponse directe vérifiée)
    if (bestSource && bestSource.type === 'training' && bestSource.confidence >= 0.55) {
      logInfo(`📚🎓 Source training haute confiance, stratégie = direct_file`);
      return {
        strategy: 'direct_file',
        primarySource: 'training',
        confidence: Math.min(0.97, bestSource.confidence + 0.05),
        reasoning: `Réponse pré-préparée trouvée (score: ${(bestSource.confidence * 100).toFixed(0)}%)`,
        suggestedActions: ['Afficher réponse pré-préparée'],
        processingTime: Date.now() - startTime
      };
    }
    
    // Décision complexe via Groq
    logInfo(`🤖 Décision complexe, appel à Groq...`);
    
    try {
      const prompt = this.buildPlanningPrompt(context);
      const response = await callGroq(prompt, {
        model: 'llama-3.3-70b-versatile',
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        timeout: opts.timeout
      });
      
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Format JSON invalide');
      
      const parsed = JSON.parse(jsonMatch[0]);
      const processingTime = Date.now() - startTime;
      
      logSuccess(`Planification terminée en ${formatDuration(processingTime)}`);
      logInfo(`📊 Décision: ${parsed.strategy} (confiance: ${(parsed.confidence * 100).toFixed(0)}%)`);
      
      return {
        strategy: parsed.strategy,
        primarySource: parsed.primarySource,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || 'Décision basée sur analyse',
        suggestedActions: parsed.suggestedActions || ['Générer réponse'],
        processingTime
      };
      
    } catch (error: any) {
      logError(`Échec planification: ${error.message}`);
      return this.fallbackDecision(context);
    }
  }
  
  private fallbackDecision(context: PlanningContext): StrategyDecision {
    const bestSource = context.bestSource;
    const coherenceResult = context.coherenceResult;
    
    if (coherenceResult && !coherenceResult.isCoherent) {
      return {
        strategy: 'not_found',
        primarySource: null,
        confidence: 0.2,
        reasoning: 'Contenu non cohérent avec la question',
        suggestedActions: ['Reformuler la question']
      };
    }
    
    if (bestSource && bestSource.type === 'nominal' && bestSource.weightedScore >= 0.5) {
      return {
        strategy: 'direct_file',
        primarySource: 'nominal',
        confidence: Math.min(0.85, bestSource.weightedScore),
        reasoning: `Fichier trouvé`,
        suggestedActions: ['Générer réponse IA']
      };
    }
    
    if (context.allSources.length >= 2) {
      return {
        strategy: 'rag_synthesis',
        primarySource: 'rag',
        confidence: 0.6,
        reasoning: `${context.allSources.length} sources disponibles`,
        suggestedActions: ['Fusionner les sources']
      };
    }
    
    return {
      strategy: 'not_found',
      primarySource: null,
      confidence: 0.1,
      reasoning: 'Aucune source pertinente',
      suggestedActions: ['Reformuler la question']
    };
  }
  
  /**
   * Exécute le plan et génère la réponse IA
   */
  async executePlan(
    decision: StrategyDecision,
    context: PlanningContext
  ): Promise<{ answer: string; metadata: Record<string, any> }> {
    logInfo(`🚀 Exécution du plan: ${decision.strategy} (Confiance: ${decision.confidence})`);
    console.log(LOG_SUBSEPARATOR);
    
    const confidence = decision.confidence;
    
    // CAS 1: CONFIANCE ÉLEVÉE (≥ 70%)
    if (confidence >= 0.7 && decision.strategy !== 'not_found') {
      return this.executeStandardStrategy(decision, context);
    }
    
    // CAS 2: CONFIANCE MOYENNE (40-69%)
    if (confidence >= 0.4 && decision.strategy !== 'not_found') {
      const standardResult = await this.executeStandardStrategy(decision, context);
      
      const snippet = context.bestSource?.content?.substring(0, 300).trim() || "";
      const sourceName = context.bestSource?.metadata?.filename || "Document source";
      
      const hybridAnswer = `🔍 **Information trouvée (confiance modérée)**

Voici une synthèse basée sur les documents :

${standardResult.answer}

⚠️ **Précision** : Ces informations proviennent de documents partiellement pertinents. 
Veuillez vérifier les sources originales pour confirmation.

**Source principale** : 
- ${sourceName} : "${snippet}..."
`;
      
      return {
        answer: hybridAnswer,
        metadata: { ...standardResult.metadata, tier: 'hybrid' }
      };
    }
    
    // CAS 3: CONFIANCE FAIBLE (< 40%)
    const topSources = context.allSources.slice(0, 3);
    
    if (topSources.length > 0) {
      let snippetList = `📄 **Documents potentiellement pertinents**

Je n'ai pas trouvé de réponse précise à votre question. 
Voici les documents qui pourraient contenir l'information :

`;

      topSources.forEach((s, i) => {
        const title = s.metadata?.filename || s.metadata?.titre || `Document ${i + 1}`;
        const scorePct = (s.score * 100).toFixed(0);
        const excerpt = s.content?.substring(0, 200).replace(/\n/g, ' ').trim() || "Pas d'extrait disponible";
        
        snippetList += `${i + 1}. **[${title}]** (pertinence: ${scorePct}%)\n   > ${excerpt}...\n\n`;
      });
      
      snippetList += `💡 **Suggestions** :
- Consultez ces documents directement via l'Explorateur.
- Reformulez votre question avec des termes techniques plus spécifiques (ex: codes KKS).`;

      return {
        answer: snippetList,
        metadata: { strategy: 'low_confidence_snippets', sourcesCount: topSources.length }
      };
    }
    
    return {
      answer: "Je suis désolé, je n'ai trouvé aucune information pertinente dans la base de documents techniques pour répondre à cette question.",
      metadata: { strategy: 'dead_end', confidence: 0 }
    };
  }

  /**
   * Logique originale de génération
   */
  private async executeStandardStrategy(
    decision: StrategyDecision,
    context: PlanningContext
  ): Promise<{ answer: string; metadata: Record<string, any> }> {
    switch (decision.strategy) {
      case 'direct_file':
      case 'rag_synthesis':
      case 'hybrid': {
        const topSources = context.allSources
          .filter(s => s.content && s.content.trim().length > 0)
          .slice(0, 3);

        if (topSources.length === 0) {
          return { answer: "Contenu introuvable.", metadata: { failed: true } };
        }

        // 📚🎓 Mixage des sources (Training + RAG)
        const best = context.bestSource;
        let sourcesToUse = topSources;
        
        // On n'isole plus systématiquement le training, on le place juste en premier si présent
        if (best && best.type === 'training' && best.confidence >= 0.55) {
          logInfo(`📚🎓 Source training détectée: incluse en priorité pour mixage`);
          const otherSources = topSources.filter(s => s.sourceId !== best.sourceId);
          sourcesToUse = [best, ...otherSources].slice(0, 3);
        }

        const combinedContent = sourcesToUse.map(s => `[SOURCE: ${s.type}${s.metadata?.filename ? ` | FILE: ${s.metadata.filename}` : ''}] ${s.content}`).join('\n\n---\n\n');
        const sourceNames = sourcesToUse.map(s => s.metadata?.filename || s.metadata?.sourceFile || s.type).join(', ');

        let aiAnswer = await this.generateAIResponse(
          combinedContent,
          sourceNames,
          context.query,
          decision.strategy,
          decision.confidence
        );

        aiAnswer = this.injectVisuals(aiAnswer, combinedContent, context.query, context.detectedInnovations, context.visionContext);

        return {
          answer: aiAnswer,
          metadata: {
            strategy: decision.strategy,
            sources: sourceNames,
            confidence: decision.confidence,
            usedTrainingVoix: best?.type === 'training'
          }
        };
      }
      
      case 'vision': {
        const visionSource = context.allSources.find(s => s.type === 'vision');
        const visionContent = context.allSources
          .filter(s => s.type === 'vision')
          .map(s => s.content)
          .join('\n\n');
          
        let answer = visionSource?.content || "Image introuvable.";
        
        answer = this.injectVisuals(answer, visionContent, context.query, context.detectedInnovations, context.visionContext, true);
        
        return {
          answer,
          metadata: { strategy: 'vision', confidence: decision.confidence }
        };
      }
      
      default:
        return { answer: "Stratégie non reconnue.", metadata: { error: true } };
    }
  }

  /**
   * Injection des aperçus visuels Markdown formatés
   */
  private injectVisuals(
    answer: string, 
    contextContent: string, 
    query: string, 
    detectedInnovations?: any[], 
    visionContext?: string, 
    forceExplicit: boolean = false
  ): string {
    let finalAnswer = answer;
    
    const isImageQuery = forceExplicit || /(donne|affiche|montre|vois|voir|cherche).*(image|photo|schéma|visuel|dessin|illustration)/i.test(query)
      || /(image|photo|schéma|visuel|dessin).*(de|du|des|la|le|les)/i.test(query)
      || /^image\s+de/i.test(query)
      || /image/i.test(query);

    const imageMatches = contextContent.match(/\[IMAGE(?:[\/\-]VISION)?: (.*?) \| ID: (.*?)\]/g) || [];
    
    const uniqueImages: Array<{ id: string, name: string, description: string }> = [];
    const uniqueIds = new Set<string>();

    imageMatches.forEach(match => {
      const idMatch = match.match(/ID: (.*?)]/);
      const nameMatch = match.match(/\[IMAGE(?:[\/\-]VISION)?: (.*?) \|/);
      if (idMatch && idMatch[1] && !uniqueIds.has(idMatch[1])) {
        const id = idMatch[1];
        uniqueIds.add(id);
        const name = nameMatch ? nameMatch[1].trim() : "Image";
        
        let description = name;
        const indexOfImage = contextContent.indexOf(match);
        if (indexOfImage !== -1) {
          const contextSlice = contextContent.substring(indexOfImage + match.length, indexOfImage + match.length + 300);
          const firstLine = contextSlice.split('\n').filter(l => l.trim().length > 0 && !l.includes('INSTRUCTION POUR IA'))[0];
          if (firstLine && firstLine.length > 5 && firstLine.length < 80) description = firstLine.trim();
        }
        uniqueImages.push({ id, name, description });
      }
    });

    const hasAttachedImage = !!visionContext || (detectedInnovations && detectedInnovations.length > 0);

    if (isImageQuery && hasAttachedImage) {
      logInfo(`📸 NIVEAU 3: Image demandée ET image attachée. Activation des innovations.`);
      let innovationContent = `\n\n---\n\n🔍 **Résultats de l'analyse visuelle (Innovations IA)**\n`;
      
      if (visionContext) {
        innovationContent += `\n${visionContext}\n`;
      }
      
      if (detectedInnovations && detectedInnovations.length > 0) {
        innovationContent += `\n**Innovations activées :**\n`;
        detectedInnovations.forEach(inv => {
          innovationContent += `- ${inv.innovationName || inv.id} (Score de confiance: ${inv.score ? inv.score.toFixed(0) : 100}%)\n`;
        });
      }
      
      finalAnswer += innovationContent;
    }

    if (uniqueImages.length === 0) return finalAnswer;

    if (isImageQuery) {
      logInfo(`📸 NIVEAU 2: Affichage direct des images de la BDD.`);
      let imageContent = "\n\n---\n\n📸 **Documents visuels correspondants :**\n\n";
      
      uniqueImages.forEach((img, index) => {
        imageContent += `![${img.name}](/api/vision/images/${img.id})\n\n`;
        imageContent += `**Image ${index + 1} : ${img.name}**\n`;
        imageContent += `*${img.description}*\n\n`;
      });
      
      return finalAnswer + imageContent;
    } 
    
    else {
      logInfo(`📸 NIVEAU 1: Proposition subtile d'afficher l'image.`);
      let ctaBlock = `\n\n---\n\n📸 *Des images sont disponibles pour illustrer ce contenu :*\n`;
      
      uniqueImages.forEach(img => {
        ctaBlock += `   - **${img.name}** (${img.description})\n`;
      });
      
      ctaBlock += `\n➡️ Pour les visualiser, vous pouvez demander "montre moi l'image".`;
      
      return finalAnswer + ctaBlock;
    }
  }
}


export const responsePlanner = new ResponsePlanner();