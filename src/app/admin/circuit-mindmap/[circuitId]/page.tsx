// src/app/admin/circuit-mindmap/[circuitId]/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
  ArrowLeft, 
  GitMerge, 
  Download, 
  Edit3, 
  Layers,
  Database,
  Cpu,
  Info
} from 'lucide-react';
import { MindMapViewer } from '@/components/mindmap/MindMapViewer';
import { CircuitMindMap } from '@/ai/mindmap/types';

export default function CircuitMindMapDetailPage() {
  const router = useRouter();
  const params = useParams();
  const circuitId = params?.circuitId as string;

  const [mindmap, setMindmap] = useState<CircuitMindMap | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!circuitId) return;

    const fetchMindmap = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/circuit-mindmap/${circuitId}`);
        const data = await res.json();
        if (data.success && data.mindmap) {
          setMindmap(data.mindmap);
        }
      } catch (err) {
        console.error('Error fetching mindmap detail', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMindmap();
  }, [circuitId]);

  const handleExport = (format: 'json' | 'markdown' | 'mermaid' | 'svg') => {
    if (!circuitId) return;
    window.open(`/api/circuit-mindmap/export?circuitId=${circuitId}&format=${format}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 flex flex-col space-y-6">
      {/* 🚀 Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/40 p-5 rounded-2xl border border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/admin/circuit-mindmap')}
            className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all"
            title="Retour"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-600/10 border border-orange-500/20 text-orange-400 rounded-xl">
              <GitMerge className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h1 className="text-lg font-black uppercase tracking-wider text-white">Visualisation Topologique</h1>
              <p className="text-xs text-slate-400 font-mono">Circuit ID: {circuitId}</p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => router.push(`/admin/circuit-mindmap/editor?circuitId=${circuitId}`)}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-orange-600/10 transition-all hover:scale-105 active:scale-95"
        >
          <Edit3 className="w-4 h-4" />
          <span>Éditer le schéma</span>
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Interactive Viewer Canvas */}
        <div className="lg:col-span-3 h-[60vh] lg:h-auto">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 bg-slate-900/20 border border-white/10 rounded-3xl backdrop-blur-md">
              <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Chargement...</span>
            </div>
          ) : mindmap ? (
            <div className="h-full">
              <MindMapViewer
                data={mindmap.mindmapData}
                selectedNodeId={null}
                onNodeSelect={() => {}}
                scale={0.9}
              />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 bg-slate-900/20 border border-white/10 rounded-3xl">
              <Info className="w-8 h-8 opacity-30" />
              <span className="text-xs">Aucun schéma configuré pour ce circuit.</span>
            </div>
          )}
        </div>

        {/* Sidebar Info & Export Panel */}
        <div className="space-y-6">
          {/* Quick Exports Card */}
          <div className="bg-slate-900/40 border border-white/10 p-5 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Download className="w-4 h-4 text-orange-500" />
              <span>Téléchargements</span>
            </h3>
            
            <div className="space-y-2">
              <button
                onClick={() => handleExport('svg')}
                className="w-full py-2 px-3 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-white/5 text-left transition-colors"
              >
                Image vectorielle (.SVG)
              </button>
              <button
                onClick={() => handleExport('mermaid')}
                className="w-full py-2 px-3 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-white/5 text-left transition-colors"
              >
                Schéma technique (.Mermaid)
              </button>
              <button
                onClick={() => handleExport('markdown')}
                className="w-full py-2 px-3 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-white/5 text-left transition-colors"
              >
                Résumé RAG complet (.MD)
              </button>
            </div>
          </div>

          {/* Quick Legend Card */}
          <div className="bg-slate-900/40 border border-white/10 p-5 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-orange-500" />
              <span>Légende Topologique</span>
            </h3>

            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs">
                <div className="w-3.5 h-3.5 rounded bg-orange-600 border border-orange-500 shrink-0" />
                <span className="text-slate-300 font-semibold">Racine / Lien principal</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs">
                <div className="w-3.5 h-3.5 rounded bg-sky-600 border border-sky-500 shrink-0" />
                <span className="text-slate-300 font-semibold">Paramètre physique</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs">
                <div className="w-3.5 h-3.5 rounded bg-emerald-600 border border-emerald-500 shrink-0" />
                <span className="text-slate-300 font-semibold">Formule & ratios</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs">
                <div className="w-3.5 h-3.5 rounded bg-slate-700 border border-slate-650 shrink-0" />
                <span className="text-slate-300 font-semibold">Note & consigne</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
