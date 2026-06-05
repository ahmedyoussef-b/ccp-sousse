/**
 * Routeur intelligent - Orchestration des requêtes par zones
 * @version 2.8.0
 * @lastUpdated 2026-04-21
 * @changes Support des images + Intégration ImageIntentAnalyzer + Correction types
 */

import { QueryIntentAnalyzer, IntentAnalysis, QueryCategory, imageIntentAnalyzer, ImageIntentType } from '../query-intent-analyzer';
import { callOllama } from '../providers/ollama-client';
import { callGroq } from '../providers/groq-provider';
import { callGemini } from '../providers/gemini-provider';
import { searchIntelligent } from '../rag/intelligent-retriever';
import { aiLogger } from '../../lib/logger/ai-logger';
import { ZoneType } from '../vector/chromadb-schema';
import { HybridResponse } from '../resilience/hybrid-router';
import { getAllTechnicalKeywords } from '../vector/chromadb-schema';
import * as fs from 'fs';
import * as path from 'path';
import { quotaManager } from '../resilience/quota-manager';

// ============================================================================
// CONFIGURATION DYNAMIQUE DES FOURNISSEURS
// ============================================================================

const CONFIG_PATH = path.join(process.cwd(), '.env.llm');
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const LOCAL_MODEL = 'phi:2.7b';
const LOCAL_MODEL_FAST = 'tinyllama:latest';
const USE_OLLAMA = process.env.USE_OLLAMA === 'true'; // 🔥 Désactivé par défaut pour la stabilité

/**
 * Lit la configuration dynamique pour savoir quel provider utiliser
 */
function getUseGroq(): boolean {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const match = content.match(/LLM_PROVIDER=(.+)/);
      if (match) {
        const provider = match[1].trim();
        console.log(`[SMART-ROUTER] Configuration dynamique: provider=${provider}`);
        return provider === 'groq';
      }
    }
  } catch (error) {
    console.warn(`[SMART-ROUTER] Erreur lecture config dynamique:`, error);
  }
  
  const useGroq = process.env.USE_GROQ === 'true';
  console.log(`[SMART-ROUTER] Configuration fallback: USE_GROQ=${useGroq}`);
  return useGroq;
}

let cachedUseGroq: boolean | null = null;
let lastConfigCheck = 0;
const CONFIG_CACHE_TTL = 2000;

function isGroqEnabled(): boolean {
  const now = Date.now();
  if (cachedUseGroq === null || now - lastConfigCheck > CONFIG_CACHE_TTL) {
    cachedUseGroq = getUseGroq();
    lastConfigCheck = now;
  }
  return cachedUseGroq;
}

// ============================================================================
// INTERFACES
// ============================================================================

interface RAGResult {
  content: string;
  metadata?: {
    source?: string;
    collection?: string;
    zone?: ZoneType;
    id?: string;
    [key: string]: any;
  };
  confidence?: number;
  score?: number;
}

interface RAGContext {
  results: RAGResult[];
  query: string;
  zones: ZoneType[];
}

// Interface pour l'intention image
export interface ImageIntentInfo {
  type: string;
  shouldDisplayImage: boolean;
  shouldSuggestImage: boolean;
  extractedEntity?: string;
  confidence: number;
}

// 🔥 INTERFACE ROUTE RESULT AVEC SUPPORT DES IMAGES ET INTENTION
export interface RouteResult {
  response: string;
  intent: IntentAnalysis;
  processingTime: number;
  hybrid?: HybridResponse;
  images?: {
    id: string;
    filename: string;
    url: string;
    thumbnailUrl: string;
    description?: string;
    confidence?: number;
    source?: string;
  }[];
  imageIntent?: ImageIntentInfo;
}

// ============================================================================
// IDENTITÉS
// ============================================================================

const AGENTIC_IDENTITY = "Tu es l'assistant IA central d'AGENTIC, une application industrielle 100% locale, hors ligne et gratuite.";

const TECHNICAL_IDENTITY = `Tu es un assistant technique expert en procédures industrielles.
## CAPACITÉS SPÉCIFIQUES
- Expertise en maintenance et exploitation de centrales
- Connaissance des procédures de démarrage/arrêt
- Capacité à détailler les étapes techniques
- Réponses précises et sourcées

## STYLE DE RÉPONSE
- Détail des étapes numérotées
- Mise en évidence des points de sécurité
- Vocabulaire technique adapté
- Réponse complète et structurée`;

const FAST_IDENTITY = `Tu es un assistant IA rapide et efficace, tournant 100% localement sur CPU.
## CAPACITÉS SPÉCIFIQUES
- Inférence rapide sur CPU x86
- Réponses concises et précises
- Temps de réponse < 25 secondes

## STYLE DE RÉPONSE
- Réponses courtes et synthétiques
- Aller droit au but
- Utiliser des listes si nécessaire
- Maximum 3-4 phrases par réponse`;

// ============================================================================
// CONFIGURATION DES MODÈLES
// ============================================================================

const MODEL_TYPE_MAP: Record<string, string> = {
  fast: LOCAL_MODEL_FAST,
  balanced: LOCAL_MODEL,
  technical: LOCAL_MODEL,
  vision: LOCAL_MODEL,
  fallback: LOCAL_MODEL_FAST
};

// ============================================================================
// MOTS-CLÉS DE DÉTENTION
// ============================================================================

