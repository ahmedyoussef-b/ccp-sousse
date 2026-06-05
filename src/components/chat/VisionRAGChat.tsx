// src/components/chat/VisionRAGChat.tsx

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Send, 
  Loader2, 
  Brain, 
  Lightbulb,
  Sparkles,
  TrendingUp} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  usedInnovations?: Array<{ innovationId: number; innovationName: string }>;
}

interface VisionRAGChatProps {
  currentAnalysis?: any;
  onAnalysisRequest?: () => void;
}

export function VisionRAGChat({ currentAnalysis, onAnalysisRequest }: VisionRAGChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '👋 Bonjour ! Je suis votre assistant **Vision RAG**. Je peux analyser vos images industrielles, détecter automatiquement les innovations pertinentes et répondre à vos questions. Posez-moi une question !',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const suggestions = [
    { text: "Où se trouve le condenseur ?", icon: "📍", innovation: "localisation" },
    { text: "Quelle est la pression actuelle ?", icon: "📊", innovation: "mesure" },
    { text: "Y a-t-il des anomalies ?", icon: "⚠️", innovation: "anomalie" },
    { text: "Décris l'image analysée", icon: "📝", innovation: "description" },
    { text: "Analyse les tendances", icon: "📈", innovation: "tendance" }
  ];

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setShowSuggestions(false);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          currentAnalysis: currentAnalysis,
          useVisionRAG: true
        })
      });

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.content || 'Je n\'ai pas pu traiter votre demande.',
        timestamp: new Date(),
        usedInnovations: data.usedInnovations
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (error) {
      console.error('Erreur:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Désolé, une erreur est survenue. Veuillez réessayer.',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            Vision RAG - Chat Intelligent
            <Badge variant="outline" className="ml-2">
              <Sparkles className="h-3 w-3 mr-1" />
              40 innovations IA
            </Badge>
          </CardTitle>
          {!currentAnalysis && (
            <Button size="sm" variant="outline" onClick={onAnalysisRequest}>
              <TrendingUp className="h-3.5 w-3.5 mr-1" />
              Analyser une image
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  
                  {/* Innovations utilisées */}
                  {msg.usedInnovations && msg.usedInnovations.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/20">
                      <div className="flex flex-wrap gap-1">
                        {msg.usedInnovations.map((inv) => (
                          <Badge key={inv.innovationId} variant="secondary" className="text-[10px] gap-1">
                            <Lightbulb className="h-2.5 w-2.5" />
                            {inv.innovationName}
                          </Badge>
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

        {/* Suggestions */}
        {showSuggestions && messages.length <= 2 && (
          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-2">Suggestions :</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((sug, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => sendMessage(sug.text)}
                >
                  <span className="mr-1">{sug.icon}</span>
                  {sug.text}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Zone de saisie */}
        <div className="mt-4 pt-4 border-t">
          <div className="flex gap-2">
            <Input
              id="vision-rag-chat-input"
              name="vision-rag-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage(input)}
              placeholder="Posez une question sur votre installation industrielle..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            🔍 La question est automatiquement analysée pour utiliser les innovations IA pertinentes
          </p>
        </div>
      </CardContent>
    </Card>
  );
}