'use client';

/**
 * StepByStepGuide - Interface de guidage interactif avec protection contre les erreurs de données.
 */
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, CheckCircle, HelpCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import procedureData from '@/data/procedures/demarrage-chaudiere.json';

interface Procedure {
  procedure: {
    id: string;
    title: string;
    totalSteps: number;
  };
  steps: Etape[];
}

interface Etape {
  number: number;
  title: string;
  instruction: string;
  expectedValue: string;
  verificationMethod: string;
  safetyWarning?: string;
  timeEstimate: string;
}

export default function StepByStepGuide() {
  const [procedure, setProcedure] = useState<Procedure | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [helpResponse, setHelpResponse] = useState<string | null>(null);
  const [isAskingHelp, setIsAskingHelp] = useState(false);

  useEffect(() => {
    loadProcedure();
  }, []);

  const loadProcedure = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const rawData: any = procedureData;
      
      if (!rawData || !rawData.phases || !Array.isArray(rawData.phases)) {
        throw new Error("La structure de la procédure est invalide ou vide.");
      }

      const flatSteps: Etape[] = [];
      rawData.phases.forEach((phase: any) => {
        if (phase.etapes && Array.isArray(phase.etapes)) {
          phase.etapes.forEach((etape: any) => {
            flatSteps.push({
              number: etape.numero,
              title: etape.titre || etape.nom || "Étape",
              instruction: etape.instruction || "Voir la documentation détaillée",
              expectedValue: etape.valeur_attendue ? 
                (typeof etape.valeur_attendue === 'string' ? etape.valeur_attendue : JSON.stringify(etape.valeur_attendue)) 
                : (etape.conditions ? "Conditions multiples" : "N/A"),
              verificationMethod: etape.methode_verification || etape.verification || "Vérification standard",
              safetyWarning: etape.consigne_securite || etape.alerte_securite,
              timeEstimate: etape.duree_estimee || "1 min"
            });
          });
        }
      });

      if (flatSteps.length === 0) {
        throw new Error("Aucune étape trouvée dans la procédure.");
      }

      const data: Procedure = {
        procedure: {
          id: rawData.procedure?.id || "UNKNOWN",
          title: rawData.procedure?.nom || "Procédure sans titre",
          totalSteps: flatSteps.length
        },
        steps: flatSteps
      };
      
      setProcedure(data);
    } catch (err: any) {
      console.error("[PROCEDURE] Load error:", err);
      setError(err.message || "Impossible de charger le fichier de procédure.");
    } finally {
      setLoading(false);
    }
  };

  // Affichage des états de chargement et d'erreur
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-gray-500">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest">Initialisation de la procédure...</p>
      </div>
    );
  }

  if (error || !procedure || !procedure.steps || !procedure.steps[currentStepIdx]) {
    return (
      <div className="p-10 bg-red-500/5 border border-red-500/20 rounded-2xl text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
        <div className="space-y-1">
          <p className="text-sm font-black text-white uppercase tracking-tight">Erreur de chargement</p>
          <p className="text-xs text-red-400 font-medium">{error || "Données de procédure manquantes"}</p>
        </div>
        <Button onClick={loadProcedure} variant="outline" className="border-white/10 text-white hover:bg-white/5 font-bold uppercase text-[10px]">
          Réessayer
        </Button>
      </div>
    );
  }

  const etape = procedure.steps[currentStepIdx];
  const totalSteps = procedure.procedure.totalSteps || procedure.steps.length;
  const progress = ((currentStepIdx + 1) / totalSteps) * 100;

  const handleNext = () => {
    setHelpResponse(null);
    if (currentStepIdx + 1 < totalSteps) {
      setCurrentStepIdx(currentStepIdx + 1);
    } else {
      alert("Félicitations ! La procédure de démarrage est terminée.");
    }
  };

  const askHelp = async () => {
    setIsAskingHelp(true);
    setHelpResponse(null);
    try {
      const response = await fetch('/api/procedure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'help', 
          problem: 'Besoin de précisions techniques supplémentaires', 
          sessionId: 'STABLE_PROCEDURE_SESSION' 
        })
      });
      
      if (!response.ok) {
        throw new Error(`Erreur serveur (${response.status})`);
      }
      
      const data = await response.json();
      setHelpResponse(data.help || "Désolé, aucune aide spécifique n'est disponible pour le moment.");
    } catch (e: any) {
      console.error("[PROCEDURE] Help API error:", e);
      setHelpResponse("Désolé, je n'ai pas pu contacter l'assistant technique local.");
    } finally {
      setIsAskingHelp(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-white uppercase tracking-tight truncate">{procedure.procedure.title}</h2>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Guidage Professionnel Elite</p>
        </div>
        <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/20 shrink-0 font-black">Étape {etape.number}</Badge>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-[10px] font-black uppercase text-gray-500 tracking-widest">
          <span>Progression industrielle</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-1.5 bg-white/5" />
      </div>

      <Card className="bg-white/5 border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <CardContent className="p-6 md:p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black shrink-0 shadow-lg shadow-blue-500/20">
              {etape.number}
            </div>
            <div className="space-y-4 flex-1 min-w-0">
              <h3 className="text-lg md:text-xl font-black text-white leading-tight">{etape.title}</h3>
              <div className="p-4 bg-black/20 rounded-xl border-l-4 border-blue-500">
                <p className="text-sm md:text-base text-gray-200 leading-relaxed italic">"{etape.instruction}"</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-green-500/5 rounded-xl border border-green-500/10">
                  <p className="text-[9px] font-black text-green-500 uppercase tracking-widest mb-1">Valeur attendue</p>
                  <p className="text-sm font-bold text-white">{etape.expectedValue}</p>
                </div>
                <div className="p-3 bg-purple-500/5 rounded-xl border border-purple-500/10">
                  <p className="text-[9px] font-black text-purple-500 uppercase tracking-widest mb-1">Méthode de vérification</p>
                  <p className="text-sm font-bold text-white">{etape.verificationMethod}</p>
                </div>
              </div>

              {etape.safetyWarning && (
                <div className="p-3 bg-red-600/10 rounded-xl border border-red-500/20 flex gap-3 items-center">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-[10px] md:text-xs font-bold text-red-400 uppercase leading-tight">{etape.safetyWarning}</p>
                </div>
              )}
            </div>
          </div>

          {helpResponse && (
            <div className="animate-in zoom-in-95 duration-300 p-4 bg-blue-600/10 rounded-2xl border border-blue-500/20 text-sm text-blue-100">
              <p className="font-black uppercase text-[10px] text-blue-400 mb-2">Conseil de l'assistant Elite :</p>
              {helpResponse}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button onClick={handleNext} className="bg-blue-600 hover:bg-blue-500 text-white font-black h-12 rounded-xl flex-1 uppercase tracking-tighter transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-blue-500/10">
              <CheckCircle className="w-4 h-4 mr-2" /> Étape Validée
            </Button>
            <Button 
              variant="outline" 
              onClick={askHelp} 
              disabled={isAskingHelp}
              className="border-white/10 hover:bg-white/5 h-12 rounded-xl text-gray-400 font-bold uppercase tracking-tighter"
            >
              {isAskingHelp ? <Loader2 className="animate-spin w-4 h-4" /> : <HelpCircle className="w-4 h-4 mr-2" />}
              Aide contextuelle
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
