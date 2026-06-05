// src/components/mindmap/MindMapViewer.tsx
'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Search, 
  Target, 
  Eye, 
  EyeOff, 
  Compass, 
  Crosshair, 
  ChevronLeft, 
  ChevronRight 
} from 'lucide-react';
import { MindMapData, MindMapNode } from '@/ai/mindmap/types';
import { MindMapNode as NodeComponent } from './MindMapNode';

interface MindMapViewerProps {
  data: MindMapData;
  selectedNodeId: string | null;
  onNodeSelect: (node: MindMapNode | null) => void;
  scale?: number;
  zoomCenterTrigger?: number;
  onNodeMove?: (nodeId: string, x: number, y: number) => void;
}

export const MindMapViewer: React.FC<MindMapViewerProps> = ({
  data,
  selectedNodeId,
  onNodeSelect,
  scale: externalScale,
  zoomCenterTrigger = 0,
  onNodeMove
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // 🚀 Innovative Feature States
  const [viewerSearchQuery, setViewerSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [focusModeActive, setFocusModeActive] = useState(false);

  // Sync external scale if provided
  useEffect(() => {
    if (externalScale !== undefined) {
      setScale(externalScale);
    }
  }, [externalScale]);

  // Center/Fit logic on double click or manual trigger
  useEffect(() => {
    if (zoomCenterTrigger > 0) {
      handleFit();
    }
  }, [zoomCenterTrigger]);

  const handleFit = () => {
    if (data.nodes.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    data.nodes.forEach(node => {
      const nx = node.positionX ?? 100;
      const ny = node.positionY ?? 100;
      if (nx < minX) minX = nx;
      if (nx > maxX) maxX = nx;
      if (ny < minY) minY = ny;
      if (ny > maxY) maxY = ny;
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      const newScale = Math.min(
        Math.max(0.4, Math.min(clientWidth / (maxX - minX + 250), clientHeight / (maxY - minY + 200))),
        1.5
      );
      setScale(newScale);
      setPosition({
        x: clientWidth / 2 - centerX * newScale,
        y: clientHeight / 2 - centerY * newScale
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // 1. If clicking a node, start node drag if editable
    const nodeEl = (e.target as HTMLElement).closest('[data-node-id]');
    if (nodeEl && onNodeMove) {
      const nodeId = nodeEl.getAttribute('data-node-id');
      if (nodeId) {
        setDraggedNodeId(nodeId);
        // Store click offset relative to node center to prevent "jumping"
        const node = nodeMap.get(nodeId);
        if (node && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const mouseX = (e.clientX - rect.left - position.x) / scale;
          const mouseY = (e.clientY - rect.top - position.y) / scale;
          dragStart.current = { 
            x: mouseX - (node.positionX ?? 0), 
            y: mouseY - (node.positionY ?? 0) 
          };
        }
        return;
      }
    }

    // 2. Otherwise start background drag (Panning)
    if (e.target === e.currentTarget || (e.target as HTMLElement).id === 'grid-svg') {
      setIsDragging(true);
      dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedNodeId && onNodeMove && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const nx = (e.clientX - rect.left - position.x) / scale - dragStart.current.x;
      const ny = (e.clientY - rect.top - position.y) / scale - dragStart.current.y;
      onNodeMove(draggedNodeId, nx, ny);
      return;
    }

    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggedNodeId(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    // Zoom by default with wheel
    const nextScale = e.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor;
    const constrainedScale = Math.max(0.05, Math.min(nextScale, 5));

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const dx = mouseX - position.x;
      const dy = mouseY - position.y;

      setPosition({
        x: mouseX - dx * (constrainedScale / scale),
        y: mouseY - dy * (constrainedScale / scale)
      });
      setScale(constrainedScale);
    }
  };

  const handleScrollbarX = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    const { clientWidth } = containerRef.current;
    const CONTENT_SIZE = 5000 * scale;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = clickX / rect.width;
    setPosition(prev => ({
      ...prev,
      x: -percent * (CONTENT_SIZE - clientWidth)
    }));
  };

  const handleScrollbarY = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    const { clientHeight } = containerRef.current;
    const CONTENT_SIZE = 5000 * scale;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const percent = clickY / rect.height;
    setPosition(prev => ({
      ...prev,
      y: -percent * (CONTENT_SIZE - clientHeight)
    }));
  };

  // =========================================================================
  // 📏 SCROLLBAR CALCULATIONS (Visual orientation)
  // =========================================================================
  const scrollInfo = useMemo(() => {
    if (!containerRef.current) return { barX: 0, barY: 0, thumbW: 0, thumbH: 0 };
    const { clientWidth, clientHeight } = containerRef.current;
    
    // Bounds of content in viewport space
    const CONTENT_SIZE = 5000 * scale;
    
    const visiblePercentX = Math.min(1, clientWidth / CONTENT_SIZE);
    const visiblePercentY = Math.min(1, clientHeight / CONTENT_SIZE);
    
    // Position as percentage of total scrollable area
    const posX = -position.x / Math.max(1, CONTENT_SIZE - clientWidth);
    const posY = -position.y / Math.max(1, CONTENT_SIZE - clientHeight);
    
    return {
      barX: Math.max(0, Math.min(100, posX * 100)),
      barY: Math.max(0, Math.min(100, posY * 100)),
      thumbW: visiblePercentX * 100,
      thumbH: visiblePercentY * 100
    };
  }, [position, scale, data.nodes]);

  // Node lookup mapping
  const nodeMap = useMemo(() => {
    const map = new Map<string, MindMapNode>();
    data.nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [data.nodes]);

  // =========================================================================
  // 🧭 TOPO NAVIGATION & ANCESTORS PATH FINDING
  // =========================================================================
  const activePathNodeIds = useMemo(() => {
    const pathSet = new Set<string>();
    if (!selectedNodeId) return pathSet;

    let currentId: string | null = selectedNodeId;
    while (currentId) {
      pathSet.add(currentId);
      const currentNode = nodeMap.get(currentId);
      currentId = currentNode?.parentId ?? null;
    }
    return pathSet;
  }, [selectedNodeId, nodeMap]);

  // =========================================================================
  // 🌳 FOCUS MODE DESCENDANTS FINDING
  // =========================================================================
  const visibleInFocusMode = useMemo(() => {
    const descSet = new Set<string>();
    if (!selectedNodeId) return descSet;

    // Direct ancestors are kept visible
    let currentId: string | null = selectedNodeId;
    while (currentId) {
      descSet.add(currentId);
      const currentNode = nodeMap.get(currentId);
      currentId = currentNode?.parentId ?? null;
    }

    // Direct & indirect descendants are kept visible
    const queue = [selectedNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      descSet.add(current);

      data.nodes.forEach(n => {
        if (n.parentId === current && !descSet.has(n.id)) {
          queue.push(n.id);
        }
      });
    }

    return descSet;
  }, [selectedNodeId, data.nodes, nodeMap]);

  // =========================================================================
  // 🔍 NODE SEARCHING & JUMPING
  // =========================================================================
  const matchingNodes = useMemo(() => {
    if (!viewerSearchQuery.trim()) return [];
    return data.nodes.filter(n => 
      n.label.toLowerCase().includes(viewerSearchQuery.toLowerCase()) ||
      (n.description && n.description.toLowerCase().includes(viewerSearchQuery.toLowerCase())) ||
      (n.kks && n.kks.toLowerCase().includes(viewerSearchQuery.toLowerCase()))
    );
  }, [viewerSearchQuery, data.nodes]);

  const matchedNodeIds = useMemo(() => {
    return new Set(matchingNodes.map(n => n.id));
  }, [matchingNodes]);

  // Jump to specific search result
  const jumpToNode = (node: MindMapNode) => {
    if (!node || !containerRef.current) return;
    
    onNodeSelect(node);

    const nx = node.positionX ?? 100;
    const ny = node.positionY ?? 100;

    const { clientWidth, clientHeight } = containerRef.current;
    
    // Zoom in on the matched node
    const targetScale = 1.2;
    setScale(targetScale);
    setPosition({
      x: clientWidth / 2 - nx * targetScale,
      y: clientHeight / 2 - ny * targetScale
    });
  };

  const handleNextSearch = () => {
    if (matchingNodes.length === 0) return;
    const nextIdx = (searchIndex + 1) % matchingNodes.length;
    setSearchIndex(nextIdx);
    jumpToNode(matchingNodes[nextIdx]);
  };

  const handlePrevSearch = () => {
    if (matchingNodes.length === 0) return;
    const prevIdx = (searchIndex - 1 + matchingNodes.length) % matchingNodes.length;
    setSearchIndex(prevIdx);
    jumpToNode(matchingNodes[prevIdx]);
  };

  // Reset focus mode if selected node becomes null
  useEffect(() => {
    if (!selectedNodeId) {
      setFocusModeActive(false);
    }
  }, [selectedNodeId]);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      className="relative w-full h-full overflow-hidden select-none bg-slate-950/90 border border-white/10 rounded-2xl cursor-grab active:cursor-grabbing"
    >
      {/* 🌌 Cybernetic Dot Grid Background */}
      <div
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: '0 0',
          position: 'absolute',
          left: 0,
          top: 0,
          width: '5000px',
          height: '5000px',
          transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }}
      >
        <svg
          id="grid-svg"
          width="100%"
          height="100%"
          className="absolute inset-0"
          style={{ pointerEvents: 'none' }}
        >
          {/* Definitions */}
          <defs>
            <pattern id="dotGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="20" cy="20" r="1" fill="#475569" fillOpacity="0.4" />
            </pattern>
            <marker id="arrow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
            </marker>
            <marker id="arrowHighlight" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
            </marker>
          </defs>
          
          <rect width="100%" height="100%" fill="url(#dotGrid)" />

          {/* 🔗 Dynamic Glowing Bezier Connections */}
          {data.edges.map((edge) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (source && target) {
              const sx = source.positionX ?? 100;
              const sy = source.positionY ?? 100;
              const tx = target.positionX ?? 100;
              const ty = target.positionY ?? 100;

              // Cubic bezier curves
              const dx = Math.abs(tx - sx) * 0.5;
              const cx1 = sx + dx;
              const cy1 = sy;
              const cx2 = tx - dx;
              const cy2 = ty;

              // Highlighting optimal pathway connections
              const isSelectedPath = activePathNodeIds.has(edge.source) && activePathNodeIds.has(edge.target);
              
              // Dimming edges in focus mode
              const isEdgeDimmed = focusModeActive && (!visibleInFocusMode.has(edge.source) || !visibleInFocusMode.has(edge.target));

              return (
                <path
                  key={edge.id}
                  d={`M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`}
                  fill="none"
                  stroke={isSelectedPath ? '#f59e0b' : '#334155'}
                  strokeWidth={isSelectedPath ? 2.5 : 1.5}
                  strokeDasharray={edge.type === 'formula_input' ? '4,4' : undefined}
                  markerEnd={isSelectedPath ? "url(#arrowHighlight)" : "url(#arrow)"}
                  className="transition-all duration-300"
                  style={{
                    opacity: isEdgeDimmed ? 0.05 : isSelectedPath ? 1 : 0.4,
                    filter: isSelectedPath ? 'drop-shadow(0px 0px 4px rgba(245,158,11,0.6))' : 'none'
                  }}
                />
              );
            }
            return null;
          })}
        </svg>

        {/* 🏷️ Interactive Nodes Overlay */}
        {data.nodes.map((node) => {
          const isHighlighted = activePathNodeIds.has(node.id) || matchedNodeIds.has(node.id);
          const isDimmed = focusModeActive && !visibleInFocusMode.has(node.id);

          return (
            <NodeComponent
              key={node.id}
              node={node}
              isSelected={node.id === selectedNodeId}
              isHighlightedPath={isHighlighted}
              isDimmed={isDimmed}
              onClick={(e) => {
                e.stopPropagation();
                onNodeSelect(node);
              }}
            />
          );
        })}
      </div>

      {/* 🔍 Dynamic Search Panel Floating Control */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-2 max-w-sm w-full md:w-auto">
        <div className="relative flex-1 md:w-64 bg-slate-900/90 border border-white/10 rounded-xl shadow-2xl backdrop-blur-md flex items-center px-3 py-1.5 gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher un paramètre..."
            value={viewerSearchQuery}
            onChange={(e) => {
              setViewerSearchQuery(e.target.value);
              setSearchIndex(0);
            }}
            className="bg-transparent border-none focus:outline-none text-xs text-white placeholder-slate-500 w-full"
          />
          {matchingNodes.length > 0 && (
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[9px] text-slate-400 font-bold font-mono">
              <span>{searchIndex + 1}/{matchingNodes.length}</span>
            </div>
          )}
        </div>

        {matchingNodes.length > 0 && (
          <div className="flex gap-1">
            <button
              onClick={handlePrevSearch}
              className="p-2 bg-slate-900/90 border border-white/10 text-slate-400 hover:text-white rounded-xl shadow-lg transition active:scale-95"
              title="Précédent"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextSearch}
              className="p-2 bg-slate-900/90 border border-white/10 text-slate-400 hover:text-white rounded-xl shadow-lg transition active:scale-95"
              title="Suivant"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 🚀 Dynamic Controls floating overlay */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
        {selectedNodeId && (
          <button
            onClick={() => setFocusModeActive(prev => !prev)}
            className={`
              flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95
              ${focusModeActive 
                ? 'bg-amber-600 border-amber-500 text-white'
                : 'bg-slate-900/90 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800'
              }
            `}
            title={focusModeActive ? "Désactiver la vue focus" : "Focus sur cette branche spécifique"}
          >
            {focusModeActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{focusModeActive ? "Focus Actif" : "Vue Focus"}</span>
          </button>
        )}

        <button
          onClick={handleFit}
          className="p-2 bg-slate-900/90 border border-white/10 text-slate-300 hover:text-white rounded-xl shadow-lg transition active:scale-95 flex items-center justify-center"
          title="Recentrer le schéma"
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>

      {/* 📏 Modern Interactive Scrollbars */}
      {/* Vertical Scrollbar */}
      <div 
        className="absolute right-1 top-20 bottom-20 w-1.5 bg-white/5 rounded-full z-40 cursor-pointer"
        onClick={handleScrollbarY}
      >
        <div 
          className="bg-orange-500/40 hover:bg-orange-500 transition-colors rounded-full"
          style={{ 
            height: `${Math.max(10, scrollInfo.thumbH)}%`, 
            top: `${scrollInfo.barY}%`,
            position: 'absolute',
            width: '100%'
          }}
        />
      </div>
      
      {/* Horizontal Scrollbar */}
      <div 
        className="absolute bottom-1.5 left-20 right-20 h-1.5 bg-white/5 rounded-full z-40 cursor-pointer"
        onClick={handleScrollbarX}
      >
        <div 
          className="bg-orange-500/40 hover:bg-orange-500 transition-colors rounded-full"
          style={{ 
            width: `${Math.max(10, scrollInfo.thumbW)}%`, 
            left: `${scrollInfo.barX}%`,
            position: 'absolute',
            height: '100%'
          }}
        />
      </div>

      {/* Bottom info banner */}
      <div className="absolute left-4 bottom-4 z-30 flex items-center gap-4 bg-slate-900/80 border border-white/10 rounded-xl px-3 py-2 backdrop-blur-md">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
          <Compass className="w-3.5 h-3.5 text-orange-500" />
          <span>Navigation Intelligente</span>
        </div>
        <div className="w-px h-3 bg-white/10" />
        <div className="text-[10px] text-slate-400 font-semibold font-mono">
          Zoom: {Math.round(scale * 100)}%
        </div>
      </div>
    </div>
  );
};
export default MindMapViewer;
