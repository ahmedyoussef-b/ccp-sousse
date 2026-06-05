// src/app/page.tsx
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Menu,
  ChevronLeft,
  ChevronRight,
  Terminal
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import SidebarContent from '@/components/layout/Sidebar';
import ActivityConsole from '@/components/chat/ActivityConsole';

// Chargement dynamique du chat pour optimiser la performance
const Chat = dynamic(() => import('@/components/chat/Chat'), { 
  ssr: false,
  loading: () => <div className="flex-1 flex items-center justify-center bg-[#212121] text-gray-500 font-bold uppercase tracking-widest text-[10px]">Initialisation de l'IA Elite 32...</div>
});

export default function HomePage() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showConsole, setShowConsole] = useState(true);

  return (
    <main className="h-screen flex bg-[#171717] overflow-hidden selection:bg-blue-500/30">
      {/* Sidebar Bureau */}
      <aside className={cn(
        "flex-col hidden lg:flex border-r border-white/5 bg-[#171717] transition-all duration-300 relative z-30",
        isCollapsed ? "w-20" : "w-72"
      )}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-4 top-12 z-50 bg-[#171717] border border-white/5 rounded-full h-8 w-8 hover:bg-blue-600 hover:text-white shadow-xl transition-all"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
        <SidebarContent collapsed={isCollapsed} />
      </aside>

      {/* Zone de contenu principale */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#212121]">
        {/* Header Mobile */}
        <header className="h-16 border-b border-white/5 flex items-center px-4 justify-between lg:hidden bg-[#171717] sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white" aria-label="Ouvrir le menu">
                  <Menu className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 border-none w-72 bg-[#171717]">
                <SheetHeader className="p-6">
                  <SheetTitle className="text-white text-sm uppercase font-black tracking-widest">Menu</SheetTitle>
                </SheetHeader>
                <SidebarContent />
              </SheetContent>
            </Sheet>
            <h1 className="font-bold text-white text-sm uppercase tracking-widest text-center flex-1">Assistant Professionnel</h1>
          </div>
        </header>

        {/* Interface de Chat et Console */}
        <div className="flex-1 overflow-hidden relative flex">
          <div className="flex-1 relative overflow-hidden">
            <Chat />
          </div>

          {/* Console d'Activité Latérale */}
          <aside className={cn(
            "hidden lg:flex transition-all duration-300 border-l border-white/5 bg-[#171717]",
            showConsole ? "w-80" : "w-0 overflow-hidden border-none"
          )}>
            <ActivityConsole className="w-80" />
          </aside>

          {/* Toggle Button for Console */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowConsole(!showConsole)}
            className={cn(
                "absolute top-4 right-4 z-40 bg-[#1a1a1a]/80 backdrop-blur border border-white/5 rounded-full h-8 w-8 hover:bg-blue-600 hover:text-white shadow-xl transition-all",
                showConsole && "right-[310px]"
            )}
            title={showConsole ? "Masquer la console" : "Afficher la console d'activité"}
          >
            <Terminal className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </main>
  );
}
