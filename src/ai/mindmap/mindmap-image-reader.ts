// src/ai/mindmap/mindmap-image-reader.ts
/**
 * Lecture de Mind Maps depuis des fichiers SVG et PNG
 * - SVG : extraction native des éléments texte + positions
 * - PNG : appel Groq Vision (meta-llama/llama-4-scout-17b-16e-instruct) pour OCR structurel
 * - Cache basé sur le hash du contenu pour éviter les traitements redondants
 */

import { mindMapParser } from './mindmap-parser';
import type { MindMapData, MindMapNode, MindMapEdge } from './types';
import { v4 as uuidv4 } from 'uuid';
import { guessNodeType, getStyleForType } from './mindmap-utils';
import { mindMapCache } from './mindmap-cache';
import { logger } from '../core/sqlite/utils';
import { VISION_MODEL, DEFAULT_TEMPERATURE, API_TIMEOUT_MS } from './llm-config';

const SVG_CACHE_PREFIX = 'image:svg:';
const PNG_CACHE_PREFIX = 'image:png:';
const IMAGE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Génère un hash simple du contenu pour servir de clé de cache.
 * Utilise un hash FNV-1a 32-bit compatible navigateur (pas de dépendance Node.js).
 */
function hashContent(content: string): string {
  let hash = 2166136261; // FNV offset basis (32-bit)
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  // Convert to hex string (8 caractères)
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ─── SVG Parser ─────────────────────────────────────────────────────────────

interface SvgTextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  parentGroup?: string;
}

/**
 * Extrait les nœuds textuels d'un SVG et tente de reconstituer la hiérarchie
 * via la proximité des éléments et des flèches/lignes.
 * Le résultat est caché pendant 30 minutes basé sur le hash du contenu SVG.
 * 
 * @param svgContent - Le contenu brut du fichier SVG
 * @returns La structure MindMap extraite du SVG
 * @throws {Error} Si aucun texte n'est trouvé dans le SVG
 */
export function parseSvgToMindMap(svgContent: string): MindMapData {
  // Vérifier le cache
  const contentHash = hashContent(svgContent);
  const cacheKey = SVG_CACHE_PREFIX + contentHash;
  const cached = mindMapCache.get<MindMapData>(cacheKey);
  if (cached) {
    logger.info('MINDMAP-IMAGE', `📦 SVG récupéré du cache (hash: ${contentHash})`);
    return cached;
  }

  const nodes: any[] = [];
  const edges: any[] = [];

  // Sanitize: strip scripts
  const safe = svgContent.replace(/<script[\s\S]*?<\/script>/gi, '');

  // 1. Extract all text/tspan elements with their x/y coordinates
  const textElements = extractSvgTexts(safe);

  if (textElements.length === 0) {
    throw new Error('Aucun texte trouvé dans le fichier SVG.');
  }

  // 2. Build nodes from text elements
  textElements.forEach((el, idx) => {
    const nodeId = `svg_n_${idx}`;
    nodes.push({
      id: nodeId,
      parentId: null,
      type: guessNodeType(el.text),
      label: el.text,
      description: undefined,
      positionX: el.x,
      positionY: el.y,
      style: getStyleForType(guessNodeType(el.text)),
      _svgGroup: el.parentGroup,
    });
  });

  // 3. Try to detect connections from <line> or <path d="M...L..."> elements
  const connections = extractSvgConnections(safe, textElements);
  connections.forEach(conn => {
    const src = nodes.find(n => n.id === conn.sourceId);
    const tgt = nodes.find(n => n.id === conn.targetId);
    if (src && tgt && src.id !== tgt.id) {
      tgt.parentId = src.id;
      edges.push({
        id: `e_${src.id}_${tgt.id}`,
        source: src.id,
        target: tgt.id,
        type: 'dependency' as const,
      });
    }
  });

  // 4. If no connections found, use spatial proximity to build hierarchy
  if (edges.length === 0 && nodes.length > 1) {
    buildHierarchyByProximity(nodes, edges);
  }

  // Clean internal fields
  nodes.forEach(n => delete n._svgGroup);

  // Optional: refine layout if it was proximally generated (often looks better)
  if (edges.length > 0) {
    mindMapParser.applyAutoLayout(nodes, edges);
  }

  const result: MindMapData = {
    nodes,
    edges,
    rootLabel: nodes[0]?.label || 'Mind Map SVG',
    layout: 'tree',
  };

  // Mettre en cache
  mindMapCache.set(cacheKey, result, IMAGE_CACHE_TTL);
  logger.info('MINDMAP-IMAGE', `💾 SVG parsé et mis en cache (${nodes.length} nœuds, hash: ${contentHash})`);

  return result;
}

