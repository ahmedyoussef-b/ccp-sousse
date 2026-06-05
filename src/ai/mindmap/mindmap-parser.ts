// src/ai/mindmap/mindmap-parser.ts

import { MindMapData, MindMapNode, MindMapEdge, MindMapNodeType } from './types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../core/sqlite/utils';
import { guessNodeType, getStyleForType } from './mindmap-utils';

export class MindMapParser {
  private static instance: MindMapParser;

  private constructor() {}

  public static getInstance(): MindMapParser {
    if (!MindMapParser.instance) {
      MindMapParser.instance = new MindMapParser();
    }
    return MindMapParser.instance;
  }

  /**
   * Parse a mindmap from any string format (JSON, Mermaid, Markdown, draw.io XML, or CSV)
   * Layout is applied exactly once at the top level.
   */
  public parse(content: string, format?: 'json' | 'mermaid' | 'markdown' | 'drawio' | 'csv'): MindMapData {
    const trimmed = content.trim();
    if (!trimmed) {
      return { nodes: [], edges: [] };
    }

    const detectedFormat = format || this.detectFormat(trimmed);

    try {
      let result: MindMapData;

      switch (detectedFormat) {
        case 'json':
          result = this.parseJSON(trimmed, true);
          break;
        case 'mermaid':
          result = this.parseMermaid(trimmed, true);
          break;
        case 'drawio':
          result = this.parseDrawIo(trimmed, true);
          break;
        case 'csv':
          result = this.parseCSV(trimmed, true);
          break;
        case 'markdown':
        default:
          result = this.parseMarkdown(trimmed, true);
          break;
      }

      // Apply layout exactly once at the top level
      this.applyAutoLayout(result.nodes, result.edges);
      return result;

    } catch (error) {
      logger.error('MINDMAP-PARSER', `❌ Error parsing mindmap in ${detectedFormat} format`, error);
      const rootId = 'root_' + uuidv4().substring(0, 8);
      return {
        nodes: [
          {
            id: rootId,
            type: 'note',
            label: 'Fallback Node',
            description: 'Failed to parse input: ' + String(error)
          }
        ],
        edges: []
      };
    }
  }

  public exportToMermaid(data: MindMapData): string {
    let mermaid = 'flowchart TD\n';
    
    data.nodes.forEach(node => {
      let shapeStart = '[';
      let shapeEnd = ']';
      if (node.type === 'parameter') {
        shapeStart = '(';
        shapeEnd = ')';
      } else if (node.type === 'formula') {
        shapeStart = '{';
        shapeEnd = '}';
      }
      
      const label = node.label.replace(/"/g, '\\"');
      mermaid += `  ${node.id}${shapeStart}"${label}"${shapeEnd}\n`;
    });
    
    data.edges.forEach(edge => {
      mermaid += `  ${edge.source} --> ${edge.target}\n`;
    });
    
    return mermaid;
  }

  public exportToJSON(data: MindMapData): string {
    return JSON.stringify(data, null, 2);
  }

  public calculateTreeLayout(nodes: MindMapNode[]): MindMapNode[] {
    const cloned = JSON.parse(JSON.stringify(nodes)) as MindMapNode[];
    this.applyAutoLayout(cloned, []);
    return cloned;
  }

  private detectFormat(content: string): 'json' | 'mermaid' | 'markdown' | 'drawio' | 'csv' {
    if (content.startsWith('{') && content.endsWith('}')) {
      return 'json';
    }
    if (content.includes('<mxGraphModel>') || content.includes('<mxCell') || content.includes('drawio')) {
      return 'drawio';
    }
    if (
      content.includes('graph ') || 
      content.includes('flowchart ') || 
      content.includes('mindmap') ||
      content.includes('-->')
    ) {
      return 'mermaid';
    }
    if (content.split('\n')[0].includes(';') || content.split('\n')[0].includes(',')) {
      return 'csv';
    }
    return 'markdown';
  }

  private parseJSON(content: string, skipLayout: boolean = false): MindMapData {
    const parsed = JSON.parse(content);
    return this.dispatchJSON(parsed, 'Mind Map JSON', skipLayout);
  }

  private dispatchJSON(parsed: any, rootLabel: string, skipLayout: boolean = false): MindMapData {

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.nodes)) {
      return this.parseNativeMindMapJSON(parsed, skipLayout);
    }

    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return { nodes: [], edges: [], rootLabel, layout: 'tree' };

