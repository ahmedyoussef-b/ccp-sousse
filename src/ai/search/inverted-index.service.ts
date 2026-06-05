import fs from 'fs/promises';
import path from 'path';

export interface InvertedIndexEntry {
  filePath: string;
  fileName: string;
  zone: string;
  occurrences: number;
  positions?: number[];
  lastAccessed: string;
}

export interface InvertedIndex {
  version: string;
  lastUpdated: string;
  totalFiles: number;
  totalTerms: number;
  stats: {
    uniqueTerms: number;
    avgOccurrencesPerTerm: number;
    mostFrequentTerms: Array<{ term: string; count: number }>;
  };
  index: Record<string, InvertedIndexEntry[]>;
}

export class InvertedIndexService {
  private indexPath: string;
  private stopWords: Set<string>;

  constructor() {
    this.indexPath = path.join(process.cwd(), 'data', 'training', 'inverted_index.json');
    this.stopWords = new Set([
      'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'donc',
      'or', 'ni', 'car', 'mais', 'ce', 'cet', 'cette', 'ces', 'mon', 'ton',
      'son', 'notre', 'votre', 'leur', 'je', 'tu', 'il', 'elle', 'on', 'nous',
      'vous', 'ils', 'elles', 'me', 'te', 'se', 'nous', 'vous', 'se', 'y', 'en',
      'a', 'dans', 'par', 'pour', 'sur', 'sans', 'avec', 'entre', 'pendant',
      'depuis', 'devant', 'derrière', 'contre', 'sous', 'au', 'aux', 'du', 'des',
      'est', 'sont', 'était', 'étaient', 'sera', 'seront', 'a', 'ont', 'avait',
      'auront', 'peut', 'peuvent', 'pouvait', 'pourront', 'doit', 'doivent',
      'devait', 'devront', 'fait', 'font', 'faisait', 'feront', 'decrit', 'décrit'
    ]);
  }

  /**
   * Tokenize et nettoie un texte
   */
  private tokenize(text: string): string[] {
    // Normalisation : minuscules, suppression accents basique
    const normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Split et filtre
    const words = normalized.split(/\s+/);
    
    return words.filter(word => {
      // Garde les mots de 2+ caractères (sauf codes techniques)
      if (word.length < 2) return false;
      // Filtre stop words
      if (this.stopWords.has(word)) return false;
      // Garde les codes techniques (ex: b0sy11, TG1)
      if (/^[a-z]{1,2}\d+[a-z]*\d*$/.test(word)) return true;
      // Garde les mots avec tirets (ex: refroidissement-eau)
      if (word.includes('-') && word.length >= 3) return true;
      // Évite les mots trop longs (erreurs OCR)
      if (word.length > 45) return false;
      
      return true;
    });
  }

  /**
   * Extrait les mots-clés techniques spécifiques
   */
  private extractTechnicalTerms(text: string): Map<string, number> {
    const technicalPatterns = [
      // Codes systèmes (TG1, TG2, B0, etc.)
      /\b([A-Z]{1,2}\d+[A-Z]*\d*)\b/gi,
      // Composants
      /\b(socle|support|turbine|alternateur|compresseur|chaudière|hrsg)\b/gi,
      // Systèmes
      /\b(refroidissement|lubrification|filtration|guidage|dilatation)\b/gi,
      // Actions techniques
      /\b(boulonnée|goupillée|usinée|soudée|étanche)\b/gi,
    ];

    const terms = new Map<string, number>();
    
    for (const pattern of technicalPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const term = match[1].toLowerCase();
        terms.set(term, (terms.get(term) || 0) + 1);
      }
    }
    
