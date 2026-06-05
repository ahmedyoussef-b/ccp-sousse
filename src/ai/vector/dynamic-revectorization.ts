// src/ai/vector/dynamic-revectorization.ts
/**
 * @fileOverview DynamicRevectorization - Innovation 5.3.
 * Enrichit le contenu des documents avec les apprentissages accumulés pour une recherche sémantique supérieure.
 */

import { ai } from '@/ai/genkit';
import { embeddingService } from './embeddings';

export interface EnrichmentContext {
  corrections: string[];
  relatedQueries: string[];
  lessons: string[];
}

/**
 * Génère un contenu enrichi en fusionnant le document original avec les insights d'apprentissage.
 */
export async function enrichDocumentContent(
  originalContent: string,
  context: EnrichmentContext
): Promise<{ enhancedContent: string; summary: string }> {
  console.log(`[AI][VECTOR] Enrichissement sémantique d'un document...`);

  if (context.corrections.length === 0 && context.relatedQueries.length === 0 && context.lessons.length === 0) {
    return { enhancedContent: originalContent, summary: "Aucun nouvel apprentissage à intégrer." };
  }

  try {
    const response = await ai.generate({
      model: 'ollama/phi:2.7b',
      system: "Tu es un Expert en Synthèse de Connaissances. Ta mission est d'enrichir un document technique original en y intégrant les leçons, corrections et questions des utilisateurs pour améliorer sa trouvabilité sémantique.",
      prompt: `
        CONTENU ORIGINAL :
        ${originalContent.substring(0, 2000)}
        
        APPRENTISSAGES À INTÉGRER :
        - Corrections : ${context.corrections.join(' | ')}
        - Questions utilisateurs liées : ${context.relatedQueries.join(' | ')}
        - Leçons extraites : ${context.lessons.join(' | ')}
        
        Génère un bloc de "CONTEXTE AUGMENTÉ" à ajouter à la fin du document. 
        Ce bloc doit synthétiser comment ce document est réellement utilisé et quelles précisions ont été apportées par l'usage.
        Reste technique et factuel.`,
    });

    const enhancedBlock = `\n\n--- CONTEXTE AUGMENTÉ (Innovation 5.3) ---\n${response.text}\n`;
    
    return {
      enhancedContent: originalContent + enhancedBlock,
      summary: "Document enrichi avec succès via les apprentissages de session."
    };
  } catch (error) {
    console.error("[AI][VECTOR] Échec enrichissement:", error);
    return { enhancedContent: originalContent, summary: "Échec de l'enrichissement sémantique." };
  }
}

/**
 * Met à jour les embeddings pour l'index vectoriel via Ollama
 * ✅ CORRIGÉ: Utilise embeddingService au lieu de ai.embed
 */
export async function revectorizeContent(content: string): Promise<boolean> {
  try {
    // Tronquer le contenu pour la performance
    const truncatedContent = content.substring(0, 5000);
    
    // Utiliser le service d'embeddings existant
    await embeddingService.generateEmbedding(truncatedContent);
    
    console.log(`[AI][VECTOR] Re-vectorisation réussie pour ${truncatedContent.length} caractères`);
    return true;
  } catch (error) {
    console.warn("[AI][VECTOR] Échec de la re-vectorisation:", error);
    return false;
  }
}

/**
 * Version batch pour re-vectoriser plusieurs contenus
 */
export async function batchRevectorize(contents: string[]): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  
  for (const content of contents) {
    const result = await revectorizeContent(content);
    if (result) {
      success++;
    } else {
      failed++;
    }
  }
  
  console.log(`[AI][VECTOR] Batch re-vectorisation: ${success} succès, ${failed} échecs`);
  return { success, failed };
}