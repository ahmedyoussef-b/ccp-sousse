/**
 * @fileOverview OCRSpaceService - Service d'OCR via l'API OCR.space (Cloud gratuit)
 * Version 2.1 - Correction E201, évite compression multiple
 * 
 * Limitations API gratuite:
 * - 500 requêtes/mois
 * - Taille max: 5MB (compressé automatiquement)
 * - Formats supportés: JPG, PNG, GIF, BMP, TIFF, PDF
 */

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

// ============================================================================
// INTERFACES ET TYPES
// ============================================================================

export interface OCRSpaceResult {
  text: string;
  confidence: number;
  processingTime: number;
  language: string;
  ocrExitCode: number;
  errorMessage?: string;
  pages?: number;
  warnings?: string[];
}

export interface OCRCreditInfo {
  remaining: number;
  total: number;
  used: number;
  resetDate?: Date;
  isLimitReached: boolean;
}

interface OCRRequestQueueItem {
  imagePath: string;
  resolve: (value: OCRSpaceResult) => void;
  reject: (reason: any) => void;
  retryCount: number;
}

// Configuration OCR étendue
const OCR_CONFIG_EXTENDED = {
  service: 'ocr.space',
  apiUrl: 'https://api.ocr.space/parse/image',
  maxFileSize: 50 * 1024 * 1024,  // 50MB max avant compression
  timeout: 120000,                 // 2 minutes timeout
  retryAttempts: 3,                // 3 tentatives
  retryDelay: 5000,                // 5 secondes entre tentatives
  creditLimit: 500,                // 500 requêtes gratuites par mois
  
  // Langues supportées (codes 3 lettres valides pour OCR.space)
  languages: ['fre', 'eng', 'ara', 'spa', 'ger', 'ita'],
  defaultLanguage: 'fre',          // ✅ Valeur attendue par OCR.space (3 lettres)
  
  // Options OCR
  options: {
    isOverlayRequired: false,
    isCreateSearchablePdf: false,
    isSearchablePdfHideTextLayer: true,
    detectOrientation: true,
    scale: true
  },
  
  // Compression des images
  compression: {
    enabled: true,
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 85
  }
};

// ============================================================================
// SERVICE PRINCIPAL
// ============================================================================

export class OCRSpaceService {
  private static instance: OCRSpaceService;
  private apiKey: string;
  private readonly API_URL = OCR_CONFIG_EXTENDED.apiUrl;
  private requestQueue: OCRRequestQueueItem[] = [];
  private isProcessingQueue = false;
  private creditsUsed = 0;
  private creditsResetDate: Date;
  private requestTimestamps: number[] = []; // Pour le rate limiting
  private compressionEnabled = OCR_CONFIG_EXTENDED.compression.enabled;
  private sharp: any = null;
  private sharpLoaded = false;
  private processedFiles = new Set<string>(); // Pour éviter les doublons
  
  private constructor() {
    this.apiKey = process.env.OCR_SPACE_API_KEY || '';
    this.creditsResetDate = new Date();
    this.creditsResetDate.setMonth(this.creditsResetDate.getMonth() + 1);
    
    if (!this.apiKey) {
      console.warn('[OCR.Space] ⚠️ Aucune clé API configurée. Veuillez ajouter OCR_SPACE_API_KEY dans .env.local');
    }
    
    // Charger sharp pour la compression d'images
    this.loadSharp();
    
    // Restaurer le compteur de crédits depuis le cache
    this.loadCreditCounter();
    
    console.log(`[OCR.Space] Service initialisé - Crédits restants: ${this.getRemainingCredits()}/${OCR_CONFIG_EXTENDED.creditLimit}`);
  }
  
  static getInstance(): OCRSpaceService {
    if (!OCRSpaceService.instance) {
      OCRSpaceService.instance = new OCRSpaceService();
    }
    return OCRSpaceService.instance;
  }
  
  /**
   * Charge sharp pour la compression d'images (optionnel)
   */
  private async loadSharp(): Promise<void> {
    if (this.sharpLoaded) return;
    
    try {
      // @ts-ignore - Module dynamique optionnel
      const sharpModule = await import('sharp');
      this.sharp = sharpModule.default;
      this.sharpLoaded = true;
      console.log('[OCR.Space] Sharp chargé pour la compression d\'images');
    } catch (error) {
      console.log('[OCR.Space] Sharp non disponible, compression désactivée');
      this.compressionEnabled = false;
      this.sharpLoaded = true;
    }
  }
  
