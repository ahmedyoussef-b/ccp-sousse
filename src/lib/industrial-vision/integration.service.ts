// src/lib/services/industrial-vision/integration.service.ts

import { ImageAnalyzer } from '@/lib/industrial-vision/core/ImageAnalyzer';
import { ReferenceDatabase } from '@/lib/industrial-vision/database/ReferenceDB';
import { IndustrialVisionConfig } from '@/lib/industrial-vision/types/industrial.types';
import fs from 'fs';
import path from 'path';


export class IndustrialVisionIntegration {
  private analyzer: ImageAnalyzer;
  private referenceDB: ReferenceDatabase;
  private bankImagesPath: string;
  private processedPath: string;
  
  constructor(config: IndustrialVisionConfig) {
    this.analyzer = new ImageAnalyzer();
    this.referenceDB = new ReferenceDatabase(config);
    this.bankImagesPath = path.join(process.cwd(), 'data', 'banque_images_ia');
    this.processedPath = path.join(process.cwd(), 'data', 'industrial-processed');
    
    // Créer les dossiers nécessaires
    if (!fs.existsSync(this.processedPath)) {
      fs.mkdirSync(this.processedPath, { recursive: true });
    }
  }
  
  async initialize(): Promise<void> {
    await this.analyzer.initialize();
    await this.referenceDB.initialize();
  }
  
  /**
   * Parcourt la banque d'images et traite les nouvelles images
   */
  async scanAndProcessBankImages(): Promise<{
    processed: number;
    failed: number;
    results: any[];
  }> {
    const results: { imagePath: string; analysis: any; similarity: any; timestamp: number; }[] = [];
    let processed = 0;
    let failed = 0;
    
    // Parcourir la structure de la banque d'images
    const scanDir = async (dir: string) => {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          await scanDir(filePath);
        } else if (file.match(/\.(jpg|jpeg|png)$/i)) {
          // Vérifier si déjà traité
          const processedFile = path.join(this.processedPath, file.replace(/\.(jpg|jpeg|png)$/i, '.processed.json'));
          
          if (!fs.existsSync(processedFile)) {
            try {
              const result = await this.processImage(filePath);
              results.push(result);
              processed++;
              
              // Sauvegarder la marque de traitement
              fs.writeFileSync(processedFile, JSON.stringify({
                processedAt: new Date().toISOString(),
                result: result
              }, null, 2));
              
            } catch (error) {
              console.error(`Erreur traitement ${file}:`, error);
              failed++;
            }
          }
        }
      }
    };
    
    await scanDir(this.bankImagesPath);
    
    return { processed, failed, results };
  }
  
  /**
   * Traite une image individuelle
   */
  async processImage(imagePath: string): Promise<{
    imagePath: string;
    analysis: any;
    similarity: any;
    timestamp: number;
  }> {
    // Analyser l'image
    const analysis = await this.analyzer.analyzeImage(imagePath);
    
    // Comparer avec les références
    const similarity = await this.referenceDB.compareWithReference({
      features: analysis.features,
      organes: analysis.organes,
      voyants: analysis.voyants,
      cadrans: analysis.cadrans,
      fileHash: analysis.fileHash
    });
    
    // Sauvegarder les résultats pour RAG
    await this.saveToRagIndex(imagePath, analysis, similarity);
    
    return {
      imagePath,
      analysis,
      similarity,
      timestamp: Date.now()
    };
  }
  
  /**
   * Sauvegarde les résultats dans l'index RAG
   */
  private async saveToRagIndex(imagePath: string, analysis: any, similarity: any): Promise<void> {
    const ragData = {
      id: path.basename(imagePath),
      path: imagePath,
      features: analysis.features,
      organes: analysis.organes.map((o: any) => o.nom),
      voyants: analysis.voyants,
      mesures: analysis.cadrans,
      similarite: similarity,
      fileHash: analysis.fileHash,
      dateAnalyse: new Date().toISOString(),
      texteDescriptif: this.generateDescription(analysis, similarity)
    };
    
    // Sauvegarder dans un fichier JSON pour RAG
    const ragFilePath = path.join(this.processedPath, `${path.basename(imagePath, path.extname(imagePath))}.rag.json`);
    fs.writeFileSync(ragFilePath, JSON.stringify(ragData, null, 2));
  }
  
  /**
   * Génère une description textuelle pour RAG
   */
  private generateDescription(analysis: any, similarity: any): string {
    let description = `Image industrielle analysée. `;
    
    if (analysis.organes.length > 0) {
      description += `Organes détectés: ${analysis.organes.map((o: any) => o.nom).join(', ')}. `;
    }
    
    if (analysis.voyants.length > 0) {
      const actifs = analysis.voyants.filter((v: any) => v.couleur !== 'eteint');
      if (actifs.length > 0) {
        description += `Voyants: ${actifs.map((v: any) => `${v.organe}=${v.couleur}`).join(', ')}. `;
      }
    }
    
    if (analysis.cadrans.length > 0) {
      description += `Mesures: ${analysis.cadrans.map((m: any) => `${m.organe}=${m.valeur}${m.unite}`).join(', ')}. `;
    }
    
    description += `État estimé: ${similarity.bestMatch} (confiance: ${(similarity.confidence * 100).toFixed(1)}%).`;
    
    return description;
  }
  
  /**
   * Récupère toutes les analyses pour RAG
   */
  getAllAnalysesForRag(): any[] {
    const analyses = [];
    const files = fs.readdirSync(this.processedPath);
    
    for (const file of files) {
      if (file.endsWith('.rag.json')) {
        const data = JSON.parse(fs.readFileSync(path.join(this.processedPath, file), 'utf-8'));
        analyses.push(data);
      }
    }
    
    return analyses;
  }
  
  /**
   * Recherche sémantique dans les analyses
   */
  searchInAnalyses(query: string, topK: number = 5): any[] {
    const analyses = this.getAllAnalysesForRag();
    const queryLower = query.toLowerCase();
    
    // Score simple basé sur les mots-clés
    const scored = analyses.map(analysis => {
      let score = 0;
      const text = analysis.texteDescriptif.toLowerCase();
      
      // Recherche de mots-clés
      const words = queryLower.split(' ');
      for (const word of words) {
        if (text.includes(word)) score += 1;
        if (analysis.organes.some((o: string) => o.toLowerCase().includes(word))) score += 2;
      }
      
      return { ...analysis, score };
    });
    
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

// Export singleton
let instance: IndustrialVisionIntegration | null = null;

const DEFAULT_CONFIG: IndustrialVisionConfig = {
  referencesPath: path.join(process.cwd(), 'data', 'banque_images_ia'),
  capturesPath: path.join(process.cwd(), 'data', 'industrial-captures'),
  seuils: {
    similariteMarche: 0.8,
    similariteArret: 0.8,
    similariteDefaut: 0.7,
    pressionMax: 15,
    temperatureMax: 80
  }
};

export function getIndustrialVisionIntegration(config?: IndustrialVisionConfig): IndustrialVisionIntegration {
  if (!instance) {
    instance = new IndustrialVisionIntegration(config || DEFAULT_CONFIG);
  }
  return instance;
}