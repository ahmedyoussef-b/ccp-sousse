/**
 * @fileOverview KnowledgeGraphBuilder - Consultation du graphe de connaissances local.
 * Client-safe : les extractions lourdes sont gérées par les flows serveurs.
 */

export interface GraphNode {
  id: string;
  label: string;
  type: 'concept' | 'entity' | 'document';
}

export interface GraphRelation {
  from: string;
  to: string;
  predicate: string;
}

/**
 * Recherche dans le graphe pour enrichir le contexte (Innovation 4).
 */
export async function queryKnowledgeGraph(query: string, availableNodes: any[]): Promise<string> {
  if (!availableNodes || availableNodes.length === 0) return "";
  
  const q = query.toLowerCase();
  
  // Recherche simple de correspondances dans les labels de nœuds
  const relevantNodes = availableNodes.filter(node => 
    q.includes(node.label.toLowerCase()) || node.label.toLowerCase().includes(q)
  );

  if (relevantNodes.length === 0) return "";

  const concepts = relevantNodes.slice(0, 5).map(n => n.label).join(', ');
  return `CONNAISSANCES LIÉES (Graphe) : Cette question touche aux concepts techniques suivants : ${concepts}.`;
}
