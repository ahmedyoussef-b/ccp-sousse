/**
 * @fileOverview Page MCP - Interface unifiée pour les outils MCP
 * Détection automatique des mots-clés depuis le chat
 * Version 1.0.0
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// ============================================================================
// TYPES
// ============================================================================

type MCPView = 
  | 'calendar' 
  | 'email' 
  | 'search' 
  | 'documents' 
  | 'calculator' 
  | 'notification' 
  | 'rag' 
  | 'memory'
  | 'default';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
}

interface EmailDraft {
  to: string;
  subject: string;
  content: string;
}

interface SearchResult {
  title: string;
  relevance: number;
  url?: string;
}

interface Document {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

// Interface pour la réponse de l'API MCP
interface MCPAPIResponse {
  success: boolean;
  data?: any;
  error?: string;
  events?: CalendarEvent[];
  results?: SearchResult[];
  documents?: Document[];
  content?: string;
  result?: number;
  eventId?: string;
  messageId?: string;
  notificationId?: string;
  stored?: boolean;
  key?: string;
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function MCPPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeView, setActiveView] = useState<MCPView>('default');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // État pour Calendar
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [newEvent, setNewEvent] = useState({ title: '', start: '', end: '' });
  
  // État pour Email
  const [emailDraft, setEmailDraft] = useState<EmailDraft>({ to: '', subject: '', content: '' });
  const [emailSent, setEmailSent] = useState(false);
  
  // État pour Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  
  // État pour Calculator
  const [calcExpression, setCalcExpression] = useState('');
  const [calcResult, setCalcResult] = useState<number | null>(null);
  const [calcHistory, setCalcHistory] = useState<Array<{ expr: string; result: number }>>([]);
  
  // État pour Notification
  const [notificationMsg, setNotificationMsg] = useState('');
  const [notificationSent, setNotificationSent] = useState(false);
  
  // État pour Documents
  const [documents, setDocuments] = useState<Document[]>([]);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  
  // État pour RAG
  const [ragQuery, setRagQuery] = useState('');
  const [ragResults, setRagResults] = useState<any[]>([]);
  
  // État pour Memory
  const [memoryKey, setMemoryKey] = useState('');
  const [memoryValue, setMemoryValue] = useState('');
  const [memoryRetrieved, setMemoryRetrieved] = useState<string | null>(null);
  
  // Détection du mot-clé depuis l'URL (via chat)
  useEffect(() => {
    const mcpAction = searchParams.get('action');
    const mcpQuery = searchParams.get('q');
    
    if (mcpAction) {
      const actionMap: Record<string, MCPView> = {
        'affiche': 'calendar',
        'calendrier': 'calendar',
        'travail': 'calendar',
        'planning': 'calendar',
        'envoie': 'email',
        'email': 'email',
        'mail': 'email',
        'calcule': 'calculator',
        'calcul': 'calculator',
        'notification': 'notification',
        'alerte': 'notification',
        'cherche': 'search',
        'recherche': 'search',
        'trouve': 'search',
        'document': 'documents',
        'fichier': 'documents',
        'rag': 'rag',
        'mémoire': 'memory',
        'souviens': 'memory'
      };
      
      const detectedView = actionMap[mcpAction.toLowerCase()] || 'default';
      setActiveView(detectedView);
      
      if (mcpQuery) {
        handleExecuteMCP(detectedView, mcpQuery);
      }
    }
  }, [searchParams]);
  
  // Exécution d'une commande MCP via API
  const callMCPAPI = useCallback(async (tool: string, action: string, parameters: any): Promise<MCPAPIResponse> => {
    const response = await fetch('/api/mcp/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, action, parameters })
    });
    return await response.json();
  }, []);
  
  // Exécution d'une commande MCP
  const handleExecuteMCP = useCallback(async (view: MCPView, query: string) => {
    setLoading(true);
    setError(null);
    
    try {
      let response: MCPAPIResponse = { success: false };
      
      switch (view) {
        case 'calendar':
          if (query.includes('liste') || query.includes('affiche')) {
            response = await callMCPAPI('calendar', 'listEvents', {});
            setEvents(response.events || []);
          } else if (query.includes('crée') || query.includes('ajoute')) {
            const title = query.replace(/crée|ajoute|événement|calendrier/gi, '').trim();
            const start = new Date().toISOString();
            response = await callMCPAPI('calendar', 'createEvent', { title, start });
            // Rafraîchir la liste
            const listResponse = await callMCPAPI('calendar', 'listEvents', {});
            setEvents(listResponse.events || []);
          } else if (query.includes('disponible') || query.includes('libre')) {
            response = await callMCPAPI('calendar', 'checkAvailability', { date: new Date().toISOString() });
          }
          break;
          
        case 'email':
          if (query.includes('envoie') || query.includes('send')) {
            if (!emailDraft.to) {
              setError('Destinataire requis');
              break;
            }
            response = await callMCPAPI('email', 'send', { 
              to: emailDraft.to, 
              subject: emailDraft.subject, 
              body: emailDraft.content 
            });
            setEmailSent(true);
            setTimeout(() => setEmailSent(false), 3000);
          } else {
            response = await callMCPAPI('email', 'draft', { content: query });
            setEmailDraft(prev => ({ ...prev, content: response.data?.content || query }));
          }
          break;
          
        case 'calculator':
          const expression = query.replace(/calcule|calcul|combien|égale|fait|donne/gi, '').trim();
          response = await callMCPAPI('calculator', 'calculate', { expression });
          if (response.result !== undefined) {
            setCalcResult(response.result);
            setCalcExpression(expression);
            setCalcHistory(prev => [{ expr: expression, result: response.result! }, ...prev].slice(0, 10));
          }
          break;
          
        case 'search':
          const searchTerm = query.replace(/cherche|recherche|trouve|trouver/gi, '').trim();
          response = await callMCPAPI('search', 'web', { query: searchTerm });
          setSearchResults(response.results || []);
          setSearchQuery(searchTerm);
          break;
          
        case 'notification':
          response = await callMCPAPI('notification', 'send', { message: query });
          setNotificationSent(true);
          setTimeout(() => setNotificationSent(false), 3000);
          break;
          
        case 'documents':
          if (query.includes('crée') || query.includes('nouveau')) {
            const title = query.replace(/crée|nouveau|document/gi, '').trim();
            response = await callMCPAPI('documents', 'create', { title, content: '' });
            setNewDocTitle('');
            const listResponse = await callMCPAPI('documents', 'list', {});
            setDocuments(listResponse.documents || []);
          } else if (query.includes('liste') || query.includes('affiche')) {
            response = await callMCPAPI('documents', 'list', {});
            setDocuments(response.documents || []);
          } else {
            response = await callMCPAPI('documents', 'search', { query });
            setDocContent(response.content || 'Document non trouvé');
          }
          break;
          
        case 'rag':
          const ragSearchTerm = query.replace(/rag|recherche|cherche/gi, '').trim();
          response = await callMCPAPI('rag', 'search', { query: ragSearchTerm, collection: 'default' });
          setRagResults(response.results || []);
          setRagQuery(ragSearchTerm);
          break;
          
        case 'memory':
          if (query.includes('sauvegarde') || query.includes('stocke') || query.includes('souviens')) {
            const match = query.match(/(?:sauvegarde|stocke|souviens(?:\s*-\s*toi)?\s+)(.+?)(?:\s+(?:c'est|est|vaut|que)\s+(.+))?/i);
            const key = match?.[1]?.trim() || query;
            const value = match?.[2]?.trim() || 'sauvegardé';
            response = await callMCPAPI('memory', 'store', { key, value });
            setMemoryKey(key);
            setMemoryValue(value);
          } else {
            const key = query.replace(/récupère|retrouve|donne|rappelle/gi, '').trim();
            response = await callMCPAPI('memory', 'retrieve', { key });
            setMemoryRetrieved(response.data || `Aucune donnée pour: ${key}`);
          }
          break;
      }
      
    } catch (err) {
      console.error('Erreur MCP:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'exécution');
    } finally {
      setLoading(false);
    }
  }, [callMCPAPI, emailDraft]);
  
  // ==========================================================================
  // RENDU DES VUES (inchangé)
  // ==========================================================================
  
  const renderCalendarView = () => (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-blue-600">📅 Calendrier</h2>
      
      <div className="mb-6">
        <h3 className="font-semibold mb-2">Nouvel événement</h3>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Titre"
            className="border p-2 rounded flex-1 min-w-[150px]"
            value={newEvent.title}
            onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
          />
          <input
            type="datetime-local"
            className="border p-2 rounded"
            value={newEvent.start}
            onChange={(e) => setNewEvent({ ...newEvent, start: e.target.value })}
          />
          <button
            onClick={() => handleExecuteMCP('calendar', `crée ${newEvent.title}`)}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            disabled={!newEvent.title}
          >
            Ajouter
          </button>
        </div>
      </div>
      
      <div>
        <h3 className="font-semibold mb-2">Événements à venir</h3>
        {events.length === 0 ? (
          <p className="text-gray-500">Aucun événement</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="border-l-4 border-blue-400 pl-3 py-2">
                <div className="font-medium">{event.title}</div>
                <div className="text-sm text-gray-500">
                  {new Date(event.start).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      
      <div className="mt-4">
        <button
          onClick={() => handleExecuteMCP('calendar', 'affiche calendrier')}
          className="text-blue-500 text-sm hover:underline"
        >
          🔄 Rafraîchir
        </button>
      </div>
    </div>
  );
  
  const renderEmailView = () => (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-green-600">✉️ Email</h2>
      
      {emailSent && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">
          ✅ Email envoyé avec succès !
        </div>
      )}
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Destinataire</label>
          <input
            type="email"
            className="w-full border p-2 rounded"
            placeholder="destinataire@exemple.com"
            value={emailDraft.to}
            onChange={(e) => setEmailDraft({ ...emailDraft, to: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Objet</label>
          <input
            type="text"
            className="w-full border p-2 rounded"
            placeholder="Objet du message"
            value={emailDraft.subject}
            onChange={(e) => setEmailDraft({ ...emailDraft, subject: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Message</label>
          <textarea
            className="w-full border p-2 rounded h-32"
            placeholder="Votre message..."
            value={emailDraft.content}
            onChange={(e) => setEmailDraft({ ...emailDraft, content: e.target.value })}
          />
        </div>
        <button
          onClick={() => handleExecuteMCP('email', `envoie à ${emailDraft.to}`)}
          className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600 w-full"
          disabled={!emailDraft.to}
        >
          ✉️ Envoyer
        </button>
      </div>
    </div>
  );
  
  const renderCalculatorView = () => (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-purple-600">🧮 Calculatrice</h2>
      
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 border p-3 rounded text-lg font-mono"
            placeholder="Ex: 20% de 500 ou (120+30)*2"
            value={calcExpression}
            onChange={(e) => setCalcExpression(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleExecuteMCP('calculator', `calcule ${calcExpression}`)}
          />
          <button
            onClick={() => handleExecuteMCP('calculator', `calcule ${calcExpression}`)}
            className="bg-purple-500 text-white px-6 py-2 rounded hover:bg-purple-600"
          >
            =
          </button>
        </div>
      </div>
      
      {calcResult !== null && (
        <div className="mb-6 p-4 bg-purple-50 rounded">
          <div className="text-sm text-gray-500">{calcExpression} =</div>
          <div className="text-3xl font-bold text-purple-600">{calcResult}</div>
        </div>
      )}
      
      {calcHistory.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Historique</h3>
          <div className="space-y-1 text-sm">
            {calcHistory.map((item, idx) => (
              <div key={idx} className="text-gray-600">
                {item.expr} = <span className="font-mono">{item.result}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="mt-4 grid grid-cols-4 gap-2">
        {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+'].map((btn) => (
          <button
            key={btn}
            onClick={() => {
              if (btn === '=') {
                handleExecuteMCP('calculator', `calcule ${calcExpression}`);
              } else {
                setCalcExpression(prev => prev + btn);
              }
            }}
            className="bg-gray-100 p-3 rounded hover:bg-gray-200 text-lg"
          >
            {btn}
          </button>
        ))}
      </div>
    </div>
  );
  
  const renderSearchView = () => (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-indigo-600">🔍 Recherche Web</h2>
      
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          className="flex-1 border p-2 rounded"
          placeholder="Rechercher sur le web..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleExecuteMCP('search', `cherche ${searchQuery}`)}
        />
        <button
          onClick={() => handleExecuteMCP('search', `cherche ${searchQuery}`)}
          className="bg-indigo-500 text-white px-4 py-2 rounded hover:bg-indigo-600"
          disabled={!searchQuery}
        >
          Chercher
        </button>
      </div>
      
      {searchResults.length > 0 && (
        <div className="space-y-3">
          {searchResults.map((result, idx) => (
            <div key={idx} className="border rounded p-3 hover:bg-gray-50">
              <div className="font-medium text-indigo-600">{result.title}</div>
              <div className="text-sm text-gray-500">Pertinence: {Math.round(result.relevance * 100)}%</div>
              {result.url && <div className="text-xs text-gray-400">{result.url}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
  
  const renderNotificationView = () => (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-orange-600">🔔 Notification</h2>
      
      {notificationSent && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">
          ✅ Notification envoyée !
        </div>
      )}
      
      <textarea
        className="w-full border p-2 rounded h-24 mb-4"
        placeholder="Message de notification..."
        value={notificationMsg}
        onChange={(e) => setNotificationMsg(e.target.value)}
      />
      
      <button
        onClick={() => handleExecuteMCP('notification', notificationMsg)}
        className="bg-orange-500 text-white px-6 py-2 rounded hover:bg-orange-600 w-full"
        disabled={!notificationMsg}
      >
        🔔 Envoyer notification
      </button>
    </div>
  );
  
  const renderDocumentsView = () => (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-teal-600">📄 Documents</h2>
      
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          className="flex-1 border p-2 rounded"
          placeholder="Nouveau document..."
          value={newDocTitle}
          onChange={(e) => setNewDocTitle(e.target.value)}
        />
        <button
          onClick={() => handleExecuteMCP('documents', `crée ${newDocTitle}`)}
          className="bg-teal-500 text-white px-4 py-2 rounded hover:bg-teal-600"
          disabled={!newDocTitle}
        >
          + Créer
        </button>
        <button
          onClick={() => handleExecuteMCP('documents', 'liste documents')}
          className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
        >
          📋 Lister
        </button>
      </div>
      
      {documents.length > 0 && (
        <div className="mb-4">
          <h3 className="font-semibold mb-2">Mes documents</h3>
          <ul className="space-y-1">
            {documents.map((doc) => (
              <li key={doc.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span>{doc.title}</span>
                <button
                  onClick={() => handleExecuteMCP('documents', `lire ${doc.title}`)}
                  className="text-teal-500 text-sm hover:underline"
                >
                  Lire
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {docContent && (
        <div className="mt-4 p-4 bg-gray-50 rounded">
          <h3 className="font-semibold mb-2">Contenu</h3>
          <p className="text-gray-700 whitespace-pre-wrap">{docContent}</p>
        </div>
      )}
    </div>
  );
  
  const renderRAGView = () => (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-emerald-600">🧠 RAG - Recherche sémantique</h2>
      
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          className="flex-1 border p-2 rounded"
          placeholder="Question sur les documents..."
          value={ragQuery}
          onChange={(e) => setRagQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleExecuteMCP('rag', `rag ${ragQuery}`)}
        />
        <button
          onClick={() => handleExecuteMCP('rag', `rag ${ragQuery}`)}
          className="bg-emerald-500 text-white px-4 py-2 rounded hover:bg-emerald-600"
          disabled={!ragQuery}
        >
          Interroger
        </button>
      </div>
      
      {ragResults.length > 0 && (
        <div className="space-y-3">
          {ragResults.map((result, idx) => (
            <div key={idx} className="border-l-4 border-emerald-400 pl-3 py-2">
              <div className="text-gray-700">{result.content}</div>
              <div className="text-xs text-gray-400 mt-1">
                Source: {result.source} | Pertinence: {Math.round(result.relevance * 100)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  
  const renderMemoryView = () => (
    <div className="p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-pink-600">💾 Mémoire persistante</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Stockage */}
        <div className="border rounded p-4">
          <h3 className="font-semibold mb-3">📝 Stocker</h3>
          <input
            type="text"
            className="w-full border p-2 rounded mb-2"
            placeholder="Clé (ex: preference_utilisateur)"
            value={memoryKey}
            onChange={(e) => setMemoryKey(e.target.value)}
          />
          <input
            type="text"
            className="w-full border p-2 rounded mb-2"
            placeholder="Valeur"
            value={memoryValue}
            onChange={(e) => setMemoryValue(e.target.value)}
          />
          <button
            onClick={() => handleExecuteMCP('memory', `souviens-toi ${memoryKey} c'est ${memoryValue}`)}
            className="bg-pink-500 text-white px-4 py-2 rounded hover:bg-pink-600 w-full"
            disabled={!memoryKey}
          >
            💾 Sauvegarder
          </button>
        </div>
        
        {/* Récupération */}
        <div className="border rounded p-4">
          <h3 className="font-semibold mb-3">🔍 Récupérer</h3>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              className="flex-1 border p-2 rounded"
              placeholder="Clé à récupérer"
              value={memoryKey}
              onChange={(e) => setMemoryKey(e.target.value)}
            />
            <button
              onClick={() => handleExecuteMCP('memory', `donne ${memoryKey}`)}
              className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              Chercher
            </button>
          </div>
          {memoryRetrieved && (
            <div className="mt-3 p-3 bg-pink-50 rounded">
              <div className="text-sm text-gray-500">Valeur:</div>
              <div className="font-mono">{memoryRetrieved}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  
  const renderDefaultView = () => (
    <div className="p-6 bg-white rounded-xl shadow-lg text-center">
      <h2 className="text-2xl font-bold mb-4 text-gray-600">🛠️ Outils MCP</h2>
      <p className="text-gray-500 mb-6">
        Dites à l'assistant: <strong>"affiche calendrier"</strong>, <strong>"envoie email"</strong>, 
        <strong>"calcule 20% de 500"</strong>, <strong>"cherche document"</strong>, etc.
      </p>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: '📅', label: 'Calendrier', view: 'calendar', color: 'blue' },
          { icon: '✉️', label: 'Email', view: 'email', color: 'green' },
          { icon: '🧮', label: 'Calculatrice', view: 'calculator', color: 'purple' },
          { icon: '🔍', label: 'Recherche', view: 'search', color: 'indigo' },
          { icon: '🔔', label: 'Notification', view: 'notification', color: 'orange' },
          { icon: '📄', label: 'Documents', view: 'documents', color: 'teal' },
          { icon: '🧠', label: 'RAG', view: 'rag', color: 'emerald' },
          { icon: '💾', label: 'Mémoire', view: 'memory', color: 'pink' }
        ].map((tool) => (
          <button
            key={tool.view}
            onClick={() => setActiveView(tool.view as MCPView)}
            className={`p-4 rounded-lg border-2 transition-all hover:shadow-lg ${
              activeView === tool.view 
                ? `border-${tool.color}-500 bg-${tool.color}-50` 
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-3xl mb-2">{tool.icon}</div>
            <div className="font-medium">{tool.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
  
  // ==========================================================================
  // RENDU PRINCIPAL AVEC BARRE DE NAVIGATION
  // ==========================================================================
  
  const navItems = [
    { icon: '📅', label: 'Calendrier', view: 'calendar' },
    { icon: '✉️', label: 'Email', view: 'email' },
    { icon: '🧮', label: 'Calculatrice', view: 'calculator' },
    { icon: '🔍', label: 'Recherche', view: 'search' },
    { icon: '🔔', label: 'Notification', view: 'notification' },
    { icon: '📄', label: 'Documents', view: 'documents' },
    { icon: '🧠', label: 'RAG', view: 'rag' },
    { icon: '💾', label: 'Mémoire', view: 'memory' }
  ];
  
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Barre de navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center overflow-x-auto py-2 gap-1">
            {/* Bouton retour arrière */}
            <button
              onClick={() => router.back()}
              className="mr-2 px-3 py-2 text-gray-500 hover:bg-gray-200 rounded-lg whitespace-nowrap transition-colors flex items-center gap-1 font-medium"
              title="Retour arrière"
            >
              ⬅️ Retour
            </button>
            <div className="w-[1px] h-6 bg-gray-300 mx-1 shrink-0"></div>

            <button
              onClick={() => setActiveView('default')}
              className={`px-4 py-2 rounded-lg whitespace-nowrap ${
                activeView === 'default' 
                  ? 'bg-gray-800 text-white' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              🏠 Accueil
            </button>
            {navItems.map((item) => (
              <button
                key={item.view}
                onClick={() => setActiveView(item.view as MCPView)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap ${
                  activeView === item.view 
                    ? 'bg-gray-800 text-white' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>
      
      {/* Contenu principal */}
      <main className="max-w-4xl mx-auto p-4">
        {loading && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <span>Exécution en cours...</span>
            </div>
          </div>
        )}
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
            ❌ {error}
          </div>
        )}
        
        {activeView === 'calendar' && renderCalendarView()}
        {activeView === 'email' && renderEmailView()}
        {activeView === 'calculator' && renderCalculatorView()}
        {activeView === 'search' && renderSearchView()}
        {activeView === 'notification' && renderNotificationView()}
        {activeView === 'documents' && renderDocumentsView()}
        {activeView === 'rag' && renderRAGView()}
        {activeView === 'memory' && renderMemoryView()}
        {activeView === 'default' && renderDefaultView()}
      </main>
    </div>
  );
}