import { callGemini, GEMINI_MODELS, isGeminiAvailable } from '@/ai/providers/gemini-provider';
import { callOllama } from '@/ai/providers/ollama-client';
import { MODELS_CONFIG, DEFAULT_MODELS } from '@/ai/config/models.config';
import { HybridSearchResult } from '@/ai/innovations/types';
import { quotaManager } from '@/ai/resilience/quota-manager';


/**
 * Service de Re-Ranking MLLM (Multi-modal Large Language Model)
 * Utilise Gemini 1.5 Flash pour affiner les résultats de recherche visuelle
 * @version 1.0.0
 */
export class MLLMReRanker {
  private readonly PRIMARY_MODEL = GEMINI_MODELS.GEMINI_2_0_FLASH;
  private readonly LOCAL_VISION_MODEL = DEFAULT_MODELS.image || 'qwen3-vl:8b';
  private readonly MAX_CANDIDATES = 20;

  /**
   * Appelle le meilleur modèle de vision disponible (Cloud ou Local)
   */
  private async callBestVisionModel(prompt: string, imageBase64: string): Promise<string> {
    const startTime = Date.now();
    
    // 1. Tenter Gemini (Cloud - Qualité maximale)
    const geminiStatus = await isGeminiAvailable();
    const isQuotaAvailable = await quotaManager.isAvailable('gemini');

    if (geminiStatus.available && isQuotaAvailable) {
      try {
        console.log(`[MLLM-ReRanker] 🌐 Utilisation de ${this.PRIMARY_MODEL} (Cloud)`);
        return await callGemini(prompt, {
          model: this.PRIMARY_MODEL,
          images: [imageBase64],
          temperature: 0.1,
          maxTokens: 1000
        });
      } catch (err) {
        console.warn(`[MLLM-ReRanker] ⚠️ Échec Gemini, basculement vers local...`, err);
      }
    } else {
      if (!isQuotaAvailable) {
        console.warn(`[MLLM-ReRanker] ⚠️ Quota Gemini épuisé, basculement vers local.`);
      }
    }

    // 2. Fallback Ollama (Local - Souvent disponible hors-ligne)
    if (process.env.USE_OLLAMA === 'true') {
      try {
        console.log(`[MLLM-ReRanker] 🖥️ Utilisation de ${this.LOCAL_VISION_MODEL} (Local)`);
        return await callOllama(prompt, {
          model: this.LOCAL_VISION_MODEL,
          images: [imageBase64],
          temperature: 0.1,
          maxTokens: 1000
        });
      } catch (err) {
        console.error(`[MLLM-ReRanker] ❌ Tous les modèles de vision ont échoué`);
        throw new Error('Aucun modèle de vision disponible pour le re-ranking');
      }
    } else {
      console.warn(`[MLLM-ReRanker] ⏭️ Fallback Ollama ignoré (désactivé par configuration)`);
      throw new Error('Re-ranking MLLM indisponible (Cloud quota atteint et Local désactivé)');
    }
  }

  /**
   * Ré-ordonne les résultats basés sur une analyse visuelle profonde par l'IA
   */

  async reRankResults(
    imageBuffer: Buffer,
    results: HybridSearchResult[],
    query?: string
  ): Promise<HybridSearchResult[]> {
    if (!results || results.length === 0) return results;

    const startTime = Date.now();
    const requestId = `RERANK_${Math.random().toString(36).substring(7).toUpperCase()}`;
    
    // On ne re-rank que les Top-N pour garder une latence faible
    const candidates = results.slice(0, this.MAX_CANDIDATES);
    const others = results.slice(this.MAX_CANDIDATES);

    console.log(`[MLLM-ReRanker][${requestId}] 🚀 Début du re-ranking pour ${candidates.length} candidats`);

    try {
      // 1. Préparer l'image en base64
      const base64Image = imageBuffer.toString('base64');

      // 2. Préparer la liste des candidats pour le prompt
      const candidatesList = candidates.map((c, index) => ({
        index,
        id: c.id,
        filename: c.metadata.filename,
        description: c.metadata.description,
        tags: c.metadata.tags.join(', ')
      }));

      // 3. Construire le prompt
      const prompt = `
        En tant qu'expert en vision industrielle, analyse l'image fournie (image de requête) 
        et compare-la aux ${candidates.length} candidats suivants issus d'une recherche par similarité.
        
        ${query ? `La recherche initiale contenait aussi cette intention textuelle : "${query}"` : ''}
        
        CANDIDATS :
        ${JSON.stringify(candidatesList, null, 2)}
        
        TACHE :
        Ré-évalue la pertinence de chaque candidat par rapport à l'image de requête.
        Donne un score de pertinence entre 0.0 et 1.0 pour chaque candidat.
        Un score élevé (0.9+) signifie que c'est visuellement le même objet ou une pièce identique.
        Un score moyen (0.5-0.7) signifie une ressemblance structurelle mais pas identique.
        Un score faible (<0.3) signifie une erreur de correspondance visuelle.
        
        FORMAT DE RÉPONSE ATTENDU (JSON UNIQUEMENT) :
        [
          { "id": "id_du_candidat", "score": 0.95, "reason": "explication courte" },
          ...
        ]
      `;

      // 4. Appeler le meilleur modèle disponible (Resilience)
      const responseText = await this.callBestVisionModel(prompt, base64Image);

      // 5. Parser la réponse

      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('Format de réponse JSON non trouvé dans la réponse Gemini');
      }

      const reRankedScores = JSON.parse(jsonMatch[0]) as Array<{ id: string; score: number; reason: string }>;
      
      // 6. Fusionner les nouveaux scores
      const reRankedResults = candidates.map(candidate => {
        const newScoreObj = reRankedScores.find(s => s.id === candidate.id || `vision_${s.id}` === candidate.id);
        
        if (newScoreObj) {
          // On pondère : 70% MLLM, 30% pipeline original pour la sécurité
          const finalScore = (newScoreObj.score * 0.7) + (candidate.combinedScore * 0.3);
          
          return {
            ...candidate,
            combinedScore: finalScore,
            mllmReRanked: true,
            mllmScore: newScoreObj.score,
            mllmReason: newScoreObj.reason
          };
        }
        return candidate;
      });

      // 7. Trier et combiner
      const finalResults = [...reRankedResults, ...others].sort((a, b) => b.combinedScore - a.combinedScore);

      const duration = Date.now() - startTime;
      console.log(`[MLLM-ReRanker][${requestId}] ✅ Re-ranking terminé en ${duration}ms`);
      
      // Log des changements de top position
      if (finalResults[0].id !== results[0].id) {
        console.log(`[MLLM-ReRanker][${requestId}] 🔄 CHANGEMENT DE TOP RÉSULTAT : ${results[0].metadata.filename} -> ${finalResults[0].metadata.filename}`);
      }

      return finalResults;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[MLLM-ReRanker][${requestId}] ❌ Échec du re-ranking après ${duration}ms:`, error);
      // En cas d'erreur, on retourne les résultats originaux (SÛR)
      return results;
    }
  }
}

export const mllmReRanker = new MLLMReRanker();
