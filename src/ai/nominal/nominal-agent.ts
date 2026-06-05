/**
 * Agent Nominal - Système agentique autonome et résilient
 * @version 1.0.0
 * @description Orchestrateur intelligent pour la recherche nominale, mapping implicite et déduplication
 */

import { nominalSearchService, NominalSearchService } from './nominal-search.service';
import { implicitMappingService, ImplicitMappingService } from './implicit-mapping.service';
import { deduplicationService, DeduplicationService } from './deduplication.service';
import type {
  NominalAgentConfig,
  NominalAgentStatus,
  NominalOperationResult,
  NominalSearchResult,
  NominalSearchOptions,
  DeduplicationResult,
  ZoneMappingResult
} from './types';

export class NominalAgent {
  private static instance: NominalAgent;
  private config: NominalAgentConfig;
  private status: NominalAgentStatus;
  private services: {
    search: NominalSearchService;
    mapping: ImplicitMappingService;
    deduplication: DeduplicationService;
  };

  private constructor() {
    this.config = {
      enabled: true,
      searchTimeout: 30000,
      retryAttempts: 3,
      autoInitialize: true,
      semanticAnalysisEnabled: true,
      deduplicationEnabled: true,
      implicitMappingEnabled: true
    };

    this.status = {
      initialized: false,
      servicesReady: {
        search: false,
        mapping: false,
        deduplication: false
      },
      lastActivity: new Date().toISOString(),
      errorCount: 0,
      performance: {
        averageSearchTime: 0,
        totalSearches: 0,
        cacheHitRate: 0
      }
    };

    this.services = {
      search: nominalSearchService,
      mapping: implicitMappingService,
      deduplication: deduplicationService
    };
  }

  static getInstance(): NominalAgent {
    if (!NominalAgent.instance) {
      NominalAgent.instance = new NominalAgent();
    }
    return NominalAgent.instance;
  }

  /**
   * Initialise l'agent et tous ses services
   */
  async initialize(): Promise<NominalOperationResult<void>> {
    const startTime = Date.now();

    try {
      if (this.status.initialized) {
        return { success: true, duration: 0, retries: 0 };
      }

      console.log('[NOMINAL-AGENT] 🚀 Initialisation de l\'agent nominal...');

      // Initialisation des services avec retry
      const services = [
        { name: 'mapping', service: this.services.mapping, key: 'mapping' as const },
        { name: 'search', service: this.services.search, key: 'search' as const },
        { name: 'deduplication', service: this.services.deduplication, key: 'deduplication' as const }
      ];

      for (const { name, service, key } of services) {
        let retries = 0;
        while (retries <= this.config.retryAttempts) {
          try {
            await service.initialize();
            this.status.servicesReady[key] = true;
            console.log(`[NOMINAL-AGENT] ✅ Service ${name} initialisé`);
            break;
          } catch (error) {
            retries++;
            console.warn(`[NOMINAL-AGENT] ⚠️ Échec initialisation ${name} (tentative ${retries}/${this.config.retryAttempts + 1})`);
            if (retries > this.config.retryAttempts) {
              throw new Error(`Impossible d'initialiser le service ${name}: ${error}`);
            }
            await this.delay(1000 * retries); // Backoff exponentiel
          }
        }
      }

      this.status.initialized = true;
      this.status.lastActivity = new Date().toISOString();

      const duration = Date.now() - startTime;
      console.log(`[NOMINAL-AGENT] ✅ Agent nominal initialisé en ${duration}ms`);

      return { success: true, duration, retries: 0 };

    } catch (error) {
      this.status.errorCount++;
      const duration = Date.now() - startTime;
      console.error('[NOMINAL-AGENT] ❌ Erreur initialisation:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        duration,
        retries: this.config.retryAttempts
      };
    }
  }

