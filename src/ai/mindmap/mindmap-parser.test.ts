// src/ai/mindmap/mindmap-parser.test.ts
import { describe, it, expect } from 'vitest';
import { mindMapParser } from './mindmap-parser';

describe('MindMapParser', () => {
  describe('detectFormat', () => {
    it('should detect JSON format correctly', () => {
      const content = '{"nodes": [], "edges": []}';
      // Accessing private method via bracket notation for testing
      const format = (mindMapParser as any).detectFormat(content);
      expect(format).toBe('json');
    });

    it('should detect Mermaid format correctly', () => {
      const content = 'graph TD\nA --> B';
      const format = (mindMapParser as any).detectFormat(content);
      expect(format).toBe('mermaid');
    });

    it('should fallback to markdown', () => {
      const content = 'Some random text\n- List item';
      const format = (mindMapParser as any).detectFormat(content);
      expect(format).toBe('markdown');
    });
  });

  describe('parseJSON', () => {
    it('should parse a valid JSON mindmap', () => {
      const mindmapJson = JSON.stringify({
        rootLabel: 'Test Root',
        layout: 'tree',
        nodes: [
          { id: '1', label: 'Root Node', type: 'note' },
          { id: '2', parentId: '1', label: 'TE101', type: 'parameter' }
        ],
        edges: [
          { id: 'e1', source: '1', target: '2', type: 'dependency' }
        ]
      });

      const result = mindMapParser.parse(mindmapJson);
      
      expect(result.rootLabel).toBe('Test Root');
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].label).toBe('Root Node');
      expect(result.nodes[1].type).toBe('parameter');
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].source).toBe('1');
    });
  });

  describe('parseMarkdown', () => {
    it('should parse Markdown header and bullet points', () => {
      const markdown = `
# Circuit Alpha
- Température Circuit (parameter) : Capteur principal
  - Seuil Haut (parameter)
- Pompe de Secours (dependency)
      `;

      const result = mindMapParser.parse(markdown);
      
      expect(result.rootLabel).toBe('Circuit Alpha');
      expect(result.nodes).toHaveLength(3);
      
      // Node 0
      expect(result.nodes[0].label).toBe('Température Circuit');
      expect(result.nodes[0].type).toBe('parameter');
      expect(result.nodes[0].description).toBe('Capteur principal');
      
      // Node 1 (Child of Node 0)
      expect(result.nodes[1].label).toBe('Seuil Haut');
      expect(result.nodes[1].parentId).toBe(result.nodes[0].id);
      
      // Node 2 (Sibling of Node 0, no parent)
      expect(result.nodes[2].label).toBe('Pompe de Secours');
      expect(result.nodes[2].type).toBe('dependency');
      expect(result.nodes[2].parentId).toBeNull();
    });
  });

  describe('parseMermaid', () => {
    it('should parse Mermaid graphs into mindmap nodes and edges', () => {
      const mermaid = `
graph TD
  A[Echangeur Principal] --> B(Pression Entrée (parameter) : Capteur A)
  B --> C{Calcul Rendement (formula)}
      `;

      const result = mindMapParser.parse(mermaid);
      
      expect(result.nodes).toHaveLength(3);
      
      const nodeA = result.nodes.find(n => n.id === 'A');
      const nodeB = result.nodes.find(n => n.id === 'B');
      const nodeC = result.nodes.find(n => n.id === 'C');
      
      expect(nodeA).toBeDefined();
      expect(nodeB).toBeDefined();
      expect(nodeC).toBeDefined();
      
      expect(nodeB?.label).toBe('Pression Entrée');
      expect(nodeB?.type).toBe('parameter');
      expect(nodeB?.description).toBe('Capteur A');
      
      expect(nodeC?.type).toBe('formula');
      
      expect(result.edges).toHaveLength(2);
    });
  });

  describe('guessNodeType', () => {
    it('should guess correct node types based on keywords', () => {
      const parser = mindMapParser as any;
      expect(parser.guessNodeType('Température Entrée')).toBe('parameter');
      expect(parser.guessNodeType('Pression TE-101')).toBe('parameter');
      expect(parser.guessNodeType('Débitmètre')).toBe('parameter');
      
      expect(parser.guessNodeType('Calcul Coeff')).toBe('formula');
      expect(parser.guessNodeType('A + B = C')).toBe('formula');
      
      expect(parser.guessNodeType('Pompe de charge')).toBe('dependency');
      expect(parser.guessNodeType('Vanne bypass')).toBe('dependency');
      
      expect(parser.guessNodeType('Quelque chose de quelconque')).toBe('note');
    });
  });
});
