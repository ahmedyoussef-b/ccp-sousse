/**
 * @fileOverview ChunkValidator - Validation sémantique des chunks avant indexation
 * @version 1.0.0
 */

export interface ChunkValidationResult {
  chunkId: string;
  originalContent: string;
  chunkContent: string;
  similarityScore: number;
  isValid: boolean;
  warnings: string[];
  metadata: {
    originalLength: number;
    chunkLength: number;
    compressionRatio: number;
    keyTermsFound: string[];
    keyTermsMissing: string[];
  };
}

export interface ChunkValidationProgress {
  totalChunks: number;
  processedChunks: number;
  currentChunkIndex: number;
  currentScore: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  results: ChunkValidationResult[];
}

class ChunkValidator {
  private similarityThreshold: number = 0.65;

  private extractKeyTerms(text: string): string[] {
    const stopWords = new Set([
      'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'en', 'dans',
      'pour', 'par', 'avec', 'sans', 'sur', 'sous', 'est', 'sont', 'a', 'ont',
      'et', 'ou', 'mais', 'donc', 'car', 'ce', 'cet', 'cette', 'ces', 'qui',
      'que', 'quoi', 'dont', 'où', 'lui', 'elle', 'nous', 'vous', 'ils', 'elles',
      'ceci', 'cela', 'celle', 'celui', 'ceux', 'celles'
    ]);

    const words = text
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, "")
      .split(/\s+/);

    return [...new Set(words.filter(w => w.length > 4 && !stopWords.has(w)))];
  }

  private countTechnicalTerms(text: string): number {
    const technicalTerms = [
      'turbine', 'gaz', 'pression', 'température', 'vibration', 'huile',
      'accouplement', 'alternateur', 'compresseur', 'lubrification', 'débit',
      'vanne', 'filtre', 'moteur', 'arbre', 'couple', 'rotor', 'bride',
      'purge', 'admission', 'refoulement', 'cavitation'
    ];
    const lowerText = text.toLowerCase();
    return technicalTerms.filter(term => lowerText.includes(term)).length;
  }

  public validateChunk(
    chunkContent: string,
    originalContent: string,
    chunkIndex: number
  ): ChunkValidationResult {
    const chunkKeyTerms = this.extractKeyTerms(chunkContent);
    const originalLower = originalContent.toLowerCase();
    const keyTermsFound: string[] = [];
    const keyTermsMissing: string[] = [];

    for (const term of chunkKeyTerms) {
      if (originalLower.includes(term)) {
        keyTermsFound.push(term);
      } else {
        keyTermsMissing.push(term);
      }
    }

    const termCoverage = keyTermsFound.length / Math.max(1, chunkKeyTerms.length);
    const compressionRatio = chunkContent.length / Math.max(1, originalContent.length);
    const isValidLength = chunkContent.length > 50 && compressionRatio > 0.01;

    let similarityScore = termCoverage;
    const technicalBonus = Math.min(0.2, this.countTechnicalTerms(chunkContent) * 0.05);
    similarityScore = Math.min(1, similarityScore + technicalBonus);

    if (!isValidLength) {
      similarityScore *= 0.5;
    }

    const isValid = similarityScore >= this.similarityThreshold;

    const warnings: string[] = [];
    if (keyTermsMissing.length > 0) {
      warnings.push(`Termes manquants: ${keyTermsMissing.slice(0, 3).join(', ')}${keyTermsMissing.length > 3 ? '...' : ''}`);
    }
    if (compressionRatio < 0.05) {
      warnings.push(`Chunk très compressé (${(compressionRatio * 100).toFixed(1)}% de l'original)`);
    }
    if (!isValidLength) {
      warnings.push(`Chunk trop court (${chunkContent.length} caractères)`);
    }

    return {
      chunkId: `chunk_${chunkIndex}_${Date.now()}`,
      originalContent: originalContent.substring(0, 500),
      chunkContent: chunkContent.substring(0, 500),
      similarityScore,
      isValid,
      warnings,
      metadata: {
        originalLength: originalContent.length,
        chunkLength: chunkContent.length,
        compressionRatio,
        keyTermsFound,
        keyTermsMissing
      }
    };
  }

  public async validateChunks(
    chunks: string[],
    originalContent: string,
    onProgress?: (progress: ChunkValidationProgress) => void
  ): Promise<ChunkValidationResult[]> {
    const results: ChunkValidationResult[] = [];
    const totalChunks = chunks.length;

    if (onProgress) {
      onProgress({
        totalChunks,
        processedChunks: 0,
        currentChunkIndex: -1,
        currentScore: 0,
        status: 'processing',
        results: []
      });
    }

    for (let i = 0; i < chunks.length; i++) {
      const result = this.validateChunk(chunks[i], originalContent, i);
      results.push(result);

      if (onProgress) {
        onProgress({
          totalChunks,
          processedChunks: i + 1,
          currentChunkIndex: i,
          currentScore: result.similarityScore,
          status: 'processing',
          results
        });
      }
    }

    if (onProgress) {
      onProgress({
        totalChunks,
        processedChunks: totalChunks,
        currentChunkIndex: totalChunks - 1,
        currentScore: results.reduce((sum, r) => sum + r.similarityScore, 0) / totalChunks,
        status: 'completed',
        results
      });
    }

    return results;
  }

  public generateReport(results: ChunkValidationResult[]): {
    totalChunks: number;
    validChunks: number;
    invalidChunks: number;
    averageScore: number;
    warnings: string[];
    recommendations: string[];
  } {
    const validChunks = results.filter(r => r.isValid).length;
    const invalidChunks = results.filter(r => !r.isValid).length;
    const averageScore = results.reduce((sum, r) => sum + r.similarityScore, 0) / results.length;

    const allWarnings = results.flatMap(r => r.warnings);
    const uniqueWarnings = [...new Set(allWarnings)];

    const recommendations: string[] = [];
    if (invalidChunks > 0) {
      recommendations.push(`${invalidChunks} chunk(s) invalide(s) à corriger`);
    }
    if (averageScore < 0.7) {
      recommendations.push('Score de similarité bas → ajuster le découpage des chunks');
    }
    if (uniqueWarnings.some(w => w.includes('Termes manquants'))) {
      recommendations.push('Des termes clés sont manquants → vérifier l\'extraction');
    }

    return {
      totalChunks: results.length,
      validChunks,
      invalidChunks,
      averageScore,
      warnings: uniqueWarnings.slice(0, 5),
      recommendations
    };
  }

  public setThreshold(threshold: number): void {
    this.similarityThreshold = Math.min(1, Math.max(0, threshold));
  }
}

export const chunkValidator = new ChunkValidator();