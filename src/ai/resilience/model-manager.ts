// src/ai/resilience/model-manager.ts
/**
 * Gestionnaire de modèles locaux et Surveillance RAM
 * @version 1.0.0
 * @lastUpdated 2026-04-13
 */

import * as os from 'os';

export enum MemoryLevel {
  NORMAL = 'NORMAL',       // > 4 Go libre
  PRECAUTION = 'PRECAUTION', // 2-4 Go libre
  CRITICAL = 'CRITICAL',     // 1.5-2 Go libre
  SURVIVAL = 'SURVIVAL'      // < 1.5 Go libre
}

export interface ModelConstraints {
  chromaTTL: number;
  useEmbeddings: boolean;
  contextSize: number;
  textOnly: boolean;
}

class ModelManager {
  private readonly FALLBACK_MODEL = 'phi3.5:latest';
  private readonly SURVIVAL_MODEL = 'tinyllama:latest';
  private lastAccessTime: number = 0;
  private isLoaded: boolean = false;

  public getMemoryLevel(): MemoryLevel {
    const freeMemBytes = os.freemem();
    const freeMemGB = freeMemBytes / (1024 * 1024 * 1024);

    if (freeMemGB > 4) return MemoryLevel.NORMAL;
    if (freeMemGB > 2) return MemoryLevel.PRECAUTION;
    if (freeMemGB > 1.5) return MemoryLevel.CRITICAL;
    return MemoryLevel.SURVIVAL;
  }

  /**
   * Retourne les contraintes techniques en fonction de la RAM réelle
   */
  public getConstraints(): ModelConstraints {
    const level = this.getMemoryLevel();
    
    switch (level) {
      case MemoryLevel.NORMAL:
        return { chromaTTL: 30, useEmbeddings: true, contextSize: 8000, textOnly: false };
      case MemoryLevel.PRECAUTION:
        return { chromaTTL: 15, useEmbeddings: true, contextSize: 8000, textOnly: false };
      case MemoryLevel.CRITICAL:
        return { chromaTTL: 15, useEmbeddings: false, contextSize: 4000, textOnly: false };
      case MemoryLevel.SURVIVAL:
        return { chromaTTL: 10, useEmbeddings: false, contextSize: 2000, textOnly: true };
      default:
        return { chromaTTL: 30, useEmbeddings: true, contextSize: 8000, textOnly: false };
    }
  }

  /**
   * Sélectionne le modèle local approprié selon la RAM
   */
  public getTargetLocalModel(): string {
    const level = this.getMemoryLevel();
    return level === MemoryLevel.SURVIVAL ? this.SURVIVAL_MODEL : this.FALLBACK_MODEL;
  }

  /**
   * Simule ou force le déchargement (via Ollama keep_alive=0)
   * Note: Ollama gère nativement le déchargement si keep_alive est passé dans la requête
   */
  public markActivity() {
    this.lastAccessTime = Date.now();
    this.isLoaded = true;
  }

  public checkIfNeedsUnload(): boolean {
    if (!this.isLoaded) return false;
    const idleTime = Date.now() - this.lastAccessTime;
    return idleTime > 5 * 60 * 1000; // 5 minutes
  }

  public getModelName(): string {
    return this.FALLBACK_MODEL;
  }

  /**
   * Log l'état actuel pour le debug
   */
  public logState() {
    const mem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    const level = this.getMemoryLevel();
    console.log(`[MODEL-MANAGER] RAM Libre: ${mem} GB | Niveau: ${level} | Modèle Cible: ${this.getTargetLocalModel()}`);
  }
}

// Singleton
export const modelManager = new ModelManager();
