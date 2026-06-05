/**
 * @fileOverview Injection de connaissances structurées
 * @version 1.0.0
 */

'use client';

import { useState } from 'react';


const KNOWLEDGE_TEMPLATES = {
  procedure: {
    question: "Comment [action] [équipement] ?",
    answer: "Pour [action] [équipement], suivez ces étapes:\n1. Vérifier [paramètre1]\n2. Exécuter [action1]\n3. Confirmer [résultat]"
  },
  specification: {
    question: "Quelles sont les caractéristiques techniques de [équipement] ?",
    answer: "Caractéristiques techniques de [équipement]:\n- Puissance: [valeur] MW\n- Pression: [valeur] bars\n- Température: [valeur] °C"
  },
  maintenance: {
    question: "Quelle est la fréquence de maintenance de [équipement] ?",
    answer: "La maintenance de [équipement] s'effectue tous les [fréquence]:\n- Inspection visuelle: [fréquence1]\n- Contrôle: [fréquence2]\n- Révision majeure: [fréquence3]"
  }
};

export default function KnowledgeInjector({ onInject }: { onInject: () => void }) {
  const [knowledgeType, setKnowledgeType] = useState<'procedure' | 'specification' | 'maintenance' | 'custom'>('procedure');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [category, setCategory] = useState('tg1');
  const [tags, setTags] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const applyTemplate = () => {
    const template = KNOWLEDGE_TEMPLATES[knowledgeType as keyof typeof KNOWLEDGE_TEMPLATES];
    if (template && knowledgeType !== 'custom') {
      setQuestion(template.question);
      setAnswer(template.answer);
    }
  };

  const handleSubmit = async () => {
    if (!question.trim() || !answer.trim()) {
      setMessage({ type: 'error', text: 'Veuillez remplir la question et la réponse' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      // Méthode 1: Envoyer comme correction (poids 3.0)
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: question,
          prediction: "(injection manuelle)",
          rating: 1,
          correction: answer,
          metadata: { category, tags: tags.split(',').map(t => t.trim()), source: 'manual_injection' }
        })
      });

      // Méthode 2: Simuler une interaction notée 5 (poids 1.66)
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: question,
          prediction: answer,
          rating: 5,
          metadata: { category, tags: tags.split(',').map(t => t.trim()), source: 'manual_injection' }
        })
      });

      setMessage({ type: 'success', text: '✅ Connaissance injectée avec succès! (Poids effectif: ~5.0)' });
      
      // Réinitialiser le formulaire
      setQuestion('');
      setAnswer('');
      setTags('');
      
      onInject();
      
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Erreur lors de l\'injection' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">📚 Injection de Connaissances</h2>
      <p className="text-gray-500 mb-6">
        Injectez des paires Question/Réponse pour renforcer l'apprentissage.
        <span className="text-orange-600 ml-2">Poids: ×3.0 (correction) + ×1.66 (rating 5) = ~5.0</span>
      </p>

      {/* Type selector */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setKnowledgeType('procedure'); applyTemplate(); }}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            knowledgeType === 'procedure' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-800'
          }`}
        >
          📋 Procédure
        </button>
        <button
          onClick={() => { setKnowledgeType('specification'); applyTemplate(); }}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            knowledgeType === 'specification' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-800'
          }`}
        >
          📊 Spécifications
        </button>
        <button
          onClick={() => { setKnowledgeType('maintenance'); applyTemplate(); }}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            knowledgeType === 'maintenance' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-800'
          }`}
        >
          🔧 Maintenance
        </button>
        <button
          onClick={() => { setKnowledgeType('custom'); setQuestion(''); setAnswer(''); }}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            knowledgeType === 'custom' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-800'
          }`}
        >
          ✏️ Personnalisé
        </button>
      </div>

      {/* Formulaire */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Question *</label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ex: Quelle est la pression maximale de TG1?"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Réponse *</label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Ex: La pression maximale de TG1 est de 12.5 bars..."
            rows={5}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Catégorie</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg"
            >
              <option value="tg1">TG1 - Turbine</option>
              <option value="tg2">TG2 - Turbine</option>
              <option value="chaudiere">Chaudière</option>
              <option value="maintenance">Maintenance</option>
              <option value="securite">Sécurité</option>
              <option value="performance">Performance</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tags (séparés par virgules)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="pression, turbine, tg1"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg"
            />
          </div>
        </div>

        {message && (
          <div className={`p-3 rounded-lg ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all"
        >
          {isSubmitting ? '⏳ Injection...' : '🎯 Injecter la connaissance (poids ×5.0)'}
        </button>
      </div>

      {/* Tips */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h3 className="font-medium mb-2">💡 Conseils pour un entraînement optimal</h3>
        <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
          <li>• ⭐ Notez 5 étoiles les bonnes réponses → poids ×1.66</li>
          <li>• ✏️ Utilisez la correction pour les mauvaises réponses → poids ×3.0</li>
          <li>• 📚 Injectez des connaissances directement → poids effectif ~5.0</li>
          <li>• 🔄 Répétez les mêmes questions sous différentes formulations → renforcement cumulatif</li>
          <li>• 📊 Atteignez 50 exemples pour déclencher l'entraînement automatique</li>
        </ul>
      </div>
    </div>
  );
}