// components/training/TrainingHistory.tsx
/**
 * @fileOverview Historique des sessions d'entraînement
 * @version 1.0.0
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  History, 
  Calendar, 
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TrainingSession {
  id: string;
  date: string;
  modelName: string;
  datasetSize: number;
  epochs: number;
  finalLoss: number;
  status: 'completed' | 'failed' | 'in_progress';
  metrics?: {
    accuracy: number;
    perplexity: number;
  };
}

export function TrainingHistory() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/training/history');
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSession = async (id: string) => {
    try {
      const response = await fetch(`/api/training/history/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setSessions(prev => prev.filter(s => s.id !== id));
        toast({ title: 'Session supprimée', description: 'L\'historique a été effacé' });
      }
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de supprimer', variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: TrainingSession['status']) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-emerald-600"><CheckCircle2 className="w-3 h-3 mr-1" /> Terminé</Badge>;
      case 'failed':
        return <Badge className="bg-red-600"><XCircle className="w-3 h-3 mr-1" /> Échoué</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-600"><Clock className="w-3 h-3 mr-1" /> En cours</Badge>;
    }
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
      <Card className="border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            Historique des entraînements
          </CardTitle>
          <CardDescription>
            Toutes les sessions de fine-tuning effectuées
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucune session d'entraînement pour le moment.</p>
              <p className="text-sm">Utilisez l'onglet "Colab Studio" pour commencer !</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div key={session.id} className="bg-slate-900 rounded-lg p-4 border border-slate-800 hover:border-slate-700 transition-colors">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="font-medium text-white">{session.modelName}</h3>
                        {getStatusBadge(session.status)}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-slate-500 text-xs">Date</p>
                          <p className="text-slate-300 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(session.date).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs">Dataset</p>
                          <p className="text-slate-300">{session.datasetSize} exemples</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs">Epochs</p>
                          <p className="text-slate-300">{session.epochs}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs">Loss finale</p>
                          <p className="text-slate-300">{session.finalLoss.toFixed(4)}</p>
                        </div>
                      </div>
                      {session.metrics && (
                        <div className="mt-2 flex gap-4 text-sm">
                          <span className="text-slate-500">Accuracy: <span className="text-emerald-400">{session.metrics.accuracy}%</span></span>
                          <span className="text-slate-500">Perplexity: <span className="text-emerald-400">{session.metrics.perplexity}</span></span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="text-blue-400">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-400" onClick={() => deleteSession(session.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}