// src/components/vision/shared/hooks/useFileSystemTree.ts
// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';

import { ImageMetadata as IM, VisionFileNode as VFN, RegionOfInterest, AnchorPoint } from '../types/type';
export type ImageMetadata = IM;
export type VisionFileNode = VFN;

// Interfaces pour les données reçues de l'API
interface ApiImageData {
  id: string;
  filename: string;
  path: string;
  preparationStatus?: string;
  tags?: string[];
  [key: string]: any; // Pour les autres propriétés
}

interface ApiNodeData {
  id: string;
  name: string;
  path: string;
  images?: ApiImageData[];
  children?: ApiNodeData[];
  imageCount?: number;
  hasChildren?: boolean;
  [key: string]: any; // Pour les autres propriétés
}

interface PreparationCache {
  [imageId: string]: {
    status: 'not_started' | 'processing' | 'completed' | 'failed' | 'pending';
    lastChecked: number;
    rois?: RegionOfInterest[];
    anchors?: AnchorPoint[];
  };
}

// ⚡ Cache module-level: survive les navigations (Stale-While-Revalidate)
let _cachedTree: VisionFileNode[] | null = null;
let _cachedPrep: PreparationCache = {};
let _lastFetchTime = 0;
const TREE_CACHE_TTL = 30000; // 30s

// ============================================================================
// HOOK PRINCIPAL
// ============================================================================

