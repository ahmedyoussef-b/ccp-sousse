/**
 * @fileOverview GraphStore - Gestionnaire de relations sémantiques entre concepts.
 * Ne contient plus de logique LLM directe pour éviter les erreurs d'import client.
 */

export interface GraphNode {
  id: string;
  type: 'document' | 'concept';
  label: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
}
