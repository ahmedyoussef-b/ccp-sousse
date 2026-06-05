// src/components/mindmap/MindMapViewerV2.tsx
'use client';

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  Search,
  Eye,
  EyeOff,
  Crosshair,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Move,
  GripHorizontal,
} from 'lucide-react';
import type { MindMapData, MindMapNode, MindMapEdge } from '@/ai/mindmap/types';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface MindMapViewerV2Props {
  data: MindMapData;
  selectedNodeId: string | null;
  onNodeSelect: (node: MindMapNode | null) => void;
  onNodeMove?: (nodeId: string, x: number, y: number) => void;
  onDataChange?: (data: MindMapData) => void;
  scale?: number;
  zoomCenterTrigger?: number;
}

export interface MindMapViewerV2Handle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  undo: () => void;
  redo: () => void;
  addChild: () => void;
  addSibling: () => void;
  removeNode: () => void;
  editNode: () => void;
}

// ─── Constantes ─────────────────────────────────────────────────────────────

const CANVAS_SIZE = 10000;
const GRID_SIZE = 20;
const NODE_WIDTH = 180;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getNodeColor(type: string): { bg: string; border: string; text: string } {
  switch (type) {
    case 'parameter': return { bg: '#0c4a6e', border: '#0ea5e9', text: '#e0f2fe' };
    case 'formula': return { bg: '#064e3b', border: '#10b981', text: '#d1fae5' };
    case 'dependency': return { bg: '#7c2d12', border: '#f97316', text: '#ffedd5' };
    case 'note': return { bg: '#1e293b', border: '#64748b', text: '#e2e8f0' };
    default: return { bg: '#1e293b', border: '#64748b', text: '#e2e8f0' };
  }
}

interface HistoryEntry {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export const MindMapViewerV2 = forwardRef<MindMapViewerV2Handle, MindMapViewerV2Props>(
  function MindMapViewerV2(
    {
      data,
      selectedNodeId,
      onNodeSelect,
      onNodeMove,
      onDataChange,
      scale: externalScale,
      zoomCenterTrigger = 0,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    
    // Pan state
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
    
    // Drag node state
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const dragOffset = useRef({ x: 0, y: 0 });
    
    // Edit state
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');
    
    // History
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [localData, setLocalData] = useState<MindMapData>(data);
    
    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchIndex, setSearchIndex] = useState(0);
    const [focusModeActive, setFocusModeActive] = useState(false);

    // Sync localData with data prop
    useEffect(() => {
      setLocalData(data);
    }, [data]);

    // Push to history
    const pushHistory = useCallback((nodes: MindMapNode[], edges: MindMapEdge[]) => {
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
        if (newHistory.length > 50) newHistory.shift();
        return newHistory;
      });
      setHistoryIndex(prev => Math.min(prev + 1, 49));
    }, [historyIndex]);

    // Update data
    const updateData = useCallback((nodes: MindMapNode[], edges: MindMapEdge[]) => {
      pushHistory(nodes, edges);
      const newData: MindMapData = { ...localData, nodes, edges };
      setLocalData(newData);
      onDataChange?.(newData);
    }, [localData, onDataChange, pushHistory]);

