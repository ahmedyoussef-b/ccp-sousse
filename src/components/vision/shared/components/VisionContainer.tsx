// src/components/vision/shared/components/VisionContainer.tsx
'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface VisionContainerProps {
  children: ReactNode;
  className?: string;
}

export function VisionContainer({ children, className }: VisionContainerProps) {
  return (
    <div className={cn(
      "flex h-[calc(100vh-12rem)] bg-[#171717] rounded-[2rem] border border-white/5 overflow-hidden",
      className
    )}>
      {children}
    </div>
  );
}