const PROCEDURE_KEYWORDS = [
  'procédure', 'étape', 'guide', 'comment faire', 
  'démarrage', 'arrêt', 'crf', 'pompe', 'turbine',
  'procedure', 'demarrage', 'arret', 'maintenance',
  'réglage', 'reglage', 'paramétrage', 'parametrage'
];

const PROFILE_KEYWORDS = [
  'qui est', 'profil', 'profile', 'cv', 'curriculum', 'expérience',
  'compétence', 'parcours', 'carrière', 'technicien', 'ingénieur',
  'ressource humaine', 'équipe', 'collaborateur',
  'chef de bloc', 'chef de quart', 'chef bloc', 'chef quart',
  'responsable', 'superviseur', 'opérateur', 'operateur',
  'fiche de poste', 'fiche poste', 'poste', 'rôle', 'role',
  'attribution', 'mission', 'fonction'
];

// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

export class SmartRouter {
  private analyzer: QueryIntentAnalyzer;
  
  constructor() {
    this.analyzer = new QueryIntentAnalyzer();
  }

  private async determineMode(query: string, optionsMode?: string): Promise<'auto' | 'smart' | 'procedure' | 'profile'> {
    if (optionsMode === 'rapide') return 'smart';
    if (optionsMode === 'complexe') return 'procedure';
    
    const lowerQuery = query.toLowerCase();
    
    const isProfileQuery = PROFILE_KEYWORDS.some(keyword => lowerQuery.includes(keyword)) || /ahmed|abbès|abbes|rh|employé|salarié|collaborateur/i.test(query);
    if (isProfileQuery) {
      console.log(`[ROUTER] 👤 Détection profil prioritaire: requête RH`);
      return 'profile';
    }

    const isTechnicalCode = /[a-z]{2,}[0-9]{2,}/i.test(query);
    if (isTechnicalCode) {
      console.log(`[ROUTER] 🔧 Code technique détecté: ${query} → mode auto`);
      return 'auto';
    }
    
    const technicalKeywords = getAllTechnicalKeywords();
    const hasTechnicalTerm = technicalKeywords.some(kw => lowerQuery.includes(kw));
    
    if (hasTechnicalTerm) {
      console.log(`[ROUTER] 🔧 Terme technique détecté`);
      const isProcedure = PROCEDURE_KEYWORDS.some(kw => lowerQuery.includes(kw));
      if (isProcedure) return 'procedure';
      return 'auto';
    }
    
    try {
      const implicitMappingService = (await import('../nominal/implicit-mapping.service')).implicitMappingService;
      const implicitZone = await implicitMappingService.findZoneForQuery(query);
      
      if (implicitZone && implicitZone.confidence > 0.6) {
        console.log(`[ROUTER] 🎯 Table implicite suggère: ${implicitZone.zone} (confiance: ${implicitZone.confidence})`);
        
        if (implicitZone.zone === 'RH' || implicitZone.zone === 'HR') {
          console.log(`[ROUTER] 👤 Mode profil forcé par table implicite`);
          return 'profile';
        }
        
        const technicalZones = ['TG1', 'TG2', 'MAINTENANCE', 'PROCEDURES', 'SECURITE', 'B0_AUXILIAIRES', 'B1_HRSG_TG1', 'B2_HRSG_TG2'];
        if (technicalZones.includes(implicitZone.zone)) {
          console.log(`[ROUTER] 🔧 Mode procédural forcé par table implicite (zone: ${implicitZone.zone})`);
          return 'procedure';
        }
      }
    } catch (error) {
      console.log(`[ROUTER] ⚠️ Table implicite non disponible, poursuite détection standard`);
    }
    
    const isProcedureQuery = PROCEDURE_KEYWORDS.some(keyword => lowerQuery.includes(keyword));
    if (isProcedureQuery) {
      console.log(`[ROUTER] 🔧 Détection procédurale: mots-clés trouvés`);
      return 'procedure';
    }
    
    if (query.length < 10) return 'smart';
    return 'auto';
  }
  
  private async callLLM(
    prompt: string, 
    options: { model?: string; temperature?: number; maxTokens?: number; timeout?: number; image?: Buffer | string }
  ): Promise<string> {
    const startTime = Date.now();
    
    // Si une image est présente, on utilise obligatoirement un modèle multimodal
    if (options.image) {
      return this.callVisionLLM(prompt, options.image, options);
    }

    const useGroq = isGroqEnabled();
    const isGroqQuotaAvailable = await quotaManager.isAvailable('groq');
    
    if (useGroq && isGroqQuotaAvailable) {
      try {
        console.log(`[LLM] 🚀 Utilisation de Groq (${GROQ_MODEL})`);
        const response = await callGroq(prompt, {
          model: GROQ_MODEL,
          temperature: options.temperature || 0.3,
          maxTokens: options.maxTokens || 1000,
          timeout: 30000
        });
        console.log(`[LLM] ✅ Groq répondu en ${Date.now() - startTime}ms`);
        aiLogger.logStep(7, 'LLM', 'Inference Complete', {
          provider: 'groq',
          model: GROQ_MODEL,
          processingTime: Date.now() - startTime,
          message: `Réponse Groq générée en ${Date.now() - startTime}ms`
        });
        return response;
      } catch (error: any) {
        aiLogger.logStep(7, 'LLM', 'Provider Failure', {
          provider: 'groq',
          error: error.message,
          message: `Échec Groq, basculement vers Ollama`
        });
        console.warn(`[LLM] ⚠️ Groq échoué (${error.message}), fallback vers Ollama local...`);
      }
    }
    
    if (USE_OLLAMA) {
      console.log(`[LLM] 🖥️ Utilisation de Ollama local (${options.model || LOCAL_MODEL})`);
      const response = await callOllama(prompt, {
        model: options.model || LOCAL_MODEL,
        temperature: options.temperature || 0.3,
        maxTokens: options.maxTokens || 1000,
        timeout: options.timeout || 120000
      });

      aiLogger.logStep(7, 'LLM', 'Inference Complete', {
        provider: 'ollama',
        model: options.model || LOCAL_MODEL,
        processingTime: Date.now() - startTime,
        message: `Réponse Ollama générée en ${Date.now() - startTime}ms`
      });

      return response;
    }

    throw new Error('Aucun moteur IA disponible (Cloud désactivé/quotas atteints et Ollama local désactivé)');
  }

