// src/components/industrial-vision/InnovationGuide.tsx

'use client';

import { useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle2, 
  Circle, 
  ArrowRight, 
  ArrowLeft, 
  Play, 
  Info, 
  AlertCircle,
  FileText,
  Target,
  Zap
} from 'lucide-react';

import { Innovation } from '@/lib/industrial-vision/types/industrial.types';

interface Step {
  title: string;
  description: string;
  action?: string;
  expectedResult: string;
  tip?: string;
}

interface InnovationGuideProps {
  innovation: Innovation;
  onClose?: () => void;
}

// Données des guides (pourrait être déplacé dans un fichier séparé)
const GUIDES_DATA: Record<number, {
  objective: string;
  prerequisites: string[];
  steps: Step[];
}> = {
  1: {
    objective: "Localiser précisément un organe industriel sur un schéma complexe à partir de son nom textuel.",
    prerequisites: ["Base d'organes indexée", "Schéma technique chargé"],
    steps: [
      {
        title: "Sélection de la cible",
        description: "Identifiez le nom de l'organe que vous recherchez (ex: CONDENSEUR).",
        expectedResult: "Le système prépare la recherche dans l'index spatial."
      },
      {
        title: "Exécution de la recherche",
        description: "Lancez la fonction indexTextToPosition() avec le nom cible.",
        action: "Exécuter la recherche",
        expectedResult: "Récupération des coordonnées (x, y, largeur, hauteur)."
      },
      {
        title: "Visualisation",
        description: "Affichez le rectangle de délimitation (Bounding Box) sur l'image.",
        expectedResult: "L'organe est mis en évidence graphiquement."
      }
    ]
  },
  6: {
    objective: "Identifier les différences critiques entre une installation réelle et son schéma de référence.",
    prerequisites: ["Image de référence (Golden Standard)", "Capture actuelle du site"],
    steps: [
      {
        title: "Alignement spatial",
        description: "Superposez les deux images pour assurer une comparaison pixel à pixel.",
        expectedResult: "Les deux images sont alignées sur les points d'ancrage."
      },
      {
        title: "Soustraction de caractéristiques",
        description: "Exécutez detectAnomalies() pour isoler les éléments disparates.",
        action: "Lancer l'analyse",
        expectedResult: "Liste des organes manquants ou en trop."
      },
      {
        title: "Classification de criticité",
        description: "Évaluez si l'anomalie impacte la sécurité (ex: vanne fermée).",
        expectedResult: "Rapport d'anomalies priorisé par risque."
      }
    ]
  },
  31: {
    objective: "Surveiller en temps réel l'état opérationnel via la couleur des voyants lumineux.",
    prerequisites: ["Flux vidéo ou captures successives", "Zones de voyants définies"],
    steps: [
      {
        title: "Définition du ROI",
        description: "Définissez la Region of Interest (ROI) autour du voyant.",
        expectedResult: "Zone de capture restreinte pour optimiser le CPU."
      },
      {
        title: "Analyse colorimétrique",
        description: "Détectez la couleur dominante (Vert/Orange/Rouge).",
        action: "Démarrer la surveillance",
        expectedResult: "État actuel extrait (ex: 'Alarme Active')."
      },
      {
        title: "Déclenchement d'alerte",
        description: "Configurez le seuil de passage au rouge.",
        expectedResult: "Notification envoyée en cas de changement critique."
      }
    ]
  }
};

