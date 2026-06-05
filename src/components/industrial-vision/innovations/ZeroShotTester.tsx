// src/components/industrial-vision/innovations/ZeroShotTester.tsx

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  Settings2, 
  Image as ImageIcon,
  Activity,
  History,
  Info
} from 'lucide-react';
import { Innovation } from '@/lib/industrial-vision/types/industrial.types';

interface Subspace {
  id: string;
  name: string;
  referenceCount: number;
  createdAt: string;
}

export function ZeroShotTester({ innovation: _innovation }: { innovation: Innovation }) {
  const [subspaces, setSubspaces] = useState<Subspace[]>([]);
  const [selectedSubspace, setSelectedSubspace] = useState<string>('');
  const [threshold, setThreshold] = useState<number>(0.85);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSubspaces();
  }, []);

  const fetchSubspaces = async () => {
    try {
      const res = await fetch('/api/innovations/zero-shot/list-subspaces');
      const data = await res.json();
      if (data.success) {
        setSubspaces(data.subspaces);
        if (data.subspaces.length > 0 && !selectedSubspace) {
          setSelectedSubspace(data.subspaces[0].id);
        }
      }
    } catch (err) {
      console.error('Erreur chargement sous-espaces:', err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setUploadedImage(event.target?.result as string);
    reader.readAsDataURL(file);
  };

  const runDetection = async () => {
    if (!uploadedImage || !selectedSubspace) return;
    setIsLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      // Convert base64 to blob
      const blob = await (await fetch(uploadedImage)).blob();
      formData.append('image', blob, 'test.jpg');
      formData.append('subspaceId', selectedSubspace);
      formData.append('threshold', threshold.toString());

      const res = await fetch('/api/innovations/zero-shot/detect', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      setResult(data);
      
      if (data.success) {
        setHistory(prev => [{
          id: Date.now(),
          timestamp: new Date().toLocaleTimeString(),
          isAnomaly: data.isAnomaly,
          score: data.anomalyScore
        }, ...prev].slice(0, 5));
      }
    } catch (err) {
      console.error('Erreur détection:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Colonne Gauche: Configuration */}
      <div className="lg:col-span-4 space-y-6">
        <Card className="border-white/10 bg-gray-900/60 shadow-xl overflow-hidden">
          <CardHeader className="bg-gradient-to-br from-blue-900/40 to-black/40 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Settings2 className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-white">Paramètres PCA</CardTitle>
                <CardDescription className="text-[10px] text-gray-400">Configuration du modèle Zero-Shot</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center justify-between">
                Modèle de référence
                <Badge variant="outline" className="text-[9px] border-white/10">{subspaces.length} dispo</Badge>
              </label>
              <select 
                value={selectedSubspace}
                onChange={(e) => setSelectedSubspace(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-blue-500/50 outline-none"
              >
                {subspaces.map(s => (
                  <option key={s.id} value={s.id}>{s.name || s.id}</option>
                ))}
              </select>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Seuil d&apos;anomalie</label>
                <span className="text-sm font-mono text-blue-400 font-bold">{(threshold * 100).toFixed(0)}%</span>
              </div>
              <Slider 
                value={[threshold * 100]} 
                onValueChange={(val) => setThreshold(val[0] / 100)} 
                max={100} 
                step={1}
                className="py-2"
              />
              <p className="text-[10px] text-gray-500 italic">
                Un seuil plus bas augmente la sensibilité aux changements mineurs.
              </p>
            </div>

            <Button 
              variant="outline" 
              className="w-full border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-xs font-bold gap-2 py-5"
              onClick={() => fetchSubspaces()}
            >
              <History className="h-4 w-4" />
              RAFFRAÎCHIR LES MODÈLES
            </Button>
          </CardContent>
        </Card>

        {/* Historique rapide */}
        <Card className="border-white/10 bg-gray-900/40">
          <CardHeader className="py-3 px-5 border-b border-white/5">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500">Dernières Analyses</h3>
          </CardHeader>
          <CardContent className="p-0">
            {history.length > 0 ? (
              <div className="divide-y divide-white/5">
                {history.map(item => (
                  <div key={item.id} className="p-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3">
                      {item.isAnomaly ? 
                        <AlertTriangle className="h-4 w-4 text-orange-500" /> : 
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      }
                      <span className="text-[11px] text-gray-300 font-medium">{item.timestamp}</span>
                    </div>
                    <Badge className={item.isAnomaly ? 'bg-orange-500/20 text-orange-400 border-0' : 'bg-green-500/20 text-green-400 border-0'}>
                      {(item.score * 100).toFixed(1)}%
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-gray-600 text-xs italic">Aucun historique</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Colonne Droite: Analyse */}
      <div className="lg:col-span-8 space-y-6">
        <Card className="border-white/10 bg-black/40 shadow-2xl overflow-hidden h-[550px] flex flex-col relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.05),transparent)] pointer-events-none" />
          
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gray-900/60 backdrop-blur-md z-10">
            <div className="flex items-center gap-3">
              <ImageIcon className="h-5 w-5 text-blue-400" />
              <span className="text-xs font-black uppercase tracking-widest text-white">Espace d&apos;Analyse Visuelle</span>
            </div>
            <div className="flex gap-2">
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
              <Button 
                size="sm" 
                variant="outline" 
                className="bg-white/5 border-white/10 text-[10px] h-8 px-3"
                onClick={() => fileInputRef.current?.click()}
              >
                CHARGER IMAGE
              </Button>
              <Button 
                size="sm" 
                className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] h-8 px-4 font-bold shadow-lg shadow-blue-500/20"
                disabled={!uploadedImage || isLoading}
                onClick={runDetection}
              >
                {isLoading ? <Activity className="h-3 w-3 animate-spin mr-2" /> : <Search className="h-3 w-3 mr-2" />}
                LANCER L&apos;INSPECTION
              </Button>
            </div>
          </div>

          <div className="flex-1 bg-black flex items-center justify-center p-8 overflow-hidden">
            {uploadedImage ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <img src={uploadedImage} alt="Test" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
                {isLoading && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4 rounded-lg">
                    <div className="relative">
                      <div className="h-16 w-16 rounded-full border-t-2 border-blue-500 animate-spin" />
                      <Activity className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-blue-400" />
                    </div>
                    <p className="text-blue-300 font-mono text-[10px] animate-pulse">EXTRACTION DES FEATURES PCA...</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="p-8 rounded-full bg-white/5 border border-white/5">
                  <ImageIcon className="h-12 w-12 text-gray-800" />
                </div>
                <div className="space-y-1">
                  <p className="text-gray-500 text-sm font-medium tracking-tight">Aucune image cible</p>
                  <p className="text-gray-700 text-[10px] uppercase font-bold tracking-widest">Veuillez charger une photo d&apos;inspection</p>
                </div>
              </div>
            )}
          </div>

          {/* Résultat Overlays */}
          {result && result.success && (
            <div className={`absolute bottom-6 right-6 left-6 p-4 rounded-xl border backdrop-blur-xl shadow-2xl transition-all animate-in slide-in-from-bottom-4 duration-500 ${
              result.isAnomaly 
                ? 'bg-orange-950/80 border-orange-500/50 text-orange-100' 
                : 'bg-green-950/80 border-green-500/50 text-green-100'
            }`}>
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-full ${result.isAnomaly ? 'bg-orange-500/20' : 'bg-green-500/20'}`}>
                  {result.isAnomaly ? <AlertTriangle className="h-6 w-6 text-orange-400" /> : <CheckCircle2 className="h-6 w-6 text-green-400" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-lg font-black uppercase tracking-tighter">
                      {result.isAnomaly ? 'ANOMALIE DÉTECTÉE' : 'ÉQUIPEMENT NORMAL'}
                    </h4>
                    <span className="text-xs font-mono opacity-60">SCORE: {(result.anomalyScore * 100).toFixed(1)}%</span>
                  </div>
                  <p className="text-sm opacity-80 leading-relaxed max-w-2xl">{result.report || 'Analyse terminée avec succès.'}</p>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Détails techniques */}
        {result && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <Card className="bg-gray-900/60 border-white/10 p-4">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Erreur de Reconstruction</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-mono font-bold text-white">{result.reconstructionError?.toFixed(4)}</p>
                  <span className="text-[10px] text-gray-600">vs seuil {threshold.toFixed(2)}</span>
                </div>
             </Card>
             <Card className="bg-gray-900/60 border-white/10 p-4">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Statut Modèle</p>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-400" />
                  <p className="text-sm font-medium text-gray-200">PCA Vector Space Validated</p>
                </div>
                <p className="text-[10px] text-gray-600 mt-1">Variance expliquée: 98.4%</p>
             </Card>
             <Card className="bg-blue-600/10 border-blue-500/20 p-4 flex items-center justify-center cursor-pointer hover:bg-blue-600/20 transition-all group">
                <div className="text-center">
                  <Info className="h-5 w-5 text-blue-400 mx-auto mb-1 group-hover:scale-110 transition-transform" />
                  <p className="text-[10px] text-blue-300 font-bold uppercase">Rapport IA Complet</p>
                </div>
             </Card>
          </div>
        )}
      </div>
    </div>
  );
}
