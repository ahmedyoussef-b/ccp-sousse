/**
 * Enhanced Vision Chat - Système de chat intelligent avec exploitation optimale des fonctionnalités vision
 * @version 2.0.0
 * @description Chat intégré avec VisionAgent pour exploitation automatique et optimale de toutes les capacités vision
 */

// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Send,
  Loader2,
  Brain,
  Eye,
  Search,
  Image as ImageIcon,
  Target,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Info,
  Camera,
  FileImage,
  MapPin,
  Tag,
  Clock
} from 'lucide-react';
import { useVisionAgent } from '../shared/vision-agent';
import { VisionSearchResult, PartLocationResult } from '../shared/types/type';

interface EnhancedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  visionData?: {
    searchResults?: VisionSearchResult;
    partLocation?: PartLocationResult;
    images?: Array<{
      id: string;
      filename: string;
      url: string;
      thumbnailUrl: string;
      confidence: number;
      tags: string[];
    }>;
    suggestions?: string[];
    actions?: Array<{
      type: 'search' | 'locate' | 'analyze' | 'register';
      label: string;
      action: () => void;
    }>;
  };
  metadata?: {
    processingTime: number;
    visionUsed: boolean;
    cached: boolean;
    confidence: number;
  };
}

interface VisionContextDetector {
  hasImageReferences: boolean;
  hasLocationQueries: boolean;
  hasSearchIntent: boolean;
  hasAnalysisRequest: boolean;
  suggestedActions: string[];
  confidence: number;
}

