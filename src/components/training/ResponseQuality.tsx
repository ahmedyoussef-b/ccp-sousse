// components/training/ResponseQuality.tsx
/**
 * @fileOverview Composant de notation par étoiles
 * @version 1.0.0
 */

'use client';

import { Star } from 'lucide-react';

interface ResponseQualityProps {
  value: number | null;
  onChange: (value: number) => void;
}

export function ResponseQuality({ value, onChange }: ResponseQualityProps) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          onClick={() => onChange(rating)}
          className="focus:outline-none transition-transform hover:scale-110"
        >
          <Star
            className={`w-6 h-6 ${
              value && rating <= value
                ? 'text-yellow-500 fill-yellow-500'
                : 'text-slate-600 hover:text-slate-500'
            }`}
          />
        </button>
      ))}
    </div>
  );
}