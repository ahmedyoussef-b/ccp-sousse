// src/components/chat/ActivityConsole.tsx
'use client';

/**
 * @fileOverview ActivityConsole - Console de monitoring temps réel des actions IA.
 * Intégrée à la page de chat pour offrir une transparence totale sur le raisonnement.
 */

import React, { useState } from 'react';
import { 
  Terminal, 
  ShieldCheck, 
  Settings, 
  Zap, 
  BrainCircuit, 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  History,
  Trash2,
  Lock,
  Search,
  Play
} from 'lucide-react';
import { useActionEvents } from '@/hooks/use-action-events';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

interface ActivityConsoleProps {
  className?: string;
}

export default function ActivityConsole({ className }: ActivityConsoleProps) {
  const { events, isConnected, clearEvents } = useActionEvents(100);
  const [filter, setFilter] = useState<string | null>(null);
  
  const modules = Array.from(new Set(events.map(e => e.module)));
  const filteredEvents = filter ? events.filter(e => e.module === filter) : events;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'start': return <Play className="w-3 h-3 text-blue-400" />;
      case 'complete': return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
      case 'error': return <AlertTriangle className="w-3 h-3 text-red-500" />;
      case 'blocked': return <Lock className="w-3 h-3 text-orange-500" />;
      case 'snapshot': return <History className="w-3 h-3 text-purple-400" />;
      case 'prediction': return <Zap className="w-3 h-3 text-yellow-400" />;
      default: return <Activity className="w-3 h-3 text-gray-400" />;
    }
  };

  const getModuleIcon = (module: string) => {
    switch (module) {
      case 'Intent': return <Search className="w-4 h-4 text-cyan-400" />;
      case 'Router': return <Zap className="w-4 h-4 text-magenta-400" />;
      case 'Rag': return <History className="w-4 h-4 text-blue-400" />;
      case 'Context': return <ShieldCheck className="w-4 h-4 text-yellow-400" />;
      case 'Llm': return <BrainCircuit className="w-4 h-4 text-emerald-400" />;
      case 'Flow': return <Activity className="w-4 h-4 text-white" />;
      case 'Valid': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'Cache': return <Settings className="w-4 h-4 text-orange-400" />;
      case 'Planner': return <BrainCircuit className="w-4 h-4" />;
      case 'Validator': return <ShieldCheck className="w-4 h-4" />;
      case 'Executor': return <Settings className="w-4 h-4" />;
      case 'Toolformer': return <Zap className="w-4 h-4" />;
      default: return <Terminal className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-[#111111]/95 backdrop-blur-xl border-l border-white/5 shadow-2xl", className)}>
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-[#1a1a1a] to-[#111111]">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-2.5 h-2.5 rounded-full",
            isConnected ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)] animate-pulse" : "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]"
          )} />
          <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-white/80">Console d'Activité IA</h2>
        </div>
        <div className="flex gap-1.5">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-white/30 hover:text-white hover:bg-white/5 rounded-full transition-all"
              onClick={clearEvents}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
        </div>
      </div>

      {/* Module Filter Chips */}
      <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar border-b border-white/5 bg-[#141414]/50">
        <Badge 
          variant={filter === null ? "default" : "outline"}
          className={cn(
            "cursor-pointer text-[9px] uppercase tracking-wider px-2.5 py-0.5 transition-all",
            filter === null ? "bg-white text-black font-bold" : "text-white/40 border-white/10 hover:border-white/30"
          )}
          onClick={() => setFilter(null)}
        >
          Tous
        </Badge>
        {modules.map(mod => (
          <Badge 
            key={mod}
            variant={filter === mod ? "default" : "outline"}
            className={cn(
                "cursor-pointer text-[9px] uppercase tracking-wider px-2.5 py-0.5 transition-all whitespace-nowrap",
                filter === mod ? "bg-blue-600/30 text-blue-300 border-blue-500/40 shadow-[0_0_10px_rgba(37,99,235,0.2)]" : "text-white/40 border-white/10 hover:border-white/30"
            )}
            onClick={() => setFilter(mod)}
          >
            {mod}
          </Badge>
        ))}
      </div>

      {/* Timeline */}
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-4">
          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 opacity-10">
              <BrainCircuit className="w-16 h-16 mb-4 animate-pulse" />
              <p className="text-[11px] uppercase font-black tracking-[.3em]">En attente d'activité...</p>
            </div>
          ) : (
            filteredEvents.map((event, idx) => (
              <div 
                key={event.id + idx}
                className={cn(
                  "group relative pl-6 border-l py-2 transition-all hover:bg-white/[0.03] rounded-r-lg",
                  event.status === 'blocked' ? "border-orange-500/50 bg-orange-500/5" :
                  event.status === 'error' ? "border-red-500/50 bg-red-500/5" :
                  event.status === 'complete' ? "border-emerald-500/20" :
                  "border-white/10"
                )}
              >
                {/* Status Dot Floating */}
                <div className="absolute -left-[9px] top-3.5 bg-[#111111] p-0.5 rounded-full border border-white/5">
                    {getStatusIcon(event.status)}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-white/60 flex items-center gap-2">
                      <span className="p-1 rounded-md bg-white/[0.05] border border-white/10 group-hover:border-white/20 transition-colors">
                        {getModuleIcon(event.module)}
                      </span>
                      <span className="uppercase tracking-[.15em] font-black">{event.module}</span>
                    </span>
                    <span className="text-[9px] font-mono text-white/30 bg-white/[0.03] px-1.5 py-0.5 rounded border border-white/5">
                      {format(event.timestamp, 'HH:mm:ss', { locale: fr })}
                    </span>
                  </div>
                  
                  <p className="text-xs text-white/90 font-medium leading-relaxed tracking-tight">
                    {event.message}
                  </p>

                  {(event.duration || (event.data && Object.keys(event.data).length > 0)) && (
                    <div className="mt-2 flex gap-2">
                        {event.duration && (
                             <Badge variant="outline" className="h-5 text-[9px] px-2 opacity-70 bg-black/40 border-white/5 text-white/60 font-mono">
                                <Clock className="w-2.5 h-2.5 mr-1.5 opacity-50" /> {event.duration}ms
                             </Badge>
                        )}
                        {event.data && Object.keys(event.data).length > 0 && (
                             <Badge variant="outline" className="h-5 text-[9px] px-2 bg-blue-500/10 text-blue-300 border-blue-500/20 hover:bg-blue-500/20 transition-colors cursor-help">
                                <Search className="w-2.5 h-2.5 mr-1.5" /> INSPECT
                             </Badge>
                        )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Persistence Info */}
      <div className="p-4 border-t border-white/10 bg-[#0d0d0d] flex items-center justify-between">
        <div className="flex items-center gap-2.5 opacity-40 hover:opacity-100 transition-opacity cursor-default">
          <History className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[9px] uppercase font-black tracking-[.25em] text-white">Monitoring Temps Réel</span>
        </div>
        <div className="text-[9px] font-black text-white/20 tracking-widest">
          V8.0-ELITE
        </div>
      </div>
    </div>
  );
}