export function InnovationGuide({ innovation, onClose }: InnovationGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);


  const guide = GUIDES_DATA[innovation.id] || {
    objective: innovation.description,
    prerequisites: ["Données " + innovation.requiresData.join(', ')],
    steps: [
      {
        title: "Préparation",
        description: "Vérifiez que les données nécessaires sont disponibles.",
        expectedResult: "Système prêt."
      },
      {
        title: "Exécution",
        description: `Appel de la fonction : ${innovation.name}`,
        action: "Exécuter",
        expectedResult: "Résultats extraits."
      }
    ]
  };

  const steps = guide.steps;
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      if (!completedSteps.includes(currentStep)) {
        setCompletedSteps([...completedSteps, currentStep]);
      }
      setCurrentStep(currentStep + 1);
    } else {
      if (!completedSteps.includes(currentStep)) {
        setCompletedSteps([...completedSteps, currentStep]);
      }
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const runAction = () => {
    setIsExecuting(true);
    setTimeout(() => {
      setIsExecuting(false);
      handleNext();
    }, 1500);
  };

  return (
    <Card className="w-full border-2 border-blue-500/50 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="bg-white/20 text-white hover:bg-white/30 border-none">
                Innovation #{innovation.id}
              </Badge>
              <Badge className="bg-yellow-400 text-blue-900 border-none font-bold">
                GUIDE PAS-À-PAS
              </Badge>
            </div>
            <CardTitle className="text-2xl font-bold">{innovation.name}</CardTitle>
            <CardDescription className="text-blue-100 mt-1 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Objectif: {guide.objective}
            </CardDescription>
          </div>
          {onClose && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClose}
              className="text-white hover:bg-white/10"
            >
              Fermer
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="flex flex-col md:flex-row h-[500px]">
          {/* Sidebar - Liste des étapes */}
          <div className="w-full md:w-72 bg-gray-50 dark:bg-gray-900 border-r p-4 overflow-y-auto">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Zap className="h-3 w-3" /> Étapes du parcours
            </h3>
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div 
                  key={index}
                  className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    currentStep === index 
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500' 
                      : completedSteps.includes(index)
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                  onClick={() => setCurrentStep(index)}
                >
                  <div className="mt-0.5">
                    {completedSteps.includes(index) ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : currentStep === index ? (
                      <div className="h-5 w-5 rounded-full border-2 border-blue-500 flex items-center justify-center">
                        <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                      </div>
                    ) : (
                      <Circle className="h-5 w-5 text-gray-300" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold leading-none mb-1">{step.title}</p>
                    <p className="text-[10px] opacity-70">Étape {index + 1}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Info className="h-3 w-3" /> Prérequis
              </h3>
              <div className="space-y-1">
                {guide.prerequisites.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] text-gray-500">
                    <div className="h-1 w-1 rounded-full bg-gray-400" />
                    {p}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content - Étape active */}
          <div className="flex-1 p-8 flex flex-col bg-white dark:bg-gray-950">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xl font-bold">
                    {currentStep + 1}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {steps[currentStep].title}
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400">
                      Progression: {Math.round(progress)}%
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="h-8 px-3 border-blue-200 bg-blue-50 text-blue-700">
                  Étape active
                </Badge>
              </div>

              <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-6 border border-gray-100 dark:border-gray-800">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-500" />
                    Instruction
                  </h4>
                  <p className="text-gray-600 dark:text-gray-400 text-lg">
                    {steps[currentStep].description}
                  </p>
                  
                  {steps[currentStep].tip && (
                    <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-100 dark:border-yellow-900/30 flex items-start gap-3">
                      <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                      <p className="text-xs text-yellow-800 dark:text-yellow-200">
                        <span className="font-bold">Conseil:</span> {steps[currentStep].tip}
                      </p>
                    </div>
                  )}
                </div>

                <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-6 border border-green-100 dark:border-green-900/20">
                  <h4 className="text-sm font-semibold text-green-700 dark:text-green-300 mb-2 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Résultat attendu
                  </h4>
                  <p className="text-green-800 dark:text-green-200">
                    {steps[currentStep].expectedResult}
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="mt-8 flex items-center justify-between border-t pt-6">
              <Button 
                variant="outline" 
                onClick={handlePrev}
                disabled={currentStep === 0 || isExecuting}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" /> Précédent
              </Button>

              <div className="flex gap-3">
                {steps[currentStep].action && !completedSteps.includes(currentStep) && (
                  <Button 
                    variant="default" 
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-lg shadow-blue-500/20"
                    onClick={runAction}
                    disabled={isExecuting}
                  >
                    {isExecuting ? (
                      <><div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Traitement...</>
                    ) : (
                      <><Play className="h-4 w-4 fill-current" /> {steps[currentStep].action}</>
                    )}
                  </Button>
                )}
                
                <Button 
                  variant={currentStep === steps.length - 1 && completedSteps.includes(currentStep) ? "outline" : "default"}
                  onClick={handleNext}
                  disabled={currentStep === steps.length - 1 && completedSteps.includes(currentStep) || isExecuting}
                  className={`gap-2 ${currentStep === steps.length - 1 && completedSteps.includes(currentStep) ? '' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                >
                  {currentStep === steps.length - 1 ? (
                    completedSteps.includes(currentStep) ? "Terminé !" : "Finaliser"
                  ) : (
                    <>Suivant <ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
        <Progress value={progress} className="h-1 rounded-none bg-gray-100" />
      </CardContent>
    </Card>
  );
}
