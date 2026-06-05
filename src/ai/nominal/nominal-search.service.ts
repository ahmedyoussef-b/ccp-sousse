/**
 * Recherche nominale - Scan récursif des répertoires par nom de fichier
 * @version 3.1.0
 * @description Recherche des fichiers dont le nom contient les termes de la question
 *              Gère: espaces, underscores, tirets, accents, fautes de frappe
 *              Priorité à la structure de dossiers (RH, TG1, MAINTENANCE, etc.)
 * @enhancement Intégration de FilenameAnalyzer pour analyse sémantique avancée
 */

import fs from 'fs';
import path from 'path';
import { implicitMappingService } from './implicit-mapping.service';
import { filenameAnalyzer } from '../orchestration/innovations/filename-analyzer';
import type { NominalSearchResult, NominalSearchOptions, SemanticAnalysis, SearchDetails } from './types';

// Règles d'exclusion sémantique
const EXCLUSION_RULES: Record<string, string[]> = {
  'socle': ['accouplement', 'accouplements', 'couple', 'transmission'],
  'support': ['accouplement', 'accouplements', 'flexible', 'elastique'],
  'chauffage': ['refroidissement', 'cooling', 'froid', 'glace', 'climatisation'],
  'refroidissement': ['chauffage', 'heating', 'chaud', 'réchauffement'],
  'ventilation': ['étanchéité', 'sealing', 'fermeture', 'obturation'],
  'etancheite': ['ventilation', 'aération', 'ouverture', 'air'],
  'lubrification': ['filtration', 'séchage', 'assèchement'],
  'filtration': ['lubrification', 'graissage', 'huile']
};

const DEFAULT_BASE_PATH = path.join(process.cwd(), 'data', 'centrale_documents');

const KNOWN_ZONES = [
  'RH', 'HR', 'MAINTENANCE', 'TG1', 'TG2', 
  'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE',
  'PROCEDURES', 'SECURITE', 'FORMATION', 'ANALYSE_PERFORMANCE',
  'HISTORIQUE', 'SHARED', 'AUXILIAIRES', 'ZONES_CONFIG',
  '12_GESTION_EQUIPES_ET_HUMAIN', '01_DOCUMENTS_GENERAUX',
  '02_EQUIPEMENTS_PRINCIPAUX', '03_SYSTEMES_AUXILIAIRES',
  '04_PROCEDURES', '05_CONSIGNES_ET_SEUILS', '06_MAINTENANCE',
  '07_HISTORIQUE', '08_SECURITE', '09_ANALYSE_PERFORMANCE',
  '10_FORMATION', '11_SALLE_CONTROLE_ET_CONDUITE', '13_SUPERVISION_GLOBALE',
  'A0_DIVERS', 'B0_AUXILIAIRES', 'VISION'
];

export class NominalSearchService {
  private static instance: NominalSearchService;
  private initialized = false;

  private constructor() {}

  static getInstance(): NominalSearchService {
    if (!NominalSearchService.instance) {
      NominalSearchService.instance = new NominalSearchService();
    }
    return NominalSearchService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await implicitMappingService.initialize();
    this.initialized = true;
    console.log(`[NOMINAL-SEARCH] ✅ Initialisé (avec analyse sémantique)`);
  }

  // ============================================================================
  // NORMALISATION ET UTILITAIRES
  // ============================================================================

