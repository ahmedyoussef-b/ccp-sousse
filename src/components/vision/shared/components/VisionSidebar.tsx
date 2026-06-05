// src/components/vision/shared/components/VisionSidebar.tsx - VERSION CORRIGÉE

'use client';

import { ReactNode, useState } from 'react';
import { Search, RefreshCw, Filter, Globe, Image as ImageIcon, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { FileTree } from '@/components/document-manager/FileTree';
import { FileNode } from '@/lib/document-manager/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useResizableSidebar } from '../hooks/useResizableSidebar';
import type { VisionFileNode, ImageMetadata } from '../types/type';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// ============================================================================
// PROPS INTERFACE
// ============================================================================

interface VisionSidebarProps {
  title: string;
  icon: ReactNode;
  iconBgColor: string;
  iconColor: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  tree: VisionFileNode[];
  expandedNodes: Set<string>;
  onToggleExpand: (path: string) => void | Promise<void>;
  selectedPath?: string;
  onSelectNode: (node: VisionFileNode) => void;
  onRefresh: () => void;
  isLoading?: boolean;
  extraActions?: ReactNode;
  onDelete?: (node: VisionFileNode) => Promise<void>;
  onRename?: (path: string, newName: string) => Promise<void>;
  onCreateFolder?: (parentId: string, name: string) => Promise<void>;
  onViewDetails?: (image: ImageMetadata) => void;
  showIngestionButton?: boolean;
  onIngestionClick?: () => void;
  filterType?: 'all' | 'global' | 'simple';
  onFilterChange?: (type: 'all' | 'global' | 'simple') => void;
  showPreparationBadges?: boolean;
  preparationStats?: { total: number; completed: number; processing: number; failed: number };
  showFiles?: boolean;
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export function VisionSidebar({
  title,
  icon,
  iconBgColor,
  iconColor,
  searchQuery,
  onSearchChange,
  tree,
  expandedNodes,
  onToggleExpand,
  selectedPath,
  onSelectNode,
  onRefresh,
  isLoading = false,
  extraActions,
  onDelete,
  onRename,
  onCreateFolder,
  onViewDetails,
  showIngestionButton = false,
  onIngestionClick,
  filterType = 'all',
  onFilterChange,
  showPreparationBadges = false,
  preparationStats = { total: 0, completed: 0, processing: 0, failed: 0 },
  showFiles = false
}: VisionSidebarProps) {
  const { sidebarWidth, containerRef, startResizing, isResizing } = useResizableSidebar();
  // 🔥 État de création de dossier levé ici pour survivre aux re-renders de FileTree
  const [creatingInPath, setCreatingInPath] = useState<string | null>(null);

  // ==========================================================================
  // CONVERSION VisionFileNode → FileNode pour FileTree
  // ==========================================================================

  const convertToFileNode = (node: VisionFileNode): FileNode => {
    // Convertir les sous-dossiers
    const childFolders = node.children?.map(convertToFileNode) || [];
    
    // Convertir les images SEULEMENT si demandé
    const childFiles: FileNode[] = showFiles ? (node.images || []).map(img => {
      // 🔥 CORRECTION 1: 'pending' n'existe pas dans FileNode.preparationStatus
      // On convertit 'pending' en 'processing' pour FileNode
      let mappedStatus: 'completed' | 'processing' | 'failed' | 'not_started' | undefined = 
        img.preparationStatus === 'pending' ? 'processing' : img.preparationStatus;
      
      // 🔥 CORRECTION 2: 'image' n'est pas un type valide pour FileNode.imageType
      // On convertit 'image' en 'simple' et on évite les valeurs non autorisées
      let mappedImageType: 'global' | 'simple' | 'part' | 'assemblage' | undefined = 'simple';
      if (img.imageType === 'global') {
        mappedImageType = 'global';
      } else if (img.imageType === 'part') {
        mappedImageType = 'part';
      } else if (img.imageType === 'assemblage') {
        mappedImageType = 'assemblage';
      } else {
        mappedImageType = 'simple';
      }
      
      return {
        id: img.id,
        name: img.filename,
        path: img.id,
        type: 'file',
        preparationStatus: mappedStatus,
        hasPreparations: img.hasPreparations,
        imageType: mappedImageType
      };
    }) : [];

    // Ajouter un badge avec le statut de préparation si disponible
    // indexedCount = imageCount from DB, localCount = number of sidecar JSON files on disk
    const indexedCount = node.imageCount || node.images?.length || 0;
    const localCount = (node as any).localCount || (node.images || []).length;

    // Compter les images préparées dans ce dossier
    const preparedInFolder = node.images?.filter(img => 
      img.preparationStatus === 'completed'
    ).length || 0;

    // Build file node with explicit counts
    const fileNode: any = {
      id: node.id,
      name: node.name,
      path: node.path,
      type: node.type || 'directory',
      children: [...childFolders, ...childFiles].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
      // Preserve old badge for backwards compatibility
      badge: preparedInFolder > 0 && indexedCount > 0 ? `${preparedInFolder}/${indexedCount}` : undefined,
      indexedCount,
      localCount
    };

    return fileNode as FileNode;
  };

  // Appliquer les filtres sur l'arbre avant conversion
  const getFilteredTree = (): VisionFileNode[] => {
    if (filterType === 'all' || !onFilterChange) return tree;
    
    const filterNode = (node: VisionFileNode): VisionFileNode | null => {
      const filteredImages = (node.images || []).filter(img => {
        if (filterType === 'global') return img.imageType === 'global';
        if (filterType === 'simple') return img.imageType !== 'global' && img.imageType !== 'part';
        return true;
      });
      
      const filteredChildren = node.children
        ?.map(filterNode)
        .filter((child): child is VisionFileNode => child !== null) || [];
      
      if (filteredImages.length > 0 || filteredChildren.length > 0 || node.id === 'root') {
        return {
          ...node,
          images: filteredImages,
          children: filteredChildren,
          imageCount: filteredImages.length
        };
      }
      
      return null;
    };
    
    return tree.map(filterNode).filter((n): n is VisionFileNode => n !== null);
  };

  const filteredTree = getFilteredTree();
  const fileTreeNodes = filteredTree.map(convertToFileNode);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleRename = async (path: string, newName: string) => {
    if (onRename) {
      await onRename(path, newName);
    }
  };

  const handleCreateFolder = async (parentPath: string, name: string) => {
    if (onCreateFolder) {
      await onCreateFolder(parentPath, name);
    }
  };

  const handleDelete = async (node: FileNode) => {
    if (onDelete) {
      const findOriginalNode = (nodes: VisionFileNode[], targetPath: string): VisionFileNode | undefined => {
        for (const n of nodes) {
          if (n.path === targetPath) return n;
          
          if (node.type === 'file') {
            const img = n.images?.find(i => i.id === targetPath);
            if (img) {
              // 🔥 CORRECTION: Ne pas inclure 'preparationStatus' car il n'existe pas dans VisionFileNode
              // ou le définir comme optionnel avec 'any' si nécessaire
              return {
                id: img.id,
                name: img.filename,
                path: img.id,
                type: 'file',
                parentId: n.id,
                imageType: img.imageType,
                hasPreparations: img.hasPreparations
              };
            }
          }

          if (n.children) {
            const found = findOriginalNode(n.children, targetPath);
            if (found) return found;
          }
        }
        return undefined;
      };
      const originalNode = findOriginalNode(tree, node.path);
      if (originalNode) {
        await onDelete(originalNode);
      }
    }
  };

  const handleSelect = (node: FileNode) => {
    const findOriginalNode = (nodes: VisionFileNode[], targetPath: string): VisionFileNode | undefined => {
      for (const n of nodes) {
        if (n.path === targetPath) return n;
        
        if (node.type === 'file') {
          const img = n.images?.find(i => i.id === targetPath);
          if (img) {
            // 🔥 CORRECTION: Ne pas inclure 'preparationStatus' car il n'existe pas dans VisionFileNode
            return {
              id: img.id,
              name: img.filename,
              path: img.id,
              type: 'file',
              parentId: n.id,
              imageType: img.imageType,
              hasPreparations: img.hasPreparations
            };
          }
        }

        if (n.children) {
          const found = findOriginalNode(n.children, targetPath);
          if (found) return found;
        }
      }
      return undefined;
    };
    const originalNode = findOriginalNode(tree, node.path);
    if (originalNode) onSelectNode(originalNode);
  };

  const handleInfoClick = (node: FileNode) => {
    if (onViewDetails && node.type === 'file') {
      const findImage = (nodes: VisionFileNode[]): ImageMetadata | null => {
        for (const n of nodes) {
          const img = n.images?.find(i => i.id === node.path);
          if (img) return img;
          if (n.children) {
            const found = findImage(n.children);
            if (found) return found;
          }
        }
        return null;
      };
      const img = findImage(tree);
      if (img) onViewDetails(img);
    }
  };
  
  // ==========================================================================
  // RENDU
  // ==========================================================================

  return (
    <div 
      ref={containerRef}
      className="border-r border-white/5 bg-black/20 flex flex-col min-h-0 relative group transition-[width] duration-75 ease-out shrink-0"
      style={{ width: sidebarWidth >= 256 ? `${sidebarWidth}px` : undefined }}
    >
      {/* HEADER */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-xl", iconBgColor)}>
            <div className={iconColor}>{icon}</div>
          </div>
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-white">{title}</h2>
        </div>
        <div className="flex gap-1">
          <button 
            onClick={onRefresh} 
            className="p-2 hover:bg-white/10 rounded-lg text-gray-400 transition-colors"
            disabled={isLoading}
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </button>
          {extraActions}
        </div>
      </div>

      {/* RECHERCHE */}
      <div className="p-4 border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input 
            id="vision-sidebar-search"
            name="vision-sidebar-search"
            placeholder="Rechercher..." 
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9 bg-black/40 border-white/10 text-xs focus-visible:ring-1 rounded-xl text-white"
          />
        </div>
      </div>

      {/* FILTRES PAR TYPE D'IMAGE */}
      {onFilterChange && (
        <div className="px-4 py-3 border-b border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Type d'image
            </span>
            <Filter className="w-3 h-3 text-gray-500" />
          </div>
          <ToggleGroup 
            type="single" 
            value={filterType} 
            onValueChange={(value: string) => value && onFilterChange(value as 'all' | 'global' | 'simple')}
            className="justify-start gap-2"
          >
            <ToggleGroupItem value="all" className="text-xs h-8 px-3 data-[state=on]:bg-purple-600">
              Toutes
            </ToggleGroupItem>
            <ToggleGroupItem value="global" className="text-xs h-8 px-3 data-[state=on]:bg-blue-600">
              <Globe className="w-3 h-3 mr-1" />
              Globales
            </ToggleGroupItem>
            <ToggleGroupItem value="simple" className="text-xs h-8 px-3 data-[state=on]:bg-green-600">
              <ImageIcon className="w-3 h-3 mr-1" />
              Simples
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      {/* STATUT DE PRÉPARATION IA (RÉSUMÉ) */}
      {showPreparationBadges && preparationStats.total > 0 && (
        <div className="px-4 py-3 border-b border-white/5">
          <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-2">
            <span>Préparations IA</span>
            <span>{preparationStats.completed}/{preparationStats.total}</span>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-green-400 border-green-400/30 text-[10px] py-0.5">
              <CheckCircle className="w-3 h-3 mr-1" />
              {preparationStats.completed} terminées
            </Badge>
            <Badge variant="outline" className="text-yellow-400 border-yellow-400/30 text-[10px] py-0.5">
              <Clock className="w-3 h-3 mr-1" />
              {preparationStats.processing} en cours
            </Badge>
            <Badge variant="outline" className="text-red-400 border-red-400/30 text-[10px] py-0.5">
              <XCircle className="w-3 h-3 mr-1" />
              {preparationStats.failed} échouées
            </Badge>
          </div>
        </div>
      )}

      {/* BOUTON D'INGESTION */}
      {showIngestionButton && onIngestionClick && (
        <div className="p-4 border-b border-white/5">
          <button
            onClick={onIngestionClick}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl h-9 text-[10px] font-black uppercase tracking-widest transition-all duration-200 shadow-lg"
          >
            🚀 Nouvelle Ingestion
          </button>
        </div>
      )}

      {/* ARBRE DES FICHIERS */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {fileTreeNodes.length === 0 && filteredTree.length === 0 && filterType !== 'all' ? (
          <div className="text-center py-8 text-gray-500 text-xs">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Aucune image {filterType === 'global' ? 'globale' : 'simple'}</p>
          </div>
        ) : (
          <FileTree
            nodes={fileTreeNodes}
            expandedNodes={expandedNodes}
            selectedPath={selectedPath}
            onToggleExpand={onToggleExpand}
            onSelect={handleSelect}
            onDelete={handleDelete}
            onRename={handleRename}
            onCreateFolder={handleCreateFolder}
            onInfoClick={handleInfoClick}
            creatingInPath={creatingInPath}
            onCreatingInPathChange={setCreatingInPath}
          />
        )}
      </div>

      {/* RESIZE HANDLE */}
      <div
        onMouseDown={startResizing}
        className={cn(
          "absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-20 transition-all duration-200",
          isResizing ? "bg-purple-500 opacity-100" : "bg-transparent group-hover:bg-purple-500/30 opacity-0 group-hover:opacity-100"
        )}
      />
    </div>
  );
}