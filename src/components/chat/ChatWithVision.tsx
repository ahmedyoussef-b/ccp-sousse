// src/components/chat/ChatWithVision.tsx

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Send, 
  Brain,
  Loader2
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  context?: any;
}

interface VisionContext {
  analyses: any[];
  query: string;
  timestamp: number;
}

export function ChatWithVision() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Bonjour ! Je suis votre assistant spécialisé en vision industrielle. Je peux vous aider à analyser vos images, rechercher des schémas similaires, ou répondre à des questions sur vos équipements. Que puis-je faire pour vous ?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [visionContext, setVisionContext] = useState<VisionContext | null>(null);

  // Recherche dans les analyses RAG
  const searchRag = async (query: string) => {
    const response = await fetch(`/api/industrial-vision/rag?action=search&query=${encodeURIComponent(query)}`);
    const data = await response.json();
    return data.results || [];
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Rechercher dans le contexte vision
      const ragResults = await searchRag(input);
      
      // Construire le contexte pour l'IA
      let contextPrompt = '';
      if (ragResults.length > 0) {
        contextPrompt = `\n\nContexte d'analyses industrielles pertinentes:\n`;
        for (const result of ragResults.slice(0, 3)) {
          contextPrompt += `- ${result.texteDescriptif}\n`;
        }
      }

      // Appeler l'API chat avec contexte vision
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          context: contextPrompt,
          systemPrompt: `Tu es un assistant expert en analyse industrielle. Tu as accès à une base d'images industrielles analysées avec 40 innovations IA. Utilise les informations fournies dans le contexte pour répondre précisément aux questions sur les organes, les états (marche/arrêt/défaut), les voyants, et les mesures.`
        })
      });

      const data = await response.json();
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.content || 'Je n\'ai pas pu traiter votre demande.',
        timestamp: new Date(),
        context: ragResults
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (error) {
      console.error('Erreur:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Désolé, une erreur est survenue. Veuillez réessayer.',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* En-tête */}
      <div className="border-b p-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-blue-500" />
          <h2 className="font-semibold">Chat Vision Industrielle</h2>
          <Badge variant="outline" className="ml-2">RAG Vision</Badge>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          40 innovations IA | Recherche dans {visionContext?.analyses?.length || 0} analyses
        </p>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                {msg.context && msg.context.length > 0 && (
                  <div className="mt-2 text-xs opacity-70">
                    <p>📊 {msg.context.length} analyse(s) pertinente(s)</p>
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

      {/* Input */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Posez une question sur vos images industrielles..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button onClick={sendMessage} disabled={isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2 mt-2 text-xs text-gray-500">
          <button 
            onClick={async () => {
              const results = await searchRag('condenseur');
              setVisionContext({ analyses: results, query: 'condenseur', timestamp: Date.now() });
            }}
            className="hover:text-blue-500"
          >
            🔍 Exemple: condenseur
          </button>
          <button 
            onClick={async () => {
              const results = await searchRag('pression');
              setVisionContext({ analyses: results, query: 'pression', timestamp: Date.now() });
            }}
            className="hover:text-blue-500"
          >
            📊 pression
          </button>
          <button 
            onClick={async () => {
              const results = await searchRag('défaut');
              setVisionContext({ analyses: results, query: 'défaut', timestamp: Date.now() });
            }}
            className="hover:text-blue-500"
          >
            ⚠️ défaut
          </button>
        </div>
      </div>
    </div>
  );
}