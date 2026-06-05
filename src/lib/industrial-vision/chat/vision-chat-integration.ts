// src/lib/industrial-vision/chat/vision-chat-integration.ts

import { innovationDetector } from '../innovations/innovation-detector';
import { InnovationDetectionResult, PlannedAction } from '../types/industrial.types';

export interface ChatContext {
  lastAnalysis?: any;
  hasAnalysis: boolean;
  availableData: {
    hasVoyants: boolean;
    hasCadrans: boolean;
    hasOrganes: boolean;
    hasFeatures: boolean;
    hasTemporalData: boolean;
    hasReference: boolean;
  };
}

export class VisionChatIntegration {
  private context: ChatContext = {
    hasAnalysis: false,
    availableData: {
      hasVoyants: false,
      hasCadrans: false,
      hasOrganes: false,
      hasFeatures: false,
      hasTemporalData: false,
      hasReference: false
    }
  };

  setContext(context: Partial<ChatContext>) {
    this.context = { ...this.context, ...context };
  }

  setAnalysisResult(analysis: any) {
    this.context.lastAnalysis = analysis;
    this.context.hasAnalysis = true;
    this.context.availableData = {
      hasVoyants: analysis?.voyantsDetectes?.length > 0,
      hasCadrans: analysis?.mesuresLues?.length > 0,
      hasOrganes: analysis?.organes?.length > 0,
      hasFeatures: analysis?.features !== undefined,
      hasTemporalData: analysis?.tendances?.length > 0 || analysis?.historique?.length > 0,
      hasReference: analysis?.similariteReference !== undefined
    };
  }

  async processUserQuery(userQuery: string): Promise<{
    enhancedPrompt: string;
    detectedInnovations: InnovationDetectionResult[];
    plannedActions: PlannedAction[];
    intent: any;
  }> {
    // 1. Détecter les innovations pertinentes
    const detectedInnovations = innovationDetector.detectInnovations(
      userQuery,
      this.context.availableData
    );

    // 2. Détecter l'intention
    const intent = innovationDetector.detectIntent(userQuery);

    // 3. Planifier l'exécution
    const plannedActions = innovationDetector.planExecution(
      detectedInnovations,
      { hasAnalysis: this.context.hasAnalysis, lastAnalysis: this.context.lastAnalysis }
    );

    // 4. Générer le prompt enrichi
    const enhancedPrompt = innovationDetector.generateEnhancedSystemPrompt(
      userQuery,
      detectedInnovations,
      {
        organes: this.context.lastAnalysis?.organes,
        voyants: this.context.lastAnalysis?.voyantsDetectes,
        cadrans: this.context.lastAnalysis?.mesuresLues,
        hasTemporalData: this.context.availableData.hasTemporalData,
        hasReference: this.context.availableData.hasReference
      }
    );

    return {
      enhancedPrompt,
      detectedInnovations,
      plannedActions,
      intent
    };
  }

  getInnovationRecommendations(): InnovationDetectionResult[] {
    // Recommandations proactives basées sur le contexte
    const proactiveQuery = this.generateProactiveQuery();
    return innovationDetector.detectInnovations(proactiveQuery, this.context.availableData);
  }

  private generateProactiveQuery(): string {
    const parts = [];
    
    if (this.context.availableData.hasVoyants && !this.context.availableData.hasTemporalData) {
      parts.push("surveiller les changements d'état des voyants");
    }
    if (this.context.availableData.hasCadrans && !this.context.availableData.hasTemporalData) {
      parts.push("analyser la tendance des mesures");
    }
    if (this.context.availableData.hasOrganes && this.context.availableData.hasReference) {
      parts.push("comparer avec la référence");
    }
    
    return parts.length ? `Que peut-on faire pour ${parts.join(' et ')} ?` : '';
  }
}

export const visionChatIntegration = new VisionChatIntegration();