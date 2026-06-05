// src/components/vision/shared/hooks/useResizableSidebar.ts
import { useState, useCallback, useRef, useEffect } from 'react';

interface UseResizableSidebarOptions {
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
}

export function useResizableSidebar(options: UseResizableSidebarOptions = {}) {
  const { minWidth = 256, maxWidth = 600, defaultWidth = 384 } = options;
  
  const [sidebarWidth, setSidebarWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => setIsResizing(false), []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizing, minWidth, maxWidth]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  return { sidebarWidth, containerRef, startResizing, isResizing };
}