// src/components/mindmap/MindMapToolbar.tsx
// Version 2.0 - Streamlined toolbar with improved organization and drag & drop support
import React, { useState } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Sparkles, 
  Plus, 
  Save, 
  Download, 
  Upload, 
  Trash2,
  Copy,
  Scissors,
  ClipboardPaste,
  Undo2,
  Redo2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Link,
  Image,
  FileText,
  ExternalLink,
  Layout,
  Grid3X3,
  Keyboard,
  Settings,
  Eye,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Palette,
  Printer,
  Hash,
  Tag,
  Square,
  Circle,
  Hexagon,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Move,
  MousePointer2,
  Unlink,
  FoldHorizontal,
  Expand,
  Search,
  Paperclip,
  Share2,
  AlertTriangle,
  Eraser
} from 'lucide-react';

// ─── Types (inchangé) ────────────────────────────────────────────────────────

export interface MindMapToolbarProps {
  // Zoom
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  
  // Layout
  onAutoLayout: () => void;
  onClearAll: () => void;
  onLayoutChange?: (layout: 'tree' | 'radial' | 'left' | 'right' | 'balanced') => void;
  onDirectionChange?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  
  // Node operations
  onAddNode: (type: 'parameter' | 'formula' | 'dependency' | 'note' | 'root') => void;
  onEditNode?: () => void;
  onAddChild?: () => void;
  onAddSibling?: () => void;
  onAddParent?: () => void;
  onRemoveNode?: () => void;
  onDuplicateNode?: () => void;
  onCutNode?: () => void;
  onCopyNode?: () => void;
  onPasteNode?: () => void;
  onMoveNodeUp?: () => void;
  onMoveNodeDown?: () => void;
  onMoveNodeLeft?: () => void;
  onMoveNodeRight?: () => void;
  
  // Node styling
  onNodeTypeChange?: (type: 'parameter' | 'formula' | 'dependency' | 'note') => void;
  onNodeShapeChange?: (shape: 'rectangle' | 'circle' | 'ellipse' | 'rhombus') => void;
  onNodeColorChange?: (color: string) => void;
  onNodeIconChange?: (icon: string) => void;
  onNodeEmojiChange?: (emoji: string) => void;
  onTextBold?: () => void;
  onTextItalic?: () => void;
  onTextUnderline?: () => void;
  onTextAlign?: (align: 'left' | 'center' | 'right') => void;
  
  // Edge operations
  onAddEdge?: () => void;
  onRemoveEdge?: () => void;
  onEdgeLabel?: () => void;
  onEdgeStyleChange?: (style: 'solid' | 'dashed' | 'dotted' | 'curved') => void;
  
  // Attachments
  onAddLink?: (url: string) => void;
  onAddNote?: (note: string) => void;
  onAddImage?: (imageUrl: string) => void;
  
  // View options
  onToggleGrid?: () => void;
  onToggleFocusMode?: () => void;
  onCollapseBranch?: () => void;
  onExpandBranch?: () => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  
  // History
  onUndo?: () => void;
  onRedo?: () => void;
  onVersionHistory?: () => void;
  
  // Export/Import
  onSave: () => void;
  onExport: (format: 'json' | 'markdown' | 'mermaid' | 'svg' | 'pdf' | 'xmind' | 'png' | 'html') => void;
  onImportTrigger: () => void;
  onPrint?: () => void;
  onShare?: () => void;
  
  // UI state
  onToggleShortcuts?: () => void;
  onSettings?: () => void;
  isSaving?: boolean;
  hasSelection?: boolean;
  selectedNodeCount?: number;
  isGridVisible?: boolean;
}

// ─── Icon Button Component (inchangé) ────────────────────────────────────────

interface IconButtonProps {
  icon: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  active?: boolean;
  variant?: 'default' | 'danger' | 'success' | 'warning' | 'info' | 'primary';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  badge?: string | number;
}

