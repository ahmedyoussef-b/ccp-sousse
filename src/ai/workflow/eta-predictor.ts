/**
 * @fileOverview ETAPredictor - Calculateur d'ETA prédictif par lissage exponentiel.
 * @version 1.0.0
 */


export interface StepStats {
  label: string;
  avgDuration: number;
  sampleCount: number;
}

export class ETAPredictor {
  private history: Map<string, StepStats> = new Map();
  private readonly ALPHA = 0.3; // Facteur de lissage exponentiel

  /**
   * Enregistre la durée réelle d'une étape
   */
  public recordStepDuration(label: string, duration: number): void {
    const stats = this.history.get(label) || { label, avgDuration: duration, sampleCount: 0 };
    
    // Lissage exponentiel : S_{t} = alpha * x_{t} + (1 - alpha) * S_{t-1}
    stats.avgDuration = (this.ALPHA * duration) + ((1 - this.ALPHA) * stats.avgDuration);
    stats.sampleCount++;
    
    this.history.set(label, stats);
  }

  /**
   * Calcule le temps restant estimé pour un workflow
   * @param remainingSteps Étapes non encore terminées
   * @param currentPerformanceFactor Ratio entre la durée réelle et la durée moyenne des dernières étapes
   */
  public predictRemainingTime(remainingSteps: { label: string }[], currentPerformanceFactor: number = 1.0): number {
    let totalEstimated = 0;

    for (const step of remainingSteps) {
      const stats = this.history.get(step.label);
      const baseDuration = stats ? stats.avgDuration : 5000; // 5s par défaut si inconnu
      
      // On ajuste la durée de base par le facteur de performance actuel
      totalEstimated += baseDuration * currentPerformanceFactor;
    }

    return totalEstimated;
  }

  /**
   * Calcule le score de confiance (0-1) basé sur la maturité de l'historique
   */
  public getConfidenceScore(workflowSteps: { label: string }[]): number {
    const knownSteps = workflowSteps.filter(s => this.history.has(s.label));
    if (workflowSteps.length === 0) return 0;
    
    const coverage = knownSteps.length / workflowSteps.length;
    const maturity = knownSteps.reduce((acc, s) => acc + Math.min(1, (this.history.get(s.label)?.sampleCount || 0) / 10), 0) / (knownSteps.length || 1);
    
    return coverage * 0.7 + maturity * 0.3;
  }

  /**
   * Récupère le facteur de performance actuel (Relatif à l'histoire)
   */
  public calculatePerformanceFactor(label: string, actualDuration: number): number {
    const stats = this.history.get(label);
    if (!stats || stats.avgDuration === 0) return 1.0;
    return actualDuration / stats.avgDuration;
  }
}

export const etaPredictor = new ETAPredictor();
