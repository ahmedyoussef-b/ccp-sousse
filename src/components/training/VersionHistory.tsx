// components/training/VersionHistory.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  History, 
  RotateCcw, 
  Calendar,
  Database} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Version {
  id: string;
  filename: string;
  date: string;
  examplesCount: number;
  size: string;
  comment?: string;
}

export function VersionHistory() {
  const { toast } = useToast();
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadVersions();
  }, []);

  const loadVersions = async () => {
    try {
      const response = await fetch('/api/training/versions');
      const data = await response.json();
      setVersions(data.versions || []);
    } catch (error) {
      console.error('Error loading versions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const restoreVersion = async (versionId: string) => {
    if (confirm('Êtes-vous sûr de vouloir restaurer cette version ?')) {
      try {
        const response = await fetch('/api/training/versions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'restore', versionId })
        });
        
        if (response.ok) {
          toast({ title: '✅ Version restaurée', description: 'La base a été restaurée avec succès' });
          loadVersions();
        }
      } catch (error) {
        toast({ title: '❌ Erreur', description: 'Impossible de restaurer la version', variant: 'destructive' });
      }
    }
  };

  const createVersion = async () => {
    const comment = prompt('Commentaire pour cette version (optionnel) :');
    try {
      const response = await fetch('/api/training/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', comment })
      });
      
      if (response.ok) {
        toast({ title: '✅ Version créée', description: 'Un snapshot a été sauvegardé' });
        loadVersions();
      }
    } catch (error) {
      toast({ title: '❌ Erreur', description: 'Impossible de créer la version', variant: 'destructive' });
    }
  };

  return (
    <Card className="border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            Historique des versions
          </CardTitle>
          <Button onClick={createVersion} size="sm" className="bg-emerald-600">
            <Database className="w-4 h-4 mr-2" />
            Créer un snapshot
          </Button>
        </div>
        <CardDescription>
          Toutes les versions sauvegardées de examples.json
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">Chargement...</div>
        ) : versions.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Aucune version sauvegardée</p>
            <p className="text-sm">Cliquez sur "Créer un snapshot" pour commencer</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {versions.map((version) => (
              <div key={version.id} className="bg-slate-900 rounded-lg p-4 border border-slate-800">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-emerald-400">
                        v{version.id.split('_')[1]}
                      </Badge>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(version.date).toLocaleString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                      <div>
                        <span className="text-slate-500">Exemples</span>
                        <p className="text-white font-mono">{version.examplesCount}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Taille</span>
                        <p className="text-white font-mono">{version.size}</p>
                      </div>
                    </div>
                    {version.comment && (
                      <p className="text-xs text-slate-400 mt-2 italic">
                        📝 {version.comment}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => restoreVersion(version.id)}
                      className="text-blue-400 hover:text-blue-300"
                      title="Restaurer cette version"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}