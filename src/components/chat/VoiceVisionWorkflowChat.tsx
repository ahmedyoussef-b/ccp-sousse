'use client';

import React, { useRef, useEffect } from 'react';
import { useVoiceVisionWorkflow } from '@/hooks/useVoiceVisionWorkflow';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Mic, 
  MicOff, 
  Camera, 
  Upload, 
  Layers, 
  Play, 
  RotateCcw, 
  Check, 
  AlertCircle, 
  Image as ImageIcon, 
  ChevronRight, 
  HelpCircle,
  Cpu
} from 'lucide-react';

export function VoiceVisionWorkflowChat() {
  const workflow = useVoiceVisionWorkflow();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Synchronisation du flux de la caméra
  useEffect(() => {
    if (videoRef.current && workflow.camera.stream) {
      videoRef.current.srcObject = workflow.camera.stream;
    }
  }, [workflow.camera.stream, workflow.step]);

  // Scroll automatique au bas des messages
  useEffect(() => {
    const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [workflow.messages]);

  // Capture de l'image caméra
  const handleCapture = () => {
    if (videoRef.current) {
      const screenshot = workflow.camera.takeScreenshot(videoRef.current);
      if (screenshot) {
        workflow.camera.captureImage(screenshot);
        workflow.handleImageLoaded(screenshot);
      }
    }
  };

  // Upload manuel de fichier
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          workflow.handleImageLoaded(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 max-w-7xl mx-auto bg-slate-950 text-slate-100 rounded-3xl border border-slate-800/80 shadow-2xl overflow-hidden backdrop-blur-xl">
      {/* Colonne gauche : Le chat vocal interactif */}
      <Card className="lg:col-span-7 bg-slate-900/60 border-slate-800/80 rounded-2xl shadow-xl flex flex-col h-[680px]">
        <CardHeader className="border-b border-slate-800/60 pb-4 bg-slate-900/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`absolute -inset-1 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 blur opacity-60 ${workflow.voiceRecognition.isListening ? 'animate-pulse' : ''}`}></div>
                <div className="relative bg-slate-950 p-2.5 rounded-full border border-slate-800">
                  <Mic className={`w-5 h-5 text-cyan-400 ${workflow.voiceRecognition.isListening ? 'animate-bounce' : ''}`} />
                </div>
              </div>
              <div>
                <CardTitle className="text-lg font-bold tracking-wide bg-gradient-to-r from-cyan-400 to-indigo-300 bg-clip-text text-transparent">
                  Interface Vocale CCP
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  {workflow.voiceRecognition.isListening ? 'À l\'écoute...' : 'Cliquez sur le micro pour parler'}
                </CardDescription>
              </div>
            </div>
            
            <Badge variant="outline" className="bg-slate-950/80 border-cyan-500/30 text-cyan-300 text-xs px-2.5 py-1">
              Étape : {workflow.step}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-4 overflow-hidden">
          {/* Zone des messages */}
          <ScrollArea ref={scrollAreaRef} className="flex-1 pr-3">
            <div className="space-y-4 pb-4">
              {workflow.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-3 duration-250`}
                >
                  <div
                    className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-md ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-cyan-600 to-indigo-600 text-white rounded-tr-none border border-cyan-500/20'
                        : 'bg-slate-900/90 border border-slate-800/80 text-slate-200 rounded-tl-none'
                    }`}
                  >
                    <div className="font-semibold text-xs opacity-65 mb-1">
                      {msg.role === 'user' ? 'Vous' : 'IA Vocale'}
                    </div>
                    <div>{msg.content}</div>
                  </div>
                </div>
              ))}
              
              {workflow.isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-slate-900/50 border border-slate-800 text-slate-400 text-xs p-3 rounded-2xl rounded-tl-none animate-pulse">
                    Traitement intelligent en cours...
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Onde sonore & Boutons vocaux */}
          <div className="mt-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800/60 flex items-center justify-between gap-4">
            <div className="flex-1">
              {workflow.voiceRecognition.isListening ? (
                <div className="flex items-center gap-1.5 h-6">
                  {[...Array(6)].map((_, i) => (
                    <span 
                      key={i} 
                      className="w-1 bg-cyan-400 rounded-full animate-pulse" 
                      style={{ 
                        height: `${Math.random() * 100}%`,
                        animationDelay: `${i * 100}ms`
                      }} 
                    />
                  ))}
                  <span className="text-xs text-cyan-400 font-medium ml-2 animate-pulse">
                    Enregistrement de votre commande...
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-500">
                  Dites « On va prendre une image » ou cliquez sur le bouton.
                </span>
              )}
            </div>

            <div className="flex gap-2">
              {workflow.voiceRecognition.isListening ? (
                <Button
                  onClick={() => workflow.voiceRecognition.stopListening()}
                  size="sm"
                  variant="destructive"
                  className="rounded-full flex items-center gap-2"
                >
                  <MicOff className="w-4 h-4" /> Arrêter
                </Button>
              ) : (
                <Button
                  onClick={() => workflow.voiceRecognition.startListening()}
                  size="sm"
                  className="bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-600 hover:to-indigo-600 text-white rounded-full flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                >
                  <Mic className="w-4 h-4" /> Parler
                </Button>
              )}
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => workflow.processSpeechInput("On va prendre une image")}
                className="text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-900 rounded-full"
              >
                Simuler Déclenchement
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Colonne droite : Caméra, Image et Choix interactifs */}
      <Card className="lg:col-span-5 bg-slate-900/60 border-slate-800/80 rounded-2xl shadow-xl flex flex-col h-[680px]">
        <CardHeader className="border-b border-slate-800/60 bg-slate-900/30">
          <CardTitle className="text-base font-bold text-slate-200 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            Périphériques & Actions
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Gestion caméra, upload de fichiers et attachements
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-5 justify-between overflow-y-auto">
          {/* Étape : Caméra active */}
          {workflow.step === 'CAMERA_ACTIVE' && (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden aspect-video border border-slate-800 bg-black flex items-center justify-center">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 bg-red-600 text-white px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider animate-pulse">
                  Live Cam
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={handleCapture}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-medium gap-2"
                >
                  <Camera className="w-4 h-4" /> Prendre la photo
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => workflow.setStep('IDLE')}
                  className="border-slate-850 hover:bg-slate-900 text-slate-300"
                >
                  Annuler
                </Button>
              </div>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-800"></div>
                <span className="flex-shrink mx-4 text-slate-500 text-xs">OU</span>
                <div className="flex-grow border-t border-slate-800"></div>
              </div>

              <div className="flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl p-4 hover:bg-slate-900/40 transition-colors">
                <Upload className="w-8 h-8 text-slate-500 mb-2" />
                <label className="text-xs text-cyan-400 font-medium cursor-pointer hover:underline">
                  Sélectionner un fichier local
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                </label>
                <span className="text-[10px] text-slate-500 mt-1">PNG, JPG jusqu'à 5Mo</span>
              </div>
            </div>
          )}

          {/* Étape : Choix du Mode */}
          {workflow.step === 'CHOOSE_MODE' && (
            <div className="space-y-4">
              <div className="text-center p-4">
                <ImageIcon className="w-12 h-12 text-indigo-400 mx-auto mb-2" />
                <h3 className="font-semibold text-slate-200">Image prête à l'utilisation</h3>
                <p className="text-xs text-slate-500 mt-1">Choisissez le type de traitement ou de classement requis</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => workflow.processSpeechInput("mode implantation")}
                  className="h-24 flex flex-col justify-center gap-2 bg-gradient-to-br from-cyan-950 to-indigo-950 border border-cyan-800/40 hover:border-cyan-500/60 rounded-xl"
                >
                  <Layers className="w-5 h-5 text-cyan-400" />
                  <span className="font-semibold text-sm">Mode Implantation</span>
                </Button>

                <Button
                  onClick={() => workflow.processSpeechInput("mode application")}
                  className="h-24 flex flex-col justify-center gap-2 bg-gradient-to-br from-indigo-950 to-purple-950 border border-indigo-800/40 hover:border-indigo-500/60 rounded-xl"
                >
                  <Cpu className="w-5 h-5 text-indigo-400" />
                  <span className="font-semibold text-sm">Mode Application</span>
                </Button>
              </div>
            </div>
          )}

          {/* Étape : Mode Implantation - Choix Globale / Simple */}
          {workflow.step === 'IMPLANTATION_TYPE' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Classement Implantation</h3>
              <p className="text-xs text-slate-500">Choisissez si cette image est une vue globale (pupitre complet) ou simple (bouton, pièce de terrain).</p>
              
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => workflow.processSpeechInput("globale")}
                  variant="outline"
                  className="h-12 justify-between border-slate-800 hover:bg-slate-900/60"
                >
                  <span className="font-semibold text-sm">Image Globale (Vue d'ensemble)</span>
                  <ChevronRight className="w-4 h-4 text-cyan-400" />
                </Button>

                <Button
                  onClick={() => workflow.processSpeechInput("simple")}
                  variant="outline"
                  className="h-12 justify-between border-slate-800 hover:bg-slate-900/60"
                >
                  <span className="font-semibold text-sm">Image Simple (Détail/Organe terrain)</span>
                  <ChevronRight className="w-4 h-4 text-indigo-400" />
                </Button>
              </div>
            </div>
          )}

          {/* Étape : Mode Implantation - Vérification similarité globale */}
          {workflow.step === 'IMPLANTATION_GLOBALE_CHECK' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Audit de Similarité Vectorielle</h3>
              
              {workflow.similarImageFound ? (
                <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-yellow-300 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <AlertCircle className="w-4 h-4 text-yellow-400" /> Image existante détectée !
                  </div>
                  <p>Une correspondance de 92% a été trouvée dans la collection de base.</p>
                  <div className="flex items-center gap-3 p-2 bg-slate-950/80 rounded border border-slate-800 mt-1">
                    <img src={workflow.similarImageFound.url} className="w-12 h-12 object-cover rounded" />
                    <span>{workflow.similarImageFound.title}</span>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-300 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <Check className="w-4 h-4 text-emerald-400" /> Unique et nouvelle globale !
                  </div>
                  <p>Aucun doublon trouvé. Sauvegarde en cours dans la base de données SQLite de la banque d'images.</p>
                </div>
              )}

              <Button
                onClick={() => workflow.setStep('IDLE')}
                className="w-full bg-slate-900 border border-slate-850 hover:bg-slate-950 text-slate-200"
              >
                Terminer le flux
              </Button>
            </div>
          )}

          {/* Étape : Mode Implantation - Attachement hiérarchique simple */}
          {workflow.step === 'IMPLANTATION_SIMPLE_ATTACH' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Sélectionner l'Image Globale Hôte</h3>
              <p className="text-xs text-slate-500">Associez votre pièce de terrain (image simple) à son pupitre de commande parent (image globale).</p>
              
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {workflow.availableGlobalImages.map((img) => (
                  <div
                    key={img.id}
                    onClick={() => {
                      workflow.setSelectedGlobalImage(img.id);
                      workflow.addMessageAndSpeak('assistant', `Attachement effectué avec succès ! L'image simple a été liée à : ${img.title}`);
                      workflow.setStep('IDLE');
                    }}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      workflow.selectedGlobalImage === img.id
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-slate-800 bg-slate-900/40 hover:bg-slate-900'
                    }`}
                  >
                    <img src={img.url} className="w-10 h-10 object-cover rounded" />
                    <div className="text-xs font-semibold text-slate-200">{img.title}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Étape : Mode Application - Menu des fonctions métier */}
          {workflow.step === 'APPLICATION_MENU' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Actions Applicatives disponibles</h3>
              <p className="text-xs text-slate-500">L'IA a détecté plusieurs traitements applicables à ce type d'équipement.</p>
              
              <div className="grid grid-cols-1 gap-2">
                {[
                  { key: 'rag', label: 'Recherche de documents techniques (RAG)' },
                  { key: 'anomalie', label: 'Détection d\'anomalie zero-shot' },
                  { key: 'caractéristique', label: 'Extraction automatique de caractéristiques' }
                ].map((act) => (
                  <Button
                    key={act.key}
                    onClick={() => workflow.processSpeechInput(act.key)}
                    variant="outline"
                    className="h-10 justify-start border-slate-800 hover:bg-slate-900 text-left text-xs gap-3"
                  >
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    {act.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* État initial / inactif */}
          {workflow.step === 'IDLE' && (
            <div className="text-center p-8 rounded-2xl bg-slate-900/30 border border-slate-850 flex flex-col items-center justify-center">
              <HelpCircle className="w-10 h-10 text-slate-600 mb-2 animate-bounce" />
              <h4 className="font-semibold text-slate-400 text-sm">Système prêt</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-[240px] mx-auto">Dites « On va prendre une image » ou cliquez sur le micro à gauche pour démarrer.</p>
            </div>
          )}

          {/* Visualisation de l'image actuellement chargée */}
          {workflow.uploadedImage && (
            <div className="mt-4 p-3 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center gap-3">
              <img 
                src={workflow.uploadedImage} 
                alt="Uploaded" 
                className="w-14 h-14 object-cover rounded-lg border border-slate-700"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-200 truncate">Image active</div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                  <Badge variant="outline" className="text-[8px] bg-indigo-950/60 text-indigo-400 border-indigo-500/20 px-1 py-0">
                    Chargée
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  workflow.setUploadedImage(null);
                  workflow.setStep('IDLE');
                }}
                className="text-red-400 hover:text-red-300 p-1 hover:bg-red-500/10"
              >
                Supprimer
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
