// src/components/mindmap/MindMapMetadataPanel.tsx
import React, { useState, useEffect } from 'react';
import { 
  X, 
  Trash2, 
  Settings, 
  Link as LinkIcon, 
  Info,
  Layers,
  Activity,
  AlertTriangle,
  RotateCw,
  Database,
  Square,
  Circle,
  Hexagon,
  Type,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Hash,
  Tag,
  ExternalLink,
  Image,
  FileText,
  Copy,
  Scissors,
  Move
} from 'lucide-react';
import { MindMapNode, MindMapNodeType } from '@/ai/mindmap/types';

interface MindMapMetadataPanelProps {
  node: MindMapNode | null;
  allNodes: MindMapNode[];
  dbParameters: Array<{ id: string; name: string; unit?: string; description?: string }>;
  onUpdateNode: (updatedNode: MindMapNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export const MindMapMetadataPanel: React.FC<MindMapMetadataPanelProps> = ({
  node,
  allNodes,
  dbParameters,
  onUpdateNode,
  onDeleteNode,
  onClose
}) => {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [kks, setKks] = useState('');
  const [unit, setUnit] = useState('');
  const [criticality, setCriticality] = useState<'low' | 'medium' | 'high' | 'critical'>('low');
  const [optimalValue, setOptimalValue] = useState('');
  const [formulaExpression, setFormulaExpression] = useState('');
  const [styleColor, setStyleColor] = useState('#ffffff');
  const [styleBg, setStyleBg] = useState('#1e293b');
  const [styleBorder, setStyleBorder] = useState('#475569');
  const [nodeShape, setNodeShape] = useState<'rectangle' | 'circle' | 'ellipse' | 'rhombus'>('rectangle');
  const [nodeEmoji, setNodeEmoji] = useState('');
  const [fontWeight, setFontWeight] = useState<'normal' | 'bold'>('normal');
  const [fontStyle, setFontStyle] = useState<'normal' | 'italic'>('normal');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center');

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (node) {
      setLabel(node.label || '');
      setDescription(node.description || '');
      setParentId(node.parentId || '');
      setKks(node.kks || '');
      setUnit(node.unit || '');
      setCriticality(node.criticality || 'low');
      setOptimalValue(node.optimalValue || '');
      setFormulaExpression(node.formulaExpression || '');
      setStyleColor(node.style?.color || '#ffffff');
      setStyleBg(node.style?.backgroundColor || '#1e293b');
      setStyleBorder(node.style?.borderColor || '#475569');
      setNodeShape(node.style?.shape || 'rectangle');
      setNodeEmoji((node.customAttributes?.emoji as string) || '');
      setFontWeight(node.style?.fontWeight === 'bold' ? 'bold' : 'normal');
      setFontStyle(node.style?.fontStyle === 'italic' ? 'italic' : 'normal');
      setTextAlign((node.style?.textAlign as 'left' | 'center' | 'right') || 'center');
      setSyncStatus('idle');
    }
  }, [node]);

