// src/app/admin/documents/[...path]/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
  ArrowLeft, 
  RefreshCw, 
  Trash2, 
  Download, 
  Check,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { navigateBack } from '@/lib/navigation';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { DocumentPreview } from '@/components/document/DocumentPreview';
import { ExtractionPanel } from '@/components/document/ExtractionPanel';
import { StatisticsPanel } from '@/components/document/StatisticsPanel';
import { MetadataPanel } from '@/components/document/MetadataPanel';
import { useWebSocket } from '@/hooks/useWebSocket';

// Liste des zones valides (à synchroniser avec chromadb-schema.ts)
const VALID_ZONES = [
  'A0_DIVERS', 'B0_AUXILIAIRES', 'B1_HRSG_TG1', 'B2_HRSG_TG2', 'B3_TV_PE',
  'TG1', 'TG2', 'HR', 'MAINTENANCE', 'SHARED'
];

export default function DocumentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const { isConnected, lastEvent } = useWebSocket();
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [editedText, setEditedText] = useState('');
  const [editedMetadata, setEditedMetadata] = useState<any>(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  
  const [linkedImages, setLinkedImages] = useState<any[]>([]);

  const filePath = Array.isArray(params.path) ? params.path.join('/') : params.path;

  const fetchLinkedImages = async (docId: string) => {
    try {
      const res = await fetch(`/api/vision/images?linkedDocumentId=${docId}&_t=${Date.now()}`);
      const result = await res.json();
      if (result.success) {
        setLinkedImages(result.images);
      }
    } catch (e) {
      console.error('Failed to fetch linked images', e);
    }
  };

  const loadDetails = useCallback(async () => {
    if (!filePath) {
      toast({ variant: "destructive", title: "Erreur", description: "Chemin de fichier invalide" });
      router.push('/admin');
      return;
    }
    
    try {
      setLoading(true);
      const res = await fetch(`/api/documents/detail?path=${encodeURIComponent(filePath)}`);
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      
      setData(result);
      setEditedText(result.vector?.content || result.file?.content || '');
      
      const baseMeta = result.vector?.metadata || {};
      setEditedMetadata({
        titre: baseMeta.titre || result.file.name,
        type: baseMeta.type || 'document_technique',
        categorie: baseMeta.categorie || 'general',
        equipement: baseMeta.equipement || '',
        zone: baseMeta.zone || '',
        pupitre: baseMeta.pupitre || '',
        profils_cibles: typeof baseMeta.profils_cibles === 'string' 
          ? baseMeta.profils_cibles.split(',').map((s: string) => s.trim())
          : (baseMeta.profils_cibles || []),
        tags: typeof baseMeta.tags === 'string'
          ? baseMeta.tags.split(',').map((s: string) => s.trim())
          : (baseMeta.tags || []),
        version: baseMeta.version || '1.0'
      });
      if (result.vector?.id) {
        fetchLinkedImages(result.vector.id);
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [filePath, toast, router]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    if (lastEvent && lastEvent.path === data?.file?.path) {
      if (lastEvent.type === 'sync-complete') {
        setSyncStatus('success');
        loadDetails();
        setTimeout(() => setSyncStatus('idle'), 3000);
      } else if (lastEvent.type === 'sync-error') {
        setSyncStatus('error');
      }
    }
  }, [lastEvent, data?.file?.path, loadDetails]);

  // Fonction de synchronisation unifiée
  const performSync = async () => {
    setSyncStatus('syncing');
    try {
      // Préparer les métadonnées enrichies (avec zone validée)
      const metadataToSend = { ...editedMetadata };
      
      // Valider la zone : si elle n'est pas dans la liste, on la met par défaut
      if (metadataToSend.zone && !VALID_ZONES.includes(metadataToSend.zone)) {
        console.warn(`Zone invalide: ${metadataToSend.zone}, utilisation de SHARED`);
        metadataToSend.zone = 'SHARED';
      }
      
      const res = await fetch('/api/documents/vectorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          filePath: data.file.path, 
          collection: data.collection,
          zone: metadataToSend.zone,      // Envoi de la zone explicite
          type: metadataToSend.type,      // Type de document
          metadata: metadataToSend,
          content: editedText,
          forceReindex: true
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Échec de la vectorisation');
      }
      toast({ title: "Synchronisation lancée", description: "Le pipeline RAG traite vos modifications." });
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (e: any) {
      setSyncStatus('error');
      toast({ variant: "destructive", title: "Erreur Sync", description: e.message });
    }
  };

  const handleSync = async () => {
    await performSync();
  };

  const handleSaveText = async () => {
    setSaving(true);
    try {
      await performSync();
      setIsEditingText(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de sauvegarder le texte." });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMetadata = async () => {
    setSaving(true);
    try {
      await performSync();
      setIsEditingMetadata(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de sauvegarder les métadonnées." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Purger définitivement ce document de la base vectorielle ?")) return;
    try {
      const safeDocumentId = data.vector?.id || (filePath ? filePath.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() : 'unknown');
      
      const res = await fetch('/api/documents/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          documentId: safeDocumentId, 
          collection: data.collection,
          filePath: data.file.path
        })
      });
      if (!res.ok) throw new Error('Échec de la suppression');
      toast({ title: "Purger", description: "Document supprimé avec succès." });
      router.push('/admin');
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: e.message });
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#171717] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Chargement du noyau...</p>
      </div>
    </div>
  );

  if (!data) return null;

  // Récupérer l'ID sous forme de chaîne, gérer les nombres ou undefined
  const vectorIdStr = data.vector?.id != null ? String(data.vector.id) : '';

  return (
    <div className="min-h-screen bg-[#171717] text-white p-4 md:p-10 font-body flex flex-col">
      <header className="max-w-7xl mx-auto w-full mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigateBack(router, '/admin')} className="rounded-xl bg-white/5 border border-white/10 hover:bg-blue-600 hover:text-white transition-all">
            <ArrowLeft className="w-4 h-4 mr-2" /> Retour
          </Button>
          <div className="h-10 w-px bg-white/10 mx-2 hidden md:block" />
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tighter uppercase truncate max-w-md">{data.file.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-blue-600/20 text-blue-400 border-none text-[9px] font-black uppercase">{data.collection}</Badge>
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">ID: {vectorIdStr.substring(0, 12)}...</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={handleSync} 
            disabled={syncStatus === 'syncing'} 
            className={`
              rounded-xl font-bold text-xs gap-2 px-6 h-11 transition-all
              ${syncStatus === 'syncing' ? 'bg-gray-700' : 
                syncStatus === 'success' ? 'bg-green-600' : 
                syncStatus === 'error' ? 'bg-red-600' : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20'}
            `}
          >
            {syncStatus === 'syncing' ? <RefreshCw className="w-4 h-4 animate-spin" /> : 
             syncStatus === 'success' ? <Check className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
            {syncStatus === 'syncing' ? 'Synchronisation...' : 
             syncStatus === 'success' ? 'Synchronisé' : 'Synchroniser RAG'}
          </Button>
          <Button variant="outline" onClick={handleDelete} className="border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-xl font-bold text-xs gap-2 h-11">
            <Trash2 className="w-4 h-4" /> Purger
          </Button>
          <Button variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 rounded-xl font-bold text-xs h-11">
            <Download className="w-4 h-4 mr-2" /> Exporter
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
        <div className="lg:col-span-7 h-full">
          <DocumentPreview 
            filePath={data.file.path} 
            fileName={data.file.name} 
            fileType={data.file.extension}
            content={data.file.content}
            isImage={data.file.isImage}
            isPdf={data.file.extension?.toLowerCase() === 'pdf'}
            isText={data.file.isText}
            isDirectory={data.file.isDirectory}
          />
        </div>

        <div className="lg:col-span-5 space-y-8 overflow-y-auto pr-2 custom-scrollbar">
          <ExtractionPanel 
            extractedText={editedText}
            ocrConfidence={data.vector?.metadata?.ocrConfidence}
            metadata={data.vector?.metadata || {}}
            isEditing={isEditingText}
            onEdit={() => setIsEditingText(true)}
            onSave={handleSaveText}
            onCancel={() => { setIsEditingText(false); setEditedText(data.vector?.content || data.file?.content || ''); }}
            onChange={setEditedText}
            saving={saving}
          />

          <StatisticsPanel 
            chunks={{ 
              count: data.chunks?.count ?? data.vector?.metadata?.chunk_total ?? 0, 
              overlaps: 200,
              sizes: data.chunks?.sizes || data.vector?.metadata?.chunk_sizes || []
            }}
            embeddings={{ 
              dimensions: 768, 
              model: 'nomic-embed-text',
              generationTime: data.vector?.metadata?.embedding_time || 0
            }}
            indexation={{ 
              collection: data.collection, 
              status: data.vector ? 'synced' : 'pending',
              documentId: data.vector?.id || '',
              timestamp: data.vector?.timestamp || new Date().toISOString()
            }}
          />

          <MetadataPanel 
            metadata={editedMetadata}
            isEditing={isEditingMetadata}
            onEdit={() => setIsEditingMetadata(true)}
            onSave={handleSaveMetadata}
            onCancel={() => { 
              setIsEditingMetadata(false); 
              const baseMeta = data.vector?.metadata || {};
              setEditedMetadata({
                titre: baseMeta.titre || data.file.name,
                type: baseMeta.type || 'document_technique',
                categorie: baseMeta.categorie || 'general',
                equipement: baseMeta.equipement || '',
                zone: baseMeta.zone || '',
                pupitre: baseMeta.pupitre || '',
                profils_cibles: typeof baseMeta.profils_cibles === 'string' ? baseMeta.profils_cibles.split(',') : (baseMeta.profils_cibles || []),
                tags: typeof baseMeta.tags === 'string' ? baseMeta.tags.split(',') : (baseMeta.tags || []),
                version: baseMeta.version || '1.0'
              });
            }}
            onChange={setEditedMetadata}
            saving={saving}
            documentId={data.vector?.id}
            documentPath={data.file.path ? data.file.path.split('/').slice(0, -1).join('/') : ''}
            linkedImages={linkedImages}
            onRefreshImages={() => {
              if (data.vector?.id) fetchLinkedImages(data.vector.id);
            }}
          />
        </div>
      </main>

      <footer className="max-w-7xl mx-auto w-full mt-10 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] font-bold text-gray-600 uppercase tracking-widest">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            <span>Canal {isConnected ? 'Synchronisé' : 'Interrompu'}</span>
          </div>
          <span>Système: ChromaDB v1.4 • OCR: Tesseract 5.0</span>
        </div>
        <div>
          Dernière modification: {new Date(data.file.modifiedAt).toLocaleString()}
        </div>
      </footer>
    </div>
  );
}