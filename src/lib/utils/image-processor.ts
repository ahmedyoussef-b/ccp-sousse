/**
 * @fileOverview Utilitaire de traitement d'images avec fallback automatique.
 * Privilégie 'sharp' (natif, rapide) mais bascule sur 'jimp' (pur JS) si sharp est indisponible.
 */

let sharp: any;
let Jimp: any;
let isSharpAvailable = true;
let isSharpInitialized = false;

/**
 * Charge les processeurs d'images de manière résiliente
 */
async function loadProcessors() {
  if (sharp || Jimp) return;

  // Tentative 1: Sharp (Rapide, Natif)
  if (isSharpAvailable && !isSharpInitialized) {
    try {
      // @ts-ignore
      sharp = (await import('sharp')).default || (await import('sharp'));
      isSharpInitialized = true;
      console.log('✅ ImageProcessor: Sharp chargé avec succès');
    } catch (e) {
      console.warn('⚠️ ImageProcessor: Sharp indisponible, bascule sur Jimp (Pure JS)');
      isSharpAvailable = false;
      isSharpInitialized = true;
    }
  }

  // Tentative 2: Jimp (Sûr, Sans dépendances natives)
  if (!isSharpAvailable && !Jimp) {
    try {
      // Utilisation de require pour Jimp comme demandé
      const jimpModule = require('jimp');
      Jimp = jimpModule.Jimp || jimpModule;
      console.log('✅ ImageProcessor: Jimp chargé avec succès via require');
    } catch (e) {
      console.error('❌ ImageProcessor: Aucun processeur d\'image trouvé. Installez jimp: npm install jimp');
    }
  }
}

// Détection rapide d'un buffer HEIC/HEIF (cherche le box 'ftyp' suivi de 'heic'/'heif')
function isHeicBuffer(buffer: Buffer): boolean {
  try {
    if (!buffer || buffer.length < 12) return false;
    const brand = buffer.slice(4, 12).toString('ascii').toLowerCase();
    return brand.includes('heic') || brand.includes('heif');
  } catch (e) {
    return false;
  }
}

/**
 * Détecte et convertit automatiquement les formats d'image non supportés
 */
async function ensureSupportedFormat(buffer: Buffer): Promise<Buffer> {
  await loadProcessors();
  
  // Vérifier le format de l'image avec Sharp si disponible
  if (sharp && isSharpAvailable) {
    try {
      const metadata = await sharp(buffer).metadata();
      const unsupportedFormats = ['heic', 'heif', 'tiff', 'bmp'];
      
      if (metadata.format && unsupportedFormats.includes(metadata.format)) {
        console.log(`🖼️ Conversion du format ${metadata.format} vers JPEG`);
        return await sharp(buffer)
          .jpeg({ quality: 85 })
          .toBuffer();
      }
      
      // Vérifier si l'image a un canal alpha
      if (metadata.hasAlpha) {
        console.log('🖼️ Suppression du canal alpha (conversion vers JPEG)');
        return await sharp(buffer)
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: 85 })
          .toBuffer();
      }
    } catch (error) {
      console.warn('Impossible de lire les métadonnées de l\'image avec sharp:', error);

      // Si le buffer ressemble à HEIC/HEIF, essayer une conversion via 'heic-convert' (optionnel)
      try {
        if (isHeicBuffer(buffer)) {
          try {
            console.log('🔁 Tentative de conversion HEIC via heic-convert');
            // Import dynamique pour ne pas forcer la dépendance
            // @ts-ignore
            const heicConvert = (await import('heic-convert')).default || (await import('heic-convert'));
            const out = await heicConvert({ buffer, format: 'JPEG', quality: 0.85 });
            if (out) {
              const outBuffer = Buffer.isBuffer(out) ? out : Buffer.from(out);
              return outBuffer;
            }
          } catch (hcErr) {
            console.warn('Conversion via heic-convert échouée:', hcErr);
          }
        }
      } catch (e) {
        // ignore
      }

      // Tentative de secours: essayer de lire et convertir avec Jimp si disponible
      if (Jimp) {
        try {
          console.log('🔁 Tentative de fallback via Jimp pour conversion en JPEG');
          // Jimp API peut varier: essayer fromBuffer puis getBufferAsync, fallback à getBuffer
          const img = await (Jimp.fromBuffer ? Jimp.fromBuffer(buffer) : Jimp.read(buffer));
          // Appliquer une qualité raisonnable
          if (typeof img.quality === 'function') img.quality(85);

          // getBufferAsync est disponible sur les versions récentes
          if (typeof img.getBufferAsync === 'function') {
            const jpegBuffer = await img.getBufferAsync(Jimp.MIME_JPEG || 'image/jpeg');
            return jpegBuffer;
          }

          // Fallback callback-style
          const jpegBuffer = await new Promise<Buffer>((resolve, reject) => {
            img.getBuffer(Jimp.MIME_JPEG || 'image/jpeg', (err: any, buf: Buffer) => {
              if (err) return reject(err);
              resolve(buf);
            });
          });

          return jpegBuffer;
        } catch (e) {
          console.warn('Fallback Jimp échoué:', e);
        }
      }

      // Si tout échoue, retourner le buffer original pour laisser les couches supérieures gérer l'échec
    }
  }
  
  return buffer;
}

