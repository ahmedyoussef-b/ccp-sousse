/**
 * @fileOverview ConversationContextManager - Suivi de contexte conversationnel
 * @version 1.0.0
 * @description Gère l'historique des échanges par session pour permettre
 *              le suivi de contexte (follow-up après clarification, discussions, etc.)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: {
    wasAmbiguous?: boolean;
    clarificationOptions?: string[];
    originalQuery?: string;
    strategy?: string;
    confidence?: number;
  };
}

export interface ConversationSession {
  sessionId: string;
  turns: ConversationTurn[];
  lastActivity: number;
  /** La dernière question complète posée par l'utilisateur (avant clarification) */
  lastFullQuery?: string;
  /** Si l'IA a posé une question de clarification en attente */
  pendingClarification?: {
    originalQuery: string;
    options: string[];
    question: string;
  };
}

export interface ContextEnrichmentResult {
  enrichedQuery: string;
  wasEnriched: boolean;
  originalMessage: string;
  contextSource: 'clarification_followup' | 'short_followup' | 'none';
  previousContext?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const MAX_TURNS_PER_SESSION = 20;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS = 200;
const SHORT_MESSAGE_THRESHOLD = 50; // caractères
const MIN_WORDS_FOR_STANDALONE = 4;  // min 4 mots pour considérer une question complète

// ============================================================================
// LOGS
// ============================================================================

const LOG_PREFIX = '[CONV-CTX]';

function logInfo(msg: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 ${msg}`);
  if (data) console.log(`${LOG_PREFIX} 📊`, JSON.stringify(data).substring(0, 200));
}

function logSuccess(msg: string): void {
  console.log(`${LOG_PREFIX} ✅ ${msg}`);
}

// ============================================================================
// SERVICE
// ============================================================================

export class ConversationContextManager {
  private sessions = new Map<string, ConversationSession>();

  constructor() {
    // Nettoyage périodique des sessions expirées
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Récupère ou crée une session
   */
  private getSession(sessionId: string): ConversationSession {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        turns: [],
        lastActivity: Date.now()
      };
      this.sessions.set(sessionId, session);
    }
    session.lastActivity = Date.now();
    return session;
  }

  /**
   * Enregistre un message utilisateur
   */
  recordUserMessage(sessionId: string, message: string): void {
    const session = this.getSession(sessionId);
    session.turns.push({
      role: 'user',
      content: message,
      timestamp: Date.now()
    });

    // Limiter la taille
    if (session.turns.length > MAX_TURNS_PER_SESSION) {
      session.turns = session.turns.slice(-MAX_TURNS_PER_SESSION);
    }
  }

  /**
   * Enregistre une réponse IA
   */
  recordAssistantMessage(
    sessionId: string,
    answer: string,
    metadata?: ConversationTurn['metadata']
  ): void {
    const session = this.getSession(sessionId);
    session.turns.push({
      role: 'assistant',
      content: answer,
      timestamp: Date.now(),
      metadata
    });

    // Si l'IA a demandé une clarification, on la stocke
    if (metadata?.wasAmbiguous && metadata?.clarificationOptions) {
      session.pendingClarification = {
        originalQuery: metadata.originalQuery || session.lastFullQuery || '',
        options: metadata.clarificationOptions,
        question: answer
      };
      logInfo(`Clarification en attente pour session ${sessionId}`, {
        originalQuery: session.pendingClarification.originalQuery,
        options: metadata.clarificationOptions
      });
    } else {
      // Pas de clarification → on efface toute clarification en attente
      session.pendingClarification = undefined;
    }

    // Limiter la taille
    if (session.turns.length > MAX_TURNS_PER_SESSION) {
      session.turns = session.turns.slice(-MAX_TURNS_PER_SESSION);
    }
  }

  /**
   * 🔥 FONCTION PRINCIPALE : Enrichit un message court avec le contexte conversationnel
   * 
   * Cas couverts :
   * 1. Réponse à une clarification ("pompe", "procédure", "démarrage")
   * 2. Question courte de suivi ("et pour le ballon HP ?", "plus de détails")
   * 3. Question complète → pas d'enrichissement
   */
  enrichWithContext(sessionId: string, message: string): ContextEnrichmentResult {
    const session = this.getSession(sessionId);
    const trimmed = message.trim();
    const wordCount = trimmed.split(/\s+/).length;

    // ─── CAS 1: Réponse à une clarification en attente ───
    if (session.pendingClarification) {
      const pending = session.pendingClarification;
      const lowerMessage = trimmed.toLowerCase().replace(/[?!.]+$/, '').trim();

      // Vérifie si le message est une des options proposées
      const matchedOption = pending.options.find(opt =>
        opt.toLowerCase() === lowerMessage ||
        lowerMessage.includes(opt.toLowerCase()) ||
        opt.toLowerCase().includes(lowerMessage)
      );

      if (matchedOption || wordCount <= 3) {
        // C'est un follow-up de clarification
        const enrichedQuery = this.buildClarificationFollowup(
          pending.originalQuery,
          trimmed,
          matchedOption
        );

        logSuccess(`Follow-up de clarification détecté: "${trimmed}" → "${enrichedQuery}"`);

        // Effacer la clarification en attente
        session.pendingClarification = undefined;
        session.lastFullQuery = enrichedQuery;

        return {
          enrichedQuery,
          wasEnriched: true,
          originalMessage: message,
          contextSource: 'clarification_followup',
          previousContext: pending.originalQuery
        };
      }
    }

    // ─── CAS 2: Question courte de suivi (sans clarification en attente) ───
    if (wordCount < MIN_WORDS_FOR_STANDALONE && trimmed.length < SHORT_MESSAGE_THRESHOLD) {
      const lastContext = this.getLastContext(session);
      if (lastContext) {
        const enrichedQuery = this.buildShortFollowup(lastContext, trimmed);
        
        logSuccess(`Follow-up court détecté: "${trimmed}" → "${enrichedQuery}"`);
        session.lastFullQuery = enrichedQuery;

        return {
          enrichedQuery,
          wasEnriched: true,
          originalMessage: message,
          contextSource: 'short_followup',
          previousContext: lastContext
        };
      }
    }

    // ─── CAS 3: Question complète autonome ───
    session.lastFullQuery = trimmed;
    session.pendingClarification = undefined; // Reset clarification

    return {
      enrichedQuery: message,
      wasEnriched: false,
      originalMessage: message,
      contextSource: 'none'
    };
  }

  /**
   * Construit la requête enrichie pour un follow-up de clarification
   */
  private buildClarificationFollowup(
    originalQuery: string,
    userChoice: string,
    matchedOption?: string
  ): string {
    const choice = matchedOption || userChoice;

    // Si l'utilisateur a choisi un des concepts de la question originale
    // on reconstruit une question ciblée
    const originalLower = originalQuery.toLowerCase();
    const choiceLower = choice.toLowerCase();

    // Vérifier si le choix est déjà dans la question originale
    if (originalLower.includes(choiceLower)) {
      // Le choix est un sous-concept de la question → on le reformule avec focus
      return `${originalQuery} (focus sur : ${choice})`;
    }

    // Sinon on concatène naturellement
    return `${originalQuery} - ${choice}`;
  }

  /**
   * Construit la requête enrichie pour un follow-up court
   */
  private buildShortFollowup(previousContext: string, shortMessage: string): string {
    const lower = shortMessage.toLowerCase().replace(/[?!.]+$/, '').trim();

    // Détection des patterns de suivi
    const detailPatterns = [
      /^(plus de )?(d[eé]tails?|infos?|informations?)$/i,
      /^(explique|d[eé]veloppe|pr[eé]cise)$/i,
      /^(continue|suite|encore)$/i
    ];

    const isDetailRequest = detailPatterns.some(p => p.test(lower));
    if (isDetailRequest) {
      return `${previousContext} (donne plus de détails)`;
    }

    // Patterns "et pour X ?"
    const etPourMatch = lower.match(/^et\s+(pour|le|la|les|du|de)\s+(.+)$/i);
    if (etPourMatch) {
      return `${previousContext} - ${etPourMatch[2]}`;
    }

    // Pattern simple "X ?" comme un sous-thème
    if (lower.split(/\s+/).length <= 3) {
      return `${previousContext} (focus sur : ${shortMessage.replace(/[?!.]+$/, '').trim()})`;
    }

    // Fallback : concaténation
    return `En rapport avec "${previousContext}" : ${shortMessage}`;
  }

  /**
   * Récupère le dernier contexte de la conversation
   */
  private getLastContext(session: ConversationSession): string | null {
    // Priorité : lastFullQuery
    if (session.lastFullQuery) {
      return session.lastFullQuery;
    }

    // Sinon, chercher la dernière question utilisateur substantielle
    for (let i = session.turns.length - 1; i >= 0; i--) {
      const turn = session.turns[i];
      if (turn.role === 'user' && turn.content.split(/\s+/).length >= MIN_WORDS_FOR_STANDALONE) {
        return turn.content;
      }
    }

    return null;
  }

  /**
   * Récupère l'historique pour le prompt LLM
   */
  getHistory(sessionId: string, maxTurns: number = 6): ConversationTurn[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.turns.slice(-maxTurns);
  }

  /**
   * Récupère un résumé du contexte pour le prompt
   */
  getContextSummary(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.turns.length < 2) return null;

    const recentTurns = session.turns.slice(-4);
    const lines = recentTurns.map(t =>
      `${t.role === 'user' ? 'Utilisateur' : 'IA'}: ${t.content.substring(0, 150)}`
    );

    return `=== CONTEXTE CONVERSATIONNEL ===\n${lines.join('\n')}`;
  }

  /**
   * Nettoyage des sessions expirées
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    // Si trop de sessions, supprimer les plus anciennes
    if (this.sessions.size > MAX_SESSIONS) {
      const sorted = [...this.sessions.entries()]
        .sort((a, b) => a[1].lastActivity - b[1].lastActivity);
      const toRemove = sorted.slice(0, sorted.length - MAX_SESSIONS);
      for (const [id] of toRemove) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logInfo(`Nettoyage: ${cleaned} sessions supprimées, ${this.sessions.size} actives`);
    }
  }

  /**
   * Statistiques
   */
  getStats(): { activeSessions: number; totalTurns: number } {
    let totalTurns = 0;
    for (const session of this.sessions.values()) {
      totalTurns += session.turns.length;
    }
    return { activeSessions: this.sessions.size, totalTurns };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const conversationContext = new ConversationContextManager();
export default conversationContext;