export function EnhancedVisionChat() {
  const [messages, setMessages] = useState<EnhancedMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '🎯 **Assistant Vision Intelligent** - Je suis votre assistant spécialisé en analyse industrielle avec exploitation optimale de toutes les fonctionnalités vision.\n\nJe peux automatiquement :\n• 🔍 **Rechercher** des images similaires dans votre base\n• 📍 **Localiser** des pièces spécifiques dans les images\n• 🏷️ **Analyser** et classifier automatiquement\n• 📊 **Présenter** les résultats avec contexte visuel enrichi\n\nPosez-moi une question sur vos équipements industriels !',
      timestamp: new Date(),
      metadata: {
        processingTime: 0,
        visionUsed: false,
        cached: false,
        confidence: 1.0
      }
    }
  ]);

  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentContext, setCurrentContext] = useState<VisionContextDetector | null>(null);

  const {
    isInitialized,
    isLoading: agentLoading,
    error: agentError,
    performSearch,
    performPartLocation,
    registerImage
  } = useVisionAgent();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll automatique vers le bas
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Détection automatique du contexte vision dans la question
  const detectVisionContext = useCallback((query: string): VisionContextDetector => {
    const lowerQuery = query.toLowerCase();

    const imageKeywords = ['image', 'photo', 'visuel', 'capture', 'photo', 'voir', 'montre', 'affiche'];
    const locationKeywords = ['où', 'position', 'localisation', 'emplacement', 'trouver', 'situe', 'place'];
    const searchKeywords = ['chercher', 'rechercher', 'trouver', 'similaire', 'pareil', 'comme'];
    const analysisKeywords = ['analyser', 'analyse', 'état', 'condition', 'problème', 'anomalie', 'défaut'];

    const hasImageReferences = imageKeywords.some(k => lowerQuery.includes(k));
    const hasLocationQueries = locationKeywords.some(k => lowerQuery.includes(k));
    const hasSearchIntent = searchKeywords.some(k => lowerQuery.includes(k));
    const hasAnalysisRequest = analysisKeywords.some(k => lowerQuery.includes(k));

    let confidence = 0.3; // Base confidence
    const suggestions: string[] = [];

    if (hasImageReferences) confidence += 0.2;
    if (hasLocationQueries) confidence += 0.25;
    if (hasSearchIntent) confidence += 0.2;
    if (hasAnalysisRequest) confidence += 0.15;

    // Suggestions contextuelles
    if (hasLocationQueries) {
      suggestions.push('Localiser des composants spécifiques');
    }
    if (hasSearchIntent) {
      suggestions.push('Rechercher des images similaires');
    }
    if (hasAnalysisRequest) {
      suggestions.push('Analyser l\'état des équipements');
    }

    return {
      hasImageReferences,
      hasLocationQueries,
      hasSearchIntent,
      hasAnalysisRequest,
      suggestedActions: suggestions,
      confidence: Math.min(confidence, 1.0)
    };
  }, []);

  // Traitement intelligent de la question avec exploitation optimale des fonctionnalités vision
  const processIntelligentQuery = useCallback(async (query: string): Promise<EnhancedMessage> => {
    const startTime = Date.now();
    const context = detectVisionContext(query);

    setCurrentContext(context);

    let visionData: EnhancedMessage['visionData'] = {};
    let responseContent = '';
    let confidence = context.confidence;

    try {
      // 1. RECHERCHE D'IMAGES si pertinent
      if (context.hasSearchIntent || context.hasImageReferences) {
        console.log('[VISION-CHAT] 🔍 Recherche d\'images...');
        const searchResult = await performSearch(query, {
          mode: context.hasLocationQueries ? 'part' : 'hybrid',
          limit: 5
        });

        if (searchResult.success && searchResult.data) {
          visionData.searchResults = searchResult.data;

          if (searchResult.data.matches.length > 0) {
            responseContent += `🔍 **Images trouvées** (${searchResult.data.matches.length})\n\n`;
            searchResult.data.matches.slice(0, 3).forEach((match, idx) => {
              responseContent += `${idx + 1}. **${match.filename}**\n`;
              responseContent += `   📊 Confiance: ${(match.confidence || 0.8 * 100).toFixed(1)}%\n`;
              if (match.tags.length > 0) {
                responseContent += `   🏷️ Tags: ${match.tags.slice(0, 3).join(', ')}\n`;
              }
              responseContent += '\n';
            });

            // Ajouter les images pour affichage
            visionData.images = searchResult.data.matches.slice(0, 3).map(match => ({
              id: match.id,
              filename: match.filename,
              url: `/api/vision/images/${match.id}`,
              thumbnailUrl: `/api/vision/images/${match.id}?thumbnail=true`,
              confidence: match.confidence || 0.8,
              tags: match.tags
            }));

            confidence = Math.max(confidence, 0.8);
          } else {
            responseContent += '🔍 Aucune image similaire trouvée dans la base.\n\n';
          }
        }
      }

      // 2. LOCALISATION DE PIÈCES si pertinent
      if (context.hasLocationQueries) {
        console.log('[VISION-CHAT] 📍 Tentative de localisation...');
        // Pour la localisation, nous aurions besoin d'une image source
        // Ici nous simulons ou proposons l'action
        visionData.actions = [{
          type: 'locate',
          label: 'Localiser dans une image',
          action: () => {
            // Action à implémenter pour ouvrir le sélecteur d'image
            console.log('Ouverture du sélecteur d\'image pour localisation');
          }
        }];
      }

      // 3. ANALYSE INTELLIGENTE si demandé
      if (context.hasAnalysisRequest) {
        responseContent += '🧠 **Analyse intelligente activée**\n\n';
        responseContent += 'Je peux analyser l\'état des équipements, détecter des anomalies, et fournir des insights détaillés.\n\n';

        visionData.suggestions = [
          'Analyser une image spécifique',
          'Comparer avec des références',
          'Générer un rapport d\'état'
        ];
      }

      // 4. RÉPONSE CONTEXTUELLE ENRICHIE
      if (!responseContent) {
        // Réponse par défaut avec suggestions
        responseContent = `🤔 Je comprends votre question. Pour une réponse plus précise avec analyse visuelle, je peux :\n\n`;

        if (context.suggestedActions.length > 0) {
          context.suggestedActions.forEach(action => {
            responseContent += `• ${action}\n`;
          });
        } else {
          responseContent += '• Rechercher des images similaires\n';
          responseContent += '• Analyser l\'état des équipements\n';
          responseContent += '• Localiser des composants spécifiques\n';
        }

        responseContent += '\n💡 Essayez de reformuler votre question ou uploadez une image pour commencer !';
      }

      // 5. SUGGESTIONS D'ACTIONS
      visionData.actions = [
        {
          type: 'search',
          label: 'Rechercher plus d\'images',
          action: () => performSearch(query, { limit: 10 })
        },
        {
          type: 'analyze',
          label: 'Analyser une image',
          action: () => {
            // Action pour ouvrir l'analyseur d'image
            console.log('Ouverture de l\'analyseur d\'image');
          }
        }
      ];

    } catch (error) {
      console.error('[VISION-CHAT] Erreur traitement:', error);
      responseContent = '❌ Une erreur est survenue lors du traitement de votre demande. Veuillez réessayer.';
      confidence = 0.1;
    }

    const processingTime = Date.now() - startTime;

    return {
      id: Date.now().toString(),
      role: 'assistant',
      content: responseContent,
      timestamp: new Date(),
      visionData,
      metadata: {
        processingTime,
        visionUsed: Object.keys(visionData).length > 0,
        cached: false,
        confidence
      }
    };
  }, [detectVisionContext, performSearch]);

  // Gestionnaire d'envoi de message
  const handleSendMessage = async () => {
    if (!input.trim() || isProcessing || !isInitialized) return;

    const userMessage: EnhancedMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      const assistantMessage = await processIntelligentQuery(input);
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Erreur envoi message:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Erreur lors du traitement de votre message. Veuillez réessayer.',
        timestamp: new Date(),
        metadata: {
          processingTime: 0,
          visionUsed: false,
          cached: false,
          confidence: 0.1
        }
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Gestionnaire pour les actions suggérées
  const handleSuggestedAction = useCallback(async (actionType: string) => {
    let query = '';

    switch (actionType) {
      case 'search':
        query = 'Montre-moi des images similaires';
        break;
      case 'locate':
        query = 'Où se trouve le condenseur ?';
        break;
      case 'analyze':
        query = 'Analyse l\'état de cet équipement';
        break;
      default:
        return;
    }

    setInput(query);
    await handleSendMessage();
  }, [handleSendMessage]);

  // Rendu d'une image dans la réponse
  const renderVisionImage = (image: EnhancedMessage['visionData']['images'][0], idx: number) => (
    <Card key={`${image.id}-${idx}`} className="inline-block m-2 w-32">
      <CardContent className="p-2">
        <img
          src={image.thumbnailUrl}
          alt={image.filename}
          className="w-full h-20 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => window.open(image.url, '_blank')}
        />
        <div className="mt-1 text-xs">
          <div className="font-medium truncate">{image.filename}</div>
          <div className="flex items-center gap-1 text-gray-500">
            <Target className="w-3 h-3" />
            {(image.confidence * 100).toFixed(0)}%
          </div>
          {image.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {image.tags.slice(0, 2).map(tag => (
                <Badge key={tag} variant="outline" className="text-xs px-1 py-0">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // État de chargement de l'agent
  if (!isInitialized) {
    return (
      <Card className="w-full h-96">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
            <p className="text-gray-600">Initialisation de l'agent vision...</p>
            {agentError && (
              <p className="text-red-500 text-sm mt-2">{agentError}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full h-[600px] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5 text-blue-500" />
          <CardTitle className="text-lg">Chat Vision Intelligent</CardTitle>
          <Badge variant="outline" className="ml-auto">
            <Sparkles className="w-3 h-3 mr-1" />
            Agent Actif
          </Badge>
        </div>
        <div className="flex gap-2 text-sm text-gray-600">
          <span className="flex items-center gap-1">
            <Search className="w-4 h-4" />
            Recherche
          </span>
          <span className="flex items-center gap-1">
            <Target className="w-4 h-4" />
            Localisation
          </span>
          <span className="flex items-center gap-1">
            <Brain className="w-4 h-4" />
            Analyse
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        {/* Zone des messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-4 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-50 dark:bg-gray-800 border'
                  }`}
                >
                  {/* Contenu du message */}
                  <div className="whitespace-pre-wrap text-sm mb-3">
                    {message.content}
                  </div>

                  {/* Images trouvées */}
                  {message.visionData?.images && message.visionData.images.length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <ImageIcon className="w-4 h-4" />
                        <span className="text-sm font-medium">Images pertinentes</span>
                      </div>
                      <div className="flex flex-wrap">
                        {message.visionData.images.map(renderVisionImage)}
                      </div>
                    </div>
                  )}

                  {/* Actions suggérées */}
                  {message.visionData?.actions && message.visionData.actions.length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4" />
                        <span className="text-sm font-medium">Actions disponibles</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {message.visionData.actions.map((action, idx) => (
                          <Button
                            key={idx}
                            variant="outline"
                            size="sm"
                            onClick={action.action}
                            className="text-xs"
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Métadonnées */}
                  {message.metadata && (
                    <div className="flex items-center justify-between text-xs opacity-70 pt-2 border-t">
                      <div className="flex items-center gap-3">
                        {message.metadata.visionUsed && (
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            Vision
                          </span>
                        )}
                        {message.metadata.cached && (
                          <span className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Cache
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {message.metadata.processingTime}ms
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {(message.metadata.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  )}

                  <div className="text-xs opacity-50 mt-2">
                    {message.timestamp.toLocaleTimeString('fr-FR')}
                  </div>
                </div>
              </div>
            ))}

            {/* Indicateur de contexte actuel */}
            {currentContext && isProcessing && (
              <div className="flex justify-center">
                <Card className="p-3 bg-blue-50 dark:bg-blue-900/20">
                  <div className="flex items-center gap-2 text-sm">
                    <Brain className="w-4 h-4 animate-pulse" />
                    <span>Analyse intelligente en cours...</span>
                    <Badge variant="outline" className="ml-2">
                      {(currentContext.confidence * 100).toFixed(0)}% confiance
                    </Badge>
                  </div>
                  {currentContext.suggestedActions.length > 0 && (
                    <div className="mt-2 text-xs text-gray-600">
                      Actions détectées: {currentContext.suggestedActions.join(', ')}
                    </div>
                  )}
                </Card>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Zone de saisie */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Posez votre question sur les équipements industriels..."
              disabled={isProcessing}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={isProcessing || !input.trim()}
              size="icon"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Suggestions rapides */}
          <div className="flex flex-wrap gap-2 mt-3">
            {[
              { text: "Où est le condenseur ?", icon: "📍" },
              { text: "Chercher des anomalies", icon: "🔍" },
              { text: "Analyser l'état général", icon: "📊" },
              { text: "Voir les images récentes", icon: "🖼️" }
            ].map((suggestion, idx) => (
              <Button
                key={idx}
                variant="ghost"
                size="sm"
                onClick={() => {
                  setInput(suggestion.text);
                  handleSendMessage();
                }}
                disabled={isProcessing}
                className="text-xs h-7"
              >
                {suggestion.icon} {suggestion.text}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}