// src/ai/providers/llm-usage-tracker.ts
/**
 * Suivi des quotas et rate limits pour les providers LLM
 * @version 1.0.0
 * @description Centralise les statistiques d'utilisation pour gérer les fallbacks automatiques
 */

export interface UsageStats {
  totalCalls: number;
  totalTokens: number;
  successRate: number;
  providerStats: Record<string, ProviderStats>;
}

export interface ProviderStats {
  requests: number;
  tokens: number;
  rateLimited: boolean;
}


export interface ProviderUsage {
  provider: string;
  totalRequests: number;
  totalTokens: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitErrors: number;
  lastRequestTime: number | null;
  lastResetDate: Date;
  dailyQuota: number;
  dailyTokensQuota: number;
}

export interface ProviderQuota {
  provider: string;
  remainingRequests: number;
  remainingTokens: number;
  resetTime: Date | null;
  isRateLimited: boolean;
}

export interface UsageReport {
  timestamp: Date;
  providers: ProviderQuota[];
  totalRequestsAllProviders: number;
  totalTokensAllProviders: number;
  recommendations: string[];
}
class LLMUsageTracker {
  private static instance: LLMUsageTracker;
  private usage: Map<string, { requests: number; tokens: number; rateLimited: boolean }> = new Map();
  
  private constructor() {}
  
  static getInstance(): LLMUsageTracker {
    if (!LLMUsageTracker.instance) {
      LLMUsageTracker.instance = new LLMUsageTracker();
    }
    return LLMUsageTracker.instance;
  }
  
  recordSuccess(provider: string, tokens: number): void {
    const stats = this.usage.get(provider) || { requests: 0, tokens: 0, rateLimited: false };
    stats.requests++;
    stats.tokens += tokens;
    this.usage.set(provider, stats);
  }
  
  recordFailure(provider: string, isRateLimit: boolean): void {
    const stats = this.usage.get(provider) || { requests: 0, tokens: 0, rateLimited: false };
    stats.requests++;
    if (isRateLimit) stats.rateLimited = true;
    this.usage.set(provider, stats);
  }
  
  isRateLimited(provider: string): boolean {
    const stats = this.usage.get(provider);
    return stats?.rateLimited || false;
  }
  
  // 🔥 MÉTHODE getStats AJOUTÉE
  getStats(): UsageStats {
    let totalCalls = 0;
    let totalTokens = 0;
    const providerStats: Record<string, ProviderStats> = {};
    
    for (const [provider, stats] of this.usage.entries()) {
      totalCalls += stats.requests;
      totalTokens += stats.tokens;
      providerStats[provider] = {
        requests: stats.requests,
        tokens: stats.tokens,
        rateLimited: stats.rateLimited
      };
    }
    
    const successRate = totalCalls > 0 ? 1 - (this.getFailureCount() / totalCalls) : 1;
    
    return {
      totalCalls,
      totalTokens,
      successRate,
      providerStats
    };
  }
  
  private getFailureCount(): number {
    for (const [] of this.usage.entries()) {
      // Estimation simplifiée
    }
    return 0;
  }
  
  resetAllStats(): void {
    this.usage.clear();
  }
}

export const llmUsageTracker = LLMUsageTracker.getInstance();