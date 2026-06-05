// src/components/mindmap/MindMapEditor.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { 
  MindMapData, 
  MindMapNode, 
  MindMapEdge,
  CircuitMindMap
} from '@/ai/mindmap/types';
import { MindMapViewerV2, MindMapViewerV2Handle } from './MindMapViewerV2';
import { exportToPDF, exportToXMind, triggerDownload } from '@/lib/mindmap-adapters/simple-mindmap-exporter';
import { MindMapMetadataPanel } from './MindMapMetadataPanel';
import { MindMapUploader } from './MindMapUploader';
import MindMapShortcutsHelp from './MindMapShortcutsHelp';
import {
  ZoomIn, ZoomOut, Maximize, Sparkles, Plus, Save, Download, Upload,
  Trash2, Copy, Scissors, ClipboardPaste, Undo2, Redo2,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  GitBranch, Link, Image, FileText, ExternalLink,
  Layout, Grid3X3, Keyboard, Settings, Eye, EyeOff,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Hash, Tag, Square, Circle, Hexagon, Palette, Printer, Eraser,
  PanelLeft, Move, MousePointer2, ArrowRightLeft,
} from 'lucide-react';

interface MindMapEditorProps {
  circuitId: string;
  initialMindMap: CircuitMindMap | null;
  dbParameters: Array<{ id: string; name: string; unit?: string }>;
  onSave: (data: MindMapData) => Promise<void>;
  isSaving?: boolean;
}

const SidebarButton: React.FC<{
  icon: React.ReactNode;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  primary?: boolean;
}> = ({ icon, title, onClick, disabled, active, danger, primary }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`
      w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150
      ${active ? 'bg-orange-600 text-white' : 
        danger ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300' :
        primary ? 'text-orange-400 hover:bg-orange-500/10 hover:text-orange-300' :
        'text-slate-400 hover:bg-white/5 hover:text-white'}
      ${disabled ? 'opacity-30 cursor-not-allowed' : 'active:scale-90'}
    `}
  >
    {icon}
  </button>
);

