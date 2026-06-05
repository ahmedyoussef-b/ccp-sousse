/**
 * Innovation 2 : Agent Visuel Autonome "Computer-Use"
 * 
 * Principe : L'agent peut "voir" l'écran du logiciel de supervision (IHM)
 * et analyser l'état des alarmes, vannes, etc. pour suggérer des actions.
 * 
 * VERSION MIGRÉE : Persistance SQLite via Core SQLite
 * 
 * @module innovations/computer-use-agent
 * @version 3.0.0 - SQLite Persistence
 */

import { ScreenAnalysis, ComputerUseAgentConfig } from './types';
import { getSQLiteCore } from '../core/sqlite/manager';
import type { InnovationAnalysis } from '../core/sqlite/types';
import { smartRouter } from '../router/smart-router';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: ComputerUseAgentConfig = {
  enabled: true,
  screenshotInterval: 0,
  autoSuggest: true,
  maxActionsPerSession: 10,
};

// ============================================================================
// PROMPTS SPÉCIALISÉS
// ============================================================================

const SCREEN_ANALYSIS_PROMPT = `Tu es un agent d'assistance pour opérateur de salle de contrôle industrielle.

## TÂCHE
Analyse cette capture d'écran d'IHM de supervision et identifie :
1. Les alarmes actives (texte en rouge, clignotant, ou avec symbole d'alerte)
2. L'état des équipements critiques (vannes ouvertes/fermées, pompes en marche/arrêt)
3. Les valeurs anormales (températures/pressions hors plage)

## FORMAT DE RÉPONSE STRICT
Réponds UNIQUEMENT au format JSON suivant :

{
  "detectedElements": [
    {
      "type": "alarm|valve|pump|gauge|button|text",
      "label": "Nom de l'élément",
      "state": "normal|warning|critical|unknown",
      "confidence": 0.0-1.0
    }
  ],
  "summary": "Résumé en une phrase de l'état général",
  "suggestedActions": ["Action 1", "Action 2"]
}

Ne mets AUCUN texte avant ou après le JSON.`;

// ============================================================================
// CLASSE PRINCIPALE (MIGRÉE SQLite)
// ============================================================================

export class ComputerUseAgent {
  private config: ComputerUseAgentConfig = DEFAULT_CONFIG;
  private db = getSQLiteCore();
  private sessionActionsCount: number = 0;
  private cache: ScreenAnalysis[] = []; // Cache mémoire pour accès rapide

  constructor() {
    console.log('[ComputerUse] ✅ Agent initialisé (mode SQLite)');
    this.loadHistoryFromSQLite();
  }

  /**
   * Charge l'historique depuis SQLite
   */
  private async loadHistoryFromSQLite(): Promise<void> {
    try {
      const history = this.db.innovations?.getAnalysisHistory?.('computer_use', 50) || [];
      
      this.cache = history.map((h: InnovationAnalysis) => ({
        timestamp: h.createdAt ? new Date(h.createdAt).toISOString() : new Date().toISOString(),
        detectedElements: (h.detectedElements as ScreenAnalysis['detectedElements']) || [],
        suggestedActions: (h.suggestedActions as string[]) || [],
        rawResponse: String(h.rawResponse || '')
      }));
      
      console.log(`[ComputerUse] ✅ ${this.cache.length} analyses chargées depuis SQLite`);
    } catch (error) {
      console.error('[ComputerUse] Erreur chargement SQLite:', error);
    }
  }