    // ── Imperative Handle ──────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      zoomIn: () => setScale(s => Math.min(3, s * 1.15)),
      zoomOut: () => setScale(s => Math.max(0.2, s / 1.15)),
      fit: () => {
        if (localData.nodes.length === 0) return;
        const xs = localData.nodes.map(n => n.positionX ?? 0);
        const ys = localData.nodes.map(n => n.positionY ?? 0);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        setScale(1);
        if (containerRef.current) {
          setOffset({
            x: containerRef.current.clientWidth / 2 - cx,
            y: containerRef.current.clientHeight / 2 - cy,
          });
        }
      },
      undo: () => {
        if (historyIndex > 0) {
          const idx = historyIndex - 1;
          setHistoryIndex(idx);
          const entry = history[idx];
          const newData: MindMapData = { ...localData, nodes: entry.nodes, edges: entry.edges };
          setLocalData(newData);
          onDataChange?.(newData);
        }
      },
      redo: () => {
        if (historyIndex < history.length - 1) {
          const idx = historyIndex + 1;
          setHistoryIndex(idx);
          const entry = history[idx];
          const newData: MindMapData = { ...localData, nodes: entry.nodes, edges: entry.edges };
          setLocalData(newData);
          onDataChange?.(newData);
        }
      },
      addChild: () => {},
      addSibling: () => {},
      removeNode: () => {},
      editNode: () => {
        if (selectedNodeId) {
          const node = localData.nodes.find(n => n.id === selectedNodeId);
          if (node) {
            setEditingNodeId(node.id);
            setEditLabel(node.label);
          }
        }
      },
    }), [localData, history, historyIndex, onDataChange, selectedNodeId]);

    // ── External scale sync ────────────────────────────────────────────────
    useEffect(() => {
      if (externalScale !== undefined) setScale(externalScale);
    }, [externalScale]);

    // ── Fit trigger ─────────────────────────────────────────────────────────
    useEffect(() => {
      if (zoomCenterTrigger > 0) {
        if (localData.nodes.length === 0) return;
        const xs = localData.nodes.map(n => n.positionX ?? 0);
        const ys = localData.nodes.map(n => n.positionY ?? 0);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        if (containerRef.current) {
          setOffset({
            x: containerRef.current.clientWidth / 2 - cx,
            y: containerRef.current.clientHeight / 2 - cy,
          });
        }
      }
    }, [zoomCenterTrigger, localData.nodes]);

    // ── Pan handlers ──────────────────────────────────────────────────────
    const handleMouseDown = (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        setIsPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
        return;
      }
      if (e.target === svgRef.current || (e.target as HTMLElement).tagName === 'svg') {
        onNodeSelect(null);
      }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      if (isPanning) {
        setOffset({
          x: panStart.current.ox + (e.clientX - panStart.current.x),
          y: panStart.current.oy + (e.clientY - panStart.current.y),
        });
        return;
      }
      if (draggingNodeId && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left - offset.x) / scale - dragOffset.current.x;
        const y = (e.clientY - rect.top - offset.y) / scale - dragOffset.current.y;
        const newNodes = localData.nodes.map(n =>
          n.id === draggingNodeId ? { ...n, positionX: x, positionY: y } : n
        );
        setLocalData(prev => ({ ...prev, nodes: newNodes }));
      }
    };

    const handleMouseUp = () => {
      if (draggingNodeId) {
        const node = localData.nodes.find(n => n.id === draggingNodeId);
        if (node && onNodeMove) {
          onNodeMove(node.id, node.positionX ?? 0, node.positionY ?? 0);
        }
        pushHistory(localData.nodes, localData.edges);
        onDataChange?.({ ...localData, nodes: localData.nodes, edges: localData.edges });
        setDraggingNodeId(null);
      }
      setIsPanning(false);
    };

    // ─── Wheel zoom ─────────────────────────────────────────────────────
    const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.max(0.1, Math.min(3, scale * factor));
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        setOffset({
          x: mx - (mx - offset.x) * (newScale / scale),
          y: my - (my - offset.y) * (newScale / scale),
        });
      }
      setScale(newScale);
    };

    // ─── Node drag start ─────────────────────────────────────────────────
    const handleNodeDragStart = (e: React.DragEvent, nodeId: string) => {
      e.stopPropagation();
      e.dataTransfer.setData('text/plain', nodeId);
      e.dataTransfer.effectAllowed = 'move';
      
      const node = localData.nodes.find(n => n.id === nodeId);
      if (node && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - offset.x) / scale;
        const mouseY = (e.clientY - rect.top - offset.y) / scale;
        dragOffset.current = {
          x: mouseX - (node.positionX ?? 0),
          y: mouseY - (node.positionY ?? 0),
        };
      }
      setDraggingNodeId(nodeId);
      onNodeSelect(localData.nodes.find(n => n.id === nodeId) || null);
    };

    // ─── Double-clic pour éditer ─────────────────────────────────────────
    const handleNodeDoubleClick = (nodeId: string) => {
      const node = localData.nodes.find(n => n.id === nodeId);
      if (node) {
        setEditingNodeId(nodeId);
        setEditLabel(node.label);
      }
    };

    const handleEditSubmit = () => {
      if (editingNodeId && editLabel.trim()) {
        const newNodes = localData.nodes.map(n =>
          n.id === editingNodeId ? { ...n, label: editLabel.trim() } : n
        );
        updateData(newNodes, localData.edges);
      }
      setEditingNodeId(null);
    };

    // ─── Focus mode ─────────────────────────────────────────────────────
    useEffect(() => { if (!selectedNodeId) setFocusModeActive(false); }, [selectedNodeId]);

    const visibleNodeIds = useMemo(() => {
      if (!focusModeActive || !selectedNodeId) return new Set<string>();
      const set = new Set<string>();
      const queue = [selectedNodeId];
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (set.has(id)) continue;
        set.add(id);
        const node = localData.nodes.find(n => n.id === id);
        if (node?.parentId) queue.push(node.parentId);
        localData.nodes.filter(n => n.parentId === id).forEach(n => queue.push(n.id));
      }
      return set;
    }, [focusModeActive, selectedNodeId, localData.nodes]);

    // ─── Search ──────────────────────────────────────────────────────────
    const matchingNodes = useMemo(() => {
      if (!searchQuery.trim()) return [];
      const q = searchQuery.toLowerCase();
      return localData.nodes.filter(n =>
        n.label.toLowerCase().includes(q) ||
        n.description?.toLowerCase().includes(q) ||
        n.kks?.toLowerCase().includes(q)
      );
    }, [searchQuery, localData.nodes]);

    const jumpToNode = (node: MindMapNode) => {
      onNodeSelect(node);
      if (containerRef.current) {
        const nx = node.positionX ?? 0;
        const ny = node.positionY ?? 0;
        setScale(1.2);
        setOffset({
          x: containerRef.current.clientWidth / 2 - nx * 1.2,
          y: containerRef.current.clientHeight / 2 - ny * 1.2,
        });
      }
    };

    // ─── Node map for edges ──────────────────────────────────────────────
    const nodeMap = useMemo(() => {
      const map = new Map<string, MindMapNode>();
      localData.nodes.forEach(n => map.set(n.id, n));
      return map;
    }, [localData.nodes]);

    // ─── Render ──────────────────────────────────────────────────────────
    const cursorStyle = isPanning ? 'cursor-grabbing' : draggingNodeId ? 'cursor-grabbing' : 'cursor-grab';

    return (
      <div
        ref={containerRef}
        className={`relative w-full h-full overflow-hidden select-none bg-slate-950/90 border border-white/10 rounded-2xl ${cursorStyle}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={e => e.preventDefault()}
      >
        {/* Canvas */}
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            position: 'absolute',
            left: 0,
            top: 0,
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            pointerEvents: draggingNodeId ? 'none' : 'auto',
          }}
        >
          {/* Grid + Edges */}
          <svg
            ref={svgRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="absolute inset-0"
            style={{ pointerEvents: 'none' }}
          >
            <defs>
              <pattern id="grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
                <circle cx={GRID_SIZE / 2} cy={GRID_SIZE / 2} r={0.5} fill="#475569" fillOpacity={0.3} />
              </pattern>
              {/* Flèche standard */}
              <marker id="arrowhead" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#94a3b8" />
              </marker>
              {/* Flèche highlight (orange) */}
              <marker id="arrowheadHighlight" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#f97316" />
              </marker>
              {/* Filtre de lueur pour les liaisons */}
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Edges */}
            {localData.edges.map(edge => {
              const source = nodeMap.get(edge.source);
              const target = nodeMap.get(edge.target);
              if (!source || !target) return null;
              const sx = source.positionX ?? 0;
              const sy = source.positionY ?? 0;
              const tx = target.positionX ?? 0;
              const ty = target.positionY ?? 0;
              const dx = Math.abs(tx - sx) * 0.5;
              const d = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
              
              const isSelected = selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId);
              const dimmed = focusModeActive && (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target));
              
              const strokeColor = isSelected ? '#f97316' : '#94a3b8';
              const strokeWidth = isSelected ? 3 : 2.5;
              const opacity = dimmed ? 0.15 : 1;
              
              return (
                <g key={edge.id}>
                  {/* Lueur/ombre derrière la ligne */}
                  <path
                    d={d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth + 4}
                    opacity={opacity * 0.15}
                    strokeLinecap="round"
                    filter="url(#glow)"
                  />
                  {/* Ligne principale */}
                  <path
                    d={d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={edge.type === 'formula_input' ? '8,4' : undefined}
                    opacity={opacity}
                    strokeLinecap="round"
                    markerEnd={isSelected ? "url(#arrowheadHighlight)" : "url(#arrowhead)"}
                  />
                  {/* Point de connexion au départ */}
                  <circle cx={sx} cy={sy} r={4} fill={strokeColor} opacity={opacity * 0.8} />
                  {/* Point de connexion à l'arrivée (si pas déjà couvert par la flèche) */}
                  <circle cx={tx} cy={ty} r={3} fill={strokeColor} opacity={opacity * 0.6} />
                </g>
              );
            })}
          </svg>

          {/* Nodes */}
          {localData.nodes.map(node => {
            const colors = getNodeColor(node.type);
            const isSelected = node.id === selectedNodeId;
            const isEditing = node.id === editingNodeId;
            const dimmed = focusModeActive && !visibleNodeIds.has(node.id);
            const isSearchMatch = matchingNodes.some(n => n.id === node.id);

            return (
              <div
                key={node.id}
                data-node-id={node.id}
                style={{
                  position: 'absolute',
                  left: node.positionX ?? 0,
                  top: node.positionY ?? 0,
                  transform: 'translate(-50%, -50%)',
                  opacity: dimmed ? 0.1 : 1,
                  zIndex: isSelected ? 10 : 1,
                }}
              >
                {isEditing ? (
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    onBlur={handleEditSubmit}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleEditSubmit();
                      if (e.key === 'Escape') setEditingNodeId(null);
                    }}
                    className="px-3 py-1.5 rounded-lg border-2 border-orange-500 bg-slate-900 text-white text-xs font-semibold outline-none"
                    style={{ width: NODE_WIDTH }}
                  />
                ) : (
                  <div
                    draggable
                    onDragStart={e => handleNodeDragStart(e, node.id)}
                    onDoubleClick={() => handleNodeDoubleClick(node.id)}
                    onClick={e => {
                      e.stopPropagation();
                      onNodeSelect(node);
                    }}
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-xl border-2 backdrop-blur-sm
                      transition-all duration-200 hover:scale-105
                      ${isSelected ? 'ring-2 ring-orange-500 border-orange-500 shadow-lg shadow-orange-500/20' : ''}
                      ${isSearchMatch && !isSelected ? 'ring-1 ring-yellow-400 shadow-lg shadow-yellow-400/10' : ''}
                    `}
                    style={{
                      backgroundColor: colors.bg,
                      borderColor: isSelected ? '#f97316' : colors.border,
                      color: colors.text,
                      minWidth: NODE_WIDTH,
                      cursor: 'grab',
                      boxShadow: isSelected ? '0 0 20px rgba(249, 115, 22, 0.3)' : '0 2px 8px rgba(0,0,0,0.3)',
                    }}
                  >
                    <GripHorizontal className="w-3 h-3 opacity-50 shrink-0 cursor-grab" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{node.label}</div>
                      {node.description && (
                        <div className="text-[10px] opacity-70 truncate mt-0.5">{node.description}</div>
                      )}
                    </div>
                    {node.type === 'parameter' && node.unit && (
                      <span className="text-[9px] opacity-50 shrink-0 bg-white/10 px-1.5 py-0.5 rounded">{node.unit}</span>
                    )}
                    {node.criticality && node.criticality !== 'low' && (
                      <span className={`text-[8px] font-bold uppercase shrink-0 px-1.5 py-0.5 rounded ${
                        node.criticality === 'critical' ? 'bg-red-500/20 text-red-300' :
                        node.criticality === 'high' ? 'bg-orange-500/20 text-orange-300' :
                        'bg-yellow-500/20 text-yellow-300'
                      }`}>
                        {node.criticality}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ─── UI Overlays ─────────────────────────────────────────────────── */}

        {/* Search panel */}
        <div className="absolute top-4 left-4 z-30 flex items-center gap-2 max-w-sm">
          <div className="relative flex-1 md:w-64 bg-slate-900/90 border border-white/10 rounded-xl shadow-2xl backdrop-blur-md flex items-center px-3 py-1.5 gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Rechercher un nœud..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchIndex(0); }}
              className="bg-transparent border-none focus:outline-none text-xs text-white placeholder-slate-500 w-full"
            />
            {matchingNodes.length > 0 && (
              <div className="text-[9px] text-slate-400 font-mono shrink-0">
                {searchIndex + 1}/{matchingNodes.length}
              </div>
            )}
          </div>
          {matchingNodes.length > 0 && (
            <div className="flex gap-1">
              <button onClick={() => { const i = (searchIndex - 1 + matchingNodes.length) % matchingNodes.length; setSearchIndex(i); jumpToNode(matchingNodes[i]); }}
                className="p-2 bg-slate-900/90 border border-white/10 text-slate-400 hover:text-white rounded-xl transition active:scale-95">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => { const i = (searchIndex + 1) % matchingNodes.length; setSearchIndex(i); jumpToNode(matchingNodes[i]); }}
                className="p-2 bg-slate-900/90 border border-white/10 text-slate-400 hover:text-white rounded-xl transition active:scale-95">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Top-right controls */}
        <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
          <div className="flex gap-1 bg-slate-900/90 border border-white/10 rounded-xl p-1">
            <button onClick={() => { if (historyIndex > 0) { const idx = historyIndex - 1; setHistoryIndex(idx); const entry = history[idx]; setLocalData({ ...localData, nodes: entry.nodes, edges: entry.edges }); onDataChange?.({ ...localData, nodes: entry.nodes, edges: entry.edges }); } }}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition active:scale-95" title="Annuler (Ctrl+Z)">
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { if (historyIndex < history.length - 1) { const idx = historyIndex + 1; setHistoryIndex(idx); const entry = history[idx]; setLocalData({ ...localData, nodes: entry.nodes, edges: entry.edges }); onDataChange?.({ ...localData, nodes: entry.nodes, edges: entry.edges }); } }}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition active:scale-95" title="Rétablir (Ctrl+Y)">
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-1 bg-slate-900/90 border border-white/10 rounded-xl p-1">
            <button onClick={() => setScale(s => Math.min(3, s * 1.15))}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition active:scale-95" title="Zoomer">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setScale(s => Math.max(0.2, s / 1.15))}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition active:scale-95" title="Dézoomer">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>
          {selectedNodeId && (
            <button onClick={() => setFocusModeActive(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 ${focusModeActive ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-900/90 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800'}`}>
              {focusModeActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{focusModeActive ? 'Focus' : 'Focus'}</span>
            </button>
          )}
          <button onClick={() => {
            if (localData.nodes.length === 0) return;
            const xs = localData.nodes.map(n => n.positionX ?? 0);
            const ys = localData.nodes.map(n => n.positionY ?? 0);
            const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
            const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
            setScale(1);
            if (containerRef.current) {
              setOffset({ x: containerRef.current.clientWidth / 2 - cx, y: containerRef.current.clientHeight / 2 - cy });
            }
          }} className="p-2 bg-slate-900/90 border border-white/10 text-slate-300 hover:text-white rounded-xl transition active:scale-95" title="Recentrer">
            <Crosshair className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom hint */}
        <div className="absolute bottom-4 left-4 z-30 bg-slate-900/80 border border-white/10 rounded-xl px-3 py-2 backdrop-blur-md text-[10px] text-slate-400 flex items-center gap-3">
          <span>🖱️ Glissez les nœuds</span>
          <span className="text-slate-600">|</span>
          <span>Ctrl+clic = déplacer canvas</span>
          <span className="text-slate-600">|</span>
          <span>Double-clic = éditer</span>
          <span className="text-slate-600">|</span>
          <span>Molette = zoom</span>
        </div>

        {/* Focus mode overlay */}
        {focusModeActive && (
          <div className="absolute inset-0 pointer-events-none z-20 bg-slate-950/40 mix-blend-multiply rounded-2xl" />
        )}
      </div>
    );
  }
);

MindMapViewerV2.displayName = 'MindMapViewerV2';
export default MindMapViewerV2;