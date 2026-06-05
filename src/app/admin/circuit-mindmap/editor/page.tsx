// src/app/admin/circuit-mindmap/editor/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  GitMerge, 
  Settings, 
  Activity,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { MindMapEditor } from '@/components/mindmap/MindMapEditor';
import { CircuitMindMap, MindMapData } from '@/ai/mindmap/types';

export default function MindMapEditorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const circuitId = searchParams.get('circuitId');

  const [mindmap, setMindmap] = useState<CircuitMindMap | null>(null);
  const [dbParameters, setDbParameters] = useState<Array<{ id: string; name: string; unit?: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; content: string } | null>(null);

  useEffect(() => {
    if (!circuitId) {
      router.push('/admin/circuit-mindmap');
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/circuit-mindmap/${circuitId}`);
        if (!res.ok) throw new Error('Échec du chargement des données');
        const data = await res.json();
        
        if (data.success) {
          setMindmap(data.mindmap);
          setDbParameters(data.parameters || []);
        }
      } catch (err) {
        setStatusMsg({
          type: 'error',
          content: err instanceof Error ? err.message : String(err)
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [circuitId, router]);

  const handleSave = async (updatedData: MindMapData) => {
    if (!circuitId) return;
    
    setIsSaving(true);
    setStatusMsg(null);

    try {
      const res = await fetch(`/api/circuit-mindmap/${circuitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mindmapData: updatedData,
          metadata: {
            lastSaved: Date.now(),
            version: (mindmap?.version || 1) + 1
          }
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }

      setMindmap(data.mindmap);
      setStatusMsg({
        type: 'success',
        content: 'Mind Map sauvegardé et vectorisé dans l\'index RAG.'
      });
      
      // Auto-clear success message
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err) {
      setStatusMsg({
        type: 'error',
        content: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!circuitId) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col space-y-6">
      {/* 🚀 Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/40 p-5 rounded-2xl border border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/admin/circuit-mindmap')}
            className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all"
            title="Retourner à la liste"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-600/10 border border-orange-500/20 text-orange-400 rounded-xl">
              <GitMerge className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h1 className="text-lg font-black uppercase tracking-wider text-white">Atelier Topologique</h1>
              <p className="text-xs text-slate-400 font-mono">Circuit ID: {circuitId}</p>
            </div>
          </div>
        </div>

        {/* Transient save status notifications */}
        {statusMsg && (
          <div className={`
            flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border backdrop-blur-md animate-fade-in
            ${statusMsg.type === 'success' 
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200' 
              : 'bg-red-950/40 border-red-500/30 text-red-200'
            }
          `}>
            {statusMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{statusMsg.content}</span>
          </div>
        )}
      </div>

      {/* 🛠️ Dynamic Workspace Canvas */}
      <div className="flex-1">
        {isLoading ? (
          <div className="h-[70vh] flex flex-col items-center justify-center gap-2 bg-slate-900/20 border border-white/10 rounded-3xl backdrop-blur-md">
            <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Chargement de l'atelier...</span>
          </div>
        ) : (
          <MindMapEditor
            circuitId={circuitId}
            initialMindMap={mindmap}
            dbParameters={dbParameters}
            onSave={handleSave}
            isSaving={isSaving}
          />
        )}
      </div>
    </div>
  );
}
