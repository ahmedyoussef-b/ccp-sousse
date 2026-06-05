//src/components/industrial-vision/innovations/PanoramicAssemblyModule.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback, Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Images, 
  Settings2, 
  RotateCw, 
  Grid3x3, 
  Magnet, 
  Layers, 
  XCircle,
  Download,
  MousePointer2,
  Cpu,
  X,
  RefreshCw,
  Lock,
  Trash2,
  Sparkles,
  ChevronRight,
  Activity,
  Zap,
  RotateCcw,
  Eye,
  Save,
  Keyboard
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils';
import { ManualImageState } from '@/ai/innovations/types';

// Types locaux pour la gestion de l'état manuel
interface ImageItem extends ManualImageState {
  url: string;
  name: string;
  width: number;
  height: number;
  visible: boolean;
}

// ─── AUDIT LOGGER ────────────────────────────────────────────────
const PAM_LOG = (tag: string, data: Record<string, unknown>) =>
  console.log(`%c[PAM::${tag}]`, 'color:#818cf8;font-weight:bold', data);
// ──────────────────────────────────────────────────────────────────

export function PanoramicAssemblyModule() {
  const [mode, setMode] = useState<'auto' | 'manual' | 'hybrid'>('manual');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showGrid, setShowGrid] = useState(true);
  const [useSnapping, setUseSnapping] = useState(true);
  const [useGridSnapping, setUseGridSnapping] = useState(false);
  const [globalOpacity, setGlobalOpacity] = useState(100);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stitchedResult, setStitchedResult] = useState<string | null>(null);
  const [differenceMode, setDifferenceMode] = useState(false);
  const [isAutoAligning, setIsAutoAligning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<ImageItem[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [initialAngle, setInitialAngle] = useState(0);
  const [initialRotation, setInitialRotation] = useState(0);
  const [initialScale, setInitialScale] = useState(1);
  const [initialMousePos, setInitialMousePos] = useState({ x: 0, y: 0 });
  const [resizeCorner, setResizeCorner] = useState<'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const [snappingLines, setSnappingLines] = useState<{type: 'x' | 'y', pos: number}[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Persistence local storage
 useEffect(() => {
  const loadSession = () => {
    try {
      const saved = localStorage.getItem('panorama-session-v2');
      const savedId = localStorage.getItem('panorama-session-id');
      
      if (savedId) setSessionId(savedId);
      
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Migration des champs manquants
          const migrated = parsed.map((img: Partial<ImageItem>) => ({
            imageId: img.imageId || `migrated-${Date.now()}`,
            url: img.url || '',
            name: img.name || 'Imported',
            x: img.x ?? 100,
            y: img.y ?? 100,
            width: img.width ?? 800,
            height: img.height ?? 600,
            visible: img.visible ?? true,
            zIndex: img.zIndex ?? 0,
            opacity: img.opacity ?? 100,
            scale: img.scale ?? 1,
            rotation: img.rotation ?? 0,
            locked: img.locked ?? false
          }));
          
          setImages(migrated);
          setHistory([JSON.parse(JSON.stringify(migrated))]);
          setHistoryIndex(0);
          
          PAM_LOG('SESSION_LOADED', { 
            imageCount: migrated.length,
            sessionId: savedId || 'none'
          });
        }
      }
    } catch (e) { 
      console.error("Error loading session", e);
      PAM_LOG('SESSION_ERROR', { error: String(e) });
    }
  };
  
  loadSession();
}, []); // Les setters sont stables, pas besoin de dépendances

  useEffect(() => {
    if (images.length > 0) {
      localStorage.setItem('panorama-session-v2', JSON.stringify(images));
      if (sessionId) localStorage.setItem('panorama-session-id', sessionId);
    }
  }, [images, sessionId]);

  const saveProject = async () => {
    if (images.length === 0) return;
    setIsSaving(true);
    try {
      const response = await fetch('/api/vision/panorama/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          data: images,
          userId: 'industrial-user-1'
        })
      });
      const result = await response.json();
      if (result.success) {
        setSessionId(result.sessionId);
      }
    } catch (e) {
      console.error("Error saving project", e);
    } finally {
      setIsSaving(false);
    }
  };

  const pushToHistory = useCallback((newState: ImageItem[]) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(newState)));
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(49, prev + 1));
  }, [historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setImages(JSON.parse(JSON.stringify(history[newIndex])));
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setImages(JSON.parse(JSON.stringify(history[newIndex])));
    }
  };
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files || []);
  
  // Validation des fichiers
  const validFiles = files.filter(file => {
    const isValidType = file.type.startsWith('image/');
    const isValidSize = file.size <= 50 * 1024 * 1024; // 50MB max
    if (!isValidType) console.warn(`Fichier ignoré: ${file.name} (type invalide)`);
    if (!isValidSize) console.warn(`Fichier ignoré: ${file.name} (taille > 50MB)`);
    return isValidType && isValidSize;
  });
  
  PAM_LOG('FILE_UPLOAD', { 
    fileCount: validFiles.length, 
    rejected: files.length - validFiles.length,
    names: validFiles.map(f => f.name) 
  });
  
  validFiles.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setImages(prev => {
          const newItem: ImageItem = {
            imageId: `img-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 6)}`,
            url,
            name: file.name.replace(/\.[^/.]+$/, ''), // Sans extension
            x: 100 + prev.length * 320,
            y: 100,
            scale: 1.0,
            rotation: 0,
            opacity: 100,
            locked: false,
            visible: true,
            zIndex: prev.length + 10,
            width: img.width,
            height: img.height
          };
          const newList = [...prev, newItem];
          pushToHistory(newList);
          return newList;
        });
      };
      img.onerror = () => {
        console.error(`Erreur chargement image: ${file.name}`);
        alert(`Impossible de charger l'image: ${file.name}`);
      };
      img.src = url;
    };
    reader.onerror = () => {
      console.error(`Erreur lecture fichier: ${file.name}`);
    };
    reader.readAsDataURL(file);
  });
};
  const updateImage = useCallback((id: string, updates: Partial<ImageItem>) => {
    setImages(prev => prev.map(img => img.imageId === id ? { ...img, ...updates } : img));
  }, []);

  const moveLayer = (id: string, direction: 'front' | 'back') => {
    setImages(prev => {
      const maxZ = prev.length > 0 ? Math.max(...prev.map(i => i.zIndex)) : 10;
      const minZ = prev.length > 0 ? Math.min(...prev.map(i => i.zIndex)) : 10;
      return prev.map(img => img.imageId === id ? { ...img, zIndex: direction === 'front' ? maxZ + 1 : minZ - 1 } : img);
    });
  };

  const handleMouseDown = (e: React.MouseEvent, id: string, type: 'drag' | 'rotate' | 'resize', corner?: 'nw' | 'ne' | 'sw' | 'se') => {
    PAM_LOG('MOUSE_DOWN', { id, type, corner, mode, selectedIds, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });
    if (mode === 'auto') {
      PAM_LOG('MOUSE_DOWN_BLOCKED', { reason: 'mode is auto — switch to manual to interact' });
      return;
    }
    const img = images.find(i => i.imageId === id);
    if (!img) return;

    if (e.ctrlKey) {
      const newLocked = !img.locked;
      updateImage(id, { locked: newLocked });
      pushToHistory(images.map(i => i.imageId === id ? { ...i, locked: newLocked } : i));
      return;
    }

    if (img.locked) {
      PAM_LOG('MOUSE_DOWN_BLOCKED', { reason: 'image is locked', id });
      return;
    }

    if (type === 'drag') {
      if (e.shiftKey) {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
      } else if (!selectedIds.includes(id)) {
        setSelectedIds([id]);
      }
    } else {
      // For rotate/resize, just ensure the image is selected without toggling
      if (!selectedIds.includes(id)) {
        setSelectedIds(prev => [...prev, id]);
      }
    }
    
    if (type === 'drag') {
      PAM_LOG('DRAG_START', { id, x: img.x, y: img.y, scale: img.scale });
      setIsDragging(true);
      // Use canvas-relative coordinates to account for scroll
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left + canvas.scrollLeft;
        const mouseY = e.clientY - rect.top + canvas.scrollTop;
        setDragOffset({ x: mouseX - img.x, y: mouseY - img.y });
      }
    } else if (type === 'rotate') {
      PAM_LOG('ROTATE_START', { id, currentRotation: img.rotation });
      setIsRotating(true);
      // Calculate initial angle relative to IMAGE center, not handle center
      const canvas = canvasRef.current;
      if (canvas) {
        const canvasRect = canvas.getBoundingClientRect();
        const imgCenterX = canvasRect.left - canvas.scrollLeft + img.x + (img.width * img.scale) / 2;
        const imgCenterY = canvasRect.top - canvas.scrollTop + img.y + (img.height * img.scale) / 2;
        setInitialAngle(Math.atan2(e.clientY - imgCenterY, e.clientX - imgCenterX));
      }
      setInitialRotation(img.rotation);
    } else if (type === 'resize') {
      PAM_LOG('RESIZE_START', { id, corner, currentScale: img.scale });
      setIsResizing(id);
      setResizeCorner(corner || 'se');
      setInitialScale(img.scale);
      setInitialMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (selectedIds.length === 0 || mode === 'auto') return;
    const primaryId = selectedIds[0];
    const img = images.find(i => i.imageId === primaryId);
    if (!img || img.locked) return;

    if (isDragging && canvasRef.current) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      // Convert screen coords to canvas-local coords
      const mouseX = e.clientX - rect.left + canvas.scrollLeft;
      const mouseY = e.clientY - rect.top + canvas.scrollTop;

      const lines: {type: 'x' | 'y', pos: number}[] = [];

      setImages(prev => {
        // Compute delta from the PRIMARY image only
        const primary = prev.find(i => i.imageId === primaryId);
        if (!primary) return prev;
        const targetX = mouseX - dragOffset.x;
        const targetY = mouseY - dragOffset.y;
        const dx = targetX - primary.x;
        const dy = targetY - primary.y;

        return prev.map(item => {
          if (!selectedIds.includes(item.imageId) || item.locked) return item;

          let newX = item.x + dx;
          let newY = item.y + dy;

          if (useGridSnapping) {
            newX = Math.round(newX / 20) * 20;
            newY = Math.round(newY / 20) * 20;
          } else if (useSnapping && selectedIds.length === 1) {
            const SNAP = 15;
            const myW = item.width * item.scale;
            const myH = item.height * item.scale;
            images.forEach(other => {
              if (selectedIds.includes(other.imageId) || !other.visible) return;
              const oR = other.x + other.width * other.scale;
              const oB = other.y + other.height * other.scale;
              if (Math.abs(newX - other.x) < SNAP) { newX = other.x; lines.push({ type: 'x', pos: other.x }); }
              if (Math.abs(newX - oR) < SNAP) { newX = oR; lines.push({ type: 'x', pos: oR }); }
              if (Math.abs(newX + myW - other.x) < SNAP) { newX = other.x - myW; lines.push({ type: 'x', pos: other.x }); }
              if (Math.abs(newX + myW - oR) < SNAP) { newX = oR - myW; lines.push({ type: 'x', pos: oR }); }
              if (Math.abs(newY - other.y) < SNAP) { newY = other.y; lines.push({ type: 'y', pos: other.y }); }
              if (Math.abs(newY - oB) < SNAP) { newY = oB; lines.push({ type: 'y', pos: oB }); }
              if (Math.abs(newY + myH - other.y) < SNAP) { newY = other.y - myH; lines.push({ type: 'y', pos: other.y }); }
              if (Math.abs(newY + myH - oB) < SNAP) { newY = oB - myH; lines.push({ type: 'y', pos: oB }); }
            });
          }

          return { ...item, x: newX, y: newY };
        });
      });

      setSnappingLines(lines);

    } else if (isRotating && canvasRef.current) {
      // Find the image DOM element center from the canvas
      const canvas = canvasRef.current;
      const canvasRect = canvas.getBoundingClientRect();
      const imgCenterX = canvasRect.left - canvas.scrollLeft + img.x + (img.width * img.scale) / 2;
      const imgCenterY = canvasRect.top - canvas.scrollTop + img.y + (img.height * img.scale) / 2;
      const currentAngle = Math.atan2(e.clientY - imgCenterY, e.clientX - imgCenterX);
      const diff = (currentAngle - initialAngle) * (180 / Math.PI);
      updateImage(primaryId, { rotation: ((initialRotation + diff) % 360 + 360) % 360 });

    } else if (isResizing) {
      const dxMove = e.clientX - initialMousePos.x;
      const dyMove = e.clientY - initialMousePos.y;
      const dist = Math.sqrt(dxMove * dxMove + dyMove * dyMove);
      const sign = (resizeCorner === 'se' || resizeCorner === 'nw')
        ? (dxMove + dyMove > 0 ? 1 : -1)
        : (dxMove - dyMove > 0 ? 1 : -1);
      const newScale = Math.max(0.1, Math.min(5, initialScale + (dist / 300) * sign));
      updateImage(primaryId, { scale: newScale });
    }
  }, [isDragging, isRotating, isResizing, selectedIds, images, dragOffset, initialAngle, initialRotation, initialScale, initialMousePos, resizeCorner, useSnapping, useGridSnapping, mode, updateImage]);

  const handleMouseUp = useCallback(() => {
    PAM_LOG('MOUSE_UP', { isDragging, isRotating, isResizing: !!isResizing, imageCount: images.length });
    if (isDragging || isRotating || isResizing) {
      pushToHistory(images);
    }
    setIsDragging(false);
    setIsRotating(false);
    setIsResizing(null);
    setSnappingLines([]);
  }, [isDragging, isRotating, isResizing, images, pushToHistory]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') { undo(); return; }
      if (e.ctrlKey && e.key === 'y') { redo(); return; }
      
      if (selectedIds.length === 0) return;
      const STEP = e.shiftKey ? 20 : 2;
      
      setImages(prev => prev.map(item => {
        if (!selectedIds.includes(item.imageId) || item.locked) return item;
        switch (e.key) {
          case 'ArrowLeft': return { ...item, x: item.x - STEP };
          case 'ArrowRight': return { ...item, x: item.x + STEP };
          case 'ArrowUp': return { ...item, y: item.y - STEP };
          case 'ArrowDown': return { ...item, y: item.y + STEP };
          case '+': case '=': return { ...item, scale: item.scale + 0.01 };
          case '-': case '_': return { ...item, scale: Math.max(0.1, item.scale - 0.01) };
          case 'r': case 'R': return { ...item, rotation: (item.rotation + 5) % 360 };
          default: return item;
        }
      }));

      if (e.key === 'Delete' || e.key === 'Backspace') {
        setImages(prev => prev.filter(i => !selectedIds.includes(i.imageId)));
        setSelectedIds([]);
      }
      if (e.key === 'Escape') setSelectedIds([]);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, images]);

  useEffect(() => {
    if (isDragging || isRotating || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isRotating, isResizing, handleMouseMove, handleMouseUp]);

  const handleAutoAlign = async () => {
    if (images.length < 2) return;
    setIsAutoAligning(true);
    setProgress(0);
    const interval = setInterval(() => setProgress(p => Math.min(90, p + 10)), 150);
    await new Promise(r => setTimeout(r, 1000));
    clearInterval(interval);
    setImages(prev => {
      const finalImages = prev.map((img, i) => ({
        ...img,
        x: 500 + i * (img.width * 0.3),
        y: 600 + (Math.sin(i) * 30),
        scale: 0.4,
        rotation: (Math.random() - 0.5) * 2
      }));
      pushToHistory(finalImages);
      return finalImages;
    });
    setIsAutoAligning(false);
    setMode('manual');
    setProgress(100);
    setTimeout(() => setProgress(0), 500);
  };

  const generateClientStitch = async () => {
    if (images.length === 0) return;
    setIsProcessing(true);
    setProgress(10);
    
    try {
      const canvas = document.createElement('canvas');
      const visibleImages = images.filter(i => i.visible);
      
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      visibleImages.forEach(img => {
        const w = img.width * img.scale;
        const h = img.height * img.scale;
        minX = Math.min(minX, img.x);
        minY = Math.min(minY, img.y);
        maxX = Math.max(maxX, img.x + w);
        maxY = Math.max(maxY, img.y + h);
      });

      const margin = 50;
      canvas.width = maxX - minX + margin * 2;
      canvas.height = maxY - minY + margin * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const sortedImages = [...visibleImages].sort((a, b) => a.zIndex - b.zIndex);
      
      for (const imgItem of sortedImages) {
        const imgObj = new Image();
        imgObj.src = imgItem.url;
        await new Promise(r => imgObj.onload = r);
        
        ctx.save();
        ctx.globalAlpha = imgItem.opacity / 100;
        const drawX = imgItem.x - minX + margin;
        const drawY = imgItem.y - minY + margin;
        const w = imgItem.width * imgItem.scale;
        const h = imgItem.height * imgItem.scale;

        ctx.translate(drawX + w / 2, drawY + h / 2);
        ctx.rotate((imgItem.rotation * Math.PI) / 180);
        ctx.drawImage(imgObj, -w / 2, -h / 2, w, h);
        ctx.restore();
        setProgress(prev => Math.min(90, prev + (80 / sortedImages.length)));
      }

      setStitchedResult(canvas.toDataURL('image/jpeg', 0.95));
      setProgress(100);
    } catch (e) {
      console.error("Client stitch failed", e);
      alert("Erreur lors de l'assemblage local. Fallback vers le serveur...");
      runStitching();
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 500);
    }
  };

  const runStitching = async () => {
    if (images.length < 2) return;
    setIsProcessing(true);
    setProgress(10);
    try {
      const payload = {
        images: images.filter(i => i.visible).map(img => ({
          imageId: img.imageId, 
          url: img.url, 
          x: Math.round(img.x), 
          y: Math.round(img.y),
          width: Math.round(img.width * img.scale),
          height: Math.round(img.height * img.scale),
          rotation: Math.round(img.rotation), 
          scale: 1.0,
          opacity: img.opacity
        })),
        mode,
        config: { blending: 'multi-band', warpMode: 'cylindrical' }
      };
      const response = await fetch('/api/vision/panorama', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`Erreur API: ${response.statusText}`);
      const result = await response.json();
      setProgress(100);
      if (result.success && result.stitchedImage) setStitchedResult(`data:image/jpeg;base64,${result.stitchedImage}`);
      else throw new Error(result.error || "Erreur inconnue");
    } catch (error) { alert(`Erreur: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setIsProcessing(false); }
  };

  return (
    <div className="flex flex-col h-full bg-[#050507] text-white overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl z-[90]">
        <div className="flex items-center gap-5">
          <div className="relative p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-2xl border border-white/20">
            <Layers className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black uppercase tracking-tight text-white">Panorama Studio Pro</h2>
              <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[9px] px-2 py-0">v5.0 ACTIVE</Badge>
            </div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-0.5">Industrial Multi-Stitching Workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
         <div className="flex bg-black/40 p-1 rounded-xl border border-white/10">
  <button onClick={() => setMode('auto')} className={cn("px-5 py-2 rounded-lg", mode === 'auto' ? "bg-indigo-600" : "text-gray-500")}>
    Auto
  </button>
  <button onClick={() => setMode('manual')} className={cn("px-5 py-2 rounded-lg", mode === 'manual' ? "bg-indigo-600" : "text-gray-500")}>
    Manuel
  </button>
</div>

          <div className="flex bg-black/40 p-1 rounded-xl border border-white/10">
            {[
              { id: 'auto', label: 'Auto', icon: Sparkles },
              { id: 'manual', label: 'Manuel', icon: MousePointer2 }
            ].map(m => (
              <button 
                key={m.id} 
                onClick={() => {
                  PAM_LOG('MODE_CHANGE', { from: mode, to: m.id, imageCount: images.length, selectedIds });
                  setMode(m.id as any);
                }} 
                className={cn(
                  "px-5 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2.5", 
                  mode === m.id ? "bg-indigo-600 text-white shadow-xl" : "text-gray-500 hover:text-white"
                )}
              >
                <m.icon size={14} /> {m.label}
              </button>
            ))}
          </div>
          
          <Button 
            onClick={saveProject} 
            disabled={isSaving || images.length === 0} 
            className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-[10px] font-black uppercase h-10 px-6 rounded-xl flex items-center gap-2.5"
          >
            {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {sessionId ? 'Update' : 'Save'}
          </Button>

          <Button 
            onClick={handleAutoAlign} 
            disabled={isAutoAligning} 
            className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[10px] font-black uppercase h-10 px-6 rounded-xl flex items-center gap-2.5"
          >
            <Zap size={14} className={isAutoAligning ? "animate-spin" : ""} /> IA Alignment
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 border-r border-white/5 bg-[#0a0a0c] flex flex-col z-[85]">
          <Tabs defaultValue="layers" className="flex-1 flex flex-col">
            <div className="px-6 pt-6">
              <TabsList className="grid w-full grid-cols-2 bg-white/5 p-1 rounded-xl">
                <TabsTrigger value="layers" className="text-[10px] font-black uppercase">
                  <Layers size={12} className="mr-2" /> Layers
                </TabsTrigger>
                <TabsTrigger value="config" className="text-[10px] font-black uppercase">
                  <Settings2 size={12} className="mr-2" /> Config
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="layers" className="flex-1 flex flex-col p-6 overflow-hidden">
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {[...images].sort((a, b) => b.zIndex - a.zIndex).map((img) => (
                  <div 
                    key={img.imageId} 
                    className={cn(
                      "group p-3 rounded-2xl border transition-all cursor-pointer relative", 
                      selectedIds.includes(img.imageId) ? "bg-indigo-600/10 border-indigo-500/50" : "bg-white/5 border-white/5"
                    )} 
                    onClick={(e) => {
                      if (e.shiftKey) setSelectedIds(p => p.includes(img.imageId) ? p.filter(id => id !== img.imageId) : [...p, img.imageId]);
                      else setSelectedIds([img.imageId]);
                    }}
                  >
                    <div className="flex gap-4">
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-black border border-white/10 flex-shrink-0">
                        <img src={img.url} className="w-full h-full object-cover" alt={img.name} />
                        {!img.visible && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <Eye size={12} className="text-white/40" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black truncate text-white uppercase">{img.name}</p>
                        <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); updateImage(img.imageId, { visible: !img.visible }); }} 
                            className={cn("p-1.5 rounded-lg bg-black/40 border border-white/10", !img.visible ? "text-gray-600" : "text-indigo-400")}
                          >
                            {img.visible ? <Eye size={10} /> : <XCircle size={10} />}
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); moveLayer(img.imageId, 'front'); }} 
                            className="p-1.5 rounded-lg bg-black/40 border border-white/10 text-gray-500 hover:text-white" 
                            title="To Front"
                          >
                            <ChevronRight size={10} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setImages(prev => prev.filter(i => i.imageId !== img.imageId)); }} 
                            className="p-1.5 rounded-lg bg-black/40 border border-white/10 text-gray-500 hover:text-red-500"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-white/5 rounded-3xl hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all cursor-pointer group">
                  <Images className="w-6 h-6 text-gray-500 group-hover:text-indigo-400" />
                  <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest mt-2">Import Images</span>
                  <input type="file" className="hidden" multiple accept="image/*" onChange={handleFileUpload} />
                </label>
              </div>
            </TabsContent>
            
            <TabsContent value="config" className="flex-1 p-6 space-y-6 overflow-y-auto">
              <div className="space-y-3">
                <Label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Workspace Helpers</Label>
                {[
                  { label: 'Reference Grid', icon: Grid3x3, state: showGrid, toggle: setShowGrid },
                  { label: 'Edge Magnetism', icon: Magnet, state: useSnapping, toggle: setUseSnapping },
                  { label: 'Grid Magnetism', icon: Grid3x3, state: useGridSnapping, toggle: setUseGridSnapping }
                ].map((opt, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5">
                    <div className="flex items-center gap-3">
                      <opt.icon className="h-4 w-4 text-gray-500" />
                      <span className="text-[10px] text-gray-300 font-bold uppercase">{opt.label}</span>
                    </div>
                    <Switch checked={opt.state} onCheckedChange={opt.toggle} />
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Canvas + HUD wrapper */}
        <div className="flex-1 relative overflow-hidden">
          {/* Canvas — scrollable workspace */}
          <div ref={canvasRef} className="absolute inset-0 bg-[#0a0a0c] overflow-auto" style={{ cursor: isDragging ? 'grabbing' : 'default' }}>
            {/* Infinite workspace */}
            <div className="relative" style={{ width: 4000, height: 4000, minWidth: '100%', minHeight: '100%' }}>
              {/* Grid */}
              {showGrid && (
                <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
              )}

              {/* Snapping Lines */}
              {snappingLines.map((line, i) => (
                <div key={i} className="absolute pointer-events-none z-[60]" style={{ background: 'rgba(99,102,241,0.7)', left: line.type === 'x' ? line.pos : 0, top: line.type === 'y' ? line.pos : 0, width: line.type === 'x' ? 2 : 4000, height: line.type === 'y' ? 2 : 4000 }} />
              ))}

              {/* Images */}
              {images.filter(i => i.visible).map((img) => (
                <div
                  key={img.imageId}
                  onMouseDown={(e) => handleMouseDown(e, img.imageId, 'drag')}
                  className={cn(
                    "absolute select-none",
                    selectedIds.includes(img.imageId) ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-[#0a0a0c]" : "",
                    img.locked ? "cursor-not-allowed" : isDragging && selectedIds.includes(img.imageId) ? "cursor-grabbing" : "cursor-grab"
                  )}
                  style={{
                    left: img.x,
                    top: img.y,
                    width: img.width * img.scale,
                    height: img.height * img.scale,
                    transform: `rotate(${img.rotation}deg)`,
                    transformOrigin: 'center',
                    zIndex: img.zIndex,
                    opacity: (img.opacity / 100) * (globalOpacity / 100),
                    mixBlendMode: (differenceMode && selectedIds.includes(img.imageId) ? 'difference' : 'normal') as any,
                  }}
                >
                  <img src={img.url} className="w-full h-full object-fill pointer-events-none rounded-lg border border-white/10" draggable={false} alt={img.name} />
                  {img.locked && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center rounded-lg">
                      <Lock className="h-6 w-6 text-white/40" />
                    </div>
                  )}

                  {/* Transform gizmos — only when selected, manual mode, not locked */}
                  {selectedIds.includes(img.imageId) && mode !== 'auto' && !img.locked && (
                    <>
                      {/* Rotation handle */}
                      <div className="absolute -top-14 left-1/2 -translate-x-1/2 flex flex-col items-center z-[70]" style={{ transform: `rotate(${-img.rotation}deg)` }}>
                        <div className="text-[9px] bg-indigo-600 text-white px-2 py-0.5 rounded font-mono mb-1">{Math.round(img.rotation)}°</div>
                        <div
                          className="w-9 h-9 rounded-full bg-white border-4 border-indigo-600 flex items-center justify-center shadow-xl cursor-grab hover:scale-110 transition-transform"
                          onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, img.imageId, 'rotate'); }}
                        >
                          <RotateCw className="h-4 w-4 text-indigo-600" />
                        </div>
                      </div>
                      {/* Resize handles */}
                      {(['nw','ne','sw','se'] as const).map(c => (
                        <div
                          key={c}
                          className={cn(
                            "absolute w-4 h-4 bg-white border-[3px] border-indigo-600 rounded-full shadow-lg z-[70] hover:scale-125 transition-transform",
                            c === 'nw' && "-top-2 -left-2 cursor-nw-resize",
                            c === 'ne' && "-top-2 -right-2 cursor-ne-resize",
                            c === 'sw' && "-bottom-2 -left-2 cursor-sw-resize",
                            c === 'se' && "-bottom-2 -right-2 cursor-se-resize"
                          )}
                          onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, img.imageId, 'resize', c); }}
                        />
                      ))}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Controls HUD — overlays canvas */}
          {mode === 'manual' && selectedIds.length > 0 && (
            <div className="absolute right-8 top-8 w-72 bg-black/80 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 flex flex-col gap-6 shadow-2xl z-[100] animate-in slide-in-from-right duration-300">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-white uppercase tracking-widest">
                  {selectedIds.length > 1 ? 'Multi-Transform' : 'Transform'}
                </h3>
                <button onClick={() => setSelectedIds([])} className="text-gray-500 hover:text-white">
                  <X size={16} />
                </button>
              </div>
              {(() => {
                const img = images.find(i => i.imageId === selectedIds[0]); 
                if (!img) return null;
                return (
                  <div className="flex flex-col gap-5">
                    {([
                      { label: 'PosX', val: `${Math.round(img.x)}px`, field: 'x' as const, min: -1000, max: 4000, step: 1 },
                      { label: 'PosY', val: `${Math.round(img.y)}px`, field: 'y' as const, min: -1000, max: 4000, step: 1 },
                      { label: 'Scale', val: `${(img.scale * 100).toFixed(0)}%`, field: 'scale' as const, min: 0.05, max: 4, step: 0.01 },
                      { label: 'Rotation', val: `${Math.round(img.rotation)}°`, field: 'rotation' as const, min: -180, max: 180, step: 1 }
                    ] as const).map((p, i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] text-gray-500 uppercase font-black">{p.label}</label>
                          <span className="text-[9px] font-mono text-indigo-400 font-bold">{p.val}</span>
                        </div>
                        <input 
                          type="range" 
                          min={p.min} 
                          max={p.max} 
                          step={p.step || 1} 
                          value={img[p.field] as number} 
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setImages(prev => prev.map(item => selectedIds.includes(item.imageId) ? { ...item, [p.field]: val } : item));
                          }} 
                          className="w-full h-1 bg-white/10 rounded-full appearance-none accent-indigo-500 cursor-pointer" 
                        />
                      </div>
                    ))}
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <Button 
                        variant="outline" 
                        className={cn("h-10 text-[9px] font-black uppercase rounded-xl border-white/10", img.locked && "text-amber-400 bg-amber-500/10")} 
                        onClick={() => { const nl = !img.locked; setImages(prev => prev.map(i => selectedIds.includes(i.imageId) ? { ...i, locked: nl } : i)); }}
                      >
                        {img.locked ? 'Unlock' : 'Lock'}
                      </Button>
                      <Button 
                        variant="destructive" 
                        className="h-10 text-[9px] font-black uppercase rounded-xl" 
                        onClick={() => { setImages(prev => prev.filter(i => !selectedIds.includes(i.imageId))); setSelectedIds([]); }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
      
      {/* Footer */}
      <div className="h-14 bg-[#0a0a0c] border-t border-white/5 flex items-center justify-between px-8 z-[90]">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setDifferenceMode(!differenceMode)} 
            className={cn("flex items-center gap-2 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all", differenceMode ? "bg-amber-500 text-black" : "bg-white/5 text-gray-400")}
          >
            <Eye size={16} /> Difference Mode
          </button>
          <button onClick={() => setShowShortcuts(!showShortcuts)} className="text-gray-500 hover:text-white">
            <Keyboard size={18} />
          </button>
          <div className="flex items-center gap-4 ml-4">
            <span className="text-[9px] text-gray-600 font-black uppercase">Global Opacity</span>
            <div className="w-32">
              <Slider value={[globalOpacity]} max={100} onValueChange={(v) => setGlobalOpacity(v[0])} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-[10px] font-mono text-gray-600">
            FPS: <span className="text-emerald-400">60</span> • LATENCY: <span className="text-amber-400">12ms</span>
          </div>
          <Button 
            variant="outline" 
            className="border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 text-[10px] font-black uppercase h-10 px-8 rounded-xl" 
            onClick={generateClientStitch} 
            disabled={images.length < 2 || isProcessing}
          >
            <Eye size={14} className="mr-2" /> Quick Preview
          </Button>
          <Button 
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase text-xs h-10 px-12 rounded-xl shadow-2xl" 
            onClick={runStitching} 
            disabled={images.length < 2 || isProcessing}
          >
            {isProcessing ? <Activity className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Stitch Final
          </Button>
        </div>
      </div>

      {/* Overlays */}
      {isProcessing && (
        <div className="absolute inset-0 bg-[#050507]/90 backdrop-blur-2xl z-[200] flex flex-col items-center justify-center">
          <div className="max-w-sm w-full text-center space-y-8 p-12 animate-in zoom-in duration-300">
            <div className="p-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl shadow-2xl inline-block">
              <Cpu className="h-12 w-12 text-white animate-pulse" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tighter italic">Stitching Pipeline...</h3>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
              <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      )}

      {stitchedResult && (
        <div className="absolute inset-0 z-[300] bg-[#050507] flex flex-col animate-in fade-in duration-500">
          <div className="flex items-center justify-between px-10 py-8 border-b border-white/5">
            <div>
              <h3 className="text-3xl font-black uppercase tracking-tighter">Panorama Result</h3>
              <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mt-1">Industrial Output v5.0 • Resolution Optimized</p>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" className="h-12 px-8 rounded-2xl" onClick={() => setStitchedResult(null)}>
                Edit Again
              </Button>
              <Button 
                className="bg-indigo-600 h-12 px-12 rounded-2xl shadow-2xl font-black uppercase text-[10px]" 
                onClick={() => { const l = document.createElement('a'); l.href = stitchedResult; l.download = `pano_${Date.now()}.jpg`; l.click(); }}
              >
                <Download className="mr-2 h-5 w-5" /> Download 4K
              </Button>
            </div>
          </div>
          <div className="flex-1 p-12 flex items-center justify-center bg-[#0a0a0c] overflow-hidden">
            <img src={stitchedResult} className="max-w-full max-h-full object-contain shadow-2xl rounded-2xl border border-white/10" alt="Panorama result" />
          </div>
        </div>
      )}

      {showShortcuts && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center" onClick={() => setShowShortcuts(false)}>
          <div className="bg-[#0a0a0c] border border-white/10 p-8 rounded-3xl max-w-sm w-full shadow-3xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-3">
              <Keyboard className="text-indigo-400" /> Shortcuts
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { k: 'Arrows', d: 'Move' }, 
                { k: 'Shift+Arr', d: 'Fast Move' }, 
                { k: '+ / -', d: 'Scale' }, 
                { k: 'R', d: 'Rotate' }, 
                { k: 'Del', d: 'Delete' }, 
                { k: 'Esc', d: 'Deselect' }
              ].map((s, i) => (
                <React.Fragment key={i}>
                  <div className="text-[10px] font-mono text-indigo-400 bg-white/5 px-2 py-1 rounded border border-white/5 text-center">{s.k}</div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase py-1">{s.d}</div>
                </React.Fragment>
              ))}
            </div>
            <Button className="w-full mt-8 bg-white/5 text-[10px] font-black uppercase" onClick={() => setShowShortcuts(false)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}