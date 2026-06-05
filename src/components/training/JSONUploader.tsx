// components/training/JSONUploader.tsx - Version avec gestion des types

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileJson, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface JSONUploaderProps {
  onUploadComplete: () => void;
}

interface UploadResult {
  success: boolean;
  count?: number;
  error?: string;
  format?: string;
  total?: number;
  message?: string;
}

export function JSONUploader({ onUploadComplete }: JSONUploaderProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast({
        title: 'Format invalide',
        description: 'Veuillez uploader un fichier JSON',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    setProgress(0);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setProgress((e.loaded / e.total) * 100);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setResult({ 
            success: true, 
            count: response.count ?? 0,
            format: response.format,
            total: response.total,
            message: response.message
          });
          toast({
            title: '✅ Import réussi',
            description: response.message || `${response.count ?? 0} exemples ajoutés`,
          });
          onUploadComplete();
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            setResult({ success: false, error: error.error });
            toast({
              title: '❌ Erreur',
              description: error.error,
              variant: 'destructive',
            });
          } catch {
            setResult({ success: false, error: 'Erreur serveur' });
            toast({
              title: '❌ Erreur',
              description: 'Erreur lors du traitement du fichier',
              variant: 'destructive',
            });
          }
        }
        setUploading(false);
      });

      xhr.addEventListener('error', () => {
        setResult({ success: false, error: 'Erreur réseau' });
        setUploading(false);
        toast({
          title: '❌ Erreur réseau',
          description: 'Impossible de contacter le serveur',
          variant: 'destructive',
        });
      });

      xhr.open('POST', '/api/training/upload-dataset');
      xhr.send(formData);
    } catch (error) {
      setResult({ success: false, error: 'Erreur lors de l\'upload' });
      setUploading(false);
    }
  };

  return (
    <Card className="border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileJson className="w-4 h-4 text-emerald-400" />
          Import JSON
        </CardTitle>
        <CardDescription>
          Importez un fichier JSON contenant des paires Question/Réponse ou des procédures structurées (conversion auto)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-emerald-500/50 transition-colors">
          <input
            type="file"
            accept=".json"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
            id="json-upload"
          />
          <label htmlFor="json-upload" className="cursor-pointer">
            <Upload className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400 mb-2">
              Glissez-déposez ou cliquez pour sélectionner
            </p>
            <p className="text-xs text-slate-500">
              Formats supportés: JSON, JSONL | Conversion auto des procédures
            </p>
          </label>
        </div>

        {uploading && (
          <div className="mt-4 space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-slate-400 text-center">
              Upload en cours... {Math.round(progress)}%
            </p>
          </div>
        )}

        {/* Message de succès avec détails de conversion */}
        {result && result.success && (
          <Alert className="mt-4 border-emerald-500/50 bg-emerald-500/10">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <AlertDescription className="space-y-1">
              <p>✅ {result.count ?? 0} exemples importés avec succès</p>
              {result.format === 'auto_converted' && (
                <p className="text-xs text-emerald-400/80 flex items-center gap-1 mt-1">
                  <RefreshCw className="w-3 h-3" />
                  Conversion automatique effectuée depuis votre fichier de procédure
                </p>
              )}
              {result.total && result.total > (result.count ?? 0) && (
                <p className="text-xs text-slate-400">
                  Total dans la base: {result.total} exemples
                </p>
              )}
              {result.message && result.format !== 'auto_converted' && (
                <p className="text-xs text-slate-400 mt-1">
                  {result.message}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Message d'erreur */}
        {result && !result.success && (
          <Alert className="mt-4 border-red-500/50 bg-red-500/10">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription>
              ❌ {result.error ?? 'Erreur inconnue'}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}