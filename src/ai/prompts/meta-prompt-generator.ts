/**
 * @fileOverview Générateur de prompts méta pour l'IA
 * Permet d'adapter le prompt système selon le contexte utilisateur et la requête
 * @version 2.1.0
 * @lastUpdated 2026-04-02
 * @changes Ajout de logWarning manquant
 */

// ============================================================================
// CONFIGURATION DES LOGS
// ============================================================================

const LOG_PREFIX = '[META-PROMPT]';

function logInfo(step: string, message: string, data?: any): void {
  console.log(`${LOG_PREFIX} 📍 [${step}] ${message}`);
  if (data) {
    console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
  }
}

function logSuccess(step: string, message: string, data?: any): void {
  console.log(`${LOG_PREFIX} ✅ [${step}] ${message}`);
  if (data) {
    console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
  }
}

function logWarning(step: string, message: string, data?: any): void {
  console.warn(`${LOG_PREFIX} ⚠️ [${step}] ${message}`);
  if (data) {
    console.warn(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 200)}`);
  }
}


function logMetric(step: string, metric: string, value: any): void {
  console.log(`${LOG_PREFIX} 📈 [${step}] ${metric}: ${value}`);
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface MetaPromptOptions {
  userExpertise?: 'débutant' | 'intermédiaire' | 'expert';
  domain?: string;
  responseFormat?: 'détaillé' | 'concis' | 'technique' | 'pédagogique';
  strictness?: number;
  hasDocuments?: boolean;
  language?: 'fr' | 'en';
  includeCitations?: boolean;
  maxTokens?: number;
}

export interface GeneratedPrompt {
  content: string;
  metadata: {
    query: string;
    options: MetaPromptOptions;
    timestamp: number;
    length: number;
    sections: string[];
  };
}

export interface PromptTemplate {
  name: string;
  description: string;
  template: (options: MetaPromptOptions) => string;
}

// ============================================================================
// STATISTIQUES
// ============================================================================

interface PromptStats {
  totalGenerations: number;
  generationsByExpertise: Map<string, number>;
  generationsByFormat: Map<string, number>;
  generationsByDomain: Map<string, number>;
  avgPromptLength: number;
  totalPromptLength: number;
  lastGenerationTime: number | null;
  lastGenerationLength: number | null;
}

const stats: PromptStats = {
  totalGenerations: 0,
  generationsByExpertise: new Map(),
  generationsByFormat: new Map(),
  generationsByDomain: new Map(),
  avgPromptLength: 0,
  totalPromptLength: 0,
  lastGenerationTime: null,
  lastGenerationLength: null
};

// ============================================================================
// CONFIGURATION DES TEMPLATES
// ============================================================================

const EXPERTISE_LEVELS = {
  débutant: {
    name: 'Débutant',
    description: 'Expliquer simplement, éviter le jargon technique',
    instructions: 'Utilise un langage simple, évite le jargon technique. Explique les concepts de base.'
  },
  intermédiaire: {
    name: 'Intermédiaire',
    description: 'Niveau technique standard, supposer une connaissance de base',
    instructions: 'Utilise un vocabulaire technique approprié sans être trop complexe.'
  },
  expert: {
    name: 'Expert',
    description: 'Niveau technique avancé, détails précis et spécifications',
    instructions: 'Utilise un langage technique précis, inclut des détails et spécifications avancés.'
  }
};

const RESPONSE_FORMATS = {
  détaillé: {
    name: 'Détaillé',
    description: 'Réponse complète et structurée',
    instructions: 'Fournis une réponse complète, bien structurée avec des sections claires.'
  },
  concis: {
    name: 'Concis',
    description: 'Réponse courte et directe',
    instructions: 'Sois concis et direct. Va à l\'essentiel sans détails superflus.'
  },
  technique: {
    name: 'Technique',
    description: 'Format technique avec spécifications',
    instructions: 'Utilise un format technique avec spécifications, données précises et références.'
  },
  pédagogique: {
    name: 'Pédagogique',
    description: 'Format pédagogique avec explications',
    instructions: 'Adopte un ton pédagogique. Explique les concepts étape par étape.'
  }
};

const STRICTNESS_LEVELS = {
  strict: {
    threshold: 0.7,
    description: 'STRICT',
    instruction: 'Utilise UNIQUEMENT les informations du contexte. Ne pas extrapoler.'
  },
  balanced: {
    threshold: 0.3,
    description: 'ÉQUILIBRÉ',
    instruction: 'Utilise le contexte comme base, peut généraliser raisonnablement.'
  },
  creative: {
    threshold: 0,
    description: 'CRÉATIF',
    instruction: 'Peut utiliser ses connaissances générales en complément du contexte.'
  }
};

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function updateStats(
  expertise: string,
  format: string,
  domain: string,
  promptLength: number
): void {
  stats.totalGenerations++;
  stats.totalPromptLength += promptLength;
  stats.avgPromptLength = stats.totalPromptLength / stats.totalGenerations;
  stats.lastGenerationTime = Date.now();
  stats.lastGenerationLength = promptLength;
  
  const expertiseCount = stats.generationsByExpertise.get(expertise) || 0;
  stats.generationsByExpertise.set(expertise, expertiseCount + 1);
  
  const formatCount = stats.generationsByFormat.get(format) || 0;
  stats.generationsByFormat.set(format, formatCount + 1);
  
  const domainCount = stats.generationsByDomain.get(domain) || 0;
  stats.generationsByDomain.set(domain, domainCount + 1);
}

function getStrictnessLevel(strictness: number): { description: string; instruction: string } {
  if (strictness > 0.7) return STRICTNESS_LEVELS.strict;
  if (strictness > 0.3) return STRICTNESS_LEVELS.balanced;
  return STRICTNESS_LEVELS.creative;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================================
// GÉNÉRATION DU PROMPT
// ============================================================================

/**
 * Génère un prompt méta adapté au contexte utilisateur
 */
export function generateMetaPrompt(query: string, options: MetaPromptOptions = {}): string {
  const startTime = Date.now();
  
  const {
    userExpertise = 'intermédiaire',
    domain = 'général',
    responseFormat = 'détaillé',
    strictness = 0.7,
    hasDocuments = false,
    language = 'fr',
    includeCitations = true,
    maxTokens = 1000
  } = options;

  logInfo('GENERATE', `🎯 Génération de prompt pour: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);
  logMetric('GENERATE', 'Expertise', userExpertise);
  logMetric('GENERATE', 'Format', responseFormat);
  logMetric('GENERATE', 'Strictness', `${strictness * 100}%`);
  logMetric('GENERATE', 'Domaine', domain);

  // Récupérer les configurations
  const expertiseConfig = EXPERTISE_LEVELS[userExpertise];
  const formatConfig = RESPONSE_FORMATS[responseFormat];
  const strictnessConfig = getStrictnessLevel(strictness);

  // Construire le prompt
  const sections: string[] = [];

  // 1. IDENTITÉ ET RÔLE
  sections.push(`Tu es un assistant IA professionnel spécialisé dans l'analyse de documents techniques.

## IDENTITÉ
- Rôle: Expert en documentation technique
- Niveau utilisateur: ${expertiseConfig.name}
- Domaine: ${domain}
${language === 'fr' ? '- Langue: Français' : '- Language: French'}`);

  // 2. RÈGLES FONDAMENTALES
  sections.push(`## RÈGLES FONDAMENTALES
1. Utilise UNIQUEMENT les informations fournies dans le contexte
2. Si l'information n'est pas disponible, dis-le clairement
3. Organise ta réponse de façon logique
${includeCitations ? '4. Cite toujours tes sources' : '4. Ne cite pas les sources sauf si demandé'}
5. Mentionne les avertissements de sécurité si pertinents`);

  // 3. FORMAT DE RÉPONSE
  sections.push(`## FORMAT DE RÉPONSE
${formatConfig.instructions}

${responseFormat === 'détaillé' ? 'Structure ta réponse avec des titres et sous-titres clairs.' :
  responseFormat === 'concis' ? 'Limite-toi à 2-3 phrases maximum.' :
    responseFormat === 'technique' ? 'Inclus des données chiffrées et des spécifications précises.' :
      'Explique les concepts avec des exemples concrets.'}`);

  // 4. NIVEAU DE STRICTESSE
  sections.push(`## NIVEAU DE STRICTESSE
${strictnessConfig.description} - ${strictnessConfig.instruction}`);

  // 5. CONTEXTE DOCUMENTAIRE
  if (hasDocuments) {
    sections.push(`## CONTEXTE DISPONIBLE
Des documents techniques sont fournis ci-dessous. Utilise-les comme source principale d'information.`);
  }

  // 6. LIMITES
  if (maxTokens < 2000) {
    sections.push(`## LIMITES
Limite ta réponse à ${Math.floor(maxTokens / 4)} mots maximum.`);
  }

  // 7. QUESTION UTILISATEUR
  sections.push(`## QUESTION UTILISATEUR
${query}

## RÉPONSE`);

  const finalPrompt = sections.join('\n\n');
  const promptLength = finalPrompt.length;
  const elapsedTime = Date.now() - startTime;

  // Mise à jour des statistiques
  updateStats(userExpertise, responseFormat, domain, promptLength);

  logSuccess('GENERATE', `Prompt généré en ${formatDuration(elapsedTime)}`, {
    longueur: `${promptLength} caractères`,
    sections: sections.length
  });
  logMetric('GENERATE', 'Sections', sections.length);
  logMetric('GENERATE', 'Longueur', `${promptLength} caractères`);

  return finalPrompt;
}

