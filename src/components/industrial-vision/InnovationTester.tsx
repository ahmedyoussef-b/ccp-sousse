// src/components/industrial-vision/InnovationTester.tsx

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Cpu,
  CheckCircle2,
  Loader2,
  TerminalSquare,
  Play,
  AlertTriangle,
  Wifi,
  Maximize2,
  Upload
} from 'lucide-react';
import { Innovation } from '@/lib/industrial-vision/types/industrial.types';
import { ZeroShotTester } from './innovations/ZeroShotTester';
import { HybridSearchTester } from './innovations/HybridSearchTester';
import { PanoramicStitchingTester } from './innovations/PanoramicStitchingTester';
import { FewShotTrainerTester } from './innovations/FewShotTrainerTester';
import { DualConsensusTester } from './innovations/DualConsensusTester';

interface TestMessage {
  id: string;
  role: 'user' | 'system' | 'result' | 'error';
  content: string;
  timestamp: Date;
  visualData?: any;
}

interface InnovationTesterProps {
  innovation: Innovation;
  innovationCode?: string;
  innovationExample?: string;
}

const QUICK_PROMPTS: Record<number, string[]> = {
  1: ["Où est le CONDENSEUR ?", "Localiser le CIRCUIT HP", "Trouver le BALLON PURGES"],
  2: ["Quelles familles d'organes détectes-tu ?", "Organes proches du CONDENSEUR", "Regrouper par zone fonctionnelle"],
  3: ["Générer la signature spatiale", "Calculer la similarité avec la référence"],
  4: ["Créer les zones Voronoï", "Segmenter l'image par organe"],
  5: ["Trouver l'organe qui refroidit", "Qu'est ce qui régule la pression ?", "Chercher les vannes"],
  6: ["Y a-t-il des anomalies ?", "Comparer avec le golden standard", "Organes manquants ou en trop ?"],
  7: ["Décrire ce schéma industriel", "Générer l'alt text complet"],
  8: ["Quels organes sont manquants ?", "Vérifier la complétude du schéma"],
  9: ["Générer la carte interactive", "Cartographier toutes les zones cliquables"],
  10: ["Comparer les versions disponibles", "Détecter les changements sémantiques"],
  11: ["Détecter les redondances fonctionnelles", "Y a-t-il des organes en double ?"],
  12: ["Construire la hiérarchie fonctionnelle", "Arbre de décomposition des organes"],
  13: ["Détecter les motifs répétés", "Y a-t-il des alignements d'organes ?"],
  14: ["Inférer la direction des flux", "Quel est le sens de circulation ?"],
  15: ["Identifier les points d'ancrage", "Quels organes sont des références fixes ?"],
  16: ["Extraire les contraintes topologiques", "Règles implicites du schéma ?"],
  17: ["Reconstituer la profondeur 2.5D", "Quels organes sont en arrière-plan ?"],
  18: ["Détecter les organes fantômes", "Zones sans étiquette ?"],
  19: ["Calculer la charge cognitive", "Quelle est la densité du schéma ?"],
  20: ["Générer un quiz sur ce schéma", "Créer des questions de compréhension"],
  21: ["Identifier la stylométrie", "Qui a dessiné ce schéma ?"],
  22: ["Prédire l'ordre de lecture", "Quel est le parcours visuel naturel ?"],
  23: ["Détecter les contre-sens techniques", "Y a-t-il des erreurs de conception ?"],
  24: ["Comprimer sémantiquement", "Quels sont les 5 concepts clés ?"],
  25: ["Calculer l'échelle métrologique", "Quelle est la résolution réelle ?"],
  26: ["Analyser la criticité des organes", "Quels sont les points vulnérables ?"],
  27: ["Mesurer la distance d'édition", "Similarité structurelle avec la référence ?"],
  28: ["Générer la légende numérotée", "Créer la liste des organes indexés"],
  29: ["Détecter les boucles de circuit", "Y a-t-il des cycles redondants ?"],
  30: ["Estimer l'époque du schéma", "Quel est le style graphique ?"],
  31: ["État actuel de tous les voyants", "Y a-t-il des alarmes actives ?"],
  32: ["Lire toutes les mesures cadrans", "Quelle est la pression actuelle ?"],
  33: ["Vérifier cohérence voyants/mesures", "Incohérences détectées ?"],
  34: ["Analyser la tendance des mesures", "Prévoir l'évolution"],
  35: ["Détecter des cycles anormaux", "Y a-t-il une séquence répétée ?"],
  36: ["Corréler les capteurs", "Quels organes s'influencent ?"],
  37: ["Détecter une dérive lente", "Surveillance de dégradation"],
  38: ["Générer la timeline interactive", "Historique des événements"],
  39: ["Générer le rapport d'incident", "Documenter l'état actuel"],
  40: ["Générer le dashboard temps réel", "Vue de supervision globale"],
};

