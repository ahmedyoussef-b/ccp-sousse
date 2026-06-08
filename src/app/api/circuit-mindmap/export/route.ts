export const runtime = 'edge';

// src/app/api/circuit-mindmap/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mindMapManager } from '@/ai/mindmap/mindmap-manager';
import { mindMapRagBridge } from '@/ai/mindmap/mindmap-rag-bridge';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const circuitId = searchParams.get('circuitId');
    const format = searchParams.get('format') || 'json'; // 'json' | 'markdown' | 'mermaid'

    if (!circuitId) {
      return NextResponse.json(
        { success: false, error: 'Le paramètre circuitId est requis.' },
        { status: 400 }
      );
    }

    const mindmap = mindMapManager.getMindMapByCircuit(circuitId);
    if (!mindmap) {
      return NextResponse.json(
        { success: false, error: `Aucun Mind Map trouvé pour le circuit ${circuitId}.` },
        { status: 404 }
      );
    }

    const { nodes, edges } = mindmap.mindmapData;

    // 1. JSON EXPORT
    if (format === 'json') {
      return new NextResponse(JSON.stringify(mindmap, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="mindmap_${circuitId}.json"`
        }
      });
    }

    // 2. MARKDOWN EXPORT
    if (format === 'markdown') {
      const ragContext = mindMapRagBridge.getMindMapContextForCircuit(circuitId);
      const markdownContent = ragContext ? ragContext.markdown : `# Mind Map ${circuitId}\n(Vide)`;
      
      return new NextResponse(markdownContent, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="mindmap_${circuitId}.md"`
        }
      });
    }

    // 4. SVG EXPORT (High-Resolution Graphic)
    if (format === 'svg') {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodes.forEach(n => {
        const x = n.positionX ?? 0, y = n.positionY ?? 0;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      });

      const width = (maxX - minX) + 400;
      const height = (maxY - minY) + 200;
      const offsetX = -minX + 200;
      const offsetY = -minY + 100;

      let svgCode = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#020617"/>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
          </marker>
        </defs>
        <style>
          .node { font-family: 'Inter', sans-serif; }
          .label { font-size: 12px; font-weight: bold; fill: white; }
          .desc { font-size: 9px; fill: rgba(255,255,255,0.6); }
          .edge { stroke: #334155; stroke-width: 1.5; fill: none; }
          .parameter { fill: #0c4a6e; stroke: #0ea5e9; }
          .formula { fill: #064e3b; stroke: #10b881; }
          .dependency { fill: #431407; stroke: #f97316; }
        </style>\n`;

      // Draw Edges
      edges.forEach(edge => {
        const s = nodes.find(n => n.id === edge.source);
        const t = nodes.find(n => n.id === edge.target);
        if (s && t) {
          const sx = (s.positionX ?? 0) + offsetX, sy = (s.positionY ?? 0) + offsetY;
          const tx = (t.positionX ?? 0) + offsetX, ty = (t.positionY ?? 0) + offsetY;
          const dx = Math.abs(tx - sx) * 0.5;
          svgCode += `  <path d="M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}" class="edge" marker-end="url(#arrow)" />\n`;
        }
      });

      // Draw Nodes
      nodes.forEach(node => {
        const nx = (node.positionX ?? 0) + offsetX;
        const ny = (node.positionY ?? 0) + offsetY;
        const cls = node.type || 'note';
        svgCode += `  <g transform="translate(${nx - 90}, ${ny - 25})">
          <rect width="180" height="50" rx="10" class="node ${cls}" stroke-width="1" />
          <text x="10" y="20" class="label">${node.label.substring(0, 25)}</text>
          <text x="10" y="38" class="desc">${(node.description || '').substring(0, 40)}</text>
        </g>\n`;
      });

      svgCode += `</svg>`;

      return new NextResponse(svgCode, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Content-Disposition': `attachment; filename="mindmap_${circuitId}.svg"`
        }
      });
    }

    // 5. MERMAID EXPORT
    if (format === 'mermaid') {
      let mermaidCode = `graph TD\n`;
      nodes.forEach(node => {
        const shapeStart = node.type === 'parameter' ? '(("' : node.type === 'formula' ? '{"' : '["';
        const shapeEnd = node.type === 'parameter' ? '"))' : node.type === 'formula' ? '"}' : '"]';
        mermaidCode += `  ${node.id}${shapeStart}${node.label}${shapeEnd}\n`;
      });
      edges.forEach(edge => {
        mermaidCode += `  ${edge.source} --> ${edge.target}\n`;
      });

      return new NextResponse(mermaidCode, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="mindmap_${circuitId}.mermaid"`
        }
      });
    }

    return NextResponse.json(
      { success: false, error: `Format d'export ${format} non supporté.` },
      { status: 400 }
    );

  } catch (error) {
    console.error('[API-MINDMAP-EXPORT] ❌ Erreur:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