// ============================================================================
// GÉNÉRATION AVEC MÉTADONNÉES
// ============================================================================

/**
 * Génère un prompt méta avec ses métadonnées
 */
export function generateMetaPromptWithMetadata(
  query: string,
  options: MetaPromptOptions = {}
): GeneratedPrompt {
  const startTime = Date.now();
  const content = generateMetaPrompt(query, options);
  
  const metadata: GeneratedPrompt['metadata'] = {
    query,
    options,
    timestamp: Date.now(),
    length: content.length,
    sections: content.split('\n\n').filter(s => s.trim()).map(s => {
      const firstLine = s.split('\n')[0];
      return firstLine.replace(/^#+\s*/, '').trim();
    })
  };
  
  const elapsedTime = Date.now() - startTime;
  logSuccess('METADATA', `Prompt avec métadonnées généré en ${formatDuration(elapsedTime)}`);
  
  return { content, metadata };
}

// ============================================================================
// TEMPLATES PRÉDÉFINIS
// ============================================================================

/**
 * Templates de prompts prédéfinis pour différents cas d'usage
 */
export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    name: 'procedure',
    description: 'Pour les questions de procédure technique',
    template: (options) => generateMetaPrompt(
      'Explique la procédure',
      { ...options, responseFormat: 'technique', strictness: 0.8 }
    )
  },
  {
    name: 'explanation',
    description: 'Pour les questions explicatives',
    template: (options) => generateMetaPrompt(
      'Explique le concept',
      { ...options, responseFormat: 'pédagogique', strictness: 0.6 }
    )
  },
  {
    name: 'quick_answer',
    description: 'Pour les questions rapides',
    template: (options) => generateMetaPrompt(
      'Réponds brièvement',
      { ...options, responseFormat: 'concis', strictness: 0.5 }
    )
  },
  {
    name: 'technical_spec',
    description: 'Pour les spécifications techniques',
    template: (options) => generateMetaPrompt(
      'Donne les spécifications',
      { ...options, responseFormat: 'technique', strictness: 0.9, userExpertise: 'expert' }
    )
  },
  {
    name: 'beginner_guide',
    description: 'Pour les utilisateurs débutants',
    template: (options) => generateMetaPrompt(
      'Guide pas à pas',
      { ...options, responseFormat: 'pédagogique', userExpertise: 'débutant', strictness: 0.4 }
    )
  }
];

