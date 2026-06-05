/**
 * @fileOverview FilenameAnalyzer - Analyse sémantique des noms de fichiers
 * @version 1.0.0
 * @description Extrait les composants sémantiques d'un nom de fichier pour améliorer la recherche
 * @innovation 3/3 (Amélioration 3)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface FileSemanticComponents {
  type: 'procedure' | 'guide' | 'manuel' | 'specification' | 'profile' | 'rapport' | 'general';
  action?: 'demarrage' | 'arret' | 'maintenance' | 'inspection' | 'reparation';
  equipment?: string;
  zone?: string;
  step?: number;
  version?: string;
  date?: string;
  author?: string;
  keywords: string[];
}

export interface FileSemantic {
  original: string;
  normalized: string;
  components: FileSemanticComponents;
  searchScore: number;
  confidence: number;
}

export interface SearchMatch {
  filePath: string;
  fileName: string;
  score: number;
  relevance: number;
  matchedComponents: string[];
  semantic: FileSemantic;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Patterns de reconnaissance par type de document
const TYPE_PATTERNS: Record<string, RegExp[]> = {
  procedure: [
    /proc(?:edure)?[-_ ]?/i,
    /process[-_ ]?/i,
    /methode[-_ ]?/i,
    /method[-_ ]?/i
  ],
  guide: [
    /guide[-_ ]?/i,
    /guideline[-_ ]?/i,
    /notice[-_ ]?/i
  ],
  manuel: [
    /manuel[-_ ]?/i,
    /manual[-_ ]?/i,
    /handbook[-_ ]?/i
  ],
  specification: [
    /spec(?:ification)?[-_ ]?/i,
    /tech[-_ ]?/i,
    /technical[-_ ]?/i,
    /datasheet[-_ ]?/i
  ],
  profile: [
    /profil[-_ ]?/i,
    /profile[-_ ]?/i,
    /cv[-_ ]?/i,
    /resume[-_ ]?/i,
    /rh[-_ ]?/i,
    /organigramme[-_ ]?/i
  ],
  rapport: [
    /rapport[-_ ]?/i,
    /report[-_ ]?/i,
    /compte[-_ ]?ren?du/i,
    /summary[-_ ]?/i
  ]
};

// Patterns de reconnaissance par action
const ACTION_PATTERNS: Record<string, RegExp[]> = {
  demarrage: [
    /demarrage[-_ ]?/i,
    /start[-_ ]?/i,
    /up[-_ ]?/i,
    /mise[-_ ]?en[-_ ]?marche/i
  ],
  arret: [
    /arret[-_ ]?/i,
    /stop[-_ ]?/i,
    /down[-_ ]?/i,
    /mise[-_ ]?a[-_ ]?l'arret/i,
    /shutdown[-_ ]?/i
  ],
  maintenance: [
    /maintenance[-_ ]?/i,
    /maint[-_ ]?/i,
    /entretien[-_ ]?/i,
    /repair[-_ ]?/i,
    /reparation[-_ ]?/i
  ],
  inspection: [
    /inspection[-_ ]?/i,
    /check[-_ ]?/i,
    /verification[-_ ]?/i,
    /control[-_ ]?/i
  ],
  reparation: [
    /reparation[-_ ]?/i,
    /repair[-_ ]?/i,
    /fix[-_ ]?/i,
    /depannage[-_ ]?/i
  ]
};

// Patterns de reconnaissance des équipements
const EQUIPMENT_PATTERNS: Record<string, RegExp[]> = {
  TG1: [
    /tg1[-_ ]?/i,
    /turbine[-_ ]?gaz[-_ ]?1/i,
    /gt1/i
  ],
  TG2: [
    /tg2[-_ ]?/i,
    /turbine[-_ ]?gaz[-_ ]?2/i,
    /gt2/i
  ],
  TV: [
    /tv[-_ ]?/i,
    /turbine[-_ ]?vapeur/i,
    /steam[-_ ]?turbine/i
  ],
  B0: [
    /b0[-_ ]?/i,
    /auxiliaire[-_ ]?commun/i
  ],
  B1: [
    /b1[-_ ]?/i,
    /hrsg[-_ ]?1/i,
    /chaudiere[-_ ]?1/i
  ],
  B2: [
    /b2[-_ ]?/i,
    /hrsg[-_ ]?2/i,
    /chaudiere[-_ ]?2/i
  ],
  B3: [
    /b3[-_ ]?/i,
    /tv[-_ ]?pe/i
  ],
  RH: [
    /rh[-_ ]?/i,
    /ressource[-_ ]?humaine/i
  ]
};

// Patterns pour les zones
const ZONE_PATTERNS: Record<string, RegExp[]> = {
  TECHNIQUE: [
    /tech/i,
    /technique/i,
    /industriel/i
  ],
  RH: [
    /rh/i,
    /humain/i,
    /profil/i
  ],
  MAINTENANCE: [
    /maintenance/i,
    /maint/i
  ],
  PROCEDURE: [
    /procedure/i,
    /proc/i
  ]
};

// ============================================================================
// LOGS
// ============================================================================

const LOG_PREFIX = '[FILENAME-ANALYZER]';

function logInfo(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

function logSuccess(message: string, data?: any): void {
  console.log(`${LOG_PREFIX} ✅ ${message}`);
  if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

// ============================================================================
// SERVICE
// ============================================================================

export class FilenameAnalyzer {
  private cache = new Map<string, FileSemantic>();
  private stats = {
    totalAnalyses: 0,
    cacheHits: 0,
    avgComponentsPerFile: 0
  };

  /**
   * Analyse un nom de fichier pour en extraire le contenu sémantique
   */
  analyze(fileName: string): FileSemantic {
    // Vérifier le cache
    if (this.cache.has(fileName)) {
      this.stats.cacheHits++;
      return this.cache.get(fileName)!;
    }
    
    this.stats.totalAnalyses++;
    
    // Nettoyer le nom
    const baseName = fileName
      .toLowerCase()
      .replace(/\.(pdf|doc|docx|txt|md|xlsx|xls|pptx|ppt)$/i, '')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Extraire les composants
    const components = this.extractComponents(baseName);
    
    // Calculer le score de recherche
    const searchScore = this.calculateSearchScore(components);
    
    // Calculer la confiance
    const confidence = this.calculateConfidence(components);
    
    const semantic: FileSemantic = {
      original: fileName,
      normalized: baseName,
      components,
      searchScore,
      confidence
    };
    
    // Mettre en cache
    this.cache.set(fileName, semantic);
    
    // Mettre à jour les stats
    const componentCount = Object.values(components).filter(v => v !== undefined && v !== 'general').length;
    this.stats.avgComponentsPerFile = (this.stats.avgComponentsPerFile * (this.stats.totalAnalyses - 1) + componentCount) / this.stats.totalAnalyses;
    
    logInfo(`Analysé: "${fileName}" → type:${components.type} action:${components.action || '-'} equip:${components.equipment || '-'} (conf:${(confidence * 100).toFixed(0)}%)`);
    
    return semantic;
  }

  /**
   * Extrait les composants sémantiques du nom
   */
  private extractComponents(normalizedName: string): FileSemanticComponents {
    const components: FileSemanticComponents = {
      type: 'general',
      keywords: []
    };
    
    const words = normalizedName.split(' ');
    
    // 1. Détection du type
    for (const [type, patterns] of Object.entries(TYPE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(normalizedName)) {
          components.type = type as FileSemanticComponents['type'];
          components.keywords.push(type);
          break;
        }
      }
    }
    
    // 2. Détection de l'action
    for (const [action, patterns] of Object.entries(ACTION_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(normalizedName)) {
          components.action = action as FileSemanticComponents['action'];
          components.keywords.push(action);
          break;
        }
      }
    }
    
    // 3. Détection de l'équipement
    for (const [equipment, patterns] of Object.entries(EQUIPMENT_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(normalizedName)) {
          components.equipment = equipment;
          components.keywords.push(equipment);
          break;
        }
      }
    }
    
    // 4. Détection de la zone
    for (const [zone, patterns] of Object.entries(ZONE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(normalizedName)) {
          components.zone = zone;
          components.keywords.push(zone);
          break;
        }
      }
    }
    
    // 5. Détection du numéro d'étape
    const stepMatch = normalizedName.match(/etape[-_\s]?(\d+)/i) || 
                      normalizedName.match(/step[-_\s]?(\d+)/i) ||
                      normalizedName.match(/\b(\d+)[er]?\s+etape/i);
    if (stepMatch) {
      components.step = parseInt(stepMatch[1], 10);
      components.keywords.push(`etape${components.step}`);
    }
    
    // 6. Détection de version
    const versionMatch = normalizedName.match(/v(ersion)?[-_\s]?(\d+(?:\.\d+)?)/i);
    if (versionMatch) {
      components.version = versionMatch[2];
      components.keywords.push(`v${components.version}`);
    }
    
    // 7. Ajouter tous les mots significatifs comme keywords
    for (const word of words) {
      if (word.length > 3 && !components.keywords.includes(word)) {
        components.keywords.push(word);
      }
    }
    
    // Nettoyer les doublons
    components.keywords = [...new Set(components.keywords)];
    
    return components;
  }

  /**
   * Calcule le score de recherche (0-100)
   */
  private calculateSearchScore(components: FileSemanticComponents): number {
    let score = 0;
    
    // Plus il y a de composants identifiés, plus le score est élevé
    const componentCount = Object.entries(components).filter(([k, v]) => 
      k !== 'keywords' && v !== undefined && v !== 'general'
    ).length;
    
    score += componentCount * 15;
    
    // Bonus pour type spécifique
    if (components.type !== 'general') score += 10;
    
    // Bonus pour action spécifique
    if (components.action) score += 15;
    
    // Bonus pour équipement spécifique
    if (components.equipment) score += 20;
    
    // Bonus pour numéro d'étape
    if (components.step) score += 10;
    
    // Bonus pour version
    if (components.version) score += 5;
    
    return Math.min(100, score);
  }

  /**
   * Calcule la confiance de l'analyse (0-1)
   */
  private calculateConfidence(components: FileSemanticComponents): number {
    let confidence = 0.5; // Base
    
    // Ajustement basé sur les composants trouvés
    if (components.type !== 'general') confidence += 0.1;
    if (components.action) confidence += 0.15;
    if (components.equipment) confidence += 0.15;
    if (components.step) confidence += 0.05;
    if (components.version) confidence += 0.05;
    if (components.zone) confidence += 0.05;
    
    return Math.min(0.95, confidence);
  }

  /**
   * Calcule la pertinence d'un fichier par rapport à une requête
   */
  calculateRelevance(fileName: string, query: string): number {
    const semantic = this.analyze(fileName);
    const queryLower = query.toLowerCase();
    let score = 0;
    
    // 1. Vérifier le type
    if (semantic.components.type !== 'general') {
      if (queryLower.includes(semantic.components.type)) {
        score += 20;
      }
    }
    
    // 2. Vérifier l'action
    if (semantic.components.action) {
      if (queryLower.includes(semantic.components.action)) {
        score += 25;
      }
    }
    
    // 3. Vérifier l'équipement
    if (semantic.components.equipment) {
      const equipLower = semantic.components.equipment.toLowerCase();
      if (queryLower.includes(equipLower)) {
        score += 30;
      }
    }
    
    // 4. Vérifier les mots-clés
    for (const keyword of semantic.components.keywords) {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 10;
      }
    }
    
    // 5. Vérifier les mots individuels
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);
    const normalizedName = semantic.normalized.toLowerCase();
    for (const word of queryWords) {
      if (normalizedName.includes(word)) {
        score += 15;
      }
    }
    
    return Math.min(100, score);
  }

  /**
   * Recherche les fichiers pertinents dans une liste
   */
  searchRelevantFiles(
    files: string[],
    query: string,
    minRelevance: number = 30,
    maxResults: number = 10
  ): SearchMatch[] {
    const matches: SearchMatch[] = [];
    
    for (const filePath of files) {
      const fileName = filePath.split('/').pop() || filePath;
      const relevance = this.calculateRelevance(fileName, query);
      
      if (relevance >= minRelevance) {
        const semantic = this.analyze(fileName);
        
        // Identifier les composants qui ont matché
        const matchedComponents: string[] = [];
        if (semantic.components.type !== 'general') matchedComponents.push(semantic.components.type);
        if (semantic.components.action) matchedComponents.push(semantic.components.action);
        if (semantic.components.equipment) matchedComponents.push(semantic.components.equipment);
        
        matches.push({
          filePath,
          fileName,
          score: relevance,
          relevance: relevance / 100,
          matchedComponents,
          semantic
        });
      }
    }
    
    // Trier par pertinence
    matches.sort((a, b) => b.score - a.score);
    
    logSuccess(`Recherche: ${matches.length}/${files.length} fichiers pertinents`);
    
    return matches.slice(0, maxResults);
  }

  /**
   * Normalise un nom de fichier pour la recherche
   */
  normalizeForSearch(fileName: string): string {
    const semantic = this.analyze(fileName);
    
    let normalized = '';
    
    if (semantic.components.type !== 'general') {
      normalized += `${semantic.components.type} `;
    }
    
    if (semantic.components.action) {
      normalized += `${semantic.components.action} `;
    }
    
    if (semantic.components.equipment) {
      normalized += `${semantic.components.equipment} `;
    }
    
    if (semantic.components.keywords.length > 0) {
      normalized += semantic.components.keywords.slice(0, 5).join(' ');
    }
    
    return normalized.trim();
  }

  /**
   * Compare deux noms de fichiers et retourne leur similarité
   */
  compare(fileName1: string, fileName2: string): number {
    const semantic1 = this.analyze(fileName1);
    const semantic2 = this.analyze(fileName2);
    
    let score = 0;
    let total = 0;
    
    // Comparer le type
    if (semantic1.components.type === semantic2.components.type) {
      score++;
    }
    total++;
    
    // Comparer l'action
    if (semantic1.components.action && semantic2.components.action) {
      if (semantic1.components.action === semantic2.components.action) {
        score++;
      }
    }
    total++;
    
    // Comparer l'équipement
    if (semantic1.components.equipment && semantic2.components.equipment) {
      if (semantic1.components.equipment === semantic2.components.equipment) {
        score += 2;
      }
    }
    total += 2;
    
    // Comparer les mots-clés communs
    const commonKeywords = semantic1.components.keywords.filter(k => 
      semantic2.components.keywords.includes(k)
    );
    score += Math.min(3, commonKeywords.length);
    total += 3;
    
    return score / total;
  }

  /**
   * Récupère les statistiques
   */
  getStats(): {
    totalAnalyses: number;
    cacheHits: number;
    cacheHitRate: number;
    avgComponentsPerFile: number;
    cacheSize: number;
  } {
    return {
      totalAnalyses: this.stats.totalAnalyses,
      cacheHits: this.stats.cacheHits,
      cacheHitRate: this.stats.totalAnalyses > 0 ? this.stats.cacheHits / this.stats.totalAnalyses : 0,
      avgComponentsPerFile: Math.round(this.stats.avgComponentsPerFile * 100) / 100,
      cacheSize: this.cache.size
    };
  }

  /**
   * Réinitialise le cache et les statistiques
   */
  reset(): void {
    this.cache.clear();
    this.stats = {
      totalAnalyses: 0,
      cacheHits: 0,
      avgComponentsPerFile: 0
    };
    logSuccess('Cache et statistiques réinitialisés');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const filenameAnalyzer = new FilenameAnalyzer();
export default filenameAnalyzer;