  private normalizeString(str: string, removeUnderscores: boolean = true): string {
    let normalized = str
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s_]/g, '')
      .trim();
    if (removeUnderscores) normalized = normalized.replace(/[_]/g, ' ');
    return normalized;
  }

  private normalizeFilename(filename: string): string {
    return filename
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\.(txt|json|pdf|md|docx?|png|jpg|jpeg)$/, '')
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Normalise une requête pour la recherche nominale
   */
  private normalizeForFileSearch(query: string): string {
    let normalized = query
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, '_')
      .replace(/[-]/g, '_')
      .replace(/\./g, '')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    
    if (!normalized) {
      normalized = query.toLowerCase().replace(/[^a-z0-9]/g, '');
    }
    return normalized;
  }

  /**
   * Génère plusieurs variantes de recherche à partir d'une requête
   */
  private generateSearchVariants(query: string): string[] {
    const variants: string[] = [];
    const normalized = this.normalizeForFileSearch(query);
    
    variants.push(normalized);
    
    if (query.toLowerCase() !== normalized) {
      variants.push(query.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
    
    variants.push(normalized.replace(/_/g, ''));
    variants.push(normalized.replace(/_/g, ' '));
    variants.push(normalized.replace(/_/g, '-'));
    
    return [...new Set(variants)];
  }

  /**
   * Calcule la distance de Levenshtein entre deux chaînes
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + cost
        );
      }
    }
    
    return matrix[b.length][a.length];
  }

  private extractSearchTerms(query: string): string[] {
    const stopWords = new Set([
      'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'en', 'dans',
      'pour', 'par', 'avec', 'sans', 'sur', 'sous', 'est', 'sont',
      'donne', 'moi', 'qui', 'est', 'quoi', 'des', 'information',
      'generalitees', 'generalites', 'contenu', 'fichier', 'decrit'
    ]);
    const normalized = this.normalizeString(query, false);
    return normalized.split(/\s+/).filter(word => word.length > 2 && !stopWords.has(word));
  }

  private async determineZone(query: string, _terms: string[]): Promise<string | null> {
    const normalizedQuery = this.normalizeString(query);
    for (const zone of KNOWN_ZONES) {
      if (normalizedQuery.includes(this.normalizeString(zone))) {
        console.log(`[NOMINAL-SEARCH] 🎯 Zone explicite: ${zone}`);
        return zone;
      }
    }
    const implicitZone = await implicitMappingService.findZoneForQuery(query);
    if (implicitZone && implicitZone.confidence > 0.4) {
      console.log(`[NOMINAL-SEARCH] 🎯 Zone implicite: ${implicitZone.zone}`);
      return implicitZone.zone;
    }
    return 'SHARED';
  }

  private partialMatch(str1: string, str2: string): boolean {
    if (str1.length < 3 || str2.length < 3) return false;
    for (let i = 0; i <= str1.length - 3; i++) {
      if (str2.includes(str1.substring(i, i + 3))) return true;
    }
    for (let i = 0; i <= str2.length - 3; i++) {
      if (str1.includes(str2.substring(i, i + 3))) return true;
    }
    return false;
  }

  private getNormalizedScoreAndQuality(score: number, penalty: number): { normalizedScore: number; quality: 'perfect' | 'high' | 'medium' | 'low' } {
    let normalizedScore = score / 10;
    if (penalty > 0) normalizedScore = Math.max(0, normalizedScore - (penalty / 2));
    let quality: 'perfect' | 'high' | 'medium' | 'low';
    if (normalizedScore >= 0.95) quality = 'perfect';
    else if (normalizedScore >= 0.8) quality = 'high';
    else if (normalizedScore >= 0.6) quality = 'medium';
    else quality = 'low';
    return { normalizedScore, quality };
  }

  // ============================================================================
  // CALCUL DU SCORE AVEC ANALYSE SÉMANTIQUE
  // ============================================================================

  private calculateScoreWithSemantic(
    terms: string[], 
    filename: string, 
    originalQuery: string
  ): { 
    score: number; 
    matchedTerms: string[]; 
    penalty: number; 
    bonus: number; 
    typoMatch: boolean; 
    semanticBonus: number;
    semanticAnalysis?: SemanticAnalysis;
    details: SearchDetails 
  } {
    // 1. Calcul du score de base (identique)
    const baseResult = this.calculateScoreBase(terms, filename, originalQuery);
    
    // 2. 🔥 ANALYSE SÉMANTIQUE DU NOM DE FICHIER
    const semantic = filenameAnalyzer.analyze(filename);
    let semanticBonus = 0;
    let semanticRelevanceScore = 0;
    
    // Calcul du score de pertinence sémantique par rapport à la requête
    const relevance = filenameAnalyzer.calculateRelevance(filename, originalQuery);
    semanticRelevanceScore = relevance / 100; // Normalisé entre 0 et 1
    
    // Bonus basé sur la pertinence sémantique
    if (semanticRelevanceScore >= 0.8) {
      semanticBonus = 25;
      console.log(`   ├─ 🔥 BONUS sémantique HAUT: fichier très pertinent (${(semanticRelevanceScore * 100).toFixed(0)}%) → +25`);
    } else if (semanticRelevanceScore >= 0.6) {
      semanticBonus = 15;
      console.log(`   ├─ 🔥 BONUS sémantique MOYEN: fichier pertinent (${(semanticRelevanceScore * 100).toFixed(0)}%) → +15`);
    } else if (semanticRelevanceScore >= 0.4) {
      semanticBonus = 8;
      console.log(`   ├─ 🔥 BONUS sémantique FAIBLE: fichier partiellement pertinent (${(semanticRelevanceScore * 100).toFixed(0)}%) → +8`);
    }
    
    // Bonus supplémentaire si le type de fichier correspond à la requête
    if (semantic.components.type !== 'general') {
      const queryLower = originalQuery.toLowerCase();
      if (queryLower.includes(semantic.components.type)) {
        semanticBonus += 10;
        console.log(`   ├─ 🔥 BONUS type correspondant: "${semantic.components.type}" → +10`);
      }
    }
    
    // Bonus si l'équipement correspond
    if (semantic.components.equipment) {
      const queryLower = originalQuery.toLowerCase();
      if (queryLower.includes(semantic.components.equipment.toLowerCase())) {
        semanticBonus += 15;
        console.log(`   ├─ 🔥 BONUS équipement correspondant: "${semantic.components.equipment}" → +15`);
      }
    }
    
    const totalScore = baseResult.score + semanticBonus;
    const finalScore = Math.min(10, Math.max(0, totalScore));
    
    console.log(`   ├─ Score sémantique: +${semanticBonus}`);
    console.log(`   └─ 🎯 Score final: ${finalScore.toFixed(1)}/10 (base: ${baseResult.score.toFixed(1)} + sémantique: ${semanticBonus})`);
    
    return {
      score: finalScore,
      matchedTerms: baseResult.matchedTerms,
      penalty: baseResult.penalty,
      bonus: baseResult.bonus + semanticBonus,
      typoMatch: baseResult.typoMatch,
      semanticBonus,
      semanticAnalysis: {
        fileType: semantic.components.type,
        action: semantic.components.action,
        equipment: semantic.components.equipment,
        confidence: semantic.confidence,
        relevanceScore: semanticRelevanceScore
      },
      details: { ...baseResult.details, semanticBonus }
    };
  }

  private calculateScoreBase(
    terms: string[], 
    filename: string, 
    originalQuery: string
  ): { score: number; matchedTerms: string[]; penalty: number; bonus: number; typoMatch: boolean; details: SearchDetails } {
    const normalizedFilename = this.normalizeFilename(filename);
    const normalizedTerms = terms.map(t => this.normalizeString(t));
    
    let totalScore = 0;
    const matchedTerms: string[] = [];
    let penalty = 0;
    let bonus = 0;
    let typoMatch = false;
    
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`📊 [SCORE] Calcul pour: ${filename}`);
    console.log(`   ├─ Nom normalisé: "${normalizedFilename}"`);
    console.log(`   └─ Termes: ${terms.join(', ')}`);
    
    // SCORE DE BASE
    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      const normalizedTerm = normalizedTerms[i];
      
      if (normalizedFilename === normalizedTerm) {
        totalScore += 10;
        matchedTerms.push(term);
        console.log(`   ├─ Match exact: "${term}" → +10`);
      }
      else if (normalizedFilename.includes(normalizedTerm)) {
        totalScore += 8;
        matchedTerms.push(term);
        console.log(`   ├─ Contient terme: "${term}" → +8`);
      }
      else {
        // Tolérance aux fautes de frappe
        const filenameWords = normalizedFilename.split(/[\s_]+/);
        let bestTypoScore = 0;
        let bestMatchedWord = '';
        
        for (const fileWord of filenameWords) {
          if (fileWord.length < 3) continue;
          
          const distance = this.levenshteinDistance(normalizedTerm, fileWord);
          const maxLen = Math.max(normalizedTerm.length, fileWord.length);
          const similarity = 1 - (distance / maxLen);
          
          if (similarity > 0.7 && similarity < 1) {
            const typoBonus = Math.floor(6 * similarity);
            if (typoBonus > bestTypoScore) {
              bestTypoScore = typoBonus;
              bestMatchedWord = fileWord;
            }
          }
        }
        
        if (bestTypoScore > 0) {
          totalScore += bestTypoScore;
          matchedTerms.push(term);
          typoMatch = true;
          console.log(`   ├─ 🔥 Tolérance faute: "${term}" ≈ "${bestMatchedWord}" → +${bestTypoScore}`);
        }
        else if (this.partialMatch(normalizedFilename, normalizedTerm)) {
          totalScore += 5;
          matchedTerms.push(term);
          console.log(`   ├─ Match partiel: "${term}" → +5`);
        }
        else {
          const nameParts = normalizedFilename.split(/[\s_]+/);
          for (const part of nameParts) {
            if (part.length > 2 && (part === normalizedTerm || normalizedTerm.includes(part) || part.includes(normalizedTerm))) {
              totalScore += 4;
              if (!matchedTerms.includes(term)) matchedTerms.push(term);
              console.log(`   ├─ Match composé: "${term}" ≈ "${part}" → +4`);
              break;
            }
          }
        }
      }
    }
    
    console.log(`   ├─ Score de base: ${totalScore}`);
    
    // BONUS REQUÊTE ORIGINALE
    const originalTerms = this.extractSearchTerms(originalQuery);
    let originalMatchCount = 0;
    for (const term of originalTerms) {
      const normalizedTerm = this.normalizeString(term);
      if (normalizedFilename.includes(normalizedTerm)) {
        originalMatchCount++;
      }
    }
    
    if (originalMatchCount === originalTerms.length && originalTerms.length > 0) {
      bonus = 15;
      totalScore += bonus;
      console.log(`   ├─ 🔥 BONUS requête originale: +${bonus} (tous les termes trouvés)`);
    } else if (originalMatchCount > 0) {
      bonus = Math.floor(15 * (originalMatchCount / originalTerms.length));
      totalScore += bonus;
      console.log(`   ├─ 🔥 BONUS partiel requête originale: +${bonus} (${originalMatchCount}/${originalTerms.length} termes)`);
    }
    
    if (typoMatch && !matchedTerms.length) {
      totalScore += 3;
      console.log(`   ├─ 🔥 BONUS tolérance faute: +3`);
    }
    
    // PÉNALITÉ EXCLUSION
    const queryLower = originalQuery.toLowerCase();
    for (const [term, excludes] of Object.entries(EXCLUSION_RULES)) {
      if (queryLower.includes(term)) {
        for (const exclude of excludes) {
          if (normalizedFilename.includes(exclude)) {
            penalty = 0.5;
            console.log(`   ├─ ⚠️ PÉNALITÉ exclusion: "${term}" exclut "${exclude}" → -50%`);
            break;
          }
        }
      }
    }
    
    let finalScore = totalScore;
    if (penalty > 0) {
      finalScore = totalScore * (1 - penalty);
      console.log(`   ├─ Score après pénalité: ${finalScore.toFixed(1)}`);
    }
    
    finalScore = Math.min(10, Math.max(0, finalScore));
    console.log(`   └─ 🎯 Score final (base): ${finalScore.toFixed(1)}/10`);
    
    return {
      score: finalScore,
      matchedTerms,
      penalty,
      bonus,
      typoMatch,
      details: { baseScore: totalScore - bonus, bonusOriginal: bonus, penaltyExclusion: penalty, finalScore, typoMatch }
    };
  }

  // ============================================================================
  // SCAN DIRECTORY
  // ============================================================================

  private async scanDirectory(
    dirPath: string,
    terms: string[],
    query: string,
    zone: string,
    recursive: boolean,
    useSemanticAnalysis: boolean
  ): Promise<Array<{ 
    filePath: string; 
    score: number; 
    bonus: number; 
    penalty: number; 
    matchedTerms: string[]; 
    zone: string; 
    typoMatch: boolean; 
    semanticBonus?: number;
    semanticAnalysis?: SemanticAnalysis;
    details: SearchDetails 
  }>> {
    const results: Array<{ 
      filePath: string; 
      score: number; 
      bonus: number; 
      penalty: number; 
      matchedTerms: string[]; 
      zone: string; 
      typoMatch: boolean; 
      semanticBonus?: number;
      semanticAnalysis?: any;
      details: any 
    }> = [];
    
    if (!fs.existsSync(dirPath)) return results;
    
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && recursive) {
        const subResults = await this.scanDirectory(fullPath, terms, query, zone, recursive, useSemanticAnalysis);
        results.push(...subResults);
      } else if (entry.isFile()) {
        let result;
        if (useSemanticAnalysis) {
          result = this.calculateScoreWithSemantic(terms, entry.name, query);
        } else {
          const baseResult = this.calculateScoreBase(terms, entry.name, query);
          result = { ...baseResult, semanticBonus: 0, semanticAnalysis: undefined };
        }
        
        if (result.score >= 5) {
          results.push({ 
            filePath: fullPath, 
            score: result.score, 
            bonus: result.bonus, 
            penalty: result.penalty, 
            matchedTerms: result.matchedTerms, 
            zone, 
            typoMatch: result.typoMatch,
            semanticBonus: result.semanticBonus,
            semanticAnalysis: result.semanticAnalysis,
            details: result.details 
          });
        }
      }
    }
    return results;
  }

  // ============================================================================
  // RECHERCHE PRINCIPALE
  // ============================================================================

  async search(query: string, options: NominalSearchOptions = {}): Promise<NominalSearchResult> {
    await this.initialize();
    
    const basePath = options.basePath || DEFAULT_BASE_PATH;
    const recursive = options.recursive !== false;
    const useSemanticAnalysis = options.useSemanticAnalysis !== false;
    
    // Générer les variantes de recherche
    const searchVariants = this.generateSearchVariants(query);
    const primaryNormalized = searchVariants[0];
    
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🔍 [NOMINAL-SEARCH] RECHERCHE PAR NOM DE FICHIER`);
    console.log(`📝 Requête originale: "${query}"`);
    if (useSemanticAnalysis) {
      console.log(`🧠 Analyse sémantique: ACTIVÉE`);
    }
    console.log(`📝 Variantes de recherche:`);
    searchVariants.forEach((v, i) => console.log(`   ${i+1}. "${v}"`));
    console.log(`${'─'.repeat(70)}`);
    
    const terms = this.extractSearchTerms(primaryNormalized);
    console.log(`📝 Termes extraits: ${terms.join(', ')}`);
    
    const targetZone = await this.determineZone(primaryNormalized, terms);
    console.log(`🎯 Zone cible: ${targetZone || 'auto (scan global)'}`);
    
    let allMatches: Array<{
      filePath: string;
      score: number;
      bonus: number;
      penalty: number;
      matchedTerms: string[];
      zone: string;
      typoMatch: boolean;
      semanticBonus?: number;
      semanticAnalysis?: any;
      variant: string;
      details: any;
    }> = [];
    
    const zonesToScan = targetZone ? [targetZone] : KNOWN_ZONES;
    
    for (const zone of zonesToScan) {
      const zonePath = path.join(basePath, zone);
      if (!fs.existsSync(zonePath)) continue;
      
      for (const variant of searchVariants) {
        const variantTerms = this.extractSearchTerms(variant);
        if (variantTerms.length === 0) continue;
        
        const matches = await this.scanDirectory(zonePath, variantTerms, variant, zone, recursive, useSemanticAnalysis);
        for (const match of matches) {
          (match as any).variant = variant;
          allMatches.push(match as any);
        }
      }
    }
    
    // Déduplication par chemin (garder le meilleur score)
    const uniqueMatches = new Map<string, typeof allMatches[0]>();
    for (const match of allMatches) {
      const existing = uniqueMatches.get(match.filePath);
      if (!existing || match.score > existing.score) {
        uniqueMatches.set(match.filePath, match);
      }
    }
    
    const finalMatches = Array.from(uniqueMatches.values());
    finalMatches.sort((a, b) => {
      if (a.bonus !== b.bonus) return b.bonus - a.bonus;
      return b.score - a.score;
    });
    
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📊 [NOMINAL-SEARCH] RÉSULTATS DU SCAN`);
    console.log(`   ├─ Fichiers trouvés: ${finalMatches.length}`);
    if (finalMatches.length > 0) {
      console.log(`   └─ Top 3 résultats:`);
      for (let i = 0; i < Math.min(finalMatches.length, 3); i++) {
        const m = finalMatches[i];
        console.log(`      ${i+1}. ${path.basename(m.filePath)} - score: ${m.score.toFixed(1)}/10 (bonus: +${m.bonus}, sémantique: +${m.semanticBonus || 0}, faute: ${m.typoMatch ? 'oui' : 'non'})`);
      }
    }
    console.log(`${'─'.repeat(70)}`);
    
    if (finalMatches.length === 0) {
      console.log(`❌ [NOMINAL-SEARCH] Aucun fichier trouvé`);
      return {
        found: false,
        score: 0,
        normalizedScore: 0,
        matchedTerms: [],
        zone: targetZone || 'unknown',
        mode: 'exact',
        matchQuality: 'low'
      };
    }
    
    const bestMatch = finalMatches[0];
    let mode: 'exact' | 'partial' | 'implicit' | 'semantic' = bestMatch.score >= 9 ? 'exact' : (bestMatch.score >= 7 ? 'partial' : 'implicit');
    if (useSemanticAnalysis && bestMatch.semanticBonus && bestMatch.semanticBonus > 0) {
      mode = 'semantic';
    }
    const { normalizedScore, quality } = this.getNormalizedScoreAndQuality(bestMatch.score, bestMatch.penalty);
    
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🏆 [NOMINAL-SEARCH] MEILLEUR RÉSULTAT`);
    console.log(`   ├─ Fichier: ${path.basename(bestMatch.filePath)}`);
    console.log(`   ├─ Score: ${bestMatch.score.toFixed(1)}/10`);
    console.log(`   ├─ Score normalisé: ${normalizedScore.toFixed(2)}`);
    console.log(`   ├─ Qualité: ${quality.toUpperCase()}`);
    console.log(`   ├─ Mode: ${mode}`);
    console.log(`   ├─ Bonus requête originale: +${bestMatch.bonus - (bestMatch.semanticBonus || 0)}`);
    if (bestMatch.semanticBonus) {
      console.log(`   ├─ Bonus sémantique: +${bestMatch.semanticBonus}`);
    }
    console.log(`   ├─ Faute de frappe détectée: ${bestMatch.typoMatch ? '✅ oui' : '❌ non'}`);
    console.log(`   ├─ Variante matchée: "${(bestMatch as any).variant || 'N/A'}"`);
    console.log(`   ├─ Termes matchés: ${bestMatch.matchedTerms.join(', ')}`);
    if (bestMatch.semanticAnalysis) {
      console.log(`   ├─ Analyse sémantique:`);
      console.log(`   │    ├─ Type: ${bestMatch.semanticAnalysis.fileType}`);
      if (bestMatch.semanticAnalysis.action) console.log(`   │    ├─ Action: ${bestMatch.semanticAnalysis.action}`);
      if (bestMatch.semanticAnalysis.equipment) console.log(`   │    ├─ Équipement: ${bestMatch.semanticAnalysis.equipment}`);
      console.log(`   │    └─ Confiance: ${(bestMatch.semanticAnalysis.confidence * 100).toFixed(0)}%`);
    }
    console.log(`   └─ Zone: ${bestMatch.zone}`);
    console.log(`${'═'.repeat(70)}\n`);
    
    let content: string | undefined;
    try {
      content = fs.readFileSync(bestMatch.filePath, 'utf-8');
      console.log(`[NOMINAL-SEARCH] 📄 Contenu chargé: ${content ? content.length : 0} caractères`);
    } catch (error) {
      console.error(`[NOMINAL-SEARCH] ❌ Erreur lecture:`, error);
    }
    
    return {
      found: true,
      filePath: bestMatch.filePath,
      content,
      score: bestMatch.score,
      normalizedScore,
      matchedTerms: bestMatch.matchedTerms,
      zone: bestMatch.zone,
      mode,
      matchQuality: quality,
      semanticAnalysis: bestMatch.semanticAnalysis,
      details: bestMatch.details
    };
  }

  async enrichImplicitMapping(query: string, result: NominalSearchResult): Promise<void> {
    if (!result.found) return;
    const terms = this.extractSearchTerms(query);
    for (const term of terms) {
      await implicitMappingService.addOrUpdateMapping(term, result.zone, query);
    }
    console.log(`[NOMINAL-SEARCH] 📚 Table implicite enrichie: ${terms.length} termes → ${result.zone}`);
  }
}

export const nominalSearchService = NominalSearchService.getInstance();