  /**
   * Sauvegarde une analyse dans SQLite
   */
  private async saveAnalysisToSQLite(analysis: ScreenAnalysis): Promise<void> {
    try {
      this.db.innovations?.saveAnalysis?.({
        id: `computer_use_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        innovationType: 'computer_use',
        analysisData: {
          summary: analysis.rawResponse?.slice(0, 500) || '',
          elementsCount: analysis.detectedElements.length
        },
        detectedElements: analysis.detectedElements,
        suggestedActions: analysis.suggestedActions,
        rawResponse: analysis.rawResponse
      });
    } catch (error) {
      console.error('[ComputerUse] Erreur sauvegarde SQLite:', error);
    }
  }


  /**
   * Extrait des actions suggérées d'une réponse textuelle
   */
  private extractActionsFromText(text: string): string[] {
    const actions: string[] = [];
    
    const actionPatterns = [
      /(?:suggère|propose|recommande|action|étape)[:\s]+([^.]+)/gi,
      /(?:vérifier|contrôler|ouvrir|fermer|démarrer|arrêter)[^.]+/gi,
      /\d+\.\s*([^.]+)/g,
      /[-•]\s*([^.]+)/g,
    ];
    
    for (const pattern of actionPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const action = (match[1] || match[0]).trim();
        if (action.length > 10 && action.length < 200) {
          actions.push(action);
        }
      }
    }
    return [...new Set(actions)].slice(0, 5);
  }

  /**
   * Analyse une capture d'écran d'IHM via Gemini Vision
   */
  async analyzeScreen(screenshotBuffer: Buffer): Promise<ScreenAnalysis> {
    console.log('[ComputerUse] 🔍 Analyse de capture d\'écran via Gemini Vision...');
    
    try {
      // Appel direct au SmartRouter pour la vision
      const diagnostic = await smartRouter.callVisionLLM(SCREEN_ANALYSIS_PROMPT, screenshotBuffer, {
        temperature: 0.2,
        maxTokens: 1000
      });
      
      // Parser la réponse JSON
      let analysis: ScreenAnalysis;
      
      try {
        const jsonMatch = diagnostic.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          analysis = {
            timestamp: new Date().toISOString(),
            detectedElements: parsed.detectedElements || [],
            suggestedActions: parsed.suggestedActions || [],
            rawResponse: diagnostic,
          };
        } else {
          analysis = {
            timestamp: new Date().toISOString(),
            detectedElements: [],
            suggestedActions: this.extractActionsFromText(diagnostic),
            rawResponse: diagnostic,
          };
        }
      } catch {
        analysis = {
          timestamp: new Date().toISOString(),
          detectedElements: [],
          suggestedActions: this.extractActionsFromText(diagnostic),
          rawResponse: diagnostic,
        };
      }
      
      // Sauvegarder dans SQLite et cache mémoire
      this.cache.unshift(analysis);
      if (this.cache.length > 100) {
        this.cache.pop();
      }
      await this.saveAnalysisToSQLite(analysis);
      
      // Mettre à jour les métriques
      await this.db.recordMetric('computer_use', 'analysis_count', 1);
      await this.db.recordMetric('computer_use', 'elements_detected', analysis.detectedElements.length);
      
      console.log(`[ComputerUse] ✅ Analyse terminée : ${analysis.detectedElements.length} éléments détectés`);
      
      return analysis;
      
    } catch (error) {
      console.error('[ComputerUse] Erreur analyse:', error);
      
      // Fallback en cas d'erreur
      return {
        timestamp: new Date().toISOString(),
        detectedElements: [],
        suggestedActions: [],
        rawResponse: '',
      };
    }
  }

  /**
   * Génère des suggestions d'actions supplémentaires
   */
  async suggestAdditionalActions(
    analysis: ScreenAnalysis,
    context?: { equipment?: string[]; zone?: string }
  ): Promise<string[]> {
    this.sessionActionsCount++;
    
    if (this.sessionActionsCount > this.config.maxActionsPerSession) {
      console.log('[ComputerUse] Limite d\'actions par session atteinte');
      return [];
    }
    
    const criticalElements = analysis.detectedElements.filter(
      e => e.state === 'critical' || e.state === 'warning'
    );
    
    if (criticalElements.length === 0) {
      return [];
    }
    
    try {
      const state = criticalElements.map(e => `- ${e.type}: ${e.label} (${e.state})`).join('\n');
      const equipment = context?.equipment?.join(', ') || 'Non spécifié';
      
      const prompt = `En tant qu'assistant de salle de contrôle, suggère les actions appropriées.
      
ÉTAT ACTUEL:
${state}
 
ÉQUIPEMENTS CONCERNÉS:
${equipment}
 
Propose 3-5 actions concrètes et sécuritaires.`;

      // Utilisation directe du SmartRouter (texte uniquement ici)
      const result = await smartRouter.route(prompt, { mode: 'complexe' });
      const actions = this.extractActionsFromText(result.response);
      
      // Enregistrer les suggestions dans les métriques
      await this.db.recordMetric('computer_use', 'suggestions_generated', actions.length);
      
      return actions;
      
    } catch (error) {
      console.error('[ComputerUse] Erreur suggestions:', error);
      return [];
    }
  }

  /**
   * Vérifie si une alarme critique est présente
   */
  hasCriticalAlarms(analysis: ScreenAnalysis): boolean {
    return analysis.detectedElements.some(
      e => e.type === 'alarm' && e.state === 'critical'
    );
  }

  /**
   * Récupère l'historique des analyses (depuis cache mémoire)
   */
  getHistory(limit: number = 10): ScreenAnalysis[] {
    return this.cache.slice(0, limit);
  }

  /**
   * Récupère l'historique complet depuis SQLite
   */
  async getFullHistory(limit: number = 100): Promise<ScreenAnalysis[]> {
    const history = this.db.innovations?.getAnalysisHistory?.('computer_use', limit) || [];
    return history.map((h: InnovationAnalysis) => ({
      timestamp: h.createdAt ? new Date(h.createdAt).toISOString() : new Date().toISOString(),
      detectedElements: (h.detectedElements as ScreenAnalysis['detectedElements']) || [],
      suggestedActions: (h.suggestedActions as string[]) || [],
      rawResponse: String(h.rawResponse || '')
    }));
  }

  /**
   * Obtient un résumé de l'état actuel
   */
  getCurrentStatus(): string {
    if (this.cache.length === 0) {
      return 'Aucune analyse récente';
    }
    
    const latest = this.cache[0];
    const criticalCount = latest.detectedElements.filter(e => e.state === 'critical').length;
    const warningCount = latest.detectedElements.filter(e => e.state === 'warning').length;
    
    if (criticalCount > 0) {
      return `⚠️ CRITIQUE : ${criticalCount} alarme(s) critique(s)`;
    } else if (warningCount > 0) {
      return `⚠️ ATTENTION : ${warningCount} avertissement(s)`;
    } else {
      return `✅ État normal (${latest.detectedElements.length} éléments surveillés)`;
    }
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(updates: Partial<ComputerUseAgentConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('[ComputerUse] Configuration mise à jour');
  }

  /**
   * Réinitialise le compteur d'actions de session
   */
  resetSession(): void {
    this.sessionActionsCount = 0;
  }

  /**
   * Supprime l'historique ancien de SQLite
   */
  async cleanupHistory(keepDays: number = 7): Promise<number> {
    const cutoff = Date.now() - (keepDays * 24 * 60 * 60 * 1000);
    
    try {
      // Nettoyage via SQLite (si méthode disponible)
      const result = this.db.getDB().prepare(`
        DELETE FROM innovation_analysis_history 
        WHERE innovation_type = 'computer_use' AND created_at < ?
      `).run(cutoff);
      
      // Rafraîchir le cache
      this.cache = [];
      await this.loadHistoryFromSQLite();
      
      const deleted = result.changes;
      console.log(`[ComputerUse] Nettoyage SQLite : ${deleted} entrées supprimées`);
      
      return deleted;
    } catch (error) {
      console.error('[ComputerUse] Erreur nettoyage:', error);
      return 0;
    }
  }

  /**
   * Obtient des statistiques d'utilisation
   */
  async getStats(): Promise<{
    totalAnalyses: number;
    avgElementsPerAnalysis: number;
    recentActivities: number;
  }> {
    const totalAnalyses = this.db.getDB().prepare(`
      SELECT COUNT(*) as count FROM innovation_analysis_history 
      WHERE innovation_type = 'computer_use'
    `).get() as { count: number };
    
    const avgElements = this.db.getDB().prepare(`
      SELECT AVG(json_array_length(detected_elements)) as avg FROM innovation_analysis_history 
      WHERE innovation_type = 'computer_use'
    `).get() as { avg: number | null };
    
    const recentActivities = this.db.getDB().prepare(`
      SELECT COUNT(*) as count FROM innovation_analysis_history 
      WHERE innovation_type = 'computer_use' AND created_at > ?
    `).get(Date.now() - 24 * 60 * 60 * 1000) as { count: number };
    
    return {
      totalAnalyses: totalAnalyses?.count || 0,
      avgElementsPerAnalysis: avgElements?.avg || 0,
      recentActivities: recentActivities?.count || 0
    };
  }
}

// Export singleton
export const computerUseAgent = new ComputerUseAgent();