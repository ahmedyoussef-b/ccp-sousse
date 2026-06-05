// components/training/ManualTrainingInterface.tsx
/**
 * @fileOverview Interface de collecte manuelle des données d'entraînement Q/R
 * @version 3.0.0 - Pure collection base (RAG interaction moved to TrainingDashboard)
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  MessageSquare, 
  Star, 
  Database, 
  TrendingUp,
  Trash2,
  Edit2,
  Plus,
  Send
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { JSONUploader } from './JSONUploader';
import { ResponseQuality } from './ResponseQuality';

interface TrainingExample {
  id: string;
  question: string;
  response: string;
  quality?: number;
  tags?: string[];
  source?: 'manual' | 'import' | 'feedback';
  createdAt: string;
  updatedAt?: string;
}

export function ManualTrainingInterface() {
  const { toast } = useToast();
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentResponse, setCurrentResponse] = useState('');
  const [selectedQuality, setSelectedQuality] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    avgQuality: 0,
    lastWeek: 0,
    bySource: { manual: 0, import: 0, feedback: 0 }
  });

  // Charger les exemples existants
  useEffect(() => {
    fetchExamples();
  }, []);

 // components/training/ManualTrainingInterface.tsx - Mise à jour de fetchExamples

const fetchExamples = async () => {
  setIsLoading(true);
  try {
    const response = await fetch('/api/training/examples');
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    setExamples(data.examples || []);
    updateStats(data.examples || []);
    
    // Afficher un message de succès silencieux (optionnel)
    if (data.examples?.length > 0) {
      console.log(`✅ ${data.examples.length} exemples chargés`);
    }
  } catch (error) {
    console.error('Error fetching examples:', error);
    toast({
      title: 'Erreur de chargement',
      description: 'Impossible de charger les exemples d\'entraînement. Vérifiez que l\'API est accessible.',
      variant: 'destructive',
    });
    // Initialiser avec un tableau vide pour éviter l'erreur d'affichage
    setExamples([]);
    setStats({ total: 0, avgQuality: 0, lastWeek: 0, bySource: { manual: 0, import: 0, feedback: 0 } });
  } finally {
    setIsLoading(false);
  }
};

  const updateStats = (examplesList: TrainingExample[]) => {
    const total = examplesList.length;
    const avgQuality = total > 0 
      ? examplesList.reduce((acc, ex) => acc + (ex.quality || 0), 0) / total 
      : 0;
    
    const lastWeek = examplesList.filter(ex => {
      const daysDiff = (new Date().getTime() - new Date(ex.createdAt).getTime()) / (1000 * 3600 * 24);
      return daysDiff <= 7;
    }).length;
    
    const bySource = {
      manual: examplesList.filter(ex => ex.source === 'manual').length,
      import: examplesList.filter(ex => ex.source === 'import').length,
      feedback: examplesList.filter(ex => ex.source === 'feedback').length,
    };
    
    setStats({ total, avgQuality, lastWeek, bySource });
  };

  const addOrUpdateExample = async () => {
    if (!currentQuestion.trim() || !currentResponse.trim()) {
      toast({
        title: 'Champs requis',
        description: 'Veuillez remplir la question et la réponse',
        variant: 'destructive',
      });
      return;
    }
    
    // Auto-link to Reference Library
    try {
      const hierarchyRes = await fetch('/api/reference/hierarchy');
      if (hierarchyRes.ok) {
        const { zones } = await hierarchyRes.json();
        
        let matchedEntity: any = null;
        
        const entities: { id: string, type: string, data: any }[] = [];
        zones?.forEach((z: any) => {
          entities.push({ id: z.id, type: 'zone', data: z });
          z.circuits?.forEach((c: any) => {
            entities.push({ id: c.id, type: 'circuit', data: c });
            c.parametres?.forEach((p: any) => {
              entities.push({ id: p.id, type: 'parametre', data: p });
            });
          });
        });
        
        for (const entity of entities) {
          const regex = new RegExp(`\\b${entity.id}\\b`, 'i');
          if (regex.test(currentQuestion)) {
            matchedEntity = entity;
            break;
          }
        }
        
        if (matchedEntity) {
          const meta = matchedEntity.data.metadata || {};
          meta.training_qa = meta.training_qa || [];
          // Avoid duplicates if same question is edited
          const existingIdx = meta.training_qa.findIndex((qa: any) => qa.question === currentQuestion.trim());
          if (existingIdx >= 0) {
            meta.training_qa[existingIdx].response = currentResponse.trim();
          } else {
            meta.training_qa.push({ question: currentQuestion.trim(), response: currentResponse.trim() });
          }
          
          await fetch('/api/reference/hierarchy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'save',
              type: matchedEntity.type,
              data: { ...matchedEntity.data, metadata: meta }
            })
          });
          
          toast({
            title: 'Métadonnées associées',
            description: `Le Q/R a été ajouté à l'entité ${matchedEntity.data.id}`,
          });
        }
      }
    } catch (err) {
      console.error("Erreur lors de l'association aux métadonnées:", err);
    }

    const exampleData: Partial<TrainingExample> = {
      question: currentQuestion.trim(),
      response: currentResponse.trim(),
      quality: selectedQuality || undefined,
      source: editingId ? undefined : 'manual',
      updatedAt: new Date().toISOString(),
    };
    
    try {
      const url = editingId 
        ? `/api/training/examples/${editingId}`
        : '/api/training/examples';
      
      const method = editingId ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exampleData)
      });
      
      if (response.ok) {
        await fetchExamples();
        setCurrentQuestion('');
        setCurrentResponse('');
        setSelectedQuality(null);
        setEditingId(null);
        
        toast({
          title: editingId ? 'Exemple modifié' : 'Exemple ajouté',
          description: `${currentQuestion.substring(0, 50)}...`,
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Error saving example:', error);
      toast({
        title: 'Erreur',
        description: error instanceof Error && error.message !== 'Failed to save' 
          ? error.message 
          : 'Impossible de sauvegarder l\'exemple',
        variant: 'destructive',
      });
    }
  };

  const deleteExample = async (id: string) => {
    try {
      const response = await fetch(`/api/training/examples/${id}`, { method: 'DELETE' });
      if (response.ok) {
        await fetchExamples();
        toast({
          title: 'Exemple supprimé',
          description: 'L\'exemple a été retiré de la base d\'entraînement',
        });
      } else {
        throw new Error('Failed to delete');
      }
    } catch (error) {
      console.error('Error deleting example:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de supprimer l\'exemple',
        variant: 'destructive',
      });
    }
  };

  const clearAllExamples = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer TOUTE la liste des exemples d\'entraînement ? Cette action est irréversible.')) {
      return;
    }

    try {
      const response = await fetch('/api/training/examples', { method: 'DELETE' });
      if (response.ok) {
        await fetchExamples();
        toast({
          title: 'Liste vidée',
          description: 'Tous les exemples d\'entraînement ont été supprimés.',
        });
      } else {
        throw new Error('Failed to clear list');
      }
    } catch (error) {
      console.error('Error clearing examples:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de vider la liste',
        variant: 'destructive',
      });
    }
  };

  const editExample = (example: TrainingExample) => {
    setCurrentQuestion(example.question);
    setCurrentResponse(example.response);
    setSelectedQuality(example.quality || null);
    setEditingId(example.id);
    // Scroll to form
    document.getElementById('training-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setCurrentQuestion('');
    setCurrentResponse('');
    setSelectedQuality(null);
    setEditingId(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Total exemples</p>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
              </div>
              <Database className="w-8 h-8 text-emerald-400 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Qualité moyenne</p>
                <p className="text-2xl font-bold text-white">
                  {stats.avgQuality.toFixed(1)} <span className="text-sm text-emerald-400">/5</span>
                </p>
              </div>
              <Star className="w-8 h-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Ajoutés cette semaine</p>
                <p className="text-2xl font-bold text-white">{stats.lastWeek}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Sources</p>
                <p className="text-xs text-slate-400 mt-1">
                  📝 {stats.bySource.manual} | 📁 {stats.bySource.import} | 💬 {stats.bySource.feedback}
                </p>
              </div>
              <MessageSquare className="w-8 h-8 text-purple-400 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Formulaire d'ajout/édition */}
      <Card className="border-slate-800" id="training-form">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {editingId ? <Edit2 className="w-4 h-4 text-emerald-400" /> : <Plus className="w-4 h-4 text-emerald-400" />}
            {editingId ? 'Modifier l\'exemple' : 'Ajouter un exemple d\'entraînement'}
          </CardTitle>
          <CardDescription>
            Créez une paire Question/Réponse pour améliorer le modèle
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Question</Label>
            <Textarea
              value={currentQuestion}
              onChange={(e) => setCurrentQuestion(e.target.value)}
              placeholder="Ex: Quelle est la pression maximale d'admission pour TG1 ?"
              className="mt-1 bg-slate-900 border-slate-700 focus:border-emerald-500"
              rows={3}
            />
          </div>
          <div>
            <Label>Réponse</Label>
            <Textarea
              value={currentResponse}
              onChange={(e) => setCurrentResponse(e.target.value)}
              placeholder="Ex: La pression maximale d'admission pour TG1 est de 12.5 bars dans les conditions nominales..."
              className="mt-1 bg-slate-900 border-slate-700 focus:border-emerald-500"
              rows={4}
            />
          </div>
          <div>
            <Label>Qualité de la réponse (optionnel)</Label>
            <div className="mt-2">
              <ResponseQuality value={selectedQuality} onChange={setSelectedQuality} />
            </div>
          </div>
          <div className="flex justify-between items-center w-full">
            <div className="flex gap-3">
              <Button onClick={addOrUpdateExample} className="bg-emerald-600 hover:bg-emerald-700">
                <Send className="w-4 h-4 mr-2" />
                {editingId ? 'Mettre à jour' : 'Ajouter à l\'entraînement'}
              </Button>
              {editingId && (
                <Button onClick={cancelEdit} variant="outline" className="border-slate-700">
                  Annuler
                </Button>
              )}
            </div>
            
            {!editingId && examples.length > 0 && (
              <Button 
                onClick={clearAllExamples} 
                variant="ghost" 
                className="text-red-400 hover:text-red-300 hover:bg-red-950/30 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Vider la liste
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upload JSON */}
      <JSONUploader onUploadComplete={fetchExamples} />

      {/* Liste des exemples */}
      <Card className="border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            Exemples d'entraînement
          </CardTitle>
          <CardDescription>
            {examples.length} paire{examples.length !== 1 ? 's' : ''} Question/Réponse disponible{examples.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {examples.map((example) => (
              <div key={example.id} className="bg-slate-900 rounded-lg p-4 border border-slate-800 hover:border-slate-700 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="outline" className="text-emerald-400 border-emerald-500/50">
                        Q
                      </Badge>
                      <span className="font-medium text-white">{example.question}</span>
                      {example.source && (
                        <Badge variant="secondary" className="text-xs">
                          {example.source === 'manual' && '📝 Manuel'}
                          {example.source === 'import' && '📁 Import'}
                          {example.source === 'feedback' && '💬 Feedback'}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-start gap-2 ml-6">
                      <Badge variant="outline" className="text-blue-400 border-blue-500/50">
                        R
                      </Badge>
                      <p className="text-slate-300 text-sm">{example.response}</p>
                    </div>
                    {example.quality && (
                      <div className="flex items-center gap-1 ml-6 mt-2">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className={`w-3 h-3 ${i < example.quality! ? 'text-yellow-500 fill-yellow-500' : 'text-slate-600'}`} />
                        ))}
                      </div>
                    )}
                    <div className="ml-6 mt-2 text-xs text-slate-500">
                      {new Date(example.createdAt).toLocaleDateString()}
                      {example.updatedAt && ` • modifié le ${new Date(example.updatedAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => editExample(example)}
                      className="text-blue-400 hover:text-blue-300 hover:bg-blue-950"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteExample(example.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-950"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {examples.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Aucun exemple pour le moment.</p>
                <p className="text-sm">Commencez par ajouter des paires Question/Réponse ci-dessus !</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}