// src/ai/validation/context-validator.ts

export interface ValidationResult {
    relevanceScore: number;
    hasHallucinations: boolean;
    missingSources: string[];
    coverage: number;
}

export async function validateResponseAgainstContext(
    answer: string,
    context: string
): Promise<ValidationResult> {
    // Version simplifiée pour le développement
    const result: ValidationResult = {
        relevanceScore: 0.8,
        hasHallucinations: false,
        missingSources: [],
        coverage: 0.7
    };

    // Vérifications basiques
    if (!context || context.length === 0) {
        result.relevanceScore = 0.3;
        result.hasHallucinations = true;
        return result;
    }

    // Compter les mots du contexte présents dans la réponse
    const contextWords = new Set(context.toLowerCase().split(/\s+/));
    const answerWords = answer.toLowerCase().split(/\s+/);

    const matches = answerWords.filter(word =>
        word.length > 3 && contextWords.has(word)
    ).length;

    const matchRatio = matches / Math.max(answerWords.length, 1);
    result.relevanceScore = Math.min(0.5 + matchRatio * 0.5, 0.95);

    // Détection basique d'hallucination (si trop de mots hors contexte)
    if (matchRatio < 0.3) {
        result.hasHallucinations = true;
        result.relevanceScore *= 0.5;
    }

    return result;
}