export const MindMapEditor: React.FC<MindMapEditorProps> = ({
  circuitId,
  initialMindMap,
  dbParameters,
  onSave,
  isSaving = false
}) => {
  const [mindmapData, setMindmapData] = useState<MindMapData>({
    nodes: [],
    edges: [],
    rootLabel: circuitId,
    layout: 'tree'
  });
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [focusModeActive, setFocusModeActive] = useState(false);
  const [clipboardNode, setClipboardNode] = useState<MindMapNode | null>(null);
  const [lastSaveStatus, setLastSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showMetadata, setShowMetadata] = useState(true);
  const [globalDragMode, setGlobalDragMode] = useState(false);
  const [isDraggingAll, setIsDraggingAll] = useState(false);
  const dragAllStart = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<MindMapViewerV2Handle>(null);

  useEffect(() => {
    if (initialMindMap) {
      setMindmapData(initialMindMap.mindmapData);
    } else {
      setMindmapData({
        nodes: [{
          id: 'root', parentId: null, type: 'dependency',
          label: circuitId, description: `Circuit principal ${circuitId}`,
          positionX: 400, positionY: 300,
          style: { color: '#ffffff', backgroundColor: '#ea580c', borderColor: '#f97316' }
        }],
        edges: [],
        rootLabel: circuitId,
        layout: 'tree'
      });
    }
  }, [initialMindMap, circuitId]);

  const selectedNode = mindmapData.nodes.find(n => n.id === selectedNodeId) || null;

  const handleZoomIn = () => viewerRef.current?.zoomIn();
  const handleZoomOut = () => viewerRef.current?.zoomOut();
  const handleZoomReset = () => viewerRef.current?.fit();
  const handleAutoLayout = () => viewerRef.current?.fit();

  const handleClearAll = async () => {
    try {
      const resp = await fetch(`/api/circuit-mindmap/${circuitId}`, { method: 'DELETE' });
      const data = await resp.json();
      if (data.success) {
        setMindmapData({
          nodes: [{
            id: 'root', parentId: null, type: 'dependency',
            label: circuitId, description: `Circuit principal ${circuitId}`,
            positionX: 400, positionY: 300,
            style: { color: '#ffffff', backgroundColor: '#ea580c', borderColor: '#f97316' }
          }],
          edges: [], rootLabel: circuitId, layout: 'tree'
        });
        setSelectedNodeId(null);
        setClipboardNode(null);
        await onSave({
          nodes: [{
            id: 'root', parentId: null, type: 'dependency',
            label: circuitId, description: `Circuit principal ${circuitId}`,
            positionX: 400, positionY: 300,
            style: { color: '#ffffff', backgroundColor: '#ea580c', borderColor: '#f97316' }
          }],
          edges: [], rootLabel: circuitId, layout: 'tree'
        });
        setLastSaveStatus('saved');
        setTimeout(() => setLastSaveStatus('idle'), 2000);
      } else {
        alert(`Erreur: ${data.error || 'Échec de la suppression'}`);
      }
    } catch (err) {
      console.error('[MINDMAP-CLEAR] Erreur:', err);
      alert('Impossible de joindre le serveur.');
    }
  };

  const handleAddNode = (type: 'parameter' | 'formula' | 'dependency' | 'note' | 'root') => {
    const newNodeId = `${type}_${uuidv4().substring(0, 8)}`;
    const parent = selectedNodeId || (mindmapData.nodes.length > 0 ? mindmapData.nodes[0].id : null);
    const parentNode = mindmapData.nodes.find(n => n.id === parent);
    const px = parentNode?.positionX ?? 400;
    const py = parentNode?.positionY ?? 300;

    const styleMap: Record<string, any> = {
      parameter: { color: '#ffffff', backgroundColor: '#0284c7', borderColor: '#38bdf8' },
      formula: { color: '#ffffff', backgroundColor: '#16a34a', borderColor: '#4ade80' },
      dependency: { color: '#ffffff', backgroundColor: '#ea580c', borderColor: '#f97316' },
      note: { color: '#0f172a', backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' },
      root: { color: '#ffffff', backgroundColor: '#ea580c', borderColor: '#f97316' }
    };

    const newNode: MindMapNode = {
      id: newNodeId, parentId: parent, type: type as any,
      label: type === 'root' ? circuitId : `Nouveau ${type}`,
      description: null,
      positionX: px + 180, positionY: py + (Math.random() - 0.5) * 120,
      style: styleMap[type] || styleMap.parameter
    };

    setMindmapData(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      edges: parent ? [...prev.edges, { id: `e_${parent}_${newNodeId}`, source: parent, target: newNodeId, type: 'flow' } as MindMapEdge] : prev.edges
    }));
    setSelectedNodeId(newNodeId);
  };

  const handleUpdateNode = (updatedNode: MindMapNode) => {
    setMindmapData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === updatedNode.id ? updatedNode : n)
    }));
  };

  const handleDeleteNode = (nodeId: string) => {
    if (nodeId === 'root') return;
    const nodesToDelete = new Set<string>([nodeId]);
    let prevSize = 0;
    while (nodesToDelete.size > prevSize) {
      prevSize = nodesToDelete.size;
      mindmapData.nodes.forEach(n => {
        if (n.parentId && nodesToDelete.has(n.parentId)) nodesToDelete.add(n.id);
      });
    }
    setMindmapData(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => !nodesToDelete.has(n.id)),
      edges: prev.edges.filter(e => !nodesToDelete.has(e.source) && !nodesToDelete.has(e.target))
    }));
    if (nodesToDelete.has(selectedNodeId || '')) setSelectedNodeId(null);
  };

  const handleCopyNode = () => { if (selectedNode) setClipboardNode({ ...selectedNode }); };
  const handleCutNode = () => { if (selectedNode) { setClipboardNode({ ...selectedNode }); handleDeleteNode(selectedNode.id); } };
  const handlePasteNode = () => {
    if (clipboardNode && selectedNodeId) {
      const newNode: MindMapNode = {
        ...clipboardNode, id: `${clipboardNode.type}_${uuidv4().substring(0, 8)}`,
        parentId: selectedNodeId,
        positionX: (selectedNode?.positionX ?? 400) + 150,
        positionY: (selectedNode?.positionY ?? 300) + 50
      };
      setMindmapData(prev => ({
        ...prev,
        nodes: [...prev.nodes, newNode],
        edges: [...prev.edges, { id: `e_${selectedNodeId}_${newNode.id}`, source: selectedNodeId, target: newNode.id, type: 'flow' } as MindMapEdge]
      }));
      setSelectedNodeId(newNode.id);
    }
  };
  const handleDuplicateNode = () => {
    if (selectedNode) {
      const newNode: MindMapNode = {
        ...selectedNode, id: `${selectedNode.type}_${uuidv4().substring(0, 8)}`,
        positionX: (selectedNode.positionX ?? 400) + 100,
        positionY: (selectedNode.positionY ?? 300) + 50
      };
      setMindmapData(prev => ({
        ...prev,
        nodes: [...prev.nodes, newNode],
        edges: newNode.parentId ? [...prev.edges, { id: `e_${newNode.parentId}_${newNode.id}`, source: newNode.parentId!, target: newNode.id, type: 'flow' } as MindMapEdge] : prev.edges
      }));
      setSelectedNodeId(newNode.id);
    }
  };

  const handleMoveNodeUp = () => selectedNode && handleNodeMove(selectedNode.id, selectedNode.positionX ?? 400, (selectedNode.positionY ?? 300) - 50);
  const handleMoveNodeDown = () => selectedNode && handleNodeMove(selectedNode.id, selectedNode.positionX ?? 400, (selectedNode.positionY ?? 300) + 50);
  const handleMoveNodeLeft = () => selectedNode && handleNodeMove(selectedNode.id, (selectedNode.positionX ?? 400) - 50, selectedNode.positionY ?? 300);
  const handleMoveNodeRight = () => selectedNode && handleNodeMove(selectedNode.id, (selectedNode.positionX ?? 400) + 50, selectedNode.positionY ?? 300);

  const handleNodeMove = useCallback((nodeId: string, x: number, y: number) => {
    let fx = x, fy = y;
    if (showGrid) { fx = Math.round(x / 20) * 20; fy = Math.round(y / 20) * 20; }
    setMindmapData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, positionX: fx, positionY: fy } : n)
    }));
  }, [showGrid]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (!globalDragMode && !e.shiftKey) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-node-id]') || target.closest('input') || target.closest('button')) return;
    e.preventDefault();
    setIsDraggingAll(true);
    dragAllStart.current = { x: e.clientX, y: e.clientY };
  }, [globalDragMode]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingAll) return;
    const dx = e.clientX - dragAllStart.current.x;
    const dy = e.clientY - dragAllStart.current.y;
    let finalDx = dx, finalDy = dy;
    if (showGrid) { finalDx = Math.round(dx / 20) * 20; finalDy = Math.round(dy / 20) * 20; }
    dragAllStart.current = { x: e.clientX, y: e.clientY };
    setMindmapData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => ({
        ...n,
        positionX: (n.positionX ?? 400) + finalDx,
        positionY: (n.positionY ?? 300) + finalDy,
      }))
    }));
  }, [isDraggingAll, showGrid]);

  const handleCanvasMouseUp = useCallback(() => { setIsDraggingAll(false); }, []);

  const handleTextBold = () => { if (selectedNode) handleUpdateNode({ ...selectedNode, style: { ...selectedNode.style, fontWeight: selectedNode.style?.fontWeight === 'bold' ? 'normal' : 'bold' } }); };
  const handleTextItalic = () => { if (selectedNode) handleUpdateNode({ ...selectedNode, style: { ...selectedNode.style, fontStyle: selectedNode.style?.fontStyle === 'italic' ? 'normal' : 'italic' } }); };
  const handleTextUnderline = () => { if (selectedNode) handleUpdateNode({ ...selectedNode, style: { ...selectedNode.style, textDecoration: selectedNode.style?.textDecoration === 'underline' ? 'none' : 'underline' } }); };
  const handleTextAlign = (align: 'left' | 'center' | 'right') => { if (selectedNode) handleUpdateNode({ ...selectedNode, style: { ...selectedNode.style, textAlign: align } }); };

  // 🆕 Fonctions d'attachement
  const handleAddLink = (url: string) => { 
    if (selectedNode) handleUpdateNode({ ...selectedNode, customAttributes: { ...selectedNode.customAttributes, links: [...(selectedNode.customAttributes?.links || []), url] } });
  };
  const handleAddNote = (note: string) => { 
    if (selectedNode) handleUpdateNode({ ...selectedNode, description: note });
  };
  const handleAddImage = (imageUrl: string) => { 
    if (selectedNode) handleUpdateNode({ ...selectedNode, customAttributes: { ...selectedNode.customAttributes, imageUrl } });
  };

  const handleToggleGrid = () => setShowGrid(!showGrid);
  const handleToggleFocusMode = () => setFocusModeActive(!focusModeActive);

  const handleUndo = () => viewerRef.current?.undo();
  const handleRedo = () => viewerRef.current?.redo();

  const handleSave = async () => {
    setLastSaveStatus('saving');
    try { await onSave(mindmapData); setLastSaveStatus('saved'); setTimeout(() => setLastSaveStatus('idle'), 2000); }
    catch { setLastSaveStatus('error'); setTimeout(() => setLastSaveStatus('idle'), 3000); }
  };

  const handleExport = async (format: string) => {
    try {
      if (format === 'pdf') { const blob = await exportToPDF(mindmapData); triggerDownload(blob, `mindmap_${circuitId}.pdf`); }
      else if (format === 'xmind') { const blob = await exportToXMind(mindmapData); triggerDownload(blob, `mindmap_${circuitId}.xmind`); }
      else window.open(`/api/circuit-mindmap/export?circuitId=${circuitId}&format=${format}`, '_blank');
    } catch (err) { console.error('Export error:', err); alert("Erreur lors de l'export."); }
  };

  const handleImportSuccess = (importedMindMap: CircuitMindMap) => {
    setMindmapData(importedMindMap.mindmapData);
    setIsImportOpen(false);
    setTimeout(() => viewerRef.current?.fit(), 100);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'z': e.preventDefault(); handleUndo(); break;
        case 'y': e.preventDefault(); handleRedo(); break;
        case 'c': if (!e.shiftKey) { e.preventDefault(); handleCopyNode(); } break;
        case 'x': e.preventDefault(); handleCutNode(); break;
        case 'v': e.preventDefault(); handlePasteNode(); break;
        case 'd': e.preventDefault(); handleDuplicateNode(); break;
        case 'b': e.preventDefault(); handleTextBold(); break;
        case 'i': e.preventDefault(); handleTextItalic(); break;
        case 'u': e.preventDefault(); handleTextUnderline(); break;
        case 's': e.preventDefault(); handleSave(); break;
      }
    } else {
      switch (e.key) {
        case 'Delete': case 'Backspace': if (selectedNodeId && selectedNodeId !== 'root') { e.preventDefault(); handleDeleteNode(selectedNodeId); } break;
        case 'ArrowUp': e.preventDefault(); handleMoveNodeUp(); break;
        case 'ArrowDown': e.preventDefault(); handleMoveNodeDown(); break;
        case 'ArrowLeft': e.preventDefault(); handleMoveNodeLeft(); break;
        case 'ArrowRight': e.preventDefault(); handleMoveNodeRight(); break;
        case 'f': case 'F': e.preventDefault(); handleToggleFocusMode(); break;
        case 'g': case 'G': e.preventDefault(); handleToggleGrid(); break;
        case '+': case '=': e.preventDefault(); handleZoomIn(); break;
        case '-': e.preventDefault(); handleZoomOut(); break;
        case '0': e.preventDefault(); handleZoomReset(); break;
        case '?': e.preventDefault(); setShowShortcuts(true); break;
        case 'm': case 'M': e.preventDefault(); setGlobalDragMode(p => !p); break;
      }
    }
  }, [selectedNodeId, showGrid]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <MindMapShortcutsHelp isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      
      <div className="h-[85vh] flex flex-row border border-white/10 rounded-3xl bg-slate-950 overflow-hidden shadow-2xl relative">
        
        {/* ⬛ SIDEBAR GAUCHE */}
        <div className="w-14 flex flex-col items-center gap-1 py-3 px-1.5 bg-slate-900/80 border-r border-white/10 backdrop-blur-xl shrink-0 overflow-y-auto">
          
          <div className="text-[8px] text-slate-500 font-mono uppercase tracking-wider mt-1 mb-1">Nav</div>
          <SidebarButton icon={<Undo2 className="w-4 h-4" />} title="Annuler (Ctrl+Z)" onClick={handleUndo} />
          <SidebarButton icon={<Redo2 className="w-4 h-4" />} title="Rétablir (Ctrl+Y)" onClick={handleRedo} />
          
          <div className="w-6 h-px bg-white/10 my-1.5" />
          
          <SidebarButton icon={<ZoomIn className="w-4 h-4" />} title="Zoomer" onClick={handleZoomIn} />
          <SidebarButton icon={<ZoomOut className="w-4 h-4" />} title="Dézoomer" onClick={handleZoomOut} />
          <SidebarButton icon={<Maximize className="w-4 h-4" />} title="Ajuster" onClick={handleZoomReset} />
          <SidebarButton icon={<Sparkles className="w-4 h-4" />} title="Auto-layout" onClick={handleAutoLayout} />
          
          <div className="w-6 h-px bg-white/10 my-1.5" />
          
          <SidebarButton 
            icon={<Move className="w-4 h-4" />} 
            title={globalDragMode ? "Mode déplacement ACTIF" : "Mode déplacement global (M)"} 
            onClick={() => setGlobalDragMode(p => !p)} 
            active={globalDragMode}
            primary
          />
          
          <div className="w-6 h-px bg-white/10 my-1.5" />
          
          <div className="text-[8px] text-slate-500 font-mono uppercase tracking-wider mb-1">Ajouter</div>
          <SidebarButton icon={<Hash className="w-4 h-4" />} title="Paramètre" onClick={() => handleAddNode('parameter')} primary />
          <SidebarButton icon={<FileText className="w-4 h-4" />} title="Note" onClick={() => handleAddNode('note')} />
          <SidebarButton icon={<Link className="w-4 h-4" />} title="Dépendance" onClick={() => handleAddNode('dependency')} />
          <SidebarButton icon={<GitBranch className="w-4 h-4" />} title="Formule" onClick={() => handleAddNode('formula')} />
          
          <div className="w-6 h-px bg-white/10 my-1.5" />
          
          <div className="text-[8px] text-slate-500 font-mono uppercase tracking-wider mb-1">Édition</div>
          <SidebarButton icon={<Copy className="w-4 h-4" />} title="Copier (Ctrl+C)" onClick={handleCopyNode} disabled={!selectedNodeId} />
          <SidebarButton icon={<Scissors className="w-4 h-4" />} title="Couper (Ctrl+X)" onClick={handleCutNode} disabled={!selectedNodeId} />
          <SidebarButton icon={<ClipboardPaste className="w-4 h-4" />} title="Coller (Ctrl+V)" onClick={handlePasteNode} disabled={!clipboardNode} />
          <SidebarButton icon={<Copy className="w-4 h-4" />} title="Dupliquer (Ctrl+D)" onClick={handleDuplicateNode} disabled={!selectedNodeId} />
          
          <div className="w-6 h-px bg-white/10 my-1.5" />
          
          <div className="text-[8px] text-slate-500 font-mono uppercase tracking-wider mb-1">Déplacer</div>
          <div className="grid grid-cols-3 gap-0.5">
            <div /><SidebarButton icon={<ChevronUp className="w-3.5 h-3.5" />} title="Monter" onClick={handleMoveNodeUp} disabled={!selectedNodeId} /><div />
            <SidebarButton icon={<ChevronLeft className="w-3.5 h-3.5" />} title="Gauche" onClick={handleMoveNodeLeft} disabled={!selectedNodeId} />
            <div className="w-9 h-9 flex items-center justify-center text-[9px] text-slate-600">↕↔</div>
            <SidebarButton icon={<ChevronRight className="w-3.5 h-3.5" />} title="Droite" onClick={handleMoveNodeRight} disabled={!selectedNodeId} />
            <div /><SidebarButton icon={<ChevronDown className="w-3.5 h-3.5" />} title="Descendre" onClick={handleMoveNodeDown} disabled={!selectedNodeId} /><div />
          </div>
          
          <div className="w-6 h-px bg-white/10 my-1.5" />
          
          <div className="text-[8px] text-slate-500 font-mono uppercase tracking-wider mb-1">Style</div>
          <SidebarButton icon={<Bold className="w-4 h-4" />} title="Gras (Ctrl+B)" onClick={handleTextBold} disabled={!selectedNodeId} />
          <SidebarButton icon={<Italic className="w-4 h-4" />} title="Italique (Ctrl+I)" onClick={handleTextItalic} disabled={!selectedNodeId} />
          <SidebarButton icon={<Underline className="w-4 h-4" />} title="Souligné (Ctrl+U)" onClick={handleTextUnderline} disabled={!selectedNodeId} />
          <SidebarButton icon={<AlignLeft className="w-4 h-4" />} title="Aligner gauche" onClick={() => handleTextAlign('left')} disabled={!selectedNodeId} />
          <SidebarButton icon={<AlignCenter className="w-4 h-4" />} title="Centrer" onClick={() => handleTextAlign('center')} disabled={!selectedNodeId} />
          <SidebarButton icon={<AlignRight className="w-4 h-4" />} title="Aligner droite" onClick={() => handleTextAlign('right')} disabled={!selectedNodeId} />
          
          <div className="w-6 h-px bg-white/10 my-1.5" />
          
          <div className="text-[8px] text-slate-500 font-mono uppercase tracking-wider mb-1">Vue</div>
          <SidebarButton icon={<Grid3X3 className="w-4 h-4" />} title="Grille (G)" onClick={handleToggleGrid} active={showGrid} />
          <SidebarButton icon={focusModeActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} title="Focus (F)" onClick={handleToggleFocusMode} disabled={!selectedNodeId} active={focusModeActive} />
          <SidebarButton icon={<PanelLeft className="w-4 h-4" />} title="Panneau détails" onClick={() => setShowMetadata(!showMetadata)} active={showMetadata} />
          
          <div className="w-6 h-px bg-white/10 my-1.5" />
          
          <SidebarButton icon={<ExternalLink className="w-4 h-4" />} title="Ajouter lien" onClick={() => { const url = prompt('URL:'); if (url) handleAddLink(url); }} disabled={!selectedNodeId} />
          <SidebarButton icon={<Image className="w-4 h-4" />} title="Ajouter image" onClick={() => { const url = prompt('URL image:'); if (url) handleAddImage(url); }} disabled={!selectedNodeId} />
          
          <div className="flex-1" />
          
          <div className="w-6 h-px bg-white/10 my-1.5" />
          <SidebarButton icon={<Save className="w-4 h-4" />} title="Sauvegarder (Ctrl+S)" onClick={handleSave} primary />
          <SidebarButton icon={<Download className="w-4 h-4" />} title="Exporter" onClick={() => handleExport('json')} />
          <SidebarButton icon={<Upload className="w-4 h-4" />} title="Importer" onClick={() => setIsImportOpen(true)} />
          <SidebarButton icon={<Printer className="w-4 h-4" />} title="Imprimer" onClick={() => window.print()} />
          <SidebarButton icon={<Eraser className="w-4 h-4" />} title="Tout supprimer" onClick={handleClearAll} danger />
          <SidebarButton icon={<Keyboard className="w-4 h-4" />} title="Raccourcis (?)" onClick={() => setShowShortcuts(true)} />
        </div>

        {/* 📐 Canvas principal */}
        <div 
          ref={canvasRef}
          className={`flex-1 flex flex-col relative ${globalDragMode ? 'cursor-grab' : ''} ${isDraggingAll ? 'cursor-grabbing' : ''}`}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        >
          {globalDragMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-sky-600/90 text-white rounded-xl text-xs font-semibold shadow-lg flex items-center gap-2 animate-pulse">
              <Move className="w-3.5 h-3.5" />
              <span>Mode déplacement global - Cliquez sur le fond pour déplacer tout le schéma</span>
              <kbd className="ml-2 px-1.5 py-0.5 bg-white/20 rounded text-[10px]">M</kbd>
            </div>
          )}
          
          <div className="flex-1 relative">
            <MindMapViewerV2
              ref={viewerRef}
              data={mindmapData}
              selectedNodeId={selectedNodeId}
              onNodeSelect={(node) => setSelectedNodeId(node ? node.id : null)}
              onDataChange={setMindmapData}
              onNodeMove={handleNodeMove}
            />
          </div>

          {lastSaveStatus !== 'idle' && (
            <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-xs font-semibold shadow-lg transition-all ${
              lastSaveStatus === 'saving' ? 'bg-yellow-600 text-yellow-100 animate-pulse' :
              lastSaveStatus === 'saved' ? 'bg-emerald-600 text-emerald-100' :
              'bg-red-600 text-red-100'
            }`}>
              {lastSaveStatus === 'saving' ? '⏳ Sauvegarde...' : lastSaveStatus === 'saved' ? '✅ Sauvegardé' : '❌ Erreur'}
            </div>
          )}
        </div>

        {/* 📊 Panneau métadonnées droite */}
        {showMetadata && (
          <div className="w-80 border-l border-white/10 shrink-0">
            <MindMapMetadataPanel
              node={selectedNode}
              allNodes={mindmapData.nodes}
              dbParameters={dbParameters}
              onUpdateNode={handleUpdateNode}
              onDeleteNode={handleDeleteNode}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
        )}

        {isImportOpen && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <MindMapUploader circuitId={circuitId} onImportSuccess={handleImportSuccess} onClose={() => setIsImportOpen(false)} />
          </div>
        )}

        {showGrid && (
          <div className="absolute inset-0 pointer-events-none z-10 opacity-5"
            style={{ backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
        )}
      </div>
    </>
  );
};
export default MindMapEditor;