const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onClick,
  title,
  disabled = false,
  active = false,
  variant = 'default',
  size = 'sm',
  className = '',
  badge
}) => {
  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-2.5'
  };
  
  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-4.5 h-4.5'
  };
  
  const variantClasses = {
    default: active 
      ? 'text-white bg-orange-600 hover:bg-orange-500' 
      : 'text-slate-400 hover:text-white hover:bg-white/5',
    primary: active
      ? 'text-white bg-sky-600 hover:bg-sky-500'
      : 'text-sky-400 hover:text-sky-300 hover:bg-sky-500/10',
    danger: 'text-red-400 hover:text-red-300 hover:bg-red-500/10',
    success: 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10',
    warning: 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10',
    info: 'text-violet-400 hover:text-violet-300 hover:bg-violet-500/10'
  };
  
  return (
    <div className="relative">
      <button
        onClick={onClick}
        title={title}
        disabled={disabled}
        className={`
          ${sizeClasses[size]} rounded-lg transition-all duration-150
          ${variantClasses[variant]}
          ${disabled ? 'opacity-30 cursor-not-allowed' : 'active:scale-95'}
          ${className}
        `}
      >
        <span className={iconSizes[size]}>{icon}</span>
      </button>
      {badge && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-3.5 px-1 text-[8px] font-bold bg-orange-500 text-white rounded-full">
          {badge}
        </span>
      )}
    </div>
  );
};

// ─── Toolbar Group Component (inchangé) ──────────────────────────────────────

interface ToolbarGroupProps {
  children: React.ReactNode;
  label?: string;
  className?: string;
}