  /**
   * Effectue une recherche nominale intelligente avec résilience
   */
  async performNominalSearch(
    query: string,
    options: NominalSearchOptions = {}
  ): Promise<NominalOperationResult<NominalSearchResult>> {
    const startTime = Date.now();
    let retries = 0;

    while (retries <= this.config.retryAttempts) {
      try {
        await this.ensureInitialized();

        // Recherche nominale
        const searchOptions: NominalSearchOptions = {
          recursive: true,
          useSemanticAnalysis: this.config.semanticAnalysisEnabled,
          ...options
        };

        const result = await this.withTimeout(
          this.services.search.search(query, searchOptions),
          this.config.searchTimeout
        );

        // Enrichissement automatique du mapping implicite si résultat trouvé
        if (result.found && this.config.implicitMappingEnabled) {
          try {
            await this.services.search.enrichImplicitMapping(query, result);
          } catch (error) {
            console.warn('[NOMINAL-AGENT] ⚠️ Erreur enrichissement mapping:', error);
          }
        }

        // Mise à jour des métriques de performance
        this.updatePerformanceMetrics(Date.now() - startTime);

        return {
          success: true,
          data: result,
          duration: Date.now() - startTime,
          retries
        };

      } catch (error) {
        retries++;
        console.warn(`[NOMINAL-AGENT] ⚠️ Erreur recherche (tentative ${retries}/${this.config.retryAttempts + 1}):`, error);

        if (retries > this.config.retryAttempts) {
          this.status.errorCount++;
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Erreur de recherche',
            duration: Date.now() - startTime,
            retries
          };
        }

        await this.delay(500 * retries);
      }
    }