  /**
   * Appel spécifique pour les tâches de vision (multimodal)
   */
  async callVisionLLM(
    prompt: string, 
    image: Buffer | string,
    options: { temperature?: number; maxTokens?: number; timeout?: number } = {}
  ): Promise<string> {
    const startTime = Date.now();
    console.log(`[VISION-ROUTER] 👁️ Analyse vision demandée (Gemini 1.5 Flash)`);

    try {
      // Vérifier le quota Gemini
      const isGeminiQuotaAvailable = await quotaManager.isAvailable('gemini');
      if (!isGeminiQuotaAvailable) {
        throw new Error('Quota Gemini épuisé');
      }

      // Conversion en base64 si c'est un Buffer
      const base64Image = Buffer.isBuffer(image) ? image.toString('base64') : image;
      
      const response = await callGemini(prompt, {
        images: [base64Image],
        model: 'gemini-1.5-flash',
        temperature: options.temperature || 0.3,
        maxTokens: options.maxTokens || 1000
      });

      console.log(`[VISION-ROUTER] ✅ Analyse terminée en ${Date.now() - startTime}ms`);
      return response;
    } catch (error: any) {
      console.error(`[VISION-ROUTER] ❌ Échec Gemini Vision:`, error.message);
      
      // Fallback vers Groq (si supporté par le modèle choisi) ou message d'erreur
      console.log(`[VISION-ROUTER] 🔄 Tentative de fallback texte sur Groq...`);
      const fallbackPrompt = `${prompt}\n\n(Note: L'image n'a pas pu être traitée, analyse le contexte textuel si possible.)`;
      return this.callLLM(fallbackPrompt, options);
    }
  }
  
