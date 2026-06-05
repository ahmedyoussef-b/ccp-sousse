// src/lib/services/industrial-vision/vision-rag.service.ts

import { innovationDetector } from '@/lib/industrial-vision/innovations/innovation-detector';
import { 
  detectFamilies, 
  computeSpatialSignature,
  crossModalSearch,
  generateAltText} from '@/lib/industrial-vision/innovations/level1-functional';
import {
  detectIncoherences,
  TrendAnalyzer,
  CycleDetector
} from '@/lib/industrial-vision/innovations/level4-dynamic';

// Types locaux pour éviter les imports manquants
interface InnovationDetectionResult {
  innovationId: number;
  innovationName: string;
  score: number;
  matchedKeywords: string[];
  category: string;
  reason: string;
}

export interface VisionRAGContext {
  userQuery: string;
  detectedInnovations: InnovationDetectionResult[];
  analysisResult?: any;
  historicalData?: any[];
}

export interface VisionRAGResponse {
  answer: string;
  usedInnovations: InnovationDetectionResult[];
  context: string;
  suggestions: string[];
  confidence: number;
}

export class VisionRAGService {
  private trendAnalyzer: TrendAnalyzer;
  private cycleDetector: CycleDetector;
  private lastAnalysis: any = null;
  private initialized: boolean = false;

