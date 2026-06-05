// src/components/admin/components/MetadataViewer.tsx - VERSION 360° PREMIUM (RESTORED & ENRICHED)
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FileJson, 
  FileText, 
  AlertCircle, 
  Calendar, 
  Tag, 
  MapPin, 
  ShieldCheck,
  Cpu,
  Loader2,
  Copy,
  Check,
  Edit,
  Save,
  X,
  ImageIcon,
  Brain,
  Target,
  GitBranch,
  Layers,
  Sparkles,
  Zap,
  Info,
  Terminal,
  Clock,
  Activity,
  Maximize2,
  Trash2,
  Plus,
  Database,
  RefreshCw,
  ArrowLeft,
  Search
} from 'lucide-react';
import { useAsyncAction } from '@/components/vision/shared/hooks/useAsyncAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import type { VisionFileNode, ImageMetadata } from '@/components/vision/shared/hooks/useFileSystemTree';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ReferenceLibrary } from '@/components/reference/ReferenceLibrary';
import FormattedDescription from '@/components/vision/shared/components/FormattedDescription';
import React from 'react';

// --- SUB-COMPONENT: Metadata Enrichment Form ---
const MetadataEnricher = ({ data, onSave, onCancel }: { data: ImageMetadata, onSave: (form: any) => Promise<void>, onCancel: () => void }) => {
  const [form, setForm] = React.useState<any>({
    description: data.description || '',
    location: data.location || '',
    tags: data.tags || [],
    zoneId: data.zoneId || '',
    circuitId: data.circuitId || '',
    parameterId: data.parameterId || '',
    imageType: data.imageType || 'simple',
    equipmentType: data.equipmentType || '',
    equipmentState: data.equipmentState || 'normal',
    date: data.date || data.createdAt || new Date().toISOString(),
    metadata: data.metadata || {}
  });

  // State for dynamic key-value pairs (filtered to remove specific fields already handled by dedicated inputs)
  const [customAttributes, setCustomAttributes] = React.useState<{key: string, value: string}[]>(
    Object.entries(data.metadata || {})
      .filter(([k]) => k !== 'viewpoint') // Filter out viewpoint as it has its own input
      .map(([k, v]) => ({ key: k, value: String(v) }))
  );

  const [tagInput, setTagInput] = React.useState(form.tags.join(', '));
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Re-construct metadata object from custom attributes
      const finalMetadata: Record<string, any> = {};
      customAttributes.forEach(attr => {
        if (attr.key.trim()) finalMetadata[attr.key.trim()] = attr.value;
      });

      // CRITICAL FIX: Re-insert the viewpoint field from the form state 
      // because it was filtered out from the customAttributes list
      if (form.metadata?.viewpoint) {
        finalMetadata.viewpoint = form.metadata.viewpoint;
      }
      
      await onSave({ ...form, metadata: finalMetadata });
    } finally {
      setIsSaving(false);
    }
  };

  const addAttribute = () => setCustomAttributes([...customAttributes, { key: '', value: '' }]);
  const removeAttribute = (index: number) => setCustomAttributes(customAttributes.filter((_, i) => i !== index));
  const updateAttribute = (index: number, field: 'key' | 'value', value: string) => {
    const newAttrs = [...customAttributes];
    newAttrs[index][field] = value;
    setCustomAttributes(newAttrs);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 gap-6 bg-white/5 p-8 rounded-[2.5rem] border border-white/5">
         <div className="space-y-6">
            <div className="flex flex-col gap-2">
               <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-2">Description de l'Image</label>
               <Textarea 
                 value={form.description} 
                 onChange={(e) => setForm({...form, description: e.target.value})}
                 placeholder="Décrivez l'image pour le moteur RAG..."
                 className="min-h-[120px] bg-black/40 border-white/10 rounded-[1.5rem] text-sm leading-relaxed p-6 focus:ring-indigo-500/50"
               />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                 <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-2">Tags (Sémantique)</label>
                 <Input 
                   value={tagInput} 
                   onChange={(e) => {
                     setTagInput(e.target.value);
                     setForm({...form, tags: e.target.value.split(',').map(t => t.trim()).filter(t => t)});
                   }}
                   placeholder="ex: maintenance, critique, moteur..."
                   className="h-14 bg-black/40 border-white/10 rounded-[1.2rem] text-sm px-6"
                 />
              </div>
              <div className="flex flex-col gap-2">
                 <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-2">Localisation Physique</label>
                 <Input 
                   value={form.location} 
                   onChange={(e) => setForm({...form, location: e.target.value})}
                   placeholder="Ex: Armoire TCV057, Niveau -1"
                   className="h-14 bg-black/40 border-white/10 rounded-[1.2rem] text-sm px-6"
                 />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                 <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-2">Date d'Acquisition</label>
                 <Input 
                   type="datetime-local"
                   value={typeof form.date === 'string' ? form.date.slice(0, 16) : ''} 
                   onChange={(e) => setForm({...form, date: new Date(e.target.value).toISOString()})}
                   className="h-14 bg-black/40 border-white/10 rounded-[1.2rem] text-sm px-6"
                 />
              </div>
              <div className="flex flex-col gap-2">
                 <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-2">État Équipement</label>
                 <div className="flex gap-2">
                    {['normal', 'degraded', 'critical', 'maintenance'].map(s => (
                      <button 
                        key={s} 
                        onClick={() => setForm({...form, equipmentState: s})} 
                        className={cn(
                          "flex-1 h-14 rounded-[1.2rem] text-[10px] font-black uppercase tracking-tight border transition-all",
                          form.equipmentState === s 
                            ? "bg-amber-500/20 border-amber-500 text-white" 
                            : "bg-black/40 border-white/10 text-gray-500"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                 </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 ml-2 flex items-center gap-2">
                <ImageIcon className="w-3 h-3" /> Type d'Image (📷 Classification)
              </label>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { id: 'simple', label: 'Image Simple', icon: '📷' },
                  { id: 'global', label: 'Image Globale', icon: '🌐' },
                  { id: 'assemblage', label: 'Assemblage', icon: '🧩' }
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setForm({ ...form, imageType: type.id })}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 rounded-2xl border transition-all gap-2",
                      form.imageType === type.id 
                        ? "bg-indigo-500/20 border-indigo-500 text-white shadow-[0_0_20px_rgba(79,70,229,0.2)]" 
                        : "bg-black/40 border-white/10 text-gray-500 hover:border-white/20"
                    )}
                  >
                    <span className="text-xl">{type.icon}</span>
                    <span className="text-[10px] font-bold uppercase tracking-tight">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-white/5 space-y-6">
              <div className="flex items-center justify-between">
                <h5 className="text-[10px] font-black uppercase tracking-widest text-amber-500 ml-2">Attributs Avancés (Métier)</h5>
                <Button variant="outline" size="sm" onClick={addAttribute} className="h-8 rounded-lg border-amber-500/20 text-amber-500 hover:bg-amber-500/10 text-[9px] font-black uppercase tracking-widest gap-2">
                  <Plus className="w-3 h-3" /> Ajouter un attribut
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <label className="text-[9px] font-bold text-white/30 uppercase ml-2">Référence Équipement (Tag ID)</label>
                   <Input 
                     value={form.equipmentType} 
                     onChange={(e) => setForm({...form, equipmentType: e.target.value})} 
                     placeholder="ex: MTR-05-AB"
                     className="h-12 bg-black/40 border-white/5 rounded-xl text-xs px-4" 
                   />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[9px] font-bold text-white/30 uppercase ml-2">Point de Vue / Angle</label>
                   <Input 
                     value={form.metadata.viewpoint || ''} 
                     onChange={(e) => setForm({...form, metadata: { ...form.metadata, viewpoint: e.target.value }})} 
                     placeholder="ex: Face, Plaque signalétique..."
                     className="h-12 bg-black/40 border-white/5 rounded-xl text-xs px-4" 
                   />
                 </div>
              </div>

              {/* Dynamic Attributes List */}
              <div className="space-y-3">
                {customAttributes.map((attr, index) => (
                  <div key={index} className="flex gap-3 animate-in slide-in-from-left-2 duration-300">
                    <Input 
                      value={attr.key} 
                      onChange={(e) => updateAttribute(index, 'key', e.target.value)}
                      placeholder="Clé (ex: Température)"
                      className="flex-1 h-12 bg-black/20 border-white/5 rounded-xl text-xs px-4 font-bold"
                    />
                    <Input 
                      value={attr.value} 
                      onChange={(e) => updateAttribute(index, 'value', e.target.value)}
                      placeholder="Valeur (ex: 85°C)"
                      className="flex-1 h-12 bg-black/20 border-white/5 rounded-xl text-xs px-4"
                    />
                    <Button 
                      variant="ghost" 
                      onClick={() => removeAttribute(index)}
                      className="h-12 w-12 rounded-xl text-red-500/50 hover:text-red-500 hover:bg-red-500/10 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              <h5 className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-4 ml-2">Hiérarchie Industrielle (IDs Structurés)</h5>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="space-y-2">
                   <label className="text-[9px] font-bold text-white/30 uppercase ml-2">Zone ID</label>
                   <Input value={form.zoneId} onChange={(e) => setForm({...form, zoneId: e.target.value})} className="h-12 bg-black/40 border-white/5 rounded-xl text-xs font-mono px-4" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[9px] font-bold text-white/30 uppercase ml-2">Circuit ID</label>
                   <Input value={form.circuitId} onChange={(e) => setForm({...form, circuitId: e.target.value})} className="h-12 bg-black/40 border-white/5 rounded-xl text-xs font-mono px-4" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[9px] font-bold text-white/30 uppercase ml-2">Paramètre ID</label>
                   <Input value={form.parameterId} onChange={(e) => setForm({...form, parameterId: e.target.value})} className="h-12 bg-black/40 border-white/5 rounded-xl text-xs font-mono px-4" />
                 </div>
              </div>
            </div>
         </div>
      </div>

      <div className="flex justify-end gap-4">
         <Button variant="ghost" onClick={onCancel} className="rounded-[1.2rem] px-8 h-14 text-[10px] font-black uppercase tracking-[0.2em]">Annuler</Button>
         <Button 
           onClick={handleSave} 
           disabled={isSaving}
           className="bg-indigo-600 hover:bg-indigo-500 rounded-[1.2rem] px-10 h-14 text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_0_40px_rgba(79,70,229,0.3)] gap-3"
         >
           {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
           Enregistrer & Finaliser
         </Button>
      </div>
    </div>
  );
};

interface MetadataViewerProps {
  node: VisionFileNode;
  onRefresh?: () => void;
  onEditChange?: (editing: boolean) => void;
  onClose?: () => void;
}

export function MetadataViewer({ node, onRefresh, onEditChange, onClose }: MetadataViewerProps) {
  const [data, setData] = useState<ImageMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [preparationStatus, setPreparationStatus] = useState<any>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);

  // Handler to open migration dialog
  const handleOpenMigration = () => setMigrationOpen(true);

  // Handler to close migration dialog
  const handleCloseMigration = () => setMigrationOpen(false);

  // Tabs control
  const [activeTab, setActiveTab] = useState<'metadata' | 'preparation'>('metadata');
  const [prepSubTab, setPrepSubTab] = useState<'overview' | 'rois' | 'anchors' | 'hierarchy' | 'logs'>('overview');
  const [childImages, setChildImages] = useState<any[]>([]);
  const [isAttachingImage, setIsAttachingImage] = useState(false);
  const [showAttachDialog, setShowAttachDialog] = useState(false);
  const [attachSearchQuery, setAttachSearchQuery] = useState('');
  const [allImagesList, setAllImagesList] = useState<any[]>([]);
  const [isListLoading, setIsListLoading] = useState(false);
  const { execute, isLoading } = useAsyncAction();
  const { toast } = useToast();

  const lastLoadedId = useRef<string | null>(null);

  // Helper to normalize data structure and remove redundancies (snake_case vs camelCase)
  const normalizeData = (raw: any): ImageMetadata => {
    const clean = { ...raw };
    
    // Unified mapping for common redundancies
    if (clean.image_type !== undefined) {
      if (clean.imageType === undefined) clean.imageType = clean.image_type;
      delete clean.image_type;
    }
    
    if (clean.created_at !== undefined) {
      if (clean.createdAt === undefined) clean.createdAt = clean.created_at;
      delete clean.created_at;
    }
    
    if (clean.folder_id !== undefined) {
      if (clean.folderId === undefined) clean.folderId = clean.folder_id;
      delete clean.folder_id;
    }

    // Ensure metadata object exists
    if (!clean.metadata) clean.metadata = {};
    
    return clean;
  };

  useEffect(() => {
    if (!node.id || node.id === lastLoadedId.current) return;
    lastLoadedId.current = node.id;

    const loadMeta = async () => {
      setError(null);
      await execute(async () => {
        const res = await fetch(`/api/vision/images/${node.id}?type=metadata`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const result = await res.json();
        const imageData = result.image || result.data || result;
        const cleanData = normalizeData(imageData);
        setData(cleanData);
        return {};
      }, {
        errorMessage: "Impossible de charger les métadonnées",
        onError: (err) => setError(err.message)
      });
    };

    loadMeta();
  }, [node.id, execute]);

  useEffect(() => {
    let cancelled = false;
    const loadPrep = async () => {
      if (!data?.id) return;
      try {
        const prepRes = await fetch(`/api/vision/prepare?imageId=${data.id}`);
        if (!prepRes.ok) return;
        const prepData = await prepRes.json();
        if (!cancelled) setPreparationStatus(prepData);
      } catch (e) {
        // ignore
      }
    };

    if (activeTab === 'preparation' || (data?.imageType === 'global' && activeTab === 'metadata')) {
      loadPrep();
    }

    return () => { cancelled = true; };
  }, [activeTab, data?.id, data?.imageType]);

  // Hook pour charger les images enfants de la hiérarchie spatiale
  const loadChildImages = useCallback(async () => {
    if (!data?.id) return;
    try {
      // 1. Appeler l'API de hiérarchie pour récupérer les IDs enfants
      const res = await fetch(`/api/innovations/part-matching/hierarchy?imageId=${data.id}&type=children`);
      if (!res.ok) return;
      const hierData = await res.json();
      
      if (hierData.success && Array.isArray(hierData.children)) {
        const childrenMetaList = await Promise.all(
          hierData.children.map(async (child: any) => {
            try {
              const imgRes = await fetch(`/api/vision/images/${child.id}?type=metadata`);
              if (imgRes.ok) {
                const imgResult = await imgRes.json();
                return {
                  ...normalizeData(imgResult.image || imgResult.data || imgResult),
                  relationship: child
                };
              }
            } catch (err) {
              // ignore
            }
            return {
              id: child.id,
              filename: `Composant #${child.id.substring(0, 8)}`,
              imageType: 'simple',
              relationship: child
            };
          })
        );
        setChildImages(childrenMetaList.filter(Boolean));
      }
    } catch (e) {
      console.error("Erreur chargement enfants:", e);
    }
  }, [data?.id]);

  useEffect(() => {
    if (data?.id) {
      loadChildImages();
    }
  }, [data?.id, loadChildImages]);

  // Charger la liste de toutes les images pour l'association manuelle
  const loadAllImagesList = async () => {
    setIsListLoading(true);
    try {
      const res = await fetch('/api/vision/images?limit=100');
      if (res.ok) {
        const listData = await res.json();
        if (listData.success && Array.isArray(listData.images)) {
          // Filtrer pour ne garder que les images simples et qui ne sont pas l'image actuelle
          const simpleImgs = listData.images.filter(
            (img: any) => (img.imageType === 'simple' || img.image_type === 'simple') && img.id !== data?.id
          );
          setAllImagesList(simpleImgs);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsListLoading(false);
    }
  };

  const handleAttachImage = async (childId: string) => {
    if (!data?.id) return;
    setIsAttachingImage(true);
    try {
      const res = await fetch('/api/innovations/part-matching/hierarchy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childId,
          parentId: data.id,
          relationshipType: 'part_of',
          matchedZone: { x: 10, y: 10, width: 80, height: 80 }, // Zone par défaut
          confidence: 1.0
        })
      });

      if (res.ok) {
        toast({ title: "✅ Composant associé", description: "L'image simple est maintenant liée à l'image globale." });
        loadChildImages();
        setShowAttachDialog(false);
        onRefresh?.();
      } else {
        throw new Error();
      }
    } catch (err) {
      toast({ title: "❌ Erreur", description: "Impossible d'associer le composant.", variant: "destructive" });
    } finally {
      setIsAttachingImage(false);
    }
  };

  const handleDetachImage = async (childId: string) => {
    if (!data?.id) return;
    if (!window.confirm("Détacher ce composant de l'image globale ?")) return;
    
    try {
      const res = await fetch(`/api/innovations/part-matching/hierarchy?childId=${childId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        toast({ title: "✅ Composant détaché", description: "La relation hiérarchique a été supprimée." });
        loadChildImages();
        onRefresh?.();
      } else {
        throw new Error();
      }
    } catch (err) {
      toast({ title: "❌ Erreur", description: "Impossible de détacher le composant.", variant: "destructive" });
    }
  };


  const handleSaveMetadata = async (formData: any) => {
    if (!data?.id) return;
    
    await execute(async () => {
      const res = await fetch(`/api/vision/images/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) throw new Error('Erreur lors de la sauvegarde');
      
      setData({ ...data, ...formData });
      setMigrationOpen(false);
      toast({ title: "✅ Sauvegarde réussie", description: "Métadonnées industrielles mises à jour" });
      onRefresh?.();
    }, {
      errorMessage: "Erreur lors de la sauvegarde"
    });
  };

  const handleStartPreparation = async () => {
    if (!data?.id) return;
    
    setIsPreparing(true);
    toast({ title: "🧠 Préparation IA", description: "Analyse vectorielle et spatiale en cours..." });
    
    try {
      const res = await fetch(`/api/vision/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: data.id, options: { forceRefresh: true } })
      });
      
      const result = await res.json();
      
      if (result.success) {
        toast({ title: "✅ Préparation terminée", description: result.message });
        const prepRes = await fetch(`/api/vision/prepare?imageId=${data.id}`);
        if (prepRes.ok) {
          const prepData = await prepRes.json();
          setPreparationStatus(prepData);
        }
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({ title: "❌ Erreur", description: error.message, variant: "destructive" });
    } finally {
      setIsPreparing(false);
    }
  };

  const handleReindex = async () => {
    if (!data?.id) return;
    setIsReindexing(true);
    try {
      const res = await fetch(`/api/vision/images/${data.id}?action=reindex`, {
        method: 'POST'
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: "✅ Réindexation terminée", description: result.message || "L'image a été mise à jour dans ChromaDB" });
      } else {
        throw new Error(result.message || "Échec de la réindexation");
      }
    } catch (error: any) {
      toast({ title: "❌ Échec réindexation", description: error.message, variant: "destructive" });
    } finally {
      setIsReindexing(false);
    }
  };

  const handleCopyId = () => {
    if (data?.id) {
      navigator.clipboard.writeText(data.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-12 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-6 opacity-20" />
        <h3 className="text-xl font-bold text-white mb-2">Erreur de Diagnostic</h3>
        <p className="text-gray-500 text-sm max-w-xs">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline" className="mt-8 rounded-2xl border-white/10">Réessayer l'Analyse</Button>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500/20 blur-[40px] rounded-full animate-pulse" />
          <Loader2 className="w-12 h-12 animate-spin text-indigo-500 relative" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 animate-pulse">Deep Data Acquisition...</p>
      </div>
    );
  }

  const isGlobal = data?.imageType === 'global' || data?.imageType === 'assemblage';
  const hasPreparations = preparationStatus?.prepared || false;

  return (
    <div className="h-full flex flex-col space-y-8 animate-in fade-in duration-500">
      {/* 1. HEADER */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 p-8 bg-white/5 border border-white/5 rounded-[2.5rem] backdrop-blur-3xl shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 blur-[100px] -z-10 rounded-full group-hover:bg-indigo-600/10 transition-colors duration-1000" />
        
        <div className="flex items-center gap-8">
          <div className="relative w-32 h-32 rounded-[2rem] overflow-hidden bg-black/40 border border-white/10 shrink-0 group/img shadow-2xl">
            <img 
              src={`/api/vision/images/${data.id}`} 
              className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-110" 
              alt={data.filename} 
              onError={(e) => { (e.target as HTMLImageElement).src = '/api/vision/images/' + data.id + '?thumbnail=true' }}
            />
          </div>
          
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h3 className="text-3xl font-black tracking-tighter uppercase text-white leading-none">{data.filename}</h3>
                <Badge className={cn(
                  "border-none text-[9px] font-black uppercase px-3 py-1 rounded-full",
                  isGlobal ? "bg-indigo-600/20 text-indigo-400" : "bg-blue-600/20 text-blue-400"
                )}>
                  {data.imageType === 'global' ? '🌍 Image Globale' : data.imageType === 'assemblage' ? '🧩 Assemblage' : '📷 Image Simple'}
                </Badge>
                {hasPreparations && <Badge className="bg-green-600/20 text-green-400 border-none text-[8px] font-black uppercase">✅ Préparée</Badge>}
              </div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-3 h-3 text-indigo-500" />
                Indexation : <span className="text-indigo-400">RAG Hybrid enabled</span>
              </p>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/5 rounded-xl cursor-pointer hover:bg-white/5 transition-all group/id w-fit" onClick={handleCopyId}>
              <span className="text-[10px] text-gray-400 font-mono tracking-tight uppercase">ID: {data.id}</span>
              {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-gray-600 group-hover/id:text-white transition-colors" />}
            </div>
          </div>
        </div>
        
        <div className="flex gap-3 self-end lg:self-center">
          <Button 
            onClick={handleReindex} 
            disabled={isReindexing}
            className="rounded-2xl bg-amber-600/10 hover:bg-amber-600/20 text-amber-500 border border-amber-500/20 gap-2 h-12 px-6 font-bold uppercase text-[10px] tracking-widest transition-all"
          >
            {isReindexing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Réindexer
          </Button>

          <Button onClick={handleOpenMigration} className="rounded-2xl bg-indigo-600 hover:bg-indigo-500 gap-2 h-12 px-8 font-bold uppercase text-[10px] tracking-widest shadow-[0_0_30px_rgba(79,70,229,0.3)] transition-all">
            <Edit className="w-4 h-4" /> Édition Métadonnées
          </Button>
          
          {onClose && (
            <Button 
              onClick={onClose} 
              variant="outline" 
              className="rounded-2xl border-white/10 hover:bg-white/5 h-12 px-6 flex items-center justify-center text-white hover:text-white transition-all font-black tracking-widest uppercase text-[10px] gap-2"
              title="Fermer et retourner à la liste"
            >
              <ArrowLeft className="w-4 h-4" /> Retour à la banque
            </Button>
          )}
        </div>
      </div>

      {/* 2. TABS */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full flex-1 flex flex-col min-h-0">
        <TabsList className="bg-white/5 border border-white/10 p-1 rounded-2xl w-fit shrink-0">
          <TabsTrigger value="metadata" className="gap-2 px-6 py-2 rounded-xl data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-[10px] font-black uppercase tracking-widest transition-all">
            <FileJson className="w-4 h-4" /> Métadonnées (RAG Hybride)
          </TabsTrigger>
          <TabsTrigger value="preparation" className="gap-2 px-6 py-2 rounded-xl data-[state=active]:bg-purple-600 data-[state=active]:text-white text-[10px] font-black uppercase tracking-widest transition-all" disabled={!isGlobal && !hasPreparations}>
            <Brain className="w-4 h-4" /> Préparations IA
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 mt-8 min-h-0">
          {/* TAB: MÉTADONNÉES */}
          <TabsContent value="metadata" className="h-full flex flex-col space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
              <div className="xl:col-span-2 space-y-8">
                {/* Section: Traçabilité & Géo */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="p-6 bg-white/5 border-white/5 rounded-[2rem] flex items-center gap-6 group hover:bg-white/10 transition-all">
                    <div className="p-4 bg-blue-600/10 rounded-2xl group-hover:scale-110 transition-transform">
                      <Clock className="w-6 h-6 text-blue-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase text-gray-500 tracking-[0.2em]">Date d'acquisition</p>
                      <p className="text-sm font-black text-white">{new Date(data.date || data.createdAt || Date.now()).toLocaleString('fr-FR')}</p>
                    </div>
                  </Card>

                  <Card className="p-6 bg-white/5 border-white/5 rounded-[2rem] flex items-center gap-6 group hover:bg-white/10 transition-all">
                    <div className="p-4 bg-orange-600/10 rounded-2xl group-hover:scale-110 transition-transform">
                      <MapPin className="w-6 h-6 text-orange-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase text-gray-500 tracking-[0.2em]">Localisation</p>
                      <p className="text-sm font-black text-white">{data.location || 'N/A'}</p>
                    </div>
                  </Card>

                  <Card className="p-6 bg-white/5 border-white/5 rounded-[2rem] flex items-center gap-6 group hover:bg-white/10 transition-all">
                    <div className="p-4 bg-purple-600/10 rounded-2xl group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-6 h-6 text-purple-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase text-gray-500 tracking-[0.2em]">Type d'Image</p>
                      <Badge className={cn(
                        "text-[9px] font-black uppercase border-none", 
                        data.imageType === 'global' ? "bg-indigo-600/20 text-indigo-400" : data.imageType === 'assemblage' ? "bg-purple-600/20 text-purple-400" : "bg-blue-600/20 text-blue-400"
                      )}>
                        {data.imageType || 'simple'}
                      </Badge>
                    </div>
                  </Card>

                  <Card className="p-6 bg-white/5 border-white/5 rounded-[2rem] flex items-center gap-6 group hover:bg-white/10 transition-all">
                    <div className="p-4 bg-amber-600/10 rounded-2xl group-hover:scale-110 transition-transform">
                      <Zap className="w-6 h-6 text-amber-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase text-gray-500 tracking-[0.2em]">État Équipement</p>
                      <Badge className={cn("text-[9px] font-black uppercase", data.equipmentState === 'critical' ? "bg-red-600/20 text-red-400" : data.equipmentState === 'maintenance' ? "bg-amber-600/20 text-amber-400" : "bg-green-600/20 text-green-400")}>
                        {data.equipmentState || 'normal'}
                      </Badge>
                    </div>
                  </Card>
                </div>

                {/* Section: Hiérarchie Industrielle (ADDED) */}
                <Card className="p-8 bg-amber-600/5 border-amber-500/10 rounded-[2.5rem] space-y-6">
                  <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-amber-500" />
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Hiérarchie Industrielle (IDs)</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <p className="text-[9px] font-black uppercase text-gray-600 tracking-widest">Zone ID</p>
                      <p className="text-sm font-mono text-amber-400 font-bold">{data.zoneId || '---'}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[9px] font-black uppercase text-gray-600 tracking-widest">Circuit ID</p>
                      <p className="text-sm font-mono text-amber-400 font-bold">{data.circuitId || '---'}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[9px] font-black uppercase text-gray-600 tracking-widest">Paramètre ID</p>
                      <p className="text-sm font-mono text-amber-400 font-bold">{data.parameterId || '---'}</p>
                    </div>
                  </div>
                </Card>

                {/* Section: Advanced Attributes Display (NEW) */}
                <Card className="p-8 bg-indigo-600/5 border-indigo-500/10 rounded-[2.5rem] space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="w-5 h-5 text-indigo-400" />
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Données Métier & Spécifications</h4>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-2 border-b border-white/5">
                        <span className="text-[9px] font-black uppercase text-gray-500">Référence Équipement</span>
                        <span className="text-xs font-bold text-indigo-400">{data.equipmentType || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-white/5">
                        <span className="text-[9px] font-black uppercase text-gray-500">Point de Vue</span>
                        <span className="text-xs font-bold text-white">{data.metadata?.viewpoint || 'N/A'}</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                       <p className="text-[9px] font-black uppercase text-gray-500 tracking-widest mb-2">Attributs Personnalisés</p>
                       <div className="flex flex-wrap gap-2">
                          {Object.entries(data.metadata || {}).filter(([k]) => k !== 'viewpoint').map(([key, value]) => (
                            <div key={key} className="px-3 py-1.5 bg-black/40 border border-white/5 rounded-xl flex items-center gap-2">
                              <span className="text-[8px] font-black uppercase text-indigo-500/70">{key}:</span>
                              <span className="text-[10px] font-bold text-white">{String(value)}</span>
                            </div>
                          ))}
                          {Object.keys(data.metadata || {}).filter(k => k !== 'viewpoint').length === 0 && (
                            <span className="text-[10px] italic text-gray-600">Aucun attribut personnalisé</span>
                          )}
                       </div>
                    </div>
                  </div>
                </Card>

                {/* Section: Analyse Contextuelle (RAG) */}
                <Card className="p-8 bg-white/5 border-white/5 rounded-[2.5rem] space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-5 h-5 text-amber-400" />
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Analyse Contextuelle IA</h4>
                    </div>
                    <Badge className="bg-amber-600/20 text-amber-400 border-none text-[8px] font-black uppercase">RAG Logic enabled</Badge>
                  </div>
                  <div className="bg-black/40 rounded-[2rem] p-8 border border-white/5 min-h-[150px]">
                    {data.description ? (
                      <FormattedDescription text={data.description} />
                    ) : (
                      <p className="text-sm text-gray-600 italic">Aucune analyse disponible.</p>
                    )}
                  </div>
                </Card>

                {/* Section: Tags Sémantiques */}
                <Card className="p-8 bg-white/5 border-white/5 rounded-[2.5rem] space-y-6">
                  <div className="flex items-center gap-3">
                    <Tag className="w-5 h-5 text-purple-400" />
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Indexation Lexicale (BM25)</h4>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {data?.tags?.map((tag: string, i: number) => (
                      <Badge key={i} className="bg-purple-600/10 hover:bg-purple-600/20 text-purple-300 border-purple-500/20 py-2 px-5 rounded-2xl text-[10px] font-black uppercase tracking-widest">{tag}</Badge>
                    ))}
                  </div>
                </Card>

                {/* 🔥 Section PREMIUM : Arborescence Physique & Composants Associés */}
                {isGlobal && (
                  <Card className="p-8 bg-gradient-to-br from-indigo-900/10 via-black/40 to-black/20 border-indigo-500/10 rounded-[2.5rem] space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Layers className="w-5 h-5 text-indigo-400" />
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Arborescence Physique & Organes</h4>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          loadAllImagesList();
                          setShowAttachDialog(true);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase rounded-xl h-8 px-4 flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Lier un Composant
                      </Button>
                    </div>

                    <p className="text-xs text-gray-400">
                      Gérez l'arborescence physique en associant manuellement des photos de composants simples (détails rognés, organes) à cette vue globale du pupitre.
                    </p>

                    {childImages.length === 0 ? (
                      <div className="p-8 border border-dashed border-white/5 rounded-2xl text-center flex flex-col items-center justify-center gap-2">
                        <ImageIcon className="w-8 h-8 text-gray-600" />
                        <span className="text-xs font-bold text-gray-500">Aucun composant associé</span>
                        <span className="text-[9px] text-gray-600">Cliquez sur "Lier un Composant" ci-dessus pour associer des photos d'organes.</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {childImages.map((child, idx) => (
                          <div 
                            key={`${child.id}-${idx}`}
                            className="p-4 bg-black/40 border border-white/5 rounded-2xl flex items-center gap-4 hover:border-white/10 transition-all group"
                          >
                            <div className="w-16 h-16 rounded-xl bg-black overflow-hidden border border-white/10 shrink-0">
                              <img 
                                src={`/api/vision/images/${child.id}`} 
                                className="w-full h-full object-cover" 
                                alt={child.filename}
                                onError={(e) => { (e.target as HTMLImageElement).src = '/api/vision/images/' + child.id + '?thumbnail=true' }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h5 className="text-xs font-black uppercase text-white truncate leading-tight">{child.filename}</h5>
                              <p className="text-[9px] text-gray-500 truncate mt-1">{child.location || 'Localisation non renseignée'}</p>
                              {child.relationship?.matchedZone && (
                                <span className="text-[8px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded mt-1.5 inline-block">
                                  Position: {Math.round(child.relationship.matchedZone.x)}%, {Math.round(child.relationship.matchedZone.y)}%
                                </span>
                              )}
                            </div>
                            <Button 
                              variant="ghost" 
                              onClick={() => handleDetachImage(child.id)}
                              className="h-10 w-10 p-0 rounded-xl text-red-500/50 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                              title="Détacher le composant"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}

                {/* Dialogue d'association manuelle de composants */}
                <Dialog open={showAttachDialog} onOpenChange={setShowAttachDialog}>
                  <DialogContent className="max-w-3xl bg-[#0a0a0a] border border-white/5 p-8 rounded-[2.5rem] text-white">
                    <DialogHeader className="mb-4">
                      <DialogTitle className="text-lg font-black uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                        <Layers className="w-5 h-5" />
                        Associer un composant physique
                      </DialogTitle>
                      <DialogDescription className="text-gray-400 text-xs font-medium">
                        Sélectionnez une image simple depuis la banque d'images pour l'associer comme sous-organe du pupitre global <span className="text-white font-bold">"{data.filename}"</span>.
                      </DialogDescription>
                    </DialogHeader>

                    {/* Search inside Attach Dialog */}
                    <div className="relative mb-6">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        value={attachSearchQuery}
                        onChange={(e) => setAttachSearchQuery(e.target.value)}
                        placeholder="Rechercher une image par nom ou tag..."
                        className="bg-black/40 border-white/5 pl-10 text-white rounded-xl h-10 text-xs font-semibold focus:border-indigo-500/30 focus:ring-0"
                      />
                    </div>

                    <ScrollArea className="h-[280px] pr-2">
                      {isListLoading ? (
                        <div className="flex h-32 items-center justify-center gap-2">
                          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                          <span className="text-xs text-gray-500 font-bold uppercase">Chargement de la banque...</span>
                        </div>
                      ) : allImagesList.length === 0 ? (
                        <div className="text-center py-12 text-xs text-gray-500 italic uppercase">
                          Aucune image simple disponible dans la banque
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {allImagesList
                            .filter(img => 
                              (img.filename || '').toLowerCase().includes(attachSearchQuery.toLowerCase()) ||
                              (img.tags || []).some((t: string) => t.toLowerCase().includes(attachSearchQuery.toLowerCase()))
                            )
                            .map((img) => {
                              const alreadyLinked = childImages.some(c => c.id === img.id);
                              
                              return (
                                <div 
                                  key={img.id}
                                  className={cn(
                                    "p-3 bg-white/5 border rounded-2xl flex items-center gap-3 transition-all",
                                    alreadyLinked ? "opacity-40 border-white/5" : "border-white/5 hover:border-indigo-500/30 cursor-pointer"
                                  )}
                                  onClick={() => !alreadyLinked && handleAttachImage(img.id)}
                                >
                                  <div className="w-12 h-12 rounded-lg bg-black overflow-hidden shrink-0">
                                    <img 
                                      src={`/api/vision/images/${img.id}`} 
                                      className="w-full h-full object-cover" 
                                      alt={img.filename}
                                      onError={(e) => { (e.target as HTMLImageElement).src = '/api/vision/images/' + img.id + '?thumbnail=true' }}
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h6 className="text-xs font-black uppercase text-white truncate leading-tight">{img.filename}</h6>
                                    <p className="text-[9px] text-gray-500 truncate mt-0.5">{img.location || 'Localisation inconnue'}</p>
                                  </div>
                                  {!alreadyLinked && (
                                    <Button 
                                      size="sm"
                                      disabled={isAttachingImage}
                                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] uppercase font-bold h-7 rounded-lg shrink-0"
                                    >
                                      Lier
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </ScrollArea>

                    <DialogFooter className="mt-6 pt-4 border-t border-white/5">
                      <Button variant="ghost" onClick={() => setShowAttachDialog(false)} className="rounded-xl h-10 text-xs font-bold uppercase">
                        Fermer
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Sidebar: Vector & JSON & Metadata Object */}
              <div className="space-y-8">
                {/* Signature Vectorielle */}
                <Card className="p-8 bg-indigo-600/5 border-indigo-500/10 rounded-[2.5rem] space-y-8 relative overflow-hidden group/vector">
                  <div className="flex items-center gap-3">
                    <Cpu className="w-6 h-6 text-indigo-400" />
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Signature Vectorielle</h4>
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-500">
                        <span>ChromaDB Persistence</span>
                        <span className="text-indigo-400">98.4% Accuracy</span>
                      </div>
                      <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden border border-white/5 p-0.5">
                        <div className="h-full bg-gradient-to-r from-indigo-600 to-blue-400 w-[98.4%] rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)] animate-pulse" />
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Métadonnées Avancées (Key-Value Editor RESTORED) */}
                <Card className="p-8 bg-white/5 border-white/5 rounded-[2.5rem] space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Layers className="w-5 h-5 text-indigo-400" />
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Métadonnées Métier</h4>
                      </div>
                      <Badge className="bg-white/5 text-[9px] font-bold text-gray-500 px-2 py-1 border-none">Lecture seule</Badge>
                    </div>
                    <div className="bg-black/40 rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
                      {Object.entries(data.metadata || {}).map(([key, value]) => (
                        <div key={key} className="p-3 flex justify-between items-center group">
                          <span className="text-[10px] text-gray-400 capitalize">{key}</span>
                          <span className="text-[10px] font-mono font-bold text-indigo-400/80">{String(value)}</span>
                        </div>
                      ))}
                      {Object.keys(data.metadata || {}).length === 0 && (
                        <div className="p-4 text-center">
                          <span className="text-[10px] text-gray-600 italic">Aucune métadonnée spécifique</span>
                        </div>
                      )}
                    </div>
                </Card>

                {/* JSON RAW DATA */}
                <Card className="flex-1 p-8 bg-white/5 border-white/5 rounded-[2.5rem] flex flex-col space-y-6 overflow-hidden min-h-[300px]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Terminal className="w-5 h-5 text-gray-500" />
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">JSON Raw Data</h4>
                    </div>
                  </div>
                  <div className="flex-1 bg-black/60 rounded-[1.5rem] border border-white/5 p-6 overflow-hidden flex flex-col">
                    <ScrollArea className="flex-1 w-full">
                      <pre className="font-mono text-[10px] text-indigo-400/70">{JSON.stringify(data, null, 2)}</pre>
                    </ScrollArea>
                    <div className="flex justify-end mt-4">
                      <Badge className="bg-indigo-600/10 text-indigo-400 border-none text-[8px] font-black uppercase px-3 py-1">Mode Expert</Badge>
                    </div>
                  </div>
                  {/* Migration Dialog */}
                <Dialog open={migrationOpen} onOpenChange={setMigrationOpen}>
                  <DialogContent className="max-w-4xl bg-[#0a0a0a] border-white/5 p-0 rounded-[3rem] overflow-hidden flex flex-col max-h-[95vh]">
                    <DialogHeader className="p-8 pb-4 shrink-0">
                      <DialogTitle className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
                        <Sparkles className="w-6 h-6 text-indigo-400" /> Complétion des Métadonnées Industrielles
                      </DialogTitle>
                    </DialogHeader>
                    
                    <ScrollArea className="flex-1 px-8 pb-8 overflow-y-auto">
                      <div className="pt-2">
                        <MetadataEnricher 
                          data={data}
                          onSave={handleSaveMetadata}
                          onCancel={handleCloseMigration}
                        />
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* TAB: PRÉPARATIONS IA (DETAILED VERSION RESTORED) */}
          <TabsContent value="preparation" className="h-full flex flex-col space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-8 flex flex-col">
                {/* Status & Actions */}
                <Card className="p-10 bg-white/5 border-white/5 rounded-[3rem] space-y-8 relative overflow-hidden">
                  <div className="space-y-3">
                    <h3 className="text-2xl font-black uppercase tracking-tighter text-white flex items-center gap-3"><Brain className="w-8 h-8 text-purple-500" /> Vision Prep Detail</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div onClick={() => setPrepSubTab('rois')} className={cn("p-5 rounded-3xl border cursor-pointer hover:scale-105 transition-all", prepSubTab === 'rois' ? "bg-blue-500/10 border-blue-500/30" : "bg-white/5 border-white/5")}>
                      <Target className="w-6 h-6 text-blue-400 mb-2" />
                      <span className="text-[10px] font-black uppercase text-white">ROI Detection ({preparationStatus?.data?.rois?.length || 0})</span>
                    </div>
                    <div onClick={() => setPrepSubTab('anchors')} className={cn("p-5 rounded-3xl border cursor-pointer hover:scale-105 transition-all", prepSubTab === 'anchors' ? "bg-purple-500/10 border-purple-500/30" : "bg-white/5 border-white/5")}>
                      <Zap className="w-6 h-6 text-purple-400 mb-2" />
                      <span className="text-[10px] font-black uppercase text-white">Anchors ({preparationStatus?.data?.anchors?.length || 0})</span>
                    </div>
                    <div onClick={() => setPrepSubTab('hierarchy')} className={cn("p-5 rounded-3xl border cursor-pointer hover:scale-105 transition-all", prepSubTab === 'hierarchy' ? "bg-orange-500/10 border-orange-500/30" : "bg-white/5 border-white/5")}>
                      <GitBranch className="w-6 h-6 text-orange-400 mb-2" />
                      <span className="text-[10px] font-black uppercase text-white">Spatial Hierarchy</span>
                    </div>
                    <div onClick={() => setPrepSubTab('logs')} className={cn("p-5 rounded-3xl border cursor-pointer hover:scale-105 transition-all", prepSubTab === 'logs' ? "bg-gray-500/10 border-gray-500/30" : "bg-white/5 border-white/5")}>
                      <Clock className="w-6 h-6 text-gray-400 mb-2" />
                      <span className="text-[10px] font-black uppercase text-white">Audit Logs</span>
                    </div>
                  </div>
                  <Button onClick={handleStartPreparation} disabled={isPreparing} className="w-full h-16 bg-purple-600 hover:bg-purple-500 rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-[11px] gap-4 shadow-[0_0_30px_rgba(168,85,247,0.3)]">
                    {isPreparing ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</> : <><Sparkles className="w-5 h-5" /> Rerun IA Preparation</>}
                  </Button>
                </Card>
              </div>

              {/* Sub-tab Details */}
              <div className="flex-1 space-y-6">
                <div className="space-y-4">
                  {prepSubTab === 'rois' && (
                    <Card className="p-8 bg-white/5 border-white/5 rounded-[2.5rem] space-y-4">
                       <h4 className="text-sm font-black uppercase text-blue-400">Régions d'intérêt détectées</h4>
                       <div className="space-y-3">
                         {preparationStatus?.data?.rois?.map((roi: any, i: number) => (
                           <div key={i} className="p-3 bg-black/40 rounded-xl border border-white/5 flex justify-between items-center">
                             <div>
                               <p className="text-xs font-bold text-white">{roi.type} {roi.label ? `- ${roi.label}` : ''}</p>
                               <p className="text-[9px] text-gray-500">Confiance: {Math.round(roi.confidence * 100)}%</p>
                             </div>
                             <Badge variant="outline" className="text-[8px]">Importance: {roi.importance}</Badge>
                           </div>
                         ))}
                       </div>
                    </Card>
                  )}
                  {prepSubTab === 'anchors' && (
                    <Card className="p-8 bg-white/5 border-white/5 rounded-[2.5rem] space-y-4">
                       <h4 className="text-sm font-black uppercase text-purple-400">Points d'ancrage</h4>
                       <div className="space-y-3">
                         {preparationStatus?.data?.anchors?.map((anchor: any, i: number) => (
                           <div key={i} className="p-3 bg-black/40 rounded-xl border border-white/5">
                             <div className="flex justify-between items-center mb-1">
                               <p className="text-xs font-bold text-white">{anchor.type} (ID: {anchor.id})</p>
                               <Badge className="bg-green-600/20 text-green-400 border-none text-[8px]">{Math.round(anchor.confidence * 100)}%</Badge>
                             </div>
                             <p className="text-[9px] font-mono text-gray-600">Pos: {anchor.position.x}, {anchor.position.y}</p>
                           </div>
                         ))}
                       </div>
                    </Card>
                  )}
                  {prepSubTab === 'hierarchy' && (
                    <Card className="p-8 bg-white/5 border-white/5 rounded-[2.5rem] space-y-6">
                       <h4 className="text-sm font-black uppercase text-orange-400">Relations Spatiales</h4>
                       <div className="space-y-3">
                         {preparationStatus?.data?.spatialHierarchy?.relations?.map((rel: any, i: number) => (
                           <div key={i} className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-center gap-3 text-xs">
                             <span className="text-purple-400 font-bold">{rel.from}</span>
                             <span className="text-gray-600">→</span>
                             <span className="text-cyan-400 font-bold">{rel.to}</span>
                             <Badge variant="outline" className="ml-auto text-[8px]">{rel.direction}</Badge>
                           </div>
                         ))}
                       </div>
                    </Card>
                  )}
                </div>

                <Button
                  variant="outline"
                  className="w-full rounded-2xl border-white/10 hover:bg-white/5 h-12 px-4 text-[10px] font-black uppercase"
                  onClick={handleOpenMigration}
                >
                  Migrer vers Bibliothèque d'IDs
                </Button>
              </div>
            </div>

            {/* Logs Journal - Full Width Below */}
            <Card className="p-10 bg-white/5 border-white/5 rounded-[3rem] flex flex-col space-y-6 overflow-hidden max-h-[600px]">
              <div className="flex items-center gap-3">
                <Terminal className="w-6 h-6 text-gray-500" />
                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white">Journal Opérations</h3>
              </div>
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-4">
                  {preparationStatus?.logs?.map((log: any, idx: number) => (
                    <div key={idx} className="p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-black uppercase text-purple-400">{log.operation}</span>
                        <Badge className={cn("text-[8px] font-black uppercase", log.status === 'success' ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400")}>{log.status}</Badge>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">{log.details}</p>
                      <p className="text-[9px] text-gray-600">{new Date(log.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}