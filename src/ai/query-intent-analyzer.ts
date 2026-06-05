// src/ai/query-intent-analyzer.ts
import { ZoneType } from './vector/chromadb-schema';

export enum QueryCategory {
  GREETING = 'greeting',
  PROCEDURE = 'procedure',
  EQUIPMENT = 'equipment',
  MAINTENANCE = 'maintenance',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  TRAINING = 'training',
  PROFILE = 'profile',        // RH, compétences
  HISTORY = 'history',
  GENERAL = 'general',
  UNKNOWN = 'unknown'
}

export enum ModelType {
  FAST = 'gemma2:2b',        // Modèle rapide
  BALANCED = 'gemma2:2b',
  REASONING = 'gemma4:e2b',  // Analyse complexe
  TECHNICAL = 'gemma4:e2b',
  VISION = 'qwen3-vl:8b',
  FALLBACK = 'tinyllama'
}

export interface IntentAnalysis {
  category: QueryCategory;
  confidence: number;
  relevantZones: ZoneType[];
  suggestedModel: ModelType;
  keywords: string[];
  needsRAG: boolean;
  needsVision: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  detectedZone?: ZoneType;
  detectedEquipment?: string;
  detectedAction?: string;

}

export class QueryIntentAnalyzer {
  private categoryToZonesMap: Map<QueryCategory, ZoneType[]>;
  private keywordPatterns: Map<QueryCategory, RegExp[]>;

  constructor() {
    this.categoryToZonesMap = new Map();
    this.keywordPatterns = new Map();
    this.initializeCategoryToZones();
    this.initializeKeywordPatterns();
  }

