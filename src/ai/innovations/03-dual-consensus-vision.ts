/**
 * Innovation 3 : Double Consensus Vision
 * 
 * Principe : Utiliser deux modèles de vision différents pour lire les plaques
 * signalétiques et étiquettes. Un algorithme de consensus valide les résultats.
 * Si les deux modèles concordent, la confiance est élevée (>95%).
 * 
 * VERSION MIGRÉE : Persistance SQLite via Core SQLite
 * 
 * @module innovations/dual-consensus-vision
 * @version 3.0.0 - SQLite Persistence
 */

import { DualConsensusResult } from './types';
import { getSQLiteCore } from '../core/sqlite/manager';
import type { InnovationAnalysis } from '../core/sqlite/types';
import { smartRouter } from '../router/smart-router';
import { callOllama } from '../providers/ollama-client';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
  enabled: true,
  model1: 'ccp-finetuned:latest',
  model2: 'gemma2:2b',
  consensusThreshold: 0.8,
};

// ============================================================================
// FONCTIONS DE CONSENSUS
// ============================================================================

/**
 * Calcule la similarité entre deux chaînes (Levenshtein normalisé)
 */
function stringSimilarity(str1: string, str2: string): number {
  if (!str1 && !str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  
  const matrix: number[][] = [];
  
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[s1.length][s2.length];
  const maxLen = Math.max(s1.length, s2.length);
  
  return maxLen === 0 ? 1.0 : 1 - distance / maxLen;
}

/**
 * Calcule le consensus entre les résultats des deux modèles
 */
function computeConsensus(
  result1: Record<string, unknown>,
  result2: Record<string, unknown>,
  confidence1: number,
  confidence2: number
): DualConsensusResult {
  const fields1 = (result1.fields as Record<string, unknown>) || {};
  const fields2 = (result2.fields as Record<string, unknown>) || {};
  
  const allFields = new Set([...Object.keys(fields1), ...Object.keys(fields2)]);
  
  const validatedFields: Record<string, string> = {};
  const conflictingFields: Record<string, { model1: string; model2: string }> = {};
  
  let totalSimilarity = 0;
  let comparedFields = 0;
  
  for (const field of allFields) {
    const val1 = (fields1[field] || '').toString();
    const val2 = (fields2[field] || '').toString();
    
    if (val1 && val2) {
      const similarity = stringSimilarity(val1, val2);
      totalSimilarity += similarity;
      comparedFields++;
      
      if (similarity >= 0.8) {
        validatedFields[field] = val1.length > val2.length ? val1 : val2;
      } else {
        conflictingFields[field] = { model1: val1, model2: val2 };
      }
    } else if (val1) {
      conflictingFields[field] = { model1: val1, model2: '(non détecté)' };
    } else if (val2) {
      conflictingFields[field] = { model1: '(non détecté)', model2: val2 };
    }
  }
  
  const fieldSimilarity = comparedFields > 0 ? totalSimilarity / comparedFields : 0;
  const avgConfidence = (confidence1 + confidence2) / 2;
  const overallConfidence = (fieldSimilarity * 0.6 + avgConfidence * 0.4);
  
  let consensus: 'full' | 'partial' | 'conflict';
  if (Object.keys(conflictingFields).length === 0 && comparedFields > 0) {
    consensus = 'full';
  } else if (Object.keys(validatedFields).length > 0) {
    consensus = 'partial';
  } else {
    consensus = 'conflict';
  }
  
  const textParts: string[] = [];
  for (const [field, value] of Object.entries(validatedFields)) {
    textParts.push(`${field}: ${value}`);
  }
  
  return {
    text: textParts.join(' | ') || 'Aucune information validée',
    confidence: overallConfidence,
    consensus,
    model1Result: JSON.stringify(result1),
    model2Result: JSON.stringify(result2),
    model1Confidence: confidence1,
    model2Confidence: confidence2,
    validatedFields,
    conflictingFields,
  };
}

// ============================================================================
// CLASSE PRINCIPALE (MIGRÉE SQLite)
// ============================================================================

export class DualConsensusVision {
  private config = DEFAULT_CONFIG;
  private db = getSQLiteCore();
  private cache: Array<{ timestamp: string; consensus: DualConsensusResult }> = [];

  constructor() {
    console.log('[DualConsensus] ✅ Service initialisé (mode SQLite)');
    this.loadHistoryFromSQLite();
  }

  /**
   * Charge l'historique depuis SQLite
   */
  private async loadHistoryFromSQLite(): Promise<void> {
    try {
      const history = this.db.innovations?.getAnalysisHistory?.('dual_consensus', 100) || [];
      
      this.cache = history.map((h: InnovationAnalysis) => ({
        timestamp: h.createdAt ? new Date(h.createdAt).toISOString() : new Date().toISOString(),
        consensus: (h.analysisData as Record<string, unknown>)?.consensus as DualConsensusResult || {
          text: '',
          confidence: 0,
          consensus: 'conflict',
          model1Result: '',
          model2Result: '',
          model1Confidence: 0,
          model2Confidence: 0,
          validatedFields: {},
          conflictingFields: {}
        }
      }));
      
      console.log(`[DualConsensus] ✅ ${this.cache.length} lectures chargées depuis SQLite`);
    } catch (error) {
      console.error('[DualConsensus] Erreur chargement SQLite:', error);
    }
  }

  /**
   * Sauvegarde un résultat de consensus dans SQLite
   */
  private async saveConsensusToSQLite(consensus: DualConsensusResult): Promise<void> {
    try {
      this.db.innovations?.saveAnalysis?.({
        id: `dual_consensus_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        innovationType: 'dual_consensus',
        analysisData: {
          consensus: consensus.consensus,
          confidence: consensus.confidence,
          text: consensus.text,
          validatedFields: consensus.validatedFields,
          conflictingFields: consensus.conflictingFields
        },
        detectedElements: Object.keys(consensus.validatedFields).map(field => ({
          type: 'field',
          label: field,
          value: consensus.validatedFields[field],
          confidence: consensus.confidence
        })),
        suggestedActions: consensus.consensus === 'conflict' ? ['Vérifier manuellement', 'Prendre une meilleure photo'] : []
      });
      
      // Enregistrer les métriques
      await this.db.recordMetric('dual_consensus', 'reading_count', 1);
      await this.db.recordMetric('dual_consensus', 'confidence', consensus.confidence);
      
      if (consensus.consensus === 'full') {
        await this.db.recordMetric('dual_consensus', 'full_consensus', 1);
      } else if (consensus.consensus === 'partial') {
        await this.db.recordMetric('dual_consensus', 'partial_consensus', 1);
      } else {
        await this.db.recordMetric('dual_consensus', 'conflict', 1);
      }
    } catch (error) {
      console.error('[DualConsensus] Erreur sauvegarde SQLite:', error);
    }
  }


  /**
   * Extrait le JSON d'une réponse qui peut contenir du texte supplémentaire
   */
  private extractJSON(response: string): Record<string, unknown> | null {
    try {
      return JSON.parse(response);
    } catch {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /**
   * Analyse une image de plaque signalétique via deux modèles IA en parallèle
   */
  async readPlate(
    imageBuffer: Buffer,
    options?: { customPrompt?: string; timeout?: number }
  ): Promise<DualConsensusResult> {
    console.log('[DualConsensus] 🔍 Lecture de plaque par double consensus IA...');
    
    const prompt = options?.customPrompt || `Tu es un expert en lecture de plaques signalétiques industrielles.
Extraie les informations suivantes de l'image si elles sont présentes :
- Marque/Fabricant
- Modèle/Type
- Numéro de série (S/N)
- Année de fabrication
- Puissance/Voltage/Pression (selon l'équipement)

Réponds UNIQUEMENT au format JSON strict :
{
  "fields": {
    "fabricant": "...",
    "modele": "...",
    "sn": "...",
    "annee": "...",
    "spec": "..."
  },
  "confidence": 0.0-1.0
}`;

    const base64Image = imageBuffer.toString('base64');

    try {
      // Exécution en parallèle des deux modèles
      console.log('[DualConsensus] 🚀 Lancement des modèles (Modèle 1: Gemini, Modèle 2: Ollama/Llava)');
      
      const [response1, response2] = await Promise.all([
        // Modèle 1 : Gemini 1.5 Flash (via SmartRouter)
        smartRouter.callVisionLLM(prompt, imageBuffer, { temperature: 0.1 }),
        
        // Modèle 2 : Ollama (Llava ou fallback technique)
        callOllama(prompt, { 
          model: 'llava:latest', 
          images: [base64Image],
          temperature: 0.1
        }).catch(err => {
          console.warn('[DualConsensus] ⚠️ Échec Modèle 2 (Ollama):', err.message);
          return JSON.stringify({ fields: {}, confidence: 0 });
        })
      ]);

      // Extraire les résultats
      const parsed1 = this.extractJSON(response1) || { fields: {}, confidence: 0.1 };
      const parsed2 = this.extractJSON(response2) || { fields: {}, confidence: 0.1 };
      
      const confidence1 = Number(parsed1.confidence) || 0.5;
      const confidence2 = Number(parsed2.confidence) || 0.5;
      
      const consensus = computeConsensus(parsed1, parsed2, confidence1, confidence2);
      
      // Sauvegarder dans SQLite et cache mémoire
      this.cache.unshift({
        timestamp: new Date().toISOString(),
        consensus,
      });
      
      if (this.cache.length > 200) {
        this.cache.pop();
      }
      
      await this.saveConsensusToSQLite(consensus);
      
      console.log(`[DualConsensus] ✅ Consensus: ${consensus.consensus} (${(consensus.confidence * 100).toFixed(0)}%)`);
      
      return consensus;
      
    } catch (error) {
      console.error('[DualConsensus] Erreur lecture:', error);
      
      // Fallback en cas d'erreur
      return {
        text: 'Erreur technique lors de la lecture',
        confidence: 0,
        consensus: 'conflict',
        model1Result: '',
        model2Result: '',
        model1Confidence: 0,
        model2Confidence: 0,
        validatedFields: {},
        conflictingFields: {},
      };
    }
  }

  /**
   * Lit une plaque et retourne uniquement les champs validés
   */
  async readPlateValidated(
    imageBuffer: Buffer,
    options?: { customPrompt?: string; timeout?: number }
  ): Promise<Record<string, string>> {
    const result = await this.readPlate(imageBuffer, options);
    return result.validatedFields;
  }

  /**
   * Vérifie si une valeur spécifique est présente et validée
   */
  async verifyField(
    imageBuffer: Buffer,
    fieldName: string,
    expectedValue?: string
  ): Promise<{
    found: boolean;
    value: string | null;
    matches: boolean;
    confidence: number;
  }> {
    const result = await this.readPlate(imageBuffer);
    
    const value = result.validatedFields[fieldName] || null;
    const found = value !== null;
    
    let matches = false;
    if (found && expectedValue) {
      matches = stringSimilarity(value!, expectedValue) >= 0.8;
    }
    
    // Enregistrer la vérification
    if (expectedValue) {
      await this.db.recordMetric('dual_consensus', 'field_verification', matches ? 1 : 0);
    }
    
    return {
      found,
      value,
      matches,
      confidence: result.confidence,
    };
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(updates: Partial<typeof DEFAULT_CONFIG>): void {
    this.config = { ...this.config, ...updates };
    console.log('[DualConsensus] Configuration mise à jour');
  }

  /**
   * Obtient les statistiques de consensus (depuis SQLite)
   */
  async getStats(): Promise<{
    totalReadings: number;
    fullConsensus: number;
    partialConsensus: number;
    conflict: number;
    averageConfidence: number;
  }> {
    try {
      const stats = this.db.getDB().prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN json_extract(analysis_data, '$.consensus') = 'full' THEN 1 ELSE 0 END) as full,
          SUM(CASE WHEN json_extract(analysis_data, '$.consensus') = 'partial' THEN 1 ELSE 0 END) as partial,
          SUM(CASE WHEN json_extract(analysis_data, '$.consensus') = 'conflict' THEN 1 ELSE 0 END) as conflict,
          AVG(json_extract(analysis_data, '$.confidence')) as avg_conf
        FROM innovation_analysis_history 
        WHERE innovation_type = 'dual_consensus'
      `).get() as Record<string, number> | undefined;
      
      return {
        totalReadings: stats?.total || 0,
        fullConsensus: stats?.full || 0,
        partialConsensus: stats?.partial || 0,
        conflict: stats?.conflict || 0,
        averageConfidence: stats?.avg_conf || 0,
      };
    } catch (error) {
      console.error('[DualConsensus] Erreur stats:', error);
      // Fallback sur cache mémoire
      const total = this.cache.length;
      let fullConsensus = 0, partialConsensus = 0, conflict = 0, totalConfidence = 0;
      
      for (const entry of this.cache) {
        switch (entry.consensus.consensus) {
          case 'full': fullConsensus++; break;
          case 'partial': partialConsensus++; break;
          case 'conflict': conflict++; break;
        }
        totalConfidence += entry.consensus.confidence;
      }
      
      return {
        totalReadings: total,
        fullConsensus,
        partialConsensus,
        conflict,
        averageConfidence: total > 0 ? totalConfidence / total : 0,
      };
    }
  }

  /**
   * Nettoie l'historique ancien dans SQLite
   */
  async cleanupHistory(keepDays: number = 30): Promise<number> {
    const cutoff = Date.now() - (keepDays * 24 * 60 * 60 * 1000);
    
    try {
      const result = this.db.getDB().prepare(`
        DELETE FROM innovation_analysis_history 
        WHERE innovation_type = 'dual_consensus' AND created_at < ?
      `).run(cutoff);
      
      // Rafraîchir le cache
      this.cache = [];
      await this.loadHistoryFromSQLite();
      
      const deleted = result.changes;
      console.log(`[DualConsensus] Nettoyage SQLite : ${deleted} entrées supprimées`);
      
      return deleted;
    } catch (error) {
      console.error('[DualConsensus] Erreur nettoyage:', error);
      return 0;
    }
  }

  /**
   * Obtient l'historique complet depuis SQLite
   */
  async getFullHistory(limit: number = 100): Promise<Array<{ timestamp: string; consensus: DualConsensusResult }>> {
    const history = this.db.innovations?.getAnalysisHistory?.('dual_consensus', limit) || [];
    return history.map((h: InnovationAnalysis) => ({
      timestamp: h.createdAt ? new Date(h.createdAt).toISOString() : new Date().toISOString(),
      consensus: (h.analysisData as Record<string, unknown>)?.consensus as DualConsensusResult || {
        text: '',
        confidence: 0,
        consensus: 'conflict',
        model1Result: '',
        model2Result: '',
        model1Confidence: 0,
        model2Confidence: 0,
        validatedFields: {},
        conflictingFields: {}
      }
    }));
  }

  /**
   * Rafraîchit le cache depuis SQLite
   */
  async refreshCache(): Promise<void> {
    this.cache = [];
    await this.loadHistoryFromSQLite();
  }
}

// Export singleton
export const dualConsensusVision = new DualConsensusVision();