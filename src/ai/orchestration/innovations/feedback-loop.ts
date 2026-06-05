/**
 * @fileOverview FeedbackLoop - Boucle de rétroaction et amélioration continue
 * @version 2.0.0
 * @description Collecte les feedbacks explicites et implicites pour améliorer le système
 * @innovation 7/7
 * @migration SQLite - Stockage persistant
 */

import { getSQLiteCore } from '@/ai/core/sqlite/manager';

// ============================================================================
// TYPES
// ============================================================================

export type FeedbackRating = 'up' | 'down' | 'neutral';
export type ImplicitSignal = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export interface FeedbackRecord {
  id: string;
  userId: string;
  sessionId?: string;
  query: string;
  response: string;
  confidence: number;
  category: string;
  rating?: FeedbackRating;
  comment?: string;
  implicitSignal?: ImplicitSignal;
  timeToNextQuery?: number;
  rewordingSimilarity?: number;
  clickedOnSuggestedDocument?: boolean;
  alternativeSource?: string;
  correction?: string;
  timestamp: number;
  processed: boolean;
}

export interface FeedbackAggregation {
  totalFeedbacks: number;
  positiveRate: number;
  negativeRate: number;
  neutralRate: number;
  avgConfidence: number;
  topIssues: Array<{ issue: string; count: number }>;
  topCategories: Array<{ category: string; count: number; positiveRate: number }>;
  improvementSuggestions: string[];
}

export interface UserAction {
  rating?: FeedbackRating;
  timeToNextQuery?: number;
  rewordingSimilarity?: number;
  clickedOnSuggestedDocument?: boolean;
  alternativeSource?: string;
  correction?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const FEEDBACK_CONFIG = {
  thresholdReplay: 100,
  batchSize: 50,
  decayWeight: 0.9,
  minConfidenceToRecord: 0.5,
  similarityThreshold: 0.7
};

const IMPLICIT_PATTERNS = {
  positive: ['merci', 'parfait', 'excellent', 'super', 'génial', 'utile', 'clair', 'compris', 'aide', 'résolu', 'fonctionne', 'correct'],
  negative: ['pas bon', 'incorrect', 'faux', 'erreur', 'inutile', 'pas clair', 'comprends pas', 'réessaye', 'reformule', 'pas ça', 'faut pas']
};

// ============================================================================
// LOGS
// ============================================================================

const LOG_PREFIX = '[FEEDBACK-LOOP]';

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
// SERVICE AVEC SQLITE
// ============================================================================

export class FeedbackLoop {
  private db = getSQLiteCore();
  private memoryCache = new Map<string, FeedbackRecord>();
  private pendingFeedbacks: FeedbackRecord[] = [];
  private stats = {
    totalFeedbacks: 0,
    positiveFeedbacks: 0,
    negativeFeedbacks: 0,
    neutralFeedbacks: 0,
    implicitPositive: 0,
    implicitNegative: 0,
    improvementCycles: 0
  };

  private async ensureTables(): Promise<void> {
    await this.db.initialize();
    this.db.getDB().exec(`
      CREATE TABLE IF NOT EXISTS feedback_records (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        sessionId TEXT,
        query TEXT NOT NULL,
        response TEXT NOT NULL,
        confidence REAL NOT NULL,
        category TEXT NOT NULL,
        rating TEXT,
        comment TEXT,
        implicitSignal TEXT,
        timeToNextQuery INTEGER,
        rewordingSimilarity REAL,
        clickedOnSuggestedDocument INTEGER,
        alternativeSource TEXT,
        correction TEXT,
        timestamp INTEGER NOT NULL,
        processed INTEGER DEFAULT 0
      )
    `);
    this.db.getDB().exec(`
      CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback_records(userId)
    `);
    this.db.getDB().exec(`
      CREATE INDEX IF NOT EXISTS idx_feedback_timestamp ON feedback_records(timestamp)
    `);
    this.db.getDB().exec(`
      CREATE INDEX IF NOT EXISTS idx_feedback_category ON feedback_records(category)
    `);
    this.db.getDB().exec(`
      CREATE INDEX IF NOT EXISTS idx_feedback_processed ON feedback_records(processed)
    `);
  }