/**
 * Extrait tous les éléments texte d'un SVG avec leurs coordonnées
 */
function extractSvgTexts(svg: string): SvgTextElement[] {
  const results: SvgTextElement[] = [];
  // Match <text x="..." y="...">content</text> and <tspan>
  const textRegex = /<(?:text|tspan)[^>]*(?:x=['"]([\d.+-]+)['"][^>]*y=['"]([\d.+-]+)['"]|y=['"]([\d.+-]+)['"][^>]*x=['"]([\d.+-]+)['"])[^>]*>([\s\S]*?)<\/(?:text|tspan)>/gi;
  let m;
  while ((m = textRegex.exec(svg)) !== null) {
    const x = parseFloat(m[1] || m[4] || '0');
    const y = parseFloat(m[2] || m[3] || '0');
    // Strip inner XML tags to get plain text
    const rawText = m[5].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    if (rawText && rawText.length > 0) {
      results.push({ id: `txt_${results.length}`, text: rawText, x, y });
    }
  }
  return results;
}

/**
 * Détecte les connexions entre éléments texte via les lignes SVG
 */
function extractSvgConnections(svg: string, texts: SvgTextElement[]): { sourceId: string; targetId: string }[] {
  const connections: { sourceId: string; targetId: string }[] = [];

  // Extract simple lines: <line x1="..." y1="..." x2="..." y2="..."/>
  const lineRegex = /<line[^>]*x1=['"]([\d.]+)['"][^>]*y1=['"]([\d.]+)['"][^>]*x2=['"]([\d.]+)['"][^>]*y2=['"]([\d.]+)['"]/gi;
  let m;
  while ((m = lineRegex.exec(svg)) !== null) {
    const x1 = parseFloat(m[1]), y1 = parseFloat(m[2]);
    const x2 = parseFloat(m[3]), y2 = parseFloat(m[4]);

    const src = findClosestText(texts, x1, y1);
    const tgt = findClosestText(texts, x2, y2);
    if (src && tgt && src.id !== tgt.id) {
      connections.push({ sourceId: `svg_n_${texts.indexOf(src)}`, targetId: `svg_n_${texts.indexOf(tgt)}` });
    }
  }

  return connections;
}

/**
 * Trouve l'élément texte le plus proche d'un point donné
 */
function findClosestText(texts: SvgTextElement[], x: number, y: number): SvgTextElement | null {
  let best: SvgTextElement | null = null;
  let bestDist = Infinity;
  for (const t of texts) {
    const d = Math.sqrt(Math.pow(t.x - x, 2) + Math.pow(t.y - y, 2));
    if (d < bestDist) { bestDist = d; best = t; }
  }
  return bestDist < 80 ? best : null;
}

/**
 * Construit une hiérarchie basée sur la proximité spatiale des nœuds
 */
function buildHierarchyByProximity(nodes: any[], edges: any[]) {
  // Sort by Y first (top = root candidates), then X
  const sorted = [...nodes].sort((a, b) => a.positionY - b.positionY || a.positionX - b.positionX);
  const root = sorted[0];
  root.parentId = null;

  for (let i = 1; i < sorted.length; i++) {
    const child = sorted[i];
    // Find the closest node that is above and to the left
    let bestParent = root;
    let bestDist = Infinity;
    for (let j = 0; j < i; j++) {
      const candidate = sorted[j];
      if (candidate.positionY <= child.positionY) {
        const d = Math.abs(candidate.positionX - child.positionX) + Math.abs(candidate.positionY - child.positionY);
        if (d < bestDist) { bestDist = d; bestParent = candidate; }
      }
    }
    child.parentId = bestParent.id;
    edges.push({
      id: `e_prox_${bestParent.id}_${child.id}`,
      source: bestParent.id,
      target: child.id,
      type: 'flow' as const,
    });
  }
}


// ─── PNG Vision Reader (Groq) ────────────────────────────────────────────────

const VISION_PROMPT = `Tu es un expert en Mind Maps industriels. 
Analyse cette image et extrait la structure hiérarchique complète du Mind Map.

Retourne UNIQUEMENT un objet JSON valide avec ce format strict :
{
  "rootLabel": "Titre principal du Mind Map",
  "nodes": [
    { "id": "n1", "parentId": null, "label": "Nœud racine", "type": "dependency" },
    { "id": "n2", "parentId": "n1", "label": "Enfant 1", "type": "note" },
    { "id": "n3", "parentId": "n1", "label": "Enfant 2", "type": "parameter" }
  ]
}

Types possibles : "dependency" (équipement/système), "parameter" (valeur mesurée), "formula" (calcul), "note" (texte).
Si le texte est illisible ou si l'image ne contient pas de Mind Map, retourne {"error": "Contenu non reconnu"}.`;

/**
 * Utilise le modèle Groq Vision pour analyser une image PNG
 * et en extraire la structure Mind Map.
 * Le résultat est caché pendant 30 minutes basé sur le hash du contenu base64
 * pour éviter des appels API Vision coûteux et redondants.
 * 
 * @param imageBase64 - L'image encodée en base64
 * @param mimeType - Le type MIME de l'image (défaut: 'image/png')
 * @param signal - Optionnel : un AbortSignal pour annuler la requête (défaut: timeout 45s)
 * @returns La structure MindMap extraite de l'image
 * @throws {Error} Si GROQ_API_KEY n'est pas définie, si l'API échoue, ou si l'image n'est pas reconnue
 */
export async function parsePngToMindMap(
  imageBase64: string, 
  mimeType: string = 'image/png',
  signal?: AbortSignal
): Promise<MindMapData> {
  // Vérifier le cache — utiliser les 1000 premiers caractères + longueur comme clé
  // pour éviter de hasher des images entières de plusieurs Mo
  const contentSample = imageBase64.substring(0, 1000) + '_len_' + imageBase64.length;
  const contentHash = hashContent(contentSample);
  const cacheKey = PNG_CACHE_PREFIX + contentHash;
  
  const cached = mindMapCache.get<MindMapData>(cacheKey);
  if (cached) {
    logger.info('MINDMAP-IMAGE', `📦 PNG Vision récupéré du cache (hash: ${contentHash})`);
    return cached;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY non définie');

  logger.info('MINDMAP-IMAGE', `🖼️ Appel Groq Vision pour analyse d'image (${(imageBase64.length / 1024).toFixed(1)} Ko)`);

  // Utiliser le signal fourni ou créer un timeout par défaut
  const effectiveSignal = signal || AbortSignal.timeout(API_TIMEOUT_MS);

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            { type: 'text', text: VISION_PROMPT },
          ],
        },
      ],
      temperature: DEFAULT_TEMPERATURE,
      max_tokens: 2000,
    }),
    signal: effectiveSignal,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq Vision error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || '';

  // Extract JSON from response
  const jsonStart = rawText.indexOf('{');
  const jsonEnd = rawText.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < jsonStart) {
    throw new Error('La réponse du modèle Vision ne contient pas de JSON valide.');
  }

  const parsed = JSON.parse(rawText.substring(jsonStart, jsonEnd + 1));

  if (parsed.error) throw new Error(parsed.error);

  // Convert to MindMapData format
  const nodes = (parsed.nodes || []).map((n: any, idx: number) => ({
    id: n.id || `vision_n_${idx}`,
    parentId: n.parentId || null,
    type: n.type || 'note',
    label: n.label || `Nœud ${idx + 1}`,
    description: n.description || undefined,
    style: getStyleForType(n.type || 'note'),
  }));

  const edges = buildEdgesFromParentIds(nodes);

  // Apply visual layout to spread nodes instead of overlaying them (crucial for AI-extracted nodes)
  mindMapParser.applyAutoLayout(nodes, edges);

  const result: MindMapData = {
    nodes,
    edges,
    rootLabel: parsed.rootLabel || 'Mind Map (Vision)',
    layout: 'tree',
  };

  // Mettre en cache
  mindMapCache.set(cacheKey, result, IMAGE_CACHE_TTL);
  logger.info('MINDMAP-IMAGE', `💾 PNG Vision parsé et mis en cache (${nodes.length} nœuds, hash: ${contentHash})`);

  return result;
}

/**
 * Construit les arêtes à partir des relations parentId des nœuds
 */
function buildEdgesFromParentIds(nodes: any[]) {
  return nodes
    .filter(n => n.parentId)
    .map(n => ({
      id: `e_${n.parentId}_${n.id}`,
      source: n.parentId as string,
      target: n.id,
      type: 'flow' as const,
    }));
}