      if (typeof parsed[0] === 'object' && !Array.isArray(parsed[0])) {
        return this.parseObjectArray(parsed, rootLabel, skipLayout);
      }
      if (Array.isArray(parsed[0])) {
        return this.parseMatrixJSON(parsed, rootLabel, skipLayout);
      }
      return this.parsePrimitiveArray(parsed, rootLabel, skipLayout);
    }

    if (parsed && typeof parsed === 'object') {
      return this.recursiveParseJSON(parsed, rootLabel, skipLayout);
    }

    return { nodes: [], edges: [], rootLabel, layout: 'tree' };
  }

  private parseNativeMindMapJSON(parsed: any, skipLayout: boolean = false): MindMapData {
    const nodes = (parsed.nodes || []).map((node: any) => ({
      id: node.id || uuidv4(),
      parentId: node.parentId || null,
      type: (node.type as MindMapNodeType) || guessNodeType(node.label || '', node.type),
      label: node.label || node.name || node.title || 'Sans titre',
      description: node.description || node.desc || null,
      kks: node.kks || null,
      unit: node.unit || null,
      criticality: node.criticality || 'low',
      optimalValue: node.optimalValue || null,
      formulaExpression: node.formulaExpression || null,
      positionX: typeof node.positionX === 'number' ? node.positionX : null,
      positionY: typeof node.positionY === 'number' ? node.positionY : null,
      style: node.style || {}
    }));
    const edges = (parsed.edges || []).map((e: any) => ({
      id: e.id || uuidv4(),
      source: e.source,
      target: e.target,
      label: e.label || undefined,
      type: e.type || 'dependency',
      style: e.style || {}
    }));
    return { nodes, edges, rootLabel: parsed.rootLabel || nodes[0]?.label || 'Root', layout: parsed.layout || 'tree' };
  }

  private parseObjectArray(arr: any[], rootLabel: string, skipLayout: boolean = false): MindMapData {
    const nodes: any[] = [];
    const edges: any[] = [];
    const idMap = new Map<string, string>();

    const rootId = `arr_root_${uuidv4().substring(0, 6)}`;
    nodes.push({
      id: rootId, parentId: null,
      type: 'dependency',
      label: rootLabel,
      style: getStyleForType('dependency')
    });

    arr.forEach((item: any, idx: number) => {
      const nodeId = item.id ? String(item.id) : `arr_n_${idx}`;
      const label = item.label || item.name || item.title || item.key || `Item ${idx + 1}`;
      const description = item.description || item.desc || item.value || item.val || undefined;
      const type = guessNodeType(String(label), item.type);

      let parentId = rootId;
      const rawParent = item.parent || item.parentId;
      if (rawParent) {
        const resolvedParent = idMap.get(String(rawParent));
        if (resolvedParent) parentId = resolvedParent;
      }

      idMap.set(String(item.id ?? idx), nodeId);

      nodes.push({ id: nodeId, parentId, type, label: String(label), description, style: getStyleForType(type) });
      edges.push({ id: `e_${parentId}_${nodeId}`, source: parentId, target: nodeId, type: 'flow' });

      if (Array.isArray(item.children) && item.children.length > 0) {
        item.children.forEach((child: any, cIdx: number) => {
          const childId = `arr_c_${idx}_${cIdx}`;
          const childLabel = typeof child === 'string' ? child : (child.label || child.name || `Child ${cIdx + 1}`);
          const childType = guessNodeType(childLabel);
          nodes.push({ id: childId, parentId: nodeId, type: childType, label: childLabel, style: getStyleForType(childType) });
          edges.push({ id: `e_${nodeId}_${childId}`, source: nodeId, target: childId, type: 'flow' });
        });
      }
    });

    return { nodes, edges, rootLabel, layout: 'tree' };
  }

  private recursiveParseJSON(data: any, rootLabel: string, skipLayout: boolean = false): MindMapData {
    const nodes: any[] = [];
    const edges: any[] = [];
    
    const rootId = `root_${uuidv4().substring(0, 6)}`;
    nodes.push({ 
      id: rootId, 
      parentId: null, 
      type: 'dependency', 
      label: rootLabel, 
      style: getStyleForType('dependency') 
    });

    this.walkJSON(data, rootId, nodes, edges);

    return { nodes, edges, rootLabel, layout: 'tree' };
  }

  private walkJSON(data: any, parentId: string, nodes: any[], edges: any[], depth: number = 0) {
    if (depth > 20) return;

    if (Array.isArray(data)) {
      data.forEach((item, idx) => {
        const nodeId = `n_${parentId}_${idx}`;
        if (typeof item === 'object' && item !== null) {
          const label = item.label || item.name || item.title || item.kks || `Item ${idx + 1}`;
          const type = guessNodeType(String(label), item.type);
          nodes.push({ id: nodeId, parentId, type, label: String(label), style: getStyleForType(type) });
          edges.push({ id: `e_${parentId}_${nodeId}`, source: parentId, target: nodeId, type: 'flow' });
          this.walkJSON(item, nodeId, nodes, edges, depth + 1);
        } else {
          const label = String(item);
          const type = guessNodeType(label);
          nodes.push({ id: nodeId, parentId, type, label, style: getStyleForType(type) });
          edges.push({ id: `e_${parentId}_${nodeId}`, source: parentId, target: nodeId, type: 'flow' });
        }
      });
    } else if (typeof data === 'object' && data !== null) {
      Object.entries(data).forEach(([key, value], idx) => {
        if (['id', 'nodes', 'edges', 'rootLabel', 'layout', 'parentId'].includes(key)) return;

        const nodeId = `n_${parentId}_${idx}`;
        
        if (typeof value === 'object' && value !== null) {
          const type = guessNodeType(key);
          nodes.push({ id: nodeId, parentId, type, label: key, style: getStyleForType(type) });
          edges.push({ id: `e_${parentId}_${nodeId}`, source: parentId, target: nodeId, type: 'flow' });
          this.walkJSON(value, nodeId, nodes, edges, depth + 1);
        } else {
          const label = `${key}: ${value}`;
          const type = guessNodeType(label);
          nodes.push({ id: nodeId, parentId, type, label, style: getStyleForType(type) });
          edges.push({ id: `e_${parentId}_${nodeId}`, source: parentId, target: nodeId, type: 'flow' });
        }
      });
    }
  }

  private parsePrimitiveArray(arr: any[], rootLabel: string, skipLayout: boolean = false): MindMapData {
    const nodes: any[] = [];
    const edges: any[] = [];
    const rootId = `prim_root`;
    nodes.push({ id: rootId, parentId: null, type: 'dependency', label: rootLabel, style: getStyleForType('dependency') });
    arr.forEach((item, idx) => {
      const id = `prim_${idx}`;
      const label = String(item);
      const type = guessNodeType(label);
      nodes.push({ id, parentId: rootId, type, label, style: getStyleForType(type) });
      edges.push({ id: `e_${rootId}_${id}`, source: rootId, target: id, type: 'flow' });
    });
    return { nodes, edges, rootLabel, layout: 'tree' };
  }

  private parseMatrixJSON(matrix: any[][], rootLabel: string, skipLayout: boolean = false): MindMapData {
    const nodes: any[] = [];
    const edges: any[] = [];
    const headers = matrix[0].map(String);
    const rootId = `mat_root`;
    nodes.push({ id: rootId, parentId: null, type: 'dependency', label: rootLabel, style: getStyleForType('dependency') });

    const headerIds = headers.map((h, hi) => {
      const hid = `mat_h_${hi}`;
      nodes.push({ id: hid, parentId: rootId, type: 'note', label: h, style: getStyleForType('note') });
      edges.push({ id: `e_${rootId}_${hid}`, source: rootId, target: hid, type: 'flow' });
      return hid;
    });

    matrix.slice(1).forEach((row, ri) => {
      row.forEach((cell, ci) => {
        const cellId = `mat_r${ri}_c${ci}`;
        const label = String(cell);
        const type = guessNodeType(label);
        const parentId = headerIds[ci] || rootId;
        nodes.push({ id: cellId, parentId, type, label, style: getStyleForType(type) });
        edges.push({ id: `e_${parentId}_${cellId}`, source: parentId, target: cellId, type: 'flow' });
      });
    });

    return { nodes, edges, rootLabel, layout: 'tree' };
  }

  private parseDrawIo(content: string, skipLayout: boolean = false): MindMapData {
    const nodes: Omit<MindMapNode, 'mindmapId'>[] = [];
    const edges: MindMapEdge[] = [];
    const idMap = new Set<string>();

    const cellRegex = /<mxCell\s+([^>]+)>/g;
    let match;

    while ((match = cellRegex.exec(content)) !== null) {
      const attrsStr = match[1];
      
      const id = this.extractXmlAttr(attrsStr, 'id');
      const value = this.extractXmlAttr(attrsStr, 'value');
      const parent = this.extractXmlAttr(attrsStr, 'parent');
      const vertex = this.extractXmlAttr(attrsStr, 'vertex');
      const edge = this.extractXmlAttr(attrsStr, 'edge');
      const source = this.extractXmlAttr(attrsStr, 'source');
      const target = this.extractXmlAttr(attrsStr, 'target');

      if (!id) continue;

      if (vertex === '1' && value && id !== '0' && id !== '1') {
        const cleanValue = value.replace(/<[^>]*>/g, '').trim();
        if (cleanValue) {
          const type = guessNodeType(cleanValue);
          nodes.push({
            id,
            parentId: parent && parent !== '1' && parent !== '0' ? parent : null,
            type,
            label: cleanValue,
            style: getStyleForType(type)
          });
          idMap.add(id);
        }
      } else if (edge === '1' && source && target) {
        edges.push({
          id: `e_drawio_${id}`,
          source,
          target,
          type: 'dependency'
        });
      }
    }

    const cleanEdges = edges.filter(e => idMap.has(e.source) && idMap.has(e.target));

    nodes.forEach(node => {
      if (!node.parentId) {
        const incomingEdge = cleanEdges.find(e => e.target === node.id);
        if (incomingEdge) {
          node.parentId = incomingEdge.source;
        }
      }
    });

    return {
      nodes,
      edges: cleanEdges,
      rootLabel: nodes[0]?.label || 'Imported Draw.io Map',
      layout: 'dagre'
    };
  }

  private extractXmlAttr(attrsStr: string, attrName: string): string | null {
    const regex = new RegExp(`${attrName}="([^"]*)"`);
    const match = attrsStr.match(regex);
    return match ? match[1] : null;
  }

  private parseCSV(content: string, skipLayout: boolean = false): MindMapData {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return { nodes: [], edges: [] };

    const nodes: Omit<MindMapNode, 'mindmapId'>[] = [];
    const edges: MindMapEdge[] = [];

    lines.forEach((line, idx) => {
      const parts = line.split(/[;,]+/).map(p => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length < 1) return;

      const label = parts[0];
      if (!label) return;

      const typeStr = parts[1] || '';
      const parentLabel = parts[2] || null;

      const id = `csv_node_${idx}`;
      const type = guessNodeType(label, typeStr);

      const nodeObj: any = {
        id,
        parentId: null,
        type,
        label,
        style: getStyleForType(type)
      };
      
      if (parentLabel) {
        nodeObj._tempParentLabel = parentLabel;
      }
      
      nodes.push(nodeObj);
    });

    nodes.forEach(node => {
      const tempParent = (node as any)._tempParentLabel;
      if (tempParent) {
        const parent = nodes.find(n => n.label.toLowerCase() === tempParent.toLowerCase());
        if (parent) {
          node.parentId = parent.id;
          edges.push({
            id: `e_csv_${parent.id}_${node.id}`,
            source: parent.id,
            target: node.id,
            type: 'dependency'
          });
        }
      }
      delete (node as any)._tempParentLabel;
    });

    return {
      nodes,
      edges,
      rootLabel: nodes[0]?.label || 'Imported CSV Map',
      layout: 'tree'
    };
  }

  private parseMarkdown(content: string, skipLayout: boolean = false): MindMapData {
    const lines = content.split('\n');
    const nodes: Omit<MindMapNode, 'mindmapId'>[] = [];
    const edges: MindMapEdge[] = [];
    let rootLabel = 'Mind Map';

    const isNumberedSectionFormat = lines.some(l => /^\d+\.\s+.{3,}/.test(l.trim()));

    if (isNumberedSectionFormat) {
      return this.parseNumberedSectionMarkdown(content, skipLayout);
    }

    const stack: { id: string; level: number }[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.trim()) continue;

      const headerMatch = line.match(/^#+\s*(.+)$/);
      if (headerMatch) {
        rootLabel = headerMatch[1].trim();
        continue;
      }

      const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s*(.+)$/);
      if (listMatch) {
        const indent = listMatch[1].length;
        let restText = listMatch[3].trim();

        let type: MindMapNodeType = 'note';
        let description = '';

        const typeMatch = restText.match(/^(.+?)\s*\((parameter|formula|dependency|note)\)(?:\s*:\s*(.+))?$/i);
        if (typeMatch) {
          restText = typeMatch[1].trim();
          type = typeMatch[2].toLowerCase() as MindMapNodeType;
          description = typeMatch[3]?.trim() || '';
        } else {
          type = guessNodeType(restText);
          const descMatch = restText.match(/^(.+?)\s*:\s*(.+)$/);
          if (descMatch) {
            restText = descMatch[1].trim();
            description = descMatch[2].trim();
          }
        }

        const nodeId = 'n_' + uuidv4().substring(0, 8);
        let parentId: string | null = null;

        while (stack.length > 0 && stack[stack.length - 1].level >= indent) {
          stack.pop();
        }
        if (stack.length > 0) {
          parentId = stack[stack.length - 1].id;
        }

        nodes.push({
          id: nodeId, parentId, type,
          label: restText,
          description: description || undefined,
          style: getStyleForType(type)
        });

        if (parentId) {
          edges.push({ id: `e_${parentId}_${nodeId}`, source: parentId, target: nodeId, type: 'flow' });
        }
        stack.push({ id: nodeId, level: indent });
      }
    }

    return { nodes, edges, rootLabel, layout: 'tree' };
  }

  private parseNumberedSectionMarkdown(content: string, skipLayout: boolean = false): MindMapData {
    const nodes: Omit<MindMapNode, 'mindmapId'>[] = [];
    const edges: MindMapEdge[] = [];

    const sectionRegex = /(?:^|\n)(\d+)\.\s+(.+?)(?=\n\d+\.\s|\s*$)/gs;
    let rootLabel = 'Système';
    let match;

    const titleLineMatch = content.match(/^(.+?)\n\d+\.\s/s);
    if (titleLineMatch) {
      const possibleTitle = titleLineMatch[1].trim().split('\n')[0];
      if (possibleTitle && possibleTitle.length > 3 && possibleTitle.length < 80) {
        rootLabel = possibleTitle;
      }
    }

    while ((match = sectionRegex.exec(content)) !== null) {
      const sectionNum = match[1];
      const sectionBlock = match[2];
      const sectionLines = sectionBlock.split('\n');
      const sectionTitle = sectionLines[0].trim();

      const sectionId = `section_${sectionNum}_${uuidv4().substring(0, 6)}`;
      const sectionType: MindMapNodeType = 'dependency';
      nodes.push({
        id: sectionId,
        parentId: null,
        type: sectionType,
        label: sectionTitle,
        description: undefined,
        style: getStyleForType(sectionType)
      });

      let currentSubtitle: string | null = null;
      let currentItemText = '';
      let subtitleNodeId: string | null = null;

      const flushItem = () => {
        const text = currentItemText.trim();
        if (!text || text === '.') return;

        const childId = 'n_' + uuidv4().substring(0, 8);
        const childType = guessNodeType(text);
        const parentId = subtitleNodeId || sectionId;

        nodes.push({
          id: childId,
          parentId,
          type: childType,
          label: text.length > 60 ? text.substring(0, 57) + '...' : text,
          description: text.length > 60 ? text : undefined,
          style: getStyleForType(childType)
        });
        edges.push({ id: `e_${parentId}_${childId}`, source: parentId, target: childId, type: 'flow' });
        currentItemText = '';
      };

      for (let i = 1; i < sectionLines.length; i++) {
        const rawL = sectionLines[i].trim();

        if (rawL === '.') {
          flushItem();
          continue;
        }

        const isSubtitle = rawL.endsWith(':') && rawL.length < 60 && !rawL.includes('.') && i < sectionLines.length - 1;
        if (isSubtitle) {
          flushItem();
          currentSubtitle = rawL.replace(/:$/, '').trim();
          const subId = `sub_${uuidv4().substring(0, 6)}`;
          nodes.push({
            id: subId,
            parentId: sectionId,
            type: 'note',
            label: currentSubtitle,
            style: getStyleForType('note')
          });
          edges.push({ id: `e_${sectionId}_${subId}`, source: sectionId, target: subId, type: 'flow' });
          subtitleNodeId = subId;
          continue;
        }

        if (rawL) {
          currentItemText += (currentItemText ? ' ' : '') + rawL;
        }
      }
      flushItem();
    }

    return { nodes, edges, rootLabel, layout: 'tree' };
  }

  private parseMermaid(content: string, skipLayout: boolean = false): MindMapData {
    const lines = content.split('\n');
    const nodesMap = new Map<string, Omit<MindMapNode, 'mindmapId'>>();
    const edges: MindMapEdge[] = [];
    
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('graph') || line.startsWith('flowchart') || line.startsWith('subgraph') || line.startsWith('end')) {
        continue;
      }

      const patterns = [
        { regex: /(\w+)\s*\{\s*(.+?)\s*\}(?=\s*-->|\s*$)/g, shape: 'rhombus' },
        { regex: /(\w+)\s*\(\(\s*(.+?)\s*\)\)(?=\s*-->|\s*$)/g, shape: 'circle' },
        { regex: /(\w+)\s*\(\s*(.+?)\s*\)(?=\s*-->|\s*$)/g, shape: 'ellipse' },
        { regex: /(\w+)\s*\[\s*(.+?)\s*\](?=\s*-->|\s*$)/g, shape: 'rectangle' }
      ] as const;

      for (const pattern of patterns) {
        pattern.regex.lastIndex = 0;
        let nodeMatch;
        while ((nodeMatch = pattern.regex.exec(line)) !== null) {
          const id = nodeMatch[1];
          const rawLabel = nodeMatch[2];
          
          let type: MindMapNodeType = 'note';
          let label = rawLabel;
          let description = '';

          const typeMatch = rawLabel.match(/^(.+?)\s*\((parameter|formula|dependency|note)\)(?:\s*:\s*(.+))?$/i);
          if (typeMatch) {
            label = typeMatch[1].trim();
            type = typeMatch[2].toLowerCase() as MindMapNodeType;
            description = typeMatch[3]?.trim() || '';
          } else {
            type = guessNodeType(rawLabel);
          }

          const existingNode = nodesMap.get(id);
          nodesMap.set(id, {
            id,
            parentId: existingNode?.parentId || null,
            type,
            label,
            description: description || undefined,
            style: {
              ...getStyleForType(type),
              shape: pattern.shape
            }
          });
        }
      }

      const edgeMatch = line.match(/(\w+)\s*(?:\[.+?\]|\(.+?\)|\{.+?\})?\s*-[->\s]*(?:\|(.+?)\|)?\s*(\w+)/);
      if (edgeMatch) {
        const source = edgeMatch[1];
        const edgeLabel = edgeMatch[2];
        const target = edgeMatch[3];

        if (!nodesMap.has(source)) {
          nodesMap.set(source, { id: source, label: source, type: 'note', style: getStyleForType('note') });
        }
        if (!nodesMap.has(target)) {
          nodesMap.set(target, { id: target, label: target, type: 'note', style: getStyleForType('note') });
        }

        edges.push({
          id: `e_${source}_${target}_${uuidv4().substring(0, 4)}`,
          source,
          target,
          label: edgeLabel || undefined,
          type: 'dependency'
        });
      }
    }

    const nodesList = Array.from(nodesMap.values());
    const incomingCount = new Map<string, number>();
    nodesList.forEach(n => incomingCount.set(n.id, 0));
    edges.forEach(e => {
      incomingCount.set(e.target, (incomingCount.get(e.target) || 0) + 1);
    });

    edges.forEach(e => {
      const child = nodesList.find(n => n.id === e.target);
      if (child && !child.parentId) {
        child.parentId = e.source;
      }
    });

    return {
      nodes: nodesList,
      edges,
      rootLabel: nodesList.find(n => (incomingCount.get(n.id) || 0) === 0)?.label || nodesList[0]?.label || 'Mermaid Graph',
      layout: 'dagre'
    };
  }

  public applyAutoLayout(nodes: Omit<MindMapNode, 'mindmapId'>[], edges: MindMapEdge[]): void {
    if (nodes.length === 0) return;

    const parentMap = new Map<string | null, Omit<MindMapNode, 'mindmapId'>[]>();
    nodes.forEach(node => {
      const pid = node.parentId || null;
      if (!parentMap.has(pid)) parentMap.set(pid, []);
      parentMap.get(pid)!.push(node);
    });

    const rootNodes = parentMap.get(null) || [nodes[0]];
    const nodeHeights = new Map<string, number>();

    const calculateSubtreeHeight = (node: Omit<MindMapNode, 'mindmapId'>): number => {
      const children = parentMap.get(node.id) || [];
      if (children.length === 0) {
        nodeHeights.set(node.id, 120);
        return 120;
      }
      const totalHeight = children.reduce((sum, child) => sum + calculateSubtreeHeight(child), 0);
      const height = Math.max(120, totalHeight);
      nodeHeights.set(node.id, height);
      return height;
    };

    rootNodes.forEach(root => calculateSubtreeHeight(root));

    const HORIZONTAL_SPACING = 300;

    const positionNode = (node: Omit<MindMapNode, 'mindmapId'>, x: number, centerY: number) => {
      node.positionX = x;
      node.positionY = centerY;

      const children = parentMap.get(node.id) || [];
      if (children.length > 0) {
        const totalSubtreeHeight = nodeHeights.get(node.id) || 120;
        let currentY = centerY - totalSubtreeHeight / 2;

        children.forEach(child => {
          const childHeight = nodeHeights.get(child.id) || 120;
          const childCenterY = currentY + childHeight / 2;
          positionNode(child, x + HORIZONTAL_SPACING, childCenterY);
          currentY += childHeight;
        });
      }
    };

    let globalY = 300;
    rootNodes.forEach(root => {
      const h = nodeHeights.get(root.id) || 120;
      positionNode(root, 100, globalY + h / 2);
      globalY += h + 200;
    });

    nodes.forEach(node => {
      if (node.positionX === null || node.positionY === null) {
        node.positionX = 100;
        node.positionY = 100;
      }
    });
  }
}

export const mindMapParser = MindMapParser.getInstance();
export default mindMapParser;