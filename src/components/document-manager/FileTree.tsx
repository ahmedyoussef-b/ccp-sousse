/**
 * @fileOverview FileTree - Explorateur hiérarchique avec actions de gestion
 * Version finale avec support des préparations IA et badges de statut
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ChevronRight, 
  ChevronDown, 
  FileText, 
  Folder, 
  Trash2, 
  Edit3, 
  FolderPlus, 
  Check, 
  X,
  FileJson,
  FileCode,
  Info,
  CheckCircle,
  Clock,
  XCircle,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { FileNode } from '@/lib/document-manager/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ============================================================================
// TYPES ÉTENDUS
// ============================================================================

interface FileTreeProps {
  nodes: FileNode[];
  expandedNodes: Set<string>;
  selectedPath?: string;
  onToggleExpand: (path: string) => void;
  onSelect: (node: FileNode) => void;
  onDelete?: (node: FileNode) => void;
  onRename: (path: string, newName: string) => Promise<void>;
  onCreateFolder: (parentPath: string, name: string) => Promise<void>;
  onInfoClick?: (node: FileNode) => void;
  level?: number;
  // 🔥 NOUVEAUX PROPS
  showPreparationStatus?: boolean;
  onPrepareClick?: (node: FileNode) => void;
  // 🔥 État de création contrôlé par le parent (survit aux re-renders de l'arbre)
  creatingInPath?: string | null;
  onCreatingInPathChange?: (path: string | null) => void;
}

// ============================================================================
// COMPOSANT
// ============================================================================

export function FileTree({ 
  nodes,
  expandedNodes, 
  selectedPath,
  onToggleExpand, 
  onSelect,
  onDelete,
  onRename,
  onCreateFolder,
  onInfoClick,
  onPrepareClick,
  level = 0,
  showPreparationStatus = true,
  creatingInPath: externalCreatingInPath,
  onCreatingInPathChange
}: FileTreeProps) {
  const router = useRouter();
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditedValue] = useState('');
  const [internalCreatingInPath, setInternalCreatingInPath] = useState<string | null>(null);
  const [newValue, setNewValue] = useState('');

  // 🔥 Utiliser l'état externe (parent) s'il est fourni, sinon l'état interne (backward compat)
  const creatingInPath = externalCreatingInPath !== undefined ? externalCreatingInPath : internalCreatingInPath;
  const setCreatingInPath = onCreatingInPathChange || setInternalCreatingInPath;

  // ==========================================================================
  // ICÔNES
  // ==========================================================================

  const getFileIcon = (fileName: string, preparationStatus?: string, imageType?: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    // Image avec préparation IA - icône spéciale
    if (preparationStatus === 'completed') {
      return <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />;
    }
    if (preparationStatus === 'processing') {
      return <Clock className="w-4 h-4 text-yellow-400 shrink-0" />;
    }
    
    // Image globale vs simple
    if (imageType === 'global') {
      return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
    }
    
    if (ext === 'json') return <FileJson className="w-4 h-4 text-yellow-500/60 shrink-0" />;
    if (ext === 'md' || ext === 'txt') return <FileText className="w-4 h-4 text-blue-400/60 shrink-0" />;
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '')) {
      if (preparationStatus === 'failed') {
        return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
      }
      return <Info className="w-4 h-4 text-emerald-400 shrink-0" />;
    }
    return <FileCode className="w-4 h-4 text-purple-400/60 shrink-0" />;
  };

  // ==========================================================================
  // BADGE DE STATUT DE PRÉPARATION
  // ==========================================================================

  const getPreparationBadge = (status?: string): { icon: React.ReactNode; color: string; label: string } | null => {
    switch (status) {
      case 'completed':
        return { 
          icon: <CheckCircle className="w-3 h-3" />, 
          color: 'bg-green-500/20 text-green-400 border-green-500/30',
          label: 'Préparée'
        };
      case 'processing':
        return { 
          icon: <Clock className="w-3 h-3 animate-pulse" />, 
          color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
          label: 'Préparation en cours'
        };
      case 'failed':
        return { 
          icon: <XCircle className="w-3 h-3" />, 
          color: 'bg-red-500/20 text-red-400 border-red-500/30',
          label: 'Préparation échouée'
        };
      default:
        return null;
    }
  };

  const isRootFolder = (path: string) => {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 2] === 'centrale_documents' || path === 'root';
  };

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleStartRename = (node: FileNode) => {
    setEditingPath(node.path);
    setEditedValue(node.name);
  };

  const handleConfirmRename = async () => {
    if (editingPath && editValue.trim()) {
      await onRename(editingPath, editValue.trim());
    }
    setEditingPath(null);
  };

  const handleStartCreate = (node: FileNode) => {
    // 🔥 FIX: Utiliser prompt() pour la saisie du nom — fiable sur tous les niveaux
    const name = prompt("Nom du nouveau dossier :");
    if (name && name.trim()) {
      // Expand le nœud si pas déjà ouvert
      if (!expandedNodes.has(node.path)) {
        onToggleExpand(node.path);
      }
      onCreateFolder(node.path, name.trim());
    }
  };

  const handleConfirmCreate = async () => {
    if (creatingInPath && newValue.trim()) {
      await onCreateFolder(creatingInPath, newValue.trim());
    }
    setCreatingInPath(null);
  };

  const goToDetail = (e: React.MouseEvent, node: FileNode) => {
    e.stopPropagation();
    if (onInfoClick) {
      onInfoClick(node);
    } else {
      const encodedPath = encodeURIComponent(node.path);
      router.push(`/admin/documents/${encodedPath}`);
    }
  };

  const handlePrepareClick = (e: React.MouseEvent, node: FileNode) => {
    e.stopPropagation();
    if (onPrepareClick && node.type === 'file') {
      onPrepareClick(node);
    }
  };

  // ==========================================================================
  // RENDU
  // ==========================================================================


  // Small animated counter component
  function CountAnimated({ value, className }: { value?: number; className?: string }) {
    const [display, setDisplay] = useState<number>(value || 0);
    const rafRef = useRef<number | null>(null);
    const startRef = useRef<number | null>(null);
    const fromRef = useRef<number>(display);

    useEffect(() => {
      const target = value || 0;
      if (fromRef.current === target) {
        setDisplay(target);
        return;
      }
      const duration = 350;
      const start = performance.now();
      fromRef.current = display;

      const step = (now: number) => {
        if (!startRef.current) startRef.current = start;
        const t = Math.min(1, (now - start) / duration);
        const val = Math.round(fromRef.current + (target - fromRef.current) * t);
        setDisplay(val);
        if (t < 1) rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); startRef.current = null; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return <span className={className}>{display}</span>;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-0.5" style={{ paddingLeft: level > 0 ? 12 : 0 }}>
        {nodes.map((node: FileNode) => {
          const isSelected = selectedPath === node.path;
          const isDirectory = node.type === 'directory';
          const isExpanded = expandedNodes.has(node.path);
          const isEditing = editingPath === node.path;
          const prepBadge = showPreparationStatus ? getPreparationBadge(node.preparationStatus) : null;
          const hasPreparations = node.hasPreparations || node.preparationStatus === 'completed';

          return (
            <div key={node.path} className="group">
              <div
                className={cn(
                  "flex items-center gap-2 py-2 px-3 rounded-xl transition-all cursor-pointer group/item",
                  isSelected 
                    ? "bg-blue-600/20 border border-blue-500/30 text-white" 
                    : "hover:bg-white/5 border border-transparent text-gray-400",
                  hasPreparations && !isSelected && "border-purple-500/20 bg-purple-500/5"
                )}
                onClick={() => !isEditing && onSelect(node)}
              >
                {/* EXPANSION ICON */}
                <div 
                  className="w-4 h-4 flex items-center justify-center shrink-0"
                  onClick={(e) => {
                    if (isDirectory) {
                      e.stopPropagation();
                      onToggleExpand(node.path);
                    }
                  }}
                >
                  {isDirectory && (
                    isExpanded ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />
                  )}
                </div>
                
                {/* TYPE ICON */}
                {isDirectory ? (
                  <Folder className={cn(
                    "w-4 h-4 shrink-0", 
                    isSelected ? "text-blue-400" : (isExpanded ? "text-blue-400/60" : "text-gray-600")
                  )} />
                ) : (
                  getFileIcon(node.name, node.preparationStatus, node.imageType)
                )}
                
                {/* NOM + BADGES */}
                {isEditing ? (
                  <div className="flex-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Input 
                      value={editValue}
                      onChange={e => setEditedValue(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleConfirmRename()}
                      className="h-7 text-xs bg-black/60 border-blue-500/50 py-0 px-2 text-white"
                      autoFocus
                    />
                    <button onClick={handleConfirmRename} className="p-1 hover:text-green-500">
                      <Check className="w-3 h-3" />
                    </button>
                    <button onClick={() => setEditingPath(null)} className="p-1 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center gap-2 overflow-hidden">
                    <span className={cn(
                      "truncate text-[13px] tracking-tight",
                      isDirectory ? "font-bold" : "font-medium text-gray-300",
                      hasPreparations && "text-purple-300/90"
                    )}>
                      {node.name}
                    </span>
                    
                    {/* BADGE DE PRÉPARATION */}
                    {prepBadge && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={cn(
                            "shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border",
                            prepBadge.color
                          )}>
                            {prepBadge.icon}
                            <span className="hidden sm:inline">{prepBadge.label}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{prepBadge.label}</TooltipContent>
                      </Tooltip>
                    )}
                    
                    {/* BADGE: local vs indexed counts (separate) */}
                    { (node as any).localCount !== undefined || (node as any).indexedCount !== undefined ? (
                      <div className="flex items-center gap-1">
                        {/* Local files badge */}
                        {(node as any).localCount !== undefined && (
                          <span className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-blue-600/10 text-[10px] font-medium text-blue-300 border border-blue-400/20">
                            <span className="hidden sm:inline">Local</span>
                            <CountAnimated value={(node as any).localCount} className="ml-1" />
                          </span>
                        )}

                        {/* Indexed (DB) badge */}
                        {(node as any).indexedCount !== undefined && (
                          <span className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] font-medium text-gray-300 border border-white/10">
                            <span className="hidden sm:inline">Index</span>
                            <CountAnimated value={(node as any).indexedCount} className="ml-1" />
                          </span>
                        )}
                      </div>
                    ) : (
                      node.badge !== undefined && !prepBadge && (
                        <span className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] font-medium text-gray-400">
                          {node.badge}
                        </span>
                      )
                    )}

                    {/* BADGE DE COMPTEUR DE PRÉPARATIONS (pour dossiers) */}
                    {isDirectory && typeof node.badge === 'string' && node.badge.includes('/') && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-purple-500/20 text-[10px] font-medium text-purple-400">
                            <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                            {node.badge}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Images préparées / total</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
                
                {/* ACTIONS BUTTONS */}
                {!isEditing && (
                  <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-all">
                    {/* 🔥 BOUTON PRÉPARATION IA (pour fichiers image) */}
                    {!isDirectory && onPrepareClick && node.preparationStatus !== 'completed' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => handlePrepareClick(e, node)}
                            className="p-1.5 hover:bg-purple-500/20 rounded-lg text-purple-400 hover:text-purple-300 transition-colors"
                            title="Préparer l'image (ROI, ancres, hiérarchie)"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Préparer l'image pour l'IA</TooltipContent>
                      </Tooltip>
                    )}
                    
                    {/* BOUTON INFO */}
                    {!isDirectory && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => goToDetail(e, node)}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors"
                            title="Inspecter le document"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Voir les détails</TooltipContent>
                      </Tooltip>
                    )}
                    
                    {/* BOUTON NOUVEAU DOSSIER */}
                    {isDirectory && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStartCreate(node); }}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-blue-400 transition-colors"
                            title="Nouveau dossier"
                          >
                            <FolderPlus className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Nouveau dossier</TooltipContent>
                      </Tooltip>
                    )}
                    
                    {/* BOUTON RENOMMER */}
                    {!isRootFolder(node.path) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStartRename(node); }}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-yellow-400 transition-colors"
                            title="Renommer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Renommer</TooltipContent>
                      </Tooltip>
                    )}
                    
                    {/* BOUTON SUPPRIMER */}
                    {!isRootFolder(node.path) && onDelete && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDelete(node); }}
                            className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-600 hover:text-red-500 transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Supprimer</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>
              
              {/* ENFANTS (pour dossiers) */}
              {isDirectory && isExpanded && (
                <div className="border-l border-white/5 ml-5 mt-0.5 mb-1 animate-in slide-in-from-top-1 duration-200">
                  {creatingInPath === node.path && (
                    <div className="flex items-center gap-2 py-1 px-3 ml-2 mb-1 bg-blue-600/5 rounded-lg border border-blue-500/20">
                      <Folder className="w-3.5 h-3.5 text-blue-400/60" />
                      <Input 
                        value={newValue}
                        onChange={e => setNewValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleConfirmCreate()}
                        placeholder="Nom du dossier..."
                        className="h-6 text-[11px] bg-transparent border-none p-0 focus-visible:ring-0 text-white"
                        autoFocus
                      />
                      <div className="flex gap-1">
                        <button onClick={handleConfirmCreate} className="text-green-500">
                          <Check className="w-3 h-3" />
                        </button>
                        <button onClick={() => setCreatingInPath(null)} className="text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                  {node.children && (
                    <FileTree
                      nodes={node.children}
                      expandedNodes={expandedNodes}
                      selectedPath={selectedPath}
                      onToggleExpand={onToggleExpand}
                      onSelect={onSelect}
                      onDelete={onDelete}
                      onRename={onRename}
                      onCreateFolder={onCreateFolder}
                      onInfoClick={onInfoClick}
                      onPrepareClick={onPrepareClick}
                      showPreparationStatus={showPreparationStatus}
                      level={level + 1}
                      creatingInPath={externalCreatingInPath}
                      onCreatingInPathChange={onCreatingInPathChange}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}