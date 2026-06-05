// @ts-nocheck
/**
 * @fileOverview EpisodicMemory - Gestion de la mémoire persistante vectorielle.
 * @version 1.0.0
 */

import { chromaDBManager } from '../vector/chromadb-manager';
import { CollectionName } from '../vector/chromadb-schema';
import { v4 as uuidv4 } from 'uuid';

export interface Episode {
  id?: string;
  timestamp: number;
  context: string;   // Texte brut ou stringified JSON (sera vectorisé)
  action: unknown;      // Objet action
  result: unknown;      // Résultat (consequence)
  success: boolean;
  metadata?: Record<string, unknown>;
}

export class EpisodicMemory {
  private readonly collection: CollectionName = 'MEMOIRE_EPISODIQUE';

  /**
   * Enregistre un nouvel épisode dans la mémoire persistante
   */
  public async saveEpisode(episode: Episode): Promise<string> {
    const id = episode.id || `epi_${uuidv4()}`;
    
    const document = `CONTEXT: ${episode.context}\nACTION: ${JSON.stringify(episode.action)}\nRESULT: ${JSON.stringify(episode.result)}`;
    
    const metadata = {
      timestamp: episode.timestamp,
      success: episode.success,
      action_type: episode.action?.type || 'unknown',
      ...episode.metadata
    };

    try {
      await chromaDBManager.upsertDocuments(this.collection, [{
        id,
        content: document,
        metadata
      }]);
      return id;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[EPISODIC-MEMORY] Erreur lors de la sauvegarde:', err.message);
      return id;
    }
  }

  /**
   * Récupère des épisodes similaires basés sur le contexte actuel
   */
  public async recallSimilarEpisodes(queryContext: string, limit: number = 3): Promise<Episode[]> {
    try {
      const results = await chromaDBManager.search(this.collection, queryContext, {
        nResults: limit
      });

      if (!results || !results.ids || results.ids[0].length === 0) {
        return [];
      }

      const episodes: Episode[] = [];
      for (let i = 0; i < results.ids[0].length; i++) {
          const metadata = results.metadatas[0][i];
          const content = results.documents[0][i];
          
          // Note: Dans une version plus complexe, nous parserions le contenu
          // Ici on retourne une structure simplifiée pour le LLM
          episodes.push({
              id: results.ids[0][i],
              timestamp: Number(metadata.timestamp),
              context: content,
              action: {}, // Les détails sont dans "context" (le document vectorisé)
              result: {},
              success: metadata.success === true || metadata.success === 'true',
              metadata
          });
      }

      return episodes;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[EPISODIC-MEMORY] Erreur lors du rappel:', err.message);
      return [];
    }
  }
}

export const episodicMemory = new EpisodicMemory();
