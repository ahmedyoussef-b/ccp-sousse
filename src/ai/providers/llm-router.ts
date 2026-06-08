// src/ai/providers/llm-router.ts
/**
 * Routeur LLM unifié - Fallback automatique multi-provider
 * @version 1.6.0
 * @lastUpdated 2026-06-08
 * @changes Support Vercel + Mode dégradé Groq prioritaire
 */

import { FALLBACK_ORDER, ROUTER_CONFIG, getProviderConfig } from '@/ai/config/llm-config';

// Providers
import { callGroq, callGroqStream } from './groq-provider';
import { callGemini, callGeminiStream, isGeminiAvailable } from './gemini-provider';
import { callCerebras, callCerebrasStream, isCerebrasAvailable } from './cerebras-provider';
import { callOpenRouter, callOpenRouterStream, isOpenRouterAvailable } from './openrouter-provider';
import { callClaudeLocal, callClaudeLocalStream } from './claude-local-provider';
import { callOllama, callOllamaStream } from './ollama-client';
import { callHybridWrapper, callHybridWrapperStream, isHybridAvailable } from './hybrid-wrapper';

// Utilitaires
import { llmUsageTracker } from './llm-usage-tracker';
import llmCache from '@/cache/llm-cache';

// 🔥 Import de l'analyseur d'intention image
import { imageIntentAnalyzer, ImageIntentType } from '@/ai/query-intent-analyzer';

// ============================================================================
// DÉTECTION VERCEL
// ============================================================================

const IS_VERCEL = process.env.VERCEL === '1';

if (IS_VERCEL) {
  console.log('[LLM-ROUTER] 🚀 Mode Vercel détecté - Utilisation prioritaire de Groq');
}

// ============================================================================
// TYPES
// ============================================================================

export interface LLMRouterOptions {
  prompt: string;
  type?: 'planning' | 'coherence' | 'response';
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  skipCache?: boolean;
  forceProvider?: string;
  bypassRateLimit?: boolean;
  preferLocal?: boolean;
  query?: string; // 🔥 La requête originale de l'utilisateur (sans contexte RAG)
}

export interface LLMRouterResponse {
  success: boolean;
  content: string;
  provider: string;
  model: string;
  duration: number;
  tokenCount: number;
  fromCache: boolean;
  fallbackChain: string[];
  error?: string;
  images?: {
    id: string;
    filename: string;
    url: string;
    thumbnailUrl: string;
    description?: string;
    confidence?: number;
    source?: string;
    relevanceScore?: number;
  }[];
  imageIntent?: {
    type: string;
    shouldDisplayImage: boolean;
    shouldSuggestImage: boolean;
    extractedEntity?: string;
    extractedEntities?: string[];
    confidence: number;
  };
}

export interface ProviderCaller {
  name: string;
  call: (prompt: string, options: any) => Promise<string>;
  stream?: (prompt: string, options: any) => AsyncGenerator<string, void, unknown>;
  isAvailable?: () => Promise<{ available: boolean; error?: string }>;
  priority: number;
  timeout: number;
  enabled: boolean;
}

// ============================================================================
// CONSTRUCTION DES PROVIDERS
// ============================================================================

