/**
 * Agent Vision - Système agentique autonome et résilient
 * @version 1.0.0
 * @description Orchestrateur intelligent pour tous les composants de vision
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ImageMetadata,
  PartLocationResult,
  ImageRegistrationMetadata
} from './types/type';

// ============================================================================
// TYPES POUR LES OPTIONS D'OPÉRATIONS
// ============================================================================

export interface ImageSearchOptions {
  mode?: 'vision' | 'text' | 'hybrid' | 'part';
  folderId?: string;
  limit?: number;
  useCache?: boolean;
}

export interface PartLocationOptions {
  globalImageId?: string;
  threshold?: number;
  maxResults?: number;
}

export interface VisionAgentConfig {
  enabled: boolean;
  autoInitialize: boolean;
  retryAttempts: number;
  timeoutMs: number;
  cacheEnabled: boolean;
  semanticAnalysisEnabled: boolean;
  partMatchingEnabled: boolean;
}

export interface VisionAgentStatus {
  initialized: boolean;
  componentsReady: {
    search: boolean;
    camera: boolean;
    fileSystem: boolean;
    partMatching: boolean;
  };
  lastActivity: string;
  errorCount: number;
  performance: {
    averageResponseTime: number;
    totalOperations: number;
    cacheHitRate: number;
  };
}

export interface VisionOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  retries: number;
  cached?: boolean;
}

// ============================================================================
// CLASSE AGENT VISION
// ============================================================================

export class VisionAgent {
  private static instance: VisionAgent;
  private config: VisionAgentConfig;
  private status: VisionAgentStatus;
  private cache: Map<string, any>;

  private constructor() {
    this.config = {
      enabled: true,
      autoInitialize: true,
      retryAttempts: 3,
      timeoutMs: 30000,
      cacheEnabled: true,
      semanticAnalysisEnabled: true,
      partMatchingEnabled: true
    };

    this.status = {
      initialized: false,
      componentsReady: {
        search: false,
        camera: false,
        fileSystem: false,
        partMatching: false
      },
      lastActivity: new Date().toISOString(),
      errorCount: 0,
      performance: {
        averageResponseTime: 0,
        totalOperations: 0,
        cacheHitRate: 0
      }
    };

    this.cache = new Map();
  }

  static getInstance(): VisionAgent {
    if (!VisionAgent.instance) {
      VisionAgent.instance = new VisionAgent();
    }
    return VisionAgent.instance;
  }

  /**
   * Initialise l'agent et tous ses composants
   */
  async initialize(): Promise<VisionOperationResult<void>> {
    const startTime = Date.now();

    try {
      if (this.status.initialized) {
        return { success: true, duration: 0, retries: 0 };
      }

      console.log('[VISION-AGENT] 🚀 Initialisation de l\'agent vision...');

      // Initialisation des composants avec retry
      const components = [
        { name: 'fileSystem', init: () => this.initializeFileSystem() },
        { name: 'camera', init: () => this.initializeCamera() },
        { name: 'search', init: () => this.initializeSearch() },
        { name: 'partMatching', init: () => this.initializePartMatching() }
      ];

      for (const { name, init } of components) {
        let retries = 0;
        while (retries <= this.config.retryAttempts) {
          try {
            await init();
            (this.status.componentsReady as any)[name] = true;
            console.log(`[VISION-AGENT] ✅ Composant ${name} initialisé`);
            break;
          } catch (error) {
            retries++;
            console.warn(`[VISION-AGENT] ⚠️ Échec initialisation ${name} (tentative ${retries}/${this.config.retryAttempts + 1})`);
            if (retries > this.config.retryAttempts) {
              throw new Error(`Impossible d'initialiser le composant ${name}: ${error}`);
            }
            await this.delay(1000 * retries);
          }
        }
      }

      this.status.initialized = true;
      this.status.lastActivity = new Date().toISOString();

      const duration = Date.now() - startTime;
      console.log(`[VISION-AGENT] ✅ Agent vision initialisé en ${duration}ms`);

      return { success: true, duration, retries: 0 };

    } catch (error) {
      this.status.errorCount++;
      const duration = Date.now() - startTime;
      console.error('[VISION-AGENT] ❌ Erreur initialisation:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        duration,
        retries: this.config.retryAttempts
      };
    }
  }

  /**
   * Effectue une recherche d'images avec résilience
   */
  async performImageSearch(
    query: string,
    options: ImageSearchOptions = {}
  ): Promise<VisionOperationResult<any>> {
    const startTime = Date.now();
    let retries = 0;

    const cacheKey = `search:${query}:${JSON.stringify(options)}`;
    if (this.config.cacheEnabled && options.useCache !== false && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      this.updatePerformanceMetrics(Date.now() - startTime, true);
      return {
        success: true,
        data: cached,
        duration: Date.now() - startTime,
        retries: 0,
        cached: true
      };
    }

    while (retries <= this.config.retryAttempts) {
      try {
        await this.ensureInitialized();

        const result = await this.withTimeout(
          this.executeImageSearch(query, options),
          this.config.timeoutMs
        );

        if (this.config.cacheEnabled) {
          this.cache.set(cacheKey, result);
        }

        this.updatePerformanceMetrics(Date.now() - startTime, false);

        return {
          success: true,
          data: result,
          duration: Date.now() - startTime,
          retries
        };

      } catch (error) {
        retries++;
        console.warn(`[VISION-AGENT] ⚠️ Erreur recherche (tentative ${retries}/${this.config.retryAttempts + 1}):`, error);

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

    return {
      success: false,
      error: 'Erreur inattendue',
      duration: Date.now() - startTime,
      retries: this.config.retryAttempts
    };
  }

  /**
   * Recherche de localisation de pièces avec résilience
   */
  async performPartLocation(
    imageBuffer: Buffer,
    options: PartLocationOptions = {}
  ): Promise<VisionOperationResult<PartLocationResult>> {
    const startTime = Date.now();
    let retries = 0;

    while (retries <= this.config.retryAttempts) {
      try {
        await this.ensureInitialized();

        if (!this.config.partMatchingEnabled) {
          throw new Error('Part matching désactivé');
        }

        const result = await this.withTimeout(
          this.executePartLocation(imageBuffer, options),
          this.config.timeoutMs
        );

        this.updatePerformanceMetrics(Date.now() - startTime, false);

        return {
          success: true,
          data: result,
          duration: Date.now() - startTime,
          retries
        };

      } catch (error) {
        retries++;
        console.warn(`[VISION-AGENT] ⚠️ Erreur localisation pièce (tentative ${retries}/${this.config.retryAttempts + 1}):`, error);

        if (retries > this.config.retryAttempts) {
          this.status.errorCount++;
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Erreur de localisation',
            duration: Date.now() - startTime,
            retries
          };
        }

        await this.delay(500 * retries);
      }
    }

    return {
      success: false,
      error: 'Erreur inattendue',
      duration: Date.now() - startTime,
      retries: this.config.retryAttempts
    };
  }

  /**
   * Enregistre une image avec résilience
   */
  async registerImage(
    imageBuffer: Buffer,
    metadata: ImageRegistrationMetadata
  ): Promise<VisionOperationResult<ImageMetadata>> {
    const startTime = Date.now();
    let retries = 0;

    while (retries <= this.config.retryAttempts) {
      try {
        await this.ensureInitialized();

        const result = await this.withTimeout(
          this.executeImageRegistration(imageBuffer, metadata),
          this.config.timeoutMs
        );

        // Invalider le cache après enregistrement
        this.invalidateCache();

        this.updatePerformanceMetrics(Date.now() - startTime, false);

        return {
          success: true,
          data: result,
          duration: Date.now() - startTime,
          retries
        };

      } catch (error) {
        retries++;
        console.warn(`[VISION-AGENT] ⚠️ Erreur enregistrement (tentative ${retries}/${this.config.retryAttempts + 1}):`, error);

        if (retries > this.config.retryAttempts) {
          this.status.errorCount++;
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Erreur d\'enregistrement',
            duration: Date.now() - startTime,
            retries
          };
        }

        await this.delay(500 * retries);
      }
    }

    return {
      success: false,
      error: 'Erreur inattendue',
      duration: Date.now() - startTime,
      retries: this.config.retryAttempts
    };
  }

  /**
   * Obtient le statut de l'agent
   */
  getStatus(): VisionAgentStatus {
    return { ...this.status };
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(newConfig: Partial<VisionAgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[VISION-AGENT] ⚙️ Configuration mise à jour');
  }

  /**
   * Réinitialise l'agent (pour récupération d'erreur)
   */
  async reset(): Promise<VisionOperationResult<void>> {
    console.log('[VISION-AGENT] 🔄 Réinitialisation...');

    this.status = {
      initialized: false,
      componentsReady: {
        search: false,
        camera: false,
        fileSystem: false,
        partMatching: false
      },
      lastActivity: new Date().toISOString(),
      errorCount: 0,
      performance: {
        averageResponseTime: 0,
        totalOperations: 0,
        cacheHitRate: 0
      }
    };

    this.cache.clear();

    return await this.initialize();
  }

  // ============================================================================
  // MÉTHODES PRIVÉES D'INITIALISATION
  // ============================================================================

  private async initializeFileSystem(): Promise<void> {
    // Simulation d'initialisation du système de fichiers
    await this.delay(100);
  }

  private async initializeCamera(): Promise<void> {
    // Simulation d'initialisation de la caméra
    await this.delay(100);
  }

  private async initializeSearch(): Promise<void> {
    // Simulation d'initialisation de la recherche
    await this.delay(100);
  }

  private async initializePartMatching(): Promise<void> {
    // Simulation d'initialisation du part matching
    await this.delay(100);
  }

  // ============================================================================
  // MÉTHODES PRIVÉES D'EXÉCUTION
  // ============================================================================

  private async executeImageSearch(_query: string, _options: ImageSearchOptions): Promise<any> {
    // Simulation d'une recherche d'images
    await this.delay(200);

    // Ici on appellerait l'API réelle
    return {
      found: true,
      matches: [],
      searchMetadata: {
        mode: _options.mode || 'vision',
        durationMs: 200,
        totalResults: 0
      }
    };
  }

  private async executePartLocation(_imageBuffer: Buffer, _options: PartLocationOptions): Promise<PartLocationResult> {
    // Simulation d'une localisation de pièce
    await this.delay(300);

    // Ici on appellerait l'API réelle
    return {
      found: false,
      similarity: 0,
      message: 'Service non implémenté'
    };
  }

  private async executeImageRegistration(_imageBuffer: Buffer, _metadata: ImageRegistrationMetadata): Promise<ImageMetadata> {
    // Simulation d'un enregistrement d'image
    await this.delay(400);

    // Ici on appellerait l'API réelle
    return {
      id: `img_${Date.now()}`,
      filename: _metadata.filename,
      path: `/images/${_metadata.filename}`,
      tags: _metadata.tags,
      description: _metadata.description,
      createdAt: new Date().toISOString()
    };
  }

  // ============================================================================
  // MÉTHODES UTILITAIRES
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

  private updatePerformanceMetrics(operationTime: number, wasCached: boolean): void {
    this.status.performance.totalOperations++;
    const totalTime = this.status.performance.averageResponseTime * (this.status.performance.totalOperations - 1) + operationTime;
    this.status.performance.averageResponseTime = totalTime / this.status.performance.totalOperations;

    if (wasCached) {
      this.status.performance.cacheHitRate = (this.status.performance.cacheHitRate * (this.status.performance.totalOperations - 1) + 1) / this.status.performance.totalOperations;
    }

    this.status.lastActivity = new Date().toISOString();
  }

  private invalidateCache(): void {
    this.cache.clear();
  }
}

