// src/lib/industrial-vision/innovations/innovation-detector.ts

import { Innovation, InnovationDetectionResult, PlannedAction, UserIntent } from '../types/industrial.types';
import { INNOVATIONS_CATALOG, CATEGORY_KEYWORDS } from './innovation-catalog';

export class InnovationDetector {
  private innovations: Innovation[];
  
  constructor() {
    this.innovations = INNOVATIONS_CATALOG;
  }

  /**
   * Analyse la question utilisateur et retourne les innovations pertinentes
   */
  detectInnovations(userQuery: string, availableData?: {
    hasVoyants: boolean;
    hasCadrans: boolean;
    hasOrganes: boolean;
    hasFeatures: boolean;
    hasTemporalData: boolean;
    hasReference: boolean;
  }): InnovationDetectionResult[] {
    const query = userQuery.toLowerCase();
    const results: InnovationDetectionResult[] = [];

    for (const innovation of this.innovations) {
      // Vérifier si les données nécessaires sont disponibles
      const hasRequiredData = this.checkDataAvailability(innovation, availableData);
      if (!hasRequiredData) continue;

      // Calculer le score de pertinence
      let score = 0;
      const matchedKeywords: string[] = [];

      // 1. Matching direct des mots-clés
      for (const keyword of innovation.keywords) {
        if (query.includes(keyword.toLowerCase())) {
          score += 1;
          matchedKeywords.push(keyword);
        }
      }

      // 2. Matching par catégorie
      for (const category of innovation.categories) {
        const categoryKeywords = CATEGORY_KEYWORDS[category] || [];
        for (const catKeyword of categoryKeywords) {
          if (query.includes(catKeyword.toLowerCase())) {
            score += 0.8;
            matchedKeywords.push(`[${category}] ${catKeyword}`);
          }
        }
      }

      // 3. Score bonus pour les questions spécifiques
      if (this.isQuestionAskingForRealTime(query)) {
        if (innovation.categories.includes('temps_réel')) score += 1.5;
      }
      if (this.isQuestionAskingForComparison(query)) {
        if (innovation.categories.includes('comparaison')) score += 1.5;
      }
      if (this.isQuestionAskingForLocation(query)) {
        if (innovation.categories.includes('localisation')) score += 1.5;
      }

      if (score > 0) {
        results.push({
          innovationId: innovation.id,
          innovationName: innovation.name,
          score: score,
          matchedKeywords: [...new Set(matchedKeywords)],
          category: innovation.categories[0],
          reason: this.generateReason(innovation, matchedKeywords),
          id: function (_id: any, _userQuery: string): unknown {
            throw new Error('Function not implemented.');
          }
        });
      }
    }

    // Trier par score décroissant
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Planifie l'exécution des innovations détectées
   */
  planExecution(
    detectedInnovations: InnovationDetectionResult[],
    context: {
      hasAnalysis?: boolean;
      lastAnalysis?: any;
    }
  ): PlannedAction[] {
    const planned: PlannedAction[] = [];

    for (const detection of detectedInnovations) {
      const innovation = this.innovations.find(i => i.id === detection.innovationId);
      if (!innovation) continue;

      const needsAnalysis = innovation.requiresData.length > 0 && !context.hasAnalysis;
      
      planned.push({
        innovationId: detection.innovationId,
        priority: this.calculatePriority(detection.score, needsAnalysis),
        needsAnalysis: needsAnalysis,
        params: this.extractParams(innovation, detection),
        estimatedTokens: this.estimateTokens(innovation, detection)
      });
    }

    return planned.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Détecte l'intention principale de l'utilisateur
   */
  detectIntent(query: string): UserIntent {
    const q = query.toLowerCase();
    
    // Patterns d'intention
    const patterns = {
      location: [/où (se trouve|est|se situe)/, /position de/, /localiser/],
      status: [/quel est l'état/, /comment est/, /fonctionne-t-il/],
      measure: [/quelle est la (pression|température|valeur)/, /combien (indique|mesure)/],
      comparison: [/comparer/, /différence entre/, /similaire à/],
      anomaly: [/anomalie/, /problème/, /défaut/, /est-ce normal/],
      trend: [/tendance/, /évolution/, /augmente/, /diminue/],
      alert: [/alarme/, /alerte/, /urgent/, /critique/],
      history: [/historique/, /avant/, /changement/, /évolution/],
      description: [/décris/, /describe/, /que montre/, /contenu/]
    };

    let primary = 'general';
    let maxScore = 0;
    const secondary: string[] = [];

    for (const [intent, regexes] of Object.entries(patterns)) {
      let score = 0;
      for (const regex of regexes) {
        if (regex.test(q)) {
          score += 1;
        }
      }
      if (score > maxScore) {
        maxScore = score;
        primary = intent;
      } else if (score > 0) {
        secondary.push(intent);
      }
    }

    // Extraction des entités (organes, valeurs, etc.)
    const entities = this.extractEntities(query);

    return {
      primary,
      secondary,
      entities,
      confidence: maxScore > 0 ? Math.min(maxScore / 2, 1) : 0.3
    };
  }

  /**
   * Génère un prompt système enrichi avec les innovations détectées
   */
  generateEnhancedSystemPrompt(
    userQuery: string,
    detectedInnovations: InnovationDetectionResult[],
    availableData: any
  ): string {
    const intent = this.detectIntent(userQuery);
    
    let prompt = `Tu es un assistant expert en vision industrielle avec accès à ${detectedInnovations.length} innovations IA pertinentes pour la question de l'utilisateur.

## INNOVATIONS DISPONIBLES (par pertinence):
`;

    for (let i = 0; i < Math.min(5, detectedInnovations.length); i++) {
      const inv = detectedInnovations[i];
      prompt += `${i + 1}. ${inv.innovationName} (niveau ${Math.floor(inv.innovationId / 10) + 1}) - Score: ${inv.score}\n`;
      prompt += `   → ${inv.reason}\n`;
    }

    prompt += `
## INTENTION DÉTECTÉE:
- Primaire: ${intent.primary}
- Secondaire: ${intent.secondary.join(', ') || 'aucune'}
- Confiance: ${(intent.confidence * 100).toFixed(0)}%

## CONTEXTE DISPONIBLE:
${this.formatAvailableData(availableData)}

## RÈGLES DE RÉPONSE:
1. Utilise PRIORITAIREMENT les innovations détectées pour répondre
2. Si plusieurs innovations sont pertinentes, combinez leurs résultats
3. Cite l'innovation utilisée dans ta réponse (ex: "Selon l'innovation X...")
4. Propose à l'utilisateur de tester l'innovation si pertinent

Réponds de manière précise, technique et utile.`;

    return prompt;
  }

  // Méthodes privées
  private checkDataAvailability(
    innovation: Innovation,
    availableData?: any
  ): boolean {
    if (!availableData) return true;
    
    for (const required of innovation.requiresData) {
      if (required === 'voyants' && !availableData.hasVoyants) return false;
      if (required === 'cadrans' && !availableData.hasCadrans) return false;
      if (required === 'organes' && !availableData.hasOrganes) return false;
      if (required === 'features' && !availableData.hasFeatures) return false;
      if (required === 'temporal' && !availableData.hasTemporalData) return false;
    }
    return true;
  }

  private isQuestionAskingForRealTime(query: string): boolean {
    const rtKeywords = ['maintenant', 'actuellement', 'en ce moment', 'temps réel', 'live', 'direct'];
    return rtKeywords.some(kw => query.includes(kw));
  }

  private isQuestionAskingForComparison(query: string): boolean {
    const compKeywords = ['comparer', 'différence', 'vs', 'versus', 'par rapport à'];
    return compKeywords.some(kw => query.includes(kw));
  }

  private isQuestionAskingForLocation(query: string): boolean {
    const locKeywords = ['où', 'position', 'emplacement', 'localiser', 'situer'];
    return locKeywords.some(kw => query.includes(kw));
  }

  private generateReason(innovation: Innovation, matchedKeywords: string[]): string {
    if (matchedKeywords.length === 0) {
      return `Pertinent pour la catégorie "${innovation.categories[0]}"`;
    }
    const topKeywords = matchedKeywords.slice(0, 3).join(', ');
    return `Mots-clés détectés: ${topKeywords}`;
  }

  private calculatePriority(score: number, needsAnalysis: boolean): number {
    let priority = score;
    if (needsAnalysis) priority *= 0.8; // Pénalité si besoin d'analyse
    return Math.min(Math.round(priority * 10), 10);
  }

  private extractParams(innovation: Innovation, _detection: InnovationDetectionResult): Record<string, any> {
    const params: Record<string, any> = {};
    
    if (innovation.requiresData.includes('temporal')) {
      params.timeWindow = 'recent';
    }
    if (innovation.categories.includes('comparaison')) {
      params.comparisonMode = 'auto';
    }
    
    return params;
  }

  private estimateTokens(innovation: Innovation, detection: InnovationDetectionResult): number {
    // Estimation basique du nombre de tokens nécessaires
    let base = 100;
    if (innovation.requiresData.length > 2) base += 50;
    if (detection.score > 5) base += 30;
    return base;
  }

  private extractEntities(query: string): string[] {
    const entities: string[] = [];
    
    // Extraction d'organes potentiels
    const organesList = ['CONDENSEUR', 'DETENDEUR', 'COMPRESSEUR', 'EVAPORATEUR', 'VANNE', 'POMPE', 'CIRCUIT HP', 'CIRCUIT BP', 'BALLON'];
    const qUpper = query.toUpperCase();
    
    for (const organe of organesList) {
      if (qUpper.includes(organe)) {
        entities.push(organe);
      }
    }
    
    return entities;
  }

  private formatAvailableData(data: any): string {
    if (!data) return 'Aucune donnée disponible';
    
    let formatted = '';
    if (data.organes) formatted += `- Organes détectés: ${data.organes.length}\n`;
    if (data.voyants) formatted += `- Voyants: ${data.voyants.filter((v: any) => v.couleur !== 'eteint').length} actifs\n`;
    if (data.cadrans) formatted += `- Mesures: ${data.cadrans.length} capteurs\n`;
    if (data.hasTemporalData) formatted += `- Données temporelles: disponibles\n`;
    if (data.hasReference) formatted += `- Image de référence: disponible\n`;
    
    return formatted || 'Données basiques disponibles';
  }
}

// Instance singleton
export const innovationDetector = new InnovationDetector();