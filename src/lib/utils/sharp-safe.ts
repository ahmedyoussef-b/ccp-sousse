/**
 * sharp-safe.ts
 * Wrapper sécurisé pour sharp : intercepte ERR_DLOPEN_FAILED sur Windows
 * et retourne un objet no-op si sharp ne peut pas charger son binaire natif.
 * 
 * Utilisation :
 *   import { loadSharp } from '@/lib/utils/sharp-safe';
 *   const sharp = await loadSharp();
 *   if (!sharp) { ... fallback ... }
 */

let _sharpCache: ((...args: any[]) => any) | null | 'unavailable' = null;

export async function loadSharp(): Promise<((...args: any[]) => any) | null> {
  if (_sharpCache === 'unavailable') return null;
  if (_sharpCache) return _sharpCache;

  try {
    const mod = await import('sharp');
    _sharpCache = mod.default || (mod as any);
    return _sharpCache as ((...args: any[]) => any);
  } catch (err: any) {
    const isDlopenError = err?.code === 'ERR_DLOPEN_FAILED' || 
                          err?.message?.includes('ERR_DLOPEN_FAILED') ||
                          err?.message?.includes('sharp');
    if (isDlopenError) {
      console.warn('[sharp-safe] Sharp non disponible (ERR_DLOPEN_FAILED) — fonctionnalités image désactivées');
    } else {
      console.warn('[sharp-safe] Sharp non disponible:', err?.message);
    }
    _sharpCache = 'unavailable';
    return null;
  }
}

export function isSharpAvailable(): boolean {
  return _sharpCache !== null && _sharpCache !== 'unavailable';
}
