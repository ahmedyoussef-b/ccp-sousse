// components/training/ColabWorkflow.tsx
// Remplacer le contenu de l'étape 3 par l'affichage des cellules

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Cloud,
  Upload,
  Download,
  CheckCircle,
  Circle,
  Loader2,
  Copy,
  ExternalLink,
  Zap,
  AlertCircle,
  CheckCircle2,
  Database,
  FolderTree,
  FileCode,
  ChevronDown,
  ChevronUp,
  Play} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ============================================
// CELLULES COLAB QUI ONT RÉUSSI
// ============================================

const SUCCESS_CELLS = [
  {
    id: 1,
    title: "📦 Cellule 1: Installation des dépendances",
    description: "Installe toutes les bibliothèques nécessaires",
    code: `# Cellule 1: Installation des dépendances
!pip install transformers datasets accelerate peft trl bitsandbytes -q

print("✅ Dépendances installées")`,
    status: "success"
  },
  {
    id: 2,
    title: "🔧 Cellule 2: Configuration et détection GPU",
    description: "Détecte automatiquement GPU ou CPU",
    code: `# Cellule 2: Configuration et détection GPU
import torch
import json
import requests
import os

if torch.cuda.is_available():
    device = "cuda"
    print("🚀 GPU détecté - Mode haute performance")
else:
    device = "cpu"
    print("🖥️ CPU détecté - Mode économie")

print(f"🔧 Device: {device}")
print("✅ Configuration terminée")`,
    status: "success"
  },
  {
    id: 3,
    title: "📁 Cellule 3: Upload du dataset",
    description: "Téléchargez votre fichier dataset.jsonl depuis l'application",
    code: `# Cellule 3: Upload manuel du dataset
from google.colab import files

print("=" * 50)
print("📁 UPLOAD MANUEL DU DATASET")
print("=" * 50)
print()
print("📝 INSTRUCTIONS:")
print("1. Allez dans votre application Next.js")
print("2. Onglet 'Colab Studio'")
print("3. Cliquez sur 'Exporter en JSONL'")
print("4. Téléchargez le fichier sur votre PC")
print("5. Cliquez ci-dessous pour uploader le fichier")
print()

uploaded = files.upload()

for filename in uploaded.keys():
    os.rename(filename, "dataset.jsonl")
    print(f"✅ Fichier renommé: {filename} → dataset.jsonl")
    
    with open("dataset.jsonl", "r") as f:
        content = f.read()
        content = content.lstrip('\\ufeff')
        data = json.loads(content)
        print(f"📊 {len(data)} exemples chargés")
    break`,
    status: "success"
  },
  {
  id: 4,
  title: "🤖 Cellule 4: Chargement du modèle (version stable)",
  description: "Charge le modèle distilgpt2 sans conflit LoRA",
  code: `# Cellule 4: Chargement du modèle (version stable)
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments
from datasets import Dataset
import json

print("🔄 Chargement du modèle (mode simple)...")

MODEL_NAME = "distilgpt2"
MAX_SEQ_LENGTH = 256

model = AutoModelForCausalLM.from_pretrained(MODEL_NAME)
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
tokenizer.pad_token = tokenizer.eos_token

device = "cuda" if torch.cuda.is_available() else "cpu"
model.to(device)

# Activer le gradient checkpointing pour économiser la mémoire
model.gradient_checkpointing_enable()

print(f"✅ Modèle chargé sur {device}")
print(f"📊 Paramètres totaux: {sum(p.numel() for p in model.parameters()):,}")`,
  status: "success"
},
  {
    id: 5,
    title: "📊 Cellule 5: Préparation des données",
    description: "Lit et prépare le dataset pour l'entraînement",
    code: `# Cellule 5: Lecture et préparation des données
from datasets import Dataset

print("🔄 Lecture du fichier JSON...")

with open("dataset.jsonl", "r") as f:
    content = f.read()
    content = content.lstrip('\\ufeff')
    data = json.loads(content)

print(f"📊 {len(data)} exemples trouvés")

texts = []
for item in data:
    if "question" in item and "response" in item:
        text = f"### Instruction:\\n{item['question']}\\n\\n### Response:\\n{item['response']}"
        texts.append(text)

print(f"✅ {len(texts)} exemples valides")

dataset = Dataset.from_dict({"text": texts})

if len(texts) >= 2:
    split_dataset = dataset.train_test_split(test_size=0.1, seed=42)
    train_dataset = split_dataset["train"]
    eval_dataset = split_dataset["test"]
    print(f"✅ Train: {len(train_dataset)} | Validation: {len(eval_dataset)}")
else:
    train_dataset = dataset
    eval_dataset = dataset

print(f"\\n📝 Exemple:\\n{texts[0][:200]}...")`,
    status: "success"
  },
  {
    id: 6,
    title: "🔄 Cellule 6: Tokenisation",
    description: "Tokenise les données pour le modèle",
    code: `# Cellule 6: Tokenisation
print("🔄 Tokenisation des données...")

def tokenize_function(examples):
    return tokenizer(
        examples["text"], 
        truncation=True, 
        padding="max_length", 
        max_length=MAX_SEQ_LENGTH
    )

train_tokenized = train_dataset.map(tokenize_function, batched=True)
eval_tokenized = eval_dataset.map(tokenize_function, batched=True)

def add_labels(examples):
    examples["labels"] = examples["input_ids"].copy()
    return examples

train_tokenized = train_tokenized.map(add_labels, batched=True)
eval_tokenized = eval_tokenized.map(add_labels, batched=True)

print(f"✅ Train tokenisé: {len(train_tokenized)} exemples")
print(f"✅ Validation tokenisé: {len(eval_tokenized)} exemples")`,
    status: "success"
  },
  {
    id: 7,
    title: "🏋️ Cellule 7: Entraînement",
    description: "Lance l'entraînement du modèle (5-10 minutes)",
    code: `# Cellule 7: Entraînement
from transformers import TrainingArguments, Trainer, DataCollatorForLanguageModeling

print("🚀 Démarrage de l'entraînement...")

data_collator = DataCollatorForLanguageModeling(
    tokenizer=tokenizer,
    mlm=False,
)

training_args = TrainingArguments(
    output_dir="./ccp_model",
    per_device_train_batch_size=2,
    per_device_eval_batch_size=2,
    num_train_epochs=5,
    learning_rate=2e-4,
    fp16=True,
    logging_steps=5,
    save_steps=50,
    eval_steps=50,
    eval_strategy="steps",
    save_total_limit=2,
    load_best_model_at_end=True,
    metric_for_best_model="eval_loss",
    report_to="none",
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_tokenized,
    eval_dataset=eval_tokenized,
    data_collator=data_collator,
)

trainer.train()
print("✅ Entraînement terminé !")`,
    status: "success"
  },
  {
    id: 8,
    title: "💾 Cellule 8: Sauvegarde et téléchargement",
    description: "Sauvegarde le modèle et crée le fichier ZIP",
    code: `# Cellule 8: Sauvegarde et téléchargement
import zipfile
from google.colab import files

print("💾 Sauvegarde du modèle...")

model.save_pretrained("./ccp_model")
tokenizer.save_pretrained("./ccp_model")

print("✅ Modèle sauvegardé")

zip_path = "ccp_model_finetuned.zip"
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files_list in os.walk("./ccp_model"):
        for file in files_list:
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, start=".")
            zipf.write(file_path, arcname)

print(f"✅ Archive créée: {zip_path}")
print(f"📦 Taille: {os.path.getsize(zip_path) / 1024 / 1024:.2f} MB")

print("📥 Téléchargement en cours...")
files.download(zip_path)

print("\\n🎉 Modèle fine-tuné prêt !")`,
    status: "success"
  }
];

