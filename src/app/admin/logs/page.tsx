// src/app/admin/logs/page.tsx
// Interface pour visualiser les traces

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface Trace {
  id: string;
  timestamp: string;
  question: string;
  steps: Step[];
  totalDuration: number;
  success: boolean;
}

interface Step {
  name: string;
  duration: number;
  status: string;
}

export default function LogsPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [tracesRes, statsRes] = await Promise.all([
      fetch('/api/logs?limit=50'),
      fetch('/api/logs?action=statistics')
    ]);
    
    const tracesData = await tracesRes.json();
    const statsData = await statsRes.json();
    
    setTraces(tracesData.traces);
    setStats(statsData);
    setLoading(false);
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getDurationColor = (ms: number) => {
    if (ms < 10000) return 'text-green-500';
    if (ms < 30000) return 'text-yellow-500';
    return 'text-red-500';
  };

  if (loading) return <div className="p-8">Chargement...</div>;

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">📊 Audit des performances</h1>
      
      {/* Statistiques */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-400">Total requêtes</p>
            <p className="text-2xl font-bold">{stats?.total || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-400">Taux succès</p>
            <p className="text-2xl font-bold">{stats?.successRate?.toFixed(1) || 0}%</p>
            <Progress value={stats?.successRate || 0} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-400">Temps moyen</p>
            <p className="text-2xl font-bold">{formatDuration(stats?.avgTotalDuration || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-400">Dernière heure</p>
            <p className="text-2xl font-bold">{stats?.lastHour || 0}</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Liste des traces */}
      <Card>
        <CardHeader>
          <CardTitle>📋 Dernières traces</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {traces.map((trace) => (
              <div key={trace.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{trace.question}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(trace.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <Badge className={trace.success ? 'bg-green-600' : 'bg-red-600'}>
                    {trace.success ? 'Succès' : 'Échec'}
                  </Badge>
                </div>
                
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Durée totale:</span>
                    <span className={`font-mono ${getDurationColor(trace.totalDuration)}`}>
                      {formatDuration(trace.totalDuration)}
                    </span>
                  </div>
                  
                  <details className="mt-2">
                    <summary className="text-sm cursor-pointer">Détail des étapes</summary>
                    <div className="mt-2 space-y-1">
                      {trace.steps.map((step, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span>{step.name}</span>
                          <span className="font-mono">{formatDuration(step.duration)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}