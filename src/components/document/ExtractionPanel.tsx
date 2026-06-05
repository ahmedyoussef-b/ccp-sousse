// src/components/document/ExtractionPanel.tsx

'use client';

import { useState, useMemo } from 'react';
import { 
  Target, 
  Edit3, 
  Check, 
  X, 
  Loader2, 
  Sparkles, 
  FileText, 
  Camera,
  Layers,
  Info,
  AlertTriangle,
  Hash,
  BarChart2,
  Wand2
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ExtractionPanelProps {
  extractedText: string;
  ocrConfidence?: number;
  metadata?: Record<string, any>;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onChange: (text: string) => void;
  saving: boolean;
}

// ── Text-quality helpers ─────────────────────────────────────────────────────

/** Remove OCR noise (garbled chars, lone chars lines, excessive whitespace). */
function cleanOcrText(raw: string): string {
  if (!raw) return '';

  const lines = raw.split('\n');
  const cleaned = lines
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      // Keep lines that have at least 3 letters
      const letterCount = (line.match(/[a-zA-ZÀ-öø-ÿ]/g) || []).length;
      // Drop lines that are mostly non-alpha-numeric (OCR garbage)
      const alphaRatio = letterCount / Math.max(line.length, 1);
      if (line.length <= 2) return false;
      if (alphaRatio < 0.25 && line.length < 20) return false;
      return true;
    })
    // Collapse many consecutive blank lines
    .reduce<string[]>((acc, line) => {
      if (line === '' && acc[acc.length - 1] === '') return acc;
      acc.push(line);
      return acc;
    }, []);

  return cleaned.join('\n');
}

function countWords(text: string): number {
  return (text.match(/\S+/g) || []).length;
}

/** Quick heuristic: ratio of real words vs total tokens. */
function estimateReadability(text: string): number {
  if (!text) return 0;
  const words = (text.match(/\b[a-zA-ZÀ-öø-ÿ]{3,}\b/g) || []).length;
  const total = countWords(text);
  return total > 0 ? Math.min(1, words / total) : 0;
}

function getQualityLabel(score: number): { label: string; color: string } {
  if (score >= 0.7) return { label: 'Haute qualité', color: 'text-green-400' };
  if (score >= 0.4) return { label: 'Qualité moyenne', color: 'text-yellow-400' };
  return { label: 'Qualité faible – correction recommandée', color: 'text-red-400' };
}

// ── Component ────────────────────────────────────────────────────────────────