  async route(query: string, options?: {
    image?: Buffer | string;
    userId?: string;
    sessionId?: string;
    mode?: string;
    imagesAvailable?: number;
    explicitImageQuery?: boolean;
  }): Promise<RouteResult> {
    const startTime = Date.now();
    
    const cleanQuery = query
      .replace('--mode rapide', '')
      .replace('--mode complexe', '')
      .trim();
    
    const mode = await this.determineMode(cleanQuery, options?.mode);
    let intent = await this.analyzer.analyze(cleanQuery);
    
    // 🔥 Analyser l'intention image
    const imageIntent = imageIntentAnalyzer.analyzeImageIntent(cleanQuery);
    
    // 🔥 Force l'affichage si l'option est présente (provenant du ChatFlow)
    if (options?.explicitImageQuery) {
      console.log(`[SMART-ROUTER] 📸 Force shouldDisplayImage=true via options`);
      imageIntent.shouldDisplayImage = true;
      if (imageIntent.type === ImageIntentType.NONE) {
        imageIntent.type = ImageIntentType.DISPLAY;
      }
    }
    
    console.log(`[SMART-ROUTER] 🖼️ Intention image: ${imageIntent.type}, confiance: ${imageIntent.confidence}`);
    if (imageIntent.extractedEntity) {
      console.log(`[SMART-ROUTER]    - Entité extraite: ${imageIntent.extractedEntity}`);
    }
    
    const technicalKeywords = getAllTechnicalKeywords();
    const hasTechnicalTerm = technicalKeywords.some(kw => cleanQuery.toLowerCase().includes(kw));
    const isEmployeeProfile = /ahmed|abbès|abbes|rh|employé|salarié|collaborateur|qui est/i.test(cleanQuery);
    if (intent.category === 'profile' && hasTechnicalTerm && !isEmployeeProfile) {
      console.log(`[ROUTER] ⚠️ Requête technique (${cleanQuery}) classée comme profil → correction vers ${QueryCategory.PROCEDURE}`);
      intent.category = QueryCategory.PROCEDURE;
      intent.confidence = Math.max(intent.confidence, 0.6);
      intent.relevantZones = ['SHARED', 'B0_AUXILIAIRES'];
      intent.detectedZone = 'SHARED';
    }
    
    const useGroq = isGroqEnabled();
    const providerName = useGroq ? `Groq (${GROQ_MODEL})` : `Ollama (${LOCAL_MODEL})`;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 SECTION 5 – Routage et sélection du modèle');
    console.log(`📌 Provider actif: ${useGroq ? 'GROQ (cloud)' : 'OLLAMA (local)'}`);
    console.log('📌 Mode initial :', mode);
    
    const isFastMode = mode === 'smart' || (mode === 'auto' && intent.complexity === 'simple' && intent.confidence > 0.6);
    const finalModel = isFastMode ? `${providerName} - Rapide` : `${providerName} - Standard`;
    
    console.log('🤖 Modèle final choisi :', finalModel);
    console.log('📂 Zones cibles :', intent.relevantZones.join(', '));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    aiLogger.logStep(1, 'INTENT', 'Query Analysis', {
      query: cleanQuery,
      message: `Analyse de l'intention pour: "${cleanQuery.substring(0, 30)}..."`,
      mode,
      intentCategory: intent.category,
      complexity: intent.complexity,
      detectedZone: intent.detectedZone
    });

    aiLogger.logStep(5, 'ROUTER', 'Model Selection', {
      finalModel,
      provider: useGroq ? 'groq' : 'ollama',
      message: `Modèle sélectionné: ${finalModel} (${useGroq ? 'GROQ' : 'OLLAMA'})`
    });
    
    console.log(`[ROUTER] Intent: ${intent.category} (${(intent.confidence * 100).toFixed(0)}%)`);
    if (intent.detectedZone) console.log(`[ROUTER] Zone détectée: ${intent.detectedZone}`);
    if (intent.relevantZones.length) console.log(`[ROUTER] Zones pertinentes: ${intent.relevantZones.join(', ')}`);
    
    let response: string;
    let images: { id: string; filename: string; url: string; thumbnailUrl: string; description?: string; confidence?: number; source?: string }[] | undefined;
    const imagesCount = options?.imagesAvailable || 0;
    const explicitImage = options?.explicitImageQuery || false;
    
    try {
      if (mode === 'profile') {
        console.log(`[ROUTER] Mode: Profil (recherche dans zone RH)`);
        response = await this.handleProfileQuery(cleanQuery, intent);
      } else if (mode === 'procedure') {
        console.log(`[ROUTER] Mode: Procédural`);
        const result = await this.handleTechnicalQuery(cleanQuery, intent, imagesCount, explicitImage);
        response = result.response;
        images = result.images;
      } else if (mode === 'smart') {
        console.log(`[ROUTER] Mode: Smart rapide`);
        response = await this.handleFastQuery(cleanQuery);
      } else {
        const isFastModeLocal = intent.complexity === 'simple' && intent.confidence > 0.6;
        console.log(`[ROUTER] Mode: ${isFastModeLocal ? 'Rapide' : 'Complexe'}`);
        
        if (isFastModeLocal) {
          response = await this.handleFastQuery(cleanQuery);
        } else {
          switch (intent.category) {
            case 'greeting':
              response = await this.handleGreeting();
              break;
            case 'profile':
            case 'procedure':
            case 'equipment':
            case 'maintenance':
            case 'security':
              const result = await this.handleTechnicalQuery(cleanQuery, intent, imagesCount, explicitImage);
              response = result.response;
              images = result.images;
              break;
            case 'performance':
              response = await this.handlePerformanceQuery(cleanQuery, intent);
              break;
            case 'training':
              response = await this.handleTrainingQuery(cleanQuery, intent);
              break;
            default:
              response = await this.handleGeneralQuery(cleanQuery);
          }
        }
      }
    } catch (error: any) {
      console.error('[ROUTER] Erreur lors du routage:', error);
      response = `Je suis désolé, une erreur est survenue lors du traitement de votre demande: ${error.message}`;
    }
    
    if (options?.image && (intent.needsVision || options.image) && response) {
      try {
        response = await this.enrichWithVision(response, options.image);
      } catch (visionError: any) {
        console.error('[ROUTER] Erreur vision:', visionError);
        response = `${response}\n\n⚠️ *Analyse visuelle indisponible:* ${visionError.message}`;
      }
    }
    
    // 🔥 Inclure l'intention image dans le résultat
    const imageIntentInfo: ImageIntentInfo = {
      type: imageIntent.type,
      shouldDisplayImage: imageIntent.shouldDisplayImage,
      shouldSuggestImage: imageIntent.shouldSuggestImage,
      extractedEntity: imageIntent.extractedEntity,
      confidence: imageIntent.confidence
    };
    
    return {
      response,
      intent,
      processingTime: Date.now() - startTime,
      images,
      imageIntent: imageIntentInfo
    };
  }

  private async handleFastQuery(query: string): Promise<string> {
    const prompt = `${FAST_IDENTITY}

MODE RAPIDE - Réponse concise

Question: ${query}

Réponse courte et synthétique (max 4 phrases):`;
    
    return await this.callLLM(prompt, {
      model: MODEL_TYPE_MAP.fast,
      temperature: 0.3,
      maxTokens: 300,
      timeout: 60000
    });
  }
  
