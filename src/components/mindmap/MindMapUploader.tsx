// src/components/mindmap/MindMapUploader.tsx
import React, { useState, useCallback } from 'react';
import { 
  Upload, 
  FileText, 
  Sparkles, 
  CheckCircle, 
  AlertTriangle,
  Code,
  Image as ImageIcon,
  FileImage,
  Loader2
} from 'lucide-react';

interface MindMapUploaderProps {
  circuitId: string;
  onImportSuccess: (mindmap: any) => void;
  onClose: () => void;
}

type InputMode = 'text' | 'image';
type TextFormat = 'mermaid' | 'markdown' | 'json';

const ACCEPTED_IMAGE_TYPES = '.svg,.png,.jpg,.jpeg,.webp';
const ACCEPTED_TEXT_TYPES = '.json,.md,.markdown,.mermaid,.mm,.txt,.xmind';

export const MindMapUploader: React.FC<MindMapUploaderProps> = ({
  circuitId,
  onImportSuccess,
  onClose
}) => {
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<TextFormat>('mermaid');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleTextFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'json') setFormat('json');
    else if (ext === 'md' || ext === 'markdown') setFormat('markdown');
    else if (ext === 'mermaid' || ext === 'mm') setFormat('mermaid');
    const reader = new FileReader();
    reader.onload = ev => setContent(ev.target?.result as string);
    reader.readAsText(file);
  };

  const handleImageFileChange = useCallback((file: File) => {
    setImageFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleImageDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageFileChange(file);
  };

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageFileChange(file);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      let res: Response;

      if (inputMode === 'image') {
        // FormData upload for SVG/PNG
        if (!imageFile) {
          setError('Veuillez sélectionner un fichier image.');
          return;
        }
        const form = new FormData();
        form.append('circuitId', circuitId);
        form.append('file', imageFile);
        res = await fetch('/api/circuit-mindmap/upload', { method: 'POST', body: form });
      } else {
        // JSON body upload for text formats
        if (!content.trim()) {
          setError('Veuillez fournir du contenu.');
          return;
        }
        res = await fetch('/api/circuit-mindmap/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ circuitId, content, format, metadata: { importedAt: Date.now(), source: 'uploader' } })
        });
      }

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Une erreur est survenue lors de l'importation.");

      const stats = data.stats ? ` (${data.stats.nodesDetected} nœuds, ${data.stats.edgesDetected} connexions)` : '';
      setSuccess(`Mind Map importé avec succès !${stats}`);
      setTimeout(() => onImportSuccess(data.mindmap), 1200);

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 bg-slate-950 border border-white/10 rounded-2xl backdrop-blur-2xl shadow-2xl max-w-xl w-full text-slate-100 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <Upload className="w-5 h-5 text-orange-500" />
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Importer un Mind Map</h3>
            <p className="text-[11px] text-slate-400">Circuit cible : <span className="font-mono text-orange-400">{circuitId}</span></p>
          </div>
        </div>
      </div>

      {/* Mode switcher */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setInputMode('text')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
            inputMode === 'text'
              ? 'bg-orange-600/15 border-orange-500 text-orange-300'
              : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <FileText className="w-4 h-4" />
          Texte (Mermaid / Markdown / JSON)
        </button>
        <button
          onClick={() => setInputMode('image')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
            inputMode === 'image'
              ? 'bg-blue-600/15 border-blue-400 text-blue-300'
              : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <FileImage className="w-4 h-4" />
          Image / PDF
        </button>
      </div>

      {/* ── TEXT MODE ─────────────────────────────────────────────────────── */}
      {inputMode === 'text' && (
        <>
          <div className="space-y-2">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">Format du document</label>
            <div className="grid grid-cols-3 gap-2">
              {(['mermaid', 'markdown', 'json'] as const).map(fmt => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormat(fmt)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                    format === fmt
                      ? 'bg-orange-600/10 border-orange-500 text-orange-400 font-bold'
                      : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Code className="w-3.5 h-3.5" />
                  <span className="capitalize">{fmt}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="relative border-2 border-dashed border-white/10 hover:border-orange-500/40 rounded-xl p-5 text-center transition-all bg-white/5">
            <input
              type="file"
              accept={ACCEPTED_TEXT_TYPES}
              onChange={handleTextFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-semibold text-white">Glissez-déposez un fichier</p>
            <p className="text-[10px] text-slate-400 mt-1">Accepte .json, .md, .mermaid, .txt</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 uppercase font-semibold flex justify-between">
              <span>Ou collez le schéma brut</span>
              {content.trim() && <span className="font-mono text-slate-500">{content.length} car.</span>}
            </label>
            <textarea
              rows={7}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={
                format === 'mermaid'
                  ? 'graph TD\n  A[Turbine] --> B((Pression))\n  B --> C{Régulateur}'
                  : format === 'markdown'
                    ? '1. Système SAP (Air de Service)\nComposants Principaux:\nCompresseur à vis 101 CO\n.\nRéservoir 6 m³\n.'
                    : '{\n  "nodes": [\n    { "id": "A", "type": "dependency", "label": "Turbine" }\n  ]\n}'
              }
              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-orange-500 resize-none"
            />
          </div>
        </>
      )}

      {/* ── IMAGE MODE (REDIRECT MESSAGE) ─────────────────────────────────── */}
      {inputMode === 'image' && (
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center p-8 bg-blue-950/20 border border-blue-500/20 rounded-xl text-center">
            <Sparkles className="w-10 h-10 text-blue-400 mb-4" />
            <h4 className="text-sm font-bold text-blue-300 mb-2">Import depuis une image non supporté</h4>
            <p className="text-xs text-blue-200/80 leading-relaxed max-w-md">
              Les formats binaires (PNG, JPG, PDF) ne peuvent pas être importés directement et analysés avec précision.
              <br/><br/>
              Pour utiliser un Mind Map existant :
              <br/>1. Ouvrez votre fichier dans <strong>XMind</strong>, <strong>MindMeister</strong> ou <strong>Miro</strong>.
              <br/>2. Exportez-le en format <strong>JSON</strong> ou <strong>.xmind</strong>.
              <br/>3. Utilisez l'onglet <strong>Texte</strong> pour importer ce fichier ici.
            </p>
          </div>
        </div>
      )}

      {/* Notifications */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-950/20 border border-red-500/30 text-red-200 rounded-xl text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 bg-emerald-950/20 border border-emerald-500/30 text-emerald-200 rounded-xl text-xs">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-40"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || (inputMode === 'text' ? !content.trim() : !imageFile)}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${
            isSubmitting || (inputMode === 'text' && !content.trim()) || inputMode === 'image'
              ? 'bg-orange-600/40 text-orange-200 cursor-not-allowed'
              : 'bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-500/20 hover:scale-105 active:scale-95'
          }`}
        >
          {isSubmitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Importation...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Importer</>
          )}
        </button>
      </div>
    </div>
  );
};

export default MindMapUploader;
