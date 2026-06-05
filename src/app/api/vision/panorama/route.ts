import { PanoramaMode, BlendingStrategy } from '@/ai/innovations/types';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Utilitaire pour extraire un Buffer propre depuis une entrée variée
 * Gère les fichiers binaires et les chaînes base64 envoyées dans FormData
 */
async function getBufferFromEntry(entry: any): Promise<Buffer | null> {
  if (!entry) return null;
  
  try {
    let buffer: Buffer;
    
    if (entry instanceof Blob) {
      // Cas standard: File/Blob envoyé via FormData
      const bytes = await entry.arrayBuffer();
      buffer = Buffer.from(bytes);
    } else if (typeof entry === 'string') {
      // Cas où le frontend envoie une chaîne (base64) au lieu d'un fichier binaire
      if (entry.startsWith('data:image')) {
        const base64Data = entry.split(',')[1];
        buffer = Buffer.from(base64Data, 'base64');
      } else if (entry.length > 100 && !entry.includes(' ')) {
        // Hypothèse base64 direct si la chaîne est longue et sans espaces
        buffer = Buffer.from(entry, 'base64');
      } else {
        return null;
      }
    } else {
      return null;
    }

    // Validation minimale du buffer
    if (buffer.length === 0) return null;
    
    return buffer;
  } catch (e) {
    console.error('[Buffer Utility] Error converting entry:', e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    let imageBuffers: Buffer[] = [];
    let options: any = {};
    let mode: PanoramaMode = 'auto';

    // 1. Détection du type de contenu
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      options = body.config || {};
      mode = body.mode || 'auto';
      
      if (body.images && Array.isArray(body.images)) {
        options.images = body.images;
        for (const img of body.images) {
          // Dans le JSON, l'URL peut être un base64 ou un lien
          const buffer = await getBufferFromEntry(img.url);
          if (buffer) imageBuffers.push(buffer);
        }
      }
    } else {
      const formData = await request.formData();
      const countStr = formData.get('count') as string;
      const count = parseInt(countStr || '0', 10);
      options.blending = formData.get('blending') as string;
      options.warpMode = formData.get('warpMode') as string;
      mode = (formData.get('mode') as PanoramaMode) || 'auto';
      
      // Récupération intelligente des images (binaires ou base64)
      for (let i = 0; i < count; i++) {
        const entry = formData.get(`image${i}`);
        const buffer = await getBufferFromEntry(entry);
        if (buffer) imageBuffers.push(buffer);
      }
    }
    
    if (imageBuffers.length < 2) {
      return NextResponse.json(
        { error: 'Au moins 2 images valides sont nécessaires pour un panorama' },
        { status: 400 }
      );
    }

    console.log(`[Panorama API] Flux : Frontend → FormData → Buffer (${imageBuffers.length} images)`);

    // 2. EXTRACTION DES MÉTAPONNÉES (Fix Sharp Bug: Client-side Meta or Jimp)
    const Jimp = (await import('jimp')).default;
    const imagesMetadata = await Promise.all(
      imageBuffers.map(async (buf, idx) => {
        const clientMeta = options.images?.[idx];
        if (clientMeta?.width && clientMeta?.height) {
          return { width: clientMeta.width, height: clientMeta.height, index: idx };
        }
        const tempImg = await Jimp.read(buf);
        return { width: tempImg.bitmap.width, height: tempImg.bitmap.height, index: idx };
      })
    );

    console.log(`[Panorama API] Métadonnées extraites (Total: ${imagesMetadata.length})`);

    // 3. LOGIQUE D'ASSEMBLAGE (Jimp pour la composition flexible)
    // On utilise Jimp car il permet un contrôle pixel par pixel facile pour le mode manuel

    const loadedImages = await Promise.all(
      imageBuffers.map(buf => Jimp.read(buf))
    );

    let panorama: any;

    if (mode === 'manual' && options.images) {
      // Calcul de la boîte englobante dynamique
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      const transformedImages = loadedImages.map((img, i) => {
        const config = options.images[i] || { x: i * 100, y: 100, scale: 1, rotation: 0 };
        const meta = imagesMetadata[i];
        
        const w = meta.width * (config.scale || 1);
        const h = meta.height * (config.scale || 1);
        
        const x = config.x || 0;
        const y = config.y || 0;
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
        
        return { img, config, w, h };
      });

      const canvasWidth = Math.max(100, maxX - minX + 100);
      const canvasHeight = Math.max(100, maxY - minY + 100);
      const offsetX = -minX + 50;
      const offsetY = -minY + 50;

      // @ts-ignore
      panorama = new Jimp({ 
        width: Math.round(canvasWidth), 
        height: Math.round(canvasHeight), 
        color: 0x00000000 
      });

      for (const item of transformedImages) {
        let tempImg = item.img.clone();
        if (item.config.scale && item.config.scale !== 1) tempImg.scale(item.config.scale);
        if (item.config.rotation) tempImg.rotate(-item.config.rotation);
        
        panorama.composite(tempImg, Math.round(item.config.x + offsetX), Math.round(item.config.y + offsetY));
      }
    } else {
      // Mode Automatique (Simple juxtaposition horizontale en attendant OpenCV)
      let totalWidth = 0;
      let maxHeight = 0;

      for (const meta of imagesMetadata) {
        totalWidth += meta.width;
        if (meta.height > maxHeight) maxHeight = meta.height;
      }

      // @ts-ignore
      panorama = new Jimp({ width: totalWidth, height: maxHeight, color: 0x00000000 });

      let currentX = 0;
      for (let i = 0; i < loadedImages.length; i++) {
        panorama.composite(loadedImages[i], currentX, 0);
        currentX += imagesMetadata[i].width;
      }
    }

    // Récupération du buffer final
    let outputBuffer: Buffer;
    if (typeof (panorama as any).getBuffer === 'function') {
      outputBuffer = await (panorama as any).getBuffer('image/jpeg');
    } else {
      outputBuffer = await (panorama as any).getBufferAsync('image/jpeg');
    }

    return NextResponse.json({
      success: true,
      stitchedCount: loadedImages.length,
      quality: 0.9,
      stitchedImage: outputBuffer.toString('base64'),
      metadata: {
        mode,
        dimensions: {
          width: (panorama as any).bitmap.width,
          height: (panorama as any).bitmap.height
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors du panorama:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
