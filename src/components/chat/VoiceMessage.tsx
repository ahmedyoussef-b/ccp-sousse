'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Edit3, 
  Check, 
  X, 
  AlertTriangle, 
  ShieldCheck, 
  ThumbsUp, 
  ThumbsDown,
  Target
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useVoice } from '@/hooks/useVoice';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

interface VoiceMessageProps {
  text: string;
  role: 'user' | 'ai';
  messageId?: string;  // Correction 1: Rendre optionnel car non utilisé
  autoPlay?: boolean;
}

export default function VoiceMessage({ text, role, autoPlay }: VoiceMessageProps) {  // Correction 2: Supprimer messageId des paramètres
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [metadata, setMetadata] = useState<any>(null);
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false);
  const autoPlayTriggered = useRef(false);
  const [feedbackGiven, setFeedbackGiven] = useState<'up' | 'down' | null>(null);
  const { toast } = useToast();
  const { play, pause, stop, isPlaying, currentText } = useVoice();

  useEffect(() => {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        setMetadata(parsed);
      }
    } catch (e) {
      // Pas du JSON, comportement normal
    }
  }, [text]);

  const displayText = metadata ? (metadata.answer || metadata.text || text) : text;

  useEffect(() => {
    if (autoPlay && role === 'ai' && !isPlaying && !hasAutoPlayed && !autoPlayTriggered.current) {
      autoPlayTriggered.current = true;
      setHasAutoPlayed(true);
      handlePlay();
    }
  }, [autoPlay, role, isPlaying, hasAutoPlayed]);

  const handlePlay = async () => {
    if (isPlaying && currentText === displayText) {
      pause();
    } else {
      await play(displayText);
    }
  };

  const handleStop = () => {
    stop();
  };

  const startEditing = () => {
    setEditedText(displayText);
    setIsEditing(true);
  };

  const handleFeedback = async (type: 'up' | 'down') => {
    setFeedbackGiven(type);
    try {
      await api.submitFeedback(displayText, displayText, type === 'up' ? 5 : 1);
      toast({
        title: type === 'up' ? "Merci !" : "Feedback enregistré",
        description: type === 'up' ? "Votre satisfaction aide l'IA à progresser." : "Nous utiliserons ce signal pour corriger le modèle.",
      });
    } catch (e) {
      console.error("Feedback error", e);
    }
  };

  const submitCorrection = async () => {
    if (!editedText.trim() || editedText === displayText) {
      setIsEditing(false);
      return;
    }

    try {
      await api.submitCorrection(displayText, editedText);
      toast({
        title: "Apprentissage enregistré",
        description: "L'IA utilisera cette correction pour son prochain cycle ML nocturne.",
      });
      setIsEditing(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible d'enregistrer la correction.",
      });
    }
  };

  const isMessagePlaying = isPlaying && currentText === displayText;

  return (
    <div 
      className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} group`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative max-w-[85%] md:max-w-[80%]">
        {role === 'ai' && (
          <div className="absolute -left-10 top-0 w-8 h-8 bg-blue-600/20 rounded-full flex items-center justify-center border border-blue-500/30 shadow-lg shadow-blue-500/10">
            <span className="text-[10px] font-black text-blue-400">AI</span>
          </div>
        )}

        <div className={`
          relative rounded-2xl p-4 md:p-5 shadow-2xl transition-all duration-300
          ${role === 'user' 
            ? 'bg-blue-600 text-white ml-auto border border-blue-500/20' 
            : 'bg-white/10 text-white backdrop-blur-md border border-white/5'
          }
        `}>
          {isEditing ? (
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest flex items-center gap-2">
                <Target className="w-3 h-3" /> Correction ML Directe
              </p>
              <Textarea 
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="bg-black/40 border-white/10 text-white text-sm min-h-[120px] rounded-xl focus-visible:ring-blue-500"
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="h-8 rounded-lg text-gray-400 hover:text-white">
                  <X className="w-4 h-4 mr-1" /> Annuler
                </Button>
                <Button size="sm" onClick={submitCorrection} className="h-8 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold">
                  <Check className="w-4 h-4 mr-1" /> Valider l'Apprentissage
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {role === 'ai' ? (
                <div className="prose prose-invert max-w-none text-sm leading-relaxed font-medium">
                  <ReactMarkdown>{displayText}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap leading-relaxed font-medium">{displayText}</p>
              )}

              {/* Recommendations contextuelles Elite 32 */}
              {role === 'ai' && metadata?.recommendations && metadata.recommendations.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Target className="w-3 h-3" /> Recommandations IA Elite
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {metadata.recommendations.map((rec: any, idx: number) => (
                      <div key={idx} className="bg-blue-600/5 border border-blue-500/10 rounded-xl p-3 hover:bg-blue-600/10 transition-colors cursor-pointer group/rec">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-white">{rec.title}</span>
                          <Badge className="bg-blue-600/20 text-blue-400 border-none text-[8px] px-1.5 h-4 font-black">{Math.round(rec.score * 100)}% Match</Badge>
                        </div>
                        <p className="text-[9px] text-gray-400 leading-tight line-clamp-1">{rec.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disclaimer de Méta-cognition */}
              {metadata?.disclaimer && (
                <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl animate-in fade-in duration-500">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] md:text-xs text-yellow-200/80 leading-relaxed italic font-bold">
                    {metadata.disclaimer}
                  </p>
                </div>
              )}

              {/* Barre d'outils et Confiance */}
              {role === 'ai' && (
                <div className="flex items-center justify-between pt-2 mt-2 border-t border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className={`w-3 h-3 ${metadata?.confidence > 0.7 ? 'text-green-500' : 'text-yellow-500'}`} />
                      <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Fiabilité {Math.round((metadata?.confidence || 0.75) * 100)}%</span>
                    </div>
                    
                    {/* Feedback explicite (Phase 6) */}
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleFeedback('up')}
                        className={`h-6 w-6 rounded-md transition-colors ${feedbackGiven === 'up' ? 'text-green-500 bg-green-500/10' : 'text-gray-500 hover:text-green-400 hover:bg-white/5'}`}
                      >
                        <ThumbsUp className="w-3 h-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleFeedback('down')}
                        className={`h-6 w-6 rounded-md transition-colors ${feedbackGiven === 'down' ? 'text-red-500 bg-red-500/10' : 'text-gray-500 hover:text-red-400 hover:bg-white/5'}`}
                      >
                        <ThumbsDown className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  
                  {metadata?.pedagogicalLevel && (
                    <Badge variant="outline" className="text-[8px] font-black border-white/10 text-blue-400 px-2 py-0 h-4 uppercase">Niveau: {metadata.pedagogicalLevel}</Badge>
                  )}
                </div>
              )}
            </div>
          )}

          {role === 'ai' && !isEditing && (
            <div className={`
              absolute -right-12 top-0 flex flex-col gap-2
              transition-all duration-300
              ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}
            `}>
              <button
                onClick={isMessagePlaying ? handleStop : handlePlay}
                className="w-8 h-8 bg-[#2f2f2f] border border-white/10 rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors shadow-xl"
                title={isMessagePlaying ? 'Arrêter' : 'Lire'}
              >
                {isMessagePlaying ? (
                  <Pause className="w-3.5 h-3.5 text-white" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-white pl-0.5" />
                )}
              </button>
              <button
                onClick={startEditing}
                className="w-8 h-8 bg-[#2f2f2f] border border-white/10 rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors shadow-xl"
                title="Corriger l'IA (Fine-tuning)"
              >
                <Edit3 className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          )}

          {isMessagePlaying && (
            <div className="absolute -bottom-1 left-4 right-4 h-0.5 bg-blue-500 rounded-full overflow-hidden">
              <div className="w-full h-full bg-blue-400 animate-pulse" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}