function buildProviderList(): ProviderCaller[] {
  const providers: ProviderCaller[] = [];
  const order = FALLBACK_ORDER;
  
  for (const providerName of order) {
    const config = getProviderConfig(providerName);
    if (!config) continue;
    
    switch (providerName) {
      case 'groq':
        providers.push({
          name: 'groq',
          call: callGroq,
          stream: async function* (prompt: string, options: any) {
            yield* callGroqStream(prompt, options);
          },
          priority: 1,
          timeout: config.timeout,
          enabled: config.enabled && !!process.env.GROQ_API_KEY
        });
        break;
        
      case 'gemini':
        providers.push({
          name: 'gemini',
          call: callGemini,
          stream: async function* (prompt: string, options: any) {
            yield* callGeminiStream(prompt, options);
          },
          isAvailable: isGeminiAvailable,
          priority: 2,
          timeout: config.timeout,
          enabled: config.enabled && !!process.env.GEMINI_API_KEY
        });
        break;
        
      case 'cerebras':
        providers.push({
          name: 'cerebras',
          call: callCerebras,
          stream: async function* (prompt: string, options: any) {
            yield* callCerebrasStream(prompt, options);
          },
          isAvailable: isCerebrasAvailable,
          priority: 3,
          timeout: config.timeout,
          enabled: config.enabled && !!process.env.CEREBRAS_API_KEY
        });
        break;
        
      case 'openrouter':
        providers.push({
          name: 'openrouter',
          call: callOpenRouter,
          stream: async function* (prompt: string, options: any) {
            yield* callOpenRouterStream(prompt, options);
          },
          isAvailable: isOpenRouterAvailable,
          priority: 4,
          timeout: config.timeout,
          enabled: config.enabled && !!process.env.OPENROUTER_API_KEY
        });
        break;
        
      case 'claudeLocal':
        providers.push({
          name: 'claude-local',
          call: callClaudeLocal,
          stream: async function* (prompt: string, options: any) {
            yield* callClaudeLocalStream(prompt, options);
          },
          priority: 5,
          timeout: config.timeout,
          enabled: true
        });
        break;
        
      case 'ollama':
        providers.push({
          name: 'ollama',
          call: callOllama,
          stream: async function* (prompt: string, options: any) {
            yield* callOllamaStream(prompt, options);
          },
          priority: 6,
          timeout: config.timeout,
          enabled: true
        });
        break;
        
      case 'hybrid':
        providers.push({
          name: 'hybrid',
          call: callHybridWrapper,
          stream: async function* (prompt: string, options: any) {
            yield* callHybridWrapperStream(prompt, options);
          },
          isAvailable: isHybridAvailable,
          priority: 7,
          timeout: config.timeout,
          enabled: true
        });
        break;
    }
  }
  
  return providers;
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 🔥 Extrait les images du prompt
 */
function extractImagesFromPrompt(prompt: string): { id: string; filename: string; url: string; thumbnailUrl: string; description?: string; tags?: string[]; confidence?: number }[] {
  const images: { id: string; filename: string; url: string; thumbnailUrl: string; description?: string; tags?: string[]; confidence?: number }[] = [];
  
  const imagePattern = /\[IMAGE:\s*([^\|\]]+)\s*\|\s*ID:\s*([a-zA-Z0-9_-]+)\]/gi;
  let match;
  
  while ((match = imagePattern.exec(prompt)) !== null) {
    const filename = match[1].trim();
    const imageId = match[2].trim();
    
    if (!images.some(img => img.id === imageId)) {
      images.push({
        id: imageId,
        filename: filename,
        url: `/api/vision/images/${imageId}?raw=true`,
        thumbnailUrl: `/api/vision/images/${imageId}?thumbnail=true`,
        description: '',
        confidence: 0.8
      });
    }
  }
  
  const uuidPattern = /ID:\s*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/gi;
  while ((match = uuidPattern.exec(prompt)) !== null) {
    const imageId = match[1];
    if (!images.some(img => img.id === imageId)) {
      images.push({
        id: imageId,
        filename: `image_${imageId.substring(0, 8)}`,
        url: `/api/vision/images/${imageId}?raw=true`,
        thumbnailUrl: `/api/vision/images/${imageId}?thumbnail=true`,
        description: '',
        confidence: 0.7
      });
    }
  }
  
  return images;
}

/**
 * 🔥 Extrait les codes techniques de la requête
 */
function extractTechnicalCodes(prompt: string): string[] {
  // Pattern pour les codes industriels (TV, TG1, CR2, TCV057, etc.)
  // On ne capture que les codes en MAJUSCULES pour éviter le bruit du contexte
  const matches = prompt.match(/\b([A-Z]{2,}[0-9]*|[A-Z]{1,}[0-9]+)\b/g);
  if (!matches) return [];
  
  // Filtrer les mots communs et dédupliquer
  const forbidden = new Set([
    'IMAGE', 'PHOTO', 'PLAN', 'SCHÉMA', 'AFFICHE', 'MONTRE', 'DONNE', 'VOIR', 'PUPITRE', 
    'COMMANDE', 'CONTROLE', 'UNITÉ', 'PRODUCTION', 'VOICI', 'DES', 'EXTRAITS', 'DE', 
    'DOCUMENTS', 'TECHNIQUES', 'PERTINENTS', 'POUR', 'PONDRE', 'LA', 'QUESTION', 
    'SI', 'INFORMATION', 'PAS', 'DANS', 'DITES', 'CLAIREMENT', 'UNIQUEMENT', 'BASANT',
    'BASER', 'DESSUS', 'CI-DESSUS', 'DÉCRIT', 'INSTRUCTIONS', 'VOTRE', 'RÉPONSE'
  ]);
  const uniqueCodes = new Set<string>();
  
  for (const m of matches) {
    const code = m.toUpperCase();
    if (!forbidden.has(code) && code.length >= 2) {
      uniqueCodes.add(code);
    }
  }
  
  return Array.from(uniqueCodes);
}

/**
 * 🔥 Vérifie si une image correspond à un code technique
 */
function imageMatchesTechnicalCode(image: any, code: string): boolean {
  const searchText = `${image.filename} ${image.tags?.join(' ')} ${image.description || ''}`.toUpperCase();
  return searchText.includes(code.toUpperCase());
}

/**
 * 🔥 Filtre les images par codes techniques
 */
function filterImagesByTechnicalCodes(images: any[], technicalCodes: string[]): any[] {
  if (technicalCodes.length === 0) return images;
  
  const filtered = images.filter(img => {
    return technicalCodes.some(code => imageMatchesTechnicalCode(img, code));
  });
  
  if (filtered.length > 0) {
    console.log(`[IMAGE-ROUTER] 🎯 Filtrage technique (${technicalCodes.join(', ')}): ${filtered.length}/${images.length} images`);
    return filtered;
  }
  
  return images;
}

/**
 * 🔥 Calcule un score de pertinence pour chaque image
 */
