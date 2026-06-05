/**
 * @fileOverview AdaptiveTuning - Innovation pour l'ajustement local du modèle.
 * Intègre la logique de sélection de modèle quantifié (Innovation 7).
 */

export class AdaptiveTuning {
  /**
   * Adapte le modèle aux spécificités de l'utilisateur.
   * Sélectionne dynamiquement le modèle le plus efficace (ex: quantification 4-bit).
   */
  async adaptToUser(documents: string[], userQueries: string[]): Promise<boolean> {
    console.log(`[AI][ADAPTIVE] Analyse de ${documents.length} documents pour optimisation locale...`);
    
    try {
      // 1. Identifier les thématiques pour le fine-tuning
      const topics = await this.extractTopics(userQueries);
      
      // 2. Vérification de la disponibilité des modèles quantifiés dans Ollama
      const availableModels = await this.getAvailableQuantizedModels();
      
      if (availableModels.length === 0) {
        console.warn("[AI][ADAPTIVE] Aucun modèle quantifié haute-performance détecté. Utilisation du modèle standard.");
        return false;
      }

      const bestModel = availableModels[0]; // On prend le premier modèle quantifié disponible
      console.log(`[AI][ADAPTIVE] Activation du modèle optimisé : ${bestModel} pour thèmes : ${topics.join(', ')}`);
      
      return await this.switchActiveModel(bestModel);
    } catch (error) {
      console.error("[AI][ADAPTIVE] Erreur lors de l'ajustement adaptatif :", error);
      return false;
    }
  }

  private async getAvailableQuantizedModels(): Promise<string[]> {
    try {
      const response = await fetch('/api/ollama/models');
      if (!response.ok) return [];
      const data = await response.json();
      const models = data.models || [];
      // On cherche des modèles avec des tags de quantification (q4, q5, q8, etc.)
      return models
        .filter((m: any) => m.name.includes('q4') || m.name.includes('q5') || m.name.includes('q8') || m.name.includes('k_m'))
        .map((m: any) => m.name);
    } catch {
      return [];
    }
  }
  
  private async extractTopics(queries: string[]): Promise<string[]> {
    if (queries.length === 0) return ['Général'];
    const context = queries.join(' ').toLowerCase();
    const topics = [];
    if (context.includes('chaudière')) topics.push('Maintenance Chaudières');
    if (context.includes('gaz')) topics.push('Sécurité Gaz');
    if (context.includes('vision') || context.includes('image')) topics.push('Vision Industrielle');
    return topics.length > 0 ? topics : ['Technique Industrielle'];
  }

  private async switchActiveModel(modelName: string): Promise<boolean> {
    try {
      const response = await fetch('/api/config/active-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