function getQuickPrompts(innovation: Innovation): string[] {
  return QUICK_PROMPTS[innovation.id] || [
    `Exécuter l'innovation ${innovation.name}`,
    `Analyser avec l'innovation #${innovation.id}`,
  ];
}

function renderMarkdown(text: string): React.ReactElement[] {
  return text.split('\n').map((line, i) => {
    const parsed = line
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-white/10 px-1 py-0.5 rounded text-xs font-mono text-cyan-300">$1</code>');
    return (
      <span
        key={i}
        className="block"
        dangerouslySetInnerHTML={{ __html: parsed || '&nbsp;' }}
      />
    );
  });
}

export function InnovationTester({ innovation }: InnovationTesterProps) {
  const [messages, setMessages] = useState<TestMessage[]>([
    {
      id: 'init',
      role: 'system',
      content: `Module **#${innovation.id} — ${innovation.name}** connecté au moteur IA.\n\nDonnées requises : **${innovation.requiresData.join(', ')}**\nCatégories : ${innovation.categories.join(', ')}\n\n💡 Posez une question technique, ou **téléchargez un plan/image** pour une analyse spécifique.`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeVisual, setActiveVisual] = useState<any>(null);
  const [hoveredOrgane, setHoveredOrgane] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setUploadedImage(base64);
      setActiveVisual({
        imagePath: base64,
        imageFilename: file.name,
        organes: [],
        status: 'pending'
      });
      
      setMessages(prev => [...prev, {
        id: `upload-${Date.now()}`,
        role: 'system',
        content: `📷 Image **${file.name}** chargée. Prête pour l'analyse par l'innovation #${innovation.id}.`,
        timestamp: new Date()
      }]);
    };
    reader.readAsDataURL(file);
  };

  const runQuery = async (query: string) => {
    if (!query.trim() || isLoading) return;

    const userMsg: TestMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/industrial-vision/innovations/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          innovationId: innovation.id,
          innovationName: innovation.name,
          query,
          imageContext: uploadedImage
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`,
          role: 'error',
          content: `❌ Erreur : ${data.error || 'Impossible d\'exécuter l\'innovation.'}`,
          timestamp: new Date(),
          visualData: data.visualData // Ajouter visualData ici aussi
        }]);
        if (data.visualData) setActiveVisual(data.visualData); // Toujours mettre à jour si présent
      } else {
        setMessages(prev => [...prev, {
          id: `result-${Date.now()}`,
          role: 'result',
          content: data.result,
          timestamp: new Date(),
          visualData: data.visualData
        }]);
        if (data.visualData) setActiveVisual(data.visualData);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'error',
        content: `❌ Erreur réseau : ${err.message}.`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const selectVisual = (visual: any) => {
    setActiveVisual(visual);
  };

  const renderMessage = (msg: TestMessage) => {
    const isUser = msg.role === 'user';
    const isResult = msg.role === 'result';
    const isError = msg.role === 'error';

    return (
      <div
        key={msg.id}
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
      >
        {!isUser && (
          <div className={`h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center mr-2 mt-0.5 ${
            isResult ? 'bg-green-500/20 text-green-400' :
            isError ? 'bg-red-500/20 text-red-400' :
            'bg-blue-500/20 text-blue-400'
          }`}>
            {isResult ? <CheckCircle2 className="h-4 w-4" /> :
             isError ? <AlertTriangle className="h-4 w-4" /> :
             <Cpu className="h-4 w-4" />}
          </div>
        )}
        <div className={`max-w-[88%] rounded-xl px-4 py-3 text-sm leading-relaxed cursor-pointer transition-colors ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-none'
            : isResult
              ? 'bg-gray-800/90 border border-green-500/30 text-gray-100 rounded-bl-none hover:bg-gray-800'
              : isError
                ? 'bg-red-900/30 border border-red-500/30 text-red-200 rounded-bl-none'
                : 'bg-gray-800/50 border border-white/10 text-gray-300 rounded-bl-none'
        }`}
        onClick={() => msg.visualData && selectVisual(msg.visualData)}
        >
          <div className="space-y-0.5">
            {renderMarkdown(msg.content)}
          </div>
          {msg.visualData && (
            <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2 text-[10px] text-cyan-400 font-medium">
              <Maximize2 className="h-3 w-3" /> Cliquer pour voir l&apos;analyse visuelle
            </div>
          )}
          <p className="text-[10px] opacity-40 mt-2">
            {msg.timestamp.toLocaleTimeString()}
          </p>
        </div>
      </div>
    );
  };

  const quickPrompts = getQuickPrompts(innovation);

  // Rendu spécialisé selon l'ID de l'innovation
  if (innovation.id === 6) return <ZeroShotTester innovation={innovation} />;
  if (innovation.id === 5) return <HybridSearchTester innovation={innovation} />;
  if (innovation.id === 8) return <FewShotTrainerTester innovation={innovation} />;
  if (innovation.id === 33) return <DualConsensusTester innovation={innovation} />;
  if (innovation.id === 7) return <PanoramicStitchingTester innovation={innovation} />;
  if (innovation.id === 40) return <div className="p-12 text-center text-gray-500">Dashboard temps réel en cours de développement...</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*"
        onChange={handleFileUpload}
      />
      
      <Card className="lg:col-span-2 border border-white/10 bg-gray-900/90 shadow-xl overflow-hidden flex flex-col h-[650px]">
        <CardHeader className="bg-gradient-to-r from-indigo-950 to-blue-950 border-b border-white/10 py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm text-white font-bold uppercase tracking-wider">
              <TerminalSquare className="h-4 w-4 text-cyan-400" />
              IA Terminal — #{innovation.id}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 px-2 text-[10px] text-gray-400 hover:text-white bg-white/5 hover:bg-white/10"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3 w-3 mr-1" /> UPLOAD
              </Button>
              <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
          <ScrollArea className="flex-1 px-4 pt-4">
            <div className="pb-4">
              {messages.map(renderMessage)}
              {isLoading && (
                <div className="flex justify-start mb-3">
                  <div className="h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center mr-2 bg-blue-500/20 text-blue-400 border border-blue-500/20">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                  <div className="bg-gray-800/50 border border-white/10 rounded-xl rounded-bl-none px-4 py-3">
                    <div className="flex items-center gap-3 text-xs text-blue-300/80">
                      <div className="flex gap-1">
                        <span className="h-1.5 w-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 bg-blue-400 rounded-full animate-bounce" />
                      </div>
                      <span className="font-medium">Analyse en cours...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={scrollEndRef} />
            </div>
          </ScrollArea>

          <div className="border-t border-white/10 bg-black/20 p-4 space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {quickPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => runQuery(prompt)}
                  disabled={isLoading}
                  className="text-[10px] px-2.5 py-1 rounded-md bg-white/5 hover:bg-blue-600/30 border border-white/10 hover:border-blue-500/50 text-gray-400 hover:text-white transition-all disabled:opacity-40"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && runQuery(input)}
                placeholder="Posez votre question technique..."
                disabled={isLoading}
                className="bg-black/50 border-white/10 text-white h-11"
              />
              <Button
                onClick={() => runQuery(input)}
                disabled={isLoading || !input.trim()}
                className="bg-blue-600 hover:bg-blue-500 text-white h-11 px-4 shadow-lg"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3 border border-white/10 bg-gray-950/90 shadow-2xl overflow-hidden flex flex-col h-[650px] relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(30,58,138,0.1),transparent)] pointer-events-none" />
        
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
          <Badge className="bg-black/60 backdrop-blur-md border-white/20 text-cyan-400 py-1 px-3 flex items-center gap-2">
            <Maximize2 className="h-3 w-3" />
            <span className="text-[10px] font-bold tracking-widest uppercase">Live Vision Analytics</span>
          </Badge>
          {activeVisual && (
            <Badge className="bg-blue-600/80 backdrop-blur-md border-0 text-white py-1 px-3 text-[10px]">
              {activeVisual.imageFilename}
            </Badge>
          )}
        </div>

        <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center p-4">
          {activeVisual ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <img 
                src={activeVisual.imagePath} 
                alt="Vision industrielle"
                className="max-w-full max-h-full object-contain rounded-sm shadow-2xl"
              />
              
              <svg 
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 800 600"
                preserveAspectRatio="xMidYMid meet"
              >
                {activeVisual.organes?.map((o: any, idx: number) => {
                  const [x1, y1, x2, y2] = o.bbox;
                  const isHovered = hoveredOrgane === o.nom;
                  return (
                    <g key={idx} className="pointer-events-auto cursor-help"
                       onMouseEnter={() => setHoveredOrgane(o.nom)}
                       onMouseLeave={() => setHoveredOrgane(null)}>
                      <rect 
                        x={x1} y={y1} width={x2 - x1} height={y2 - y1}
                        fill={isHovered ? 'rgba(34, 211, 238, 0.3)' : 'rgba(34, 211, 238, 0.05)'}
                        stroke={isHovered ? '#22d3ee' : 'rgba(34, 211, 238, 0.5)'}
                        strokeWidth={isHovered ? 3 : 1.5}
                        className="transition-all duration-150"
                      />
                      {isHovered && (
                        <g>
                          <rect 
                            x={x1} y={y1 - 25} width={Math.max(80, o.nom.length * 8 + 30)} height={22}
                            fill="#22d3ee" rx={4}
                          />
                          <text 
                            x={x1 + 8} y={y1 - 10} 
                            fill="black" fontSize="11" fontWeight="900"
                          >
                            {o.nom} ({(o.confiance * 100).toFixed(0)}%)
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                <Wifi className="h-10 w-10 text-gray-800 animate-pulse" />
              </div>
              <p className="text-gray-500 font-medium font-mono text-xs uppercase tracking-tighter">Flux vidéo/image inactif</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="border-white/10 bg-white/5 text-[10px]"
                onClick={() => fileInputRef.current?.click()}
              >
                CHARGER UN PLAN
              </Button>
            </div>
          )}
        </div>

        {activeVisual && (
          <div className="bg-black/60 border-t border-white/10 p-5 backdrop-blur-md">
            <div className="grid grid-cols-4 gap-6">
              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Organes</p>
                <p className="text-sm text-gray-100 font-black tracking-tight">{activeVisual.organes?.length || 0} DÉTECTÉS</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">État</p>
                <p className="text-sm text-cyan-400 font-black uppercase tracking-tight">{activeVisual.similarity?.bestMatch || 'NOMINAL'}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Confiance</p>
                <p className={`text-sm ${activeVisual.similarity?.confidence >= 0.999 ? 'text-green-400 animate-pulse' : 'text-blue-400'} font-black tracking-tight`}>
                  {(activeVisual.similarity?.confidence * 100).toFixed(1)}%
                </p>
              </div>
              <div className="flex items-center justify-end">
                <Button variant="outline" size="sm" className="h-8 border-white/10 bg-white/5 text-[10px] hover:bg-blue-600 transition-colors">
                  DÉTAILS
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}