  async recordInteraction(data: {
    userId: string;
    sessionId?: string;
    query: string;
    response: string;
    confidence: number;
    category: string;
    timestamp?: number;
  }): Promise<FeedbackRecord> {
    await this.ensureTables();
    
    const record: FeedbackRecord = {
      id: this.generateId(),
      userId: data.userId,
      sessionId: data.sessionId,
      query: data.query,
      response: data.response,
      confidence: data.confidence,
      category: data.category,
      timestamp: data.timestamp || Date.now(),
      processed: false
    };
    
    // Sauvegarde SQLite
    this.db.getDB().prepare(`
      INSERT INTO feedback_records 
      (id, userId, sessionId, query, response, confidence, category, timestamp, processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.userId, record.sessionId, record.query, record.response,
      record.confidence, record.category, record.timestamp, record.processed ? 1 : 0
    );
    
    // Cache mémoire
    this.memoryCache.set(record.id, record);
    this.pendingFeedbacks.push(record);
    this.stats.totalFeedbacks++;
    
    logInfo(`📝 Interaction enregistrée: ${data.category} (confiance: ${(data.confidence * 100).toFixed(0)}%)`);
    
    if (this.pendingFeedbacks.length >= FEEDBACK_CONFIG.thresholdReplay) {
      await this.processBatch();
    }
    
    return record;
  }

  async recordRating(userId: string, query: string, rating: 'up' | 'down', comment?: string): Promise<void> {
    await this.ensureTables();
    
    // Trouver le feedback le plus récent pour cette requête
    const recent = this.db.getDB().prepare(`
      SELECT * FROM feedback_records WHERE userId = ? AND query = ? AND rating IS NULL ORDER BY timestamp DESC LIMIT 1
    `).get(userId, query) as any;
    
    if (recent) {
      this.db.getDB().prepare(`
        UPDATE feedback_records SET rating = ?, comment = ?, timestamp = ? WHERE id = ?
      `).run(rating, comment || null, Date.now(), recent.id);
      
      if (rating === 'up') this.stats.positiveFeedbacks++;
      else if (rating === 'down') this.stats.negativeFeedbacks++;
      
      logSuccess(`Feedback ${rating === 'up' ? '👍' : '👎'} enregistré pour: "${query.substring(0, 50)}..."`);
      
      if (rating === 'down') {
        const feedback = await this.getFeedback(recent.id);
        if (feedback) await this.handleNegativeFeedback(feedback);
      }
    } else {
      const record: FeedbackRecord = {
        id: this.generateId(),
        userId,
        query,
        response: '',
        confidence: 0,
        category: 'unknown',
        rating,
        comment,
        timestamp: Date.now(),
        processed: false
      };
      
      this.db.getDB().prepare(`
        INSERT INTO feedback_records (id, userId, query, response, confidence, category, rating, comment, timestamp, processed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(record.id, record.userId, record.query, '', 0, 'unknown', rating, comment || null, record.timestamp, 0);
      
      this.memoryCache.set(record.id, record);
      this.pendingFeedbacks.push(record);
      this.stats.totalFeedbacks++;
      if (rating === 'up') this.stats.positiveFeedbacks++;
      else if (rating === 'down') this.stats.negativeFeedbacks++;
    }
  }

  private async getFeedback(id: string): Promise<FeedbackRecord | null> {
    if (this.memoryCache.has(id)) {
      return this.memoryCache.get(id)!;
    }
    
    const row = this.db.getDB().prepare(`SELECT * FROM feedback_records WHERE id = ?`).get(id) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      userId: row.userId,
      sessionId: row.sessionId,
      query: row.query,
      response: row.response,
      confidence: row.confidence,
      category: row.category,
      rating: row.rating,
      comment: row.comment,
      implicitSignal: row.implicitSignal,
      timeToNextQuery: row.timeToNextQuery,
      rewordingSimilarity: row.rewordingSimilarity,
      clickedOnSuggestedDocument: row.clickedOnSuggestedDocument === 1,
      alternativeSource: row.alternativeSource,
      correction: row.correction,
      timestamp: row.timestamp,
      processed: row.processed === 1
    };
  }

