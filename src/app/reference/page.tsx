// src/app/reference/page.tsx

import { ReferenceLibrary } from '@/components/reference/ReferenceLibrary';
import SidebarContent from '@/components/layout/Sidebar';

export default function ReferencePage() {
  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* Sidebar - Fixe */}
      <aside className="w-64 border-r border-white/5 shrink-0 hidden md:block">
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Background Effects */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 blur-[120px] rounded-full -z-10" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/5 blur-[120px] rounded-full -z-10" />
        
        <ReferenceLibrary />
      </main>
    </div>
  );
}
