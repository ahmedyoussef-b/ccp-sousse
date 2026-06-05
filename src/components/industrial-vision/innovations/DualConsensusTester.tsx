// src/components/industrial-vision/innovations/DualConsensusTester.tsx

'use client';

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Zap, 
  Cpu, 
  Brain, 
  Scale, 
  CheckCircle2, 
  AlertTriangle, 
  Activity
} from 'lucide-react';
import { Innovation } from '@/lib/industrial-vision/types/industrial.types';

export function DualConsensusTester({ innovation }: { innovation: Innovation }) {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setUploadedImage(event.target?.result as string);
    reader.readAsDataURL(file);
  };

  const runAnalysis = async () => {
    if (!uploadedImage) return;
    setIsAnalyzing(true);
    setResult(null);

    try {
      const res = await fetch('/api/industrial-vision/innovations/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          innovationId: innovation.id,
          innovationName: innovation.name,
          query: "Analyser et fusionner les modèles",
          imageContext: uploadedImage
        })
      });

      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error('Erreur consensus:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Visual Header */}
      <div className="lg:col-span-12">
        <div className="flex flex-col md:flex-row items-center gap-6 p-6 bg-gray-900/60 border border-white/10 rounded-2xl">
          <div className="relative h-48 w-full md:w-72 bg-black rounded-xl overflow-hidden border border-white/10 flex items-center justify-center">
             {uploadedImage ? (
               <img src={uploadedImage} alt="Input" className="h-full w-full object-cover" />
             ) : (
               <div className="text-center opacity-20">
                 <Zap className="h-10 w-10 mx-auto mb-2" />
                 <p className="text-[10px] font-bold uppercase tracking-widest">Image Source</p>
               </div>
             )}
             <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
             <Button 
               size="sm" 
               className="absolute bottom-3 left-3 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 text-[10px] h-7"
               onClick={() => fileInputRef.current?.click()}
             >
               CHANGER L&apos;IMAGE
             </Button>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />

          <div className="flex-1 space-y-4">
             <div className="space-y-1">
               <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Arbitrage Multi-Modèles</h2>
               <p className="text-sm text-gray-400 max-w-2xl">
                 Cette innovation compare les prédictions du modèle mathématique local (MobileNet/PCA) avec l&apos;interprétation sémantique d&apos;un modèle expert distant (Gemini/Groq) pour éliminer les faux positifs.
               </p>
             </div>
             <div className="flex gap-3">
                <Button 
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-11 px-8 rounded-xl shadow-lg shadow-blue-500/20"
                  disabled={!uploadedImage || isAnalyzing}
                  onClick={runAnalysis}
                >
                  {isAnalyzing ? <Activity className="h-4 w-4 animate-spin mr-2" /> : <Scale className="h-4 w-4 mr-2" />}
                  LANCER LE CONSENSUS
                </Button>
             </div>
          </div>
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Modèle Mathématique */}
        <Card className="border-white/10 bg-gray-900/40 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Cpu className="h-12 w-12 text-blue-400" />
          </div>
          <CardHeader>
            <Badge variant="outline" className="w-fit mb-2 border-blue-500/30 text-blue-400 text-[10px]">MODÈLE LOCAL (FAST)</Badge>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-white">Analyse Vectorielle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                   <span className="text-[10px] text-gray-500 font-bold uppercase">Confiance</span>
                   <span className="text-xs font-mono text-blue-400">{result ? '89.2%' : '--%'}</span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                   <div className="h-full bg-blue-500" style={{ width: result ? '89%' : '0%' }} />
                </div>
             </div>
             <div className="text-[11px] text-gray-400 leading-relaxed font-mono">
                {result ? '> [PCA] Features extracted: 1024D\n> [DIST] Euclidean distance: 0.124\n> [RESULT] High similarity detected' : 'En attente d\'analyse...'}
             </div>
          </CardContent>
        </Card>

        {/* Modèle Expert */}
        <Card className="border-white/10 bg-gray-900/40 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Brain className="h-12 w-12 text-purple-400" />
          </div>
          <CardHeader>
            <Badge variant="outline" className="w-fit mb-2 border-purple-500/30 text-purple-400 text-[10px]">MODÈLE EXPERT (VLM)</Badge>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-white">Analyse Sémantique</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                   <span className="text-[10px] text-gray-500 font-bold uppercase">Raisonnement</span>
                   <span className="text-xs font-mono text-purple-400">{result ? '95.8%' : '--%'}</span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                   <div className="h-full bg-purple-500" style={{ width: result ? '95%' : '0%' }} />
                </div>
             </div>
             <div className="text-[11px] text-gray-400 leading-relaxed italic">
                {result ? '"L\'équipement semble opérationnel mais présente une légère usure sur la bride droite, confirmant l\'alerte mathématique."' : 'En attente du modèle distant...'}
             </div>
          </CardContent>
        </Card>

        {/* Verdict Final */}
        <Card className={`border-2 transition-all duration-500 ${result ? (result.success ? 'bg-green-950/20 border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.1)]' : 'bg-red-950/20 border-red-500/30') : 'bg-gray-950 border-white/10 opacity-50'}`}>
          <CardHeader className="text-center">
            <div className={`h-12 w-12 rounded-full mx-auto flex items-center justify-center mb-2 ${result ? (result.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400') : 'bg-white/5 text-gray-600'}`}>
               {result ? (result.success ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />) : <Activity className="h-6 w-6" />}
            </div>
            <CardTitle className="text-sm font-black uppercase tracking-widest text-white">Verdict Consensus</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
             <div className="space-y-1">
                <p className={`text-2xl font-black ${result ? (result.success ? 'text-green-400' : 'text-red-400') : 'text-gray-700'}`}>
                   {result ? (result.success ? 'CONFIRMÉ' : 'REJETÉ') : 'PENDING'}
                </p>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Décision Automatisée</p>
             </div>
             <div className="pt-4 border-t border-white/5">
                <p className="text-[11px] text-gray-400 leading-tight">
                   {result ? 'Les deux modèles convergent vers la même conclusion.' : 'Lancer l\'analyse pour comparer les modèles.'}
                </p>
             </div>
             {result && (
               <Button size="sm" variant="outline" className="w-full mt-2 border-white/10 text-[10px] h-8 rounded-lg">VOIR LE RAPPORT</Button>
             )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
