// src/components/industrial-vision/innovations/HybridSearchTester.tsx

'use client';

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  ImageIcon, 
  Type, 
  Settings2, 
  Activity, 
  FileSearch,
  Info,
  Trash2
} from 'lucide-react';
import { Innovation } from '@/lib/industrial-vision/types/industrial.types';

export function HybridSearchTester({ innovation }: { innovation: Innovation }) {
  const [textQuery, setTextQuery] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [visionWeight, setVisionWeight] = useState(0.6);
  const [textWeight, setTextWeight] = useState(0.4);
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setUploadedImage(event.target?.result as string);
    reader.readAsDataURL(file);
  };

  const runSearch = async () => {
    setIsLoading(true);
    try {
      const body: any = {
        textQuery,
        visionWeight,
        textWeight,
        threshold: 0.5,
        maxResults: 12
      };

      if (uploadedImage) {
        body.imageContext = uploadedImage;
      }

      const res = await fetch('/api/industrial-vision/innovations/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          innovationId: innovation.id,
          innovationName: innovation.name,
          query: textQuery || (uploadedImage ? "Recherche visuelle" : ""),
          imageContext: uploadedImage,
          params: body
        })
      });

      const data = await res.json();
      if (data.success && data.visualData?.results) {
        setResults(data.visualData.results);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error('Erreur recherche:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Configuration Panel */}
      <div className="lg:col-span-4 space-y-6">
        <Card className="border-white/10 bg-gray-900/60 shadow-xl overflow-hidden">
          <CardHeader className="bg-gradient-to-br from-indigo-900/40 to-black/40 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <Settings2 className="h-5 w-5 text-indigo-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-white">Moteur Hybride</CardTitle>
                <CardDescription className="text-[10px] text-gray-400">Pondération Vision vs Texte</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-3.5 w-3.5 text-blue-400" />
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Poids Vision</label>
                </div>
                <span className="text-sm font-mono text-blue-400 font-bold">{(visionWeight * 100).toFixed(0)}%</span>
              </div>
              <Slider 
                value={[visionWeight * 100]} 
                onValueChange={(val) => setVisionWeight(val[0] / 100)} 
                max={100} 
                step={5}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Type className="h-3.5 w-3.5 text-purple-400" />
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Poids Texte</label>
                </div>
                <span className="text-sm font-mono text-purple-400 font-bold">{(textWeight * 100).toFixed(0)}%</span>
              </div>
              <Slider 
                value={[textWeight * 100]} 
                onValueChange={(val) => setTextWeight(val[0] / 100)} 
                max={100} 
                step={5}
              />
            </div>

            <div className="pt-4 border-t border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Index BM25</span>
                <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-400 border-0">ACTIF</Badge>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                className="w-full border-white/10 text-gray-400 hover:text-white text-[10px] h-8"
                onClick={async () => {
                  setIsLoading(true);
                  await fetch('/api/innovations/hybrid-search/rebuild', { method: 'POST' });
                  setIsLoading(false);
                }}
              >
                RECONSTRUIRE L&apos;INDEX
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search Mode Info */}
        <Card className="border-white/10 bg-blue-900/10 p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-400 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-blue-300">Recherche Cross-Modale</p>
              <p className="text-[10px] text-blue-300/60 leading-relaxed">
                Le moteur fusionne les scores de similarité visuelle (embeddings) et textuelle (BM25) pour trouver les assets les plus proches de votre intention.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Search Panel */}
      <div className="lg:col-span-8 space-y-6">
        <div className="space-y-4">
          {/* Input Bar */}
          <div className="flex gap-3">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-500 transition-colors group-focus-within:text-blue-400" />
              <Input 
                value={textQuery}
                onChange={e => setTextQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runSearch()}
                placeholder="Décrivez l'asset que vous cherchez (ex: 'condenseur haute pression')..."
                className="pl-12 bg-gray-900/60 border-white/10 text-white h-14 rounded-2xl shadow-2xl focus-visible:ring-blue-500/50"
              />
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
            <Button 
              variant="outline"
              className={`h-14 w-14 rounded-2xl border-white/10 transition-all ${uploadedImage ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-gray-900/60 text-gray-500 hover:text-white'}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon className="h-6 w-6" />
            </Button>
            <Button 
              className="h-14 px-8 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-xl shadow-blue-500/20 gap-3"
              disabled={isLoading || (!textQuery && !uploadedImage)}
              onClick={runSearch}
            >
              {isLoading ? <Activity className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
              RECHERCHER
            </Button>
          </div>

          {/* Visual Context Badge */}
          {uploadedImage && (
            <div className="flex items-center gap-3 p-2 bg-blue-900/20 border border-blue-500/30 rounded-xl w-fit animate-in zoom-in-95 duration-200">
               <div className="h-10 w-10 rounded-lg overflow-hidden border border-white/10">
                 <img src={uploadedImage} alt="Context" className="h-full w-full object-cover" />
               </div>
               <div className="pr-2">
                 <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Référence Visuelle Activée</p>
                 <button className="text-[10px] text-gray-500 hover:text-red-400 flex items-center gap-1" onClick={() => setUploadedImage(null)}>
                   <Trash2 className="h-3 w-3" /> Supprimer
                 </button>
               </div>
            </div>
          )}
        </div>

        {/* Results Area */}
        <Card className="border-white/10 bg-gray-950/40 min-h-[400px] flex flex-col relative overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-4">
              <div className="h-12 w-12 rounded-full border-t-2 border-blue-500 animate-spin" />
              <p className="text-blue-300 font-mono text-[10px] tracking-[0.2em] animate-pulse">FUSION CROSS-MODALE EN COURS...</p>
            </div>
          )}

          {results.length > 0 ? (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-blue-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white">Résultats Pertinents</span>
                  <Badge variant="outline" className="text-[9px] border-white/10 text-gray-500">{results.length} trouvés</Badge>
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    <span className="text-[9px] text-gray-500 uppercase font-bold">Similarité Visuelle</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                    <span className="text-[9px] text-gray-500 uppercase font-bold">Similarité Texte</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {results.map((res, i) => (
                  <Card key={i} className="bg-gray-900/60 border-white/5 overflow-hidden group hover:border-blue-500/30 transition-all cursor-pointer">
                    <div className="aspect-video relative overflow-hidden bg-black">
                      <img 
                        src={`/api/vision/images/${res.id}/file`} 
                        alt={res.metadata.filename}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 opacity-70 group-hover:opacity-100"
                      />
                      <div className="absolute top-2 right-2">
                        <Badge className="bg-black/60 backdrop-blur-md border-0 text-[10px] text-blue-400 font-mono">
                          {(res.combinedScore * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500" 
                          style={{ width: `${res.combinedScore * 100}%` }}
                        />
                      </div>
                    </div>
                    <CardContent className="p-3">
                      <p className="text-[11px] font-bold text-gray-200 truncate">{res.metadata.filename}</p>
                      <p className="text-[9px] text-gray-500 mt-1 line-clamp-1 italic">{res.metadata.description || 'Pas de description'}</p>
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {res.metadata.tags?.slice(0, 2).map((t: string) => (
                          <span key={t} className="text-[8px] bg-white/5 text-gray-400 px-1.5 py-0.5 rounded uppercase font-bold border border-white/5">{t}</span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : !isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
               <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center border border-white/5 mb-4">
                 <Search className="h-8 w-8 text-gray-800" />
               </div>
               <p className="text-gray-500 text-sm font-medium">Aucun asset ne correspond à votre recherche</p>
               <p className="text-gray-700 text-[10px] uppercase font-bold tracking-widest mt-1">Ajustez les curseurs ou modifiez les termes</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
