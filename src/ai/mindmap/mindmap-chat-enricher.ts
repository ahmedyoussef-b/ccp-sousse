// src/ai/mindmap/mindmap-chat-enricher.ts

import { mindMapRagBridge } from './mindmap-rag-bridge';
import { getSQLiteCore } from '../core/sqlite';
import { logger } from '../core/sqlite/utils';
import { mindMapCache } from './mindmap-cache';

const CIRCUIT_IDS_CACHE_KEY = 'enricher:circuit_ids';
const CIRCUIT_IDS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class MindMapChatEnricher {
  private static instance: MindMapChatEnricher;
  private static readonly MAX_KEYWORDS = 10;
  private static readonly MAX_KEYWORD_LENGTH = 100;

  private constructor() {}

  public static getInstance(): MindMapChatEnricher {
    if (!MindMapChatEnricher.instance) {
      MindMapChatEnricher.instance = new MindMapChatEnricher();
    }
    return MindMapChatEnricher.instance;
  }

  /**
   * Escape special SQL LIKE characters to prevent injection and unintended wildcard matching
   */
  private escapeLike(value: string): string {
    return value.replace(/[%_\\]/g, '\\$&');
  }

  /**
   * Sanitize a user keyword for SQL usage: trim, limit length, escape special chars
   */
  private sanitizeKeyword(word: string): string | null {
    const trimmed = word.trim().substring(0, MindMapChatEnricher.MAX_KEYWORD_LENGTH);
    if (trimmed.length < 2) return null;
    // Reject keywords that are purely SQL meta-characters
    if (/^[%_'";\\-]+$/.test(trimmed)) return null;
    return this.escapeLike(trimmed);
  }

  /**
   * Returns all known circuit IDs from the database, cached for 5 minutes
   * to avoid repeated DB queries during a chat session.
   */
  private getCachedCircuitIds(): { circuit_id: string }[] {
    const cached = mindMapCache.get<{ circuit_id: string }[]>(CIRCUIT_IDS_CACHE_KEY);
    if (cached) {
      return cached;
    }

    const db = getSQLiteCore().getDB();
    const rows = db.prepare('SELECT circuit_id FROM circuit_mindmaps').all() as { circuit_id: string }[];
    
    mindMapCache.set(CIRCUIT_IDS_CACHE_KEY, rows, CIRCUIT_IDS_CACHE_TTL);
    logger.info('MINDMAP-CHAT', `📋 ${rows.length} circuits chargés et mis en cache`);
    
    return rows;
  }

  /**
   * Invalidate the circuit IDs cache (call after mindmap creation/deletion)
   */
  public invalidateCircuitCache(): void {
    mindMapCache.invalidate(CIRCUIT_IDS_CACHE_KEY);
    logger.info('MINDMAP-CHAT', '🔄 Cache des circuits invalidé');
  }

  /**
   * Scans a user query to detect mentions of existing industrial circuits or specific node content (labels)
   */
  public detectCircuitIds(query: string): string[] {
    const detected: string[] = [];
    const queryLower = query.toLowerCase();

    try {
      const db = getSQLiteCore().getDB();
      
      // 1. Direct Circuit ID Matching — use cached circuit list
      const circuitRows = this.getCachedCircuitIds();
      circuitRows.forEach(row => {
        const id = row.circuit_id;
        // Sanitize the circuit ID for regex usage (escape special regex chars)
        const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedId}\\b`, 'i');
        if (regex.test(query) || (id.length >= 4 && queryLower.includes(id.toLowerCase()))) {
          detected.push(id);
        }
      });

      // 2. Keyword matching in Node Labels/Descriptions — sanitize user input
      const rawWords = queryLower.split(/[\s,.'()?]+/).filter(w => w.length > 2);
      const sanitizedWords: string[] = [];
      
      for (const word of rawWords) {
        const sanitized = this.sanitizeKeyword(word);
        if (sanitized) {
          sanitizedWords.push(sanitized);
        }
        if (sanitizedWords.length >= MindMapChatEnricher.MAX_KEYWORDS) break;
      }

      if (sanitizedWords.length > 0) {
        const placeholders = sanitizedWords.map(() => 'n.label LIKE ? OR n.description LIKE ?').join(' OR ');
        // Wrap each sanitized keyword with % for LIKE — safe because we escaped % and _
        const params = sanitizedWords.flatMap(w => [`%${w}%`, `%${w}%`]);
        
        const nodeMatches = db.prepare(`
          SELECT DISTINCT c.circuit_id 
          FROM circuit_mindmaps c
          JOIN mindmap_nodes n ON n.mindmap_id = c.id
          WHERE ${placeholders}
        `).all(...params) as { circuit_id: string }[];

        nodeMatches.forEach(m => detected.push(m.circuit_id));
      }

    } catch (error) {
      logger.error('MINDMAP-CHAT', 'Error detecting circuit IDs in query', error);
    }

    return Array.from(new Set(detected));
  }

  /**
   * Enriches the prompt or context array with mindmap data if relevant circuits are detected
   */
  public async enrichPromptContext(query: string, currentContext: string): Promise<{ enrichedContext: string; detectedCircuits: string[] }> {
    const detectedCircuits = this.detectCircuitIds(query);
    if (detectedCircuits.length === 0) {
      return { enrichedContext: currentContext, detectedCircuits: [] };
    }

    logger.info('MINDMAP-CHAT', `🎯 Mentions de circuits détectées : ${detectedCircuits.join(', ')}. Enrichissement du contexte sémantique...`);

    let enrichmentMarkdown = '';
    
    for (const circuitId of detectedCircuits) {
      const result = mindMapRagBridge.getMindMapContextForCircuit(circuitId);
      if (result) {
        enrichmentMarkdown += result.markdown;
      }
    }

    if (enrichmentMarkdown) {
      const enrichedContext = currentContext 
        ? `${currentContext}\n\n=== 🧠 COMPRÉHENSION TOPOLOGIQUE DU CIRCUIT ===\n${enrichmentMarkdown}\n=============================================`
        : enrichmentMarkdown;

      return { enrichedContext, detectedCircuits };
    }

    return { enrichedContext: currentContext, detectedCircuits };
  }

  /**
   * Appends metadata elements to the chat response so that the client UI can render the interactive Mind Map button.
   */
  public getClientEnrichmentMetadata(detectedCircuits: string[]): any {
    if (detectedCircuits.length === 0) return null;

    return {
      type: 'mindmap_enrichment',
      circuits: detectedCircuits,
      hasMindmap: true,
      messageHint: `🧠 Schéma mental interactif disponible pour le(s) circuit(s) ${detectedCircuits.join(', ')}.`
    };
  }
}

export const mindMapChatEnricher = MindMapChatEnricher.getInstance();