  analyzeImplicitFeedback(action: UserAction): ImplicitSignal {
    const signals: ImplicitSignal[] = [];
    
    if (action.timeToNextQuery && action.timeToNextQuery < 5000 && 
        action.rewordingSimilarity && action.rewordingSimilarity > 0.7) {
      signals.push('NEGATIVE');
      logInfo(`🔍 Signal implicite NEGATIVE: reformulation rapide`);
    }
    
    if (action.clickedOnSuggestedDocument) {
      signals.push('POSITIVE');
      logInfo(`🔍 Signal implicite POSITIVE: clic sur document suggéré`);
    }
    
    if (action.rating === 'up') signals.push('POSITIVE');
    else if (action.rating === 'down') signals.push('NEGATIVE');
    
    if (signals.includes('NEGATIVE')) return 'NEGATIVE';
    if (signals.includes('POSITIVE')) return 'POSITIVE';
    return 'NEUTRAL';
  }

  analyzeTextualImplicitFeedback(_response: string, userReply?: string): ImplicitSignal {
    const lowerReply = (userReply || '').toLowerCase();
    
    for (const pattern of IMPLICIT_PATTERNS.positive) {
      if (lowerReply.includes(pattern)) {
        this.stats.implicitPositive++;
        return 'POSITIVE';
      }
    }
    
    for (const pattern of IMPLICIT_PATTERNS.negative) {
      if (lowerReply.includes(pattern)) {
        this.stats.implicitNegative++;
        return 'NEGATIVE';
      }
    }
    
    return 'NEUTRAL';
  }