/**
 * Récupère un template par son nom
 */
export function getPromptTemplate(name: string): PromptTemplate | undefined {
  const template = PROMPT_TEMPLATES.find(t => t.name === name);
  if (template) {
    logInfo('TEMPLATE', `Template trouvé: ${name} - ${template.description}`);
  } else {
    logMetric('TEMPLATE', 'Template non trouvé', name);
  }
  return template;
}

/**
 * Applique un template à une requête
 */
export function applyTemplate(
  templateName: string,
  query: string,
  options: MetaPromptOptions = {}
): string {
  const template = getPromptTemplate(templateName);
  if (template) {
    logInfo('APPLY', `Application du template "${templateName}" à la requête`);
    return generateMetaPrompt(query, { ...options });
  }
  
  logWarning('APPLY', `Template "${templateName}" non trouvé, fallback au générateur standard`);
  return generateMetaPrompt(query, options);
}

// ============================================================================
// ANALYSE DE LA QUALITÉ DU PROMPT
// ============================================================================

/**
 * Analyse la qualité d'un prompt généré
 */
export function analyzePromptQuality(prompt: string): {
  score: number;
  issues: string[];
  suggestions: string[];
  sections: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;
  
  // Vérifier la présence des sections essentielles
  const hasIdentity = prompt.includes('IDENTITÉ') || prompt.includes('IDENTITY');
  const hasRules = prompt.includes('RÈGLES') || prompt.includes('RULES');
  const hasFormat = prompt.includes('FORMAT') || prompt.includes('FORMAT');
  
  if (!hasIdentity) {
    issues.push('Section IDENTITÉ manquante');
    suggestions.push('Ajouter une section définissant le rôle de l\'assistant');
    score -= 20;
  }
  
  if (!hasRules) {
    issues.push('Section RÈGLES manquante');
    suggestions.push('Ajouter les règles fondamentales de réponse');
    score -= 20;
  }
  
  if (!hasFormat) {
    issues.push('Section FORMAT manquante');
    suggestions.push('Spécifier le format de réponse attendu');
    score -= 20;
  }
  
  // Vérifier la longueur
  if (prompt.length < 200) {
    issues.push('Prompt trop court');
    suggestions.push('Ajouter plus de contexte et d\'instructions');
    score -= 15;
  }
  
  if (prompt.length > 3000) {
    issues.push('Prompt trop long');
    suggestions.push('Réduire la longueur pour éviter de dépasser les limites de tokens');
    score -= 10;
  }
  
  // Extraire les sections
  const sections = prompt.split('\n\n')
    .filter(s => s.trim())
    .map(s => s.split('\n')[0].replace(/^#+\s*/, '').trim())
    .filter(s => s);
  
  const analysis = {
    score: Math.max(0, score),
    issues,
    suggestions,
    sections
  };
  
  logMetric('QUALITY', 'Score', `${analysis.score}%`);
  if (issues.length > 0) {
    logMetric('QUALITY', 'Issues', issues.length);
  }
  
  return analysis;
}

// ============================================================================
// STATISTIQUES
// ============================================================================

/**
 * Récupère les statistiques du générateur de prompts
 */
export function getPromptStats(): {
  totalGenerations: number;
  generationsByExpertise: Record<string, number>;
  generationsByFormat: Record<string, number>;
  generationsByDomain: Record<string, number>;
  avgPromptLength: number;
  lastGenerationTime: number | null;
  lastGenerationLength: number | null;
} {
  const expertiseObj: Record<string, number> = {};
  for (const [key, value] of stats.generationsByExpertise.entries()) {
    expertiseObj[key] = value;
  }
  
  const formatObj: Record<string, number> = {};
  for (const [key, value] of stats.generationsByFormat.entries()) {
    formatObj[key] = value;
  }
  
  const domainObj: Record<string, number> = {};
  for (const [key, value] of stats.generationsByDomain.entries()) {
    domainObj[key] = value;
  }
  
  return {
    totalGenerations: stats.totalGenerations,
    generationsByExpertise: expertiseObj,
    generationsByFormat: formatObj,
    generationsByDomain: domainObj,
    avgPromptLength: Math.round(stats.avgPromptLength),
    lastGenerationTime: stats.lastGenerationTime,
    lastGenerationLength: stats.lastGenerationLength
  };
}

/**
 * Réinitialise les statistiques
 */
export function resetPromptStats(): void {
  stats.totalGenerations = 0;
  stats.generationsByExpertise.clear();
  stats.generationsByFormat.clear();
  stats.generationsByDomain.clear();
  stats.avgPromptLength = 0;
  stats.totalPromptLength = 0;
  stats.lastGenerationTime = null;
  stats.lastGenerationLength = null;
  logSuccess('STATS', 'Statistiques du générateur de prompts réinitialisées');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateMetaPrompt,
  generateMetaPromptWithMetadata,
  getPromptTemplate,
  applyTemplate,
  analyzePromptQuality,
  PROMPT_TEMPLATES,
  getPromptStats,
  resetPromptStats
};