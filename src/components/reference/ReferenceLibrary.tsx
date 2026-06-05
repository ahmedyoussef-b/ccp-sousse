// src/components/reference/ReferenceLibrary.tsx

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderTree,
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  Hash,
  Tag,
  Settings,
  Info,
  ImageIcon,
  Trash2,
  Edit3,
  Save,
  X,
  Database,
  Layers,
  Activity,
  Filter,
  MoreVertical,
  ExternalLink,
  Loader2,
  RefreshCw,
  PlusCircle,
  FileText,
  MapPin,
  Calendar,
  Zap,
  Brain,
  Camera,
  Paperclip
} from 'lucide-react';
import { MetadataViewer } from '../admin/components/MetadataViewer';
import { ReferenceImageSelectionDialog } from './ReferenceImageSelectionDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

// Types
interface Zone {
  id: string;
  name: string;
  description: string;
  circuits?: Circuit[];
}

interface Circuit {
  id: string;
  zoneId: string;
  name: string;
  description: string;
  parametres?: Parametre[];
}

interface Parametre {
  id: string;
  circuitId: string;
  name: string;
  unit?: string;
  dataType?: string;
  description?: string;
}

interface LinkedImage {
  id: string;
  filename: string;
  filepath: string;
  description: string;
  tags: string[];
  metadata: any;
  image?: string;
  createdAt: number;
  equipmentState: string;
  imageType?: 'global' | 'simple' | 'part';
}