function calculateRelevanceScore(image: any, query: string, extractedEntities?: string[]): number {
  let score = 0;
  const queryLower = query.toLowerCase();
  
  // On nettoie la recherche pour éviter le bruit du contexte RAG
  const searchText = `${image.filename} ${image.tags?.join(' ')} ${image.description || ''} ${image.invocationKeywords || ''}`.toLowerCase();
  
  // Mots importants (même courts)
  const highPriorityKeywords = ['tv', 'tg', 'cr', 'pe', 'b0', 'b1', 'b2', 'b3', 'cr1', 'cr2'];
  const queryWords = queryLower.split(/[\s,._-]+/).filter(w => w.length > 2 || highPriorityKeywords.includes(w));
  
  // 0. Priorité ABSOLUE : Correspondance avec les entités extraites par l'analyseur d'intention
  if (extractedEntities && extractedEntities.length > 0) {
    for (const entity of extractedEntities) {
      const cleanEntity = entity.toLowerCase().replace(/\.(jpg|jpeg|png)$/, '');
      const cleanFilename = image.filename?.toLowerCase().replace(/\.(jpg|jpeg|png)$/, '');
      
      if (cleanFilename === cleanEntity) {
        score += 50; // Bonus massif
        console.log(`[RELEVANCE] 🏆 Match ENTITÉ EXTRAITE "${entity}": +50`);
      } else if (cleanFilename?.includes(cleanEntity) || cleanEntity.includes(cleanFilename || '')) {
        score += 20;
        console.log(`[RELEVANCE] ✅ Match ENTITÉ PARTIEL "${entity}": +20`);
      }
    }
  }

  // 1. Correspondance exacte du filename (priorité maximale)
  const cleanFilename = image.filename?.toLowerCase().replace('.jpg', '').replace('.png', '');
  if (cleanFilename && queryLower.includes(cleanFilename)) {
    score += 15;
    console.log(`[RELEVANCE] ✅ Correspondance filename exacte: +15`);
  }
  
  // 2. Codes techniques (TCV057, TG1, etc.)
  const technicalCodes = extractTechnicalCodes(query);
  for (const code of technicalCodes) {
    if (image.filename?.toUpperCase().includes(code.toUpperCase())) {
      score += 8;
      console.log(`[RELEVANCE] ✅ Code technique ${code} dans filename: +8`);
    }
    if (image.tags?.some((t: string) => t.toUpperCase().includes(code.toUpperCase()))) {
      score += 6;
      console.log(`[RELEVANCE] ✅ Code technique ${code} dans tags: +6`);
    }
  }
  
  // 3. Tags correspondants
  if (image.tags) {
    for (const tag of image.tags) {
      if (queryLower.includes(tag.toLowerCase())) {
        score += 5;
        console.log(`[RELEVANCE] ✅ Tag correspondant "${tag}": +5`);
      }
    }
  }
  
  // 4. Mots-clés d'invocation
  if (image.invocationKeywords) {
    const keywords = image.invocationKeywords.toLowerCase().split(/[ ,]+/);
    for (const kw of keywords) {
      if (kw.length > 2 && queryLower.includes(kw)) {
        score += 4;
        console.log(`[RELEVANCE] ✅ Mot-clé invocation "${kw}": +4`);
      }
    }
  }
  
  // 5. Mots de la requête dans la description
  for (const word of queryWords) {
    if (searchText.includes(word)) {
      score += 2;
    }
  }
  
  // 6. Bonus pour présence de description détaillée
  if (image.description && image.description.length > 50) {
    score += 1;
  }
  
  // 7. Bonus pour présence de Q&A
  if (image.qaPairs && image.qaPairs.length > 20) {
    score += 1;
  }
  
  return score;
}

/**
 * 🔥 Filtre les images par pertinence par rapport à la requête
 */
function filterImagesByRelevance(images: any[], query: string, extractedEntities?: string[]): any[] {
  if (images.length === 0) return [];
  if (images.length === 1) return images;
  
  console.log(`[IMAGE-ROUTER] 🔍 Calcul de pertinence pour ${images.length} image(s)`);
  
  // Calculer le score pour chaque image
  const scoredImages = images.map(img => ({
    ...img,
    relevanceScore: calculateRelevanceScore(img, query, extractedEntities)
  }));
  
  // Trier par score décroissant
  scoredImages.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  // Afficher les scores
  scoredImages.forEach((img, idx) => {
    console.log(`[RELEVANCE] ${idx + 1}. ${img.filename}: score=${img.relevanceScore}`);
  });
  
  // Ne garder que les images avec un score > 0
  const relevant = scoredImages.filter(img => img.relevanceScore > 0);
  
  if (relevant.length === 0) {
    console.log(`[IMAGE-ROUTER] ⚠️ Aucune image pertinente trouvée`);
    return [];
  }
  
  // 🔥 CHANGEMENT: Ne pas garder qu'une seule image, mais les plus pertinentes
  // On ne garde que les images qui sont au moins à 85% du score de la meilleure image
  const bestScore = relevant[0].relevanceScore;
  const filtered = relevant.filter(img => img.relevanceScore >= Math.max(5, bestScore * 0.85));
  
  console.log(`[IMAGE-ROUTER] 🏆 ${filtered.length} image(s) sélectionnée(s) (best score: ${bestScore})`);
  return filtered.slice(0, 3);
}

