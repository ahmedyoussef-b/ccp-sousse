// src/lib/industrial-vision/database/ReferenceDB.ts

import * as fs from 'fs';
import * as path from 'path';
import { ReferenceImage, IndustrialVisionConfig } from '../types/industrial.types';
import { ImageAnalyzer } from '../core/ImageAnalyzer';

// Type pour les scores de similarité
interface SimilarityScores {
  marche_normale: number;
  arret_normale: number;
  defaut: number;
}

// Type pour le résultat de comparaison
interface CompareResult {
  marche_normale: number;
  arret_normale: number;
  defaut: number;
  bestMatch: 'marche_normale' | 'arret_normale' | 'defaut';
  confidence: number;
}

// Type pour les métadonnées d'analyse
interface AnalysisMetadata {
  organes: any[];
  voyants: any[];
  cadrans: any[];
  features: number[];
  fileHash: string;
}

// Type pour les nœuds de l'arborescence
interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  path?: string;
  metadata?: any;
  size?: number;
  children?: TreeNode[];
}

export class ReferenceDatabase {
  private references: Map<string, ReferenceImage> = new Map();
  private analyzer: ImageAnalyzer;
  private initialized: boolean = false;
  
  constructor(private config: IndustrialVisionConfig) {
    this.analyzer = new ImageAnalyzer();
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.analyzer.initialize();
    await this.loadReferences();
    this.initialized = true;
  }
  
  private async loadReferences(): Promise<void> {
    const types = ['marche_normale', 'arret_normale', 'defaut'] as const;
    
    for (const type of types) {
      const refPath = path.join(this.config.referencesPath, type);
      if (fs.existsSync(refPath)) {
        const files = fs.readdirSync(refPath).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
        
        for (const file of files) {
          const imagePath = path.join(refPath, file);
          const jsonPath = imagePath.replace(/\.(jpg|png)$/, '.json');
          
          let metadata = null;
          if (fs.existsSync(jsonPath)) {
            try {
              metadata = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            } catch (e) {
              console.warn(`Erreur lecture métadonnées: ${jsonPath}`);
            }
          }
          
          try {
            const analysis = await this.analyzer.analyzeImage(imagePath);
            
            const reference: ReferenceImage = {
              id: `${type}_${file}`,
              nom: file,
              type: type,
              chemin: imagePath,
              metadata: metadata || {},
              features: analysis.features,
              fileHash: analysis.fileHash,
              organes: analysis.organes,
              voyants: analysis.voyants,
              mesures: analysis.cadrans
            };
            
            this.references.set(reference.id, reference);
            console.log(`📚 Chargée référence: ${type} - ${file}`);
          } catch (error) {
            console.error(`Erreur analyse ${file}:`, error);
          }
        }
      }
    }
    
    console.log(`✅ Base de référence chargée: ${this.references.size} images`);
  }
  
  async compareWithReference(analysis: AnalysisMetadata): Promise<CompareResult> {
    const scores: SimilarityScores = {
      marche_normale: 0,
      arret_normale: 0,
      defaut: 0
    };
    
    const counts = {
      marche_normale: 0,
      arret_normale: 0,
      defaut: 0
    };
    
    for (const ref of this.references.values()) {
      const similarity = this.analyzer.computeSimilarity(analysis.features, ref.features, (analysis as any).fileHash, (ref as any).fileHash);
      scores[ref.type] += similarity;
      counts[ref.type]++;
    }
    
    // Calculer les moyennes
    const avgMarche = scores.marche_normale / (counts.marche_normale || 1);
    const avgArret = scores.arret_normale / (counts.arret_normale || 1);
    const avgDefaut = scores.defaut / (counts.defaut || 1);
    
    // Déterminer le meilleur match
    let bestMatch: 'marche_normale' | 'arret_normale' | 'defaut' = 'marche_normale';
    let bestScore = avgMarche;
    
    if (avgArret > bestScore) {
      bestScore = avgArret;
      bestMatch = 'arret_normale';
    }
    if (avgDefaut > bestScore) {
      bestScore = avgDefaut;
      bestMatch = 'defaut';
    }
    
    return {
      marche_normale: avgMarche,
      arret_normale: avgArret,
      defaut: avgDefaut,
      bestMatch: bestMatch,
      confidence: bestScore
    };
  }
  
