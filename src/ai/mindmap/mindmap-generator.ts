// src/ai/mindmap/mindmap-generator.ts

import { callOllama } from '../providers/ollama-client';
import { callGroq } from '../providers/groq-provider';
import { MindMapData, MindMapNode, MindMapEdge, MindMapNodeType } from './types';
import { mindMapManager } from './mindmap-manager';
import { mindMapEmbedder } from './mindmap-embedder';
import { mindMapChatEnricher } from './mindmap-chat-enricher';
import { mindMapRagBridge } from './mindmap-rag-bridge';
import { logger } from '../core/sqlite/utils';
import { 
  isGroqEnabled, 
  GROQ_MODEL, 
  LOCAL_MODEL, 
  DEFAULT_TEMPERATURE, 
  DEFAULT_MAX_TOKENS,
  getActiveProviderName 
} from './llm-config';

export class MindMapGenerator {
  private static instance: MindMapGenerator;

  private constructor() {}

  public static getInstance(): MindMapGenerator {
    if (!MindMapGenerator.instance) {
      MindMapGenerator.instance = new MindMapGenerator();
    }
    return MindMapGenerator.instance;
  }

  /**
   * Generates a Mind Map automatically from text using LLM, with a robust rule-based parser fallback.
   */
  public async generateFromText(circuitId: string, text: string): Promise<MindMapData> {
    logger.info('MINDMAP-GEN', `🚀 Génération automatique de schéma mental pour le circuit: ${circuitId} (Taille texte: ${text.length} chars)`);

    try {
      if (text.length < 50) {
        throw new Error('Le texte fourni est trop court pour générer un schéma mental significatif.');
      }

      // Try LLM Extraction first
      try {
        const result = await this.generateWithLLM(circuitId, text);
        if (result && result.nodes.length > 0) {
          logger.info('MINDMAP-GEN', `✅ Schéma généré par LLM pour ${circuitId} (${result.nodes.length} nœuds)`);
          return result;
        }
      } catch (llmErr) {
        logger.warn('MINDMAP-GEN', 'Le générateur LLM a échoué. Passage au parseur heuristique de repli...', llmErr);
      }

      // Fallback: Heuristic Rules-based Extraction
      const fallbackResult = this.generateWithHeuristics(circuitId, text);
      logger.info('MINDMAP-GEN', `✅ Schéma de repli généré avec succès par règles pour ${circuitId} (${fallbackResult.nodes.length} nœuds)`);
      return fallbackResult;

    } catch (error) {
      logger.error('MINDMAP-GEN', 'Erreur critique lors de la génération automatique du schéma mental', error);
      throw error;
    }
  }

  /**
   * Sémantique LLM Extraction using either Groq or local Ollama
   */
  private async generateWithLLM(circuitId: string, text: string): Promise<MindMapData> {
    const prompt = `Tu es un ingénieur expert en système d'information industriel et instrumentation.
Analyse la description technique du circuit "${circuitId}" et extrait les nœuds et connexions structurelles du schéma mental (mind map).
Tu dois extraire :
1. Les paramètres opérationnels (pression, température, débit, vannes, etc.) avec leur unité et criticité.
2. Les formules opérationnelles, ratios ou calculs mentionnés.
3. Les consignes opérationnelles critiques ou points de vigilance (notes).
4. Les dépendances topologiques et flux (edges).

Retourne UNIQUEMENT un objet JSON valide sous ce format exact sans aucun texte d'accompagnement ou balise de code Markdown :
{
  "rootLabel": "Nom principal du schéma",
  "nodes": [
    {
      "id": "node_unique_id",
      "parentId": "node_parent_id_si_applicable",
      "type": "parameter" | "formula" | "dependency" | "note",
      "label": "Titre du nœud",
      "description": "Explication brève",
      "kks": "code_KKS_si_detecte",
      "unit": "unité_physique_si_applicable",
      "criticality": "low" | "medium" | "high" | "critical",
      "optimalValue": "valeur_nominale_optimale"
    }
  ],
  "edges": [
    {
      "id": "edge_unique_id",
      "source": "node_source_id",
      "target": "node_target_id",
      "type": "dependency" | "flow" | "formula_input"
    }
  ]
}

Description technique à analyser :
"${text}"`;

    let response = '';
    const useGroq = isGroqEnabled();

    logger.info('MINDMAP-GEN', `Inférence via ${getActiveProviderName()} pour l'extraction de schéma mental...`);

    if (useGroq) {
      response = await callGroq(prompt, {
        model: GROQ_MODEL,
        temperature: DEFAULT_TEMPERATURE,
        maxTokens: DEFAULT_MAX_TOKENS
      });
    } else {
      response = await callOllama(prompt, {
        model: LOCAL_MODEL,
        temperature: DEFAULT_TEMPERATURE,
        maxTokens: DEFAULT_MAX_TOKENS
      });
    }

    // Clean JSON response (strip Markdown blocks if any)
    const jsonStart = response.indexOf('{');
    const jsonEnd = response.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("La réponse du modèle n'est pas un format JSON lisible.");
    }
    const cleanJson = response.substring(jsonStart, jsonEnd + 1);
    const parsedData = JSON.parse(cleanJson) as MindMapData;

    // Validate structure
    if (!parsedData.nodes || !Array.isArray(parsedData.nodes)) {
      throw new Error("Le format JSON extrait ne contient pas de liste de nœuds valide.");
    }

