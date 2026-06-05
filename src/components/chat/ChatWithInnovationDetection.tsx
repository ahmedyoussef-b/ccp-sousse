// src/components/chat/ChatWithInnovationDetection.tsx

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Send,
  Lightbulb,
  Cpu,
  Sparkles,
  Loader2,
  Zap,
  HelpCircle,
  Brain} from 'lucide-react';

import { visionChatIntegration } from '@/lib/industrial-vision/chat/vision-chat-integration';
import { InnovationDetectionResult } from '@/lib/industrial-vision';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  innovations?: InnovationDetectionResult[];
  intent?: string;
}

export function ChatWithInnovationDetection() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Bonjour ! Je suis votre assistant IA spécialisé en vision industrielle. Je détecte automatiquement les innovations pertinentes pour répondre à vos questions. Que puis-je faire pour vous ?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [detectedInnovations, setDetectedInnovations] = useState<InnovationDetectionResult[]>([]);
  const [activeTab, setActiveTab] = useState('chat');

  // Prédétection pendant que l'utilisateur tape
  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.length > 10) {
      const innovations = visionChatIntegration.processUserQuery(value);
      innovations.then(result => {
        setDetectedInnovations(result.detectedInnovations.slice(0, 3));
      });
    } else {
      setDetectedInnovations([]);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setDetectedInnovations([]);

    try {
      // 1. Traiter la requête avec prédétection d'innovations
      const result = await visionChatIntegration.processUserQuery(input);
      let innovationResultText = '';
      const topInv = result.detectedInnovations.find(inv => inv.score > 80);

      // 2. Si une innovation est fortement détectée, l'exécuter "pour de vrai"
      if (topInv) {
        try {
          const execRes = await fetch('/api/industrial-vision/innovations/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              innovationId: topInv.innovationId,
              innovationName: topInv.innovationName,
              query: input
            })
          });
          const execData = await execRes.json();
          if (execData.success) {
            innovationResultText = `\n\n---\n**[SYSTÈME] Exécution de l'innovation #${topInv.innovationId} (${topInv.innovationName})**\n${execData.result}`;
          }
        } catch (e) {
          console.error('[Innovation Auto-Exec Error]', e);
        }
      }
      
      // 3. Appel API chat classique avec le prompt enrichi
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          systemPrompt: `${result.enhancedPrompt}\n\nIMPORTANT: Une innovation a été exécutée. Voici ses résultats réels à intégrer dans ta réponse : ${innovationResultText}`,
          innovations: result.detectedInnovations,
          intent: result.intent
        })
      });

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: (data.content || 'Je n\'ai pas pu traiter votre demande.') + (innovationResultText ? '\n\n*(Données extraites en temps réel via le moteur de vision)*' : ''),
        timestamp: new Date(),
        innovations: result.detectedInnovations.slice(0, 3),
        intent: result.intent.primary
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (error) {
      console.error('Erreur:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Désolé, une erreur est survenue. Veuillez réessayer.',
        timestamp: new Date(),
        innovations: []
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExploitInnovation = (inv: InnovationDetectionResult) => {
    // Simuler une réponse guidée
    const guideMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Je vais vous guider pour exploiter l'innovation **#${inv.innovationId}: ${inv.innovationName}**. 
      
      Cette innovation permet de : ${inv.reason}
      
      **Étape 1: Préparation**
      Avez-vous les données suivantes prêtes ? : ${inv.matchedKeywords.join(', ')}
      
      Souhaitez-vous que je lance l'analyse maintenant ?`,
      timestamp: new Date(),
      innovations: [inv]
    };
    setMessages(prev => [...prev, guideMessage]);
  };


  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            Chat IA Vision Industrielle
            <Badge variant="outline" className="ml-2">
              <Zap className="h-3 w-3 mr-1" />
              Prédétection IA
            </Badge>
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="chat">💬 Chat</TabsTrigger>
            <TabsTrigger value="innovations">
              <Lightbulb className="h-3.5 w-3.5 mr-1" />
              Innovations suggérées
              {detectedInnovations.length > 0 && (
                <Badge className="ml-2 h-4 px-1 text-[10px]">
                  {detectedInnovations.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden mt-0">
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        msg.role === 'user'
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      
                      {/* Affichage des innovations utilisées */}
                      {msg.innovations && msg.innovations.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/20">
                          <p className="text-xs opacity-70 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            Innovations utilisées:
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {msg.innovations.map((inv) => (
                              <div key={inv.innovationId} className="flex items-center gap-1">
                                <Badge variant="secondary" className="text-[10px]">
                                  #{inv.innovationId} {inv.innovationName.split(' ')[0]}
                                </Badge>
                                {msg.role === 'assistant' && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-5 px-1 text-[8px] hover:bg-white/20"
                                    onClick={() => handleExploitInnovation(inv)}
                                  >
                                    <HelpCircle className="h-3 w-3 mr-0.5" />
                                    Guider
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>

                        </div>
                      )}
                      
                      <p className="text-xs opacity-50 mt-1">
                        {msg.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Zone de saisie avec prédétection */}
            <div className="mt-4 pt-4 border-t">
              {detectedInnovations.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {detectedInnovations.map((inv) => (
                    <Badge key={inv.innovationId} variant="outline" className="text-[10px] gap-1">
                      <Sparkles className="h-2.5 w-2.5 text-yellow-500" />
                      {inv.innovationName}
                      <span className="text-gray-400 ml-1">({inv.score.toFixed(0)}%)</span>
                    </Badge>
                  ))}
                </div>
              )}
              
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Posez une question... (ex: où se trouve le condenseur, quelle est la pression, y a-t-il une anomalie?)"
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button onClick={sendMessage} disabled={isLoading || !input.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500">
                <button 
                  onClick={() => handleInputChange("Où se trouve le condenseur ?")}
                  className="hover:text-purple-500 transition-colors"
                >
                  📍 localisation
                </button>
                <button 
                  onClick={() => handleInputChange("Quelle est la pression actuelle ?")}
                  className="hover:text-purple-500 transition-colors"
                >
                  📊 pression
                </button>
                <button 
                  onClick={() => handleInputChange("Y a-t-il une anomalie détectée ?")}
                  className="hover:text-purple-500 transition-colors"
                >
                  ⚠️ anomalie
                </button>
                <button 
                  onClick={() => handleInputChange("Décris-moi cette image")}
                  className="hover:text-purple-500 transition-colors"
                >
                  📝 description
                </button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="innovations" className="mt-0">
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                <p className="text-sm text-gray-500 mb-3">
                  Innovations détectées automatiquement en fonction de votre question ou du contexte
                </p>
                {detectedInnovations.length > 0 ? (
                  detectedInnovations.map((inv) => (
                    <div key={inv.innovationId} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-cyan-500" />
                          <span className="font-medium">#{inv.innovationId}</span>
                          <Badge variant="outline" className="text-xs">
                            Score: {inv.score.toFixed(0)}%
                          </Badge>
                        </div>
                        <Badge className="text-[10px]">
                          Niveau {Math.floor(inv.innovationId / 10) + 1}
                        </Badge>
                      </div>
                      <p className="font-medium mt-1">{inv.innovationName}</p>
                      <p className="text-xs text-gray-500 mt-1">{inv.reason}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {inv.matchedKeywords.slice(0, 5).map((kw, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                      <Button 
                        variant="default" 
                        size="sm" 
                        className="w-full mt-3 h-8 text-xs bg-purple-600 hover:bg-purple-700"
                        onClick={() => {
                          handleExploitInnovation(inv);
                          setActiveTab('chat');
                        }}
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        Exploiter cette innovation
                      </Button>
                    </div>

                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Lightbulb className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Aucune innovation détectée</p>
                    <p className="text-sm">Posez une question pour voir les innovations pertinentes</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}