// src/ai/vision/vision-rag.ts
import { chromaDBManager } from '@/ai/vector/chromadb-manager';
import { VisionMetadata } from '@/types/vision';

export interface VisionSearchResult {
  imageId: string;
  metadata: VisionMetadata;
  similarity?: number;
}

const MIN_SIMILARITY = 0.40; // Seuil de similarité minimal (abaissé pour matcher la RAG hybride)

export async function searchImagesByQuery(query: string, nResults: number = 3): Promise<VisionSearchResult[]> {
  try {
    const results = await chromaDBManager.search('VISION', query, { nResults });
    if (!results.documents?.[0]?.length) return [];

    const images: VisionSearchResult[] = [];
    for (let i = 0; i < results.ids[0].length; i++) {
      // Récupération de la distance cosinus (plus petite = plus proche)
      const distance = results.distances?.[0]?.[i] ?? 1;
      const similarity = 1 - distance; // Conversion en similarité (0..1)

      // ✅ Filtrage : on ne garde que les images avec une similarité suffisante
      if (similarity < MIN_SIMILARITY) continue;

      const meta = results.metadatas[0][i];
      const rawId = results.ids[0][i];
      const actualId = meta.imageId || (rawId.startsWith('vision_') ? rawId.replace('vision_', '') : rawId);

      images.push({
        imageId: actualId,
        metadata: {
          filename: meta.filename || '',
          description: meta.description || '',
          tags: meta.tags ? (typeof meta.tags === 'string' ? meta.tags.split(',') : meta.tags) : [],
          location: meta.location || '',
          folderId: meta.folderId || 'root',
          linkedDocumentIds: meta.linkedDocumentIds ? (typeof meta.linkedDocumentIds === 'string' ? meta.linkedDocumentIds.split(',') : meta.linkedDocumentIds) : [],
          date: meta.date || '',
          invocationKeywords: meta.invocationKeywords || '',
          equipmentState: meta.equipmentState as any,
          linkedProcedure: meta.linkedProcedure,
          qaPairs: meta.qaPairs,
        } as VisionMetadata,
        similarity
      });
    }
    return images;
  } catch (error) {
    console.error('Erreur recherche images:', error);
    return [];
  }
}