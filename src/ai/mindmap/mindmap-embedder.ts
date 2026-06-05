// src/ai/mindmap/mindmap-embedder.ts

import { getSQLiteCore } from '../core/sqlite';
import { embeddingService } from '../vector/embeddings';
import { chromaDBManager } from '../vector/chromadb-manager';
import { CircuitMindMap, MindMapNode } from './types';
import { logger } from '../core/sqlite/utils';
import { v4 as uuidv4 } from 'uuid';

/** Maximum number of texts to embed in a single batch call */
const EMBEDDING_BATCH_SIZE = 50;
/** Delay between batches to avoid rate limiting (ms) */
const BATCH_DELAY_MS = 200;

export class MindMapEmbedder {
  private static instance: MindMapEmbedder;

  private constructor() {}

  public static getInstance(): MindMapEmbedder {
    if (!MindMapEmbedder.instance) {
      MindMapEmbedder.instance = new MindMapEmbedder();
    }
    return MindMapEmbedder.instance;
  }

  /**
   * Helper to convert an array of numbers to SQLite Buffer
   */
  public embeddingToBuffer(embedding: number[]): Buffer {
    const floatArray = new Float32Array(embedding);
    return Buffer.from(floatArray.buffer);
  }

  /**
   * Helper to convert SQLite Buffer back to an array of numbers
   * The Buffer contains raw bytes of a Float32Array, so we reconstruct it directly
   * by accessing the underlying ArrayBuffer of the Buffer.
   */
  public bufferToEmbedding(buffer: Buffer): number[] {
    // Ensure the buffer length is a multiple of 4 (Float32 = 4 bytes)
    const byteLength = buffer.length - (buffer.length % 4);
    // Create a Float32Array view directly from the buffer's underlying ArrayBuffer
    // at the correct offset and length
    const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, byteLength / 4);
    return Array.from(floatArray);
  }

  /**
   * Splits an array into chunks of the given size
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Generates structural and contextual text chunks for all nodes in a mindmap
   */
  public generateNodeChunks(mindmap: CircuitMindMap): { id: string; nodeId: string; text: string; metadata: any }[] {
    const nodes = mindmap.mindmapData.nodes;
    const chunks: { id: string; nodeId: string; text: string; metadata: any }[] = [];

    // Map parent labels for context
    const nodeMap = new Map<string, Omit<MindMapNode, 'mindmapId'>>();
    nodes.forEach(n => nodeMap.set(n.id, n));

    nodes.forEach(node => {
      let parentLabel = 'aucun';
      if (node.parentId) {
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parentLabel = `"${parent.label}" (${parent.type})`;
        }
      }

      // Find children labels for extra relationship context
      const children = nodes.filter(n => n.parentId === node.id);
      const childrenStr = children.length > 0
        ? children.map(c => `"${c.label}" (${c.type})`).join(', ')
        : 'aucun';

      // Build rich descriptive text incorporating full structural context
      const chunkText = [
        `Circuit Industriel: ${mindmap.circuitId}`,
        `Nœud de Schéma Mental: "${node.label}"`,
        `Type d'Élément: ${node.type}`,
        node.description ? `Description: ${node.description}` : null,
        `Structure: dépend de ${parentLabel}`,
        `Éléments dépendants (enfants): ${childrenStr}`,
        `Mots-clés associés: ${node.type}, ${mindmap.circuitId}, ${node.label.toLowerCase()}`
      ]
        .filter(Boolean)
        .join('\n');

      const chunkMetadata = {
        nodeId: node.id,
        mindmapId: mindmap.id,
        circuitId: mindmap.circuitId,
        nodeType: node.type,
        label: node.label,
        parentId: node.parentId || null
      };

      chunks.push({
        id: `mm_chunk_${mindmap.id}_${node.id}`,
        nodeId: node.id,
        text: chunkText,
        metadata: chunkMetadata
      });
    });

    return chunks;
  }

  /**
   * Generates embeddings in batches to avoid API timeouts and rate limits
   * Returns a flat array of all embeddings in the same order as input texts
   */
  private async batchEmbedWithChunking(texts: string[]): Promise<number[][]> {
    if (texts.length <= EMBEDDING_BATCH_SIZE) {
      return embeddingService.batchEmbed(texts);
    }

    const textBatches = this.chunkArray(texts, EMBEDDING_BATCH_SIZE);
    const allEmbeddings: number[][] = [];
    
    logger.info('MINDMAP', `📦 Vectorisation en ${textBatches.length} lots de ${EMBEDDING_BATCH_SIZE} max (${texts.length} textes au total)`);

    for (let i = 0; i < textBatches.length; i++) {
      const batch = textBatches[i];
      logger.info('MINDMAP', `  ⏳ Lot ${i + 1}/${textBatches.length} (${batch.length} textes)...`);
      
      try {
        const embeddings = await embeddingService.batchEmbed(batch);
        allEmbeddings.push(...embeddings);
      } catch (error) {
        logger.error('MINDMAP', `  ❌ Échec du lot ${i + 1}/${textBatches.length}`, error);
        throw error;
      }

      // Small delay between batches to respect rate limits
      if (i < textBatches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    logger.info('MINDMAP', `  ✅ Tous les lots vectorisés avec succès (${allEmbeddings.length} embeddings)`);
    return allEmbeddings;
  }

  /**
   * Vectorizes and stores all nodes of a mindmap
   */
  public async vectorizeMindMap(mindmap: CircuitMindMap): Promise<void> {
    const dbCore = getSQLiteCore();
    const db = dbCore.getDB();
    const startTime = Date.now();

    try {
      const chunks = this.generateNodeChunks(mindmap);
      if (chunks.length === 0) {
        logger.info('MINDMAP', `Aucun nœud à vectoriser pour le mindmap ${mindmap.id}`);
        return;
      }

      logger.info('MINDMAP', `Vectorisation de ${chunks.length} nœuds pour le circuit ${mindmap.circuitId}...`);

      // 1. Generate embeddings using chunked batch processing for reliability
      const textsToEmbed = chunks.map(c => c.text);
      const embeddings = await this.batchEmbedWithChunking(textsToEmbed);

      // 2. Retrieve existing embedding IDs to delete from ChromaDB first
      const oldEmbeddingRows = db.prepare('SELECT id FROM mindmap_embeddings WHERE mindmap_id = ?').all(mindmap.id) as { id: string }[];
      if (oldEmbeddingRows.length > 0) {
        const oldIds = oldEmbeddingRows.map(r => r.id);
        try {
          await chromaDBManager.deleteDocuments('MINDMAP', oldIds);
        } catch (chromaErr) {
          logger.warn('MINDMAP', 'ChromaDB delete before update failed (non critical)', chromaErr);
        }
      }

      // 3. Clean existing embeddings for this mindmap in SQLite
      db.prepare('DELETE FROM mindmap_embeddings WHERE mindmap_id = ?').run(mindmap.id);

      // 4. Save to local SQLite
      const insertEmbedStmt = db.prepare(`
        INSERT INTO mindmap_embeddings (id, mindmap_id, chunk_text, embedding, metadata)
        VALUES (?, ?, ?, ?, ?)
      `);

      const sqliteTransaction = db.transaction(() => {
        chunks.forEach((chunk, index) => {
          const vector = embeddings[index];
          const buffer = this.embeddingToBuffer(vector);
          insertEmbedStmt.run(
            chunk.id,
            mindmap.id,
            chunk.text,
            buffer,
            JSON.stringify(chunk.metadata)
          );
        });
      });
      sqliteTransaction();

      // 5. Sync to ChromaDB — also chunked for large datasets
      const chromaDocs = chunks.map((chunk, index) => ({
        id: chunk.id,
        content: chunk.text,
        metadata: chunk.metadata,
        embedding: embeddings[index]
      }));

      // Upsert to ChromaDB in batches
      const chromaBatches = this.chunkArray(chromaDocs, EMBEDDING_BATCH_SIZE);
      for (let i = 0; i < chromaBatches.length; i++) {
        await chromaDBManager.upsertDocuments('MINDMAP', chromaBatches[i]);
        if (chromaBatches.length > 1 && i < chromaBatches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      logger.info('MINDMAP', `✅ Vectorisation complétée pour ${mindmap.circuitId} en ${Date.now() - startTime}ms (${chunks.length} nœuds indexés)`);
    } catch (error) {
      logger.error('MINDMAP', `❌ Échec de la vectorisation pour le circuit ${mindmap.circuitId}`, error);
      throw error;
    }
  }

  /**
   * Deletes vectors from both database stores
   */
  public async deleteVectors(mindmapId: string): Promise<void> {
    const db = getSQLiteCore().getDB();
    try {
      // Find IDs before deleting from SQLite
      const rows = db.prepare('SELECT id FROM mindmap_embeddings WHERE mindmap_id = ?').all(mindmapId) as { id: string }[];
      
      if (rows.length > 0) {
        const ids = rows.map(r => r.id);
        // Delete from ChromaDB — also chunked for safety
        const idBatches = this.chunkArray(ids, EMBEDDING_BATCH_SIZE);
        for (const batch of idBatches) {
          try {
            await chromaDBManager.deleteDocuments('MINDMAP', batch);
          } catch (chromaErr) {
            logger.warn('MINDMAP', `ChromaDB vector deletion failed for batch in ${mindmapId}`, chromaErr);
          }
        }
      }

      // Delete from SQLite
      db.prepare('DELETE FROM mindmap_embeddings WHERE mindmap_id = ?').run(mindmapId);
      logger.info('MINDMAP', `🗑️ Vecteurs de mindmap supprimés pour ${mindmapId}`);
    } catch (error) {
      logger.error('MINDMAP', `❌ Échec de suppression des vecteurs de mindmap ${mindmapId}`, error);
    }
  }
}

export const mindMapEmbedder = MindMapEmbedder.getInstance();