export function useFileSystemTree() {
  // Initialiser depuis le cache module si disponible (navigation instantanée)
  const isCacheValid = _cachedTree !== null && (Date.now() - _lastFetchTime) < TREE_CACHE_TTL;
  const [tree, setTree] = useState<VisionFileNode[]>(_cachedTree || []);
  const [loading, setLoading] = useState(!isCacheValid);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['data/banque_images_ia']));
  const [preparationCache, setPreparationCache] = useState<PreparationCache>(_cachedPrep);
  const { toast } = useToast();
  const isMounted = useRef(true);
  const hasLoaded = useRef(isCacheValid); // Marquer comme chargé si cache valide

  // 🔥 CALCUL DU TOTAL PRÉPARÉ
  const totalPrepared = useMemo(() => {
    return Object.values(preparationCache).filter(cache => cache.status === 'completed').length;
  }, [preparationCache]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // 🔥 CHARGEMENT DE L'ARBRE
  const loadTree = useCallback(async (silent = false, pathParam?: string) => {
    if (!silent && isMounted.current) setLoading(true);
    
    try {
      const url = pathParam 
        ? `/api/vision/fs-tree?path=${encodeURIComponent(pathParam)}`
        : '/api/vision/fs-tree';
        
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load tree');
      }
      
      const newItems: PreparationCache = {};
      
      const transformNode = (node: ApiNodeData, parentId: string | null = null): VisionFileNode => {
        const processedImages = (node.images || []).map((img: ApiImageData) => {
          const prepStatus = img.preparationStatus || 'not_started';
          if (prepStatus !== 'not_started') {
            newItems[img.id] = { status: prepStatus as any, lastChecked: Date.now() };
          }
          return { ...img, preparationStatus: prepStatus as 'not_started' | 'processing' | 'completed' | 'failed' | 'pending', tags: img.tags || [] };
        });
        
        return {
          id: node.id,
          name: node.name,
          path: node.path,
          type: 'directory',
          parentId: parentId,
          children: (node.children || []).map((child: ApiNodeData) => transformNode(child, node.id)),
          images: processedImages,
          // indexedCount (imageCount) comes from DB; fallback to processedImages length
          imageCount: typeof node.imageCount === 'number' ? node.imageCount : processedImages.length,
          // localCount = number of sidecar JSON files on disk for this folder
          localCount: typeof node.localCount === 'number' ? node.localCount : processedImages.length,
          hasChildren: node.hasChildren
        };
      };
      
      const receivedTree = (data.tree || []).map((node: ApiNodeData) => transformNode(node, null));
      const receivedImages = (data.rootImages || []).map((img: ApiImageData) => {
        const prepStatus = img.preparationStatus || 'not_started';
        if (prepStatus !== 'not_started') {
          newItems[img.id] = { status: prepStatus as any, lastChecked: Date.now() };
        }
        return {
          ...img,
          preparationStatus: prepStatus
        };
      });

      // Helper: compute aggregated imageCount recursively
      const computeAggregatedCounts = (nodes: VisionFileNode[] | undefined): number => {
        if (!nodes) return 0;
        let total = 0;
        for (const n of nodes) {
          // compute children first
          const childImageTotal = computeAggregatedCounts(n.children);
          // own indexed count: prefer server-provided imageCount (indexed), otherwise use images length
          const ownIndexed = typeof n.imageCount === 'number' && n.imageCount >= 0 ? n.imageCount : (n.images || []).length;
          // own local count: prefer server-provided localCount, otherwise use images length
          const ownLocal = typeof n.localCount === 'number' && n.localCount >= 0 ? n.localCount : (n.images || []).length;

          n.imageCount = ownIndexed + childImageTotal;

          // compute aggregated localCount as well (for local vs indexed badges)
          const childLocalTotal = (n.children || []).reduce((s, c) => s + ((c.localCount || 0)), 0);
          n.localCount = ownLocal + childLocalTotal;

          total += n.imageCount || 0;
        }
        return total;
      };

      if (!pathParam) {
        const rootNode: VisionFileNode = {
          id: 'root',
          name: '📁 Banque IA',
          path: 'data/banque_images_ia',
          type: 'directory',
          parentId: null,
          children: receivedTree,
          images: receivedImages,
          imageCount: receivedImages.length,
          hasChildren: receivedTree.length > 0 || receivedImages.length > 0
        };

        // compute aggregated counts for the whole tree
        // root's own images are receivedImages.length, add children totals
        const childrenTotal = computeAggregatedCounts(rootNode.children);
        rootNode.imageCount = (rootNode.images || []).length + childrenTotal;
        
        // ⚡ Mettre à jour le cache module-level
        _cachedTree = [rootNode];
        _cachedPrep = { ..._cachedPrep, ...newItems };
        _lastFetchTime = Date.now();
        
        if (isMounted.current) {
          setTree([rootNode]);
          setPreparationCache(prev => ({ ...prev, ...newItems }));
          setExpandedNodes(prev => {
            const next = new Set(prev);
            next.add('data/banque_images_ia');
            return next;
          });
        }
      } else {
        const updateNodeInTree = (nodes: VisionFileNode[]): VisionFileNode[] => {
          return nodes.map(node => {
            if (node.path === pathParam) {
              return {
                ...node,
                children: receivedTree,
                images: receivedImages,
                imageCount: receivedImages.length,
                hasChildren: receivedTree.length > 0 || receivedImages.length > 0
              };
            }
            if (node.children && node.children.length > 0) {
              return { ...node, children: updateNodeInTree(node.children) };
            }
            return node;
          });
        };
        
        if (isMounted.current) {
          setTree(prev => {
            const updated = updateNodeInTree(prev);
            // Recompute aggregated counts for the updated tree
            const recompute = (nodes: VisionFileNode[]): number => {
              let total = 0;
              for (const n of nodes) {
                if (n.children && n.children.length > 0) recompute(n.children);
                // Prefer existing n.imageCount (indexed) as own count, otherwise fallback to images length
              const ownIdx = typeof n.imageCount === 'number' && n.imageCount >= 0 ? n.imageCount : (n.images || []).length;
              n.imageCount = ownIdx + (n.children ? n.children.reduce((s, c) => s + (c.imageCount || 0), 0) : 0);

              // Recompute localCount aggregated too
              const ownLocal = typeof n.localCount === 'number' && n.localCount >= 0 ? n.localCount : (n.images || []).length;
              n.localCount = ownLocal + (n.children ? n.children.reduce((s, c) => s + (c.localCount || 0), 0) : 0);

              total += n.imageCount || 0;
              }
              return total;
            };

            recompute(updated);
            _cachedTree = updated; // ⚡ Mettre à jour le cache module
            _lastFetchTime = Date.now();
            return updated;
          });
          setPreparationCache(prev => ({ ...prev, ...newItems }));
        }
      }
      
    } catch (error) {
      console.error('Erreur chargement arborescence:', error);
      if (!silent && isMounted.current) {
        toast({ 
          variant: "destructive", 
          title: "Erreur", 
          description: "Impossible de charger l'arborescence." 
        });
      }
    } finally {
      if (!silent && isMounted.current) setLoading(false);
    }
  }, [toast]);

  const findNodeInNodes = (nodes: VisionFileNode[], targetPath: string): VisionFileNode | null => {
    for (const node of nodes) {
      if (node.path === targetPath) return node;
      if (node.children) {
        const found = findNodeInNodes(node.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  };

  const findNodeByPath = useCallback((path: string): VisionFileNode | null => {
    return findNodeInNodes(tree, path);
  }, [tree]);

  const refreshNode = useCallback(async (nodeId: string) => {
    const node = findNodeByPath(nodeId);
    if (node) {
      await loadTree(true, node.path);
    }
  }, [findNodeByPath, loadTree]);

  // 🔥 CORRECTION : Le type de retour inclut 'pending'
  const getPreparationStatus = useCallback((imageId: string): 'not_started' | 'processing' | 'completed' | 'failed' | 'pending' | null => {
    const cached = preparationCache[imageId];
    if (cached) return cached.status;
    
    const findImage = (nodes: VisionFileNode[]): ImageMetadata | null => {
      for (const node of nodes) {
        if (node.images) {
          const img = node.images.find(i => i.id === imageId);
          if (img) return img;
        }
        if (node.children) {
          const found = findImage(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    
    const image = findImage(tree);
    return image?.preparationStatus || null;
  }, [preparationCache, tree]);

  const refreshImageStatus = useCallback(async (imageId: string) => {
    try {
      const response = await fetch(`/api/vision/prepare?imageId=${imageId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.preparation) {
          setPreparationCache(prev => ({
            ...prev,
            [imageId]: {
              status: data.preparation.status,
              lastChecked: Date.now(),
              rois: data.preparation.rois,
              anchors: data.preparation.anchors
            }
          }));
          return data.preparation.status;
        }
      }
    } catch (error) {
      console.error('Erreur refresh status:', error);
    }
    return null;
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) {
      // Cache vide ou expiré → chargement normal (avec spinner)
      hasLoaded.current = true;
      loadTree(false);
    } else {
      // Cache valide → revalidation silencieuse immédiate pour synchroniser les compteurs dès l'affichage
      // Utiliser silent=true pour éviter le spinner mais mettre à jour les compteurs rapidement
      loadTree(true);
      return;
    }
  }, [loadTree]);

  // Écouter un événement global 'bank-reset' pour forcer le rechargement de l'arbre
  useEffect(() => {
    const handler = () => {
      try {
        // Invalider le cache module-level et forcer un reload complet
        _cachedTree = null;
        _lastFetchTime = 0;
        // Appeler loadTree sans silent pour montrer le spinner si nécessaire
        loadTree(false);
      } catch (e) {
        console.error('Error handling bank-reset event', e);
      }
    };

    window.addEventListener('bank-reset', handler);
    return () => window.removeEventListener('bank-reset', handler);
  }, [loadTree]);

  const toggleNode = useCallback(async (path: string) => {
    const isExpanding = !expandedNodes.has(path);
    
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

    if (isExpanding) {
      const node = findNodeByPath(path);
      if (node && (!node.children || node.children.length === 0) && node.hasChildren) {
        await loadTree(true, path);
      }
    }
  }, [expandedNodes, findNodeByPath, loadTree]);

  const expandAll = useCallback(() => {
    const getAllPaths = (nodes: VisionFileNode[]): string[] => {
      let paths: string[] = [];
      for (const node of nodes) {
        paths.push(node.path);
        if (node.children) {
          paths = [...paths, ...getAllPaths(node.children)];
        }
      }
      return paths;
    };
    
    const allPaths = getAllPaths(tree);
    setExpandedNodes(new Set(allPaths));
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set(['data/banque_images_ia']));
  }, []);

  const getFolderImages = useCallback((folderId: string): ImageMetadata[] => {
    const folder = findNodeByPath(folderId);
    return folder?.images || [];
  }, [findNodeByPath]);

  const getPreparationStats = useCallback(() => {
    let total = 0;
    let completed = 0;
    let processing = 0;
    let failed = 0;
    let pending = 0;
    
    Object.values(preparationCache).forEach(cache => {
      total++;
      if (cache.status === 'completed') completed++;
      else if (cache.status === 'processing') processing++;
      else if (cache.status === 'failed') failed++;
      else if (cache.status === 'pending') pending++;
    });
    
    return { total, completed, processing, failed, pending, totalPrepared };
  }, [preparationCache, totalPrepared]);

  const refreshTree = useCallback(async () => {
    await loadTree(false);
  }, [loadTree]);

  // 🔥 ACTIONS OPTIMISTES
  const removeItem = useCallback((id: string, type: 'file' | 'directory') => {
    // ⚡ IDs d'images supprimées pour nettoyer le cache de préparation
    const removedImageIds: string[] = [];
    
    const filterNodes = (nodes: VisionFileNode[]): VisionFileNode[] => {
      return nodes
        .filter(n => {
          // Un nœud est supprimé s'il correspond à l'ID et au type
          const isTargetNode = n.id === id && (n.type === type || (type === 'file' && n.type === 'file'));
          
          if (isTargetNode) {
            // Si on supprime un dossier, on doit collecter toutes les images à l'intérieur pour le cache
            if (n.type === 'directory') {
              const collectIds = (node: VisionFileNode) => {
                node.images?.forEach(img => removedImageIds.push(img.id));
                node.children?.forEach(collectIds);
              };
              collectIds(n);
            } else {
              removedImageIds.push(n.id);
            }
            return false;
          }
          return true;
        })
        .map(n => {
          const hasImageInList = n.images?.some(img => img.id === id);
          // Cette fonctionnalité permet de savoir si une image a été retirée de ce dossier spécifique
          const wasImageRemoved = type === 'file' && hasImageInList;
          
          if (wasImageRemoved) {
            removedImageIds.push(id);
          }

          const filteredChildren = n.children ? filterNodes(n.children) : [];
          
          return {
            ...n,
            children: filteredChildren,
            images: n.images ? n.images.filter(img => img.id !== id) : [],
            // Si une image a été supprimée dans ce dossier, on décrémente le compteur
            imageCount: wasImageRemoved ? Math.max(0, (n.imageCount || 0) - 1) : n.imageCount
          };
        });
    };
    
    setTree(prev => {
      const next = filterNodes(prev);
      _cachedTree = next; // ⚡ Mettre à jour le cache persistent (module-level)
      return next;
    });

    // ⚡ Nettoyage synchronisé du cache de préparation IA
    if (removedImageIds.length > 0) {
      setPreparationCache(prev => {
        const next = { ...prev };
        let changed = false;
        removedImageIds.forEach(imgId => {
          if (next[imgId]) {
            delete next[imgId];
            changed = true;
          }
        });
        if (changed) {
          _cachedPrep = next; // ⚡ Mettre à jour le cache module
          return next;
        }
        return prev;
      });
    }

    // Retirer également des nœuds développés si c'est un dossier
    if (type === 'directory') {
      setExpandedNodes(prev => {
        const next = new Set(prev);
        // On ne connaît pas forcément le chemin exact ici car on n'a que l'ID,
        // mais si l'ID est le chemin (ce qui est souvent le cas dans cette structure), ça aide.
        if (next.has(id)) {
          next.delete(id);
          return next;
        }
        return prev;
      });
    }
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<VisionFileNode | ImageMetadata>) => {
    const mapNodes = (nodes: VisionFileNode[]): VisionFileNode[] => {
      return nodes.map(n => {
        if (n.id === id) return { ...n, ...updates };
        return {
          ...n,
          children: n.children ? mapNodes(n.children) : [],
          images: n.images ? n.images.map(img => img.id === id ? { ...img, ...updates } : img) : []
        };
      });
    };
    
    setTree(prev => {
      const next = mapNodes(prev);
      _cachedTree = next;
      return next;
    });
  }, []);

  return { 
    tree, 
    loading, 
    expandedNodes,
    totalPrepared,
    preparationCache,
    loadTree, 
    refreshNode,
    toggleNode, 
    expandAll,
    collapseAll,
    findNodeByPath,
    getFolderImages,
    getPreparationStatus,
    refreshImageStatus,
    getPreparationStats,
    refreshTree,
    removeItem,
    updateItem
  };
}