interface Step {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'error';
}

export function ColabWorkflow() {
  const { toast } = useToast();
  const [, setCurrentStep] = useState(0);
  const [expandedCells, setExpandedCells] = useState<number[]>([]);
  const [steps, setSteps] = useState<Step[]>([
    {
      id: 1,
      title: 'Préparation du Dataset',
      description: 'Collecte et validation des données d\'entraînement',
      status: 'pending'
    },
    {
      id: 2,
      title: 'Export vers JSONL',
      description: 'Conversion au format compatible Colab',
      status: 'pending'
    },
    {
      id: 3,
      title: 'Copier/Coller dans Google Colab',
      description: 'Utilisez les cellules ci-dessous',
      status: 'pending'
    },
    {
      id: 4,
      title: 'Exécution du Fine-tuning',
      description: 'Entraînement terminé',
      status: 'pending'
    }
  ]);

  const [datasetStats, setDatasetStats] = useState({
    examples: 0,
    validated: false,
    fileSize: '0 KB',
    lastExport: null as Date | null
  });

  const [trainingProgress, setTrainingProgress] = useState(0);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Étape 1: Préparation du dataset
  const prepareDataset = async () => {
    setIsPreparing(true);
    updateStepStatus(0, 'active');
    
    try {
      const response = await fetch('/api/training/dataset/prepare', {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Erreur préparation dataset');
      
      const data = await response.json();
      setDatasetStats({
        examples: data.stats?.validExamples || data.examples || 0,
        validated: true,
        fileSize: data.stats?.fileSizeKB ? `${data.stats.fileSizeKB} KB` : (data.fileSize || '0 KB'),
        lastExport: new Date()
      });
      
      updateStepStatus(0, 'completed');
      toast({
        title: '✅ Dataset prêt',
        description: `${data.stats?.validExamples || data.examples} exemples validés`,
      });
      
      setCurrentStep(1);
    } catch (error) {
      updateStepStatus(0, 'error');
      toast({
        title: '❌ Erreur',
        description: 'Impossible de préparer le dataset',
        variant: 'destructive'
      });
    } finally {
      setIsPreparing(false);
    }
  };

  // Étape 2: Export JSONL
  const exportToJSONL = async () => {
    setIsExporting(true);
    updateStepStatus(1, 'active');
    
    try {
      const response = await fetch('/api/training/export/jsonl', {
        method: 'GET'
      });
      
      if (!response.ok) throw new Error('Erreur export');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `training_dataset_${new Date().toISOString().split('T')[0]}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
      
      updateStepStatus(1, 'completed');
      toast({
        title: '📁 Export réussi',
        description: 'Fichier JSONL téléchargé',
      });
      
      setCurrentStep(2);
    } catch (error) {
      updateStepStatus(1, 'error');
      toast({
        title: '❌ Erreur export',
        description: 'Impossible d\'exporter le dataset',
        variant: 'destructive'
      });
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Transition vers l'étape de monitoring de l'entraînement.
   * Dans la version réelle, l'utilisateur surveille le notebook Colab.
   */
  const startTraining = () => {
    updateStepStatus(2, 'completed');
    updateStepStatus(3, 'active');
    setCurrentStep(3);
    setTrainingProgress(0);
    
    toast({
      title: '🚀 Monitoring activé',
      description: 'L\'entraînement a démarré sur Colab. Suivez la progression dans votre onglet Google Colab.',
    });
  };

  /**
   * Marque l'entraînement comme terminé après vérification manuelle ou détection
   */
  const completeTraining = () => {
    setTrainingProgress(100);
    updateStepStatus(3, 'completed');
    toast({
      title: '✅ Entraînement validé',
      description: 'Le modèle est prêt. Procédez à l\'étape de téléchargement.',
    });
  };

  const updateStepStatus = (stepIndex: number, status: Step['status']) => {
    setSteps(prev => prev.map((step, idx) => 
      idx === stepIndex ? { ...step, status } : step
    ));
  };

  const getStepIcon = (status: Step['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'active': return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-400" />;
      default: return <Circle className="w-5 h-5 text-slate-500" />;
    }
  };

  const toggleCell = (index: number) => {
    setExpandedCells(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const copyAllCells = () => {
    const allCode = SUCCESS_CELLS.map(cell => cell.code).join('\n\n');
    navigator.clipboard.writeText(allCode);
    toast({ title: '✅ Tout le code copié !', description: 'Collez-le dans la première cellule de Colab' });
  };

  const copyCell = (code: string, title: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: '✅ Cellule copiée', description: title });
  };

  const downloadNotebook = () => {
    const notebook = {
      cells: SUCCESS_CELLS.map(cell => ({
        cell_type: 'code',
        metadata: {},
        source: cell.code.split('\n')
      })),
      metadata: {
        kernelspec: { display_name: 'Python 3', name: 'python3' },
        language_info: { name: 'python' }
      },
      nbformat: 4,
      nbformat_minor: 4
    };
    
    const blob = new Blob([JSON.stringify(notebook, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ccp_training.ipynb';
    a.click();
    URL.revokeObjectURL(url);
    
    toast({ title: '📓 Notebook téléchargé', description: 'Uploadez-le dans Colab' });
  };

  const completedCount = steps.filter(s => s.status === 'completed').length;
  const totalProgress = (completedCount / steps.length) * 100;

  return (
    <div className="space-y-6">
      <Card className="border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-emerald-400" />
              Pipeline d'Entraînement Colab
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.href = '/training/dataset-manager'}
              className="border-slate-700"
            >
              <FolderTree className="w-4 h-4 mr-2" />
              Gérer le Dataset
            </Button>
          </div>
          <CardDescription>
            Préparez vos données et exécutez le fine-tuning sur Google Colab
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="col-span-1">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <h3 className="font-medium text-white mb-3 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  Dataset actuel
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Exemples</span>
                    <span className="text-white font-mono">{datasetStats.examples}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Taille</span>
                    <span className="text-white font-mono">{datasetStats.fileSize}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Validé</span>
                    <Badge variant={datasetStats.validated ? "default" : "secondary"} 
                           className={datasetStats.validated ? "bg-emerald-600" : "bg-slate-600"}>
                      {datasetStats.validated ? "Oui" : "Non"}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-2">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <h3 className="font-medium text-white mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  Progression
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Étape {completedCount} / {steps.length}</span>
                    <span className="text-emerald-400">{Math.round(totalProgress)}%</span>
                  </div>
                  <Progress value={totalProgress} className="h-2" />
                  {trainingProgress > 0 && trainingProgress < 100 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-400">Fine-tuning en cours</span>
                        <span className="text-emerald-400">{Math.round(trainingProgress)}%</span>
                      </div>
                      <Progress value={trainingProgress} className="h-2 bg-slate-700" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {steps.map((step, index) => (
          <Card key={step.id} className={`border-slate-800 transition-all duration-300 ${
            step.status === 'active' ? 'ring-2 ring-emerald-500/50 shadow-lg' : ''
          }`}>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-1">
                  {getStepIcon(step.status)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                    <h3 className="font-semibold text-white">
                      Étape {step.id}: {step.title}
                    </h3>
                    {step.status === 'completed' && (
                      <Badge className="bg-emerald-600 text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Terminé
                      </Badge>
                    )}
                    {step.status === 'active' && (
                      <Badge variant="outline" className="border-blue-400 text-blue-400 text-xs">
                        En cours...
                      </Badge>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm mb-3">{step.description}</p>
                  
                  {index === 0 && step.status === 'pending' && (
                    <Button onClick={prepareDataset} disabled={isPreparing} className="bg-emerald-600 hover:bg-emerald-700">
                      {isPreparing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                      Préparer le dataset
                    </Button>
                  )}
                  
                  {index === 1 && step.status === 'pending' && (
                    <Button onClick={exportToJSONL} disabled={isExporting} className="bg-emerald-600 hover:bg-emerald-700">
                      {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                      Exporter en JSONL
                    </Button>
                  )}
                  
                  {index === 2 && step.status === 'pending' && (
                    <div className="space-y-4">
                      <div className="flex gap-3 flex-wrap">
                        <Button onClick={copyAllCells} className="bg-blue-600 hover:bg-blue-700">
                          <Copy className="w-4 h-4 mr-2" />
                          Copier tout le code
                        </Button>
                        <Button onClick={downloadNotebook} variant="outline" className="border-slate-700">
                          <Download className="w-4 h-4 mr-2" />
                          Télécharger .ipynb
                        </Button>
                        <Button onClick={() => window.open('https://colab.research.google.com', '_blank')} variant="outline" className="border-slate-700">
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Ouvrir Colab
                        </Button>
                      </div>
                      
                      <Alert className="border-blue-500/50 bg-blue-500/10">
                        <FileCode className="h-4 w-4 text-blue-400" />
                        <AlertTitle>Instructions</AlertTitle>
                        <AlertDescription className="text-xs">
                          1. Ouvrez Google Colab<br />
                          2. Créez un nouveau notebook<br />
                          3. Copiez/collez chaque cellule ci-dessous dans l'ordre<br />
                          4. Exécutez les cellules une par une (Shift+Enter)
                        </AlertDescription>
                      </Alert>

                      <div className="space-y-3 max-h-[600px] overflow-y-auto">
                        {SUCCESS_CELLS.map((cell, cellIndex) => (
                          <div key={cell.id} className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
                            <div 
                              className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-800/50"
                              onClick={() => toggleCell(cellIndex)}
                            >
                              <div className="flex items-center gap-2">
                                {expandedCells.includes(cellIndex) ? 
                                  <ChevronUp className="w-4 h-4 text-slate-400" /> : 
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                                }
                                <span className="font-mono text-sm text-emerald-400">{cell.title}</span>
                                <Badge className="bg-emerald-600/20 text-emerald-400 text-xs border-0">
                                  ✓ Validé
                                </Badge>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyCell(cell.code, cell.title);
                                }}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                            {expandedCells.includes(cellIndex) && (
                              <div className="p-3 border-t border-slate-800">
                                <pre className="text-xs text-slate-300 bg-slate-950 p-3 rounded overflow-x-auto whitespace-pre-wrap font-mono">
                                  {cell.code}
                                </pre>
                                <p className="text-xs text-slate-500 mt-2">{cell.description}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      
                      <Button onClick={startTraining} className="w-full bg-purple-600 hover:bg-purple-700">
                        <Play className="w-4 h-4 mr-2" />
                        J'ai fini de copier, démarrer l'entraînement
                      </Button>
                    </div>
                  )}
                  
                  {index === 3 && step.status === 'active' && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm text-slate-300">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                        Surveillance de la progression Colab...
                      </div>
                      <div className="bg-slate-900 rounded-lg p-3 font-mono text-xs text-slate-300 border border-slate-800">
                        <div>🔄 En attente des logs de Colab...</div>
                        <div className="text-slate-500 mt-1">Consultez votre onglet Google Colab pour voir les métriques en temps réel (Loss, Accuracy).</div>
                      </div>
                      <Button onClick={completeTraining} className="w-full bg-emerald-600 hover:bg-emerald-700">
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Confirmer la fin de l'entraînement
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {steps.every(step => step.status === 'completed') && (
        <Alert className="border-emerald-500/50 bg-emerald-500/10">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <AlertTitle>🎉 Entraînement terminé !</AlertTitle>
          <AlertDescription>
            Votre modèle est prêt. Téléchargez le fichier ZIP généré par Colab, 
            puis allez dans l'onglet <strong>"Intégration du Modèle Fine-tuné"</strong> pour l'importer dans Ollama.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}