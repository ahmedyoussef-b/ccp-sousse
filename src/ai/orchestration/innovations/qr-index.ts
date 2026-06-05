/**
 * @fileOverview QRIndex - Index des questions/réponses par fichier
 * @version 1.0.0
 * @description Indexe les paires questions/réponses pour une recherche à haute précision
 * @innovation 1/3 (Amélioration 1)
 */

import { getSQLiteCore } from '@/ai/core/sqlite/manager';
import { QREntry } from '@/ai/core/sqlite/types';
import type { ZoneType } from '@/ai/vector/chromadb-schema';

// ============================================================================
// TYPES
// ============================================================================

export interface QRSearchResult {
  entry: QREntry;
  score: number;
  matchType: 'exact' | 'similar' | 'keyword' | 'hybrid';
}

export interface QRIndexOptions {
  minConfidence?: number;
  maxResults?: number;
  similarityThreshold?: number;
  includeZones?: ZoneType[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_OPTIONS: QRIndexOptions = {
  minConfidence: 0.7,
  maxResults: 5,
  similarityThreshold: 0.75
};

// ============================================================================
// LOGS
// ============================================================================

const LOG_PREFIX = '[QR-INDEX]';

function logInfo(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logSuccess(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} ✅ ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logWarning(message: string, data?: any): void {
  console.warn(`${LOG_PREFIX} ⚠️ ${message}`);
  if (data) console.warn(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

// ============================================================================
// SERVICE
// ============================================================================

export class QRIndex {
  private db = getSQLiteCore();
  private initialized = false;

  constructor() {}

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.db.initialize();
    this.initialized = true;
    logSuccess('QR Index initialisé');
  }

  /**
   * Indexe un fichier avec ses questions/réponses
   */
  async indexFile(
    filePath: string,
    content: string,
    _zone: ZoneType,
    metadata?: Record<string, any>
  ): Promise<number> {
    await this.initialize();
    
    logInfo(`Indexation du fichier: ${filePath}`);
    
    const entries: QREntry[] = [];
    
    // 1. Extraire les paires Q/R du document
    const qrPairs = this.extractQRPairs(content, filePath);
    entries.push(...qrPairs);
    
    // 2. Générer des questions synthétiques basées sur les titres
    const syntheticQuestions = this.generateSyntheticQuestions(content, filePath);
    entries.push(...syntheticQuestions);
    
    // 3. Extraire les questions à partir des métadonnées du fichier
    if (metadata) {
      const metadataQuestions = this.extractFromMetadata(metadata, filePath);
      entries.push(...metadataQuestions);
    }
    
    // 4. Générer des embeddings et sauvegarder
    let savedCount = 0;
    for (const entry of entries) {
      try {
        entry.embedding = await this.generateEmbedding(entry.question);
        await this.db.qr.save(entry);
        savedCount++;
      } catch (error) {
        logWarning(`Erreur sauvegarde entrée: ${entry.question.substring(0, 50)}...`);
      }
    }
    
    logSuccess(`${savedCount}/${entries.length} entrées indexées pour ${filePath}`);
    return savedCount;
  }

  /**
   * Extrait les paires Q/R d'un document
   */
  private extractQRPairs(content: string, sourceFile: string): QREntry[] {
    const entries: QREntry[] = [];
    const lines = content.split('\n');
    
    // Patterns pour détecter les questions et réponses
    const questionPatterns = [
      /^Q[:：]\s*(.+)$/i,
      /^Question[:：]\s*(.+)$/i,
      /^\d+\.\s*(.+)\?$/,
      /^[•\-]\s*(.+)\?$/,
      /^(.+)\?$/  // Toute ligne se terminant par ?
    ];
    
    const answerPatterns = [
      /^R[:：]\s*(.+)$/i,
      /^Réponse[:：]\s*(.+)$/i,
      /^A[:：]\s*(.+)$/i,
      /^Answer[:：]\s*(.+)$/i
    ];
    
    let currentQuestion: string | null = null;
    let currentAnswer: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Détection d'une question
      let isQuestion = false;
      let questionText = '';
      
      for (const pattern of questionPatterns) {
        const match = trimmed.match(pattern);
        if (match && match[1]) {
          questionText = match[1].trim();
          isQuestion = true;
          break;
        }
      }
      
      if (isQuestion && currentQuestion) {
        // Sauvegarder la paire précédente
        if (currentAnswer.length > 0) {
          entries.push(this.createEntry(
            currentQuestion,
            currentAnswer.join(' '),
            sourceFile,
            'extracted'
          ));
        }
        currentQuestion = questionText;
        currentAnswer = [];
      } else if (isQuestion && !currentQuestion) {
        currentQuestion = questionText;
        currentAnswer = [];
      } else if (currentQuestion) {
        // Vérifier si c'est une réponse explicite
        let isAnswer = false;
        for (const pattern of answerPatterns) {
          const match = trimmed.match(pattern);
          if (match && match[1]) {
            currentAnswer.push(match[1].trim());
            isAnswer = true;
            break;
          }
        }
        if (!isAnswer && trimmed.length > 20) {
          currentAnswer.push(trimmed);
        }
      }
    }
    
    // Dernière paire
    if (currentQuestion && currentAnswer.length > 0) {
      entries.push(this.createEntry(
        currentQuestion,
        currentAnswer.join(' '),
        sourceFile,
        'extracted'
      ));
    }
    
    return entries;
  }

  /**
   * Génère des questions synthétiques à partir des titres/sections
   */
  private generateSyntheticQuestions(content: string, sourceFile: string): QREntry[] {
    const entries: QREntry[] = [];
    
    // Extraire les titres (markdown, HTML, etc.)
    const titlePatterns = [
      /^#\s+(.+)$/gm,           // Markdown H1
      /^##\s+(.+)$/gm,          // Markdown H2
      /^###\s+(.+)$/gm,         // Markdown H3
      /<h[1-3][^>]*>(.+)<\/h[1-3]>/gi, // HTML
      /^([A-Z][A-Z\s]+)$/gm     // TITRE EN MAJUSCULES
    ];
    
    const titles: string[] = [];
    for (const pattern of titlePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 3 && match[1].length < 100) {
          titles.push(match[1].trim());
        }
      }
    }
    
    // Générer des questions à partir des titres uniques
    const uniqueTitles = [...new Set(titles)];
    for (const title of uniqueTitles.slice(0, 10)) {
      // Nettoyer le titre
      const cleanTitle = title.replace(/[#*_]/g, '').trim();
      
      // Générer différentes formulations de questions
      const questions = [
        `Qu'est-ce que ${cleanTitle} ?`,
        `Décris ${cleanTitle}`,
        `Informations sur ${cleanTitle}`,
        `${cleanTitle} explication`
      ];
      
      // Prendre la première question pertinente
      const answer = `Contenu du document concernant: ${cleanTitle}\n\n${this.extractRelevantSection(content, title)}`;
      
      entries.push(this.createEntry(questions[0], answer, sourceFile, 'synthetic', 0.7));
    }
    
    return entries;
  }

  /**
   * Extrait la section pertinente d'un titre
   */
  private extractRelevantSection(content: string, title: string): string {
    const lines = content.split('\n');
    let found = false;
    let section: string[] = [];
    
    for (const line of lines) {
      if (line.includes(title)) {
        found = true;
        continue;
      }
      if (found && (line.startsWith('#') || line.startsWith('##') || line.startsWith('###'))) {
        break;
      }
      if (found && section.length < 20) {
        section.push(line);
      }
    }
    
    return section.join(' ').substring(0, 500);
  }

  /**
   * Extrait des questions à partir des métadonnées
   */
  private extractFromMetadata(metadata: Record<string, any>, sourceFile: string): QREntry[] {
    const entries: QREntry[] = [];
    
    if (metadata.title) {
      entries.push(this.createEntry(
        `Qu'est-ce que ${metadata.title} ?`,
        `Document: ${metadata.title}`,
        sourceFile,
        'metadata',
        0.8
      ));
    }
    
    if (metadata.description) {
      entries.push(this.createEntry(
        metadata.description.length > 50 ? metadata.description.substring(0, 50) + '...' : metadata.description,
        metadata.description,
        sourceFile,
        'metadata',
        0.75
      ));
    }
    
    if (metadata.keywords && Array.isArray(metadata.keywords)) {
      for (const keyword of metadata.keywords.slice(0, 5)) {
        entries.push(this.createEntry(
          `Informations sur ${keyword}`,
          `Document contenant des informations sur ${keyword}`,
          sourceFile,
          'metadata',
          0.65
        ));
      }
    }
    
    return entries;
  }

  /**
   * Crée une entrée Q/R
   */
  private createEntry(
    question: string,
    answer: string,
    sourceFile: string,
    category: string,
    confidence: number = 0.8
  ): QREntry {
    const id = `qr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    // Extraire les mots-clés de la question
    const keywords = question
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 10);
    
    return {
      id,
      question: question.substring(0, 500),
      answer: answer.substring(0, 2000),
      sourceFile,
      sourcePath: sourceFile,
      zone: 'SHARED' as ZoneType,
      embedding: [], // Rempli plus tard
      keywords,
      confidence,
      usageCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      category,
      language: 'fr'
    };
  }

  /**
   * Génère un embedding pour un texte
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // TODO: Utiliser le service d'embeddings (Xenova, OpenAI, etc.)
    // Pour l'instant, génération basée sur le hash
    const words = text.toLowerCase().split(/\s+/);
    const vector = new Array(384).fill(0);
    
    for (let i = 0; i < words.length && i < 384; i++) {
      const hash = this.hashCode(words[i]);
      vector[i] = (hash % 1000) / 1000;
    }
    
    return vector;
  }

  /**
   * Hash simple pour embedding basique
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /**
   * Recherche par similarité de question
   */
  async search(
    query: string,
    zone?: ZoneType,
    options?: QRIndexOptions
  ): Promise<QRSearchResult[]> {
    await this.initialize();
    
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    logInfo(`🔍 Recherche QR: "${query.substring(0, 60)}..."`);
    
    // 1. Générer l'embedding de la requête
    const queryEmbedding = await this.generateEmbedding(query);
    
    // 2. Recherche hybride via SQLite
    const result = await this.db.qr.searchHybrid(query, queryEmbedding, zone);
    
    if (!result) {
      logInfo(`Aucun résultat trouvé`);
      return [];
    }
    
    // 3. Calculer le score final
    const similarity = this.cosineSimilarity(queryEmbedding, result.embedding);
    const keywordMatch = result.keywords.some(k => query.toLowerCase().includes(k));
    
    let score = similarity;
    if (keywordMatch) score = Math.min(0.95, score + 0.1);
    if (result.confidence >= 0.9) score = Math.min(0.95, score + 0.05);
    
    if (score < (opts.similarityThreshold || 0.75)) {
      logInfo(`Score trop bas: ${(score * 100).toFixed(0)}% < ${((opts.similarityThreshold || 0.75) * 100).toFixed(0)}%`);
      return [];
    }
    
    const matchType: QRSearchResult['matchType'] = similarity > 0.85 ? 'exact' : (keywordMatch ? 'keyword' : 'similar');
    
    logSuccess(`Trouvé: "${result.question.substring(0, 50)}..." (score: ${(score * 100).toFixed(0)}%)`);
    
    // Incrémenter le compteur d'utilisation
    await this.db.qr.incrementUsage(result.id);
    
    return [{
      entry: result,
      score,
      matchType
    }];
  }

  /**
   * Recherche par mots-clés uniquement
   */
  async searchByKeywords(
    keywords: string[],
    zone?: ZoneType,
    options?: QRIndexOptions
  ): Promise<QRSearchResult[]> {
    await this.initialize();
    
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const results = await this.db.qr.searchByKeywords(keywords, zone);
    
    return results.slice(0, opts.maxResults).map(r => ({
      entry: r,
      score: (r as any).matchScore || 0.5,
      matchType: 'keyword'
    }));
  }

  /**
   * Récupère une entrée par ID
   */
  async get(id: string): Promise<QREntry | null> {
    await this.initialize();
    return this.db.qr.get(id);
  }

  /**
   * Supprime une entrée
   */
  async delete(id: string): Promise<boolean> {
    await this.initialize();
    return this.db.qr.delete(id);
  }

  /**
   * Récupère les statistiques
   */
  async getStats(): Promise<{ total: number; byZone: Record<string, number>; avgConfidence: number }> {
    await this.initialize();
    return this.db.qr.getStats();
  }

  /**
   * Nettoie les entrées anciennes
   */
  async cleanup(olderThanDays: number = 90, minUsage: number = 0): Promise<number> {
    await this.initialize();
    const olderThanMs = olderThanDays * 24 * 60 * 60 * 1000;
    return this.db.qr.cleanup(olderThanMs, minUsage);
  }

  /**
   * Calcule la similarité cosinus
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  /**
   * Réindexe tous les fichiers d'une zone
   */
  async reindexZone(zone: ZoneType, filePaths: string[]): Promise<{ total: number; indexed: number; failed: number }> {
    await this.initialize();
    
    let indexed = 0;
    let failed = 0;
    
    for (const filePath of filePaths) {
      try {
        // Lire le contenu du fichier
        const fs = await import('fs');
        const content = fs.readFileSync(filePath, 'utf-8');
        const count = await this.indexFile(filePath, content, zone);
        if (count > 0) indexed++;
        else failed++;
      } catch (error) {
        failed++;
        logWarning(`Échec indexation: ${filePath}`);
      }
    }
    
    logSuccess(`Zone ${zone}: ${indexed} indexés, ${failed} échecs`);
    return { total: filePaths.length, indexed, failed };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const qrIndex = new QRIndex();
export default qrIndex;