  private initializeCategoryToZones() {
    this.categoryToZonesMap = new Map([
      [QueryCategory.GREETING, []],
      [QueryCategory.PROCEDURE, ['TG1', 'TG2', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE', 'B0_AUXILIAIRES', 'SHARED']],
      [QueryCategory.EQUIPMENT, ['TG1', 'TG2', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE', 'B0_AUXILIAIRES', 'A0_DIVERS']],
      [QueryCategory.MAINTENANCE, ['MAINTENANCE', 'TG1', 'TG2', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE', 'B0_AUXILIAIRES']],
      [QueryCategory.SECURITY, ['SHARED', 'B0_AUXILIAIRES', 'TG1', 'TG2', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE']],
      [QueryCategory.PERFORMANCE, ['SHARED', 'B0_AUXILIAIRES', 'TG1', 'TG2', 'B3_TV_PE']],
      [QueryCategory.TRAINING, ['SHARED', 'RH']],
      [QueryCategory.PROFILE, ['RH', 'SHARED']],
      [QueryCategory.HISTORY, ['MAINTENANCE', 'SHARED']],
      [QueryCategory.GENERAL, ['SHARED', 'B0_AUXILIAIRES']],
      [QueryCategory.UNKNOWN, ['SHARED']]
    ]);
  }

  private initializeKeywordPatterns() {
    this.keywordPatterns = new Map([
      [QueryCategory.GREETING, [
        /\b(bonjour|bonsoir|salut|hello|hi|hey|coucou)\b/i,
        /\b(ca va|comment allez-vous|comment ça va)\b/i
      ]],
      [QueryCategory.PROFILE, [
        /\b(qui est|qui sont)\b/i,
        /\b(profil|professionnel|compétence|expérience)\b/i,
        /\b(ahmed|abbès|technicien|ingénieur|expert)\b/i,
        /\b(cv|curriculum vitae|parcours|carrière)\b/i,
        /\b(ressource humaine|équipe|collaborateur|employé)\b/i
      ]],
      [QueryCategory.PROCEDURE, [
        /\b(procédure|démarrage|arrêt|arrêt d'urgence|procédure d'urgence)\b/i,
        /\b(comment faire|comment procéder|étapes à suivre)\b/i,
        /\b(instruction|manuel d'utilisation|guide)\b/i,
        /\b(mode opératoire|protocole|consigne opérationnelle)\b/i
      ]],
      [QueryCategory.EQUIPMENT, [
        /\b(turbine|générateur|alternateur|compresseur|pompe)\b/i,
        /\b(tg1|tg2|tv|groupe électrogène)\b/i,
        /\b(équipement|machine|appareil|moteur)\b/i,
        /\b(chaudière|échangeur|condenseur|refroidisseur)\b/i,
        /\b(cr1|cr2|hrsg)\b/i
      ]],
      [QueryCategory.MAINTENANCE, [
        /\b(maintenance|réparation|entretien|révision|inspection)\b/i,
        /\b(pannes|défaut|incident|problème technique)\b/i,
        /\b(intervention|dépannage|réparation)\b/i,
        /\b(préventif|curatif|correctif|diagnostic)\b/i,
        /\b(gamme|planning maintenance|pièce détachée)\b/i
      ]],
      [QueryCategory.SECURITY, [
        /\b(sécurité|sécurit|danger|risque|accident)\b/i,
        /\b(EPI|protection|consigne de sécurité|alerte)\b/i,
        /\b(urgence|alarme|évacuation|POUI|AMDEC)\b/i,
        /\b(fuite|incendie|explosion|blessure)\b/i,
        /\b(détection gaz|extinction|feu)\b/i
      ]],
      [QueryCategory.PERFORMANCE, [
        /\b(performance|rendement|efficacité|kpi|indicateur)\b/i,
        /\b(consommation|production|énergie|fuel|gaz)\b/i,
        /\b(optimisation|amélioration|analyse de performance)\b/i,
        /\b(benchmark|comparatif|tendance)\b/i
      ]],
      [QueryCategory.TRAINING, [
        /\b(formation|apprentissage|compétence|qualification)\b/i,
        /\b(module|stage|exercice|simulation)\b/i,
        /\b(savoir-faire|habilitation|certification)\b/i
      ]],
      [QueryCategory.HISTORY, [
        /\b(historique|antécédent|précédent|archive)\b/i,
        /\b(rapport|audit|bilan|rétrospective)\b/i,
        /\b(données passées|enregistrement|journal)\b/i
      ]]
    ]);
  }

  private detectExplicitZone(query: string): ZoneType | null {
    const lowerQuery = query.toLowerCase();
    const zoneKeywords: Record<string, ZoneType> = {
      'tg1': 'TG1',
      'turbine gaz 1': 'TG1',
      'turbine à gaz 1': 'TG1',
      'tg2': 'TG2',
      'turbine gaz 2': 'TG2',
      'turbine à gaz 2': 'TG2',
      'b1': 'B1_HRSG_TG1',
      'cr1': 'B1_HRSG_TG1',
      'chaudière 1': 'B1_HRSG_TG1',
      'hrsg tg1': 'B1_HRSG_TG1',
      'b2': 'B2_HRSG_TG2',
      'cr2': 'B2_HRSG_TG2',
      'chaudière 2': 'B2_HRSG_TG2',
      'hrsg tg2': 'B2_HRSG_TG2',
      'b3': 'B3_TV_PE',
      'tv': 'B3_TV_PE',
      'turbine vapeur': 'B3_TV_PE',
      'condenseur': 'B3_TV_PE',
      'poste eau': 'B3_TV_PE',
      'b0': 'B0_AUXILIAIRES',
      'auxiliaire': 'B0_AUXILIAIRES',
      'a0': 'A0_DIVERS',
      'divers': 'A0_DIVERS',
      'rh': 'RH',
      'ressource humaine': 'RH',
      'maintenance': 'MAINTENANCE'
    };
    for (const [keyword, zone] of Object.entries(zoneKeywords)) {
      if (lowerQuery.includes(keyword)) {
        return zone;
      }
    }
    const idMatch = query.match(/\b([AB][0-9][A-Z0-9]+)\b/i);
    if (idMatch) {
      const prefix = idMatch[1].substring(0, 2).toUpperCase();
      const prefixToZone: Record<string, ZoneType> = {
        'A0': 'A0_DIVERS',
        'B0': 'B0_AUXILIAIRES',
        'B1': 'B1_HRSG_TG1',
        'B2': 'B2_HRSG_TG2',
        'B3': 'B3_TV_PE'
      };
      if (prefixToZone[prefix]) return prefixToZone[prefix];
    }
    return null;
  }

  async analyze(query: string): Promise<IntentAnalysis> {
    const normalizedQuery = query.toLowerCase().trim();
    
    const keywordMatches = this.detectByKeywords(normalizedQuery);
    const explicitZone = this.detectExplicitZone(normalizedQuery);
    const primaryCategory = this.getPrimaryCategory(keywordMatches);
    const complexity = this.evaluateComplexity(normalizedQuery);
    const suggestedModel = this.selectModel(primaryCategory, complexity);
    
    let relevantZones: ZoneType[];
    if (explicitZone) {
      relevantZones = [explicitZone];
      if (explicitZone !== 'SHARED') relevantZones.push('SHARED');
    } else {
      relevantZones = this.getRelevantZones(primaryCategory, keywordMatches);
      if (relevantZones.length > 3) relevantZones = relevantZones.slice(0, 3);
    }
    
    const analysis: IntentAnalysis = {
      category: primaryCategory,
      confidence: this.calculateConfidence(keywordMatches),
      relevantZones,
      suggestedModel,
      keywords: this.extractKeywords(normalizedQuery),
      needsRAG: primaryCategory !== QueryCategory.GREETING,
      needsVision: this.detectVisionNeed(normalizedQuery),
      complexity,
      detectedZone: explicitZone || undefined
    };

    // ⬇️⬇️⬇️ SECTION 3 – Résultat analyse intention ⬇️⬇️⬇️
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 SECTION 3 – Analyse d\'intention');
    console.log('📂 Catégorie :', analysis.category);
    console.log('📊 Confiance :', (analysis.confidence * 100).toFixed(0) + '%');
    console.log('🔧 Complexité :', analysis.complexity);
    console.log('🤖 Modèle suggéré :', analysis.suggestedModel);
    console.log('📚 Zones RAG pertinentes :', analysis.relevantZones.join(', '));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    // ⬆️⬆️⬆️ FIN SECTION 3 ⬆️⬆️⬆️

    return analysis;
  }

  private detectByKeywords(query: string): Map<QueryCategory, number> {
    const scores = new Map<QueryCategory, number>();
    const patternsEntries = Array.from(this.keywordPatterns);
    for (const [category, patterns] of patternsEntries) {
      let score = 0;
      for (const pattern of patterns) {
        const matches = (query.match(pattern) || []).length;
        score += matches;
      }
      if (score > 0) {
        scores.set(category, score);
      }
    }
    return scores;
  }

  private getPrimaryCategory(scores: Map<QueryCategory, number>): QueryCategory {
    if (scores.size === 0) return QueryCategory.GENERAL;
    let maxCategory = QueryCategory.GENERAL;
    let maxScore = 0;
    const scoresEntries = Array.from(scores);
    for (const [category, score] of scoresEntries) {
      if (score > maxScore) {
        maxScore = score;
        maxCategory = category;
      }
    }
    return maxCategory;
  }

  private evaluateComplexity(query: string): 'simple' | 'medium' | 'complex' {
    const words = query.split(/\s+/).length;
    if (words <= 3) return 'simple';
    if (words <= 10) return 'medium';
    return 'complex';
  }

  private selectModel(category: QueryCategory, complexity: 'simple' | 'medium' | 'complex'): ModelType {
    const modelMap: Record<QueryCategory, ModelType> = {
      [QueryCategory.GREETING]: ModelType.FAST,
      [QueryCategory.PROCEDURE]: ModelType.TECHNICAL,
      [QueryCategory.EQUIPMENT]: ModelType.TECHNICAL,
      [QueryCategory.MAINTENANCE]: ModelType.REASONING,
      [QueryCategory.SECURITY]: ModelType.BALANCED,
      [QueryCategory.PERFORMANCE]: ModelType.REASONING,
      [QueryCategory.TRAINING]: ModelType.BALANCED,
      [QueryCategory.PROFILE]: ModelType.BALANCED,
      [QueryCategory.HISTORY]: ModelType.BALANCED,
      [QueryCategory.GENERAL]: ModelType.FAST,
      [QueryCategory.UNKNOWN]: ModelType.FAST
    };
    const baseModel = modelMap[category] || ModelType.FAST;
    if (complexity === 'complex' && baseModel === ModelType.FAST) {
      return ModelType.BALANCED;
    }
    if (complexity === 'simple' && baseModel === ModelType.REASONING) {
      return ModelType.BALANCED;
    }
    return baseModel;
  }

  private getRelevantZones(category: QueryCategory, scores: Map<QueryCategory, number>): ZoneType[] {
    const zones = [...(this.categoryToZonesMap.get(category) || [])];
    const scoresEntries = Array.from(scores);
    for (const [cat, score] of scoresEntries) {
      if (cat !== category && score >= 2) {
        const secondaryZones = this.categoryToZonesMap.get(cat) || [];
        zones.push(...secondaryZones);
      }
    }
    return Array.from(new Set(zones));
  }

  private calculateConfidence(scores: Map<QueryCategory, number>): number {
    if (scores.size === 0) return 0.3;
    let totalScore = 0;
    const values = Array.from(scores.values());
    for (const score of values) totalScore += score;
    const confidence = Math.min(0.95, 0.3 + totalScore * 0.1);
    return confidence;
  }

  private extractKeywords(query: string): string[] {
    const stopwords = ['le', 'la', 'les', 'un', 'une', 'des', 'pour', 'dans', 'sur', 'avec', 'et', 'ou', 'mais'];
    const words = query.toLowerCase().split(/\s+/);
    return words.filter(word => word.length > 2 && !stopwords.includes(word));
  }

  private detectVisionNeed(query: string): boolean {
    const visionKeywords = [
      /\b(image|photo|schéma|diagramme|dessin)\b/i,
      /\b(voir|montrer|visualiser)\b/i,
      /\b(capturer|prendre en photo|scanner)\b/i,
      /\b(analyse visuelle|reconnaissance)\b/i
    ];
    return visionKeywords.some(pattern => pattern.test(query));
  }

  async analyzeBatch(queries: string[]): Promise<IntentAnalysis[]> {
    const results: IntentAnalysis[] = [];
    for (const query of queries) {
      results.push(await this.analyze(query));
    }
    return results;
  }

  getCategoryDescription(category: QueryCategory): string {
    const descriptions: Record<QueryCategory, string> = {
      [QueryCategory.GREETING]: "Salutations et formules de politesse",
      [QueryCategory.PROCEDURE]: "Procédures opérationnelles et guides d'exploitation",
      [QueryCategory.EQUIPMENT]: "Informations sur les équipements techniques",
      [QueryCategory.MAINTENANCE]: "Maintenance, réparations et interventions",
      [QueryCategory.SECURITY]: "Sécurité, consignes et situations d'urgence",
      [QueryCategory.PERFORMANCE]: "Analyses de performance et indicateurs",
      [QueryCategory.TRAINING]: "Formation et développement des compétences",
      [QueryCategory.PROFILE]: "Profils, compétences et expériences des collaborateurs",
      [QueryCategory.HISTORY]: "Données historiques et archives",
      [QueryCategory.GENERAL]: "Questions générales et informations diverses",
      [QueryCategory.UNKNOWN]: "Catégorie non déterminée"
    };
    return descriptions[category] || "Catégorie non définie";
  }

  getRecommendedModel(category: QueryCategory): ModelType {
    return this.selectModel(category, 'medium');
  }
}

// ============================================
// INTENTIONS IMAGE (Version enrichie)
// ============================================

export enum ImageIntentType {
  DISPLAY = 'display',      // Afficher l'image (requête explicite)
  DESCRIBE = 'describe',    // Décrire l'image (requête explicite)
  ASK = 'ask',              // Question sur l'image
  SUGGEST = 'suggest',      // 🔥 L'IA propose une image (pertinente mais non demandée)
  NONE = 'none'             // Aucun rapport avec une image
}

export interface ImageIntentResult {
  type: ImageIntentType;
  confidence: number;
  extractedEntity?: string;      // Reste pour compatibilité descendante
  extractedEntities?: string[];   // 🔥 NOUVEAU: Liste des entités extraites
  shouldDisplayImage: boolean;
  shouldSuggestImage: boolean;  // 🔥 NOUVEAU: Proposer une image en option
  suggestedImages?: any[];       // Images potentiellement pertinentes
}

// Patterns pour détection d'intention explicite
const IMAGE_DISPLAY_PATTERNS = [
  /affich.*image/i, /montr.*image/i, /donn.*image/i,
  /vois.*image/i, /voir.*image/i, /visualise/i,
  /schéma/i, /photo/i, /illustration/i
];

const IMAGE_DESCRIBE_PATTERNS = [
  /^décris\s+/i, /^explique\s+cette\s+image/i, /^que montre\s+/i,
  /^détaille\s+l['']image/i, /^parle\s+de\s+l['']image/i
];

const IMAGE_ASK_PATTERNS = [
  /qu['']est-ce que c['']est\s+/i, /c['']est quoi\s+/i,
  /quel est ce\s+/i, /qu['']est-ce qu['']il y a\s+/i
];

// 🔥 Mots-clés qui suggèrent qu'une image pourrait être pertinente
const IMAGE_SUGGEST_KEYWORDS = [
  // Équipements techniques
  /\b(tcv|vanne|pompe|turbine|alternateur|compresseur|échangeur|condenseur)\b/i,
  /\b(tg1|tg2|cr1|cr2|hrsg|b0|b1|b2|b3)\b/i,
  
  // Composants
  /\b(pupitre|commande|écran|hmi|synoptique|tableau|armoire)\b/i,
  /\b(circuit|canalisation|tuyauterie|raccord|soupape)\b/i,
  
  // Actions/états
  /\b(démarrage|arrêt|maintenance|inspection|diagnostic)\b/i,
  /\b(panne|défaut|alarme|voyant|indicateur)\b/i,
  
  // Descripteurs
  /\b(schéma|plan|vue|détail|coupe|schématique)\b/i,
  /\b(emplacement|position|localisation|organisation)\b/i
];

// 🔥 Mots-clés EXCLUANTS (ne pas suggérer d'image)
const IMAGE_EXCLUDE_KEYWORDS = [
  /\b(prix|coût|tarif|budget)\b/i,
  /\b(date|quand|moment|délai)\b/i,
  /\b(qui|personne|contact|responsable)\b/i,
  /\b(calcul|formule|équation|mathématique)\b/i,
  /\b(texte|document|rapport|compte rendu|fiche|paragraphe)\b/i,
  /\b(donne les infos|donne des informations)\b/i
];

export class ImageIntentAnalyzer {
  
  /**
   * Analyse l'intention image d'une requête
   */
  analyzeImageIntent(query: string): ImageIntentResult {
    const trimmedQuery = query.trim();
    
    // 1. Détection d'affichage d'image (explicite)
    for (const pattern of IMAGE_DISPLAY_PATTERNS) {
      if (pattern.test(trimmedQuery)) {
        const entities = this.extractImageEntities(trimmedQuery);
        return {
          type: ImageIntentType.DISPLAY,
          confidence: 0.95,
          extractedEntity: entities[0],
          extractedEntities: entities,
          shouldDisplayImage: true,
          shouldSuggestImage: false
        };
      }
    }
    
    // 2. Détection de demande de description (explicite)
    const hasImageWord = /\b(image|photo|vue|clich|visuel|caméra|graphique|schéma|plan|montre)\b/i.test(trimmedQuery);
    const hasExtension = /\.(jpg|jpeg|png|gif)/i.test(trimmedQuery);

    for (const pattern of IMAGE_DESCRIBE_PATTERNS) {
      if (pattern.test(trimmedQuery)) {
        // Si c'est juste "décris X", on laisse le RAG gérer sauf si on mentionne explicitement une image ou un fichier
        if (!hasImageWord && !hasExtension) continue;

        const entities = this.extractImageEntities(trimmedQuery);
        return {
          type: ImageIntentType.DESCRIBE,
          confidence: 0.9,
          extractedEntity: entities[0],
          extractedEntities: entities,
          shouldDisplayImage: false,
          shouldSuggestImage: true
        };
      }
    }
    
    // 3. Détection de question sur l'image (explicite)
    for (const pattern of IMAGE_ASK_PATTERNS) {
      if (pattern.test(trimmedQuery)) {
        // Pareil pour les questions génériques "c'est quoi X"
        if (!hasImageWord && !hasExtension) continue;

        const entities = this.extractImageEntities(trimmedQuery);
        return {
          type: ImageIntentType.ASK,
          confidence: 0.85,
          extractedEntity: entities[0],
          extractedEntities: entities,
          shouldDisplayImage: false,
          shouldSuggestImage: true
        };
      }
    }
    
    // 4. 🔥 Détection de SUGGESTION (requête technique qui pourrait bénéficier d'une image)
    const lowerQuery = trimmedQuery.toLowerCase();
    
    // Vérifier les mots-clés d'exclusion d'abord
    for (const pattern of IMAGE_EXCLUDE_KEYWORDS) {
      if (pattern.test(lowerQuery)) {
        return {
          type: ImageIntentType.NONE,
          confidence: 0,
          shouldDisplayImage: false,
          shouldSuggestImage: false
        };
      }
    }
    
    // Vérifier les mots-clés de suggestion
    let suggestionScore = 0;
    let matchedKeywords: string[] = [];
    
    for (const pattern of IMAGE_SUGGEST_KEYWORDS) {
      if (pattern.test(lowerQuery)) {
        suggestionScore += 0.2;
        const match = lowerQuery.match(pattern);
        if (match) matchedKeywords.push(match[0]);
      }
    }
    
    // Bonus pour les questions commençant par "comment" ou "pourquoi"
    if (/^(comment|pourquoi|quand|où)/i.test(trimmedQuery)) {
      suggestionScore += 0.1;
    }
    
    // Bonus pour les questions longues (plus de détails)
    if (trimmedQuery.split(/\s+/).length > 8) {
      suggestionScore += 0.1;
    }
    
    if (suggestionScore >= 0.3) {
      console.log(`[IMAGE-INTENT] 💡 Suggestion d'image détectée (score: ${suggestionScore}, mots-clés: ${matchedKeywords.join(', ')})`);
      
      // 🔥 SPECIAL : Si le mot "image" est présent ET que le score est élevé, on force le DISPLAY
      if (lowerQuery.includes('image') || lowerQuery.includes('photo')) {
        return {
          type: ImageIntentType.DISPLAY,
          confidence: Math.min(suggestionScore + 0.2, 0.9),
          shouldDisplayImage: true,
          shouldSuggestImage: false
        };
      }

      return {
        type: ImageIntentType.SUGGEST,
        confidence: Math.min(suggestionScore, 0.8),
        shouldDisplayImage: false,
        shouldSuggestImage: true
      };
    }
    
    // 5. Aucune intention image détectée
    return {
      type: ImageIntentType.NONE,
      confidence: 0,
      shouldDisplayImage: false,
      shouldSuggestImage: false
    };
  }
  
  /**
   * Extrait les noms des images ou des équipements de la requête (MULTIPLE)
   */
  private extractImageEntities(query: string): string[] {
    const entities: string[] = [];
    
    // 1. Pattern pour noms de fichiers image (ex: pupitre_TV.jpg)
    const fileMatches = Array.from(query.matchAll(/([a-zA-Z0-9_\-]+\.(jpg|jpeg|png|gif))/gi));
    for (const match of fileMatches) {
      entities.push(match[1]);
    }
    
    // 2. Pattern pour codes techniques (ex: TG1, CR2, SOCLE_ET_SUPPORTS)
    // On capture aussi les mots longs en majuscules avec underscores
    const codeMatches = Array.from(query.matchAll(/\b([A-Z]{2,}[0-9_]*[A-Z0-9_]*)\b/gi));
    for (const match of codeMatches) {
      // Éviter les mots communs et les codes trop génériques qui pourraient fausser le RAG
      const common = ['IMAGE', 'PHOTO', 'PLAN', 'SCHÉMA', 'AFFICHE', 'MONTRE', 'DONNE', 'VOIR', 'PUPITRE', 'TV', 'TG', 'CR', 'ET', 'DU', 'LA', 'LE', 'LES', 'DES', 'CE', 'CET', 'CETTE'];
      const val = match[1].toUpperCase();
      if (!common.includes(val) && val.length >= 2) {
        entities.push(val);
      }
    }
    
    // 3. Texte entre guillemets
    const quotedMatches = Array.from(query.matchAll(/["']([^"']+)["']/g));
    for (const match of quotedMatches) {
      entities.push(match[1]);
    }
    
    // Déduplication
    return Array.from(new Set(entities));
  }

  
  /**
   * Vérifie si la requête demande explicitement d'afficher une image
   */
  isDisplayRequest(query: string): boolean {
    return this.analyzeImageIntent(query).type === ImageIntentType.DISPLAY;
  }
  
  /**
   * Vérifie si la requête pourrait bénéficier d'une image (suggestion)
   */
  shouldSuggestImage(query: string): boolean {
    const intent = this.analyzeImageIntent(query);
    return intent.type === ImageIntentType.SUGGEST || 
           intent.type === ImageIntentType.DESCRIBE ||
           intent.type === ImageIntentType.ASK;
  }
}

// Exporter une instance unique
export const imageIntentAnalyzer = new ImageIntentAnalyzer();

export const queryIntentAnalyzer = new QueryIntentAnalyzer();