    // Ne devrait pas arriver
    return {
      success: false,
      error: 'Erreur inattendue',
      duration: Date.now() - startTime,
      retries: this.config.retryAttempts
    };
  }

  /**
   * Vérifie la déduplication avec résilience
   */
  async checkDeduplication(
    question: string,
    zone?: string,
    options?: { similarityThreshold?: number; minEnrichThreshold?: number }
  ): Promise<NominalOperationResult<DeduplicationResult>> {
    const startTime = Date.now();

    try {
      await this.ensureInitialized();

      if (!this.config.deduplicationEnabled) {
        return {
          success: true,
          data: { isDuplicate: false, action: 'add' },
          duration: Date.now() - startTime,
          retries: 0
        };
      }

      const result = await this.services.deduplication.checkDuplicate(question, zone, options);

      return {
        success: true,
        data: result,
        duration: Date.now() - startTime,
        retries: 0
      };

    } catch (error) {
      this.status.errorCount++;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur déduplication',
        duration: Date.now() - startTime,
        retries: 0
      };
    }
  }

  /**
   * Recherche la zone optimale pour une requête
   */
  async findOptimalZone(query: string): Promise<NominalOperationResult<ZoneMappingResult | null>> {
    const startTime = Date.now();

    try {
      await this.ensureInitialized();

      if (!this.config.implicitMappingEnabled) {
        return {
          success: true,
          data: null,
          duration: Date.now() - startTime,
          retries: 0
        };
      }

      const result = await this.services.mapping.findZoneForQuery(query);

      return {
        success: true,
        data: result,
        duration: Date.now() - startTime,
        retries: 0
      };

    } catch (error) {
      this.status.errorCount++;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur recherche zone',
        duration: Date.now() - startTime,
        retries: 0
      };
    }
  }

  /**
   * Workflow complet : recherche avec déduplication et optimisation
   */
  async performOptimizedSearch(
    query: string,
    zone?: string,
    options: NominalSearchOptions = {}
  ): Promise<NominalOperationResult<{
    searchResult: NominalSearchResult;
    deduplicationResult: DeduplicationResult;
    zoneOptimization: ZoneMappingResult | null;
    enriched: boolean;
  }>> {
    const startTime = Date.now();

    try {
      await this.ensureInitialized();

      // 1. Recherche de zone optimale
      const zoneResult = await this.findOptimalZone(query);
      const optimalZone = zoneResult.success && zoneResult.data ? zoneResult.data.zone : zone;

      // 2. Vérification déduplication
      const dedupResult = await this.checkDeduplication(query, optimalZone);

      // 3. Recherche nominale si nécessaire
      let searchResult: NominalSearchResult;
      let enriched = false;

      if (dedupResult.success && dedupResult.data?.action === 'skip') {
        // Utiliser le cache existant (simulation)
        searchResult = {
          found: false,
          score: 0,
          normalizedScore: 0,
          matchedTerms: [],
          zone: optimalZone || 'cached',
          mode: 'implicit',
          matchQuality: 'low'
        };
      } else if (dedupResult.success && dedupResult.data?.action === 'enrich' && dedupResult.data.existingHash) {
        // Enrichir l'entrée existante
        const enrichResult = await this.enrichDuplicateEntry(dedupResult.data.existingHash, query);
        enriched = enrichResult.success && enrichResult.data === true;

        // Effectuer quand même la recherche pour obtenir des résultats
        const searchOp = await this.performNominalSearch(query, { ...options, basePath: optimalZone ? undefined : options.basePath });
        if (!searchOp.success || !searchOp.data) {
          throw new Error(searchOp.error || 'Erreur recherche');
        }
        searchResult = searchOp.data;
      } else {
        const searchOp = await this.performNominalSearch(query, { ...options, basePath: optimalZone ? undefined : options.basePath });
        if (!searchOp.success || !searchOp.data) {
          throw new Error(searchOp.error || 'Erreur recherche');
        }
        searchResult = searchOp.data;
      }

      return {
        success: true,
        data: {
          searchResult,
          deduplicationResult: dedupResult.data || { isDuplicate: false, action: 'add' },
          zoneOptimization: zoneResult.data || null,
          enriched
        },
        duration: Date.now() - startTime,
        retries: 0
      };

    } catch (error) {
      this.status.errorCount++;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur workflow optimisé',
        duration: Date.now() - startTime,
        retries: 0
      };
    }
  }

  /**
   * Enrichit une entrée dupliquée avec une nouvelle variante
   */
  async enrichDuplicateEntry(hash: string, newQuestion: string): Promise<NominalOperationResult<boolean>> {
    const startTime = Date.now();

    try {
      await this.ensureInitialized();

      if (!this.config.deduplicationEnabled) {
        return {
          success: true,
          data: false,
          duration: Date.now() - startTime,
          retries: 0
        };
      }

      const result = await this.services.deduplication.enrichExisting(hash, newQuestion);

      return {
        success: true,
        data: result,
        duration: Date.now() - startTime,
        retries: 0
      };

    } catch (error) {
      this.status.errorCount++;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur enrichissement',
        duration: Date.now() - startTime,
        retries: 0
      };
    }
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(newConfig: Partial<NominalAgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[NOMINAL-AGENT] ⚙️ Configuration mise à jour');
  }

  /**
   * Réinitialise l'agent (pour récupération d'erreur)
   */
  async reset(): Promise<NominalOperationResult<void>> {
    console.log('[NOMINAL-AGENT] 🔄 Réinitialisation...');

    this.status = {
      initialized: false,
      servicesReady: {
        search: false,
        mapping: false,
        deduplication: false
      },
      lastActivity: new Date().toISOString(),
      errorCount: 0,
      performance: {
        averageSearchTime: 0,
        totalSearches: 0,
        cacheHitRate: 0
      }
    };

    return await this.initialize();
  }

  // ============================================================================
  // MÉTHODES PRIVÉES
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.status.initialized) {
      if (this.config.autoInitialize) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          throw new Error(`Initialisation automatique échouée: ${initResult.error}`);
        }
      } else {
        throw new Error('Agent non initialisé');
      }
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout après ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeout));
    });
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private updatePerformanceMetrics(searchTime: number): void {
    this.status.performance.totalSearches++;
    const totalTime = this.status.performance.averageSearchTime * (this.status.performance.totalSearches - 1) + searchTime;
    this.status.performance.averageSearchTime = totalTime / this.status.performance.totalSearches;
    this.status.lastActivity = new Date().toISOString();
  }
}

export const nominalAgent = NominalAgent.getInstance();