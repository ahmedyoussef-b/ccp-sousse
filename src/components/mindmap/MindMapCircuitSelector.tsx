// src/components/mindmap/MindMapCircuitSelector.tsx
import React, { useState } from 'react';
import { 
  Search, 
  Cpu, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Eye, 
  Edit3 
} from 'lucide-react';
import { CircuitBindingStatus } from '@/ai/mindmap/mindmap-circuit-binder';

interface MindMapCircuitSelectorProps {
  circuits: CircuitBindingStatus[];
  onSelect: (circuitId: string) => void;
  onAutoGenerate: (circuitId: string) => Promise<void>;
  isLoading?: boolean;
}

export const MindMapCircuitSelector: React.FC<MindMapCircuitSelectorProps> = ({
  circuits,
  onSelect,
  onAutoGenerate,
  isLoading = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeZone, setActiveZone] = useState<string>('ALL');

  // Extract all unique zones from circuits list
  const zones = ['ALL', ...Array.from(new Set(circuits.map(c => c.zoneId)))];

  // Filter circuits list based on search query and active zone
  const filteredCircuits = circuits.filter(c => {
    const matchesSearch = 
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesZone = activeZone === 'ALL' || c.zoneId === activeZone;

    return matchesSearch && matchesZone;
  });

  return (
    <div className="w-full space-y-6">
      {/* 🔍 Search & Filters Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between p-4 bg-slate-900/60 border border-white/10 rounded-2xl backdrop-blur-xl">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par code KKS, circuit, zone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-white/15 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-all"
          />
        </div>

        {/* Zone Filters pill tabs */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          {zones.map(zone => (
            <button
              key={zone}
              onClick={() => setActiveZone(zone)}
              className={`
                px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all
                ${activeZone === zone
                  ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/20'
                  : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5'
                }
              `}
            >
              {zone === 'ALL' ? 'Toutes les Zones' : zone}
            </button>
          ))}
        </div>
      </div>

      {/* 🗂️ Circuits Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredCircuits.map(circuit => (
          <div
            key={circuit.id}
            className={`
              flex flex-col justify-between p-5 rounded-2xl border backdrop-blur-md transition-all duration-300 group hover:-translate-y-1
              ${circuit.hasMindmap 
                ? 'bg-slate-900/40 border-white/10 hover:border-orange-500/40' 
                : 'bg-slate-950/20 border-white/5 hover:border-slate-800'
              }
            `}
          >
            {/* Header info */}
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{circuit.zoneId}</span>
                  <h4 className="text-sm font-bold text-white group-hover:text-orange-400 transition-colors mt-0.5">{circuit.name}</h4>
                  <span className="text-[11px] font-mono text-slate-500 bg-white/5 px-2 py-0.5 rounded border border-white/5 w-fit mt-1">{circuit.id}</span>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center gap-1">
                  {circuit.hasMindmap ? (
                    <div className="flex items-center gap-1 text-emerald-400 text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Actif</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-slate-400 text-[10px] font-semibold bg-white/5 border border-white/10 px-2 py-1 rounded-full">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Manquant</span>
                    </div>
                  )}
                </div>
              </div>

              {circuit.description && (
                <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">
                  {circuit.description}
                </p>
              )}

              {/* Node statistics */}
              <div className="grid grid-cols-2 gap-4 p-3 bg-white/5 border border-white/5 rounded-xl text-xs mb-4">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-400 uppercase font-semibold">Schéma Visuel</span>
                  <span className="font-bold text-white mt-0.5">
                    {circuit.hasMindmap ? `${circuit.nodesCount} Nœuds` : 'Aucun'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-400 uppercase font-semibold">Index RAG</span>
                  <span className="font-bold text-white mt-0.5">
                    {circuit.hasMindmap ? 'Vectorisé' : 'Non indexé'}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="flex items-center gap-2 pt-3 border-t border-white/5">
              {circuit.hasMindmap ? (
                <>
                  <button
                    onClick={() => onSelect(circuit.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-orange-600/10 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Ouvrir l'Éditeur</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    disabled={isLoading}
                    onClick={() => onAutoGenerate(circuit.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-orange-600/10 hover:bg-orange-600 border border-orange-500/20 hover:border-orange-500 text-orange-400 hover:text-white rounded-xl text-xs font-semibold transition-all duration-300"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto-Générer le Mind Map</span>
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {filteredCircuits.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-500 bg-slate-900/30 border border-white/5 rounded-2xl">
            <Cpu className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-xs">Aucun circuit ne correspond à vos critères de recherche.</p>
          </div>
        )}
      </div>
    </div>
  );
};
export default MindMapCircuitSelector;
