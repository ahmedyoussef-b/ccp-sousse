// src/components/layout/SidebarContent.tsx

'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Bot, 
  MessageSquare, 
  Camera, 
  HardDrive, 
  BookOpen, 
  Cpu, 
  ShieldCheck,
  Brain,
  Images,
  Microscope,
  Gauge,
  Database,
  Activity,
  FolderTree,
  GitMerge
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SidebarProps {
  collapsed?: boolean;
}

/**
 * SidebarContent - Menu latéral optimisé pour l'architecture Elite 32.
 * Inclut maintenant le module Vision Industrielle avec 40 innovations.
 */
export default function SidebarContent({ collapsed = false }: SidebarProps) {
  return (
    <div className="p-4 md:p-6 flex flex-col h-full bg-[#171717] overflow-hidden">
      <Link href="/" className={cn(
        "flex items-center gap-3 px-2 py-1 mb-10 hover:opacity-80 transition-all group shrink-0",
        collapsed && "justify-center px-0"
      )}>
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center group-hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20 shrink-0">
          <Bot className="w-6 h-6 text-white" />
        </div>
        {!collapsed && (
          <div className="animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="font-bold text-white tracking-tighter text-lg leading-none">AGENTIC</div>
            <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mt-1">Elite 32 RAG</div>
          </div>
        )}
      </Link>

      <div className="flex-1 space-y-6 overflow-y-auto no-scrollbar">
        {/* Section Intelligence & Données */}
        <div className="space-y-1">
          {!collapsed && (
            <div className="text-[10px] font-bold text-gray-600 px-3 py-2 uppercase tracking-[0.2em] mb-2 animate-in fade-in">
              Intelligence & Données
            </div>
          )}

          <Link href="/" className={cn(
            "flex items-center gap-3 px-4 py-3 text-sm font-bold text-white bg-blue-600/10 border border-blue-500/20 rounded-xl transition-all",
            collapsed && "justify-center px-0 border-none bg-transparent hover:bg-blue-600/10"
          )}>
            <MessageSquare className="w-4 h-4 text-blue-400 shrink-0" />
            {!collapsed && <span className="truncate">Chat Intelligent</span>}
          </Link>

          <Link href="/vision" className={cn(
            "flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:bg-white/5 hover:text-white rounded-xl transition-all group",
            collapsed && "justify-center px-0"
          )}>
            <Camera className="w-4 h-4 group-hover:text-purple-400 transition-colors shrink-0" />
            {!collapsed && <span className="truncate">Recherche par Image</span>}
            {!collapsed && <Badge className="ml-auto bg-purple-500/10 text-purple-400 border-none text-[8px] font-black">NEW</Badge>}
          </Link>

          <Link href="/admin" className={cn(
            "flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:bg-white/5 hover:text-white rounded-xl transition-all group",
            collapsed && "justify-center px-0"
          )}>
            <HardDrive className="w-4 h-4 group-hover:text-blue-400 transition-colors shrink-0" />
            {!collapsed && <span className="truncate">Base de Connaissances</span>}
          </Link>

          <Link href="/admin/vision" className={cn(
            "flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:bg-white/5 hover:text-white rounded-xl transition-all group",
            collapsed && "justify-center px-0"
          )}>
            <Images className="w-4 h-4 group-hover:text-emerald-400 transition-colors shrink-0" />
            {!collapsed && <span className="truncate">Banque d'images IA</span>}
          </Link>

          <Link href="/reference" className={cn(
            "flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:bg-white/5 hover:text-white rounded-xl transition-all group",
            collapsed && "justify-center px-0"
          )}>
            <FolderTree className="w-4 h-4 group-hover:text-amber-400 transition-colors shrink-0" />
            {!collapsed && <span className="truncate">Bibliothèque IDs</span>}
          </Link>

          <Link href="/admin/circuit-mindmap" className={cn(
            "flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:bg-white/5 hover:text-white rounded-xl transition-all group",
            collapsed && "justify-center px-0"
          )}>
            <GitMerge className="w-4 h-4 group-hover:text-orange-400 transition-colors shrink-0" />
            {!collapsed && <span className="truncate">Topologie & Mind Map</span>}
            {!collapsed && <Badge className="ml-auto bg-orange-500/10 text-orange-400 border-none text-[8px] font-black">RAG</Badge>}
          </Link>
        </div>

        {/* Section Vision Industrielle - NOUVEAU */}
        <div className="space-y-1">
          {!collapsed && (
            <div className="text-[10px] font-bold text-gray-600 px-3 py-2 uppercase tracking-[0.2em] mb-2 animate-in fade-in">
              Vision Industrielle
            </div>
          )}

          <Link href="/industrial-vision" className={cn(
            "flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:bg-white/5 hover:text-white rounded-xl transition-all group",
            collapsed && "justify-center px-0"
          )}>
            <Microscope className="w-4 h-4 group-hover:text-cyan-400 transition-colors shrink-0" />
            {!collapsed && <span className="truncate">Dashboard Vision</span>}
            {!collapsed && <Badge className="ml-auto bg-cyan-500/10 text-cyan-400 border-none text-[8px] font-black">40</Badge>}
          </Link>

          <Link href="/industrial-vision/innovations" className={cn(
            "flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:bg-white/5 hover:text-white rounded-xl transition-all group pl-9",
            collapsed && "justify-center px-0 pl-0"
          )}>
            <Gauge className="w-3.5 h-3.5 group-hover:text-cyan-400 transition-colors shrink-0" />
            {!collapsed && <span className="truncate text-xs">40 Innovations IA</span>}
          </Link>

          <Link href="/industrial-vision/references" className={cn(
            "flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:bg-white/5 hover:text-white rounded-xl transition-all group pl-9",
            collapsed && "justify-center px-0 pl-0"
          )}>
            <Database className="w-3.5 h-3.5 group-hover:text-cyan-400 transition-colors shrink-0" />
            {!collapsed && <span className="truncate text-xs">Références (Marche/Arrêt/Défaut)</span>}
          </Link>

          <Link href="/industrial-vision/rag" className={cn(
            "flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:bg-white/5 hover:text-white rounded-xl transition-all group pl-9",
            collapsed && "justify-center px-0 pl-0"
          )}>
            <Activity className="w-3.5 h-3.5 group-hover:text-cyan-400 transition-colors shrink-0" />
            {!collapsed && <span className="truncate text-xs">RAG Vision & Chat</span>}
          </Link>
        </div>

        {/* Section Formation & Documentation */}
        <div className="space-y-1">
          {!collapsed && (
            <div className="text-[10px] font-bold text-gray-600 px-3 py-2 uppercase tracking-[0.2em] mb-2 animate-in fade-in">
              Formation & Support
            </div>
          )}

          <Link href="/training" className={cn(
            "flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:bg-white/5 hover:text-white rounded-xl transition-all group",
            collapsed && "justify-center px-0"
          )}>
            <Brain className="w-4 h-4 group-hover:text-pink-400 transition-colors shrink-0" />
            {!collapsed && <span className="truncate">Entraînement IA</span>}
          </Link>

          <Link href="/docs" className={cn(
            "flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:bg-white/5 hover:text-white rounded-xl transition-all group",
            collapsed && "justify-center px-0"
          )}>
            <BookOpen className="w-4 h-4 group-hover:text-orange-400 transition-colors shrink-0" />
            {!collapsed && <span className="truncate">Documentation</span>}
          </Link>
        </div>

        {/* Status Panel */}
        {!collapsed && (
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-yellow-400" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Pipeline Actif</span>
            </div>
            <p className="text-[9px] text-gray-500 leading-relaxed">
              Le RAG Hybride surveille vos fichiers en temps réel pour une précision industrielle.
            </p>
            <div className="flex items-center gap-2 text-[8px] text-cyan-400">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Vision Industrielle • 40 innovations
            </div>
          </div>
        )}
      </div>

      <div className="pt-6 mt-auto border-t border-white/5 space-y-4 shrink-0">
        {!collapsed ? (
          <div className="px-3 py-2 flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2 text-[10px] text-green-500 font-bold uppercase tracking-widest">
              <ShieldCheck className="w-3.5 h-3.5" /> Sécurité
            </div>
            <Badge className="bg-green-500/10 text-green-500 border-none text-[8px] font-black">LOCAL</Badge>
          </div>
        ) : (
          <div className="flex justify-center py-2">
            <ShieldCheck className="w-5 h-5 text-green-500" />
          </div>
        )}
      </div>
    </div>
  );
}