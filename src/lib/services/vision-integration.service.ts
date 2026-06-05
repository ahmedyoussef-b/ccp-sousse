/**
 * Vision Integration Service - Service d'intégration avancé pour exploitation optimale des fonctionnalités vision
 * @version 1.0.2
 * @description Service qui améliore l'API chat avec une intégration intelligente de la vision
 */

import { ImageMetadata, PartLocationResult } from '@/components/vision/shared/types/type';
import { VisionSearchResult } from '@/types/vision';
import visionService from '@/lib/services/visionService';

export interface VisionIntegrationContext {
  query: string;
  hasImageIntent: boolean;
  hasLocationIntent: boolean;
  hasSearchIntent: boolean;
  hasAnalysisIntent: boolean;
  confidence: number;
  suggestedActions: string[];
}

export interface EnhancedVisionResponse {
  originalResponse: string;
  visionEnrichment: {
    images?: ImageMetadata[];
    searchResults?: VisionSearchResult;
    partLocation?: PartLocationResult;
    suggestions?: string[];
    actions?: Array<{
      type: string;
      label: string;
      description: string;
    }>;
  };
  metadata: {
    visionUsed: boolean;
    processingTime: number;
    confidence: number;
    enriched: boolean;
  };
}

export class VisionIntegrationService {
  private initialized = false;