export const visionAgent = VisionAgent.getInstance();

// ============================================================================
// HOOK REACT POUR UTILISER L'AGENT
// ============================================================================

export function useVisionAgent() {
  const [status, setStatus] = useState<VisionAgentStatus>(visionAgent.getStatus());
  const statusRef = useRef(status);

  const updateStatus = useCallback(() => {
    const newStatus = visionAgent.getStatus();
    setStatus(newStatus);
    statusRef.current = newStatus;
  }, []);

  useEffect(() => {
    // Mise à jour périodique du statut
    const interval = setInterval(updateStatus, 5000);
    return () => clearInterval(interval);
  }, [updateStatus]);

  const performSearch = useCallback(async (
    query: string,
    options?: ImageSearchOptions
  ) => {
    const result = await visionAgent.performImageSearch(query, options);
    updateStatus();
    return result;
  }, [updateStatus]);

  const performPartLocation = useCallback(async (
    imageBuffer: Buffer,
    options?: PartLocationOptions
  ) => {
    const result = await visionAgent.performPartLocation(imageBuffer, options);
    updateStatus();
    return result;
  }, [updateStatus]);

  const registerImage = useCallback(async (
    imageBuffer: Buffer,
    metadata: ImageRegistrationMetadata
  ) => {
    const result = await visionAgent.registerImage(imageBuffer, metadata);
    updateStatus();
    return result;
  }, [updateStatus]);

  const resetAgent = useCallback(async () => {
    const result = await visionAgent.reset();
    updateStatus();
    return result;
  }, [updateStatus]);

  return {
    status,
    performSearch,
    performPartLocation,
    registerImage,
    resetAgent,
    updateConfig: visionAgent.updateConfig.bind(visionAgent)
  };
}