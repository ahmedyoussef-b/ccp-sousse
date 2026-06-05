// components/training/ColabLauncher.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, ExternalLink, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ColabLauncher() {
  const { toast } = useToast();
  const [tunnelUrl, setTunnelUrl] = useState('http://localhost:3000');
  
  // Générer le lien Colab avec pré-remplissage
  
  const copyNotebookCode = () => {
    navigator.clipboard.writeText(getNotebookContent());
    toast({ title: 'Code copié !', description: 'Collez-le dans Colab' });
  };
  
  return (
    <Card className="border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          Lancement rapide Colab
        </CardTitle>
        <CardDescription>
          Générez un notebook pré-configuré pour votre dataset
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>URL de votre application (tunnel si nécessaire)</Label>
          <div className="flex gap-2 mt-1">
            <Input 
              value={tunnelUrl} 
              onChange={(e) => setTunnelUrl(e.target.value)}
              placeholder="http://localhost:3000 ou https://votre-tunnel.ngrok.io"
              className="bg-slate-900 border-slate-700"
            />
            <Button variant="outline" onClick={() => {
              navigator.clipboard.writeText(tunnelUrl);
              toast({ title: 'URL copiée' });
            }}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Si Colab est sur une autre machine, utilisez ngrok ou Cloudflare Tunnel
          </p>
        </div>
        
        <div className="flex gap-3 flex-wrap">
          <Button onClick={copyNotebookCode} className="bg-emerald-600 hover:bg-emerald-700">
            <Copy className="w-4 h-4 mr-2" />
            Copier le code du notebook
          </Button>
          <Button onClick={() => window.open('https://colab.research.google.com', '_blank')} variant="outline">
            <ExternalLink className="w-4 h-4 mr-2" />
            Ouvrir Google Colab
          </Button>
        </div>
        
        <div className="bg-slate-950 rounded-lg p-4 text-sm">
          <p className="text-slate-400 mb-2">📋 Instructions:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-300">
            <li>Cliquez sur "Copier le code du notebook"</li>
            <li>Ouvrez Google Colab (nouveau notebook)</li>
            <li>Collez le code dans la première cellule</li>
            <li>Modifiez APP_URL si nécessaire</li>
            <li>Exécutez toutes les cellules (Runtime → Run all)</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

function getNotebookContent() {
  return `# CCP Fine-tuning Notebook
# Copiez ce code dans Google Colab

# Cellule 1: Installation
!pip install unsloth transformers datasets peft trl accelerate -q

# Cellule 2: Configuration
APP_URL = "http://localhost:3000"  # MODIFIEZ ICI

# Cellule 3: Récupération du dataset
import requests
response = requests.get(f"{APP_URL}/api/training/export/jsonl")
with open("dataset.jsonl", "wb") as f:
    f.write(response.content)
print(f"Dataset récupéré: {sum(1 for _ in open('dataset.jsonl'))} exemples")

# Cellule 4: Entraînement (voir code complet ci-dessus)
# ... (reste du code du notebook)
`;
}