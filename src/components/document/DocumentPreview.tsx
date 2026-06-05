// src/components/document/DocumentPreview.tsx

'use client';

import { useState, useEffect, useRef } from 'react';
import { FileText, Loader2, Download, Eye, ZoomIn, ZoomOut, Minimize2, Maximize2, Folder } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DocumentPreviewProps {
  filePath: string;
  fileName: string;
  fileType: string;
  content?: string;
  isImage?: boolean;
  isPdf?: boolean;
  isText?: boolean;
  isDirectory?: boolean;
}

const ZOOM_STEP = 0.15;
const ZOOM_MIN  = 0.4;
const ZOOM_MAX  = 3.0;
const ZOOM_DEFAULT = 1.0;

/**
 * DocumentPreview - Elite 32 Edition
 * Gère la visualisation multi-format (Images, PDF, Markdown, Texte brut)
 * avec zoom interactif pour les PDF.
 */
export function DocumentPreview({ filePath, fileName, fileType, content, isImage: propIsImage, isPdf: propIsPdf, isText: propIsText, isDirectory }: DocumentPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [, setError]                = useState(false);

  // Zoom state
  const isPdf   = !isDirectory && (propIsPdf ?? /\.pdf$/i.test(fileName));
  const isImage = !isDirectory && (propIsImage ?? /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName));
  const isText  = !isDirectory && (propIsText ?? /\.(md|txt|json|ts|tsx)$/i.test(fileName));

  const [zoom, setZoom]             = useState(ZOOM_DEFAULT);
  const [isFitMode, setIsFitMode]   = useState(false);
  const containerRef                = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadPreview = async () => {
      if (isText) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/documents/raw?path=${encodeURIComponent(filePath)}`);
        if (response.ok) {
          const blob = await response.blob();
          const url  = URL.createObjectURL(blob);
          setPreviewUrl(url);
        } else {
          setError(true);
        }
      } catch (error) {
        console.error('[PREVIEW] Failed to load:', error);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadPreview();

    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, fileName]);

  // ── Keyboard zoom shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isPdf) return;
      if ((e.ctrlKey || e.metaKey) && e.key === '=') { e.preventDefault(); handleZoomIn(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); handleZoomOut(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); handleReset(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });


  const handleZoomIn  = () => setZoom(z => Math.min(+(z + ZOOM_STEP).toFixed(2), ZOOM_MAX));
  const handleZoomOut = () => setZoom(z => Math.max(+(z - ZOOM_STEP).toFixed(2), ZOOM_MIN));
  const handleReset   = () => { setZoom(ZOOM_DEFAULT); setIsFitMode(false); };
  const handleFit     = () => { setZoom(0.75); setIsFitMode(true); };

  if (loading) {
    return (
      <Card className="bg-[#212121] border-white/5 rounded-3xl overflow-hidden shadow-2xl h-[600px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Acquisition du flux...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-[#212121] border-white/5 rounded-3xl overflow-hidden shadow-2xl h-full flex flex-col min-h-[600px]">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600/20 rounded-lg">
            <Eye className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-white tracking-widest block">Prévisualisation Physique</span>
            <span className="text-[9px] text-gray-500 font-bold uppercase truncate max-w-[200px] block">{fileName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls — only for PDF */}
          {isPdf && previewUrl && (
            <div className="flex items-center gap-1 bg-black/30 rounded-xl px-2 py-1 border border-white/5">
              <button
                onClick={handleZoomOut}
                disabled={zoom <= ZOOM_MIN}
                title="Zoom arrière (Ctrl -)"
                className={cn(
                  "p-1.5 rounded-lg transition-all",
                  zoom <= ZOOM_MIN
                    ? "text-gray-700 cursor-not-allowed"
                    : "text-gray-400 hover:text-white hover:bg-white/10"
                )}
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <span className="text-[10px] font-black text-gray-400 min-w-[38px] text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>

              <button
                onClick={handleZoomIn}
                disabled={zoom >= ZOOM_MAX}
                title="Zoom avant (Ctrl +)"
                className={cn(
                  "p-1.5 rounded-lg transition-all",
                  zoom >= ZOOM_MAX
                    ? "text-gray-700 cursor-not-allowed"
                    : "text-gray-400 hover:text-white hover:bg-white/10"
                )}
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-4 bg-white/10 mx-1" />

              <button
                onClick={handleFit}
                title="Vue ajustée"
                className={cn(
                  "p-1.5 rounded-lg transition-all",
                  isFitMode ? "text-blue-400 bg-blue-500/10" : "text-gray-400 hover:text-white hover:bg-white/10"
                )}
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handleReset}
                title="Taille réelle (Ctrl 0)"
                className={cn(
                  "p-1.5 rounded-lg transition-all",
                  !isFitMode && zoom === ZOOM_DEFAULT ? "text-blue-400 bg-blue-500/10" : "text-gray-400 hover:text-white hover:bg-white/10"
                )}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <Badge variant="outline" className="text-[9px] border-white/10 text-gray-500 uppercase px-3 py-0.5">
            {fileType || 'BIN'}
          </Badge>
        </div>
      </div>

      {/* ── Content area ─────────────────────────────────────────────────── */}
      <CardContent className="p-0 bg-black/20 flex-1 relative overflow-hidden flex items-start justify-center">
        {isImage && previewUrl ? (
          <div className="w-full h-full flex items-center justify-center p-6">
            <img
              src={previewUrl}
              alt={fileName}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-white/5"
            />
          </div>

        ) : isPdf && previewUrl ? (
          /* PDF with zoom */
          <div
            ref={containerRef}
            className="w-full h-full overflow-auto custom-scrollbar"
            style={{ background: '#1a1a1a' }}
          >
            <div
              style={{
                transformOrigin: 'top center',
                transform: `scale(${zoom})`,
                transition: 'transform 0.15s ease',
                width: zoom < 1 ? `${100 / zoom}%` : '100%',
              }}
            >
              <iframe
                src={`${previewUrl}#toolbar=0&navpanes=0`}
                className="w-full border-0 invert-[0.85] hue-rotate-180"
                style={{
                  height: '85vh',
                  minHeight: '600px',
                  display: 'block',
                }}
                title={fileName}
              />
            </div>
          </div>

        ) : isText ? (
          <div className="w-full h-full p-8 overflow-y-auto custom-scrollbar font-mono text-[11px] text-gray-400 leading-relaxed whitespace-pre-wrap bg-[#171717]">
            <div className="max-w-2xl mx-auto opacity-80">
              {content || "Contenu textuel indisponible ou en cours de lecture..."}
            </div>
          </div>

        ) : isDirectory ? (
          <div className="flex flex-col items-center justify-center text-center p-10 space-y-6 w-full h-full">
            <div className="w-24 h-24 bg-blue-600/10 rounded-full flex items-center justify-center border border-blue-500/20">
              <Folder className="w-12 h-12 text-blue-500 opacity-60" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-black text-white uppercase tracking-widest">Dossier Système</p>
              <p className="text-[10px] text-gray-500 font-medium max-w-xs mx-auto">
                Ce chemin correspond à un répertoire. Utilisez l'explorateur pour naviguer dans son contenu.
              </p>
            </div>
          </div>

        ) : (
          <div className="flex flex-col items-center justify-center text-center p-10 space-y-6 w-full h-full">
            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
              <FileText className="w-12 h-12 text-gray-600 opacity-40" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Format non rendu nativement</p>
              <p className="text-[10px] text-gray-600 font-medium max-w-xs mx-auto">
                Ce fichier est indexé sémantiquement mais ne possède pas de visualiseur graphique dédié.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => window.open(`/api/documents/raw?path=${encodeURIComponent(filePath)}`, '_blank')}
              className="bg-white/5 border-white/10 text-white rounded-xl font-bold text-[10px] uppercase h-10 px-6 gap-2"
            >
              <Download className="w-3.5 h-3.5" /> Télécharger le brut
            </Button>
          </div>
        )}
      </CardContent>

      {/* ── Zoom hint footer for PDF ─────────────────────────────────────── */}
      {isPdf && previewUrl && (
        <div className="px-4 py-2 border-t border-white/5 bg-black/20 flex items-center justify-between flex-shrink-0">
          <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">
            Ctrl + Molette · Ctrl +/- · Ctrl 0
          </span>
          <div className="flex gap-3">
            {[0.5, 0.75, 1.0, 1.5, 2.0].map(level => (
              <button
                key={level}
                onClick={() => { setZoom(level); setIsFitMode(level !== 1.0); }}
                className={cn(
                  "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded transition-all",
                  zoom === level ? "text-blue-400 bg-blue-500/10" : "text-gray-600 hover:text-gray-400"
                )}
              >
                {Math.round(level * 100)}%
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
