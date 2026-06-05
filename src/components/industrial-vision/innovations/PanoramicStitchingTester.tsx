// src/components/industrial-vision/innovations/PanoramicStitchingTester.tsx

'use client';

import React from 'react';
import { Innovation } from '@/lib/industrial-vision/types/industrial.types';
import { PanoramicAssemblyModule } from './PanoramicAssemblyModule';

export function PanoramicStitchingTester({ innovation }: { innovation: Innovation }) {
  return (
    <div className="w-full h-[800px] rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
      <PanoramicAssemblyModule />
    </div>
  );
}
