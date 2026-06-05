// src/app/admin/vision/page.tsx
'use client';

import ImageBank from '@/components/admin/ImageBank';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { navigateBack } from '@/lib/navigation';

export default function VisionAdminPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#171717] text-white p-4 md:p-8">
      <header className="max-w-7xl mx-auto w-full mb-8">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            onClick={() => navigateBack(router, '/admin')} 
            className="rounded-xl bg-white/5 border border-white/10 hover:bg-blue-600 hover:text-white transition-all"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Retour
          </Button>
          <div className="h-10 w-px bg-white/10 mx-2" />
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tighter uppercase">Banque d'Images IA</h1>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Référentiel Vectoriel Multimodal</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full">
        <ImageBank />
      </main>
    </div>
  );
}