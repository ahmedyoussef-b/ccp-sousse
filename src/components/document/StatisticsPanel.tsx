// src/components/document/StatisticsPanel.tsx

'use client';

import { Layers, Cpu, Database, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatisticsPanelProps {
  chunks: {
    count: number;
    sizes: number[];
    overlaps: number;
  };
  embeddings: {
    dimensions: number;
    model: string;
    generationTime: number;
  };
  indexation: {
    collection: string;
    documentId: string;
    status: 'pending' | 'synced' | 'error';
    timestamp: string;
  };
}

export function StatisticsPanel({ chunks, embeddings, indexation }: StatisticsPanelProps) {
  const avgChunkSize = chunks.sizes.length > 0 
    ? Math.round(chunks.sizes.reduce((a, b) => a + b, 0) / chunks.sizes.length)
    : 1000;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="bg-[#2f2f2f] rounded-2xl p-5 border border-white/5 hover:border-blue-500/20 transition-all group">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-600/20 rounded-xl group-hover:bg-blue-600 transition-colors">
            <Layers className="w-4 h-4 text-blue-400 group-hover:text-white" />
          </div>
          <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Chunking</span>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <span className="text-[9px] font-black text-gray-600 uppercase">Segments</span>
            <span className="text-lg font-black text-white">{chunks.count}</span>
          </div>
          <div className="flex justify-between items-end">
            <span className="text-[9px] font-black text-gray-600 uppercase">Taille Moyenne</span>
            <span className="text-[11px] font-bold text-blue-400">{avgChunkSize} chars</span>
          </div>
        </div>
      </div>
      
      <div className="bg-[#2f2f2f] rounded-2xl p-5 border border-white/5 hover:border-purple-500/20 transition-all group">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-600/20 rounded-xl group-hover:bg-purple-600 transition-colors">
            <Cpu className="w-4 h-4 text-purple-400 group-hover:text-white" />
          </div>
          <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Vectorisation</span>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <span className="text-[9px] font-black text-gray-600 uppercase">Dimensions</span>
            <span className="text-lg font-black text-white">{embeddings.dimensions}</span>
          </div>
          <div className="flex justify-between items-end">
            <span className="text-[9px] font-black text-gray-600 uppercase">Modèle IA</span>
            <span className="text-[10px] font-bold text-purple-400 uppercase truncate max-w-[100px]">{embeddings.model}</span>
          </div>
        </div>
      </div>
      
      <div className="bg-[#2f2f2f] rounded-2xl p-5 border border-white/5 hover:border-green-500/20 transition-all group">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-green-600/20 rounded-xl group-hover:bg-green-600 transition-colors">
            <Database className="w-4 h-4 text-green-400 group-hover:text-white" />
          </div>
          <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">ChromaDB</span>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-black text-gray-600 uppercase">Statut Sync</span>
            <div className={cn(
              "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest",
              indexation.status === 'synced' ? "bg-green-500/10 text-green-500" :
              indexation.status === 'pending' ? "bg-yellow-500/10 text-yellow-500" :
              "bg-red-500/10 text-red-500"
            )}>
              {indexation.status === 'synced' ? 'Synchronisé' :
               indexation.status === 'pending' ? 'En attente' : 'Erreur'}
            </div>
          </div>
          <div className="flex justify-between items-end">
            <span className="text-[9px] font-black text-gray-600 uppercase">Collection</span>
            <span className="text-[10px] font-black text-white uppercase truncate max-w-[120px]">{indexation.collection}</span>
          </div>
        </div>
      </div>
      
      <div className="bg-[#2f2f2f] rounded-2xl p-5 border border-white/5 hover:border-orange-500/20 transition-all group">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-orange-600/20 rounded-xl group-hover:bg-orange-600 transition-colors">
            <TrendingUp className="w-4 h-4 text-orange-400 group-hover:text-white" />
          </div>
          <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Performance</span>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <span className="text-[9px] font-black text-gray-600 uppercase">Latence</span>
            <span className="text-[11px] font-bold text-gray-400">{embeddings.generationTime || '--'} ms</span>
          </div>
          <div className="flex justify-between items-end">
            <span className="text-[9px] font-black text-gray-600 uppercase">Densité Sémantique</span>
            <span className="text-lg font-black text-white">{(chunks.count > 0 ? (avgChunkSize / 100).toFixed(1) : 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