const ToolbarGroup: React.FC<ToolbarGroupProps> = ({ children, label, className = '' }) => (
  <div className={`flex flex-col gap-1 ${className}`}>
    {label && <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider px-1">{label}</span>}
    <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
      {children}
    </div>
  </div>
);

// ─── Dropdown Menu Component (inchangé) ──────────────────────────────────────

interface DropdownItem {
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  shortcut?: string;
  divider?: boolean;
}

interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right' | 'center';
  disabled?: boolean;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ trigger, items, align = 'left', disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <div onClick={() => !disabled && setIsOpen(!isOpen)} className={disabled ? 'opacity-30 cursor-not-allowed' : ''}>
        {trigger}
      </div>
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <div className={`absolute ${align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'} bottom-full mb-2 min-w-[200px] p-1.5 bg-slate-950 border border-white/10 rounded-xl shadow-2xl z-50`}>
            {items.map((item, index) => (
              item.divider ? (
                <div key={index} className="h-[1px] bg-white/10 my-1" />
              ) : (
                <button
                  key={index}
                  onClick={() => { item.onClick?.(); setIsOpen(false); }}
                  disabled={item.disabled}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors
                    ${item.disabled 
                      ? 'text-slate-600 cursor-not-allowed' 
                      : 'text-slate-300 hover:text-white hover:bg-white/5'}
                  `}
                >
                  {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.shortcut && (
                    <span className="text-[9px] text-slate-500 font-mono bg-white/5 px-1.5 py-0.5 rounded">
                      {item.shortcut}
                    </span>
                  )}
                </button>
              )
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Color Picker Component (inchangé) ───────────────────────────────────────

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#f43f5e', '#ffffff', '#94a3b8', '#64748b', '#0f172a'
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-6 h-6 rounded border border-white/20 overflow-hidden transition-opacity ${disabled ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110'}`}
        style={{ backgroundColor: value }}
        title="Couleur du nœud"
      />
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 p-2 bg-slate-950 border border-white/10 rounded-xl shadow-2xl z-50">
            <div className="grid grid-cols-5 gap-1 mb-2">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => { onChange(color); setIsOpen(false); }}
                  className={`w-6 h-6 rounded transition-transform hover:scale-110 ${value === color ? 'ring-2 ring-orange-500 ring-offset-1 ring-offset-slate-950' : ''}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-full h-8 bg-transparent border border-white/10 rounded cursor-pointer"
            />
          </div>
        </>
      )}
    </div>
  );
};

// ─── Confirm Dialog Component ─────────────────────────────────────────────────

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ isOpen, title, message, confirmLabel, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed mb-6">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-lg shadow-red-600/20"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Keyboard Shortcuts Modal (inchangé) ─────────────────────────────────────

const KEYBOARD_SHORTCUTS = [
  { category: 'Édition', shortcuts: [
    { key: 'Ctrl+Z', description: 'Annuler' },
    { key: 'Ctrl+Y', description: 'Rétablir' },
    { key: 'Ctrl+C', description: 'Copier le nœud' },
    { key: 'Ctrl+X', description: 'Couper le nœud' },
    { key: 'Ctrl+V', description: 'Coller le nœud' },
    { key: 'Ctrl+D', description: 'Dupliquer' },
  ]},
  { category: 'Navigation', shortcuts: [
    { key: 'Tab', description: 'Ajouter un enfant' },
    { key: 'Enter', description: 'Ajouter un frère' },
    { key: 'F2', description: 'Éditer le nœud' },
    { key: 'Del', description: 'Supprimer' },
    { key: 'Flèches', description: 'Déplacer le nœud' },
  ]},
  { category: 'Formatage', shortcuts: [
    { key: 'Ctrl+B', description: 'Gras' },
    { key: 'Ctrl+I', description: 'Italique' },
    { key: 'Ctrl+U', description: 'Souligné' },
  ]},
  { category: 'Vue', shortcuts: [
    { key: '+/-', description: 'Zoom avant/arrière' },
    { key: '0', description: 'Réinitialiser le zoom' },
    { key: 'F', description: 'Mode focus' },
    { key: 'G', description: 'Grille' },
    { key: 'Ctrl+S', description: 'Sauvegarder' },
  ]},
];

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-slate-900 pb-2 border-b border-white/10">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-orange-500" />
            Raccourcis Clavier
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <ArrowRight className="w-4 h-4 rotate-45" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {KEYBOARD_SHORTCUTS.map((category, i) => (
            <div key={i}>
              <h4 className="text-xs font-bold text-orange-400 mb-2 uppercase tracking-wider">{category.category}</h4>
              <div className="space-y-1">
                {category.shortcuts.map((shortcut, j) => (
                  <div key={j} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                    <span className="text-xs text-slate-300">{shortcut.description}</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 border border-white/10 rounded text-[10px] font-mono text-orange-400 whitespace-nowrap">
                      {shortcut.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        {/* Drag & Drop Info */}
        <div className="mt-4 p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Move className="w-4 h-4 text-sky-400" />
            <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">Drag & Drop</h4>
          </div>
          <ul className="text-xs text-slate-300 space-y-1">
            <li>• <span className="text-white font-medium">Glisser un nœud</span> pour le repositionner librement</li>
            <li>• <span className="text-white font-medium">Molette souris</span> pour zoomer/dézoomer</li>
            <li>• <span className="text-white font-medium">Clic droit + glisser</span> pour déplacer le canvas</li>
            <li>• <span className="text-white font-medium">Double-clic</span> sur un nœud pour éditer</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// ─── Main Toolbar Component ───────────────────────────────────────────────────

export const MindMapToolbar: React.FC<MindMapToolbarProps> = ({
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onAutoLayout,
  onClearAll,
  onLayoutChange,
  onDirectionChange,
  onAddNode,
  onEditNode,
  onAddChild,
  onAddSibling,
  onAddParent,
  onRemoveNode,
  onDuplicateNode,
  onCutNode,
  onCopyNode,
  onPasteNode,
  onMoveNodeUp,
  onMoveNodeDown,
  onMoveNodeLeft,
  onMoveNodeRight,
  onNodeTypeChange,
  onNodeShapeChange,
  onNodeColorChange,
  onNodeIconChange,
  onNodeEmojiChange,
  onTextBold,
  onTextItalic,
  onTextUnderline,
  onTextAlign,
  onAddEdge,
  onRemoveEdge,
  onEdgeLabel,
  onEdgeStyleChange,
  onAddLink,
  onAddNote,
  onAddImage,
  onToggleGrid,
  onToggleFocusMode,
  onCollapseBranch,
  onExpandBranch,
  onExpandAll,
  onCollapseAll,
  onUndo,
  onRedo,
  onVersionHistory,
  onSave,
  onExport,
  onImportTrigger,
  onPrint,
  onShare,
  onToggleShortcuts,
  onSettings,
  isSaving = false,
  hasSelection = false,
  selectedNodeCount = 0,
  isGridVisible = false
}) => {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [nodeColor, setNodeColor] = useState('#ea580c');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  const handleColorChange = (color: string) => {
    setNodeColor(color);
    onNodeColorChange?.(color);
  };

  const handleClearAllConfirmed = () => {
    setShowClearConfirm(false);
    onClearAll();
  };
  
  return (
    <>
      <ShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      
      <ConfirmDialog
        isOpen={showClearConfirm}
        title="Supprimer tout le schéma"
        message="Cette action est IRRÉVERSIBLE. Tous les nœuds, connexions et métadonnées du mindmap seront définitivement supprimés. Cette action ne peut pas être annulée."
        confirmLabel="Tout supprimer"
        onConfirm={handleClearAllConfirmed}
        onCancel={() => setShowClearConfirm(false)}
      />
      
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-slate-900/90 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl">
        
        {/* ─── Group 1: Clipboard & History ─────────────────────────────────── */}
        <ToolbarGroup label="Édition">
          <IconButton icon={<Undo2 />} onClick={onUndo} title="Annuler (Ctrl+Z)" variant="info" />
          <IconButton icon={<Redo2 />} onClick={onRedo} title="Rétablir (Ctrl+Y)" variant="info" />
          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />
          <IconButton icon={<Scissors />} onClick={onCutNode} title="Couper (Ctrl+X)" disabled={!hasSelection} variant="warning" />
          <IconButton icon={<Copy />} onClick={onCopyNode} title="Copier (Ctrl+C)" disabled={!hasSelection} variant="primary" />
          <IconButton icon={<ClipboardPaste />} onClick={onPasteNode} title="Coller (Ctrl+V)" variant="success" />
          <IconButton icon={<Copy />} onClick={onDuplicateNode} title="Dupliquer (Ctrl+D)" disabled={!hasSelection} />
        </ToolbarGroup>

        {/* ─── Group 2: Node Structure ──────────────────────────────────────── */}
        <ToolbarGroup label="Nœuds">
          <DropdownMenu
            align="left"
            trigger={
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors font-medium">
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter</span>
              </button>
            }
            items={[
              { label: 'Nœud enfant', icon: <GitBranch className="w-3.5 h-3.5" />, onClick: () => onAddChild?.(), shortcut: 'Tab' },
              { label: 'Nœud frère', icon: <ArrowRight className="w-3.5 h-3.5" />, onClick: () => onAddSibling?.(), shortcut: 'Enter' },
              { label: 'Nœud parent', icon: <ArrowUp className="w-3.5 h-3.5" />, onClick: () => onAddParent?.() },
              { divider: true },
              { label: 'Paramètre', icon: <Hash className="w-3.5 h-3.5" />, onClick: () => onAddNode('parameter') },
              { label: 'Formule', icon: <Type className="w-3.5 h-3.5" />, onClick: () => onAddNode('formula') },
              { label: 'Dépendance', icon: <Link className="w-3.5 h-3.5" />, onClick: () => onAddNode('dependency') },
              { label: 'Note', icon: <FileText className="w-3.5 h-3.5" />, onClick: () => onAddNode('note') },
            ]}
          />
          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />
          <IconButton icon={<Settings />} onClick={onEditNode} title="Éditer (F2)" disabled={!hasSelection} />
          <IconButton icon={<Trash2 />} onClick={onRemoveNode} title="Supprimer (Del)" disabled={!hasSelection} variant="danger" />
        </ToolbarGroup>

        {/* ─── Group 3: Node Styling ────────────────────────────────────────── */}
        <ToolbarGroup label="Style">
          <DropdownMenu
            align="center"
            disabled={!hasSelection}
            trigger={
              <IconButton icon={<Tag />} title="Type du nœud" disabled={!hasSelection} />
            }
            items={[
              { label: 'Paramètre', icon: <Hash className="w-3.5 h-3.5" />, onClick: () => onNodeTypeChange?.('parameter') },
              { label: 'Formule', icon: <Type className="w-3.5 h-3.5" />, onClick: () => onNodeTypeChange?.('formula') },
              { label: 'Dépendance', icon: <Link className="w-3.5 h-3.5" />, onClick: () => onNodeTypeChange?.('dependency') },
              { label: 'Note', icon: <FileText className="w-3.5 h-3.5" />, onClick: () => onNodeTypeChange?.('note') },
            ]}
          />
          <DropdownMenu
            align="center"
            disabled={!hasSelection}
            trigger={
              <IconButton icon={<Square />} title="Forme du nœud" disabled={!hasSelection} />
            }
            items={[
              { label: 'Rectangle', icon: <Square className="w-3.5 h-3.5" />, onClick: () => onNodeShapeChange?.('rectangle') },
              { label: 'Cercle', icon: <Circle className="w-3.5 h-3.5" />, onClick: () => onNodeShapeChange?.('circle') },
              { label: 'Ellipse', icon: <Circle className="w-3.5 h-3.5" />, onClick: () => onNodeShapeChange?.('ellipse') },
              { label: 'Losange', icon: <Hexagon className="w-3.5 h-3.5" />, onClick: () => onNodeShapeChange?.('rhombus') },
            ]}
          />
          <ColorPicker value={nodeColor} onChange={handleColorChange} disabled={!hasSelection} />
        </ToolbarGroup>

        {/* ─── Group 4: Text Formatting ─────────────────────────────────────── */}
        <ToolbarGroup label="Texte">
          <IconButton icon={<Bold />} onClick={onTextBold} title="Gras (Ctrl+B)" disabled={!hasSelection} />
          <IconButton icon={<Italic />} onClick={onTextItalic} title="Italique (Ctrl+I)" disabled={!hasSelection} />
          <IconButton icon={<Underline />} onClick={onTextUnderline} title="Souligné (Ctrl+U)" disabled={!hasSelection} />
          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />
          <IconButton icon={<AlignLeft />} onClick={() => onTextAlign?.('left')} title="Aligner gauche" disabled={!hasSelection} />
          <IconButton icon={<AlignCenter />} onClick={() => onTextAlign?.('center')} title="Centrer" disabled={!hasSelection} />
          <IconButton icon={<AlignRight />} onClick={() => onTextAlign?.('right')} title="Aligner droite" disabled={!hasSelection} />
        </ToolbarGroup>

        {/* ─── Group 5: Connections ─────────────────────────────────────────── */}
        <ToolbarGroup label="Liens">
          <IconButton icon={<Link />} onClick={onAddEdge} title="Créer un lien" disabled={!hasSelection} variant="primary" />
          <IconButton icon={<Unlink />} onClick={onRemoveEdge} title="Supprimer le lien" disabled={!hasSelection} variant="danger" />
          <IconButton icon={<ExternalLink />} onClick={() => { const url = prompt('URL:'); if (url) onAddLink?.(url); }} title="Lien URL" disabled={!hasSelection} />
        </ToolbarGroup>

        {/* ─── Group 6: Attachments ─────────────────────────────────────────── */}
        <ToolbarGroup label="Pièces jointes">
          <DropdownMenu
            align="center"
            disabled={!hasSelection}
            trigger={
              <IconButton icon={<Paperclip />} title="Attacher un élément" disabled={!hasSelection} variant="info" />
            }
            items={[
              { label: 'Lien URL', icon: <ExternalLink className="w-3.5 h-3.5" />, onClick: () => { const url = prompt('URL:'); if (url) onAddLink?.(url); } },
              { label: 'Note textuelle', icon: <FileText className="w-3.5 h-3.5" />, onClick: () => { const note = prompt('Note:'); if (note) onAddNote?.(note); } },
              { label: 'Image', icon: <Image className="w-3.5 h-3.5" />, onClick: () => { const url = prompt('URL image:'); if (url) onAddImage?.(url); } },
            ]}
          />
        </ToolbarGroup>

        {/* ─── Group 7: View Options ────────────────────────────────────────── */}
        <ToolbarGroup label="Vue">
          <IconButton 
            icon={<Grid3X3 />} 
            onClick={onToggleGrid} 
            title="Grille (G)" 
            variant={isGridVisible ? 'primary' : 'default'}
            active={isGridVisible}
          />
          <IconButton icon={<Eye />} onClick={onToggleFocusMode} title="Mode focus (F)" disabled={!hasSelection} />
          <IconButton icon={<Maximize />} onClick={onZoomReset} title="Centrer (0)" />
          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />
          <IconButton icon={<ZoomIn />} onClick={onZoomIn} title="Zoomer (+)" />
          <IconButton icon={<ZoomOut />} onClick={onZoomOut} title="Dézoomer (-)" />
        </ToolbarGroup>

        {/* ─── Group 8: Layout ──────────────────────────────────────────────── */}
        <ToolbarGroup label="Disposition">
          <IconButton icon={<Sparkles />} onClick={onAutoLayout} title="Auto-layout" variant="warning" />
          <DropdownMenu
            align="right"
            trigger={
              <IconButton icon={<Layout />} title="Orientation" />
            }
            items={[
              { label: 'Arbre (droite)', icon: <ArrowRight className="w-3.5 h-3.5" />, onClick: () => onDirectionChange?.('right') },
              { label: 'Arbre (gauche)', icon: <ArrowLeft className="w-3.5 h-3.5" />, onClick: () => onDirectionChange?.('left') },
              { label: 'Arbre (haut)', icon: <ArrowUp className="w-3.5 h-3.5" />, onClick: () => onDirectionChange?.('up') },
              { label: 'Arbre (bas)', icon: <ArrowDown className="w-3.5 h-3.5" />, onClick: () => onDirectionChange?.('down') },
              { divider: true },
              { label: 'Radial', icon: <Circle className="w-3.5 h-3.5" />, onClick: () => onLayoutChange?.('radial') },
              { label: 'Équilibré', icon: <Layout className="w-3.5 h-3.5" />, onClick: () => onLayoutChange?.('balanced') },
            ]}
          />
          {/* 🆕 Bouton Tout Supprimer */}
          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />
          <IconButton 
            icon={<Eraser />} 
            onClick={() => setShowClearConfirm(true)} 
            title="Tout supprimer le schéma" 
            variant="danger"
          />
        </ToolbarGroup>

        {/* ─── Group 9: Actions ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <IconButton icon={<Keyboard />} onClick={() => setShowShortcuts(true)} title="Raccourcis (?)" variant="info" size="md" />
          
          <DropdownMenu
            align="right"
            trigger={
              <button className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 rounded-xl text-xs font-semibold transition-all">
                <Download className="w-4 h-4" />
                <span>Exporter</span>
              </button>
            }
            items={[
              { label: 'PDF', icon: <FileText className="w-3.5 h-3.5" />, onClick: () => onExport('pdf') },
              { label: 'XMind', icon: <FileText className="w-3.5 h-3.5" />, onClick: () => onExport('xmind') },
              { label: 'SVG', icon: <FileText className="w-3.5 h-3.5" />, onClick: () => onExport('svg') },
              { label: 'PNG', icon: <Image className="w-3.5 h-3.5" />, onClick: () => onExport('png') },
              { label: 'HTML', icon: <FileText className="w-3.5 h-3.5" />, onClick: () => onExport('html') },
              { divider: true },
              { label: 'Mermaid', icon: <FileText className="w-3.5 h-3.5" />, onClick: () => onExport('mermaid') },
              { label: 'Markdown', icon: <FileText className="w-3.5 h-3.5" />, onClick: () => onExport('markdown') },
              { label: 'JSON', icon: <FileText className="w-3.5 h-3.5" />, onClick: () => onExport('json') },
            ]}
          />

          <IconButton icon={<Printer />} onClick={onPrint} title="Imprimer" size="md" />
          
          <button
            onClick={onImportTrigger}
            title="Importer"
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl border border-white/5 transition-colors"
          >
            <Upload className="w-4 h-4" />
          </button>

          <button
            onClick={onSave}
            disabled={isSaving}
            className={`
              flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200
              ${isSaving 
                ? 'bg-orange-600/40 text-orange-200 cursor-not-allowed' 
                : 'bg-orange-600 hover:bg-orange-500 text-white shadow-[0_4px_12px_rgba(234,88,12,0.3)] hover:scale-105 active:scale-95'
              }
            `}
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Indexation...' : 'Sauvegarder'}</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default MindMapToolbar;