  private async handleGreeting(): Promise<string> {
    const greetings = [
      "Bonjour! Je suis l'assistant AGENTIC. Comment puis-je vous aider aujourd'hui?",
      "Bonjour! Je suis votre assistant industriel local. Comment puis-je vous être utile?",
      "Bienvenue sur AGENTIC. Je suis prêt pour vos analyses techniques."
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  private async handleProfileQuery(query: string, _intent: IntentAnalysis): Promise<string> {
    try {
      console.log(`[PROFILE] Recherche de profil dans zone RH: ${query}`);
      
      const targetZone: ZoneType = 'RH';
      
      const searchResults = await searchIntelligent(query, {
        userProfile: 'chef_quart',
        nResults: 15,
        minConfidence: 0.2,
        zone: targetZone
      });
      
      if (searchResults.length === 0) {
        return `⚠️ **Aucune information trouvée dans la zone RH** pour la requête : *"${query}"*\n\n` +
          `Cela peut signifier que :\n` +
          `- Le document correspondant n'a pas encore été intégré dans la base documentaire\n` +
          `- Le nom ou l'intitulé est orthographié différemment dans les documents\n\n` +
          `💡 **Actions recommandées :**\n` +
          `1. Vérifiez que le document RH a bien été uploadé dans **Administration → Documents → RH**\n` +
          `2. Relancez une recherche avec des mots-clés différents`;
      }
      
      const mergedContent = searchResults.map((r: any) => r.content).join('\n\n');
      console.log(`[PROFILE] ${searchResults.length} chunks fusionnés en ${mergedContent.length} caractères`);
      
      const ragContext: RAGContext = {
        results: [{
          content: mergedContent,
          metadata: searchResults[0]?.metadata,
          confidence: Math.max(...searchResults.map((r: any) => r.confidence || 0))
        }],
        query: query,
        zones: [targetZone]
      };
      
      aiLogger.logStep(2, 'RAG', 'Profile Search', {
        query,
        targetZone,
        message: `Recherche de profils dans la zone ${targetZone}`
      });
      const prompt = this.buildProfilePrompt(query, ragContext);
      
      const response = await this.callLLM(prompt, {
        temperature: 0.3,
        maxTokens: 2500,
        timeout: 120000
      });
      
      return `${response}\n\n📚 *Sources locales: RH*`;
      
    } catch (error: any) {
      console.error('[ROUTER] Erreur profil:', error);
      return `Je suis désolé, une erreur est survenue lors de la recherche du profil: ${error.message}`;
    }
  }
  
  private async handleTechnicalQuery(
    query: string, 
    _intent: IntentAnalysis, 
    imagesAvailable: number = 0, 
    explicitImage: boolean = false
  ): Promise<{ response: string; images?: { id: string; filename: string; url: string; thumbnailUrl: string; description?: string; confidence?: number; source?: string }[] }> {
    try {
      console.log(`[TECH] Recherche RAG dans toutes les zones pertinentes + SHARED`);

      let searchResults = await searchIntelligent(query, {
        userProfile: 'chef_quart',
        nResults: 10,
        minConfidence: 0.3
      });

      const foundImages: { id: string; filename: string; url: string; thumbnailUrl: string; description?: string; confidence?: number; source?: string }[] = [];
      for (const result of searchResults) {
        const anyResult = result as any;
        if (anyResult.isImage === true || anyResult.imageId || result.metadata?.isImage === true) {
          const imageId = anyResult.imageId || result.metadata?.imageId;
          if (imageId) {
            foundImages.push({
              id: imageId,
              filename: result.metadata?.filename || result.metadata?.imageFilename || 'Image',
              description: result.metadata?.description || '',
              url: anyResult.imageUrl || `/api/vision/images/${imageId}`,
              thumbnailUrl: anyResult.imageThumbnailUrl || `/api/vision/images/${imageId}?thumbnail=true`,
              confidence: result.confidence,
              source: result.source
            });
          }
        }
      }

      console.log(`[TECH] 🔍 ${searchResults.length} résultats RAG, dont ${foundImages.length} image(s)`);

      const hasShared = searchResults.some(r => r.metadata?.zone === 'SHARED' || r.source === 'SHARED');
      if (!hasShared) {
        console.log(`[TECH] SHARED absent, recherche complémentaire dans SHARED`);
        const sharedResults = await searchIntelligent(query, {
          userProfile: 'chef_quart',
          nResults: 5,
          minConfidence: 0.3,
          zone: 'SHARED'
        });
        
        for (const result of sharedResults) {
          const anyResult = result as any;
          if (anyResult.isImage === true || anyResult.imageId || result.metadata?.isImage === true) {
            const imageId = anyResult.imageId || result.metadata?.imageId;
            if (imageId && !foundImages.some(img => img.id === imageId)) {
              foundImages.push({
                id: imageId,
                filename: result.metadata?.filename || result.metadata?.imageFilename || 'Image',
                description: result.metadata?.description || '',
                url: anyResult.imageUrl || `/api/vision/images/${imageId}`,
                thumbnailUrl: anyResult.imageThumbnailUrl || `/api/vision/images/${imageId}?thumbnail=true`,
                confidence: result.confidence,
                source: result.source
              });
            }
          }
        }
        
        searchResults = [...searchResults, ...sharedResults];
      }

      const seen = new Set<string>();
      searchResults = searchResults.filter(r => {
        const key = r.content.substring(0, 200);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (explicitImage && foundImages.length > 0) {
        console.log(`[TECH] 📸 Requête image explicite avec ${foundImages.length} image(s) trouvée(s) → retour direct`);
        
        // 🔥 Filtrage par pertinence relative pour éviter les hors-sujets
        // On trie par confiance décroissante
        const sortedImages = [...foundImages].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        const bestScore = sortedImages[0].confidence || 0;
        
        // On ne garde que les images qui sont au moins à 85% du score de la meilleure image
        // ET qui ont un score minimal de 0.45 pour garantir la qualité
        const relevantImages = sortedImages.filter(img => 
          (img.confidence || 0) >= Math.max(0.45, bestScore * 0.85)
        ).slice(0, 3);

        const responses = [
          "Voici l'image que vous avez demandée :",
          "Bien sûr, voici l'image demandée :",
          "Voici le visuel correspondant à votre demande :",
          "Voici l'image pour illustrer votre demande :"
        ];
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];

        return {
          response: randomResponse,
          images: relevantImages
        };
      }

      if (searchResults.length === 0) {
        if (explicitImage && imagesAvailable > 0) {
          return {
            response: "Voici l'image correspondante :",
            images: []
          };
        }
        return {
          response: "Je ne trouve pas cette information dans la base locale.",
          images: []
        };
      }

      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3 && !this.isStopWord(w));

      let bestScore = 0;
      for (const result of searchResults) {
        const contentLower = result.content.toLowerCase();
        let matchCount = 0;
        for (const word of queryWords) {
          if (contentLower.includes(word)) matchCount++;
        }
        const score = matchCount / Math.max(1, queryWords.length);
        if (score > bestScore) bestScore = score;
      }

      if (bestScore < 0.3 && queryWords.length > 0) {
        console.log(`[TECH] Pertinence insuffisante (${(bestScore*100).toFixed(0)}%) pour: ${queryWords.join(', ')}`);
        if (explicitImage && imagesAvailable > 0) {
          return {
            response: "Voici l'image correspondante :",
            images: foundImages
          };
        }
        if (foundImages.length > 0) {
          console.log(`[TECH] 🔄 Fallback: ${foundImages.length} image(s) disponible(s) malgré pertinence faible`);
          return {
            response: `Voici des images liées à votre recherche :`,
            images: foundImages.slice(0, 3)
          };
        }
        return {
          response: "Je ne trouve pas cette information dans la base locale.",
          images: []
        };
      }

      const ragContext: RAGContext = {
        results: searchResults.slice(0, 7).map(r => ({
          content: r.content,
          metadata: r.metadata,
          confidence: r.confidence
        })),
        query: query,
        zones: []
      };

      if (foundImages.length > 0 && !explicitImage) {
        console.log(`[TECH] 🖼️ ${foundImages.length} image(s) disponible(s) pour enrichissement`);
      }

      const prompt = this.buildTechnicalPrompt(query, ragContext, foundImages.length, explicitImage);
      const totalContextLength = ragContext.results.reduce((acc, r) => acc + (r.content?.length || 0), 0);
      console.log(`[TECH] Contexte pertinent (score ${(bestScore*100).toFixed(0)}%) : ${ragContext.results.length} documents, ${totalContextLength} caractères`);

      const response = await this.callLLM(prompt, {
        temperature: 0.3,
        maxTokens: 500,
        timeout: 120000
      });

      if (response.length < 20 ||
          response.toLowerCase().includes("je suis désolé") ||
          response.toLowerCase().includes("je ne peux pas") ||
          response.toLowerCase().includes("pas d'image") ||
          response.toLowerCase().includes("pas d\u2019image") ||
          response.toLowerCase().includes("impossible d'afficher") ||
          response.toLowerCase().includes("n'est pas fourni")) {
        
        if (foundImages.length > 0) {
          console.log(`[TECH] 🔄 LLM a refusé/répondu erreur, fallback vers affichage direct des images`);
          return {
            response: `Voici les images disponibles pour "${query}" :`,
            images: foundImages.slice(0, 3)
          };
        }
        if (explicitImage && imagesAvailable > 0) {
          return {
            response: "Voici l'image correspondante :",
            images: foundImages
          };
        }
        return {
          response: "Je ne trouve pas cette information dans la base locale.",
          images: []
        };
      }

      const sources = Array.from(new Set(ragContext.results.map(r => r.metadata?.zone || 'Document'))).join(', ');
      
      let finalResponse = `${response}\n\n📚 *Sources locales: ${sources}*`;
      
      if (foundImages.length > 0) {
        finalResponse += `\n\n🖼️ *${foundImages.length} image(s) disponible(s)*\nDemandez "affiche l'image" pour les visualiser.`;
      }
      
      return {
        response: finalResponse,
        images: foundImages.length > 0 ? foundImages.slice(0, 3) : []
      };

    } catch (error: any) {
      console.error('[ROUTER] Erreur technique:', error);
      return {
        response: `Je suis désolé, une erreur est survenue: ${error.message}`,
        images: []
      };
    }
  }
  
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'dans', 'pour', 'avec', 'sans', 'sur', 'sous', 'les', 'des', 'une', 'cette',
      'cet', 'ces', 'cela', 'cette', 'pour', 'par', 'mais', 'donc', 'car', 'si',
      'alors', 'ainsi', 'comme', 'entre', 'vers', 'depuis', 'pendant', 'toujours',
      'jamais', 'très', 'trop', 'peu', 'beaucoup', 'assez', 'environ', 'juste',
      'même', 'seulement', 'si', 'quand', 'lorsque', 'parce', 'que', 'est', 'sont',
      'ont', 'fait', 'faire', 'avoir', 'être', 'aller', 'venir', 'tenir', 'mettre',
      'prendre', 'donner', 'voir', 'savoir', 'pouvoir', 'vouloir', 'devoir', 'falloir',
      'sembler', 'paraître', 'rester', 'devenir', 'passer', 'laisser', 'trouver',
      'rendre', 'appeler', 'penser', 'croire', 'regarder', 'écouter', 'demander',
      'répondre', 'comprendre', 'expliquer', 'montrer', 'donner', 'recevoir'
    ]);
    return stopWords.has(word);
  }

  private async handlePerformanceQuery(query: string, _intent: IntentAnalysis): Promise<string> {
    try {
      const targetZone: ZoneType = 'SHARED';
      
      const searchResults = await searchIntelligent(query, {
        userProfile: "chef_quart",
        nResults: 5,
        minConfidence: 0.4,
        zone: targetZone
      });
      
      const ragContext: RAGContext = {
        results: searchResults.map((r: any) => ({ content: r.content, metadata: r.metadata, confidence: r.confidence })),
        query: query,
        zones: [targetZone]
      };
      
      const prompt = this.buildPerformancePrompt(query, ragContext);
      
      return await this.callLLM(prompt, {
        temperature: 0.2,
        maxTokens: 1000,
        timeout: 60000
      });
      
    } catch (error: any) {
      console.error('[ROUTER] Erreur performance:', error);
      return `Je suis désolé, une erreur est survenue lors de l'analyse des performances: ${error.message}`;
    }
  }
  
  private async handleTrainingQuery(query: string, _intent: IntentAnalysis): Promise<string> {
    try {
      const targetZone: ZoneType = 'SHARED';
      
      const searchResults = await searchIntelligent(query, {
        userProfile: "chef_quart",
        nResults: 5,
        minConfidence: 0.5,
        zone: targetZone
      });
      
      const documents = searchResults.map((r: any) => r.content).join('\n- ');
      
      const prompt = `Tu es un formateur expert en centrales électriques.
    
Question: ${query}

Documents de formation disponibles:
- ${documents || 'Aucun document spécifique trouvé.'}

Réponds de manière pédagogique, avec des exemples concrets et des conseils pratiques.
Structure ta réponse en étapes claires si applicable.`;
      
      return await this.callLLM(prompt, {
        temperature: 0.5,
        maxTokens: 1000,
        timeout: 60000
      });
      
    } catch (error: any) {
      console.error('[ROUTER] Erreur formation:', error);
      return `Je suis désolé, une erreur est survenue lors de la recherche de formation: ${error.message}`;
    }
  }
  
  private async handleGeneralQuery(query: string): Promise<string> {
    try {
      const searchResults = await searchIntelligent(query, {
        userProfile: 'chef_quart',
        nResults: 3,
        minConfidence: 0.3,
        zone: 'SHARED'
      });
      
      const context = searchResults.map((r: any) => r.content).join('\n');
      
      const prompt = `Question générale: ${query}
    
Contexte disponible: ${context || 'Aucun document spécifique trouvé.'}

Fournis une réponse informative et utile. Si tu n'as pas d'informations spécifiques, donne des conseils généraux.`;
      
      return await this.callLLM(prompt, {
        temperature: 0.5,
        maxTokens: 500,
        timeout: 60000
      });
      
    } catch (error: any) {
      console.error('[ROUTER] Erreur générale:', error);
      return `Je suis désolé, une erreur est survenue: ${error.message}`;
    }
  }
  
  private buildTechnicalPrompt(query: string, ragContext: RAGContext, imagesAvailable: number = 0, explicitImage: boolean = false): string {
    const documents = ragContext.results.map((result: RAGResult, index: number) => 
      `DOCUMENT ${index + 1} (Zone: ${result.metadata?.zone || 'SHARED'}):\n${result.content}`
    ).join('\n\n');
    
    console.log(`[BUILD_PROMPT] Documents inclus: ${ragContext.results.length}, longueur: ${documents.length}`);
    
    const imagesSection = imagesAvailable > 0 ? `
========================================
IMAGES DISPONIBLES
========================================
${imagesAvailable} image(s) sont associées à ce sujet.
📸 Pour visualiser ces images, demandez "affiche l'image" ou "montre le schéma".
` : '';

    const antiHallucinationRule = explicitImage && imagesAvailable > 0 ? `
⚠️ **RÈGLE ABSOLUE (REQUÊTE IMAGE)** ⚠️
- L'utilisateur demande EXPLICITEMENT à voir une image.
- Le système va automatiquement afficher l'image après ta réponse.
- Tu DOIS répondre de manière très concise (ex: "Voici l'image demandée :").
- NE dis JAMAIS que tu ne peux pas afficher l'image ou que tu n'as pas d'API.
` : `
⚠️ **RÈGLE ABSOLUE** ⚠️
- Si le contexte ci-dessus ne contient AUCUNE information répondant à la question, tu DOIS répondre exactement :
  "Je ne trouve pas cette information dans la base locale."
- N'ajoute aucune explication, suggestion ou phrase supplémentaire.
- Ne reformule pas la question.
- Ne donne pas d'exemples génériques.
- Si tu as le moindre doute, réponds "Je ne trouve pas cette information dans la base locale."
`;

    return `${TECHNICAL_IDENTITY}

${AGENTIC_IDENTITY}

${antiHallucinationRule}

========================================
CONTEXTE TECHNIQUE (RAG - ${ragContext.results.length} documents)
========================================

${documents}

${imagesSection}

========================================
INSTRUCTIONS STRICTES
========================================
1. UTILISE UNIQUEMENT les informations du contexte ci-dessus.
2. Si l'information n'est PAS dans le contexte, réponds: "Je ne trouve pas cette information dans la base locale."
3. Ne PAS inventer ou halluciner des procédures.
4. Structure la réponse avec des étapes numérotées si c'est une procédure.
5. Adapte la réponse à la langue de l'utilisateur.
${!explicitImage && imagesAvailable > 0 ? `6. 🔥 S'il y a des images disponibles (${imagesAvailable}), mentionne-le à la fin de ta réponse avec : "📸 Des images sont disponibles. Demandez 'affiche l'image' pour les visualiser."` : ''}
${explicitImage && imagesAvailable > 0 ? `6. 🔥 L'utilisateur veut voir une image. Dis simplement "Voici l'image" sans aucun détail supplémentaire. Elle s'affichera automatiquement.` : ''}

========================================
QUESTION DE L'OPÉRATEUR
========================================
${query}

========================================
RÉPONSE AGENTIC (basée UNIQUEMENT sur le contexte)
========================================`;
  }

  private buildProfilePrompt(query: string, ragContext: RAGContext): string {
    const documents = ragContext.results.map((result: RAGResult, index: number) => 
      `DOCUMENT ${index + 1} (Zone: ${result.metadata?.zone || 'RH'}):\n${result.content}`
    ).join('\n\n');
    
    return `${AGENTIC_IDENTITY}

========================================
CONTEXTE - RESSOURCES HUMAINES (Zone RH)
========================================

${documents}

========================================
INSTRUCTIONS STRICTES
========================================
1. Tu dois répondre UNIQUEMENT à la question : "${query}"
2. Utilise EXCLUSIVEMENT les informations présentes dans le contexte ci-dessus.
3. Extrais TOUTES les informations pertinentes concernant la personne ou le poste demandé.
4. Structure ta réponse en sections selon les informations disponibles :
   - INFORMATIONS PERSONNELLES
   - COMPÉTENCES TECHNIQUES
   - EXPÉRIENCE PROFESSIONNELLE
   - FORMATION
   - LANGUES
   - CERTIFICATIONS
5. Si une section n'est pas présente dans le contexte, NE L'INVENTE PAS.
6. N'ajoute AUCUNE information sur AGENTIC lui-même. Réponds UNIQUEMENT sur ce qui est demandé.
7. Réponds TOUJOURS en français.

========================================
RÉPONSE (basée UNIQUEMENT sur le contexte ci-dessus)
========================================`;
  }
  
  private buildPerformancePrompt(query: string, ragContext: RAGContext): string {
    const data = ragContext.results.map((r: RAGResult) => r.content.substring(0, 300)).join('\n');
    
    return `Tu es un analyste de performance pour centrale électrique.
    
Question: ${query}

Données de performance disponibles:
${data || 'Aucune donnée spécifique trouvée.'}

Fournis une analyse avec:
- Indicateurs clés identifiés
- Tendances observées
- Recommandations d'optimisation
- Points d'attention

Analyse:`;
  }
  
  private async enrichWithVision(response: string, imageData: Buffer | string): Promise<string> {
    try {
      const visionPrompt = `${AGENTIC_IDENTITY}
      
RÔLE: Expert en Vision Industrielle (Gemini 1.5 Flash).
FONCTION: Analyser l'image technique pour identifier des composants, des défauts ou des états opérationnels.
CONTEXTE PRÉCÉDENT: ${response.substring(0, 500)}...

INSTRUCTIONS:
1. Analyse l'image fournie.
2. Identifie les éléments clés liés à la demande de l'utilisateur.
3. Propose un diagnostic technique précis.
4. Si tu vois des anomalies (fuites, corrosion, alarmes SCADA), signale-les immédiatement.

SORTIE REQUISE: Un rapport structuré "Analyse Visuelle" concis et pertinent.`;
      
      const visionAnalysis = await this.callVisionLLM(visionPrompt, imageData, {
        temperature: 0.3,
        maxTokens: 600
      });
      
      return `${response}\n\n🔍 **DIAGNOSTIC VISION INDUSTRIELLE**\n${visionAnalysis}`;
      
    } catch (error: any) {
      console.error('[ROUTER] Erreur vision:', error);
      throw error;
    }
  }
  async getIntentInfo(query: string): Promise<IntentAnalysis> {
    return await this.analyzer.analyze(query);
  }
  
  async getRecommendations(query: string): Promise<string[]> {
    const intent = await this.analyzer.analyze(query);
    const suggestions: Record<string, string[]> = {
      greeting: ['Comment démarrer la turbine?', 'État des équipements', 'Procédures d\'urgence'],
      procedure: ['Afficher les étapes', 'Démarrer le guide', 'Voir la documentation'],
      equipment: ['Maintenance préventive', 'Paramètres techniques', 'Historique pannes'],
      maintenance: ['Planification maintenance', 'Outils nécessaires', 'Consignes sécurité'],
      security: ['POUI à jour', 'EPI requis', 'Procédures d\'urgence'],
      performance: ['KPI mensuels', 'Optimisation rendement', 'Benchmark'],
      training: ['Modules disponibles', 'Prochaines sessions', 'Certifications'],
      profile: ['Compétences', 'Expérience professionnelle', 'Formation continue'],
      general: ['Documentation technique', 'Support', 'FAQ']
    };
    return suggestions[intent.category] || suggestions.general;
  }
}

export const smartRouter = new SmartRouter();