  if (!node) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500 bg-slate-950/40 border-l border-white/10 backdrop-blur-xl">
        <Info className="w-8 h-8 mb-3 opacity-30" />
        <p className="text-xs">Sélectionnez un nœud dans le schéma pour inspecter ses propriétés et métadonnées.</p>
      </div>
    );
  }

  const handleSave = () => {
    onUpdateNode({
      ...node,
      label,
      description: description || null,
      parentId: parentId || null,
      kks: kks || null,
      unit: unit || null,
      criticality,
      optimalValue: optimalValue || null,
      formulaExpression: formulaExpression || null,
      style: {
        ...node.style,
        color: styleColor,
        backgroundColor: styleBg,
        borderColor: styleBorder,
        shape: nodeShape,
        fontWeight,
        fontStyle,
        textAlign
      },
      customAttributes: {
        ...node.customAttributes,
        emoji: nodeEmoji || undefined
      }
    });
  };

  // Synchronise parameter node back to SQLite ref_parametres table!
  const handleSyncToDB = async () => {
    if (node.type !== 'parameter' || !label) return;
    setIsSyncing(true);
    setSyncStatus('idle');
    try {
      // Find parameter by matching name if we have it
      const circuitId = (allNodes.find(n => n.id === 'root')?.label) || '10CRF';
      const cleanParamName = label.split(' (')[0];

      const response = await fetch('/api/circuit-mindmap/sync-parameter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          circuitId,
          name: cleanParamName,
          unit: unit || null,
          description: description || null
        })
      });

      const resData = await response.json();
      if (resData.success) {
        setSyncStatus('success');
      } else {
        setSyncStatus('error');
      }
    } catch (error) {
      console.error('[SYNC] Sync failed:', error);
      setSyncStatus('error');
    } finally {
      setIsSyncing(false);
    }
  };

  const potentialParents = allNodes.filter(n => n.id !== node.id);

  return (
    <div className="h-full flex flex-col bg-slate-950/70 border-l border-white/10 backdrop-blur-xl shadow-2xl text-slate-100 overflow-y-auto w-[320px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-orange-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider">Inspecteur de Nœud</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-5 space-y-5">
        {/* Type Badge */}
        <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Type de nœud</span>
          <span className={`
            px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider
            ${node.type === 'parameter' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : ''}
            ${node.type === 'formula' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : ''}
            ${node.type === 'dependency' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : ''}
            ${node.type === 'note' ? 'bg-slate-500/20 text-slate-400 border border-slate-500/30' : ''}
          `}>
            {node.type}
          </span>
        </div>

        {/* Labels & Details */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">Titre / Libellé</label>
            <input
              type="text"
              value={label}
              onChange={(e) => { setLabel(e.target.value); }}
              onBlur={handleSave}
              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => { setDescription(e.target.value); }}
              onBlur={handleSave}
              placeholder="Spécifications opérationnelles ou rôle..."
              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500 transition-colors resize-none"
            />
          </div>

          {/* Database Parameters Binding */}
          {node.type === 'parameter' && dbParameters.length > 0 && (
            <div className="space-y-2 bg-sky-950/20 border border-sky-500/20 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-sky-400">
                <LinkIcon className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase">Liaison de Paramètre DB</span>
              </div>
              <select
                value={label.split(' (')[0]}
                onChange={(e) => {
                  const param = dbParameters.find(p => p.name === e.target.value);
                  if (param) {
                    const newLabel = param.name;
                    setLabel(newLabel);
                    setUnit(param.unit || '');
                    setDescription(param.description || '');
                    
                    onUpdateNode({
                      ...node,
                      label: newLabel,
                      unit: param.unit || null,
                      description: param.description || null
                    });
                  }
                }}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-sky-200 focus:outline-none"
              >
                <option value="">-- Choisir un paramètre physique --</option>
                {dbParameters.map(p => (
                  <option key={p.id} value={p.name}>
                    {p.name} {p.unit ? `(${p.unit})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Industrial Fields */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Attributs Industriels</span>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[9px] text-slate-400 block font-medium">Code KKS</span>
                <input
                  type="text"
                  placeholder="Ex. 10CRF011"
                  value={kks}
                  onChange={(e) => setKks(e.target.value)}
                  onBlur={handleSave}
                  className="w-full px-2 py-1 bg-slate-900 border border-white/10 rounded-lg text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <span className="text-[9px] text-slate-400 block font-medium">Unité physique</span>
                <input
                  type="text"
                  placeholder="Ex. bar, °C, m³/h"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  onBlur={handleSave}
                  className="w-full px-2 py-1 bg-slate-900 border border-white/10 rounded-lg text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[9px] text-slate-400 block font-medium">Valeur Nominale</span>
                <input
                  type="text"
                  placeholder="Ex. 1.5 - 2.0"
                  value={optimalValue}
                  onChange={(e) => setOptimalValue(e.target.value)}
                  onBlur={handleSave}
                  className="w-full px-2 py-1 bg-slate-900 border border-white/10 rounded-lg text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <span className="text-[9px] text-slate-400 block font-medium">Criticité</span>
                <select
                  value={criticality}
                  onChange={(e) => {
                    const crit = e.target.value as any;
                    setCriticality(crit);
                    onUpdateNode({ ...node, criticality: crit });
                  }}
                  className="w-full px-2 py-1 bg-slate-900 border border-white/10 rounded-lg text-xs text-white"
                >
                  <option value="low">Faible</option>
                  <option value="medium">Moyenne</option>
                  <option value="high">Haute</option>
                  <option value="critical">Critique</option>
                </select>
              </div>
            </div>

            {/* Formula Field (only visible for formula nodes) */}
            {node.type === 'formula' && (
              <div className="space-y-1">
                <span className="text-[9px] text-slate-400 block font-medium">Expression de calcul</span>
                <textarea
                  rows={2}
                  placeholder="Ex. R = Temp_Entree - Temp_Sortie"
                  value={formulaExpression}
                  onChange={(e) => setFormulaExpression(e.target.value)}
                  onBlur={handleSave}
                  className="w-full px-2 py-1 bg-slate-900 border border-white/10 rounded-lg text-xs font-mono text-emerald-400 resize-none"
                />
              </div>
            )}
          </div>

          {/* Bidirectional Sync Suggestion Alert Box */}
          {node.type === 'parameter' && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 space-y-2 mt-2">
              <div className="flex items-center gap-1.5 text-orange-400">
                <Activity className="w-3.5 h-3.5 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Synchronisation DB</span>
              </div>
              <p className="text-[10px] text-slate-400">
                Les modifications apportées au paramètre peuvent être synchronisées en temps réel vers la base SQLite opérationnelle.
              </p>
              <button
                onClick={handleSyncToDB}
                disabled={isSyncing}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-800 text-white rounded-lg text-[10px] font-bold transition-all shadow-lg shadow-orange-950/20"
              >
                {isSyncing ? (
                  <RotateCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Database className="w-3 h-3" />
                )}
                <span>Synchroniser avec SQLite</span>
              </button>

              {syncStatus === 'success' && (
                <div className="text-[9px] text-emerald-400 font-semibold text-center mt-1">
                  ✓ Base de données synchronisée !
                </div>
              )}
              {syncStatus === 'error' && (
                <div className="text-[9px] text-red-400 font-semibold text-center mt-1">
                  ✗ Échec de synchronisation.
                </div>
              )}
            </div>
          )}

          {/* Parent Node Selection */}
          <div className="space-y-1.5 pt-3 border-t border-white/10">
            <label className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
              <Layers className="w-3 h-3" />
              <span>Nœud Parent (Hiérarchie)</span>
            </label>
            <select
              value={parentId}
              onChange={(e) => {
                setParentId(e.target.value);
                onUpdateNode({ ...node, parentId: e.target.value || null });
              }}
              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500"
            >
              <option value="">-- Aucun (Nœud Racine) --</option>
              {potentialParents.map(n => (
                <option key={n.id} value={n.id}>
                  {n.label} ({n.type})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ─── Shape Selection ─────────────────────────────────────────── */}
        <div className="space-y-2 pt-3 border-t border-white/10">
          <label className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
            <Square className="w-3 h-3" />
            <span>Forme du nœud</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { value: 'rectangle', icon: <Square className="w-4 h-4" /> },
              { value: 'circle', icon: <Circle className="w-4 h-4" /> },
              { value: 'ellipse', icon: <Circle className="w-4 h-4" /> },
              { value: 'rhombus', icon: <Hexagon className="w-4 h-4" /> },
            ].map(({ value, icon }) => (
              <button
                key={value}
                onClick={() => { setNodeShape(value as any); handleSave(); }}
                className={`
                  flex items-center justify-center p-2 rounded-lg border transition-all
                  ${nodeShape === value 
                    ? 'bg-orange-600 border-orange-500 text-white' 
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/30'}
                `}
                title={value}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Emoji / Icon ────────────────────────────────────────────── */}
        <div className="space-y-1.5 pt-3 border-t border-white/10">
          <label className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
            <Tag className="w-3 h-3" />
            <span>Emoji / Icône</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nodeEmoji}
              onChange={(e) => setNodeEmoji(e.target.value)}
              onBlur={handleSave}
              placeholder="Ex. ⚙️ 📊 🔧"
              className="flex-1 px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500"
            />
            <div className="flex gap-1">
              {['⚙️', '📊', '🔧', '💡', '⚡', '🔗'].map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { setNodeEmoji(emoji); handleSave(); }}
                  className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Text Formatting ─────────────────────────────────────────── */}
        <div className="space-y-2 pt-3 border-t border-white/10">
          <label className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
            <Type className="w-3 h-3" />
            <span>Formatage du texte</span>
          </label>
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => { setFontWeight(fontWeight === 'bold' ? 'normal' : 'bold'); handleSave(); }}
              className={`p-1.5 rounded-lg transition-colors ${fontWeight === 'bold' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}
              title="Gras"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setFontStyle(fontStyle === 'italic' ? 'normal' : 'italic'); handleSave(); }}
              className={`p-1.5 rounded-lg transition-colors ${fontStyle === 'italic' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}
              title="Italique"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleSave()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
              title="Souligné"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <div className="w-[1px] h-4 bg-white/10 mx-1" />
            <button
              onClick={() => { setTextAlign('left'); handleSave(); }}
              className={`p-1.5 rounded-lg transition-colors ${textAlign === 'left' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}
              title="Aligner gauche"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setTextAlign('center'); handleSave(); }}
              className={`p-1.5 rounded-lg transition-colors ${textAlign === 'center' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}
              title="Centrer"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setTextAlign('right'); handleSave(); }}
              className={`p-1.5 rounded-lg transition-colors ${textAlign === 'right' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}
              title="Aligner droite"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ─── Color Pickers ───────────────────────────────────────────── */}
        <div className="space-y-2 pt-3 border-t border-white/10">
          <label className="text-[10px] text-slate-400 uppercase font-semibold">Couleurs</label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-[9px] text-slate-400 block mb-1">Texte</span>
              <input
                type="color"
                value={styleColor}
                onChange={(e) => { setStyleColor(e.target.value); }}
                onBlur={handleSave}
                className="w-full h-8 bg-slate-900 border border-white/10 rounded-lg p-0.5 cursor-pointer"
              />
            </div>
            <div>
              <span className="text-[9px] text-slate-400 block mb-1">Fond</span>
              <input
                type="color"
                value={styleBg}
                onChange={(e) => { setStyleBg(e.target.value); }}
                onBlur={handleSave}
                className="w-full h-8 bg-slate-900 border border-white/10 rounded-lg p-0.5 cursor-pointer"
              />
            </div>
            <div>
              <span className="text-[9px] text-slate-400 block mb-1">Bordure</span>
              <input
                type="color"
                value={styleBorder}
                onChange={(e) => { setStyleBorder(e.target.value); }}
                onBlur={handleSave}
                className="w-full h-8 bg-slate-900 border border-white/10 rounded-lg p-0.5 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* ─── Quick Actions ───────────────────────────────────────────── */}
        <div className="space-y-2 pt-3 border-t border-white/10">
          <label className="text-[10px] text-slate-400 uppercase font-semibold">Actions rapides</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(node.label); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-slate-300 hover:text-white transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copier texte</span>
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(node, null, 2));
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-slate-300 hover:text-white transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copier JSON</span>
            </button>
            <button
              onClick={() => {
                const json = prompt('Collez le JSON du nœud:');
                if (json) {
                  try {
                    const parsed = JSON.parse(json);
                    onUpdateNode({ ...node, ...parsed });
                  } catch (e) {
                    alert('JSON invalide');
                  }
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-slate-300 hover:text-white transition-colors"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Coller JSON</span>
            </button>
            <button
              onClick={() => {
                const x = prompt('Position X:', String(node.positionX ?? 0));
                const y = prompt('Position Y:', String(node.positionY ?? 0));
                if (x !== null && y !== null) {
                  onUpdateNode({ ...node, positionX: parseInt(x), positionY: parseInt(y) });
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-slate-300 hover:text-white transition-colors"
            >
              <Move className="w-3.5 h-3.5" />
              <span>Déplacer</span>
            </button>
          </div>
        </div>
      </div>

      {/* Delete / Actions Footer */}
      <div className="p-4 border-t border-white/10 bg-white/5 flex items-center gap-2">
        <button
          onClick={() => onDeleteNode(node.id)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-red-950/40 hover:bg-red-900 border border-red-500/30 hover:border-red-500 text-red-200 hover:text-white rounded-xl text-xs font-semibold transition-all duration-200"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Supprimer le nœud</span>
        </button>
      </div>
    </div>
  );
};
export default MindMapMetadataPanel;