export function ReferenceLibrary() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedEntity, setSelectedEntity] = useState<{ type: 'zone' | 'circuit' | 'parametre', data: any } | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Linked Images states
  const [linkedImages, setLinkedImages] = useState<LinkedImage[]>([]);
  const [isImagesLoading, setIsImagesLoading] = useState(false);
  const [selectedImageForEdit, setSelectedImageForEdit] = useState<LinkedImage | null>(null);
  const [imageFilter, setImageFilter] = useState<'all' | 'global' | 'simple'>('all');

  // Modal / Editing states
  const [isEditing, setIsEditing] = useState(false);
  const [isMetadataEditing, setIsMetadataEditing] = useState(false);
  const [isMetaPanelOpen, setIsMetaPanelOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [metadataJsonString, setMetadataJsonString] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  const [addData, setAddData] = useState<{ type: 'zone' | 'circuit' | 'parametre', parentId?: string, data: any } | null>(null);

  useEffect(() => {
    fetchData();
    fetchStats();
  }, []);

  useEffect(() => {
    if (selectedEntity && activeTab === 'images') {
      fetchLinkedImages();
    }
  }, [selectedEntity, activeTab]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/reference/hierarchy');
      const data = await res.json();
      setZones(data.zones || []);
    } catch (error) {
      console.error('Error fetching hierarchy:', error);
      toast({ title: "Erreur", description: "Impossible de charger la bibliothèque.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/reference/stats');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchLinkedImages = async () => {
    if (!selectedEntity) return;
    setIsImagesLoading(true);
    try {
      const res = await fetch(`/api/reference/images?entityId=${selectedEntity.data.id}&entityType=${selectedEntity.type}`);
      const data = await res.json();
      setLinkedImages(data.images || []);
    } catch (error) {
      console.error('Error fetching linked images:', error);
      toast({ title: "Erreur", description: "Impossible de charger les images liées.", variant: "destructive" });
    } finally {
      setIsImagesLoading(false);
    }
  };

  const toggleNode = (id: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedNodes(newExpanded);
  };

  const filteredZones = useMemo(() => {
    if (!searchQuery) return zones;
    const lowerQuery = searchQuery.toLowerCase();

    return zones.map(zone => {
      const matchesZone = zone.name.toLowerCase().includes(lowerQuery) || zone.id.toLowerCase().includes(lowerQuery);
      const filteredCircuits = zone.circuits?.filter(circuit =>
        circuit.name.toLowerCase().includes(lowerQuery) || circuit.id.toLowerCase().includes(lowerQuery)
      ) || [];

      if (matchesZone || filteredCircuits.length > 0) {
        return { ...zone, circuits: filteredCircuits };
      }
      return null;
    }).filter(Boolean) as Zone[];
  }, [zones, searchQuery]);

  const handleSaveMetadata = async () => {
    try {
      let parsedMetadata = {};
      try {
        if (metadataJsonString.trim()) {
          parsedMetadata = JSON.parse(metadataJsonString);
        }
      } catch (err) {
        toast({ title: "JSON Invalide", description: "Veuillez vérifier le format du JSON.", variant: "destructive" });
        return;
      }

      const res = await fetch('/api/reference/hierarchy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          type: selectedEntity?.type,
          data: { ...selectedEntity?.data, metadata: parsedMetadata }
        })
      });

      if (res.ok) {
        toast({ title: "Succès", description: "Métadonnées enregistrées." });
        setIsMetaPanelOpen(false);
        fetchData();
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Échec de la sauvegarde des métadonnées.", variant: "destructive" });
    }
  };

  const handleSave = async () => {
    try {
      const res = await fetch('/api/reference/hierarchy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          type: selectedEntity?.type,
          data: editData
        })
      });

      if (res.ok) {
        toast({ title: "Succès", description: "Enregistrement réussi." });
        setIsEditing(false);
        fetchData();
        fetchStats();
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Échec de l'enregistrement.", variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!addData) return;
    try {
      const res = await fetch('/api/reference/hierarchy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save', // On réutilise save car c'est un INSERT OR REPLACE
          type: addData.type,
          data: {
            ...addData.data,
            zoneId: addData.type === 'circuit' ? addData.parentId : undefined,
            circuitId: addData.type === 'parametre' ? addData.parentId : undefined,
          }
        })
      });

      if (res.ok) {
        toast({ title: "Succès", description: "Nouvelle entrée créée." });
        setIsAdding(false);
        setAddData(null);
        fetchData();
        fetchStats();
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Échec de la création.", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!selectedEntity || !window.confirm(`Êtes-vous sûr de vouloir supprimer cette ${selectedEntity.type} ?`)) return;

    try {
      const res = await fetch('/api/reference/hierarchy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          type: selectedEntity.type,
          data: { id: selectedEntity.data.id }
        })
      });

      if (res.ok) {
        toast({ title: "Succès", description: "Entité supprimée." });
        setSelectedEntity(null);
        fetchData();
        fetchStats();
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Échec de la suppression.", variant: "destructive" });
    }
  };

  const handleUpdateImageMetadata = async (imageId: string, updatedMetadata: any) => {
    try {
      const res = await fetch('/api/reference/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_metadata',
          imageId,
          metadata: updatedMetadata
        })
      });

      if (res.ok) {
        toast({ title: "Succès", description: "Métadonnées de l'image mises à jour." });
        setSelectedImageForEdit(null);
        fetchLinkedImages();
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Échec de la mise à jour.", variant: "destructive" });
    }
  };

  const associateImage = async () => {
    if (!selectedEntity) return;
    const imageId = window.prompt("Entrez l'ID de l'image à associer (ex: vision_XXX) :");
    if (!imageId) return;
    
    try {
      const res = await fetch('/api/reference/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'associate',
          entityId: selectedEntity.data.id,
          entityType: selectedEntity.type,
          imageId
        })
      });
      
      if (res.ok) {
        toast({ title: "Succès", description: "Image associée avec succès." });
        fetchLinkedImages();
      } else {
        const err = await res.json();
        throw new Error(err.error || "Erreur lors de l'association.");
      }
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message || "Échec de l'association.", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Premium Header */}
      <header className="px-8 py-6 border-b border-white/5 bg-black/40 backdrop-blur-xl flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
            <FolderTree className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Bibliothèque d'IDs Structurés</h1>
            <p className="text-xs text-gray-400 mt-0.5">Hiérarchie industrielle : Zone → Circuit → Paramètre</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-amber-500 transition-colors" />
            <Input
              placeholder="Rechercher un ID, nom..."
              className="pl-10 w-64 bg-white/5 border-white/10 focus:border-amber-500/50 focus:ring-amber-500/10 transition-all rounded-xl text-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10 rounded-xl gap-2 text-white" onClick={fetchData}>
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </Button>
          <Button
            className="bg-amber-600 hover:bg-amber-500 text-white rounded-xl gap-2 shadow-lg shadow-amber-900/20"
            onClick={() => {
              setIsAdding(true);
              setAddData({ type: 'zone', data: { id: '', name: '', description: '' } });
            }}
          >
            <PlusCircle className="w-4 h-4" />
            Nouvelle Zone
          </Button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Tree View */}
        <div className="w-[380px] border-r border-white/5 flex flex-col shrink-0 bg-black/20">
          <div className="p-4 border-b border-white/5 flex items-center justify-between text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            <span>Explorateur Hiérarchique</span>
            <div className="flex gap-2">
              <Badge variant="outline" className="bg-blue-500/5 text-blue-400 border-blue-500/10">{stats?.zones || 0} Zones</Badge>
              <Badge variant="outline" className="bg-amber-500/5 text-amber-400 border-amber-500/10">{stats?.circuits || 0} Circuits</Badge>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
                <p className="text-sm text-gray-400">Synchronisation des données...</p>
              </div>
            ) : filteredZones.length === 0 ? (
              <div className="text-center py-20 px-10">
                <Search className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                <p className="text-gray-400 text-sm">Aucun résultat trouvé pour "{searchQuery}"</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredZones.map(zone => (
                  <div key={zone.id} className="space-y-1">
                    {/* Zone Node */}
                    <div
                      className={cn(
                        "group flex items-center gap-2 p-2 rounded-xl transition-all cursor-pointer",
                        selectedEntity?.data?.id === zone.id ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" : "hover:bg-white/5 text-gray-300 border border-transparent"
                      )}
                      onClick={() => setSelectedEntity({ type: 'zone', data: zone })}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleNode(zone.id); }}
                        className="p-1 hover:bg-white/10 rounded-md transition-colors"
                      >
                        {expandedNodes.has(zone.id) ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                      </button>
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
                        <Hash className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate">{zone.id}</div>
                        <div className="text-[10px] text-gray-500 truncate">{zone.name}</div>
                      </div>
                      <Badge variant="outline" className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity border-white/10">ZONE</Badge>
                    </div>

                    {/* Circuits (Children of Zone) */}
                    {expandedNodes.has(zone.id) && zone.circuits && (
                      <div className="ml-6 pl-4 border-l border-white/10 space-y-1 py-1">
                        {zone.circuits.map(circuit => (
                          <div key={circuit.id} className="space-y-1">
                            <div
                              className={cn(
                                "group flex items-center gap-2 p-2 rounded-xl transition-all cursor-pointer",
                                selectedEntity?.data?.id === circuit.id ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "hover:bg-white/5 text-gray-400 border border-transparent"
                              )}
                              onClick={() => setSelectedEntity({ type: 'circuit', data: circuit })}
                            >
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleNode(circuit.id); }}
                                className="p-1 hover:bg-white/10 rounded-md transition-colors"
                              >
                                {expandedNodes.has(circuit.id) ? <ChevronDown className="w-3.5 h-3.5 text-gray-600" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
                              </button>
                              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
                                <Tag className="w-3.5 h-3.5 text-emerald-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{circuit.id.split('-').pop()}</div>
                                <div className="text-[10px] text-gray-500 truncate">{circuit.name}</div>
                              </div>
                              <Badge variant="outline" className="text-[8px] opacity-0 group-hover:opacity-100 transition-opacity border-white/10">CIRCUIT</Badge>
                            </div>

                            {/* Parameters (Children of Circuit) */}
                            {expandedNodes.has(circuit.id) && circuit.parametres && (
                              <div className="ml-5 pl-4 border-l border-white/5 space-y-1 py-1">
                                {circuit.parametres.map(param => (
                                  <div
                                    key={param.id}
                                    className={cn(
                                      "group flex items-center gap-2 p-1.5 rounded-lg transition-all cursor-pointer",
                                      selectedEntity?.data?.id === param.id ? "bg-purple-500/10 text-purple-500 border border-purple-500/20" : "hover:bg-white/5 text-gray-500 border border-transparent"
                                    )}
                                    onClick={() => setSelectedEntity({ type: 'parametre', data: param })}
                                  >
                                    <div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center border border-purple-500/20 shrink-0">
                                      <Activity className="w-3 h-3 text-purple-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-medium truncate">{param.id}</div>
                                      <div className="text-[9px] text-gray-600 truncate">{param.name}</div>
                                    </div>
                                    {param.unit && <span className="text-[8px] font-bold text-gray-500">{param.unit}</span>}
                                  </div>
                                ))}
                                <Button
                                  variant="ghost" size="sm"
                                  className="w-full h-7 text-[9px] text-gray-600 hover:text-white hover:bg-white/5 border border-dashed border-white/10 rounded-lg mt-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsAdding(true);
                                    setAddData({ type: 'parametre', parentId: circuit.id, data: { id: '', name: '', description: '', unit: '', dataType: 'numeric' } });
                                  }}
                                >
                                  + Ajouter un paramètre
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                        <Button
                          variant="ghost" size="sm"
                          className="w-full h-8 text-[10px] text-gray-500 hover:text-white hover:bg-white/5 border border-dashed border-white/10 rounded-xl mt-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsAdding(true);
                            setAddData({ type: 'circuit', parentId: zone.id, data: { id: '', name: '', description: '' } });
                          }}
                        >
                          + Ajouter un circuit
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right Pane: Details & Context */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {selectedEntity ? (
            <ScrollArea className="flex-1">
              <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                {/* Header Card */}
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/20 to-purple-500/20 rounded-[2rem] blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
                  <Card className="relative bg-black/40 border-white/10 backdrop-blur-xl rounded-[2rem] overflow-hidden">
                    <CardHeader className="p-8 flex flex-row items-start justify-between gap-4">
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <Badge className={cn(
                            "rounded-full px-4 py-1 text-[10px] font-black uppercase tracking-[0.2em] border-none",
                            selectedEntity.type === 'zone' && "bg-blue-500/20 text-blue-400",
                            selectedEntity.type === 'circuit' && "bg-emerald-500/20 text-emerald-400",
                            selectedEntity.type === 'parametre' && "bg-purple-500/20 text-purple-400",
                          )}>
                            {selectedEntity.type === 'zone' ? 'Zone de Production' : selectedEntity.type === 'circuit' ? 'Circuit Technique' : 'Paramètre Unitaire'}
                          </Badge>
                          <div className="w-1 h-1 rounded-full bg-white/20" />
                          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">ID: {selectedEntity.data.id}</span>
                        </div>
                        <div>
                          <CardTitle className="text-4xl font-black tracking-tighter text-white">
                            {selectedEntity.data.name}
                          </CardTitle>
                          <CardDescription className="text-lg text-gray-400 mt-2 line-clamp-2 leading-relaxed">
                            {selectedEntity.data.description || "Aucune description détaillée pour cette entité."}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          className="border-white/10 bg-white/5 hover:bg-white/10 rounded-2xl px-6 py-4 h-auto text-white gap-2 text-xs font-bold uppercase tracking-widest" 
                          onClick={() => { setIsEditing(true); setEditData(selectedEntity.data); }}
                        >
                          <Edit3 className="w-5 h-5 text-amber-500" />
                          Modifier
                        </Button>
                        <Button 
                          variant="outline" 
                          className="border-red-500/20 bg-red-500/5 hover:bg-red-500/20 text-red-400 rounded-2xl p-4 h-auto" 
                          onClick={handleDelete}
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </div>
                    </CardHeader>
                  </Card>
                </div>

                {/* Content Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                  <TabsList className="bg-white/5 border border-white/10 p-1 rounded-2xl h-auto gap-1">
                    <TabsTrigger value="overview" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-amber-500 data-[state=active]:text-white transition-all text-xs font-bold uppercase tracking-widest text-gray-400">Vue d'ensemble</TabsTrigger>
                    <TabsTrigger value="images" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-amber-500 data-[state=active]:text-white transition-all text-xs font-bold uppercase tracking-widest text-gray-400 flex gap-2 items-center">
                      Images liées <Badge className="bg-white/10 text-white border-none text-[8px] h-4 min-w-[16px] px-1">{linkedImages.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-amber-500 data-[state=active]:text-white transition-all text-xs font-bold uppercase tracking-widest text-gray-400">Configuration</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-6 outline-none">
                    <div className="grid grid-cols-3 gap-6">
                      <Card className="bg-black/20 border-white/10 rounded-3xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-amber-500">
                            <Info className="w-5 h-5" />
                            <span className="text-xs font-black uppercase tracking-widest">Informations</span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0 text-gray-500 hover:text-amber-500 hover:bg-white/5 rounded-md" 
                            onClick={() => { setIsEditing(true); setEditData(selectedEntity.data); }}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="text-xs text-gray-500">ID Système</span>
                            <span className="text-xs font-mono font-bold text-white">{selectedEntity.data.id}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="text-xs text-gray-500">Créé le</span>
                            <span className="text-xs font-bold text-white">{new Date(selectedEntity.data.createdAt || Date.now()).toLocaleDateString()}</span>
                          </div>
                          {selectedEntity.type === 'parametre' && (
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                              <span className="text-xs text-gray-500">Unité</span>
                              <Badge className="bg-purple-500/20 text-purple-400 border-none">{selectedEntity.data.unit || 'n/a'}</Badge>
                            </div>
                          )}
                        </div>
                      </Card>

                      <Card className="bg-black/20 border-white/10 rounded-3xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-blue-500">
                            <Settings className="w-5 h-5" />
                            <span className="text-xs font-black uppercase tracking-widest">Métadonnées</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-gray-500 hover:text-blue-400 hover:bg-white/5 rounded-md"
                            onClick={() => {
                              setMetadataJsonString(JSON.stringify(selectedEntity.data.metadata || {}, null, 2));
                              setIsMetaPanelOpen(true);
                            }}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div className="space-y-3">
                          {Object.keys(selectedEntity.data.metadata || {}).length === 0 ? (
                            <p className="text-[10px] text-gray-600 italic text-center py-2">Aucune métadonnée. Cliquez sur ✏️ pour en ajouter.</p>
                          ) : (
                            <div className="bg-black/40 rounded-xl p-3 border border-white/5 max-h-40 overflow-y-auto">
                              <pre className="text-[10px] font-mono text-gray-400">
                                {JSON.stringify(selectedEntity.data.metadata || {}, null, 2)}
                              </pre>
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/5 gap-2"
                            onClick={() => {
                              setMetadataJsonString(JSON.stringify(selectedEntity.data.metadata || {}, null, 2));
                              setIsMetaPanelOpen(true);
                            }}
                          >
                            + Modifier les données JSON
                          </Button>
                        </div>
                      </Card>

                      <Card className="bg-black/20 border-white/10 rounded-3xl p-6 space-y-4">
                        <div className="flex items-center gap-3 text-emerald-500">
                          <Activity className="w-5 h-5" />
                          <span className="text-xs font-black uppercase tracking-widest">Activité IA</span>
                        </div>
                        <div className="flex flex-col items-center justify-center py-4 space-y-2 opacity-50 text-center">
                          <p className="text-[10px] text-gray-400">Données d'apprentissage vectorielle consolidées.</p>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-500" />)}
                          </div>
                        </div>
                      </Card>
                    </div>

                    {/* Hierarchy Stats (if zone) */}
                    {selectedEntity.type === 'zone' && (
                      <Card className="bg-black/20 border-white/10 rounded-[2.5rem] p-8">
                        <div className="flex items-center justify-between mb-8">
                          <div className="flex items-center gap-3">
                            <Layers className="w-6 h-6 text-amber-500" />
                            <span className="text-sm font-black uppercase tracking-widest">Structure des Circuits</span>
                          </div>
                          <Button
                            size="sm"
                            className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20 rounded-xl gap-2"
                            onClick={() => {
                              setIsAdding(true);
                              setAddData({ type: 'circuit', parentId: selectedEntity.data.id, data: { id: '', name: '', description: '' } });
                            }}
                          >
                            <Plus className="w-4 h-4" /> Nouveau Circuit
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {selectedEntity.data.circuits?.map((c: any) => (
                            <div key={c.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/20 transition-all group cursor-pointer" onClick={() => setSelectedEntity({ type: 'circuit', data: c })}>
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                  <Tag className="w-5 h-5 text-emerald-500" />
                                </div>
                                <div>
                                  <div className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">{c.id.split('-').pop()}</div>
                                  <div className="text-[10px] text-gray-500">{c.name}</div>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-white transition-all transform group-hover:translate-x-1" />
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}
                  </TabsContent>

                  <TabsContent value="images" className="outline-none space-y-6">
                    {isImagesLoading ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                        <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
                        <p className="text-sm text-gray-400">Chargement des visuels...</p>
                      </div>
                    ) : linkedImages.length === 0 ? (
                      <Card className="bg-black/20 border-white/10 rounded-[2.5rem] p-12 flex flex-col items-center justify-center text-center space-y-4">
                        <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-4">
                          <ImageIcon className="w-10 h-10 text-gray-600" />
                        </div>
                        <h3 className="text-xl font-bold text-white">Aucune Image Associée</h3>
                        <p className="text-gray-400 text-sm max-w-sm">Associez des photographies industrielles à cet ID pour enrichir le moteur de recherche visuelle.</p>
                        <ReferenceImageSelectionDialog
                          entityId={selectedEntity.data.id}
                          entityType={selectedEntity.type}
                          entityName={selectedEntity.data.name || selectedEntity.data.id}
                          linkedImages={linkedImages}
                          onRefreshImages={fetchLinkedImages}
                          triggerButton={
                            <Button className="bg-white text-black hover:bg-gray-200 rounded-2xl px-8 h-12 font-bold gap-2">
                              <Plus className="w-4 h-4" />
                              Associer une image
                            </Button>
                          }
                        />
                      </Card>
                    ) : (
                      <div className="space-y-6">
                        {/* Premium Filter Controls for Image Types */}
                        <div className="flex items-center justify-between bg-white/5 border border-white/5 p-1 rounded-2xl w-fit gap-1">
                          <button
                            onClick={() => setImageFilter('all')}
                            className={cn(
                              "px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all",
                              imageFilter === 'all'
                                ? "bg-white/10 text-white shadow-md"
                                : "text-gray-400 hover:text-white"
                            )}
                          >
                            Toutes ({linkedImages.length})
                          </button>
                          <button
                            onClick={() => setImageFilter('global')}
                            className={cn(
                              "px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5",
                              imageFilter === 'global'
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                : "text-gray-400 hover:text-white"
                            )}
                          >
                            <Layers className="w-3.5 h-3.5" />
                            Globales Référence ({linkedImages.filter(i => i.imageType === 'global').length})
                          </button>
                          <button
                            onClick={() => setImageFilter('simple')}
                            className={cn(
                              "px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5",
                              imageFilter === 'simple'
                                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                : "text-gray-400 hover:text-white"
                            )}
                          >
                            <Camera className="w-3.5 h-3.5" />
                            Simples Terrain ({linkedImages.filter(i => i.imageType !== 'global').length})
                          </button>
                        </div>

                        {/* Grid list of filtered images */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                          {linkedImages
                            .filter(img => {
                              if (imageFilter === 'global') return img.imageType === 'global';
                              if (imageFilter === 'simple') return img.imageType !== 'global';
                              return true;
                            })
                            .map(img => {
                              const isGlobal = img.imageType === 'global';
                              return (
                                <div
                                  key={img.id}
                                  className={cn(
                                    "group relative bg-white/5 rounded-3xl overflow-hidden border transition-all cursor-pointer shadow-xl",
                                    isGlobal
                                      ? "border-amber-500/20 hover:border-amber-500/60 shadow-amber-950/10"
                                      : "border-blue-500/20 hover:border-blue-500/60 shadow-blue-950/10"
                                  )}
                                  onClick={() => setSelectedImageForEdit(img)}
                                >
                                  <div className="aspect-video relative overflow-hidden">
                                    {img.image ? (
                                      <img src={img.image} alt={img.filename} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                    ) : (
                                      <div className="w-full h-full bg-black flex items-center justify-center">
                                        <ImageIcon className="w-8 h-8 text-white/20" />
                                      </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                                    
                                    {/* Top-left Image Type Badge */}
                                    <div className="absolute top-2 left-2">
                                      <Badge 
                                        className={cn(
                                          "text-[7px] font-black tracking-widest border-none px-2 py-0.5 uppercase",
                                          isGlobal 
                                            ? "bg-amber-500/90 text-white shadow-lg shadow-amber-500/20"
                                            : "bg-blue-600/90 text-white shadow-lg shadow-blue-500/20"
                                        )}
                                      >
                                        {isGlobal ? "Global / CAO" : "Simple Terrain"}
                                      </Badge>
                                    </div>

                                    {/* Top-right Equipment State */}
                                    <div className="absolute top-2 right-2 flex gap-1">
                                      <Badge className="bg-black/60 backdrop-blur-md text-[8px] border-none uppercase font-black">{img.equipmentState}</Badge>
                                    </div>
                                  </div>
                                  
                                  <div className="p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <h4 className="text-xs font-bold text-white truncate pr-2 flex items-center gap-1.5">
                                        {isGlobal ? (
                                          <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                        ) : (
                                          <Camera className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                        )}
                                        {img.filename}
                                      </h4>
                                      <Edit3 className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <p className="text-[10px] text-gray-500 line-clamp-1 italic">{img.description || "Aucune description."}</p>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {img.tags.slice(0, 3).map(tag => (
                                        <Badge key={tag} variant="outline" className="text-[8px] py-0 px-1 border-white/10 text-gray-400 capitalize">{tag}</Badge>
                                      ))}
                                      {img.tags.length > 3 && <span className="text-[8px] text-gray-600">+{img.tags.length - 3}</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          
                          {/* Selection Dialog Button aligned as a card */}
                          <ReferenceImageSelectionDialog
                            entityId={selectedEntity.data.id}
                            entityType={selectedEntity.type}
                            entityName={selectedEntity.data.name || selectedEntity.data.id}
                            linkedImages={linkedImages}
                            onRefreshImages={fetchLinkedImages}
                            triggerButton={
                              <button 
                                className="aspect-video bg-white/5 rounded-3xl border border-white/10 border-dashed flex flex-col items-center justify-center gap-2 hover:bg-white/10 hover:border-white/20 transition-all group h-full min-h-[120px]"
                              >
                                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                                  <Plus className="w-5 h-5 text-gray-500 group-hover:text-amber-500" />
                                </div>
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Ajouter un visuel</span>
                              </button>
                            }
                          />
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="settings" className="space-y-6 outline-none">
                    <Card className="bg-black/20 border-white/10 rounded-[2.5rem] p-8 space-y-8">
                      <div className="flex items-center gap-3">
                        <Settings className="w-6 h-6 text-gray-400" />
                        <span className="text-sm font-black uppercase tracking-widest text-white">Configuration Avancée</span>
                      </div>
                      
                      <div className="space-y-6">
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-white">Synchronisation des métadonnées</p>
                            <p className="text-xs text-gray-500">Forcer la mise à jour des index vectoriels pour cet ID.</p>
                          </div>
                          <Button variant="outline" className="border-white/10 hover:bg-white/10 gap-2">
                            <RefreshCw className="w-4 h-4" /> Actualiser l'index
                          </Button>
                        </div>

                        <div className="p-6 bg-red-500/5 rounded-2xl border border-red-500/10 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-red-400">Zone de danger</p>
                            <p className="text-xs text-gray-500">La suppression est irréversible et affectera toutes les images liées.</p>
                          </div>
                          <Button variant="outline" className="border-red-500/20 hover:bg-red-500/20 text-red-400 gap-2" onClick={handleDelete}>
                            <Trash2 className="w-4 h-4" /> Supprimer l'entité
                          </Button>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/5">
                        <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-4">Exportation Technique</p>
                        <div className="bg-black/40 rounded-xl p-4 font-mono text-[10px] text-gray-400 overflow-hidden">
                          <pre>{JSON.stringify({ id: selectedEntity.data.id, type: selectedEntity.type, status: 'active' }, null, 2)}</pre>
                        </div>
                      </div>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-20 text-center space-y-6">
              <div className="relative">
                <div className="absolute inset-0 bg-amber-500/20 blur-[60px] rounded-full animate-pulse" />
                <Database className="w-32 h-32 text-white/5 relative z-10" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tighter text-white">Sélectionnez une entité</h2>
                <p className="text-gray-500 text-sm mt-2 max-w-xs mx-auto leading-relaxed text-gray-400">
                  Naviguez dans l'arborescence pour visualiser les détails, éditer les propriétés ou associer des ressources multimédias.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full max-w-md mt-10">
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-2">
                  <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Zones</div>
                  <div className="text-2xl font-black text-white">{stats?.zones || 0}</div>
                </div>
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-2">
                  <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Circuits</div>
                  <div className="text-2xl font-black text-white">{stats?.circuits || 0}</div>
                </div>
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-2">
                  <div className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Paramètres</div>
                  <div className="text-2xl font-black text-white">{stats?.parametres || 0}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Entity Editing Side Panel */}
      {isEditing && (
        <div className="absolute inset-y-0 right-0 w-[500px] bg-black/60 backdrop-blur-3xl border-l border-white/10 shadow-2xl z-50 animate-in slide-in-from-right duration-300">
          <div className="h-full flex flex-col">
            <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/20">
                  <Edit3 className="w-5 h-5 text-amber-500" />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-white">Modifier l'entité</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="rounded-full w-10 h-10 p-0 hover:bg-white/10 text-white">
                <X className="w-6 h-6" />
              </Button>
            </div>

            <ScrollArea className="flex-1 p-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                    <Hash className="w-3 h-3" /> Identifiant Système (ID)
                  </label>
                  <Input
                    value={editData?.id}
                    disabled
                    className="bg-white/5 border-white/10 text-gray-500 rounded-xl font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                    <FileText className="w-3 h-3" /> Nom de l'entité
                  </label>
                  <Input
                    value={editData?.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    className="bg-white/5 border-white/10 focus:border-amber-500/50 rounded-xl text-white h-12"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                    <Info className="w-3 h-3" /> Description
                  </label>
                  <Textarea
                    value={editData?.description}
                    onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                    className="bg-white/5 border-white/10 focus:border-amber-500/50 rounded-xl text-white min-h-[100px] resize-none"
                  />
                </div>
                {selectedEntity?.type === 'parametre' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Unité</label>
                      <Input
                        value={editData?.unit}
                        onChange={(e) => setEditData({ ...editData, unit: e.target.value })}
                        className="bg-white/5 border-white/10 focus:border-amber-500/50 rounded-xl text-white h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Type de donnée</label>
                      <select
                        value={editData?.dataType}
                        onChange={(e) => setEditData({ ...editData, dataType: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl text-white h-12 px-4 focus:border-amber-500/50 outline-none"
                      >
                        <option value="numeric">Numérique (Valeur)</option>
                        <option value="state">État (Marche/Arrêt)</option>
                        <option value="status">Statut (Ouvert/Fermé)</option>
                        <option value="text">Texte libre</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="p-8 border-t border-white/5 flex gap-4 shrink-0">
              <Button variant="outline" className="flex-1 h-14 rounded-2xl border-white/10 hover:bg-white/5 font-bold uppercase tracking-widest text-[10px] text-white" onClick={() => setIsEditing(false)}>Annuler</Button>
              <Button className="flex-1 h-14 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold uppercase tracking-widest text-[10px]" onClick={handleSave}>Enregistrer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Metadata Editing Side Panel */}
      {isMetaPanelOpen && selectedEntity && (
        <div className="absolute inset-y-0 right-0 w-[500px] bg-black/60 backdrop-blur-3xl border-l border-white/10 shadow-2xl z-50 animate-in slide-in-from-right duration-300 flex flex-col">
          <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
                <Settings className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Modifier les Métadonnées</h2>
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-0.5">{selectedEntity.data.id}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setIsMetaPanelOpen(false)} className="rounded-full w-10 h-10 p-0 hover:bg-white/10 text-white">
              <X className="w-6 h-6" />
            </Button>
          </div>

          <ScrollArea className="flex-1 p-8">
            <div className="space-y-4 flex flex-col h-full">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Données JSON brutes</p>
              
              <Textarea
                value={metadataJsonString}
                onChange={(e) => setMetadataJsonString(e.target.value)}
                placeholder={`{\n  "key": "value"\n}`}
                className="flex-1 min-h-[300px] bg-black/40 border-white/10 focus:border-blue-500/50 rounded-xl text-white font-mono text-xs p-4 resize-none"
              />

              <div className="mt-4 p-4 bg-blue-500/5 rounded-xl border border-blue-500/10">
                <p className="text-[10px] text-blue-400 flex items-center gap-2">
                  <Info className="w-3 h-3" />
                  Format JSON requis. N'utilisez que des guillemets doubles (").
                </p>
              </div>
            </div>
          </ScrollArea>

          <div className="p-8 border-t border-white/5 flex gap-4 shrink-0">
            <Button variant="outline" className="flex-1 h-14 rounded-2xl border-white/10 hover:bg-white/5 font-bold uppercase tracking-widest text-[10px] text-white" onClick={() => setIsMetaPanelOpen(false)}>Annuler</Button>
            <Button className="flex-1 h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase tracking-widest text-[10px] gap-2" onClick={handleSaveMetadata}>
              <Save className="w-4 h-4" />
              Enregistrer
            </Button>
          </div>
        </div>
      )}

      {/* Entity Creation Side Panel */}
      {isAdding && addData && (
        <div className="absolute inset-y-0 right-0 w-[500px] bg-black/80 backdrop-blur-3xl border-l border-white/10 shadow-2xl z-50 animate-in slide-in-from-right duration-300 flex flex-col">
          <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center border border-green-500/20">
                <PlusCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Ajouter : {addData.type}</h2>
                {addData.parentId && <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Parent: {addData.parentId}</p>}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)} className="rounded-full w-10 h-10 p-0 hover:bg-white/10 text-white">
              <X className="w-6 h-6" />
            </Button>
          </div>

          <ScrollArea className="flex-1 p-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <Hash className="w-3 h-3" /> Identifiant Manuel (ID)
                </label>
                <Input
                  placeholder="Ex: A0-01, TEMP-02..."
                  value={addData.data.id}
                  onChange={(e) => setAddData({ ...addData, data: { ...addData.data, id: e.target.value } })}
                  className="bg-white/5 border-white/10 text-white rounded-xl font-mono text-sm h-12 focus:border-amber-500/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <FileText className="w-3 h-3" /> Nom
                </label>
                <Input
                  placeholder="Nom descriptif..."
                  value={addData.data.name}
                  onChange={(e) => setAddData({ ...addData, data: { ...addData.data, name: e.target.value } })}
                  className="bg-white/5 border-white/10 text-white rounded-xl h-12 focus:border-amber-500/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <Info className="w-3 h-3" /> Description
                </label>
                <Textarea
                  placeholder="Détails techniques..."
                  value={addData.data.description}
                  onChange={(e) => setAddData({ ...addData, data: { ...addData.data, description: e.target.value } })}
                  className="bg-white/5 border-white/10 text-white rounded-xl min-h-[100px] resize-none focus:border-amber-500/50"
                />
              </div>
              {addData.type === 'parametre' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Unité</label>
                    <Input
                      placeholder="Ex: °C, Bar, %"
                      value={addData.data.unit}
                      onChange={(e) => setAddData({ ...addData, data: { ...addData.data, unit: e.target.value } })}
                      className="bg-white/5 border-white/10 text-white rounded-xl h-12 focus:border-amber-500/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Type</label>
                    <select
                      value={addData.data.dataType}
                      onChange={(e) => setAddData({ ...addData, data: { ...addData.data, dataType: e.target.value } })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl text-white h-12 px-4 focus:border-amber-500/50 outline-none"
                    >
                      <option value="numeric">Numérique</option>
                      <option value="state">État</option>
                      <option value="status">Statut</option>
                      <option value="text">Texte</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-8 border-t border-white/5 flex gap-4 shrink-0">
            <Button variant="outline" className="flex-1 h-14 rounded-2xl border-white/10 hover:bg-white/5 font-bold uppercase tracking-widest text-[10px] text-white" onClick={() => setIsAdding(false)}>Annuler</Button>
            <Button className="flex-1 h-14 rounded-2xl bg-green-600 hover:bg-green-500 text-white font-bold uppercase tracking-widest text-[10px]" onClick={handleCreate}>Créer l'entité</Button>
          </div>
        </div>
      )}

      {/* Image Info / Editing Side Panel - 360° VIEW UPGRADED */}
      {selectedImageForEdit && (
        <div className={cn(
          "absolute inset-y-0 right-0 bg-[#050505] backdrop-blur-3xl border-l border-white/10 shadow-2xl z-[60] animate-in slide-in-from-right duration-500 flex flex-col",
          isMetadataEditing ? "left-0 w-full" : "w-[800px]"
        )}>
          <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0 bg-black/40">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-600/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 shadow-[0_0_15px_rgba(79,70,229,0.2)]">
                <Brain className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tighter text-white uppercase">Explorer 360°</h2>
                <p className="text-[9px] text-gray-500 uppercase font-black tracking-[0.2em] flex items-center gap-2">
                  <Activity className="w-3 h-3 text-green-500" /> Vision Diagnostic Pipeline
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedImageForEdit(null)} className="rounded-full w-12 h-12 p-0 hover:bg-white/10 text-white">
              <X className="w-8 h-8" />
            </Button>
          </div>

          <ScrollArea className="flex-1 bg-transparent">
            <div className="p-10">
              <MetadataViewer
                node={{
                  id: selectedImageForEdit.id,
                  name: selectedImageForEdit.filename,
                  path: selectedImageForEdit.id,
                  type: 'file',
                  imageType: selectedImageForEdit.imageType as any
                }}
                onRefresh={() => {
                  // Refresh local list if needed
                  fetchData();
                }}
                onEditChange={setIsMetadataEditing}
              />
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
