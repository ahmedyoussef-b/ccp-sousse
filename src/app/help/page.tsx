'use client';

import Link from 'next/link';
import { ArrowLeft, HelpCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function HelpPage() {
  const troubleshootingData = [
    {
      problem: "Erreur 500 à l'upload",
      cause: "ChromaDB non démarré",
      solution: "Lancer 'chroma run --path ./data/chromadb --port 8000'"
    },
    {
      problem: "L'IA répond en anglais",
      cause: "Prompt système trop faible",
      solution: "Modifier agent.js pour renforcer les instructions en français"
    },
    {
      problem: "Documents non trouvés",
      cause: "Embeddings incorrects",
      solution: "Réuploader le document, vérifier nomic-embed-text"
    },
    {
      problem: "Erreur de compilation",
      cause: "TypeScript",
      solution: "Vérifier tsconfig.json, lancer npm run build"
    },
    {
      problem: "Port déjà utilisé",
      cause: "Conflit de ports",
      solution: "Modifier les ports dans .env"
    },
    {
      problem: "Ollama introuvable",
      cause: "Service non démarré",
      solution: "Lancer ollama serve"
    }
  ];

  return (
    <div className="min-h-screen bg-[#171717] text-white p-4 md:p-8">
      <header className="flex justify-between items-center mb-10 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <HelpCircle className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">CENTRE D'AIDE & DÉPANNAGE</h1>
        </div>
        
        <Button 
          variant="outline" 
          size="icon" 
          asChild
          className="bg-white/5 border-white/10 hover:bg-white/10"
        >
          <Link href="/">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
      </header>

      <main className="max-w-5xl mx-auto space-y-8">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-[#2f2f2f] border-white/5 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-400" /> Guide d'utilisation
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-gray-400">
              Uploadez vos documents, l'IA les découpe en segments de 1000 caractères pour une recherche optimale.
            </CardContent>
          </Card>
          <Card className="bg-[#2f2f2f] border-white/5 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" /> Mode 100% Local
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-gray-400">
              Toutes les données restent sur votre machine. ChromaDB et Ollama gèrent le RAG en toute confidentialité.
            </CardContent>
          </Card>
          <Card className="bg-[#2f2f2f] border-white/5 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" /> Pré-requis
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-gray-400">
              Assurez-vous que les services Ollama et ChromaDB sont actifs avant de poser une question.
            </CardContent>
          </Card>
        </section>

        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <span className="text-lg font-bold uppercase tracking-tight">Problèmes Courants et Solutions</span>
            <div className="h-px flex-1 bg-white/5" />
          </div>

          <Card className="bg-[#2f2f2f] border-white/5 text-white overflow-hidden shadow-2xl">
            <Table>
              <TableHeader className="bg-white/5">
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-gray-400 text-xs font-bold uppercase py-4">Problème</TableHead>
                  <TableHead className="text-gray-400 text-xs font-bold uppercase py-4">Cause probable</TableHead>
                  <TableHead className="text-gray-400 text-xs font-bold uppercase py-4">Solution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {troubleshootingData.map((item, idx) => (
                  <TableRow key={idx} className="border-white/5 hover:bg-white/5 transition-colors">
                    <TableCell className="font-bold text-sm py-4">{item.problem}</TableCell>
                    <TableCell className="text-gray-400 text-sm">{item.cause}</TableCell>
                    <TableCell className="py-4">
                      <code className="px-2 py-1 bg-black/40 rounded text-blue-300 text-xs font-mono">
                        {item.solution}
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      </main>
    </div>
  );
}