/**
 * Redimensionne une image et la convertit en JPEG
 */
export async function resizeImage(
  buffer: Buffer, 
  width: number, 
  height: number, 
  quality: number = 80
): Promise<Buffer> {
  await loadProcessors();
  
  // Vérifier que le buffer est valide
  if (!buffer || buffer.length === 0) {
    throw new Error('Buffer d\'image vide ou invalide');
  }

  // Convertir les formats non supportés
  const supportedBuffer = await ensureSupportedFormat(buffer);

  try {
    if (sharp && isSharpAvailable) {
      return await sharp(supportedBuffer)
        .resize(width, height, { fit: 'cover', position: 'center' })
        .jpeg({ quality })
        .toBuffer();
    }

    if (Jimp) {
      // Jimp may expose different APIs across versions; use any to be resilient
      const jimpImg = (Jimp as any).fromBuffer ? await (Jimp as any).fromBuffer(supportedBuffer) : await (Jimp as any).read(supportedBuffer);
      // Use cover(width,height) when available, otherwise resize
      if (typeof jimpImg.cover === 'function') {
        jimpImg.cover(width, height);
      } else if (typeof jimpImg.resize === 'function') {
        jimpImg.resize(width, height);
      }
      if (typeof jimpImg.quality === 'function') jimpImg.quality(quality);
      if (typeof jimpImg.getBufferAsync === 'function') {
        return await jimpImg.getBufferAsync(Jimp.MIME_JPEG || 'image/jpeg');
      }
      // Fallback callback-style getBuffer
      const jpegBuffer = await new Promise<Buffer>((resolve, reject) => {
        jimpImg.getBuffer(Jimp.MIME_JPEG || 'image/jpeg', (err: any, buf: Buffer) => {
          if (err) return reject(err);
          resolve(buf);
        });
      });
      return jpegBuffer;
    }
  } catch (error) {
    console.error('❌ Erreur lors du redimensionnement:', error);
  }

  // Fallback ultime: retourner le buffer original si tout échoue
  console.warn('⚠️ Redimensionnement impossible, retour du buffer original');
  return buffer;
}

/**
 * Prépare une image pour MobileNet (224x224, pas d'alpha)
 */
export async function prepareForVision(buffer: Buffer): Promise<{ data: Buffer, info: { width: number, height: number, channels: number } }> {
  await loadProcessors();
  
  // Vérifier que le buffer est valide
  if (!buffer || buffer.length === 0) {
    throw new Error('Buffer d\'image vide ou invalide');
  }
  
  // Convertir les formats non supportés
  const supportedBuffer = await ensureSupportedFormat(buffer);

  try {
    if (sharp && isSharpAvailable) {
      // Convertir en RGB, redimensionner, et extraire les données brutes
      const { data, info } = await sharp(supportedBuffer)
        .resize(224, 224, { fit: 'cover', position: 'center' })
        .removeAlpha()
        .flatten({ background: { r: 0, g: 0, b: 0 } })
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      return { 
        data, 
        info: { 
          width: info.width, 
          height: info.height, 
          channels: info.channels 
        } 
      };
    }

    if (Jimp) {
      // Jimp 1.x API
      const image = await Jimp.fromBuffer(supportedBuffer);
      image.resize({ w: 224, h: 224, mode: 'bicubic' });
      
      const width = image.bitmap.width;
      const height = image.bitmap.height;
      const channels = 3; 
      
      const rawData = Buffer.alloc(width * height * channels);
      let offset = 0;
      
      // Utilisation d'une boucle directe
      const imageData = image.bitmap.data;
      for (let i = 0; i < imageData.length; i += 4) {
        if (offset < rawData.length) {
          rawData[offset++] = imageData[i];     // R
          rawData[offset++] = imageData[i + 1]; // G
          rawData[offset++] = imageData[i + 2]; // B
          // On ignore l'alpha (i + 3)
        }
      }
      
      return { 
        data: rawData, 
        info: { width, height, channels } 
      };
    }
  } catch (error) {
    console.error('❌ Erreur lors de la préparation vision:', error);
    throw new Error(`Impossible de traiter l'image pour la vision: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
  }

  throw new Error('Impossible de traiter l\'image pour la vision (aucun processeur disponible)');
}

/**
 * Extrait les dimensions d'une image sans la charger complètement
 */
export async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number; format?: string }> {
  await loadProcessors();
  
  try {
    if (sharp && isSharpAvailable) {
      const metadata = await sharp(buffer).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format
      };
    }
    
    if (Jimp) {
      const image = await Jimp.fromBuffer(buffer);
      return {
        width: image.bitmap.width,
        height: image.bitmap.height
      };
    }
  } catch (error) {
    console.error('Erreur lecture dimensions:', error);
  }
  
  return { width: 0, height: 0 };
}

/**
 * Vérifie si une image est valide et supportée
 */
export async function isImageValid(buffer: Buffer): Promise<boolean> {
  await loadProcessors();
  
  try {
    if (sharp && isSharpAvailable) {
      const metadata = await sharp(buffer).metadata();
      return !!metadata.format;
    }
    
    if (Jimp) {
      await Jimp.fromBuffer(buffer);
      return true;
    }
  } catch (error) {
    return false;
  }
  
  return false;
}