// ============================================================================
// ROUTEUR PRINCIPAL
// ============================================================================

export async function callLLMRouter(options: LLMRouterOptions): Promise<LLMRouterResponse> {
  const startTime = Date.now();
  const opts = {
    type: 'response' as const,
    maxTokens: ROUTER_CONFIG.defaultMaxTokens,
    temperature: ROUTER_CONFIG.defaultTemperature,
    timeout: ROUTER_CONFIG.defaultTimeout,
    skipCache: false,
    forceProvider: undefined,
    bypassRateLimit: false,
    preferLocal: false,
    ...options
  };
  
  const fallbackChain: string[] = [];
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`[LLM-ROUTER] 🚀 ROUTAGE REQUÊTE`);
  console.log(`[LLM-ROUTER] 📝 Type: ${opts.type}`);
  console.log(`[LLM-ROUTER] 📏 Longueur: ${opts.prompt.length} caractères`);
  console.log(`[LLM-ROUTER] 🌡️ Température: ${opts.temperature}`);
  console.log(`[LLM-ROUTER] 🎯 Max tokens: ${opts.maxTokens}`);
  if (opts.preferLocal) console.log(`[LLM-ROUTER] 🏠 Mode local prioritaire`);
  console.log(`${'═'.repeat(70)}`);

  // ============================================
  // 🔥 MODE VERCEL : Utiliser Groq directement
  // ============================================
  if (IS_VERCEL) {
    console.log('[LLM-ROUTER] 🔥 Mode Vercel - Utilisation directe de Groq');
    
    if (process.env.GROQ_API_KEY) {
      try {
        const response = await callGroq(opts.prompt, {
          maxTokens: opts.maxTokens,
          temperature: opts.temperature
        });
        
        const duration = Date.now() - startTime;
        const tokenCount = estimateTokens(response);
        
        console.log(`[LLM-ROUTER] ✅ Succès Groq sur Vercel (${formatDuration(duration)})`);
        
        // Sauvegarder dans le cache
        if (!opts.skipCache && ROUTER_CONFIG.enableCache) {
          await llmCache.set(opts.prompt, opts.type, 'groq', response);
        }
        
        llmUsageTracker.recordSuccess('groq', tokenCount);
        
        return {
          success: true,
          content: response,
          provider: 'groq',
          model: process.env.GROQ_MODEL || 'mixtral-8x7b-32768',
          duration,
          tokenCount,
          fromCache: false,
          fallbackChain: ['groq'],
          imageIntent: {
            type: 'none',
            shouldDisplayImage: false,
            shouldSuggestImage: false,
            confidence: 0
          }
        };
      } catch (error: any) {
        console.error('[LLM-ROUTER] ❌ Erreur Groq sur Vercel:', error.message);
        llmUsageTracker.recordFailure('groq', error.message.includes('rate limit'));
        
        return {
          success: false,
          content: `⚠️ Désolé, une erreur est survenue. Veuillez réessayer.\n\nDétail: ${error.message}`,
          provider: 'error',
          model: 'none',
          duration: Date.now() - startTime,
          tokenCount: 0,
          fromCache: false,
          fallbackChain: [],
          error: error.message,
          imageIntent: {
            type: 'none',
            shouldDisplayImage: false,
            shouldSuggestImage: false,
            confidence: 0
          }
        };
      }
    } else {
      console.error('[LLM-ROUTER] ❌ GROQ_API_KEY manquante sur Vercel');
      return {
        success: false,
        content: '⚠️ Service LLM non configuré. Veuillez ajouter GROQ_API_KEY dans les variables d\'environnement.',
        provider: 'none',
        model: 'none',
        duration: 0,
        tokenCount: 0,
        fromCache: false,
        fallbackChain: [],
        error: 'GROQ_API_KEY missing',
        imageIntent: {
          type: 'none',
          shouldDisplayImage: false,
          shouldSuggestImage: false,
          confidence: 0
        }
      };
    }
  }

  // ============================================
  // MODE LOCAL - CODE ORIGINAL INCHANGÉ
  // ============================================

  // 🔥 Analyser l'intention image avec l'analyseur dédié
  // On utilise la requête originale si disponible pour éviter les hallucinations dues au contexte RAG
  const intentQuery = opts.query || opts.prompt;
  const imageIntent = imageIntentAnalyzer.analyzeImageIntent(intentQuery);
  console.log(`[LLM-ROUTER] 🖼️ Intention image: ${imageIntent.type}, confiance: ${imageIntent.confidence}`);
  console.log(`[LLM-ROUTER]    - Afficher image: ${imageIntent.shouldDisplayImage}`);
  console.log(`[LLM-ROUTER]    - Suggérer image: ${imageIntent.shouldSuggestImage}`);
  if (imageIntent.extractedEntities && imageIntent.extractedEntities.length > 0) {
    console.log(`[LLM-ROUTER]    - Entités extraites: ${imageIntent.extractedEntities.join(', ')}`);
  }

  // Extraire les images et les codes techniques
  const extractedImages = extractImagesFromPrompt(opts.prompt);
  const technicalCodes = extractTechnicalCodes(opts.prompt);
  
  if (technicalCodes.length > 0) {
    console.log(`[LLM-ROUTER] 🔧 Codes techniques détectés: ${technicalCodes.join(', ')}`);
  }
  
  // 🔥 FILTRAGE DES IMAGES PAR PERTINENCE
  let filteredImages = extractedImages;
  
  if (extractedImages.length > 0) {
    // 1. Filtrer par codes techniques
    if (technicalCodes.length > 0) {
      filteredImages = filterImagesByTechnicalCodes(extractedImages, technicalCodes);
      console.log(`[LLM-ROUTER] 🎯 Après filtre technique: ${filteredImages.length}/${extractedImages.length} images`);
    }
    
    // 2. Filtrer par pertinence (score)
    if (filteredImages.length > 1) {
      // On utilise la requête originale pour le calcul de pertinence si disponible
      const relevanceQuery = opts.query || opts.prompt;
      filteredImages = filterImagesByRelevance(filteredImages, relevanceQuery, imageIntent.extractedEntities);
      console.log(`[LLM-ROUTER] 🎯 Après filtre pertinence: ${filteredImages.length} image(s)`);
    }
    
    console.log(`[LLM-ROUTER] 🖼️ ${filteredImages.length} image(s) retenue(s)`);
  }

  // 🔥 COURT-CIRCUIT UNIQUEMENT POUR LES DEMANDES EXPLICITES D'AFFICHAGE
  if (imageIntent.type === ImageIntentType.DISPLAY && filteredImages.length > 0) {
    console.log(`[LLM-ROUTER] 📸 Requête d'affichage explicite détectée → court-circuit LLM (${filteredImages.length} image(s))`);
    
    const duration = Date.now() - startTime;
    const imageResponse = getImageDirectResponseText(filteredImages.length);
    
    if (!opts.skipCache && ROUTER_CONFIG.enableCache) {
      await llmCache.set(opts.prompt, opts.type, 'image-router', imageResponse);
      console.log(`[LLM-ROUTER] 💾 Réponse image mise en cache`);
    }
    
    console.log(`[LLM-ROUTER] ✅ Réponse directe (${formatDuration(duration)})`);
    
    return {
      success: true,
      content: imageResponse,
      provider: 'image-router',
      model: 'direct',
      duration,
      tokenCount: 0,
      fromCache: false,
      fallbackChain: ['image-direct'],
      images: filteredImages.map(img => ({ 
        ...img, 
        confidence: 1, 
        source: 'direct'
      })),
      imageIntent: {
        type: imageIntent.type,
        shouldDisplayImage: imageIntent.shouldDisplayImage,
        shouldSuggestImage: imageIntent.shouldSuggestImage,
        extractedEntity: imageIntent.extractedEntity,
        extractedEntities: imageIntent.extractedEntities,
        confidence: imageIntent.confidence
      }
    };
  }

  // 1. Vérifier le cache
  if (!opts.skipCache && ROUTER_CONFIG.enableCache) {
    const cachedResponse = await llmCache.get(opts.prompt, opts.type, opts.forceProvider || 'any');
    
    if (cachedResponse) {
      const duration = Date.now() - startTime;
      console.log(`[LLM-ROUTER] ✅ Réponse du cache (${formatDuration(duration)})`);
      return {
        success: true,
        content: cachedResponse,
        provider: 'cache',
        model: 'cached',
        duration,
        tokenCount: estimateTokens(cachedResponse),
        fromCache: true,
        fallbackChain: [],
        images: filteredImages.length > 0 ? filteredImages : undefined,
        imageIntent: {
          type: imageIntent.type,
          shouldDisplayImage: imageIntent.shouldDisplayImage,
          shouldSuggestImage: imageIntent.shouldSuggestImage,
          extractedEntity: imageIntent.extractedEntity,
          confidence: imageIntent.confidence
        }
      };
    }
  }

  // 2. Provider forcé
  if (opts.forceProvider) {
    const providers = buildProviderList();
    const provider = providers.find(p => p.name === opts.forceProvider);
    
    if (provider && provider.enabled) {
      console.log(`[LLM-ROUTER] 🔒 Provider forcé: ${provider.name}`);
      try {
        const response = await provider.call(opts.prompt, {
          maxTokens: opts.maxTokens,
          temperature: opts.temperature,
          timeout: provider.timeout
        });
        
        const duration = Date.now() - startTime;
        const tokenCount = estimateTokens(response);
        
        await llmCache.set(opts.prompt, opts.type, provider.name, response);
        llmUsageTracker.recordSuccess(provider.name, tokenCount);
        
        return {
          success: true,
          content: response,
          provider: provider.name,
          model: 'forced',
          duration,
          tokenCount,
          fromCache: false,
          fallbackChain: [provider.name],
          images: filteredImages.length > 0 ? filteredImages : undefined,
          imageIntent: {
            type: imageIntent.type,
            shouldDisplayImage: imageIntent.shouldDisplayImage,
            shouldSuggestImage: imageIntent.shouldSuggestImage,
            extractedEntity: imageIntent.extractedEntity,
            confidence: imageIntent.confidence
          }
        };
      } catch (error: any) {
        llmUsageTracker.recordFailure(provider.name, error.message.includes('rate limit'));
        throw new Error(`Provider forcé ${provider.name} a échoué: ${error.message}`);
      }
    }
  }

  // 3. Construire la liste des providers
  let providers = buildProviderList();
  
  if (opts.preferLocal) {
    providers = [...providers].sort((a, b) => {
      const isLocalA = a.name === 'ollama' || a.name === 'hybrid' || a.name === 'claude-local';
      const isLocalB = b.name === 'ollama' || b.name === 'hybrid' || b.name === 'claude-local';
      if (isLocalA && !isLocalB) return -1;
      if (!isLocalA && isLocalB) return 1;
      return a.priority - b.priority;
    });
    console.log(`[LLM-ROUTER] 🏠 Mode local: providers prioritaires: ${providers.slice(0, 3).map(p => p.name).join(', ')}`);
  }

  // 4. Essayer les providers
  for (const provider of providers) {
    if (!provider.enabled) {
      console.log(`[LLM-ROUTER] ⏭️ ${provider.name} désactivé`);
      fallbackChain.push(`${provider.name}(disabled)`);
      continue;
    }

    if (!opts.bypassRateLimit && ROUTER_CONFIG.enableUsageTracking && llmUsageTracker.isRateLimited(provider.name)) {
      console.log(`[LLM-ROUTER] ⏭️ ${provider.name} rate limité`);
      fallbackChain.push(`${provider.name}(rate_limit)`);
      continue;
    }

    if (provider.isAvailable) {
      try {
        const available = await provider.isAvailable();
        if (!available.available) {
          console.log(`[LLM-ROUTER] ⏭️ ${provider.name} indisponible`);
          fallbackChain.push(`${provider.name}(unavailable)`);
          continue;
        }
      } catch (error: any) {
        console.log(`[LLM-ROUTER] ⏭️ ${provider.name} erreur check`);
        fallbackChain.push(`${provider.name}(check_error)`);
        continue;
      }
    }

    console.log(`[LLM-ROUTER] 🚀 Tentative avec ${provider.name}...`);
    
    try {
      const response = await provider.call(opts.prompt, {
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        timeout: provider.timeout
      });
      
      const duration = Date.now() - startTime;
      const tokenCount = estimateTokens(response);
      
      console.log(`[LLM-ROUTER] ✅ Succès avec ${provider.name} (${formatDuration(duration)}, ~${tokenCount} tokens)`);
      
      if (ROUTER_CONFIG.enableCache) {
        await llmCache.set(opts.prompt, opts.type, provider.name, response);
      }
      if (ROUTER_CONFIG.enableUsageTracking) {
        llmUsageTracker.recordSuccess(provider.name, tokenCount);
      }
      
      fallbackChain.push(provider.name);
      
      return {
        success: true,
        content: response,
        provider: provider.name,
        model: 'default',
        duration,
        tokenCount,
        fromCache: false,
        fallbackChain,
        images: filteredImages.length > 0 ? filteredImages : undefined,
        imageIntent: {
          type: imageIntent.type,
          shouldDisplayImage: imageIntent.shouldDisplayImage,
          shouldSuggestImage: imageIntent.shouldSuggestImage,
          extractedEntity: imageIntent.extractedEntity,
          confidence: imageIntent.confidence
        }
      };
      
    } catch (error: any) {
      const isRateLimit = error.message.includes('rate limit') || error.message.includes('429');
      if (ROUTER_CONFIG.enableUsageTracking) {
        llmUsageTracker.recordFailure(provider.name, isRateLimit);
      }
      console.warn(`[LLM-ROUTER] ❌ ${provider.name} a échoué: ${error.message}`);
      fallbackChain.push(`${provider.name}(failed)`);
    }
  }

  // 5. Fallback ultime
  const duration = Date.now() - startTime;
  console.error(`[LLM-ROUTER] 💀 Tous les providers ont échoué après ${formatDuration(duration)}`);
  
  const errorMessage = `⚠️ Service IA temporairement indisponible. Veuillez réessayer dans quelques instants.`;
  
  return {
    success: false,
    content: errorMessage,
    provider: 'none',
    model: 'none',
    duration,
    tokenCount: 0,
    fromCache: false,
    fallbackChain,
    error: 'Tous les providers ont échoué',
    images: filteredImages.length > 0 ? filteredImages : undefined,
    imageIntent: {
      type: imageIntent.type,
      shouldDisplayImage: imageIntent.shouldDisplayImage,
      shouldSuggestImage: imageIntent.shouldSuggestImage,
      extractedEntity: imageIntent.extractedEntity,
      confidence: imageIntent.confidence
    }
  };
}