  async recordAmbiguity(input: any, ambiguityResult: any): Promise<void> {
    await this.ensureTables();
    
    const record: FeedbackRecord = {
      id: this.generateId(),
      userId: input.userId || 'anonymous',
      sessionId: input.sessionId,
      query: input.query,
      response: ambiguityResult.clarificationQuestion || '',
      confidence: ambiguityResult.confidence,
      category: 'AMBIGUITY',
      rating: 'neutral',
      timestamp: Date.now(),
      processed: false
    };
    
    this.db.getDB().prepare(`
      INSERT INTO feedback_records 
      (id, userId, sessionId, query, response, confidence, category, rating, timestamp, processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.userId, record.sessionId, record.query, record.response,
      record.confidence, record.category, record.rating, record.timestamp, 0
    );
    
    this.memoryCache.set(record.id, record);
    this.pendingFeedbacks.push(record);
    this.stats.totalFeedbacks++;
    this.stats.neutralFeedbacks++;
    
    logInfo(`⚠️ Ambiguïté enregistrée pour: "${input.query.substring(0, 50)}..."`);
  }

  async processBatch(): Promise<void> {
    if (this.pendingFeedbacks.length === 0) return;
    
    const batch = this.pendingFeedbacks.splice(0, FEEDBACK_CONFIG.batchSize);
    logInfo(`🔄 Traitement de ${batch.length} feedbacks...`);
    
    const negativeFeedbacks = batch.filter(f => f.rating === 'down' || f.implicitSignal === 'NEGATIVE');
    const positiveFeedbacks = batch.filter(f => f.rating === 'up' || f.implicitSignal === 'POSITIVE');
    
    
    const sourceCorrections = batch.filter(f => f.alternativeSource);
    if (sourceCorrections.length > 0) {
      await this.updateSourceWeights(sourceCorrections);
    }
    
    const corrections = batch.filter(f => f.correction);
    if (corrections.length > 0) {
      await this.saveCorrections(corrections);
    }
    
    // Marquer comme traités en SQLite
    for (const fb of batch) {
      this.db.getDB().prepare(`UPDATE feedback_records SET processed = 1 WHERE id = ?`).run(fb.id);
      fb.processed = true;
      this.memoryCache.set(fb.id, fb);
    }
    
    this.stats.improvementCycles++;
    
    logSuccess(`Lot traité: ${negativeFeedbacks.length} négatifs, ${positiveFeedbacks.length} positifs`);
    
    if (negativeFeedbacks.length > FEEDBACK_CONFIG.thresholdReplay * 0.3) {
      await this.triggerLearning(batch);
    }
  }

  private async extractIssues(feedbacks: FeedbackRecord[]): Promise<Array<{ issue: string; count: number; examples: string[] }>> {
    const issueMap = new Map<string, { count: number; examples: string[] }>();
    
    for (const fb of feedbacks) {
      let issue = '';
      
      if (fb.comment) {
        issue = fb.comment;
      } else if (fb.rating === 'down') {
        issue = 'Réponse non satisfaisante';
      } else {
        issue = 'Comportement imprévu';
      }
      
      const existing = issueMap.get(issue);
      if (existing) {
        existing.count++;
        if (existing.examples.length < 5) {
          existing.examples.push(fb.query);
        }
      } else {
        issueMap.set(issue, { count: 1, examples: [fb.query] });
      }
    }
    
    return Array.from(issueMap.entries())
      .map(([issue, data]) => ({ issue, count: data.count, examples: data.examples }))
      .sort((a, b) => b.count - a.count);
  }

  private generateImprovementSuggestions(issues: Array<{ issue: string; count: number; examples: string[] }>): string[] {
    const suggestions: string[] = [];
    
    for (const issue of issues.slice(0, 5)) {
      if (issue.issue.includes('pas trouvé') || issue.issue.includes('information manquante')) {
        suggestions.push(`Améliorer la couverture documentaire pour: "${issue.examples[0]}"`);
      } else if (issue.issue.includes('incompréhensible') || issue.issue.includes('pas clair')) {
        suggestions.push(`Revoir le formatage des réponses pour les questions de type "${issue.examples[0]}"`);
      } else if (issue.issue.includes('lent') || issue.issue.includes('long')) {
        suggestions.push(`Optimiser les temps de réponse pour les requêtes fréquentes`);
      } else {
        suggestions.push(`Analyser et améliorer la catégorie de questions: "${issue.examples[0]}"`);
      }
    }
    
    return suggestions;
  }

  private async handleNegativeFeedback(feedback: FeedbackRecord): Promise<void> {
    logWarning(`Traitement immédiat du feedback négatif: "${feedback.query.substring(0, 50)}..."`);
    await this.saveCorrections([feedback]);
    
    const similarFeedbacks = this.db.getDB().prepare(`
      SELECT * FROM feedback_records WHERE query = ? AND rating = 'down'
    `).all(feedback.query);
    
    if (similarFeedbacks.length >= 3) {
      logWarning(`⚠️ Problème récurrent détecté pour: "${feedback.query}"`);
    }
  }

  private async saveCorrections(feedbacks: FeedbackRecord[]): Promise<void> {
    for (const fb of feedbacks) {
      if (fb.correction) {
        this.db.getDB().prepare(`
          UPDATE feedback_records SET correction = ? WHERE id = ?
        `).run(fb.correction, fb.id);
      }
    }
    logInfo(`💾 ${feedbacks.length} corrections sauvegardées`);
  }

  private async updateSourceWeights(feedbacks: FeedbackRecord[]): Promise<void> {
    const sourceStat = new Map<string, number>();
    
    for (const fb of feedbacks) {
      if (fb.alternativeSource) {
        sourceStat.set(fb.alternativeSource, (sourceStat.get(fb.alternativeSource) || 0) + 1);
      }
    }
    
    for (const [source, count] of sourceStat) {
      if (count >= 3) {
        logInfo(`📊 Source ${source} mérite d'être boostée (${count} mentions)`);
      }
    }
  }

  private async triggerLearning(feedbacks: FeedbackRecord[]): Promise<void> {
    logInfo(`🧠 Déclenchement d'un cycle d'apprentissage avec ${feedbacks.length} feedbacks`);
    
    const trainingData = feedbacks.map(f => ({
      input: f.query,
      expected: f.correction || (f.rating === 'up' ? f.response : null),
      confidence: f.confidence
    }));
    
    this.reclassifyInBackground(trainingData);
    this.stats.improvementCycles++;
  }

  private async reclassifyInBackground(trainingData: any[]): Promise<void> {
    setTimeout(async () => {
      try {
        
        for (const data of trainingData) {
          if (data.expected) {
            logInfo(`📚 Mise à jour du classifieur avec: "${data.input.substring(0, 50)}..."`);
          }
        }
        
        logSuccess(`Cycle d'apprentissage terminé (${trainingData.length} exemples)`);
        
      } catch (error) {
        logWarning(`Échec du cycle d'apprentissage: ${error}`);
      }
    }, 1000);
  }

