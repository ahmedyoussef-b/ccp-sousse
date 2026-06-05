// src/lib/mindmap-adapters/simple-mindmap-exporter.ts
//
// Dynamic import wrapper around simple-mind-map's Export plugin.
// Loaded ONLY when an export is triggered — zero impact on initial bundle.
//
// Supports: PDF (client-side), SVG (enriched), XMind (.xmind archive)
//
// NOTE: This module MUST only be used client-side (browser).
// It manipulates the DOM via a hidden container div.

'use client';

import type { MindMapData } from '@/ai/mindmap/types';
import { toMindElixir } from './mind-elixir-adapter';

// ─── Internal: build a minimal simple-mind-map compatible data tree ──────────

interface SMNodeData {
  data: {
    id: string;
    text: string;
    note?: string;
    tag?: string[];
    [key: string]: unknown;
  };
  children?: SMNodeData[];
}

function toSMData(data: MindMapData): { root: SMNodeData; theme: Record<string, unknown> } {
  // Reuse our mind-elixir adapter for the tree conversion, then remap
  const meTree = toMindElixir(data);

  function remap(meNode: { id: string; topic: string; note?: string; children?: typeof meNode[] }): SMNodeData {
    return {
      data: {
        id: meNode.id,
        text: meNode.topic,
        note: meNode.note,
      },
      children: (meNode.children ?? []).map(remap),
    };
  }

  return {
    root: remap(meTree.nodeData),
    theme: {
      template: 'dark2',
    },
  };
}

// ─── Headless simple-mind-map instance ───────────────────────────────────────

async function createHeadlessMindMap(data: MindMapData) {
  // Dynamic imports — keeps bundle lean
  const [{ default: MindMap }, { default: Export }] = await Promise.all([
    import('simple-mind-map'),
    // @ts-ignore — simple-mind-map plugins are not fully typed
    import('simple-mind-map/src/plugins/Export.js'),
  ]);

  MindMap.usePlugin(Export);

  // Create an off-screen container
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1200px;height:900px;visibility:hidden;';
  document.body.appendChild(container);

  const { root, theme } = toSMData(data);

  const mindMap = new MindMap({
    el: container,
    data: root,
    theme: theme.template as string,
    layout: 'logicalStructure',
    // Disable UI features not needed for headless export
    enableFreeDrag: false,
    // @ts-ignore
    watermark: { show: false },
  });

  return { mindMap, container };
}

function cleanup(container: HTMLDivElement) {
  try {
    document.body.removeChild(container);
  } catch {
    // already removed
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Export the mind map as a PDF Blob (client-side only).
 * The PDF preserves colors, hierarchy, and node styling.
 */
export async function exportToPDF(data: MindMapData): Promise<Blob> {
  const { mindMap, container } = await createHeadlessMindMap(data);

  try {
    // Give mind-elixir time to render
    await new Promise((r) => setTimeout(r, 400));

    // simple-mind-map's Export plugin returns a base64 data URL
    const result: string = await (mindMap as any).doExport.pdf('mindmap');

    // Convert base64 data URL to Blob
    const base64 = result.split(',')[1];
    const bytes = atob(base64);
    const ab = new ArrayBuffer(bytes.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < bytes.length; i++) ia[i] = bytes.charCodeAt(i);
    return new Blob([ab], { type: 'application/pdf' });
  } finally {
    cleanup(container);
    mindMap.destroy?.();
  }
}

/**
 * Export the mind map as an XMind archive Blob.
 * The .xmind file can be opened directly in XMind app.
 */
export async function exportToXMind(data: MindMapData): Promise<Blob> {
  const { mindMap, container } = await createHeadlessMindMap(data);

  try {
    await new Promise((r) => setTimeout(r, 400));

    // Returns a base64 string of the .xmind zip archive
    const result: string = await (mindMap as any).doExport.xmind('mindmap');
    const base64 = result.includes(',') ? result.split(',')[1] : result;
    const bytes = atob(base64);
    const ab = new ArrayBuffer(bytes.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < bytes.length; i++) ia[i] = bytes.charCodeAt(i);
    return new Blob([ab], { type: 'application/vnd.xmind.workbook' });
  } finally {
    cleanup(container);
    mindMap.destroy?.();
  }
}

/**
 * Export the mind map as a high-quality SVG string.
 * Uses simple-mind-map's enriched SVG (better than the current API route's SVG).
 */
export async function exportToSVGRich(data: MindMapData): Promise<string> {
  const { mindMap, container } = await createHeadlessMindMap(data);

  try {
    await new Promise((r) => setTimeout(r, 400));

    const result: string = await (mindMap as any).doExport.svg('mindmap', true, '#020617');
    // result is either an SVG string or a data URL
    if (result.startsWith('data:')) {
      const base64 = result.split(',')[1];
      return atob(base64);
    }
    return result;
  } finally {
    cleanup(container);
    mindMap.destroy?.();
  }
}

/**
 * Trigger a browser download from a Blob.
 * Convenience helper used by MindMapEditor.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
