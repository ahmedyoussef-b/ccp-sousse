// src/components/mindmap/MindMapChatIntegration.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  GitMerge, 
  ChevronRight, 
  X,
  Info,
  CheckCircle
} from 'lucide-react';
import { MindMapViewer } from './MindMapViewer';
import { CircuitMindMap, MindMapNode } from '@/ai/mindmap/types';

interface MindMapChatIntegrationProps {
  metadata: {
    type: string;
    circuits: string[];
    hasMindmap: boolean;
    messageHint?: string;
  } | null;
}

export const MindMapChatIntegration: React.FC<MindMapChatIntegrationProps> = ({
  metadata
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mindmap, setMindmap] = useState<CircuitMindMap | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeCircuit, setActiveCircuit] = useState<string | null>(null);
  
  // State for interactive node selections (Phase 4)
  const [selectedNode, setSelectedNode] = useState<MindMapNode | null>(null);

  useEffect(() => {
    if (metadata && metadata.circuits.length > 0) {
      setActiveCircuit(metadata.circuits[0]);
    }
  }, [metadata]);

  useEffect(() => {
    if (!activeCircuit || !isOpen) return;

    const fetchMindmap = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/circuit-mindmap/${activeCircuit}`);
        const data = await res.json();
        if (data.success && data.mindmap) {
          setMindmap(data.mindmap);
        }
      } catch (err) {
        console.error('Error fetching mindmap for chat integration', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMindmap();
  }, [activeCircuit, isOpen]);

  // Reset selected node when opening a new map
  useEffect(() => {
    setSelectedNode(null);
  }, [activeCircuit, isOpen]);

  if (!metadata || !metadata.hasMindmap || metadata.circuits.length === 0) return null;

  return (
    <div className="my-3.5 space-y-2">
      {/* 🧠 Frosted Glass Trigger Card in Chat */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-orange-600/10 border border-orange-500/30 rounded-2xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/20 animate-pulse">
            <GitMerge className="w-5 h-5" />
          </div>
          <div className="text-left">
            <h5 className="text-xs font-bold text-orange-200 uppercase tracking-wider">Topologie de Diagnostic Active</h5>
            <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
              {metadata.messageHint || `Schéma mental disponible pour le circuit ${metadata.circuits.join(', ')}.`}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1 py-1.5 px-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-orange-600/10 hover:scale-105 active:scale-95 transition-all w-full sm:w-auto text-center justify-center shrink-0"
        >
          <span>Visualiser le Schéma</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 🗺️ Dynamic Slide-over / Modal Overlay for Interactive View */}
      {isOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-white/10 w-full max-w-5xl h-[85vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10 bg-slate-950/50 animate-slide-down">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-600/10 border border-orange-500/20 text-orange-400 rounded-xl">
                  <GitMerge className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Vue Topologique</h3>
                  {metadata.circuits.length > 1 ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      {metadata.circuits.map(c => (
                        <button
                          key={c}
                          onClick={() => setActiveCircuit(c)}
                          className={`
                            px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase transition-all
                            ${activeCircuit === c 
                              ? 'bg-orange-600 text-white' 
                              : 'bg-white/5 text-slate-400 border border-white/5 hover:text-white'
                            }
                          `}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {activeCircuit}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body with Details Panel Split */}
            <div className="flex-1 relative bg-slate-950 flex flex-col md:flex-row overflow-hidden">
              <div className="flex-1 relative h-full p-6">
                {isLoading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Chargement...</span>
                  </div>
                ) : mindmap ? (
                  <MindMapViewer
                    data={mindmap.mindmapData}
                    selectedNodeId={selectedNode?.id || null}
                    onNodeSelect={setSelectedNode}
                    scale={0.8}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
                    <Info className="w-8 h-8 opacity-30" />
                    <span className="text-xs">Aucun schéma configuré pour ce circuit.</span>
                  </div>
                )}
              </div>

              {/* 📊 Rich Metadata Details Panel (Phase 4) */}
              {selectedNode && (
                <div className="w-full md:w-80 bg-slate-900 border-t md:border-t-0 md:border-l border-white/10 p-5 flex flex-col justify-between overflow-y-auto animate-slide-in shrink-0">
                  <div className="space-y-5 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Détails du Nœud</span>
                      <button
                        onClick={() => setSelectedNode(null)}
                        className="text-slate-500 hover:text-white text-[11px] font-semibold transition"
                      >
                        Masquer
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <h4 className="text-sm font-black text-white">{selectedNode.label}</h4>
                      <span className="inline-block text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                        {selectedNode.type}
                      </span>
                    </div>

                    {selectedNode.description && (
                      <div className="space-y-1 bg-white/5 p-3 rounded-xl border border-white/5">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Description</span>
                        <p className="text-[11px] text-slate-300 leading-relaxed">{selectedNode.description}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      {selectedNode.kks && (
                        <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                          <span className="text-[8px] text-slate-400 font-bold uppercase block">Code KKS</span>
                          <span className="text-[11px] font-mono text-amber-400 font-bold mt-0.5 block">{selectedNode.kks}</span>
                        </div>
                      )}

                      {selectedNode.criticality && (
                        <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                          <span className="text-[8px] text-slate-400 font-bold uppercase block">Criticité</span>
                          <span className={`text-[10px] font-bold mt-0.5 block uppercase ${
                            selectedNode.criticality === 'critical' ? 'text-red-400 animate-pulse' :
                            selectedNode.criticality === 'high' ? 'text-orange-400' :
                            selectedNode.criticality === 'medium' ? 'text-yellow-400' :
                            'text-sky-400'
                          }`}>
                            {selectedNode.criticality}
                          </span>
                        </div>
                      )}

                      {selectedNode.optimalValue && (
                        <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 col-span-2">
                          <span className="text-[8px] text-slate-400 font-bold uppercase block">Valeur Optimale / Seuil</span>
                          <span className="text-[11px] font-semibold text-white mt-0.5 block">
                            {selectedNode.optimalValue} {selectedNode.unit || ''}
                          </span>
                        </div>
                      )}
                    </div>

                    {selectedNode.formulaExpression && (
                      <div className="space-y-1 bg-slate-950 p-3 rounded-xl border border-white/10 font-mono">
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block">Expression Formelle</span>
                        <code className="text-[10px] text-emerald-400 block">{selectedNode.formulaExpression}</code>
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-4 border-t border-white/5 text-[9px] text-slate-500 leading-normal text-left font-mono">
                    ID: {selectedNode.id}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 bg-slate-950/40 text-center text-[10px] text-slate-400 flex items-center justify-center gap-2 animate-slide-up">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>Ce schéma fournit au modèle IA des métadonnées structurelles pour affiner la pertinence du RAG.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default MindMapChatIntegration;