  constructor() {
    this.trendAnalyzer = new TrendAnalyzer();
    this.cycleDetector = new CycleDetector();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      console.log('[VISION-RAG-SERVICE] Initialisation...');
      this.initialized = true;
      console.log('[VISION-RAG-SERVICE] Initialisé avec succès');
    } catch (error) {
      console.error('[VISION-RAG-SERVICE] Erreur initialisation:', error);
      this.initialized = true;
    }
  }

  /**
   * Met à jour l'analyse courante
   */
  setCurrentAnalysis(analysis: any): void {
    this.lastAnalysis = analysis;
    console.log('[VISION-RAG-SERVICE] Analyse mise à jour:', analysis?.etatGlobal || 'unknown');
    
    if (analysis) {
      this.updateAnalyzersFromAnalysis(analysis);
    }
  }

  /**
   * Met à jour les analyseurs avec l'analyse courante
   */
  private updateAnalyzersFromAnalysis(analysis: any): void {
    try {
      if (analysis.mesuresLues && Array.isArray(analysis.mesuresLues)) {
        for (const mesure of analysis.mesuresLues) {
          this.trendAnalyzer.addMeasurement(mesure.organe, Date.now(), mesure.valeur);
          this.cycleDetector.record(mesure.organe, 'mesure', Date.now());
        }
      }
      if (analysis.voyantsDetectes && Array.isArray(analysis.voyantsDetectes)) {
        for (const voyant of analysis.voyantsDetectes) {
          this.cycleDetector.record(voyant.organe, voyant.couleur, Date.now());
        }
      }
    } catch (error) {
      console.error('[VISION-RAG-SERVICE] Erreur update analyzers:', error);
    }
  }

  /**
   * Récupère les données disponibles pour la prédétection
   */
  private getAvailableData(): any {
    return {
      hasVoyants: this.lastAnalysis?.voyantsDetectes?.length > 0,
      hasCadrans: this.lastAnalysis?.mesuresLues?.length > 0,
      hasOrganes: this.lastAnalysis?.organes?.length > 0,
      hasFeatures: !!this.lastAnalysis?.features,
      hasTemporalData: this.trendAnalyzer.hasData(),
      hasReference: false
    };
  }

  /**
   * Traite une requête utilisateur avec détection des innovations
   */
  async getChatContext(userQuery: string): Promise<{
    systemPrompt: string;
    detectedInnovations: InnovationDetectionResult[];
    contextData: string;
  }> {
    await this.initialize();
    
    const availableData = this.getAvailableData();
    
    // Détecter les innovations pertinentes
    const detectedInnovations = innovationDetector.detectInnovations(
      userQuery,
      availableData
    );
    
    // Générer le contexte enrichi
    const contextData = this.generateEnhancedContext(userQuery, detectedInnovations);
    
    // Générer le prompt système
    const systemPrompt = this.generateSystemPrompt(userQuery, detectedInnovations);
    
    console.log(`[VISION-RAG-SERVICE] ${detectedInnovations.length} innovations détectées pour: ${userQuery.substring(0, 50)}`);
    
    return {
      systemPrompt,
      detectedInnovations,
      contextData
    };
  }

  /**
   * Génère le contexte enrichi pour l'IA
   */
  private generateEnhancedContext(
    _userQuery: string,
    innovations: InnovationDetectionResult[]
  ): string {
    let context = `## CONTEXTE D'ANALYSE INDUSTRIELLE\n\n`;
    
    if (this.lastAnalysis) {
      context += `### Image analysée\n`;
      context += `- État global: ${this.lastAnalysis.etatGlobal || 'inconnu'}\n`;
      context += `- Diagnostic: ${this.lastAnalysis.diagnostic || 'Non disponible'}\n`;
      context += `- Voyants actifs: ${this.lastAnalysis.voyantsDetectes?.filter((v: any) => v.couleur !== 'eteint').length || 0}\n`;
      context += `- Mesures: ${this.lastAnalysis.mesuresLues?.length || 0}\n\n`;
    } else {
      context += `⚠️ Aucune analyse d'image n'est actuellement disponible.\n`;
      context += `Invitez l'utilisateur à analyser une image depuis le menu "Vision Industrielle".\n\n`;
    }

    if (innovations.length > 0) {
      context += `### Innovations IA détectées pour cette question\n`;
      for (const innovation of innovations.slice(0, 5)) {
        context += `- **${innovation.innovationName}** (score: ${innovation.score.toFixed(0)}%)\n`;
        context += `  ${innovation.reason}\n`;
      }
      context += `\n`;
    }

    return context;
  }

  /**
   * Génère le prompt système
   */
  private generateSystemPrompt(
    userQuery: string,
    innovations: InnovationDetectionResult[]
  ): string {
    let prompt = `Tu es un assistant expert en vision industrielle.

## CONTEXTE DISPONIBLE:
`;

    if (this.lastAnalysis) {
      prompt += `- Une analyse d'image est disponible\n`;
      prompt += `- État: ${this.lastAnalysis.etatGlobal || 'inconnu'}\n`;
      prompt += `- ${this.lastAnalysis.voyantsDetectes?.length || 0} voyants détectés\n`;
      prompt += `- ${this.lastAnalysis.mesuresLues?.length || 0} mesures disponibles\n`;
    } else {
      prompt += `- Aucune analyse d'image disponible\n`;
    }

    if (innovations.length > 0) {
      prompt += `\n## INNOVATIONS DÉTECTÉES:\n`;
      for (const inv of innovations.slice(0, 3)) {
        prompt += `- ${inv.innovationName}\n`;
      }
    }

    prompt += `\n## RÈGLES:
1. Réponds de manière précise et technique
2. Utilise les données du contexte si disponibles
3. Si la question ne concerne pas l'image analyse, redirige vers le RAG classique
4. Propose des suggestions pertinentes

Réponds maintenant à la question: ${userQuery}`;

    return prompt;
  }

  /**
   * Vérifie si des données sont disponibles
   */
  hasData(): boolean {
    return !!this.lastAnalysis;
  }

  /**
   * Récupère l'analyse courante
   */
  getCurrentAnalysis(): any {
    return this.lastAnalysis;
  }

  /**
   * Exécute une innovation spécifique
   */
  async executeInnovation(innovationId: number, params?: any): Promise<any> {
    if (!this.lastAnalysis) {
      return { error: 'Aucune analyse disponible' };
    }

    const visionResult = {
      organes: this.lastAnalysis.organes || [],
      voyants: this.lastAnalysis.voyantsDetectes || [],
      cadrans: this.lastAnalysis.mesuresLues || [],
      features: this.lastAnalysis.features || []
    };

    switch (innovationId) {
      case 1:
        const searchTerm = params?.searchTerm || '';
        const found = visionResult.organes.find((o: any) => 
          o.nom.toLowerCase().includes(searchTerm.toLowerCase())
        );
        return found 
          ? { organe: found.nom, position: found.bbox, confiance: found.confiance }
          : { error: 'Organe non trouvé' };

      case 2:
        const families = detectFamilies(visionResult.organes);
        return { families: Array.from(families.entries()) };

      case 3:
        const signature = computeSpatialSignature(visionResult.organes);
        return { signatureLength: signature.length, preview: signature.slice(0, 10) };

      case 5:
        const query = params?.query || '';
        const results = crossModalSearch(query, visionResult.organes);
        return { results: results.map(r => ({ nom: r.nom, confiance: r.confiance })) };

      case 7:
        const altText = generateAltText(visionResult.organes, visionResult.voyants);
        return { altText };

      case 10:
        return { version: 'unknown' };

      case 31:
        const voyantsActifs = visionResult.voyants.filter((v: any) => v.couleur !== 'eteint');
        const alerts = voyantsActifs.filter((v: any) => v.couleur === 'rouge');
        return { 
          voyantsActifs: voyantsActifs.length,
          alerts: alerts.length,
          details: voyantsActifs 
        };

      case 32:
        const mesures = visionResult.cadrans.map((m: any) => ({
          organe: m.organe,
          valeur: m.valeur,
          unite: m.unite,
          interpretation: this.interpretMesure(m.valeur, m.unite)
        }));
        return { mesures };

      case 33:
        const incoherences = detectIncoherences(visionResult.voyants, visionResult.cadrans);
        return { incoherences };

      case 34:
        const tendances = [];
        for (const mesure of visionResult.cadrans) {
          const trend = this.trendAnalyzer.predictTrend(mesure.organe);
          if (trend) {
            tendances.push({
              organe: mesure.organe,
              ...trend
            });
          }
        }
        return { tendances };

      case 35:
        const cycles = this.cycleDetector.detectAnomalies(['vert', 'vert', 'jaune', 'rouge']);
        return { cycles };

      default:
        return { message: `Innovation ${innovationId} - Simulation` };
    }
  }

  /**
   * Interprète une mesure
   */
  private interpretMesure(valeur: number, unite: string): string {
    if (unite === 'bar') {
      if (valeur > 12) return 'Pression trop élevée ⚠️';
      if (valeur < 3) return 'Pression trop basse ⚠️';
      return 'Pression normale ✅';
    }
    if (unite === '°C') {
      if (valeur > 70) return 'Température critique ⚠️';
      if (valeur > 55) return 'Température élevée ⚠️';
      return 'Température normale ✅';
    }
    return 'Valeur normale';
  }
}

// Singleton avec gestion d'erreur
let visionRAGServiceInstance: VisionRAGService | null = null;

export function getVisionRAGService(): VisionRAGService {
  if (!visionRAGServiceInstance) {
    visionRAGServiceInstance = new VisionRAGService();
    visionRAGServiceInstance.initialize().catch(console.error);
  }
  return visionRAGServiceInstance;
}