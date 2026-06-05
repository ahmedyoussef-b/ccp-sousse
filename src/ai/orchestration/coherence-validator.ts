/**
 * @fileOverview CoherenceValidator - Vérificateur de cohérence sémantique
 * @version 1.0.0
 * @description Vérifie si le contenu d'un résultat répond réellement à la question
 * @innovation 3
 */

import { callGroq } from '@/ai/providers/groq-provider';

// ============================================================================
// TYPES
// ============================================================================

export interface CoherenceResult {
  isCoherent: boolean;
  confidence: number;        // 0-1
  relevantPassages: string[];
  irrelevantPassages: string[];
  reasoning: string;
  score: number;             // Score global de cohérence (0-1)
  processingTime?: number;
}

export interface CoherenceOptions {
  useLLM?: boolean;          // Utiliser Groq pour vérification (plus précis)
  minConfidence?: number;    // Seuil minimum pour considérer cohérent (0.6 par défaut)
  maxPassages?: number;      // Nombre max de passages à extraire
  timeout?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_OPTIONS: CoherenceOptions = {
  useLLM: true,
  minConfidence: 0.6,
  maxPassages: 3,
  timeout: 10000
};

// ============================================================================
// LOGS STRUCTURÉS
// ============================================================================

const LOG_SEPARATOR = '═'.repeat(70);
const LOG_SUBSEPARATOR = '─'.repeat(50);

function logInfo(message: string, data?: any): void {
  console.log(`[COHERENCE] 📍 ${message}`);
  if (data) console.log(`[COHERENCE] 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logSuccess(message: string, data?: any): void {
  console.log(`[COHERENCE] ✅ ${message}`);
  if (data) console.log(`[COHERENCE] 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logWarning(message: string, data?: any): void {
  console.warn(`[COHERENCE] ⚠️ ${message}`);
  if (data) console.warn(`[COHERENCE] 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}


function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================================
// SERVICE
// ============================================================================

export class CoherenceValidator {
  private options: CoherenceOptions;

  constructor(options?: Partial<CoherenceOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Extraction des mots-clés d'une question
   */
  private extractKeywords(query: string): string[] {
    const stopWords = new Set([
      'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'en', 'dans',
      'pour', 'par', 'avec', 'sans', 'sur', 'sous', 'est', 'sont', 'a', 'ont',
      'donne', 'moi', 'que', 'est-ce', 'quelle', 'quel', 'info', 'role',
      'montre', 'affiche', 'donne-moi', 'trouve'
    ]);

    // Extraction des mots techniques (KKS, etc.)
    const technicalTerms = query.match(/[A-Z0-9]{2,}\d+[A-Z0-9]*/g) || [];

    const standardWords = query
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));

    return Array.from(new Set([...technicalTerms, ...standardWords]));
  }

  /**
   * Vérification basée sur les mots-clés (rapide, sans LLM)
   */
  private keywordBasedCheck(query: string, content: string): { score: number; reasoning: string } {
    const keywords = this.extractKeywords(query);
    const contentLower = content.toLowerCase();
    
    if (keywords.length === 0) {
      return { score: 0.5, reasoning: "Aucun mot-clé significatif à vérifier" };
    }
    
    let matches = 0;
    const matchedKeywords: string[] = [];
    const missingKeywords: string[] = [];
    
    // Bonus pour les termes techniques (KKS)
    let technicalMatches = 0;
    
    for (const kw of keywords) {
      const isTechnical = /[A-Z0-9]{3,}/.test(kw);
      if (contentLower.includes(kw.toLowerCase())) {
        matches++;
        matchedKeywords.push(kw);
        if (isTechnical) technicalMatches++;
      } else {
        missingKeywords.push(kw);
      }
    }
    
    // Calcul du score de base
    const coverage = matches / keywords.length;
    let score = coverage;
    
    // Bonus technique
    if (technicalMatches > 0) {
      score += 0.15;
    }
    
    // Bonus Multimodal (Vision)
    const visionKeywords = ['image', 'photo', 'visuel', 'schéma', 'voir'];
    const isVisionQuery = visionKeywords.some(kw => query.toLowerCase().includes(kw));
    const isVisionContent = content.includes('[IMAGE/VISION:');
    
    if (isVisionQuery && isVisionContent) {
      score += 0.2;
      logInfo("💎 Bonus multimodal détecté (Query Vision + Content Vision)");
      
      // 🔥 Correction v3 : Pénalité de fragmentation
      // Si on demande un "schéma" ou "circuit" mais que le contenu est court (< 400 chars)
      const isStructuralQuery = /(schéma|circuit|diagramme|plan|réseau)/i.test(query);
      if (isStructuralQuery && content.length < 500) {
        score -= 0.15;
        logWarning("⚠️ Pénalité de fragmentation vision : Contenu trop court pour un schéma structural");
      }
    }
    
    // Plafond à 1.0
    score = Math.max(0, Math.min(1.0, score));
    
    // Pénalité si trop de mots-clés manquants
    if (missingKeywords.length > keywords.length / 2) {
      score *= 0.6; // Plus sévère
    }
    
    const reasoning = `${matches}/${keywords.length} mots-clés trouvés (${technicalMatches} techniques). ${missingKeywords.length > 0 ? `Manquants: ${missingKeywords.slice(0, 3).join(', ')}` : 'Tous les mots-clés sont présents'}`;
    
    return { score, reasoning };
  }

  /**
   * Vérification avec Groq (précise, plus lente)
   */
  private async llmBasedCheck(query: string, content: string): Promise<{ score: number; reasoning: string; relevantPassages: string[]; irrelevantPassages: string[] }> {
    const startTime = Date.now();
    
    // Limiter le contenu pour éviter de dépasser les tokens
    const truncatedContent = content.length > 3000 ? content.substring(0, 3000) + '...' : content;
    
    const prompt = `Tu es un vérificateur de cohérence. Analyse si le contenu suivant répond réellement à la question posée.

QUESTION: "${query}"

CONTENU À ANALYSER:
"""
${truncatedContent}
"""

INSTRUCTIONS:
1. Réponds UNIQUEMENT au format JSON suivant:
{
  "isCoherent": true/false,
  "score": 0-1 (0 = pas du tout cohérent, 1 = parfaitement cohérent),
  "reasoning": "Explication courte de ta décision",
  "relevantPassages": ["citation1", "citation2"],
  "irrelevantPassages": ["citation1", "citation2"]
}

2. Ne réponds que si le contenu répond DIRECTEMENT à la question.
3. Si le contenu parle d'autre chose mais contient des éléments pertinents, isCoherent doit être true avec un score moyen (0.5-0.7).
4. Si le contenu ne répond pas du tout à la question, isCoherent = false, score < 0.3.
5. **PROACTIVITÉ VISION** : Si le contenu mentionne une image (ex: [IMAGE/VISION: ...]) mais que l'utilisateur demande une réponse visuelle, suggère explicitement dans reasoning de consulter l'onglet "Metadata" ou d'inspecter le document source.`;

    try {
      const response = await callGroq(prompt, {
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        maxTokens: 800,
        timeout: this.options.timeout
      });
      
      // Extraire le JSON de la réponse
      let jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Format JSON invalide');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      const elapsedTime = Date.now() - startTime;
      
      logInfo(`LLM check terminé en ${formatDuration(elapsedTime)}`, {
        isCoherent: parsed.isCoherent,
        score: parsed.score
      });
      
      return {
        score: parsed.score || 0.5,
        reasoning: parsed.reasoning || 'Analyse LLM',
        relevantPassages: parsed.relevantPassages || [],
        irrelevantPassages: parsed.irrelevantPassages || []
      };
      
    } catch (error: any) {
      logWarning(`LLM check échoué, fallback sur keyword-based: ${error.message}`);
      const fallback = this.keywordBasedCheck(query, content);
      return {
        score: fallback.score,
        reasoning: fallback.reasoning,
        relevantPassages: [],
        irrelevantPassages: []
      };
    }
  }

  /**
   * Valide la cohérence d'un contenu par rapport à une question
   */
  async validate(
    query: string,
    content: string,
    options?: Partial<CoherenceOptions>
  ): Promise<CoherenceResult> {
    const startTime = Date.now();
    const opts = { ...this.options, ...options };
    
    console.log(`\n${LOG_SEPARATOR}`);
    logInfo(`🔍 VÉRIFICATION DE COHÉRENCE`);
    logInfo(`📝 Question: "${query.substring(0, 80)}${query.length > 80 ? '...' : ''}"`);
    logInfo(`📄 Contenu: ${content.length} caractères`);
    logInfo(`🔧 Mode: ${opts.useLLM ? 'LLM (Groq)' : 'Keyword-based'}`);
    console.log(LOG_SUBSEPARATOR);
    
    let result: { score: number; reasoning: string; relevantPassages: string[]; irrelevantPassages: string[] };
    
    if (opts.useLLM) {
      result = await this.llmBasedCheck(query, content);
    } else {
      const keywordResult = this.keywordBasedCheck(query, content);
      result = {
        score: keywordResult.score,
        reasoning: keywordResult.reasoning,
        relevantPassages: [],
        irrelevantPassages: []
      };
    }
    
    const isCoherent = result.score >= (opts.minConfidence || 0.6);
    const processingTime = Date.now() - startTime;
    
    // Log détaillé
    console.log(LOG_SUBSEPARATOR);
    logInfo(`📊 RÉSULTAT DE LA VÉRIFICATION:`);
    logInfo(`   ├─ Cohérent: ${isCoherent ? '✅ OUI' : '❌ NON'}`);
    logInfo(`   ├─ Score: ${(result.score * 100).toFixed(0)}%`);
    logInfo(`   ├─ Seuil: ${((opts.minConfidence || 0.6) * 100).toFixed(0)}%`);
    logInfo(`   └─ Raison: ${result.reasoning}`);
    
    if (result.relevantPassages.length > 0) {
      logInfo(`   📖 Passages pertinents: ${result.relevantPassages.length}`);
    }
    if (result.irrelevantPassages.length > 0) {
      logInfo(`   🗑️ Passages non pertinents: ${result.irrelevantPassages.length}`);
    }
    
    logSuccess(`Vérification terminée en ${formatDuration(processingTime)}`);
    console.log(LOG_SEPARATOR);
    
    return {
      isCoherent,
      confidence: result.score,
      relevantPassages: result.relevantPassages.slice(0, opts.maxPassages),
      irrelevantPassages: result.irrelevantPassages.slice(0, opts.maxPassages),
      reasoning: result.reasoning,
      score: result.score,
      processingTime
    };
  }

  /**
   * Valide un lot de résultats et retourne uniquement les cohérents
   */
  async filterCoherent(
    query: string,
    contents: Array<{ id: string; content: string; metadata?: Record<string, any> }>,
    options?: Partial<CoherenceOptions>
  ): Promise<Array<{ id: string; content: string; metadata?: Record<string, any>; coherence: CoherenceResult }>> {
    const results: Array<{ id: string; content: string; metadata?: Record<string, any>; coherence: CoherenceResult }> = [];
    
    logInfo(`📋 Filtrage de ${contents.length} contenus...`);
    
    for (const item of contents) {
      const coherence = await this.validate(query, item.content, options);
      if (coherence.isCoherent) {
        results.push({ ...item, coherence });
        logInfo(`✅ Contenu "${item.id.substring(0, 30)}" conservé (score: ${(coherence.score * 100).toFixed(0)}%)`);
      } else {
        logWarning(`❌ Contenu "${item.id.substring(0, 30)}" rejeté (score: ${(coherence.score * 100).toFixed(0)}%)`);
      }
    }
    
    logSuccess(`${results.length}/${contents.length} contenus cohérents conservés`);
    
    return results;
  }

  /**
   * Vérification rapide (keyword-based seulement)
   */
  quickCheck(query: string, content: string): CoherenceResult {
    const { score, reasoning } = this.keywordBasedCheck(query, content);
    const isCoherent = score >= (this.options.minConfidence || 0.6);
    
    return {
      isCoherent,
      confidence: score,
      relevantPassages: [],
      irrelevantPassages: [],
      reasoning,
      score
    };
  }
}

export const coherenceValidator = new CoherenceValidator();