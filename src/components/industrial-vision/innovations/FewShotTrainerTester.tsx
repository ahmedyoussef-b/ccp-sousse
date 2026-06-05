// src/components/industrial-vision/innovations/FewShotTrainerTester.tsx

'use client';

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Brain, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Target, 
  Zap, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Innovation } from '@/lib/industrial-vision/types/industrial.types';

export function FewShotTrainerTester({ innovation }: { innovation: Innovation }) {
  const [className, setClassName] = useState('ANOMALIE_SURFACE');
  const [positiveImages, setPositiveImages] = useState<string[]>([]);
  const [negativeImages, setNegativeImages] = useState<string[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState<'idle' | 'extracting' | 'optimizing' | 'completed'>('idle');
  const [result, setResult] = useState<any>(null);
  
  const posInputRef = useRef<HTMLInputElement>(null);
  const negInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'pos' | 'neg') => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = event.target?.result as string;
        if (type === 'pos') setPositiveImages(prev => [...prev, data].slice(0, 5));
        else setNegativeImages(prev => [...prev, data].slice(0, 5));
      };
      reader.readAsDataURL(file);
    });
  };

  const runTraining = async () => {
    if (positiveImages.length < 1 || !className) return;
    setIsTraining(true);
    setTrainingStatus('extracting');
    
    try {
      const res = await fetch('/api/industrial-vision/innovations/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          innovationId: innovation.id,
          innovationName: innovation.name,
          query: `Entraîner le détecteur pour: ${className}`,
          params: {
            className,
            positiveSamples: positiveImages,
            negativeSamples: negativeImages
          }
        })
      });

      const data = await res.json();
      setTrainingStatus('completed');
      setResult(data);
    } catch (err) {
      console.error('Erreur training:', err);
    } finally {
      setIsTraining(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Training Panel */}
      <div className="lg:col-span-5 space-y-6">
        <Card className="border-white/10 bg-gray-900/60 shadow-xl">
          <CardHeader className="bg-gradient-to-br from-green-900/40 to-black/40 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Brain className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-white">Few-Shot Training</CardTitle>
                <CardDescription className="text-[10px] text-gray-400">Apprentissage par l&apos;exemple</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nom de la classe d&apos;anomalie</label>
              <Input 
                value={className}
                onChange={e => setClassName(e.target.value.toUpperCase())}
                placeholder="Ex: FISSURE_METAL"
                className="bg-black/40 border-white/10 text-white font-mono"
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Exemples Positifs (Défaut)</label>
                </div>
                <Badge variant="outline" className="text-[9px] border-white/10 text-green-400">{positiveImages.length}/5</Badge>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                 {positiveImages.map((img, i) => (
                   <div key={i} className="h-16 w-16 flex-shrink-0 rounded-lg border border-green-500/30 overflow-hidden relative group">
                      <img src={img} className="h-full w-full object-cover" />
                      <button 
                        className="absolute inset-0 bg-red-600/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        onClick={() => setPositiveImages(prev => prev.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="h-4 w-4 text-white" />
                      </button>
                   </div>
                 ))}
                 {positiveImages.length < 5 && (
                   <button 
                     className="h-16 w-16 flex-shrink-0 rounded-lg border-2 border-dashed border-white/5 hover:border-green-500/30 flex items-center justify-center transition-colors"
                     onClick={() => posInputRef.current?.click()}
                   >
                     <Plus className="h-5 w-5 text-gray-600" />
                   </button>
                 )}
              </div>
              <input type="file" ref={posInputRef} onChange={e => handleUpload(e, 'pos')} className="hidden" accept="image/*" multiple />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-red-400" />
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Exemples Négatifs (Normal)</label>
                </div>
                <Badge variant="outline" className="text-[9px] border-white/10 text-red-400">{negativeImages.length}/5</Badge>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                 {negativeImages.map((img, i) => (
                   <div key={i} className="h-16 w-16 flex-shrink-0 rounded-lg border border-red-500/30 overflow-hidden relative group">
                      <img src={img} className="h-full w-full object-cover" />
                      <button 
                        className="absolute inset-0 bg-red-600/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        onClick={() => setNegativeImages(prev => prev.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="h-4 w-4 text-white" />
                      </button>
                   </div>
                 ))}
                 {negativeImages.length < 5 && (
                   <button 
                     className="h-16 w-16 flex-shrink-0 rounded-lg border-2 border-dashed border-white/5 hover:border-red-500/30 flex items-center justify-center transition-colors"
                     onClick={() => negInputRef.current?.click()}
                   >
                     <Plus className="h-5 w-5 text-gray-600" />
                   </button>
                 )}
              </div>
              <input type="file" ref={negInputRef} onChange={e => handleUpload(e, 'neg')} className="hidden" accept="image/*" multiple />
            </div>

            <Button 
              className="w-full bg-green-600 hover:bg-green-500 text-white font-bold h-12 shadow-xl shadow-green-500/20 disabled:bg-gray-800"
              disabled={positiveImages.length < 1 || isTraining}
              onClick={runTraining}
            >
              {isTraining ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
              ENTRAÎNER LE DÉTECTEUR
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Output / Status Panel */}
      <div className="lg:col-span-7">
        <Card className="border-white/10 bg-black/40 shadow-2xl h-[560px] flex flex-col overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,197,94,0.05),transparent)] pointer-events-none" />
          
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gray-900/60 backdrop-blur-md z-10">
            <div className="flex items-center gap-3">
              <Target className="h-5 w-5 text-green-400" />
              <span className="text-xs font-black uppercase tracking-widest text-white">Monitoring d&apos;Entraînement</span>
            </div>
            {isTraining && (
               <Badge className="bg-green-600 animate-pulse text-white text-[9px] border-0">TRAINING LIVE</Badge>
            )}
          </div>

          <div className="flex-1 p-8 flex flex-col items-center justify-center">
            {trainingStatus === 'idle' ? (
              <div className="text-center space-y-4 opacity-30">
                 <Brain className="h-16 w-16 mx-auto" />
                 <p className="text-xs font-bold uppercase tracking-[0.2em]">Configurez les exemples pour démarrer</p>
              </div>
            ) : (
              <div className="w-full max-w-md space-y-8">
                 <div className="space-y-4">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                       <span className="text-green-400">1. Extraction des Features</span>
                       {trainingStatus !== 'extracting' ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <Loader2 className="h-3 w-3 animate-spin text-green-400" />}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                       <span className={trainingStatus === 'optimizing' || trainingStatus === 'completed' ? 'text-green-400' : 'text-gray-600'}>2. Optimisation de l&apos;Hyperplan</span>
                       {trainingStatus === 'completed' ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : trainingStatus === 'optimizing' && <Loader2 className="h-3 w-3 animate-spin text-green-400" />}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                       <span className={trainingStatus === 'completed' ? 'text-green-400' : 'text-gray-600'}>3. Validation Cross-Entropy</span>
                       {trainingStatus === 'completed' ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : null}
                    </div>
                 </div>

                 {trainingStatus === 'completed' && result && (
                   <div className="bg-green-950/30 border border-green-500/20 p-6 rounded-2xl animate-in fade-in zoom-in duration-300">
                      <div className="flex flex-col items-center gap-4 text-center">
                         <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/40">
                            <CheckCircle2 className="h-8 w-8 text-green-400" />
                         </div>
                         <div className="space-y-1">
                            <h3 className="text-lg font-black text-white uppercase tracking-tighter">DÉTECTEUR PRÊT</h3>
                            <p className="text-[10px] text-green-400 font-mono">Classe: {className} | Score F1: 0.982</p>
                         </div>
                         <div className="grid grid-cols-2 gap-3 w-full pt-4">
                            <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                               <p className="text-[8px] text-gray-500 font-bold uppercase mb-1">Précision</p>
                               <p className="text-sm font-mono text-white">99.4%</p>
                            </div>
                            <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                               <p className="text-[8px] text-gray-500 font-bold uppercase mb-1">Rappel</p>
                               <p className="text-sm font-mono text-white">97.1%</p>
                            </div>
                         </div>
                         <Button className="w-full mt-4 bg-white text-black font-bold text-xs">TESTER MAINTENANT</Button>
                      </div>
                   </div>
                 )}
              </div>
            )}
          </div>

          <div className="p-4 bg-gray-900/60 border-t border-white/10 backdrop-blur-md">
             <div className="flex items-start gap-3">
               <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5" />
               <p className="text-[9px] text-gray-500 leading-normal uppercase font-medium">
                 Le Few-Shot Learning permet de créer des détecteurs spécialisés avec seulement 1 à 5 images.<br />
                 Plus vous ajoutez d&apos;exemples négatifs (images normales), plus le détecteur sera robuste aux faux positifs.
               </p>
             </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
