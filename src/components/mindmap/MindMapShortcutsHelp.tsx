// src/components/mindmap/MindMapShortcutsHelp.tsx
import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface Shortcut {
  keys: string;
  description: string;
  category: 'navigation' | 'editing' | 'structure' | 'formatting' | 'view' | 'actions';
}

const SHORTCUTS: Shortcut[] = [
  // Navigation
  { keys: 'Ctrl + Z', description: 'Annuler', category: 'navigation' },
  { keys: 'Ctrl + Y', description: 'Rétablir', category: 'navigation' },
  { keys: 'Ctrl + S', description: 'Sauvegarder', category: 'actions' },
  
  // Clipboard
  { keys: 'Ctrl + C', description: 'Copier le nœud', category: 'editing' },
  { keys: 'Ctrl + X', description: 'Couper le nœud', category: 'editing' },
  { keys: 'Ctrl + V', description: 'Coller le nœud', category: 'editing' },
  { keys: 'Ctrl + D', description: 'Dupliquer le nœud', category: 'editing' },
  
  // Structure
  { keys: 'Tab', description: 'Ajouter un enfant', category: 'structure' },
  { keys: 'Enter', description: 'Ajouter un frère', category: 'structure' },
  { keys: 'F2', description: 'Éditer le nœud', category: 'editing' },
  { keys: 'Del / Backspace', description: 'Supprimer le nœud', category: 'structure' },
  { keys: 'Insert', description: 'Ajouter un parent', category: 'structure' },
  
  // Formatting
  { keys: 'Ctrl + B', description: 'Texte en gras', category: 'formatting' },
  { keys: 'Ctrl + I', description: 'Texte en italique', category: 'formatting' },
  { keys: 'Ctrl + U', description: 'Texte souligné', category: 'formatting' },
  
  // View
  { keys: '+ / -', description: 'Zoom avant / arrière', category: 'view' },
  { keys: '0', description: 'Réinitialiser le zoom', category: 'view' },
  { keys: 'Espace', description: 'Recentrer la vue', category: 'view' },
  { keys: 'F', description: 'Mode focus', category: 'view' },
  { keys: 'G', description: 'Afficher/masquer la grille', category: 'view' },
  
  // Movement
  { keys: '↑ ↓ ← →', description: 'Déplacer le nœud', category: 'navigation' },
];

const CATEGORY_LABELS: Record<Shortcut['category'], string> = {
  navigation: 'Navigation',
  editing: 'Édition',
  structure: 'Structure',
  formatting: 'Formatage',
  view: 'Affichage',
  actions: 'Actions'
};

interface MindMapShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MindMapShortcutsHelp: React.FC<MindMapShortcutsHelpProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  const groupedShortcuts = SHORTCUTS.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, Shortcut[]>);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-2xl w-full mx-4 shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-orange-500" />
            Raccourcis Clavier
          </h3>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
            <div key={category}>
              <h4 className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-3">
                {CATEGORY_LABELS[category as Shortcut['category']]}
              </h4>
              <div className="space-y-2">
                {shortcuts.map((shortcut, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <span className="text-xs text-slate-300">{shortcut.description}</span>
                    <kbd className="px-2 py-1 bg-slate-800 border border-white/10 rounded text-[10px] font-mono text-orange-400 whitespace-nowrap">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-white/10">
          <p className="text-[10px] text-slate-500 text-center">
            💡 Astuce: Les raccourcis peuvent varier selon le contexte et la sélection actuelle.
          </p>
        </div>
      </div>
    </div>
  );
};
export default MindMapShortcutsHelp;