    return parsedData;
  }

  /**
   * Rule-based Heuristic parser fallback when offline or LLM limit is hit
   * Now properly injects detected units, KKS codes, optimal values, and criticality into nodes.
   */
  private generateWithHeuristics(circuitId: string, text: string): MindMapData {
    const nodes: MindMapNode[] = [];
    const edges: MindMapEdge[] = [];
    
    // Add Root Node
    const rootId = `root_${circuitId}`;
    nodes.push({
      id: rootId,
      parentId: null,
      type: 'dependency',
      label: `Système ${circuitId}`,
      description: `Schéma topologique auto-généré pour le circuit ${circuitId}`,
      criticality: 'medium'
    });

    const lines = text.split(/[\n.]+/).map(l => l.trim()).filter(l => l.length > 10);
    let nodeCounter = 1;

    // Common industrial units matching — captures value + unit
    const unitRegex = /\b(\d+(?:[.,]\d+)?)\s*(bar|°C|°F|m3\/h|kg\/s|MW|kV|V|Hz|%|t\/h|mm|cm|kPa|MPa|Nm3\/h|L\/min|rpm|A|mA)\b/i;
    // KKS Code extraction (e.g. 10CRF011, 20LAB01)
    const kksRegex = /\b([0-9]{2}[A-Z]{3}[0-9]{2,3}[A-Z]{0,2})\b/;
    // Range detection: "1.5 à 2.0 bar" or "10-20°C"
    const rangeRegex = /\b(\d+(?:[.,]\d+)?)\s*[-à]\s*(\d+(?:[.,]\d+)?)\s*(bar|°C|°F|m3\/h|kg\/s|MW|kV|V|Hz|%|t\/h|mm|cm|kPa|MPa)\b/i;

    lines.forEach(line => {
      let nodeType: MindMapNodeType = 'parameter';
      let label = '';
      let desc = line;
      let unit: string | null = null;
      let kks: string | null = null;
      let criticality: 'low' | 'medium' | 'high' | 'critical' = 'low';
      let optimalValue: string | null = null;

      // 1. Detect KKS code
      const kksMatch = line.match(kksRegex);
      if (kksMatch) {
        kks = kksMatch[1];
      }

      // 2. Detect range first (more specific than unit alone)
      const rangeMatch = line.match(rangeRegex);
      if (rangeMatch) {
        optimalValue = `${rangeMatch[1]} - ${rangeMatch[2]}`;
        unit = rangeMatch[3];
        nodeType = 'parameter';
      } else {
        // 3. Detect single unit + value
        const unitMatch = line.match(unitRegex);
        if (unitMatch) {
          optimalValue = unitMatch[1];
          unit = unitMatch[2];
          nodeType = 'parameter';
        }
      }

      // 4. Detect formula keywords
      if (/calcule|formule|déduit|égale|égale à|multiplié|somme|ratio|rendement|equation/i.test(line)) {
        nodeType = 'formula';
      } else if (/attention|danger|sécurité|vigilance|alarme|consigne|interdit|critique|urgent/i.test(line)) {
        nodeType = 'note';
        criticality = 'high';
      } else if (/arrêt|urgence|défaut|panne|incident/i.test(line)) {
        nodeType = 'note';
        criticality = 'critical';
      }

      // 5. Determine criticality from keywords
      if (/critique/i.test(line) && criticality === 'low') {
        criticality = 'critical';
      } else if (/important|surveiller/i.test(line) && criticality === 'low') {
        criticality = 'medium';
      }

      // Extract short label
      if (kks) {
        label = `Point ${kks}`;
      } else {
        const words = line.split(' ');
        label = words.slice(0, 4).join(' ').replace(/[,;:]+$/, '');
      }

      // Only create if we can make a meaningful label
      if (label.length > 3) {
        const nodeId = `node_${circuitId}_${nodeCounter++}`;
        nodes.push({
          id: nodeId,
          parentId: rootId,
          type: nodeType,
          label,
          description: desc.length > 200 ? desc.substring(0, 197) + '...' : desc,
          kks,
          unit,
          criticality,
          optimalValue
        });

        // Add standard dependency edge to root
        edges.push({
          id: `edge_${circuitId}_${nodeCounter}`,
          source: rootId,
          target: nodeId,
          type: nodeType === 'formula' ? 'formula_input' : 'dependency'
        });
      }
    });

    // If we detected parameters with values, add a summary note
    const detectedParams = nodes.filter(n => n.type === 'parameter' && n.optimalValue);
    if (detectedParams.length > 0) {
      const summaryId = `summary_${circuitId}`;
      const summaryLines = detectedParams.map(p => 
        `- ${p.label}${p.kks ? ` (${p.kks})` : ''}: ${p.optimalValue}${p.unit ? ' ' + p.unit : ''}`
      );
      nodes.push({
        id: summaryId,
        parentId: rootId,
        type: 'note',
        label: 'Résumé des paramètres détectés',
        description: summaryLines.join('\n'),
        criticality: 'low'
      });
      edges.push({
        id: `edge_${circuitId}_summary`,
        source: rootId,
        target: summaryId,
        type: 'dependency'
      });
    }

    return {
      rootLabel: `Schéma ${circuitId}`,
      nodes,
      edges,
      layout: 'tree'
    };
  }

  /**
   * Automatically generates, saves, and embeds a mind map for a circuit based on technical text.
   * Also invalidates caches to keep enricher and RAG bridge in sync.
   */
  public async generateAndSave(circuitId: string, text: string): Promise<any> {
    const mindmapData = await this.generateFromText(circuitId, text);
    
    // Save to Database via manager
    const saved = await mindMapManager.saveMindMap(circuitId, mindmapData);
    
    // Vectorize nodes automatically
    await mindMapEmbedder.vectorizeMindMap(saved);

    // Invalidate caches so chat enricher and RAG bridge pick up the new mindmap
    mindMapChatEnricher.invalidateCircuitCache();
    mindMapRagBridge.invalidateContextCache(circuitId);

    return saved;
  }
}

export const mindMapGenerator = MindMapGenerator.getInstance();