  getReference(type: 'marche_normale' | 'arret_normale' | 'defaut'): ReferenceImage | null {
    for (const ref of this.references.values()) {
      if (ref.type === type) return ref;
    }
    return null;
  }
  
  getAllReferences(): ReferenceImage[] {
    return Array.from(this.references.values());
  }
  
  getReferencesByType(type: 'marche_normale' | 'arret_normale' | 'defaut'): ReferenceImage[] {
    return Array.from(this.references.values()).filter(ref => ref.type === type);
  }
  
  getDirectoryTree(): TreeNode {
    // Créer le nœud racine avec un tableau typé
    const tree: TreeNode = { 
      name: 'references', 
      type: 'directory',
      children: [] 
    };
    
    const types = ['marche_normale', 'arret_normale', 'defaut'] as const;
    
    for (const type of types) {
      // Créer un nœud pour chaque type avec un tableau typé
      const typeNode: TreeNode = { 
        name: type, 
        type: 'directory',
        children: [] 
      };
      
      const refs = this.getReferencesByType(type);
      for (const ref of refs) {
        // Ajouter chaque référence comme nœud fichier
        const fileNode: TreeNode = {
          name: ref.nom,
          type: 'file',
          path: ref.chemin,
          metadata: ref.metadata,
          size: ref.metadata?.taille || 0
        };
        typeNode.children!.push(fileNode);
      }
      
      // Ajouter le nœud type seulement s'il a des enfants
      if (typeNode.children && typeNode.children.length > 0) {
        tree.children!.push(typeNode);
      }
    }
    
    return tree;
  }
  
  async addReference(
    imagePath: string, 
    type: 'marche_normale' | 'arret_normale' | 'defaut',
    metadata?: any
  ): Promise<ReferenceImage> {
    // Copier l'image dans le dossier des références
    const targetDir = path.join(this.config.referencesPath, type);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const filename = path.basename(imagePath);
    const targetPath = path.join(targetDir, filename);
    fs.copyFileSync(imagePath, targetPath);
    
    // Analyser l'image
    const analysis = await this.analyzer.analyzeImage(targetPath);
    
    // Créer les métadonnées
    const fullMetadata = {
      ...metadata,
      type: type,
      dateAjout: new Date().toISOString(),
      filename: filename,
      taille: fs.statSync(targetPath).size
    };
    
    // Sauvegarder les métadonnées JSON
    const jsonPath = targetPath.replace(/\.(jpg|png)$/, '.json');
    fs.writeFileSync(jsonPath, JSON.stringify(fullMetadata, null, 2));
    
    // Créer l'objet référence
    const reference: ReferenceImage = {
      id: `${type}_${filename}`,
      nom: filename,
      type: type,
      chemin: targetPath,
      metadata: fullMetadata,
      features: analysis.features,
      fileHash: analysis.fileHash,
      organes: analysis.organes,
      voyants: analysis.voyants,
      mesures: analysis.cadrans
    };
    
    this.references.set(reference.id, reference);
    
    return reference;
  }
  
  async removeReference(id: string): Promise<boolean> {
    const reference = this.references.get(id);
    if (!reference) return false;
    
    // Supprimer le fichier image
    if (fs.existsSync(reference.chemin)) {
      fs.unlinkSync(reference.chemin);
    }
    
    // Supprimer le fichier JSON associé
    const jsonPath = reference.chemin.replace(/\.(jpg|png)$/, '.json');
    if (fs.existsSync(jsonPath)) {
      fs.unlinkSync(jsonPath);
    }
    
    this.references.delete(id);
    return true;
  }
  
  getStats(): { total: number; byType: Record<string, number> } {
    const byType = {
      marche_normale: 0,
      arret_normale: 0,
      defaut: 0
    };
    
    for (const ref of this.references.values()) {
      byType[ref.type]++;
    }
    
    return {
      total: this.references.size,
      byType
    };
  }
  
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Export des types pour usage externe
export type { SimilarityScores, CompareResult, AnalysisMetadata, TreeNode };