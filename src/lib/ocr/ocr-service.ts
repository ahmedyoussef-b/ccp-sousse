import { createWorker } from 'tesseract.js';

export interface OCRResult {
  text: string;
  confidence: number;
}

export class OCRService {
  /**
   * Performs OCR on an image (File or URL or Base64)
   * @param image The image to process
   * @param language Language code (default: 'fra+eng')
   */
  static async recognize(image: string | File, language: string = 'fra+eng'): Promise<OCRResult> {
    const worker = await createWorker(language, 1, {
      logger: (m) => console.log('OCR Progress:', m),
    });
    
    try {
      const { data: { text, confidence } } = await worker.recognize(image);
      return { text, confidence };
    } finally {
      await worker.terminate();
    }
  }
}
