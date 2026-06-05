// src/components/industrial-vision/TreeViewer.tsx

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FolderTree,
  FolderOpen,
  FileImage,
  FileJson,
  ChevronRight,
  ChevronDown,
  Database,
  Image as ImageIcon,
  RefreshCw,
  Search,
  HardDrive,
  Trash2,
  Copy,
  FileText
} from 'lucide-react';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  children?: TreeNode[];
  metadata?: any;
}

interface TreeStats {
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  totalSizeFormatted: string;
  byExtension: Record<string, number>;
}

interface TreeViewerProps {
  initialPath?: string;
  onFileSelect?: (path: string) => void;
  onDelete?: (path: string) => void;
  showActions?: boolean;
}

export function TreeViewer({ initialPath, onFileSelect, onDelete, showActions = true }: TreeViewerProps) {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('references');
  const [stats, setStats] = useState<TreeStats>({
    totalFiles: 0,
    totalDirectories: 0,
    totalSize: 0,
    totalSizeFormatted: '0 B',
    byExtension: {}
  });

  // Charger l'arborescence
  const loadTree = async (type: 'references' | 'captures' | 'all') => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/industrial-vision/tree?type=${type}&metadata=true&format=json`);
      const data = await response.json();
      
      if (data.success) {
        setTree(data.tree);
        setStats({
          totalFiles: data.stats?.totalFiles || 0,
          totalDirectories: data.stats?.totalDirectories || 0,
          totalSize: data.stats?.totalSize || 0,
          totalSizeFormatted: data.stats?.totalSizeFormatted || '0 B',
          byExtension: data.stats?.byExtension || {}
        });
        
        // Expand root by default
        if (data.tree) {
          setExpandedNodes(new Set([data.tree.name]));
        }
      }
    } catch (error) {
      console.error('Erreur chargement arborescence:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Charger l'arborescence d'un dossier spécifique
  const loadPathTree = async (path: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/industrial-vision/tree?path=${encodeURIComponent(path)}&format=json`);
      const data = await response.json();
      
      if (data.success) {
        setTree(data.tree);
        setStats({
          totalFiles: data.stats?.totalFiles || 0,
          totalDirectories: data.stats?.totalDirectories || 0,
          totalSize: data.stats?.totalSize || 0,
          totalSizeFormatted: data.stats?.totalSizeFormatted || '0 B',
          byExtension: data.stats?.byExtension || {}
        });
      }
    } catch (error) {
      console.error('Erreur chargement chemin:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialPath) {
      loadPathTree(initialPath);
    } else {
      loadTree('all');
    }
  }, [initialPath]);

  // Toggle expansion d'un nœud
  const toggleNode = (nodePath: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodePath)) {
      newExpanded.delete(nodePath);
    } else {
      newExpanded.add(nodePath);
    }
    setExpandedNodes(newExpanded);
  };

  // Filtrer l'arbre par recherche
  const filterTree = (node: TreeNode, term: string): TreeNode | null => {
    if (!term.trim()) return node;
    
    const matchesName = node.name.toLowerCase().includes(term.toLowerCase());
    
    if (node.type === 'file') {
      return matchesName ? node : null;
    }
    
    const filteredChildren = node.children
      ?.map(child => filterTree(child, term))
      .filter((child): child is TreeNode => child !== null);
    
    if (matchesName || (filteredChildren && filteredChildren.length > 0)) {
      return {
        ...node,
        children: filteredChildren
      };
    }
    
    return null;
  };

  // Formater la taille
  const formatSize = (bytes?: number): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Obtenir l'icône d'un fichier
  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp') {
      return <ImageIcon className="h-4 w-4 text-emerald-400" />;
    }
    if (ext === 'json') {
      return <FileJson className="h-4 w-4 text-yellow-400" />;
    }
    if (ext === 'pdf') {
      return <FileText className="h-4 w-4 text-red-400" />;
    }
    return <FileImage className="h-4 w-4 text-gray-400" />;
  };

  // Rendu récursif de l'arbre
  const renderTree = (node: TreeNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.path);
    const hasChildren = node.children && node.children.length > 0;
    const indent = level * 20;
    
    return (
      <div key={node.path} style={{ marginLeft: indent }}>
        <div
          className={`flex items-center gap-1 py-1 px-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer group ${
            node.type === 'directory' ? 'font-medium' : ''
          }`}
          onClick={() => {
            if (node.type === 'directory') {
              toggleNode(node.path);
            } else if (onFileSelect) {
              onFileSelect(node.path);
            }
          }}
        >
          {/* Expand button for directories */}
          {node.type === 'directory' && (
            <button
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(node.path);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
              )}
            </button>
          )}
          
          {/* Icon */}
          {node.type === 'directory' ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-blue-400" />
            ) : (
              <FolderTree className="h-4 w-4 text-blue-400" />
            )
          ) : (
            getFileIcon(node.name)
          )}
          
          {/* Name */}
          <span className="text-sm flex-1 truncate">{node.name}</span>
          
          {/* Size and modified for files */}
          {node.type === 'file' && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {node.size && <span>{formatSize(node.size)}</span>}
              {node.modified && (
                <span className="hidden md:inline">
                  {new Date(node.modified).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
          
          {/* Actions */}
          {showActions && node.type === 'file' && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(node.path);
                }}
                title="Copier le chemin"
              >
                <Copy className="h-3 w-3" />
              </button>
              {onDelete && (
                <button
                  className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Supprimer ${node.name} ?`)) {
                      onDelete(node.path);
                      loadTree(activeTab === 'references' ? 'references' : activeTab === 'captures' ? 'captures' : 'all');
                    }
                  }}
                  title="Supprimer"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* Children */}
        {isExpanded && hasChildren && node.children && (
          <div>
            {node.children.map(child => renderTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const filteredTree = searchTerm ? filterTree(tree!, searchTerm) : tree;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-cyan-500" />
            Explorateur de fichiers
            <Badge variant="outline" className="ml-2">
              {stats.totalFiles} fichiers
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => loadTree(activeTab === 'references' ? 'references' : activeTab === 'captures' ? 'captures' : 'all')}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => {
          setActiveTab(v);
          loadTree(v === 'references' ? 'references' : v === 'captures' ? 'captures' : 'all');
          setSearchTerm('');
          setExpandedNodes(new Set());
        }}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="references">
              <Database className="h-3.5 w-3.5 mr-1" />
              Références
            </TabsTrigger>
            <TabsTrigger value="captures">
              <ImageIcon className="h-3.5 w-3.5 mr-1" />
              Captures
            </TabsTrigger>
            <TabsTrigger value="all">
              <HardDrive className="h-3.5 w-3.5 mr-1" />
              Tous
            </TabsTrigger>
          </TabsList>

          {/* Search bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Rechercher un fichier ou dossier..."
              className="pl-9 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Stats summary */}
          <div className="grid grid-cols-3 gap-2 mb-4 text-xs">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 text-center">
              <p className="text-gray-500">Fichiers</p>
              <p className="font-bold">{stats.totalFiles}</p>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 text-center">
              <p className="text-gray-500">Taille totale</p>
              <p className="font-bold text-xs">{stats.totalSizeFormatted}</p>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 text-center">
              <p className="text-gray-500">Dossiers</p>
              <p className="font-bold">{stats.totalDirectories}</p>
            </div>
          </div>

          {/* Tree view */}
          <TabsContent value={activeTab} className="mt-0">
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                  <p className="text-sm text-gray-500 mt-2">Chargement...</p>
                </div>
              ) : filteredTree ? (
                <div className="space-y-0.5">
                  {renderTree(filteredTree)}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FolderTree className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Aucun fichier trouvé</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Quick stats footer */}
        {Object.keys(stats.byExtension).length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-gray-500 mb-2">Types de fichiers</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byExtension).map(([ext, count]) => (
                <Badge key={ext} variant="secondary" className="text-xs">
                  .{ext}: {count}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {showActions && (
          <div className="mt-4 pt-4 border-t flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => {
              const allPaths: string[] = [];
              const collectPaths = (node: TreeNode) => {
                if (node.type === 'file') {
                  allPaths.push(node.path);
                }
                if (node.children) {
                  node.children.forEach(collectPaths);
                }
              };
              if (tree) collectPaths(tree);
              const text = allPaths.join('\n');
              navigator.clipboard.writeText(text);
            }}>
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copier tous les chemins
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => {
              // Expand all directories
              const allPaths = new Set<string>();
              const collectPathsForExpand = (node: TreeNode) => {
                if (node.type === 'directory') {
                  allPaths.add(node.path);
                }
                if (node.children) {
                  node.children.forEach(collectPathsForExpand);
                }
              };
              if (tree) collectPathsForExpand(tree);
              setExpandedNodes(allPaths);
            }}>
              <ChevronDown className="h-3.5 w-3.5 mr-1" />
              Tout développer
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}