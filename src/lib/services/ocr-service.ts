// src/lib/services/ocr-service.ts
import Tesseract from 'tesseract.js';

export interface OCRResult {
  text: string;
  confidence: number;
  words: Array<{ text: string; confidence: number }>;
  durationMs: number;
}

class OCRService {
  private scheduler: any = null;
  private ready = false;

  async init(): Promise<void> {
    if (this.ready) return;

    console.group('[OCR] 🚀 INITIALISATION');
    const start = Date.now();
    
    try {
      // Utiliser createScheduler sans worker
      this.scheduler = Tesseract.createScheduler();
      this.ready = true;
      const duration = Date.now() - start;
      console.log(`[OCR] ✅ Prêt en ${duration}ms`);
      console.groupEnd();
    } catch (error) {
      console.error('[OCR] ❌ Échec initialisation:', error);
      console.groupEnd();
    }
  }

  async extractText(imageBuffer: Buffer): Promise<OCRResult> {
    const ocrId = `OCR_${Date.now().toString(36)}`;
    console.group(`[OCR][${ocrId}] 🔍 EXTRACTION TEXTE`);
    
    const start = Date.now();
    console.log(`[${ocrId}] 📸 Buffer image: ${(imageBuffer.length / 1024).toFixed(1)} KB`);
    
    await this.init();

    try {
      console.log(`[${ocrId}] 🔄 Reconnaissance en cours (single-thread)...`);
      
      // Méthode sans worker : utiliser la fonction recognize avec l'option workerPath désactivée
      const { data } = await Tesseract.recognize(imageBuffer, 'eng', {
        // Désactiver le worker en passant des options minimales
      });
      
      const words = data.words
        .filter(w => w.confidence > 40)
        .map(w => ({
          text: w.text,
          confidence: w.confidence
        }));

      const duration = Date.now() - start;
      
      const result: OCRResult = {
        text: data.text.trim(),
        confidence: data.confidence,
        words,
        durationMs: duration
      };

      console.log(`[${ocrId}] 📊 Résultat:`, {
        text: result.text.substring(0, 100) + (result.text.length > 100 ? '...' : ''),
        textLength: result.text.length,
        confidence: `${result.confidence}%`,
        wordsCount: result.words.length,
        duration: `${duration}ms (${(duration/1000).toFixed(2)}s)`,
        reliable: result.confidence > 50 ? '✅' : result.confidence > 30 ? '⚠️' : '❌'
      });

      if (result.words.length > 0) {
        console.log(`[${ocrId}] 📝 Mots détectés:`, result.words.slice(0, 10).map(w => `${w.text}(${w.confidence}%)`).join(', '));
      }

      console.groupEnd();
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`[${ocrId}] ❌ Erreur après ${duration}ms:`, error);
      console.groupEnd();
      return { text: '', confidence: 0, words: [], durationMs: duration };
    }
  }

  getStatus(): { ready: boolean } {
    return { ready: this.ready };
  }
}

export const ocrService = new OCRService();