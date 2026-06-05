// components/training/FeedbackDashboard.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Star,
  TrendingUp,
  Download,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Calendar,
  BarChart3,
  LineChart
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FeedbackStats {
  total: number;
  averageRating: number;
  distribution: Record<number, number>;
  lastWeek: number;
  improvementRate: number;
  weeklyTrend?: number[];
}

interface Feedback {
  id: string;
  question: string;
  answer: string;
  rating: number;
  timestamp: string;
}

export function FeedbackDashboard() {
  const { toast } = useToast();
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/feedback');
      const data = await response.json();
      setStats(data.stats);
      setFeedbacks(data.feedbacks || []);
    } catch (error) {
      console.error('Erreur chargement:', error);
      toast({ title: 'Erreur', description: 'Impossible de charger les données', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const exportCSV = async () => {
    try {
      window.location.href = '/api/feedback/export';
      toast({ title: 'Export lancé', description: 'Le fichier CSV va être téléchargé' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Export impossible', variant: 'destructive' });
    }
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4) return 'text-green-500';
    if (rating >= 3) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getRatingLabel = (rating: number) => {
    if (rating === 5) return 'Excellent';
    if (rating === 4) return 'Bon';
    if (rating === 3) return 'Moyen';
    if (rating === 2) return 'Insatisfaisant';
    return 'Très insatisfaisant';
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  const satisfactionRate = stats?.averageRating ? (stats.averageRating / 5) * 100 : 0;
  const positiveRate = stats?.distribution && stats.total > 0 ? 
    ((stats.distribution[4] + stats.distribution[5]) / stats.total * 100).toFixed(1) : '0';
  const negativeRate = stats?.distribution && stats.total > 0 ?
    ((stats.distribution[1] + stats.distribution[2]) / stats.total * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">📊 Dashboard Feedback</h2>
          <p className="text-slate-400">Analyse des retours utilisateurs</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadData} variant="outline" size="sm" className="border-slate-700">
            <RefreshCw className="w-4 h-4 mr-2" />
            Rafraîchir
          </Button>
          <Button onClick={exportCSV} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Cartes KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Total feedbacks</p>
                <p className="text-2xl font-bold text-white">{stats?.total || 0}</p>
              </div>
              <Star className="w-8 h-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Note moyenne</p>
                <p className="text-2xl font-bold text-white">{stats?.averageRating || 0}</p>
                <div className="flex gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-3 h-3 ${star <= (stats?.averageRating || 0) ? 'fill-yellow-500 text-yellow-500' : 'text-slate-600'}`}
                    />
                  ))}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-white">{satisfactionRate.toFixed(0)}%</div>
                <p className="text-xs text-slate-400">Satisfaction</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Avis positifs</p>
                <p className="text-2xl font-bold text-green-500">{positiveRate}%</p>
                <div className="flex items-center gap-1 mt-1">
                  <ThumbsUp className="w-3 h-3 text-green-500" />
                  <span className="text-xs text-slate-400">
                    {((stats?.distribution[4] || 0) + (stats?.distribution[5] || 0))} feedbacks
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-400">Avis négatifs</p>
                <p className="text-2xl font-bold text-red-500">{negativeRate}%</p>
                <div className="flex items-center gap-1 mt-1">
                  <ThumbsDown className="w-3 h-3 text-red-500" />
                  <span className="text-xs text-slate-400">
                    {((stats?.distribution[1] || 0) + (stats?.distribution[2] || 0))} feedbacks
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Cette semaine</p>
                <p className="text-2xl font-bold text-white">{stats?.lastWeek || 0}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span className="text-xs text-slate-400">nouveaux retours</span>
                </div>
              </div>
              <TrendingUp className="w-8 h-8 text-emerald-400 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribution des notes */}
      <Card className="border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            Distribution des notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = stats?.distribution?.[rating] || 0;
              const percentage = stats?.total && stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <div key={rating} className="flex items-center gap-3">
                  <div className="flex items-center gap-1 w-16">
                    <span className="text-sm font-medium">{rating}★</span>
                    <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                  </div>
                  <div className="flex-1">
                    <Progress value={percentage} className="h-2" />
                  </div>
                  <div className="w-16 text-right">
                    <span className="text-sm text-slate-300">{count}</span>
                    <span className="text-xs text-slate-500 ml-1">({percentage.toFixed(0)}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Liste des feedbacks récents */}
      <Card className="border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LineChart className="w-4 h-4 text-emerald-400" />
            Derniers retours
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {feedbacks.slice(0, 10).map((feedback) => (
              <div key={feedback.id} className="bg-slate-900 rounded-lg p-4 border border-slate-800">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-4 h-4 ${star <= feedback.rating ? 'fill-yellow-500 text-yellow-500' : 'text-slate-600'}`}
                          />
                        ))}
                      </div>
                      <Badge className={getRatingColor(feedback.rating)} variant="outline">
                        {getRatingLabel(feedback.rating)}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-300 font-medium">{feedback.question}</p>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{feedback.answer}</p>
                    <p className="text-xs text-slate-600 mt-2">
                      {new Date(feedback.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {feedbacks.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Aucun feedback pour le moment</p>
                <p className="text-sm">Les retours apparaîtront ici</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}