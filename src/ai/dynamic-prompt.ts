/**
 * @fileOverview DynamicPromptEngine - Phase 3: AGIR.
 * Construction du prompt final avec instructions spécifiques au type de question.
 */

export class DynamicPromptEngine {
  private defaultTemplate = `Tu es un Assistant Professionnel Intelligent expert.
    
    INSTRUCTIONS GÉNÉRALES :
    - Réponds de manière précise, technique et concise.
    - Réponds toujours en français.
    - Utilise scrupuleusement le contexte fourni ci-dessous.
    
    CONNAISSANCES RÉCUPÉRÉES :
    {{context}}
    
    DEMANDE UTILISATEUR : {{question}}`;

  private templates: Record<string, string> = {
    procedure: `Tu es un Expert en Procédures Techniques Industrielles. 
      INSTRUCTIONS : 
      1. Détaille la procédure étape par étape.
      2. Mets les avertissements de sécurité en GRAS.
      3. Cite les outils nécessaires identifiés dans le contexte.
      
      CONNAISSANCES :
      {{context}}
      
      PROCÉDURE : {{question}}`,
    
    troubleshooting: `Tu es un Analyste de Pannes (Dépannage).
      INSTRUCTIONS :
      1. Identifie les causes probables à partir des leçons passées.
      2. Propose des tests de diagnostic.
      3. Recommande des actions correctives basées sur les documents.
      
      HISTORIQUE & DOCS :
      {{context}}
      
      PROBLÈME : {{question}}`,
    
    definition: `Tu es un Expert en Vulgarisation Technique.
      INSTRUCTIONS : Explique le concept de manière claire en utilisant des analogies industrielles si présentes dans le contexte.
      
      CONNAISSANCES :
      {{context}}
      
      CONCEPT : {{question}}`
  };

  /**
   * Construit un prompt optimisé basé sur la phase 1 (Analyse de la question).
   */
  async buildPrompt(question: string, context: string): Promise<string> {
    const type = this.analyzeQuestionType(question);
    const template = this.templates[type] || this.defaultTemplate;

    return template
      .replace('{{question}}', question)
      .replace('{{context}}', context || "Aucun document spécifique n'est chargé.");
  }

  private analyzeQuestionType(question: string): string {
    const q = question.toLowerCase();
    if (q.includes('panne') || q.includes('erreur') || q.includes('marche pas') || q.includes('problème')) {
      return 'troubleshooting';
    }
    if (q.includes('comment') || q.includes('étape') || q.includes('faire') || q.includes('procédure')) {
      return 'procedure';
    }
    if (q.includes('qu\'est-ce que') || q.includes('signifie') || q.includes('définition')) {
      return 'definition';
    }
    return 'general';
  }
}

export const dynamicPromptEngine = new DynamicPromptEngine();