export function ExtractionPanel({
  extractedText,
  ocrConfidence,
  metadata = {},
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onChange,
  saving
}: ExtractionPanelProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'tech'>('text');
  const [showRaw, setShowRaw] = useState(false);

  // Compute once per render
  const cleanedText = useMemo(() => cleanOcrText(extractedText), [extractedText]);
  const displayText = showRaw ? extractedText : cleanedText;
  const wordCount   = useMemo(() => countWords(cleanedText), [cleanedText]);
  const charCount   = cleanedText.length;
  const readabilityScore = useMemo(() => estimateReadability(cleanedText), [cleanedText]);
  const quality     = getQualityLabel(readabilityScore);

  // Determine if content is a meaningful extraction (not just a fallback bracket)
  const hasContent = cleanedText.length > 50 && !cleanedText.startsWith('[');

  return (
    <Card className="bg-[#212121] border-white/5 rounded-3xl overflow-hidden shadow-2xl transition-all duration-500 hover:border-purple-500/20">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="p-4 border-b border-white/5 bg-purple-600/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-600/20 rounded-lg">
            <Target className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-purple-400 tracking-widest block">Extraction &amp; OCR</span>
            {ocrConfidence !== undefined && (
              <Badge className={cn(
                "border-none text-[8px] font-black h-4 px-1.5 mt-0.5",
                ocrConfidence > 0.8 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
              )}>
                Confiance {Math.round(ocrConfidence * 100)}%
              </Badge>
            )}
          </div>
        </div>

        <div className="flex gap-1">
          {!isEditing ? (
            <Button
              size="icon" variant="ghost" onClick={onEdit}
              className="h-8 w-8 text-purple-400 hover:bg-purple-500/10 rounded-xl"
              title="Éditer le texte extrait"
            >
              <Edit3 className="w-4 h-4" />
            </Button>
          ) : (
            <>
              <Button size="icon" variant="ghost" onClick={onSave} disabled={saving}
                className="h-8 w-8 text-green-500 hover:bg-green-500/10 rounded-xl">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={onCancel} disabled={saving}
                className="h-8 w-8 text-red-500 hover:bg-red-500/10 rounded-xl">
                <X className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex bg-black/20 p-1">
        <button
          onClick={() => setActiveTab('text')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
            activeTab === 'text' ? "bg-purple-600/20 text-purple-400 shadow-inner" : "text-gray-600 hover:text-gray-400"
          )}
        >
          <FileText className="w-3.5 h-3.5" /> Vision Sémantique
        </button>
        <button
          onClick={() => setActiveTab('tech')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
            activeTab === 'tech' ? "bg-blue-600/20 text-blue-400 shadow-inner" : "text-gray-600 hover:text-gray-400"
          )}
        >
          <Info className="w-3.5 h-3.5" /> Données Physiques
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <CardContent className="p-6">

        {/* ══ VISION SÉMANTIQUE ══════════════════════════════════════════ */}
        {activeTab === 'text' ? (
          <div className="space-y-4">

            {/* Low-confidence OCR warning */}
            {ocrConfidence !== undefined && ocrConfidence < 0.7 && (
              <div className="flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl animate-in slide-in-from-top-2">
                <Camera className="w-4 h-4 text-yellow-500 shrink-0" />
                <p className="text-[10px] text-yellow-200/80 font-bold uppercase tracking-tight leading-tight">
                  Confiance OCR limitée. Une correction manuelle optimisera le RAG.
                </p>
              </div>
            )}

            {/* Readability quality strip */}
            {hasContent && !isEditing && (
              <div className="flex items-center gap-3 p-3 bg-black/20 rounded-xl border border-white/5">
                <BarChart2 className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Lisibilité sémantique</span>
                    <span className={cn("text-[9px] font-black uppercase", quality.color)}>{quality.label}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.round(readabilityScore * 100)}%`,
                        background: readabilityScore >= 0.7
                          ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                          : readabilityScore >= 0.4
                          ? 'linear-gradient(90deg, #eab308, #facc15)'
                          : 'linear-gradient(90deg, #ef4444, #f87171)'
                      }}
                    />
                  </div>
                </div>
                <div className="flex gap-3 text-[9px] font-black text-gray-600 shrink-0">
                  <span className="flex items-center gap-1"><Hash className="w-2.5 h-2.5" />{wordCount.toLocaleString()} mots</span>
                  <span>{charCount.toLocaleString()} car.</span>
                </div>
              </div>
            )}

            {/* No content placeholder */}
            {!hasContent && !isEditing && (
              <div className="flex items-center gap-3 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                <p className="text-[10px] text-orange-200/80 font-bold uppercase tracking-tight leading-tight">
                  Contenu sémantique insuffisant. Utilisez Synchroniser RAG pour ré-indexer.
                </p>
              </div>
            )}

            {/* Editor or reader */}
            {isEditing ? (
              <Textarea
                value={extractedText}
                onChange={(e) => onChange(e.target.value)}
                className="bg-black/40 border-purple-500/30 text-white font-mono text-xs min-h-[350px] rounded-2xl focus-visible:ring-purple-500 custom-scrollbar leading-relaxed"
                placeholder="Éditer le texte extrait pour affiner le raisonnement de l'IA..."
              />
            ) : (
              <div className="bg-black/20 rounded-2xl border border-white/5 group relative overflow-hidden">
                {/* Raw/Clean toggle */}
                <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/5">
                  <div className="flex items-center gap-1.5">
                    <Wand2 className="w-3 h-3 text-purple-500/50" />
                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">
                      {showRaw ? 'Flux OCR brut' : 'Vue nettoyée'}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowRaw(r => !r)}
                    className="text-[9px] font-black text-gray-600 hover:text-purple-400 uppercase tracking-widest transition-colors"
                  >
                    {showRaw ? 'Afficher nettoyé' : 'Voir le brut'}
                  </button>
                </div>

                <div className="p-5 max-h-[400px] overflow-y-auto custom-scrollbar">
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Sparkles className="w-4 h-4 text-purple-500/30" />
                  </div>

                  {displayText ? (
                    <p className="text-[11px] text-gray-300 leading-[1.8] font-mono whitespace-pre-wrap break-words">
                      {displayText}
                    </p>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                      <Layers className="w-8 h-8 text-gray-700 opacity-20" />
                      <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
                        Aucune donnée extraite
                      </p>
                      <p className="text-[9px] text-gray-700 max-w-xs">
                        Lancez une synchronisation RAG pour extraire le contenu sémantique.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

        ) : (
          /* ══ DONNÉES PHYSIQUES ════════════════════════════════════════ */
          <div className="space-y-3 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(metadata).length > 0 ? (
                Object.entries(metadata)
                  .filter(([, value]) => value !== null && value !== undefined && value !== '')
                  .map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5 hover:border-blue-500/20 transition-colors">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest truncate max-w-[120px]">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] font-bold text-blue-400 truncate max-w-[200px] text-right">
                        {typeof value === 'object'
                          ? JSON.stringify(value).substring(0, 60) + (JSON.stringify(value).length > 60 ? '…' : '')
                          : String(value).substring(0, 80) + (String(value).length > 80 ? '…' : '')}
                      </span>
                    </div>
                  ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <Layers className="w-10 h-10 text-gray-700 opacity-20" />
                  <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Aucune métadonnée technique</p>
                  <p className="text-[9px] text-gray-700">Synchronisez le document pour générer les métadonnées industrielles.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
