/**
 * @fileOverview TrainingQRLoader - Recherche dans les données d'entraînement pré-préparées
 * @version 1.0.0
 * @description Charge et recherche dans les paires Q/R du répertoire data/training/
 * @voix 7ème voix du MultiSourceFetcher - Données d'entraînement
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface TrainingQAPair {
  question: string;
  response: string;
  quality?: number;
  category?: string;
  sourceFile?: string;
}

export interface TrainingSearchResult {
  pair: TrainingQAPair;
  score: number;
  matchType: 'exact' | 'similar' | 'keyword';
  sourceFile: string;
}

export interface TrainingSearchOptions {
  minScore?: number;
  maxResults?: number;
  minQuality?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const TRAINING_DATA_DIR = path.join(process.cwd(), 'data', 'training');
const TRAINING_IMPORTS_DIR = path.join(TRAINING_DATA_DIR, 'imports');
const TRAINING_VERSIONS_DIR = path.join(TRAINING_DATA_DIR, 'versions'); // 🔥 NOUVEAU
const TRAINING_DATASET_FILE = path.join(TRAINING_DATA_DIR, 'dataset.jsonl');
const TRAINING_EXAMPLES_FILE = path.join(TRAINING_DATA_DIR, 'examples.json');
const TRAINING_CIRCUITS_DIR = path.join(TRAINING_DATA_DIR, 'circuits');

const DEFAULT_OPTIONS: TrainingSearchOptions = {
  minScore: 0.35,
  maxResults: 3,
  minQuality: 3
};

// ============================================================================
// LOGS STRUCTURÉS
// ============================================================================

const LOG_PREFIX = '[TRAINING-QR]';

function logInfo(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📚🎓 ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logSuccess(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} ✅🎓 ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logWarning(message: string): void {
  console.warn(`${LOG_PREFIX} ⚠️🎓 ${message}`);
}

// ============================================================================
// SERVICE
// ============================================================================

export class TrainingQRLoader {
  private cache: Map<string, TrainingQAPair[]> = new Map();
  private initialized = false;
  private allPairs: TrainingQAPair[] = [];

  constructor() {}

  /**
   * Initialise et charge toutes les données d'entraînement
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logInfo(`Chargement des données d'entraînement depuis: ${TRAINING_DATA_DIR}`);
    const startTime = Date.now();

    this.allPairs = [];

    // 1. Charger les fichiers JSON du répertoire imports/
    await this.loadImportsDirectory();

    // 1b. 🔥 Charger les fichiers JSON du répertoire versions/
    await this.loadVersionsDirectory();

    // 2. Charger dataset.jsonl si présent
    await this.loadDatasetJSONL();

    // 3. Charger examples.json si présent
    await this.loadExamplesJSON();

    // 4. Charger répertoires de circuits structurés
    await this.loadCircuitsDirectory();

    this.initialized = true;

    const elapsed = Date.now() - startTime;
    logSuccess(
      `Données d'entraînement chargées: ${this.allPairs.length} paires Q/R en ${elapsed}ms`,
      {
        sources: this.listLoadedSources(),
        totalPairs: this.allPairs.length
      }
    );
  }

  /**
   * Charge tous les fichiers JSON du répertoire versions/
   */
  private async loadVersionsDirectory(): Promise<void> {
    if (!fs.existsSync(TRAINING_VERSIONS_DIR)) {
      logWarning(`Répertoire versions/ introuvable: ${TRAINING_VERSIONS_DIR}`);
      return;
    }

    const files = fs.readdirSync(TRAINING_VERSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    logInfo(`📁 ${files.length} fichiers de versions trouvés`);

    for (const file of files) {
      const filePath = path.join(TRAINING_VERSIONS_DIR, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
        const data = JSON.parse(raw);

        const pairs = this.parseQAPairsFromJSON(data, `versions/${file}`);
        this.allPairs.push(...pairs);
        this.cache.set(filePath, pairs);

        if (file.includes('v13')) {
          logSuccess(`🔍 Version v13 chargée avec ${pairs.length} paires`);
        }
      } catch (error: any) {
        logWarning(`Échec chargement version ${file}: ${error.message}`);
      }
    }
  }

  /**
   * Charge tous les fichiers JSON du répertoire imports/
   */
  private async loadImportsDirectory(): Promise<void> {
    if (!fs.existsSync(TRAINING_IMPORTS_DIR)) {
      logWarning(`Répertoire imports/ introuvable: ${TRAINING_IMPORTS_DIR}`);
      return;
    }

    const files = fs.readdirSync(TRAINING_IMPORTS_DIR).filter(f => f.endsWith('.json'));
    logInfo(`📁 ${files.length} fichiers d'imports trouvés`);

    for (const file of files) {
      const filePath = path.join(TRAINING_IMPORTS_DIR, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
        const data = JSON.parse(raw);

        const pairs = this.parseQAPairsFromJSON(data, `imports/${file}`);
        this.allPairs.push(...pairs);
        this.cache.set(filePath, pairs);
      } catch (error: any) {
        logWarning(`Échec chargement ${file}: ${error.message}`);
      }
    }
  }

  /**
   * Charge le fichier dataset.jsonl (format JSONL = une ligne JSON par entrée)
   */
  private async loadDatasetJSONL(): Promise<void> {
    if (!fs.existsSync(TRAINING_DATASET_FILE)) return;

    try {
      const lines = fs.readFileSync(TRAINING_DATASET_FILE, 'utf-8')
        .replace(/^\uFEFF/, '')
        .split('\n')
        .filter(l => l.trim().length > 0);

      const pairs: TrainingQAPair[] = [];

      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          // Support tous les formats: {question, response}, {instruction, response},
          // {prompt, completion}, {input, output}
          const question = obj.question || obj.instruction || obj.prompt || obj.input || '';
          const response = obj.response || obj.completion || obj.output || obj.answer || '';
          if (question && response) {
            pairs.push({
              question: String(question).replace(/^"|"$/g, '').trim(),
              response: String(response).trim(),
              quality: obj.quality || obj.score || 4,
              category: obj.source || obj.category || undefined,
              sourceFile: 'dataset.jsonl'
            });
          }
        } catch {
          // Ligne invalide, skip
        }
      }

      this.allPairs.push(...pairs);
      logInfo(`dataset.jsonl: ${pairs.length} paires chargées`);
    } catch (error: any) {
      logWarning(`Échec chargement dataset.jsonl: ${error.message}`);
    }
  }

  /**
   * Charge le fichier examples.json
   */
  private async loadExamplesJSON(): Promise<void> {
    if (!fs.existsSync(TRAINING_EXAMPLES_FILE)) return;

    try {
      const raw = fs.readFileSync(TRAINING_EXAMPLES_FILE, 'utf-8').replace(/^\uFEFF/, '');
      const data = JSON.parse(raw);
      const pairs = this.parseQAPairsFromJSON(data, 'examples.json');
      this.allPairs.push(...pairs);
      logInfo(`examples.json: ${pairs.length} paires chargées`);
    } catch (error: any) {
      logWarning(`Échec chargement examples.json: ${error.message}`);
    }
  }

  /**
   * Charge la hiérarchie physique par circuit (data/training/circuits/[id]/qa.json)
   */
  private async loadCircuitsDirectory(): Promise<void> {
    if (!fs.existsSync(TRAINING_CIRCUITS_DIR)) return;
    
    try {
      const dirs = fs.readdirSync(TRAINING_CIRCUITS_DIR, { withFileTypes: true });
      let totalLoaded = 0;

      for (const dir of dirs) {
        if (dir.isDirectory()) {
           const qaFile = path.join(TRAINING_CIRCUITS_DIR, dir.name, 'qa.json');
           if (fs.existsSync(qaFile)) {
             try {
               const raw = fs.readFileSync(qaFile, 'utf-8').replace(/^\uFEFF/, '');
               const data = JSON.parse(raw);
               const pairs = this.parseQAPairsFromJSON(data, `circuits/${dir.name}/qa.json`);
               this.allPairs.push(...pairs);
               totalLoaded += pairs.length;
             } catch(err: any) {
               logWarning(`Échec chargement circuit ${dir.name}/qa.json: ${err.message}`);
             }
           }
        }
      }
      if (totalLoaded > 0) {
        logInfo(`circuits/: ${totalLoaded} paires spécifiques chargées depuis l'Arborescence structurée`);
      }
    } catch (error: any) {
      logWarning(`Échec exploration de circuits/: ${error.message}`);
    }
  }

  /**
   * Parse de façon flexible un JSON contenant des paires Q/R
   * Support: tableau plat, tableau de tableaux, objet avec clé "pairs" / "data" / "questions"
   */
  private parseQAPairsFromJSON(data: any, sourceFile: string): TrainingQAPair[] {
    const pairs: TrainingQAPair[] = [];

    const processItem = (item: any) => {
      if (!item || typeof item !== 'object') return;
      // Support tous les champs possibles (instruction = format Alpaca/Ollama)
      const question = item.question || item.instruction || item.prompt || item.input || item.q || '';
      const response = item.response || item.answer || item.completion || item.output || item.r || '';
      if (question && response) {
        pairs.push({
          question: String(question).replace(/^"|",$/, '').trim(),
          response: String(response).trim(),
          quality: item.quality || item.score || 5,
          category: item.category || item.zone || item.source || undefined,
          sourceFile
        });
      }
    };

    if (Array.isArray(data)) {
      // Tableau plat ou tableau de tableaux
      for (const item of data) {
        if (Array.isArray(item)) {
          // Tableau de tableaux (format questions_ccp.json)
          for (const subItem of item) {
            processItem(subItem);
          }
        } else {
          processItem(item);
        }
      }
    } else if (data && typeof data === 'object') {
      // Objet avec une clé de données
      const dataKey = ['pairs', 'data', 'questions', 'examples', 'items'].find(k => Array.isArray(data[k]));
      if (dataKey) {
        for (const item of data[dataKey]) {
          processItem(item);
        }
      }
    }

    return pairs;
  }

  /**
   * Recherche sémantique légère par similarité de mots-clés
   */
  async search(query: string, options?: TrainingSearchOptions): Promise<TrainingSearchResult[]> {
    await this.initialize();

    const opts = { ...DEFAULT_OPTIONS, ...options };
    const queryLower = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Persistent log for debugging (avec limite de taille ~1MB)
    const logFile = path.join(process.cwd(), 'data', 'training', 'logs', 'search_debug.log');
    const logEntry = `\n[${new Date().toISOString()}] SEARCH: "${query}" | Pairs: ${this.allPairs.length}\n`;
    
    try {
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > 1024 * 1024) { // 1MB
          fs.writeFileSync(logFile, logEntry); // reset file
        } else {
          fs.appendFileSync(logFile, logEntry);
        }
      } else {
        // S'assurer que le dossier existe
        const logDir = path.dirname(logFile);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        fs.writeFileSync(logFile, logEntry);
      }
    } catch (e) {
      console.warn('⚠️ Impossible d\'écrire dans search_debug.log', e);
    }
    
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);

    const stopWords = new Set([
      'quel', 'quelle', 'quels', 'est', 'sont', 'pour', 'dans', 'avec',
      'quoi', 'comment', 'pourquoi', 'donne', 'info', 'moi', 'cest',
      'cette', 'vous', 'vous', 'que', 'qui', 'dont', 'lors', 'lors'
    ]);

    const significantWords = queryWords.filter(w => !stopWords.has(w));

    const scored: Array<{ pair: TrainingQAPair; score: number; matchType: TrainingSearchResult['matchType'] }> = [];

    for (const pair of this.allPairs) {
      // Filtrer par qualité minimale
      if (opts.minQuality && (pair.quality || 0) < opts.minQuality) continue;

      const pairQuestionLower = pair.question
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      // 1. Correspondance exacte (ignore la ponctuation finale)
      const q1 = pairQuestionLower.replace(/[?!.]+$/, '').replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ').trim();
      const q2 = queryLower.replace(/[?!.]+$/, '').replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ').trim();
      
      if (q1 === q2) {
        fs.appendFileSync(logFile, `  ✅ MATCH EXACT: "${q1}" === "${q2}"\n`);
        scored.push({ pair, score: 1.0, matchType: 'exact' });
        continue;
      } else if (pairQuestionLower.includes('registre') && queryLower.includes('registre')) {
        // Log mismatch for potential matches
        fs.appendFileSync(logFile, `  ❌ MISMATCH: q1="${q1}" | q2="${q2}"\n`);
      }

      // 2. La question contient la requête ou vice versa
      if (pairQuestionLower.includes(queryLower) || queryLower.includes(pairQuestionLower)) {
        scored.push({ pair, score: 0.92, matchType: 'similar' });
        continue;
      }

      // 3. Similarité Jaccard sur les mots
      const pairWords = new Set(pairQuestionLower.split(/\s+/).filter(w => w.length > 2));
      const queryWordsSet = new Set(queryWords);
      const intersection = new Set([...queryWordsSet].filter(w => pairWords.has(w)));
      const union = new Set([...queryWordsSet, ...pairWords]);
      const jaccard = union.size > 0 ? intersection.size / union.size : 0;

      // 4. Score bonus sur les mots significatifs
      let significantMatches = 0;
      for (const word of significantWords) {
        if (pairQuestionLower.includes(word)) significantMatches++;
      }
      const significantBonus = significantWords.length > 0
        ? (significantMatches / significantWords.length) * 0.3
        : 0;

      const finalScore = Math.min(0.95, jaccard * 0.7 + significantBonus);

      if (finalScore >= (opts.minScore || 0.35)) {
        const matchType: TrainingSearchResult['matchType'] = finalScore > 0.7 ? 'similar' : 'keyword';
        scored.push({ pair, score: finalScore, matchType });
      }
    }

    // Trier par score décroissant
    scored.sort((a, b) => b.score - a.score);

    const results = scored.slice(0, opts.maxResults || 3).map(s => ({
      pair: s.pair,
      score: s.score,
      matchType: s.matchType,
      sourceFile: s.pair.sourceFile || 'training'
    }));

    if (results.length > 0) {
      const resultsLog = results.map(r => `  - [${r.matchType}] ${r.pair.question.substring(0, 50)}... (Score: ${r.score})\n`).join('');
      fs.appendFileSync(logFile, resultsLog);
    } else {
      fs.appendFileSync(logFile, '  - AUCUN RÉSULTAT\n');
    }

    return results;
  }

  /**
   * Retourne la liste des sources chargées
   */
  private listLoadedSources(): string[] {
    return Array.from(this.cache.keys()).map(p => path.basename(p));
  }

  /**
   * Retourne le nombre total de paires chargées
   */
  getTotalPairs(): number {
    return this.allPairs.length;
  }

  /**
   * Vérifie si les données sont initialisées
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Force le rechargement des données (après ajout de nouveaux fichiers)
   */
  async reload(): Promise<void> {
    this.initialized = false;
    this.cache.clear();
    this.allPairs = [];
    await this.initialize();
    logSuccess(`Données d'entraînement rechargées: ${this.allPairs.length} paires`);
  }

  /**
   * Retourne des statistiques sur les données chargées
   */
  getStats(): { total: number; sources: string[]; byQuality: Record<number, number> } {
    const byQuality: Record<number, number> = {};
    for (const pair of this.allPairs) {
      const q = pair.quality || 0;
      byQuality[q] = (byQuality[q] || 0) + 1;
    }
    return {
      total: this.allPairs.length,
      sources: this.listLoadedSources(),
      byQuality
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const trainingQRLoader = new TrainingQRLoader();
export default trainingQRLoader;
