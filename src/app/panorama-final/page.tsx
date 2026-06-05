'use client';

import { PanoramicAssemblyModule } from '@/components/industrial-vision/innovations/PanoramicAssemblyModule';

export default function PanoramaFinalPage() {
  return (
    <div style={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#050507',
      zIndex: 9999
    }}>
      <PanoramicAssemblyModule />
    </div>
  );
}