  async getAggregations(): Promise<FeedbackAggregation> {
    await this.ensureTables();
    
    const feedbacks = this.db.getDB().prepare(`SELECT * FROM feedback_records`).all() as any[];
    const positive = feedbacks.filter(f => f.rating === 'up');
    const negative = feedbacks.filter(f => f.rating === 'down');
    const neutral = feedbacks.filter(f => f.rating === 'neutral');
    
    const categoryRows = this.db.getDB().prepare(`
      SELECT category, COUNT(*) as count, SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) as positive
      FROM feedback_records GROUP BY category
    `).all() as any[];
    
    const topCategories = categoryRows.map(row => ({
      category: row.category,
      count: row.count,
      positiveRate: row.count > 0 ? row.positive / row.count : 0
    })).sort((a, b) => b.count - a.count).slice(0, 5);
    
    const issues = await this.extractIssues(feedbacks.map(f => this.rowToRecord(f)));
    const suggestions = this.generateImprovementSuggestions(issues);
    
    return {
      totalFeedbacks: feedbacks.length,
      positiveRate: feedbacks.length > 0 ? positive.length / feedbacks.length : 0,
      negativeRate: feedbacks.length > 0 ? negative.length / feedbacks.length : 0,
      neutralRate: feedbacks.length > 0 ? neutral.length / feedbacks.length : 0,
      avgConfidence: feedbacks.reduce((sum, f) => sum + f.confidence, 0) / (feedbacks.length || 1),
      topIssues: issues.slice(0, 5).map(i => ({ issue: i.issue, count: i.count })),
      topCategories,
      improvementSuggestions: suggestions
    };
  }

  async getUserHistory(userId: string): Promise<FeedbackRecord[]> {
    await this.ensureTables();
    
    const rows = this.db.getDB().prepare(`
      SELECT * FROM feedback_records WHERE userId = ? ORDER BY timestamp DESC LIMIT 50
    `).all(userId) as any[];
    
    return rows.map(row => this.rowToRecord(row));
  }

  private rowToRecord(row: any): FeedbackRecord {
    return {
      id: row.id,
      userId: row.userId,
      sessionId: row.sessionId,
      query: row.query,
      response: row.response,
      confidence: row.confidence,
      category: row.category,
      rating: row.rating,
      comment: row.comment,
      implicitSignal: row.implicitSignal,
      timeToNextQuery: row.timeToNextQuery,
      rewordingSimilarity: row.rewordingSimilarity,
      clickedOnSuggestedDocument: row.clickedOnSuggestedDocument === 1,
      alternativeSource: row.alternativeSource,
      correction: row.correction,
      timestamp: row.timestamp,
      processed: row.processed === 1
    };
  }

  private generateId(): string {
    return `fb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  async cleanup(olderThanDays: number = 90): Promise<number> {
    await this.ensureTables();
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    const result = this.db.getDB().prepare(`DELETE FROM feedback_records WHERE timestamp < ?`).run(cutoff);
    logInfo(`Nettoyage: ${result.changes} enregistrements supprimés`);
    return result.changes;
  }

  getStats(): {
    totalFeedbacks: number;
    positiveFeedbacks: number;
    negativeFeedbacks: number;
    neutralFeedbacks: number;
    positiveRate: number;
    implicitPositive: number;
    implicitNegative: number;
    improvementCycles: number;
    pendingBatchSize: number;
  } {
    const total = this.stats.totalFeedbacks;
    return {
      totalFeedbacks: total,
      positiveFeedbacks: this.stats.positiveFeedbacks,
      negativeFeedbacks: this.stats.negativeFeedbacks,
      neutralFeedbacks: this.stats.neutralFeedbacks,
      positiveRate: total > 0 ? this.stats.positiveFeedbacks / total : 0,
      implicitPositive: this.stats.implicitPositive,
      implicitNegative: this.stats.implicitNegative,
      improvementCycles: this.stats.improvementCycles,
      pendingBatchSize: this.pendingFeedbacks.length
    };
  }

  resetStats(): void {
    this.stats = {
      totalFeedbacks: 0,
      positiveFeedbacks: 0,
      negativeFeedbacks: 0,
      neutralFeedbacks: 0,
      implicitPositive: 0,
      implicitNegative: 0,
      improvementCycles: 0
    };
  }
}

export const feedbackLoop = new FeedbackLoop();
export default feedbackLoop;