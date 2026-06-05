/**
 * Service de déduplication - Évite les doublons dans le cache permanent
 * @version 2.0.0
 * @description Vérifie la similarité avant insertion dans le cache permanent
 * @changes Migration Core SQLite - Suppression dépendance permanent-cache-manager
 */

import { SQLiteCore } from '@/ai/core/sqlite';
import { localEmbeddingService } from '../cache/local-embeddings';
import type { DeduplicationResult, DeduplicationOptions, PermanentCacheEntry } from './types';

export class DeduplicationService {
  private static instance: DeduplicationService;
  private initialized = false;
  private similarityThreshold = 0.85;
  private minEnrichThreshold = 0.75;
  private db: SQLiteCore | null = null;

  private constructor() {}

  static getInstance(): DeduplicationService {
    if (!DeduplicationService.instance) {
      DeduplicationService.instance = new DeduplicationService();
    }
    return DeduplicationService.instance;
  }

  private async getDB(): Promise<SQLiteCore> {
    if (!this.db) {
      this.db = SQLiteCore.getInstance();
      await this.db.initialize();
    }
    return this.db;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await localEmbeddingService.initialize();
    await this.getDB();
    this.initialized = true;
    console.log(`[DEDUP] ✅ Initialisé (seuil: ${this.similarityThreshold})`);
  }

  /**
   * Calcule la similarité approximative entre deux questions
   * (méthode simple sans embedding pour éviter latence)
   */
  private calculateSimilarity(question1: string, question2: string): number {
    const norm1 = this.normalizeQuestion(question1);
    const norm2 = this.normalizeQuestion(question2);
    
    if (norm1 === norm2) return 1.0;
    if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;
    
    const words1 = new Set(norm1.split(' '));
    const words2 = new Set(norm2.split(' '));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Vérifie si une question est un doublon
   */
  async checkDuplicate(
    question: string,
    zone?: string,
    options: DeduplicationOptions = {}
  ): Promise<DeduplicationResult> {
    await this.initialize();
    
    const threshold = options.similarityThreshold || this.similarityThreshold;
    const enrichThreshold = options.minEnrichThreshold || this.minEnrichThreshold;
    
    const db = await this.getDB();
    const allEntries = db.cache.searchPermanentEntries(zone) as PermanentCacheEntry[];
    
    if (allEntries.length === 0) {
      return { isDuplicate: false, action: 'add' };
    }
    
    let bestMatch: { entry: PermanentCacheEntry; similarity: number } | null = null;
    
    for (const entry of allEntries) {
      const similarity = this.calculateSimilarity(question, entry.question);
      if (similarity > (bestMatch?.similarity || 0)) {
        bestMatch = { entry, similarity };
      }
    }
    
    if (!bestMatch) {
      return { isDuplicate: false, action: 'add' };
    }
    
    const { entry, similarity } = bestMatch;
    
    if (similarity >= threshold) {
      // Doublon quasi-identique → on ignore
      return {
        isDuplicate: true,
        existingHash: entry.hash,
        similarity,
        action: 'skip'
      };
    }
    
    if (similarity >= enrichThreshold) {
      // Similaire mais pas identique → on enrichit l'existant
      return {
        isDuplicate: true,
        existingHash: entry.hash,
        similarity,
        action: 'enrich'
      };
    }
    
    return { isDuplicate: false, action: 'add' };
  }

  /**
   * Enrichit une entrée existante avec une nouvelle variante de question
   */
  async enrichExisting(
    hash: string,
    newQuestion: string
  ): Promise<boolean> {
    await this.initialize();
    
    try {
      const fs = require('fs');
      const path = require('path');
      
      const variantsPath = path.join(process.cwd(), 'data', 'training', 'variants', `${hash}.json`);
      const variantsDir = path.dirname(variantsPath);
      
      if (!fs.existsSync(variantsDir)) {
        fs.mkdirSync(variantsDir, { recursive: true });
      }
      
      let variants: string[] = [];
      if (fs.existsSync(variantsPath)) {
        variants = JSON.parse(fs.readFileSync(variantsPath, 'utf-8'));
      }
      
      // Éviter les doublons dans les variantes
      const normalizedNew = newQuestion.toLowerCase().trim();
      if (!variants.some(v => v.toLowerCase().trim() === normalizedNew)) {
        variants.push(newQuestion);
        fs.writeFileSync(variantsPath, JSON.stringify(variants, null, 2));
        console.log(`[DEDUP] 📝 Enrichi: nouvelle variante pour ${hash}`);
      }
      
      return true;
    } catch (error) {
      console.error(`[DEDUP] ❌ Erreur enrichissement:`, error);
      return false;
    }
  }

  /**
   * Normalise une question pour comparaison exacte
   */
  normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}

export const deduplicationService = DeduplicationService.getInstance();