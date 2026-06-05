// src/components/industrial-vision/ConsoleManager.tsx

// src/components/industrial-vision/ConsoleManager.tsx

'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Terminal,
  Send,
  Trash2,
  Copy,
  CheckCircle,
  AlertCircle,
  Loader2,
  Cpu,
  Database,
  Brain,
  FileJson,
  Image as ImageIcon
} from 'lucide-react';

interface ConsoleMessage {
  id: string;
  type: 'command' | 'output' | 'error' | 'success' | 'info';
  content: string;
  timestamp: Date;
  data?: any;
}

interface Command {
  name: string;
  description: string;
  usage: string;
  action: (args: string[]) => Promise<string>;
}

export function ConsoleManager() {
  const [messages, setMessages] = useState<ConsoleMessage[]>([
    {
      id: 'welcome',
      type: 'success',
      content: 'Industrial Vision Console v1.0 - Prêt',
      timestamp: new Date()
    },
    {
      id: 'welcome-info',
      type: 'info',
      content: 'Tapez "help" pour voir la liste des commandes disponibles',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('console');
  const [stats, setStats] = useState({
    references: 0,
    captures: 0,
    innovations: 40,
    lastAnalysis: null as any
  });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Ajouter un message
  const addMessage = (type: ConsoleMessage['type'], content: string, data?: any) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      type,
      content,
      timestamp: new Date(),
      data
    }]);
  };

  // Commandes disponibles
  const commands: Record<string, Command> = {
    help: {
      name: 'help',
      description: 'Affiche cette aide',
      usage: 'help [commande]',
      action: async (args) => {
        if (args[0]) {
          const cmd = commands[args[0]];
          if (cmd) {
            return `${cmd.name} - ${cmd.description}\nUsage: ${cmd.usage}`;
          }
          return `Commande "${args[0]}" non trouvée`;
        }
        const cmdList = Object.values(commands).map(c => `  ${c.name.padEnd(15)} ${c.description}`).join('\n');
        return `Commandes disponibles:\n${cmdList}\n\nTapez "help <commande>" pour plus de détails`;
      }
    },
    
    status: {
      name: 'status',
      description: 'Affiche l\'état du système',
      usage: 'status',
      action: async () => {
        try {
          const res = await fetch('/api/industrial-vision/reference');
          const data = await res.json();
          return `📊 État du système:\n  • Références: ${data.count || 0}\n  • Innovations: 40 actives\n  • API: OK\n  • RAG: Prêt`;
        } catch (error) {
          return `Erreur lors de la récupération du status`;
        }
      }
    },
    
    analyze: {
      name: 'analyze',
      description: 'Analyse une image',
      usage: 'analyze <chemin_image>',
      action: async (args) => {
        if (!args[0]) return '❌ Usage: analyze <chemin_image>';
        
        addMessage('info', `🔍 Analyse de ${args[0]}...`);
        
        try {
          const res = await fetch(`/api/industrial-vision/analyze?path=${encodeURIComponent(args[0])}`);
          const data = await res.json();
          
          if (data.success) {
            const similarity = data.similarity;
            const bestMatch = similarity?.bestMatch || 'inconnu';
            const confidence = similarity ? (similarity.confidence * 100).toFixed(1) : 'N/A';
            
            return `✅ Analyse terminée\n  • État: ${bestMatch}\n  • Confiance: ${confidence}%\n  • Diagnostic: ${data.diagnostic || 'Non disponible'}`;
          }
          return `❌ Erreur: ${data.error || 'Analyse échouée'}`;
        } catch (error) {
          return `❌ Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`;
        }
      }
    },
    
    list: {
      name: 'list',
      description: 'Liste les références ou captures',
      usage: 'list [references|captures]',
      action: async (args) => {
        const type = args[0] || 'references';
        
        try {
          const res = await fetch(`/api/industrial-vision/${type === 'references' ? 'reference' : 'tree?type=captures'}`);
          const data = await res.json();
          
          if (type === 'references') {
            const items = data.data || [];
            if (items.length === 0) return `📁 Aucune ${type} trouvée`;
            return `📁 ${type.toUpperCase()} (${items.length}):\n${items.map((i: any) => `  • ${i.nom} [${i.type}]`).join('\n')}`;
          }
          
          const items = data.tree?.children || [];
          if (items.length === 0) return `📁 Aucune ${type} trouvée`;
          return `📁 ${type.toUpperCase()} (${items.length}):\n${items.map((i: any) => `  • ${i.name}`).join('\n')}`;
        } catch (error) {
          return `❌ Erreur lors de la récupération de la liste`;
        }
      }
    },
    
    stats: {
      name: 'stats',
      description: 'Affiche les statistiques détaillées',
      usage: 'stats',
      action: async () => {
        try {
          const [refRes, treeRes] = await Promise.all([
            fetch('/api/industrial-vision/reference'),
            fetch('/api/industrial-vision/tree?type=captures&format=simple')
          ]);
          
          const refData = await refRes.json();
          const treeData = await treeRes.json();
          
          const marcheCount = refData.data?.filter((r: any) => r.type === 'marche_normale').length || 0;
          const arretCount = refData.data?.filter((r: any) => r.type === 'arret_normale').length || 0;
          const defautCount = refData.data?.filter((r: any) => r.type === 'defaut').length || 0;
          const capturesCount = treeData.paths?.length || 0;
          
          return `📊 STATISTIQUES\n${'─'.repeat(40)}\n\n📚 RÉFÉRENCES:\n  • Total: ${refData.count || 0}\n  • Marche normale: ${marcheCount}\n  • Arrêt normal: ${arretCount}\n  • Défaut: ${defautCount}\n\n📸 CAPTURES:\n  • Total: ${capturesCount}\n\n🧠 INNOVATIONS:\n  • Actives: 40/40\n  • Niveaux: 4\n\n⚙️ API:\n  • Status: OK\n  • Version: 1.0`;
        } catch (error) {
          return `❌ Erreur lors de la récupération des statistiques`;
        }
      }
    },
    
    scan: {
      name: 'scan',
      description: 'Scanne le dossier de références',
      usage: 'scan',
      action: async () => {
        addMessage('info', '🔄 Scan en cours...');
        
        try {
          const res = await fetch('/api/industrial-vision/rag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'scan' })
          });
          const data = await res.json();
          
          if (data.success) {
            return `✅ Scan terminé\n  • Images traitées: ${data.processed || 0}\n  • Échecs: ${data.failed || 0}`;
          }
          return `❌ Erreur lors du scan: ${data.error || 'Erreur inconnue'}`;
        } catch (error) {
          return `❌ Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`;
        }
      }
    },
    
    clear: {
      name: 'clear',
      description: 'Efface la console',
      usage: 'clear',
      action: async () => {
        setMessages([]);
        return ''; // Ne pas ajouter de message après clear
      }
    },
    
    innovations: {
      name: 'innovations',
      description: 'Affiche la liste des innovations',
      usage: 'innovations [level]',
      action: async (args) => {
        const level = args[0] ? parseInt(args[0]) : null;
        
        const innovationsByLevel: Record<number, string[]> = {
          1: ['Indexation texte', 'Détection familles', 'Signature spatiale', 'Masques Voronoï', 'Recherche cross-modale', 'Détection anomalies', 'Alt text auto', 'Détection manquants', 'Carte interactive', 'Versioning sémantique'],
          2: ['Redondance fonctionnelle', 'Hiérarchie', 'Motifs spatiaux', 'Flux orientation', 'Points ancrage', 'Contraintes topologiques', 'Reconstruction 2.5D', 'Organes fantômes', 'Charge cognitive', 'Quiz auto'],
          3: ['Stylométrie', 'Ordre lecture', 'Contre-sens', 'Compression sémantique', 'Échelle métrologique', 'Criticité', 'Distance édition', 'Légende auto', 'Détection boucles', 'Datation style'],
          4: ['Détection voyants', 'Lecture cadrans', 'Fusion voyant+valeur', 'Analyse tendance', 'Détection cycles', 'Corrélation', 'Détection dérive', 'Timeline', 'Rapport incident', 'Dashboard temps réel']
        };
        
        if (level && (level < 1 || level > 4)) {
          return `❌ Niveau invalide. Utilisez 1-4`;
        }
        
        let output = '';
        if (level) {
          output = `🧠 INNOVATIONS - Niveau ${level}\n${'─'.repeat(40)}\n`;
          innovationsByLevel[level].forEach((inv, i) => {
            output += `  ${(i+1).toString().padStart(2)}. ${inv}\n`;
          });
        } else {
          output = `🧠 INNOVATIONS (40 actives)\n${'─'.repeat(40)}\n`;
          for (let l = 1; l <= 4; l++) {
            output += `\nNiveau ${l}: ${innovationsByLevel[l].length} innovations\n`;
          }
          output += `\nTapez "innovations <level>" pour voir les détails`;
        }
        
        return output;
      }
    },
    
    echo: {
      name: 'echo',
      description: 'Affiche un message',
      usage: 'echo <message>',
      action: async (args) => {
        return args.join(' ') || '';
      }
    },
    
    version: {
      name: 'version',
      description: 'Affiche la version',
      usage: 'version',
      action: async () => {
        return `Industrial Vision Module v1.0.0\n40 innovations IA\n4 niveaux d'analyse\nRAG Vision intégré`;
      }
    }
  };

  // Exécuter une commande
  const executeCommand = async (commandLine: string) => {
    const parts = commandLine.trim().split(/\s+/);
    const cmdName = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    // Ajouter la commande à l'historique
    addMessage('command', `$ ${commandLine}`);
    
    if (!cmdName) return;
    
    const command = commands[cmdName];
    if (!command) {
      addMessage('error', `Commande non trouvée: ${cmdName}. Tapez "help" pour voir les commandes disponibles.`);
      return;
    }
    
    setIsProcessing(true);
    try {
      const output = await command.action(args);
      if (output) {
        addMessage('output', output);
      }
    } catch (error) {
      addMessage('error', `Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Soumettre la commande
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    
    const commandLine = input;
    setInput('');
    await executeCommand(commandLine);
  };

  // Copier la console
  const copyConsole = () => {
    const text = messages.map(m => {
      const prefix = {
        command: '$',
        output: '>',
        error: '!',
        success: '✓',
        info: 'ℹ'
      }[m.type];
      return `${prefix} ${m.content}`;
    }).join('\n');
    
    navigator.clipboard.writeText(text);
    addMessage('success', 'Console copiée dans le presse-papier');
  };

  // Effacer la console
  const clearConsole = () => {
    setMessages([]);
    addMessage('success', 'Console effacée');
  };

  // Charger les stats
  const loadStats = async () => {
    try {
      const res = await fetch('/api/industrial-vision/reference');
      const data = await res.json();
      setStats(prev => ({ ...prev, references: data.count || 0 }));
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const getMessageIcon = (type: ConsoleMessage['type']) => {
    switch (type) {
      case 'command': return <Terminal className="h-3.5 w-3.5 text-cyan-400" />;
      case 'output': return <FileJson className="h-3.5 w-3.5 text-gray-400" />;
      case 'error': return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
      case 'success': return <CheckCircle className="h-3.5 w-3.5 text-green-400" />;
      case 'info': return <Cpu className="h-3.5 w-3.5 text-blue-400" />;
      default: return null;
    }
  };

  const getMessageClass = (type: ConsoleMessage['type']) => {
    switch (type) {
      case 'command': return 'text-cyan-400';
      case 'output': return 'text-gray-300';
      case 'error': return 'text-red-400';
      case 'success': return 'text-green-400';
      case 'info': return 'text-blue-400';
      default: return 'text-gray-300';
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-cyan-500" />
            Console Industrielle
            <Badge variant="outline" className="ml-2">v1.0</Badge>
          </CardTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={copyConsole}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={clearConsole}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="console">
              <Terminal className="h-3.5 w-3.5 mr-1" />
              Console
            </TabsTrigger>
            <TabsTrigger value="commands">
              <Cpu className="h-3.5 w-3.5 mr-1" />
              Commandes
            </TabsTrigger>
          </TabsList>

          {/* Tab Console */}
          <TabsContent value="console" className="mt-0">
            <div className="bg-gray-900 dark:bg-black rounded-lg overflow-hidden">
              {/* Zone des messages */}
              <ScrollArea className="h-[400px] p-4" ref={scrollRef}>
                <div className="space-y-1 font-mono text-sm">
                  {messages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-2">
                      <span className="flex-shrink-0 mt-0.5">
                        {getMessageIcon(msg.type)}
                      </span>
                      <span className={`flex-1 break-all ${getMessageClass(msg.type)}`}>
                        {msg.content}
                      </span>
                      <span className="text-xs text-gray-600 flex-shrink-0">
                        {msg.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                  {isProcessing && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Exécution...</span>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Ligne de commande */}
              <form onSubmit={handleSubmit} className="border-t border-gray-800 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 font-mono text-sm">$</span>
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Tapez une commande..."
                    className="flex-1 font-mono text-sm bg-transparent border-none shadow-none focus-visible:ring-0"
                    disabled={isProcessing}
                  />
                  <Button type="submit" size="sm" disabled={isProcessing || !input.trim()}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </form>
            </div>

            {/* Quick actions */}
            <div className="flex flex-wrap gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => executeCommand('help')}>
                help
              </Button>
              <Button variant="outline" size="sm" onClick={() => executeCommand('status')}>
                status
              </Button>
              <Button variant="outline" size="sm" onClick={() => executeCommand('stats')}>
                stats
              </Button>
              <Button variant="outline" size="sm" onClick={() => executeCommand('innovations')}>
                innovations
              </Button>
              <Button variant="outline" size="sm" onClick={() => executeCommand('list references')}>
                list
              </Button>
              <Button variant="outline" size="sm" onClick={() => executeCommand('scan')}>
                scan
              </Button>
            </div>
          </TabsContent>

          {/* Tab Commandes */}
          <TabsContent value="commands" className="mt-0">
            <ScrollArea className="h-[450px]">
              <div className="space-y-3">
                {Object.values(commands).map((cmd) => (
                  <div key={cmd.name} className="border-b border-gray-200 dark:border-gray-800 pb-2">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-cyan-600 dark:text-cyan-400">
                        {cmd.name}
                      </code>
                      <Badge variant="outline" className="text-xs">
                        {cmd.usage}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{cmd.description}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Stats rapides */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t">
          <div className="text-center">
            <Database className="h-4 w-4 mx-auto text-gray-400" />
            <p className="text-xs text-gray-500 mt-1">Références</p>
            <p className="text-sm font-bold">{stats.references}</p>
          </div>
          <div className="text-center">
            <ImageIcon className="h-4 w-4 mx-auto text-gray-400" />
            <p className="text-xs text-gray-500 mt-1">Innovations</p>
            <p className="text-sm font-bold">{stats.innovations}</p>
          </div>
          <div className="text-center">
            <Brain className="h-4 w-4 mx-auto text-gray-400" />
            <p className="text-xs text-gray-500 mt-1">RAG</p>
            <p className="text-sm font-bold">Actif</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}