    return terms;
  }

  /**
   * Génère l'index inversé pour un document
   */
  async indexDocument(
    filePath: string,
    fileName: string,
    content: string,
    zone: string
  ): Promise<void> {
    // Tokenisation standard
    const tokens = this.tokenize(content);
    const termFrequency = new Map<string, number>();
    
    for (const token of tokens) {
      termFrequency.set(token, (termFrequency.get(token) || 0) + 1);
    }
    
    // Ajout des termes techniques
    const technicalTerms = this.extractTechnicalTerms(content);
    for (const [term, count] of technicalTerms) {
      termFrequency.set(term, (termFrequency.get(term) || 0) + count);
    }
    
    // Charger l'index existant
    let index: InvertedIndex;
    try {
      const exists = await fs.access(this.indexPath).then(() => true).catch(() => false);
      if (exists) {
        const data = await fs.readFile(this.indexPath, 'utf-8');
        index = JSON.parse(data);
      } else {
        index = this.createEmptyIndex();
      }
    } catch (error) {
      console.warn('[INVERTED-INDEX] Création d\'un nouvel index');
      index = this.createEmptyIndex();
    }
    
    // Supprimer les anciennes entrées de ce fichier
    for (const term in index.index) {
      index.index[term] = index.index[term].filter(entry => entry.filePath !== filePath);
      if (index.index[term].length === 0) {
        delete index.index[term];
      }
    }
    
    // Ajouter les nouvelles entrées
    for (const [term, count] of termFrequency) {
      if (!index.index[term]) {
        index.index[term] = [];
      }
      
      index.index[term].push({
        filePath,
        fileName,
        zone,
        occurrences: count,
        lastAccessed: new Date().toISOString()
      });
    }
    
    // Mettre à jour les stats
    index.lastUpdated = new Date().toISOString();
    index.totalFiles = await this.getUniqueFileCount(index);
    index.totalTerms = Object.keys(index.index).length;
    index.stats = this.calculateStats(index);
    
    // Sauvegarder
    await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
    
    console.log(`[INVERTED-INDEX] ✅ Indexé: ${fileName} (${termFrequency.size} termes uniques)`);
  }
  
  /**
   * Supprime un document de l'index
   */
  async removeDocument(filePath: string): Promise<void> {
    try {
      const exists = await fs.access(this.indexPath).then(() => true).catch(() => false);
      if (!exists) return;
      
      const data = await fs.readFile(this.indexPath, 'utf-8');
      const index: InvertedIndex = JSON.parse(data);
      
      let modified = false;
      for (const term in index.index) {
        const originalLength = index.index[term].length;
        index.index[term] = index.index[term].filter(entry => entry.filePath !== filePath);
        if (index.index[term].length !== originalLength) modified = true;
        
        if (index.index[term].length === 0) {
          delete index.index[term];
        }
      }
      
      if (modified) {
        index.totalFiles = await this.getUniqueFileCount(index);
        index.totalTerms = Object.keys(index.index).length;
        index.stats = this.calculateStats(index);
        await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
        console.log(`[INVERTED-INDEX] 🗑️ Supprimé: ${path.basename(filePath)}`);
      }
    } catch (error) {
      console.error('[INVERTED-INDEX] Erreur suppression:', error);
    }
  }
  
  /**
   * Recherche dans l'index inversé
   */
  search(): Array<{ filePath: string; fileName: string; score: number; zone: string }> {
    // Implémentation de la recherche
    const results = new Map<string, { entry: InvertedIndexEntry; score: number }>();
    // ... (à implémenter selon besoins)
    return Array.from(results.values()).map(r => ({
      filePath: r.entry.filePath,
      fileName: r.entry.fileName,
      score: r.score,
      zone: r.entry.zone
    }));
  }
  
  /**
   * Récupère les statistiques de l'index
   */
  async getStats(): Promise<{ exists: boolean; stats?: InvertedIndex['stats']; totalFiles?: number; lastUpdated?: string }> {
    try {
      const exists = await fs.access(this.indexPath).then(() => true).catch(() => false);
      if (!exists) return { exists: false };
      
      const data = await fs.readFile(this.indexPath, 'utf-8');
      const index: InvertedIndex = JSON.parse(data);
      
      return {
        exists: true,
        stats: index.stats,
        totalFiles: index.totalFiles,
        lastUpdated: index.lastUpdated
      };
    } catch (error) {
      return { exists: false };
    }
  }
  
  /**
   * Régénère l'index complet à partir des documents existants
   */
  async rebuildIndex(documents: Array<{ path: string; name: string; content: string; zone: string }>): Promise<{ totalFiles: number; totalTerms: number; duration: number }> {
    const startTime = Date.now();
    
    // Créer un index vide
    let index = this.createEmptyIndex();
    
    // Indexer chaque document
    for (const doc of documents) {
      const tokens = this.tokenize(doc.content);
      const termFrequency = new Map<string, number>();
      
      for (const token of tokens) {
        termFrequency.set(token, (termFrequency.get(token) || 0) + 1);
      }
      
      const technicalTerms = this.extractTechnicalTerms(doc.content);
      for (const [term, count] of technicalTerms) {
        termFrequency.set(term, (termFrequency.get(term) || 0) + count);
      }
      
      for (const [term, count] of termFrequency) {
        if (!index.index[term]) index.index[term] = [];
        
        index.index[term].push({
          filePath: doc.path,
          fileName: doc.name,
          zone: doc.zone,
          occurrences: count,
          lastAccessed: new Date().toISOString()
        });
      }
    }
    
    // Mettre à jour les métadonnées
    index.lastUpdated = new Date().toISOString();
    index.totalFiles = documents.length;
    index.totalTerms = Object.keys(index.index).length;
    index.stats = this.calculateStats(index);
    
    // Sauvegarder
    await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
    
    const duration = Date.now() - startTime;
    console.log(`[INVERTED-INDEX] 🔄 Régénération complète: ${documents.length} fichiers, ${index.totalTerms} termes uniques (${duration}ms)`);
    
    return {
      totalFiles: documents.length,
      totalTerms: index.totalTerms,
      duration
    };
  }
  
  private createEmptyIndex(): InvertedIndex {
    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      totalFiles: 0,
      totalTerms: 0,
      stats: {
        uniqueTerms: 0,
        avgOccurrencesPerTerm: 0,
        mostFrequentTerms: []
      },
      index: {}
    };
  }
  
  private async getUniqueFileCount(index: InvertedIndex): Promise<number> {
    const files = new Set<string>();
    for (const entries of Object.values(index.index)) {
      for (const entry of entries) {
        files.add(entry.filePath);
      }
    }
    return files.size;
  }
  
  private calculateStats(index: InvertedIndex): InvertedIndex['stats'] {
    const uniqueTerms = Object.keys(index.index).length;
    
    let totalOccurrences = 0;
    const termCounts: Array<{ term: string; count: number }> = [];
    
    for (const [term, entries] of Object.entries(index.index)) {
      const count = entries.reduce((sum, e) => sum + e.occurrences, 0);
      totalOccurrences += count;
      termCounts.push({ term, count });
    }
    
    termCounts.sort((a, b) => b.count - a.count);
    
    return {
      uniqueTerms,
      avgOccurrencesPerTerm: uniqueTerms > 0 ? totalOccurrences / uniqueTerms : 0,
      mostFrequentTerms: termCounts.slice(0, 20)
    };
  }
}

export const invertedIndexService = new InvertedIndexService();