  /**
   * Vérifie si le fichier a déjà été compressé (évite les boucles)
   */
  private isCompressedFile(filePath: string): boolean {
    const baseName = path.basename(filePath);
    // Vérifier si le nom contient plusieurs '_compressed'
    const compressedCount = (baseName.match(/_compressed/g) || []).length;
    if (compressedCount >= 2) {
      console.log(`[OCR.Space] Fichier déjà compressé multiple fois: ${baseName} (ignoré)`);
      return true;
    }
    return false;
  }
  
  /**
   * Vérifie si un fichier existe (async)
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  // ============================================================================
  // MÉTHODES PRINCIPALES
  // ============================================================================
  
  /**
   * Extrait le texte d'une image via l'API OCR.space avec file d'attente et retry
   */
  async extractTextFromImage(imagePath: string): Promise<OCRSpaceResult> {
    const fileName = path.basename(imagePath);
    
    // ✅ Éviter les fichiers déjà compressés en boucle
    if (this.isCompressedFile(imagePath)) {
      console.log(`[OCR.Space] ⚠️ Fichier déjà compressé, utilisation fallback: ${fileName}`);
      return this.createFallbackResult(fileName, 'Fichier déjà compressé (évite boucle)', 0);
    }
    
    // Vérifier les crédits
    if (this.getRemainingCredits() <= 0) {
      console.warn('[OCR.Space] ⚠️ Limite de crédits atteinte');
      return this.createFallbackResult(fileName, 'Limite de crédits atteinte', 0);
    }
    
    // Rate limiting
    await this.applyRateLimit();
    
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        imagePath,
        resolve,
        reject,
        retryCount: 0
      });
      this.processQueue();
    });
  }
  
  /**
   * Traite la file d'attente des requêtes OCR
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0) {
      const item = this.requestQueue.shift()!;
      
      // ✅ Vérifier si le fichier a déjà été traité
      if (this.processedFiles.has(item.imagePath)) {
        console.log(`[OCR.Space] Fichier déjà traité: ${path.basename(item.imagePath)}`);
        const fallback = this.createFallbackResult(path.basename(item.imagePath), 'Déjà traité', 0);
        item.resolve(fallback);
        continue;
      }
      
      try {
        const result = await this.extractTextWithRetry(item.imagePath, item.retryCount);
        this.processedFiles.add(item.imagePath);
        item.resolve(result);
      } catch (error: any) {
        if (item.retryCount < OCR_CONFIG_EXTENDED.retryAttempts) {
          item.retryCount++;
          setTimeout(() => {
            this.requestQueue.unshift(item);
            this.processQueue();
          }, OCR_CONFIG_EXTENDED.retryDelay * Math.pow(2, item.retryCount));
        } else {
          item.reject(error);
        }
      }
    }
    
    this.isProcessingQueue = false;
  }
  
  /**
   * Extraction avec retry automatique
   */
  private async extractTextWithRetry(imagePath: string, attempt: number): Promise<OCRSpaceResult> {
    const startTime = Date.now();
    const fileName = path.basename(imagePath);
    
    console.log(`[OCR.Space][START] Traitement de: ${fileName} (tentative ${attempt + 1}/${OCR_CONFIG_EXTENDED.retryAttempts + 1})`);
    
    try {
      // 1. Vérifier et compresser l'image si nécessaire
      let processedPath = imagePath;
      let wasCompressed = false;
      
      const stats = fs.statSync(imagePath);
      const apiLimit = 5 * 1024 * 1024; // API limit 5MB
      const isPdf = imagePath.toLowerCase().endsWith('.pdf');
      
      // ✅ Vérifier si c'est déjà un fichier compressé pour éviter la boucle
      if (imagePath.includes('_compressed')) {
        console.log(`[OCR.Space] Fichier déjà compressé, utilisation directe: ${fileName}`);
        processedPath = imagePath;
      } else if (isPdf) {
        console.log(`[OCR.Space] Fichier PDF détecté (${(stats.size / 1024 / 1024).toFixed(2)}MB), envoi direct sans compression Sharp...`);
        processedPath = imagePath;
      } else if (stats.size > apiLimit && this.compressionEnabled && this.sharp) {
        processedPath = await this.compressImage(imagePath);
        wasCompressed = true;
        const compressedStats = fs.statSync(processedPath);
        console.log(`[OCR.Space] Image compressée: ${(stats.size / 1024).toFixed(1)}KB → ${(compressedStats.size / 1024).toFixed(1)}KB`);
      }
      
      // 2. Vérifier la taille après compression
      const finalStats = fs.statSync(processedPath);
      if (!isPdf && finalStats.size > apiLimit) {
        throw new Error(`Image trop volumineuse même après compression: ${(finalStats.size / 1024 / 1024).toFixed(2)}MB > 5MB`);
      } else if (isPdf && finalStats.size > apiLimit) {
        console.warn(`[OCR.Space] ⚠️ Fichier PDF volumineux (${(finalStats.size / 1024 / 1024).toFixed(2)}MB > 5MB). L'API OCR.space risque de rejeter le fichier ou de le tronquer.`);
      }
      
      // 3. Préparer le formulaire avec langue valide
      const formData = new FormData();
      formData.append('file', fs.createReadStream(processedPath));
      formData.append('apikey', this.apiKey);
      // ✅ Utiliser le code 3 lettres attendu par l'API OCR.space (ex: 'fre')
      formData.append('language', OCR_CONFIG_EXTENDED.defaultLanguage);
      formData.append('isOverlayRequired', String(OCR_CONFIG_EXTENDED.options.isOverlayRequired));
      formData.append('isCreateSearchablePdf', String(OCR_CONFIG_EXTENDED.options.isCreateSearchablePdf));
      formData.append('isSearchablePdfHideTextLayer', String(OCR_CONFIG_EXTENDED.options.isSearchablePdfHideTextLayer));
      formData.append('detectOrientation', String(OCR_CONFIG_EXTENDED.options.detectOrientation));
      formData.append('scale', String(OCR_CONFIG_EXTENDED.options.scale));
      
      console.log(`[OCR.Space] Envoi de la requête (${(finalStats.size / 1024).toFixed(1)}KB)...`);
      
      // 4. Envoyer la requête avec timeout configurable
      const response = await axios.post(this.API_URL, formData, {
        headers: {
          ...formData.getHeaders(),
          'apikey': this.apiKey
        },
        timeout: OCR_CONFIG_EXTENDED.timeout
      });
      
      const processingTime = Date.now() - startTime;
      const data = response.data;
      
      // 5. Nettoyer le fichier compressé si nécessaire
      if (wasCompressed && processedPath !== imagePath) {
        try {
          await fsPromises.unlink(processedPath);
        } catch (e) {
          // Ignorer les erreurs de nettoyage
        }
      }
      
      // 6. Vérifier les erreurs
      if (data.IsErroredOnProcessing) {
        const errorMsg = data.ErrorMessage?.[0] || 'Erreur inconnue';
        console.error(`[OCR.Space] Erreur API: ${errorMsg}`);
        
        // ✅ Ne pas incrémenter les crédits en cas d'erreur API
        return this.createFallbackResult(fileName, errorMsg, processingTime);
      }
      
      // 7. Extraire les résultats
      const parsedResults = data.ParsedResults || [];
      let allText = '';
      let bestConfidence = 0;
      let totalPages = parsedResults.length;
      
      for (const result of parsedResults) {
        const extractedText = result.ParsedText || '';
        allText += extractedText + '\n';
        
        const ocrExitCode = result.FileParseExitCode || 0;
        let pageConfidence = 0;
        if (ocrExitCode === 1) pageConfidence = 0.9;
        else if (ocrExitCode === 2) pageConfidence = 0.5;
        else pageConfidence = 0.2;
        
        bestConfidence = Math.max(bestConfidence, pageConfidence);
      }
      
      // 8. Mettre à jour le compteur de crédits (uniquement en cas de succès)
      this.incrementCredits();
      
      console.log(`[OCR.Space] ✅ Succès! ${allText.length} caractères, confiance: ${bestConfidence}, temps: ${processingTime}ms, pages: ${totalPages}`);
      
      return {
        text: allText.trim(),
        confidence: bestConfidence,
        processingTime,
        language: OCR_CONFIG_EXTENDED.defaultLanguage,
        ocrExitCode: 1,
        pages: totalPages
      };
      
    } catch (error: any) {
      console.error(`[OCR.Space] ❌ Erreur: ${error.message}`);
      
      if (error.code === 'ECONNABORTED') {
        throw new Error(`Timeout OCR (${OCR_CONFIG_EXTENDED.timeout / 1000}s)`);
      }
      
      throw error;
    }
  }
  
  // ============================================================================
  // COMPRESSION D'IMAGES (avec évitement de boucle)
  // ============================================================================
  
  /**
   * Compresse une image pour respecter les limites de l'API
   */
  private async compressImage(imagePath: string): Promise<string> {
    if (!this.sharp) {
      throw new Error('Sharp non disponible pour la compression');
    }
    
    if (imagePath.toLowerCase().endsWith('.pdf')) {
      console.log(`[OCR.Space] Fichier PDF détecté, la compression Sharp n'est pas supportée pour les PDF: ${path.basename(imagePath)}`);
      return imagePath;
    }
    
    // ✅ Éviter la compression multiple
    if (this.isCompressedFile(imagePath)) {
      console.log(`[OCR.Space] Fichier déjà compressé, retour direct: ${path.basename(imagePath)}`);
      return imagePath;
    }
    
    // Générer un nom unique pour le fichier compressé
    const parsedPath = path.parse(imagePath);
    const compressedPath = path.join(parsedPath.dir, `${parsedPath.name}_compressed.jpg`);
    
    // ✅ Vérifier si le fichier compressé existe déjà
    const exists = await this.fileExists(compressedPath);
    if (exists) {
      console.log(`[OCR.Space] Fichier compressé existant: ${compressedPath}`);
      return compressedPath;
    }
    
    const { maxWidth, maxHeight, quality } = OCR_CONFIG_EXTENDED.compression;
    
    try {
      await this.sharp(imagePath)
        .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, progressive: true })
        .toFile(compressedPath);
      
      console.log(`[OCR.Space] Image compressée: ${compressedPath}`);
      return compressedPath;
    } catch (error) {
      console.error('[OCR.Space] Échec compression:', error);
      throw new Error(`Impossible de compresser l'image: ${error}`);
    }
  }
  
  // ============================================================================
  // GESTION DES CRÉDITS
  // ============================================================================
  
  private incrementCredits(): void {
    this.creditsUsed++;
    this.saveCreditCounter();
    console.log(`[OCR.Space] Crédits utilisés: ${this.creditsUsed}/${OCR_CONFIG_EXTENDED.creditLimit}`);
  }
  
  getRemainingCredits(): number {
    const remaining = OCR_CONFIG_EXTENDED.creditLimit - this.creditsUsed;
    return Math.max(0, remaining);
  }
  
  getCreditInfo(): OCRCreditInfo {
    return {
      remaining: this.getRemainingCredits(),
      total: OCR_CONFIG_EXTENDED.creditLimit,
      used: this.creditsUsed,
      resetDate: this.creditsResetDate,
      isLimitReached: this.getRemainingCredits() <= 0
    };
  }
  
  private saveCreditCounter(): void {
    try {
      const cachePath = path.join(process.cwd(), '.ocr-cache.json');
      const cache = {
        creditsUsed: this.creditsUsed,
        resetDate: this.creditsResetDate.toISOString()
      };
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    } catch (error) {
      console.warn('[OCR.Space] Impossible de sauvegarder le cache des crédits');
    }
  }
  
  private loadCreditCounter(): void {
    try {
      const cachePath = path.join(process.cwd(), '.ocr-cache.json');
      if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        const savedResetDate = new Date(cache.resetDate);
        const now = new Date();
        
        if (savedResetDate < now) {
          this.creditsUsed = 0;
          this.creditsResetDate = new Date();
          this.creditsResetDate.setMonth(this.creditsResetDate.getMonth() + 1);
        } else {
          this.creditsUsed = cache.creditsUsed || 0;
          this.creditsResetDate = savedResetDate;
        }
      }
    } catch (error) {
      console.warn('[OCR.Space] Impossible de charger le cache des crédits');
    }
  }
  
  // ============================================================================
  // RATE LIMITING
  // ============================================================================
  
  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const windowMs = 60000;
    const maxRequestsPerMinute = 10;
    
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < windowMs
    );
    
    if (this.requestTimestamps.length >= maxRequestsPerMinute) {
      const oldest = this.requestTimestamps[0];
      const waitTime = windowMs - (now - oldest);
      console.log(`[OCR.Space] Rate limiting: attente ${Math.ceil(waitTime / 1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.requestTimestamps.push(now);
  }
  
  // ============================================================================
  // UTILITAIRES
  // ============================================================================
  
  private createFallbackResult(
    fileName: string, 
    error: string, 
    processingTime: number
  ): OCRSpaceResult {
    const fallbackText = `[Image: ${fileName} - OCR non disponible (${error})]`;
    console.log(`[OCR.Space] Fallback utilisé: ${fallbackText}`);
    
    return {
      text: fallbackText,
      confidence: 0,
      processingTime,
      language: 'fallback',
      ocrExitCode: -1,
      errorMessage: error,
      warnings: [`OCR échoué: ${error}`]
    };
  }
  
  async testConnection(): Promise<{ success: boolean; message: string; credits?: number }> {
    if (!this.apiKey) {
      return {
        success: false,
        message: 'Clé API OCR.space manquante. Veuillez ajouter OCR_SPACE_API_KEY dans .env.local'
      };
    }
    
    try {
      const testImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
      const formData = new FormData();
      formData.append('base64Image', testImage.toString('base64'));
      formData.append('apikey', this.apiKey);
      // ✅ Correction: utiliser 'fr' au lieu de 'fre'
      formData.append('language', 'fr');
      
      const response = await axios.post(this.API_URL, formData, {
        headers: formData.getHeaders(),
        timeout: 10000
      });
      
      const success = !response.data.IsErroredOnProcessing;
      const creditInfo = this.getCreditInfo();
      
      return {
        success,
        message: success 
          ? `Connexion OK. Crédits restants: ${creditInfo.remaining}/${creditInfo.total}`
          : `Erreur API: ${response.data.ErrorMessage?.[0] || 'Inconnue'}`,
        credits: creditInfo.remaining
      };
      
    } catch (error: any) {
      return {
        success: false,
        message: `Échec connexion: ${error.message}`
      };
    }
  }
  
  resetCreditCounter(): void {
    this.creditsUsed = 0;
    this.creditsResetDate = new Date();
    this.creditsResetDate.setMonth(this.creditsResetDate.getMonth() + 1);
    this.saveCreditCounter();
    console.log('[OCR.Space] Compteur de crédits réinitialisé');
  }
  
  canProcessFile(filePath: string): boolean {
    // ✅ Vérifier si c'est un fichier compressé multiple
    if (this.isCompressedFile(filePath)) {
      return false;
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const supportedExts = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.gif', '.webp', '.pdf'];
    return supportedExts.includes(ext) && this.getRemainingCredits() > 0;
  }
  
  async getEstimatedCompressedSize(filePath: string): Promise<number> {
    if (!this.sharp) return -1;
    
    try {
      const stats = fs.statSync(filePath);
      const apiLimit = 5 * 1024 * 1024;
      if (stats.size <= apiLimit) return stats.size;
      
      const metadata = await this.sharp(filePath).metadata();
      const scale = Math.min(
        OCR_CONFIG_EXTENDED.compression.maxWidth / (metadata.width || 1920),
        OCR_CONFIG_EXTENDED.compression.maxHeight / (metadata.height || 1080),
        1
      );
      
      return Math.floor(stats.size * scale * scale * (OCR_CONFIG_EXTENDED.compression.quality / 100));
    } catch {
      return -1;
    }
  }
  
  /**
   * Réinitialise le cache des fichiers traités
   */
  clearProcessedCache(): void {
    this.processedFiles.clear();
    console.log('[OCR.Space] Cache des fichiers traités vidé');
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default OCRSpaceService;