  constructor() {
    // Utilisation de visionService directement (pas de VisionAgent qui contient des hooks React)
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialiser le service de vision sous-jacent
      await visionService.init();
      this.initialized = true;
      console.log('[VISION-INTEGRATION] Service initialisé avec succès');
    } catch (error) {
      console.error('[VISION-INTEGRATION] Erreur initialisation:', error);
      throw error;
    }
  }

  /**
   * Analyse intelligente du contexte de la requête pour détecter les intentions vision
   */
  analyzeQueryContext(query: string): VisionIntegrationContext {
    const lowerQuery = query.toLowerCase();

    // Mots-clés pour détecter les intentions
    const imageKeywords = ['image', 'photo', 'visuel', 'capture', 'voir', 'montre', 'affiche'];
    const locationKeywords = ['où', 'position', 'localisation', 'emplacement', 'trouver', 'situe', 'place', 'coordonnées'];
    const searchKeywords = ['chercher', 'rechercher', 'trouver', 'similaire', 'pareil', 'comme', 'ressemble'];
    const analysisKeywords = ['analyser', 'analyse', 'état', 'condition', 'problème', 'anomalie', 'défaut', 'diagnostic'];

    const hasImageIntent = imageKeywords.some(k => lowerQuery.includes(k));
    const hasLocationIntent = locationKeywords.some(k => lowerQuery.includes(k));
    const hasSearchIntent = searchKeywords.some(k => lowerQuery.includes(k));
    const hasAnalysisIntent = analysisKeywords.some(k => lowerQuery.includes(k));

    let confidence = 0.2;
    const suggestedActions: string[] = [];

    if (hasImageIntent) confidence += 0.25;
    if (hasLocationIntent) confidence += 0.3;
    if (hasSearchIntent) confidence += 0.25;
    if (hasAnalysisIntent) confidence += 0.2;

    if (hasLocationIntent) {
      suggestedActions.push('Localisation de composants');
      suggestedActions.push('Positionnement précis');
    }
    if (hasSearchIntent) {
      suggestedActions.push('Recherche d\'images similaires');
      suggestedActions.push('Comparaison visuelle');
    }
    if (hasAnalysisIntent) {
      suggestedActions.push('Analyse d\'état');
      suggestedActions.push('Détection d\'anomalies');
    }
    if (hasImageIntent) {
      suggestedActions.push('Traitement d\'images');
      suggestedActions.push('Classification automatique');
    }

    return {
      query,
      hasImageIntent,
      hasLocationIntent,
      hasSearchIntent,
      hasAnalysisIntent,
      confidence: Math.min(confidence, 1.0),
      suggestedActions
    };
  }

  async enrichResponse(
    originalResponse: string,
    context: VisionIntegrationContext
  ): Promise<EnhancedVisionResponse> {
    const startTime = Date.now();
    const enrichment: EnhancedVisionResponse['visionEnrichment'] = {};

    try {
      await this.initialize();

      // 1. RECHERCHE D'IMAGES si pertinent
      if (context.hasSearchIntent || context.hasImageIntent) {
        console.log('[VISION-INTEGRATION] 🔍 Recherche d\'images pour enrichissement');

        try {
          // Utiliser visionService pour lister les images correspondant au contexte
          const images = await visionService.listImages();
          
          if (images && images.length > 0) {
            // Filtrer par pertinence (tags, description)
            const relevantImages = images
              .filter((img: any) => {
                const searchText = context.query.toLowerCase();
                const tags = (img.tags || []).join(' ').toLowerCase();
                const desc = (img.description || '').toLowerCase();
                const filename = (img.filename || '').toLowerCase();
                return tags.includes(searchText) || desc.includes(searchText) || filename.includes(searchText);
              })
              .slice(0, 3);

            if (relevantImages.length > 0) {
              enrichment.images = relevantImages.map((img: any) => ({
                id: img.id,
                filename: img.filename || 'image.jpg',
                path: img.filepath || '',
                tags: img.tags || [],
                description: img.description || '',
                createdAt: img.createdAt || new Date().toISOString(),
                equipmentState: img.equipmentState || 'unknown'
              }));
            }
          }
        } catch (searchError) {
          console.warn('[VISION-INTEGRATION] Erreur recherche images:', searchError);
        }
      }

      // 2. LOCALISATION DE PIÈCES si demandé
      if (context.hasLocationIntent) {
        console.log('[VISION-INTEGRATION] 📍 Préparation localisation de pièces');
        enrichment.actions = [
          {
            type: 'locate',
            label: 'Localiser dans une image',
            description: 'Sélectionnez une image pour localiser des composants spécifiques'
          }
        ];
      }

      // 3. SUGGESTIONS D'ANALYSE
      if (context.hasAnalysisIntent || enrichment.images) {
        enrichment.suggestions = [
          'Analyser l\'état des équipements visibles',
          'Comparer avec des images de référence',
          'Générer un rapport de diagnostic visuel'
        ];
      }

      // 4. ACTIONS GÉNÉRIQUES
      enrichment.actions = enrichment.actions || [];
      enrichment.actions.push(
        {
          type: 'search',
          label: 'Rechercher plus d\'images',
          description: 'Étendre la recherche à plus d\'images similaires'
        },
        {
          type: 'upload',
          label: 'Uploader une image',
          description: 'Ajouter une nouvelle image pour analyse'
        }
      );

    } catch (error) {
      console.error('[VISION-INTEGRATION] Erreur enrichissement:', error);
    }

    const processingTime = Date.now() - startTime;
    const enriched = Object.keys(enrichment).length > 0;

    return {
      originalResponse,
      visionEnrichment: enrichment,
      metadata: {
        visionUsed: enriched,
        processingTime,
        confidence: context.confidence,
        enriched
      }
    };
  }

  formatEnhancedResponse(enhancedResponse: EnhancedVisionResponse): string {
    let formattedResponse = enhancedResponse.originalResponse;

    if (!enhancedResponse.metadata.enriched) {
      return formattedResponse;
    }

    const enrichment = enhancedResponse.visionEnrichment;

    if (enrichment.images && enrichment.images.length > 0) {
      formattedResponse += '\n\n---\n\n';
      formattedResponse += '🖼️ **Images pertinentes trouvées**\n\n';

      enrichment.images.forEach((image, idx) => {
        formattedResponse += `${idx + 1}. **${image.filename}**\n`;
        if (image.equipmentState) {
          formattedResponse += `   • État: ${image.equipmentState}\n`;
        }
        if (image.tags && image.tags.length > 0) {
          formattedResponse += `   • Tags: ${image.tags.slice(0, 3).join(', ')}\n`;
        }
        if (image.location) {
          formattedResponse += `   • Localisation: ${image.location}\n`;
        }
        formattedResponse += `   • [Voir l'image](/api/vision/images/${image.id})\n\n`;
      });
    }

    if (enrichment.suggestions && enrichment.suggestions.length > 0) {
      formattedResponse += '\n\n💡 **Suggestions d\'analyse**\n';
      enrichment.suggestions.forEach(suggestion => {
        formattedResponse += `• ${suggestion}\n`;
      });
    }

    if (enrichment.actions && enrichment.actions.length > 0) {
      formattedResponse += '\n\n⚡ **Actions disponibles**\n';
      enrichment.actions.forEach(action => {
        formattedResponse += `• **${action.label}**: ${action.description}\n`;
      });
    }

    formattedResponse += '\n\n---\n';
    formattedResponse += `🤖 *Réponse enrichie par l\'IA Vision* | `;
    formattedResponse += `⏱️ ${enhancedResponse.metadata.processingTime}ms | `;
    formattedResponse += `🎯 ${(enhancedResponse.metadata.confidence * 100).toFixed(0)}% confiance`;

    return formattedResponse;
  }

  async processQuery(query: string): Promise<{
    response: string;
    context: VisionIntegrationContext;
    enrichment: EnhancedVisionResponse;
  }> {
    const startTime = Date.now();

    try {
      const context = this.analyzeQueryContext(query);
      console.log(`[VISION-INTEGRATION] Contexte analysé: ${context.confidence.toFixed(2)} confiance`);

      let baseResponse = `Je comprends votre question concernant "${query}". `;

      if (context.hasSearchIntent) {
        baseResponse += 'Je vais rechercher des éléments visuels pertinents. ';
      }
      if (context.hasLocationIntent) {
        baseResponse += 'Pour la localisation, j\'aurai besoin d\'une image de référence. ';
      }
      if (context.hasAnalysisIntent) {
        baseResponse += 'L\'analyse intelligente est activée pour cette requête. ';
      }

      const enrichment = await this.enrichResponse(baseResponse, context);
      const finalResponse = this.formatEnhancedResponse(enrichment);

      console.log(`[VISION-INTEGRATION] Requête traitée en ${Date.now() - startTime}ms`);

      return {
        response: finalResponse,
        context,
        enrichment
      };

    } catch (error) {
      console.error('[VISION-INTEGRATION] Erreur traitement requête:', error);

      return {
        response: `Désolé, une erreur est survenue lors du traitement de votre requête "${query}". Veuillez réessayer.`,
        context: {
          query,
          hasImageIntent: false,
          hasLocationIntent: false,
          hasSearchIntent: false,
          hasAnalysisIntent: false,
          confidence: 0.1,
          suggestedActions: []
        },
        enrichment: {
          originalResponse: '',
          visionEnrichment: {},
          metadata: {
            visionUsed: false,
            processingTime: Date.now() - startTime,
            confidence: 0.1,
            enriched: false
          }
        }
      };
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  getStats() {
    return {
      initialized: this.initialized
    };
  }
}

let visionIntegrationService: VisionIntegrationService | null = null;

export function getVisionIntegrationService(): VisionIntegrationService {
  if (!visionIntegrationService) {
    visionIntegrationService = new VisionIntegrationService();
  }
  return visionIntegrationService;
}