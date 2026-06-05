// src/app/api/circuit-mindmap/[circuitId]/render/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mindMapManager } from '@/ai/mindmap/mindmap-manager';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ circuitId: string }> }
) {
  try {
    const { circuitId } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'mermaid'; // 'mermaid' | 'svg' | 'json'

    const mindmap = mindMapManager.getMindMapByCircuit(circuitId);
    if (!mindmap) {
      return NextResponse.json(
        { success: false, error: `Aucun Mind Map trouvé pour le circuit ${circuitId}.` },
        { status: 404 }
      );
    }

    const { nodes, edges, rootLabel } = mindmap.mindmapData;

    // 1. MERMAID RENDERER
    if (format === 'mermaid') {
      let mermaidCode = `graph TD\n`;
      
      // Node styles mapping to CSS classes
      let styleCode = ``;
      
      // Map nodes to Mermaid syntax
      nodes.forEach(node => {
        const shapeStart = node.type === 'parameter' ? '(("' : node.type === 'formula' ? '{"' : '["';
        const shapeEnd = node.type === 'parameter' ? '"))' : node.type === 'formula' ? '"}' : '"]';
        
        let label = node.label;
        if (node.description) {
          label += `\\n(${node.description.substring(0, 40)}${node.description.length > 40 ? '...' : ''})`;
        }
        
        mermaidCode += `  ${node.id}${shapeStart}${label}${shapeEnd}\n`;
        
        // Define colors per node type
        let style = '';
        if (node.type === 'parameter') {
          style = `style ${node.id} fill:#0284c7,stroke:#38bdf8,stroke-width:2px,color:#ffffff`;
        } else if (node.type === 'formula') {
          style = `style ${node.id} fill:#16a34a,stroke:#4ade80,stroke-width:2px,color:#ffffff`;
        } else if (node.type === 'dependency') {
          style = `style ${node.id} fill:#ea580c,stroke:#f97316,stroke-width:2px,color:#ffffff`;
        } else {
          style = `style ${node.id} fill:#f8fafc,stroke:#cbd5e1,stroke-width:1px,color:#0f172a`;
        }
        styleCode += `  ${style}\n`;
      });

      // Map edges to Mermaid
      edges.forEach(edge => {
        mermaidCode += `  ${edge.source} --> ${edge.target}\n`;
      });

      mermaidCode += `\n%% Stylisation\n${styleCode}`;

      return new NextResponse(mermaidCode, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // 2. SVG RENDERING (Visual Representation)
    if (format === 'svg') {
      if (nodes.length === 0) {
        return new NextResponse('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="50">Vide</text></svg>', {
          headers: { 'Content-Type': 'image/svg+xml' }
        });
      }

      // Compute boundaries
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      nodes.forEach(n => {
        const x = n.positionX ?? 100;
        const y = n.positionY ?? 100;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      });

      // Normalize and add padding
      const padding = 100;
      const width = Math.max(maxX - minX + padding * 2, 800);
      const height = Math.max(maxY - minY + padding * 2, 600);
      const offsetX = minX - padding;
      const offsetY = minY - padding;

      // Group nodes by ID for fast path coordinates lookup
      const nodeMap = new Map<string, typeof nodes[0]>();
      nodes.forEach(n => nodeMap.set(n.id, n));

      let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" style="background-color: #0f172a; font-family: ui-sans-serif, system-ui, sans-serif;">\n`;
      
      // Definitions for gradients & arrows
      svgContent += `  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/>
    </marker>
    <linearGradient id="rootGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f97316"/>
      <stop offset="100%" stop-color="#ea580c"/>
    </linearGradient>
    <linearGradient id="paramGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
    <linearGradient id="formulaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4ade80"/>
      <stop offset="100%" stop-color="#16a34a"/>
    </linearGradient>
  </defs>\n`;

      // 1. Draw connections (Edges)
      edges.forEach(edge => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (source && target) {
          const sx = (source.positionX ?? 100) - offsetX;
          const sy = (source.positionY ?? 100) - offsetY;
          const tx = (target.positionX ?? 100) - offsetX;
          const ty = (target.positionY ?? 100) - offsetY;
          
          // Draw nice curved cubic bezier line
          const dx = Math.abs(tx - sx) * 0.5;
          const cx1 = sx + dx;
          const cy1 = sy;
          const cx2 = tx - dx;
          const cy2 = ty;

          svgContent += `  <path d="M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}" fill="none" stroke="#475569" stroke-width="2" marker-end="url(#arrow)"/>\n`;
        }
      });

      // 2. Draw nodes
      nodes.forEach(node => {
        const x = (node.positionX ?? 100) - offsetX;
        const y = (node.positionY ?? 100) - offsetY;
        
        let fill = '#1e293b';
        let stroke = '#475569';
        let grad = '';
        
        if (node.type === 'dependency') {
          grad = 'url(#rootGrad)';
          stroke = '#fdba74';
        } else if (node.type === 'parameter') {
          grad = 'url(#paramGrad)';
          stroke = '#7dd3fc';
        } else if (node.type === 'formula') {
          grad = 'url(#formulaGrad)';
          stroke = '#86efac';
        } else {
          fill = '#1e293b';
          stroke = '#64748b';
        }

        // Draw node container
        if (node.type === 'parameter') {
          // Oval / Ellipse shape
          svgContent += `  <ellipse cx="${x}" cy="${y}" rx="80" ry="30" fill="${grad || fill}" stroke="${stroke}" stroke-width="2" filter="drop-shadow(0px 4px 6px rgba(0,0,0,0.3))"/>\n`;
        } else if (node.type === 'formula') {
          // Hexagon/Diamond represented as clean rounded rect or actual polygon
          svgContent += `  <rect x="${x - 85}" y="${y - 30}" width="170" height="60" rx="10" fill="${grad || fill}" stroke="${stroke}" stroke-width="2" filter="drop-shadow(0px 4px 6px rgba(0,0,0,0.3))"/>\n`;
        } else {
          // Standard rect
          svgContent += `  <rect x="${x - 90}" y="${y - 32}" width="180" height="64" rx="8" fill="${grad || fill}" stroke="${stroke}" stroke-width="2" filter="drop-shadow(0px 4px 6px rgba(0,0,0,0.3))"/>\n`;
        }

        // Label
        svgContent += `  <text x="${x}" y="${y - 2}" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="bold">${node.label}</text>\n`;
        // Type badge or description snippet
        const subtitle = node.type.toUpperCase();
        svgContent += `  <text x="${x}" y="${y + 14}" text-anchor="middle" fill="#94a3b8" font-size="9" letter-spacing="1">${subtitle}</text>\n`;
      });

      svgContent += `</svg>`;

      return new NextResponse(svgContent, {
        headers: { 'Content-Type': 'image/svg+xml' }
      });
    }

    // 3. JSON RENDER
    return NextResponse.json({ success: true, mindmap });

  } catch (error) {
    console.error('[API-MINDMAP-RENDER] ❌ Erreur:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
