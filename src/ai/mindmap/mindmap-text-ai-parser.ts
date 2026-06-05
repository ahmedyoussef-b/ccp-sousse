// src/ai/mindmap/mindmap-text-ai-parser.ts
import { callGroq } from '../providers/groq-provider';
import { mindMapParser } from './mindmap-parser';
import type { MindMapData } from './types';

const PROMPT = `Tu es un expert en conception de Mind Maps industriels.
Ton objectif est de transformer intégralement tout contenu JSON en un Mind Map hiérarchique exhaustif.

CONSIGNES DE RIGUEUR :
1. NE RÉSUME PAS : Chaque clé et chaque valeur du JSON doit être présente sous forme de nœud. L'exhaustivité est critique pour la maintenance industrielle.
2. HIÉRARCHIE PROFONDE : Respecte scrupuleusement l'imbrication du JSON. Si un objet est à l'intérieur d'un autre, il doit être son enfant dans le Mind Map.
3. LABELS : Le label doit être court (max 40 car.). Mets l'information complète dans la description si nécessaire.
4. TYPES : 
   - "dependency" : pour les équipements, systèmes, ou clés qui contiennent des sous-objets.
   - "parameter" : pour les valeurs numériques, mesures, ou caractéristiques techniques.
   - "formula" : pour les calculs ou conditions.
   - "note" : pour tout le reste.

Retourne UNIQUEMENT un objet JSON valide avec cette structure exacte :
{
  "rootLabel": "Titre du circuit ou système",
  "nodes": [
    { "id": "uuid", "parentId": "uuid_parent", "label": "...", "type": "...", "description": "..." }
  ]
}

Données JSON à transformer (TRAITE TOUT SANS EXCEPTION) :
`;

export async function parseTextWithAI(content: string, format: string): Promise<MindMapData> {
  const fullPrompt = `${PROMPT}\n${content}`;
  
  const responseText = await callGroq(fullPrompt, {
    model: 'llama-3.3-70b-versatile',
    temperature: 0.1,
    maxTokens: 8000 
  });

  const jsonStart = responseText.indexOf('{');
  const jsonEnd = responseText.lastIndexOf('}');
  
  if (jsonStart < 0 || jsonEnd < jsonStart) {
    throw new Error('La réponse du modèle IA ne contient pas de JSON valide.');
  }

  const rawJson = responseText.substring(jsonStart, jsonEnd + 1);
  const parsed = JSON.parse(rawJson);
  
  const nodes = (parsed.nodes || []).map((n: any, idx: number) => ({
    id: n.id || `ai_n_${idx}`,
    parentId: n.parentId || null,
    type: n.type || 'note',
    label: n.label || `Nœud ${idx + 1}`,
    style: getStyleForType(n.type || 'note')
  }));

  // Fix root if missing
  if (nodes.length > 0 && !nodes.find((n: any) => !n.parentId)) {
    nodes[0].parentId = null;
  }

  const edges = nodes
    .filter((n: any) => n.parentId)
    .map((n: any) => ({
      id: `e_${n.parentId}_${n.id}`,
      source: n.parentId,
      target: n.id,
      type: 'flow'
    }));

  // Apply visual layout to spread nodes instead of overlaying them
  mindMapParser.applyAutoLayout(nodes, edges);

  return {
    nodes,
    edges,
    rootLabel: parsed.rootLabel || 'Mind Map IA',
    layout: 'tree'
  };
}

function getStyleForType(type: string): Record<string, string> {
  switch (type) {
    case 'parameter': return { color: '#ffffff', backgroundColor: '#0284c7', borderColor: '#38bdf8' };
    case 'formula': return { color: '#ffffff', backgroundColor: '#7c3aed', borderColor: '#a78bfa' };
    case 'dependency': return { color: '#ffffff', backgroundColor: '#ea580c', borderColor: '#f97316' };
    case 'note':
    default: return { color: '#0f172a', backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' };
  }
}