/**
 * 🔥 Génère une réponse directe pour les requêtes d'images
 */
function getImageDirectResponseText(imagesCount: number): string {
  const responses = [
    "Voici l'image que vous avez demandée :",
    "Bien sûr, voici l'image demandée :",
    "Voici le visuel correspondant à votre demande :",
    "Voici l'image pour illustrer votre demande :"
  ];
  const randomResponse = responses[Math.floor(Math.random() * responses.length)];
  
  if (imagesCount > 1) {
    return `Voici les ${imagesCount} images correspondant à votre demande :`;
  }
  return randomResponse;
}

// ============================================================================
// VERSION STREAMING
// ============================================================================

export async function* callLLMRouterStream(
  options: LLMRouterOptions
): AsyncGenerator<string, void, unknown> {
  const startTime = Date.now();
  const opts = {
    type: 'response' as const,
    maxTokens: ROUTER_CONFIG.defaultMaxTokens,
    temperature: ROUTER_CONFIG.defaultTemperature,
    timeout: ROUTER_CONFIG.defaultTimeout,
    skipCache: false,
    forceProvider: undefined,
    bypassRateLimit: false,
    preferLocal: false,
    ...options
  };
  
  console.log(`[LLM-ROUTER] 🌊 Streaming: ${opts.type}`);

  // 🔥 Mode Vercel pour le streaming
  if (IS_VERCEL && process.env.GROQ_API_KEY) {
    console.log('[LLM-ROUTER] 🔥 Mode Vercel Streaming - Utilisation de Groq');
    try {
      const stream = callGroqStream(opts.prompt, {
        maxTokens: opts.maxTokens,
        temperature: opts.temperature
      });
      
      let fullResponse = '';
      for await (const chunk of stream) {
        fullResponse += chunk;
        yield chunk;
      }
      
      const duration = Date.now() - startTime;
      console.log(`[LLM-ROUTER] ✅ Streaming Groq terminé (${formatDuration(duration)})`);
      
      if (ROUTER_CONFIG.enableCache) {
        await llmCache.set(opts.prompt, opts.type, 'groq', fullResponse);
      }
      llmUsageTracker.recordSuccess('groq', estimateTokens(fullResponse));
      return;
    } catch (error: any) {
      console.error('[LLM-ROUTER] ❌ Streaming Groq échoué:', error.message);
      llmUsageTracker.recordFailure('groq', error.message.includes('rate limit'));
      yield `⚠️ Erreur de streaming: ${error.message}`;
      return;
    }
  }

  // 🔥 Analyser l'intention image
  const intentQuery = opts.query || opts.prompt;
  const imageIntent = imageIntentAnalyzer.analyzeImageIntent(intentQuery);
  
  const extractedImages = extractImagesFromPrompt(opts.prompt);
  const technicalCodes = extractTechnicalCodes(opts.prompt);
  
  // 🔥 FILTRAGE DES IMAGES PAR PERTINENCE
  let filteredImages = extractedImages;
  
  if (extractedImages.length > 0) {
    if (technicalCodes.length > 0) {
      filteredImages = filterImagesByTechnicalCodes(extractedImages, technicalCodes);
    }
    if (filteredImages.length > 1) {
      filteredImages = filterImagesByRelevance(filteredImages, opts.prompt);
    }
  }
  
  // Court-circuit uniquement pour les demandes explicites d'affichage
  if (imageIntent.type === ImageIntentType.DISPLAY && filteredImages.length > 0) {
    console.log(`[LLM-ROUTER] 📸 Requête d'affichage explicite détectée → court-circuit streaming`);
    const imageResponse = getImageDirectResponseText(filteredImages.length);
    yield imageResponse;
    return;
  }

  if (!opts.skipCache && ROUTER_CONFIG.enableCache) {
    const cachedResponse = await llmCache.get(opts.prompt, opts.type, opts.forceProvider || 'any');
    if (cachedResponse) {
      console.log(`[LLM-ROUTER] ✅ Streaming depuis le cache`);
      yield cachedResponse;
      return;
    }
  }

  let providers = buildProviderList();
  if (opts.preferLocal) {
    providers = [...providers].sort((a, b) => {
      const isLocalA = a.name === 'ollama' || a.name === 'hybrid' || a.name === 'claude-local';
      const isLocalB = b.name === 'ollama' || b.name === 'hybrid' || b.name === 'claude-local';
      if (isLocalA && !isLocalB) return -1;
      if (!isLocalA && isLocalB) return 1;
      return a.priority - b.priority;
    });
  }

  for (const provider of providers) {
    if (!provider.enabled || !provider.stream) continue;
    
    if (!opts.bypassRateLimit && ROUTER_CONFIG.enableUsageTracking && llmUsageTracker.isRateLimited(provider.name)) {
      continue;
    }

    try {
      console.log(`[LLM-ROUTER] 🌊 Streaming avec ${provider.name}...`);
      let fullResponse = '';
      
      const stream = provider.stream(opts.prompt, {
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        timeout: provider.timeout
      });
      
      for await (const chunk of stream) {
        fullResponse += chunk;
        yield chunk;
      }
      
      const duration = Date.now() - startTime;
      const tokenCount = estimateTokens(fullResponse);
      
      if (ROUTER_CONFIG.enableCache) {
        await llmCache.set(opts.prompt, opts.type, provider.name, fullResponse);
      }
      if (ROUTER_CONFIG.enableUsageTracking) {
        llmUsageTracker.recordSuccess(provider.name, tokenCount);
      }
      
      console.log(`[LLM-ROUTER] ✅ Streaming terminé avec ${provider.name} (${formatDuration(duration)})`);
      return;
      
    } catch (error: any) {
      const isRateLimit = error.message.includes('rate limit');
      if (ROUTER_CONFIG.enableUsageTracking) {
        llmUsageTracker.recordFailure(provider.name, isRateLimit);
      }
      console.warn(`[LLM-ROUTER] ❌ Streaming ${provider.name} a échoué: ${error.message}`);
    }
  }

  yield `⚠️ Service IA temporairement indisponible.`;
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

let healthCache: { data: Record<string, any>, timestamp: number } | null = null;
const HEALTH_CACHE_TTL = 60000;

export async function getLLMHealthStatus(): Promise<Record<string, { available: boolean; latency?: number; error?: string }>> {
  const now = Date.now();
  
  if (healthCache && (now - healthCache.timestamp < HEALTH_CACHE_TTL)) {
    console.log(`[LLM-ROUTER] 💡 Récupération santé depuis le cache (${Math.round((now - healthCache.timestamp)/1000)}s)`);
    return healthCache.data;
  }

  // Sur Vercel, on simule un statut simplifié
  if (IS_VERCEL) {
    const status: Record<string, any> = {};
    status.groq = { available: !!process.env.GROQ_API_KEY, latency: 0 };
    status.gemini = { available: !!process.env.GEMINI_API_KEY, latency: 0 };
    status.cerebras = { available: !!process.env.CEREBRAS_API_KEY, latency: 0 };
    status.openrouter = { available: !!process.env.OPENROUTER_API_KEY, latency: 0 };
    status['claude-local'] = { available: false, latency: 0, error: 'Non disponible sur Vercel' };
    status.ollama = { available: false, latency: 0, error: 'Non disponible sur Vercel' };
    status.hybrid = { available: false, latency: 0, error: 'Non disponible sur Vercel' };
    
    healthCache = { data: status, timestamp: Date.now() };
    return status;
  }

  const providers = buildProviderList();
  
  const healthPromises = providers.map(async (provider) => {
    try {
      const startTime = Date.now();
      
      if (provider.isAvailable) {
        const result = await provider.isAvailable();
        return {
          name: provider.name,
          available: result.available,
          latency: Date.now() - startTime,
          error: result.error
        };
      } else {
        return { name: provider.name, available: true, latency: 0 };
      }
    } catch (error: any) {
      return { 
        name: provider.name, 
        available: false, 
        error: error.message,
        latency: 0 
      };
    }
  });

  const results = await Promise.all(healthPromises);
  const status: Record<string, any> = {};
  
  results.forEach(res => {
    const { name, ...details } = res;
    status[name] = details;
  });
  
  healthCache = { data: status, timestamp: Date.now() };
  
  return status;
}

export async function getLLMRouterReport(): Promise<string> {
  const health = await getLLMHealthStatus();
  const cacheStats = llmCache.getStats();
  const usageStats = llmUsageTracker.getStats();
  
  let report = `
╔══════════════════════════════════════════════════════════════╗
║                    LLM ROUTER REPORT                         ║
╠══════════════════════════════════════════════════════════════╣
║ 📊 PROVIDERS STATUS                                           ║
`;
  
  for (const [name, status] of Object.entries(health)) {
    const icon = status.available ? '✅' : '❌';
    const latency = status.latency ? `${status.latency}ms` : 'N/A';
    report += `║   ${icon} ${name.padEnd(14)}: ${status.available ? `Disponible (${latency})` : `Indisponible`}\n`;
  }
  
  report += `╠══════════════════════════════════════════════════════════════╣
║ 💾 CACHE STATISTICS                                            ║
║   ├─ Entrées: ${cacheStats.totalEntries}
║   ├─ Hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%
║   └─ Mémoire: ${cacheStats.memoryUsageMB.toFixed(2)} MB
╠══════════════════════════════════════════════════════════════╣
║ 📊 USAGE STATISTICS                                           ║
║   ├─ Total appels: ${usageStats.totalCalls}
║   ├─ Taux succès: ${(usageStats.successRate * 100).toFixed(1)}%
║   └─ Tokens totaux: ${usageStats.totalTokens}
╚══════════════════════════════════════════════════════════════╝
  `;
  
  return report;
}

export function resetLLMRouterStats(): void {
  llmUsageTracker.resetAllStats();
  llmCache.clear();
  console.log(`[LLM-ROUTER] 🔄 Statistiques réinitialisées`);
}


// ============================================================================
// EXPORT PAR DÉFAUT
// ============================================================================

export default {
  callLLMRouter,
  callLLMRouterStream,
  getLLMHealthStatus,
  getLLMRouterReport,
  resetLLMRouterStats,
  llmUsageTracker,
  llmCache
};