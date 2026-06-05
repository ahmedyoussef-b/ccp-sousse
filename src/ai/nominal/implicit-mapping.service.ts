/**
 * Table implicite dynamique - Auto-apprentissage par feedback 5☆
 * @version 2.0.0
 * @description Mappe des termes (ex: "profile") vers des zones (ex: "RH")
 *              Incrémentée automatiquement lors des feedbacks 5 étoiles
 * @changes Migration Core SQLite - Optionnel, garde fichier JSON pour simplicité
 */

import fs from 'fs';
import path from 'path';
import type { ImplicitMappingEntry, ImplicitMappingStore, ZoneMappingResult } from './types';

const DEFAULT_STORE: ImplicitMappingStore = {
  version: '1.0',
  mappings: [],
  lastUpdated: new Date().toISOString()
};

const STORE_PATH = path.join(process.cwd(), 'data', 'training', 'implicit_mapping.json');

export class ImplicitMappingService {
  private static instance: ImplicitMappingService;
  private store: ImplicitMappingStore = { ...DEFAULT_STORE }; // ✅ Initialisation directe
  private initialized = false;

  private constructor() {}

  static getInstance(): ImplicitMappingService {
    if (!ImplicitMappingService.instance) {
      ImplicitMappingService.instance = new ImplicitMappingService();
    }
    return ImplicitMappingService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.ensureDirectory();
      if (fs.existsSync(STORE_PATH)) {
        const data = fs.readFileSync(STORE_PATH, 'utf-8');
        this.store = JSON.parse(data);
        console.log(`[IMPLICIT-MAPPING] ✅ Chargé: ${this.store.mappings.length} mappings`);
      } else {
        await this.persist();
        console.log(`[IMPLICIT-MAPPING] ✅ Initialisé (fichier créé)`);
      }
      this.initialized = true;
    } catch (error) {
      console.error('[IMPLICIT-MAPPING] Erreur initialisation:', error);
      this.store = { ...DEFAULT_STORE };
      this.initialized = true;
    }
  }

  private ensureDirectory(): void {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private async persist(): Promise<void> {
    this.store.lastUpdated = new Date().toISOString();
    fs.writeFileSync(STORE_PATH, JSON.stringify(this.store, null, 2));
  }

  /**
   * Ajoute ou met à jour un mapping à partir d'un feedback 5☆
   */
  async addOrUpdateMapping(
    term: string,
    zone: string,
    question?: string
  ): Promise<ImplicitMappingEntry> {
    await this.initialize();
    
    const normalizedTerm = term.toLowerCase().trim();
    const existing = this.store.mappings.find(
      m => m.term === normalizedTerm && m.target === zone
    );
    
    if (existing) {
      // Incrémenter le poids et les occurrences
      existing.weight = Math.min(10, existing.weight + 0.5);
      existing.occurrences++;
      existing.lastUpdated = new Date().toISOString();
      console.log(`[IMPLICIT-MAPPING] 📈 Incrémenté: "${term}" → ${zone} (poids: ${existing.weight})`);
      await this.persist();
      return existing;
    } else {
      // Nouveau mapping
      const newEntry: ImplicitMappingEntry = {
        term: normalizedTerm,
        target: zone,
        weight: 5.0, // Poids initial (sur 10)
        occurrences: 1,
        lastUpdated: new Date().toISOString(),
        createdFrom: question
      };
      this.store.mappings.push(newEntry);
      console.log(`[IMPLICIT-MAPPING] ✨ Nouveau mapping: "${term}" → ${zone} (poids initial: 5.0)`);
      await this.persist();
      return newEntry;
    }
  }

  /**
   * Recherche la meilleure zone pour un terme donné
   */
  async findZoneForTerm(term: string, minWeight: number = 3.0): Promise<string | null> {
    await this.initialize();
    
    const normalizedTerm = term.toLowerCase().trim();
    
    // Match exact
    const exactMatch = this.store.mappings.find(m => m.term === normalizedTerm);
    if (exactMatch && exactMatch.weight >= minWeight) {
      return exactMatch.target;
    }
    
    // Match partiel (le terme est contenu dans un mapping existant)
    const partialMatch = this.store.mappings.find(m => 
      normalizedTerm.includes(m.term) || m.term.includes(normalizedTerm)
    );
    if (partialMatch && partialMatch.weight >= minWeight) {
      return partialMatch.target;
    }
    
    return null;
  }

  async findZoneForQuery(query: string, minWeight: number = 3.0): Promise<ZoneMappingResult | null> {
    await this.initialize();
    
    // Extraire les mots-clés de la requête
    const terms = this.extractKeyTerms(query);
    
    let bestZone: string | null = null;
    let bestScore = 0;
    
    for (const term of terms) {
      const zone = await this.findZoneForTerm(term, minWeight);
      if (zone) {
        const mapping = this.store.mappings.find(m => m.term === term && m.target === zone);
        const score = mapping ? mapping.weight : minWeight;
        if (score > bestScore) {
          bestScore = score;
          bestZone = zone;
        }
      }
    }
    
    if (bestZone) {
      const confidence = Math.min(1.0, bestScore / 10);
      return { zone: bestZone, confidence };
    }
    
    return null;
  }

  /**
   * Extrait les termes clés d'une requête (mots significatifs)
   */
  private extractKeyTerms(query: string): string[] {
    const stopWords = new Set([
      'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'en', 'dans',
      'pour', 'par', 'avec', 'sans', 'sur', 'sous', 'est', 'sont', 'a', 'ont',
      'et', 'ou', 'mais', 'donc', 'car', 'ce', 'cet', 'cette', 'ces', 'qui',
      'que', 'quoi', 'dont', 'où', 'lui', 'elle', 'nous', 'vous', 'ils', 'elles',
      'donne', 'moi', 'toi', 'lui', 'nous', 'vous', 'eux', 'elles'
    ]);
    
    return query
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Supprimer accents
      .replace(/[^\w\s]/g, "") // Supprimer ponctuation
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Récupère tous les mappings (pour debug)
   */
  async getAllMappings(): Promise<ImplicitMappingEntry[]> {
    await this.initialize();
    return [...this.store.mappings];
  }

  /**
   * Récupère les mappings les plus utilisés
   */
  async getTopMappings(limit: number = 10): Promise<ImplicitMappingEntry[]> {
    await this.initialize();
    return [...this.store.mappings]
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, limit);
  }

  /**
   * Supprime un mapping (pour correction)
   */
  async removeMapping(term: string, zone: string): Promise<boolean> {
    await this.initialize();
    const initialLength = this.store.mappings.length;
    this.store.mappings = this.store.mappings.filter(
      m => !(m.term === term && m.target === zone)
    );
    
    if (this.store.mappings.length !== initialLength) {
      await this.persist();
      console.log(`[IMPLICIT-MAPPING] 🗑️ Supprimé: "${term}" → ${zone}`);
      return true;
    }
    return false;
  }

  /**
   * Réinitialise tous les mappings
   */
  async reset(): Promise<void> {
    this.store = { ...DEFAULT_STORE };
    await this.persist();
    console.log(`[IMPLICIT-MAPPING] 🔄 Réinitialisé`);
  }
}

export const implicitMappingService = ImplicitMappingService.getInstance();