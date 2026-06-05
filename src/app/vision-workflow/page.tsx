'use client';

import React from 'react';
import { VoiceVisionWorkflowChat } from '@/components/chat/VoiceVisionWorkflowChat';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function VisionWorkflowPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-55">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/vision')}
            className="text-slate-400 hover:text-slate-100 hover:bg-slate-900 rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold tracking-wide bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Guidage Vocal & Vision Intelligent
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">Double Mode : Implantation vs Application</p>
          </div>
        </div>
      </header>

      <main className="flex-1 py-8 px-4 md:px-8">
        <VoiceVisionWorkflowChat />
      </main>
    </div>
  );
}
