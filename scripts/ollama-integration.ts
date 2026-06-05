// scripts/ollama-integration.ts
// Script complet pour l'intégration avec Ollama

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface OllamaModelConfig {
  name: string;
  baseModel: string;
  temperature?: number;
  topP?: number;
  systemPrompt?: string;
}

export class OllamaIntegration {
  private modelsDir: string;
  private ollamaModelsDir: string;

  constructor() {
    this.modelsDir = path.join(process.cwd(), 'data', 'models');
    this.ollamaModelsDir = this.getOllamaModelsDir();
  }

  private getOllamaModelsDir(): string {
    // Détection automatique de l'OS
    const platform = process.platform;
    
    if (platform === 'win32') {
      return path.join(process.env.USERPROFILE || '', '.ollama', 'models');
    } else if (platform === 'darwin') {
      return path.join(process.env.HOME || '', '.ollama', 'models');
    } else {
      return path.join(process.env.HOME || '', '.ollama', 'models');
    }
  }

  /**
   * #1 - Créer le Modelfile pour Ollama
   */
  async createModelfile(modelName: string, mergedModelPath: string): Promise<string> {
    const modelfilePath = path.join(mergedModelPath, 'Modelfile');
    
    const modelfileContent = `FROM ${mergedModelPath}
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER stop "</s>"
PARAMETER num_ctx 4096

TEMPLATE """{{ .Prompt }}"""

SYSTEM """Tu es un expert en centrales à cycle combiné (CCP).
Tu connais les procédures, les spécifications techniques et les bonnes pratiques 
pour l'exploitation des turbines à gaz (TG1, TG2) et des turbines à vapeur (TV).

Réponds de manière précise et concise en te basant sur les connaissances techniques.
Si tu n'es pas sûr, indique-le clairement et propose de consulter la documentation."""`;

    fs.writeFileSync(modelfilePath, modelfileContent);
    console.log(`✅ Modelfile créé: ${modelfilePath}`);
    
    return modelfilePath;
  }

  /**
   * #2 - Copier le modèle dans le dossier Ollama
   */
  async copyToOllamaModels(modelName: string, sourcePath: string): Promise<string> {
    const destPath = path.join(this.ollamaModelsDir, modelName);
    
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }
    
    // Copier les fichiers du modèle
    const files = fs.readdirSync(sourcePath);
    for (const file of files) {
      const src = path.join(sourcePath, file);
      const dest = path.join(destPath, file);
      fs.copyFileSync(src, dest);
    }
    
    console.log(`✅ Modèle copié vers: ${destPath}`);
    return destPath;
  }

  /**
   * #3 - Importer le modèle dans Ollama
   */
  async importToOllama(modelName: string, modelfilePath: string): Promise<boolean> {
    try {
      console.log(`🚀 Import du modèle ${modelName} dans Ollama...`);
      
      const { stdout, stderr } = await execAsync(
        `ollama create ${modelName} -f "${modelfilePath}"`
      );
      
      if (stderr && !stderr.includes('success')) {
        console.error('Erreur import:', stderr);
        return false;
      }
      
      console.log(`✅ Modèle ${modelName} importé avec succès`);
      console.log(`📍 Emplacement Ollama: ${this.ollamaModelsDir}`);
      
      return true;
    } catch (error) {
      console.error('Erreur lors de l\'import:', error);
      return false;
    }
  }

  /**
   * #4 - Vérifier que le modèle est disponible
   */
  async verifyModel(modelName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`ollama list`);
      return stdout.includes(modelName);
    } catch {
      return false;
    }
  }

  /**
   * #5 - Tester le modèle avec une requête
   */
  async testModel(modelName: string, prompt: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `ollama run ${modelName} "${prompt}" --timeout 30s`
      );
      return stdout;
    } catch (error) {
      console.error('Erreur test:', error);
      return '';
    }
  }

  /**
   * #6 - Obtenir l'emplacement exact du modèle
   */
  getModelLocation(modelName: string): string {
    return path.join(this.ollamaModelsDir, modelName);
  }

  /**
   * #7 - Lier le modèle à l'application
   */
  async linkToApp(modelName: string): Promise<void> {
    const envPath = path.join(process.cwd(), '.env.local');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }
    
    // Mettre à jour ou ajouter la variable
    if (envContent.includes('OLLAMA_MODEL=')) {
      envContent = envContent.replace(/OLLAMA_MODEL=.*/, `OLLAMA_MODEL=${modelName}`);
    } else {
      envContent += `\nOLLAMA_MODEL=${modelName}\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log(`✅ Application configurée pour utiliser ${modelName}`);
  }
}

// Exemple d'utilisation complète
export async function fullIntegrationFlow(zipFilePath: string, modelName: string) {
  const integration = new OllamaIntegration();
  
  console.log('🔧 Démarrage de l\'intégration complète...');
  console.log(`📁 Fichier source: ${zipFilePath}`);
  
  // #1 - Extraire le ZIP
  console.log('\n📦 Étape 1: Extraction...');
  // (code d'extraction existant)
  
  // #2 - Fusionner LoRA
  console.log('\n🔗 Étape 2: Fusion LoRA...');
  const mergedPath = path.join(process.cwd(), 'data', 'models', 'merged', modelName);
  
  // #3 - Créer le Modelfile
  console.log('\n📝 Étape 3: Création du Modelfile...');
  const modelfilePath = await integration.createModelfile(modelName, mergedPath);
  
  // #4 - Copier dans Ollama
  console.log('\n📂 Étape 4: Copie vers Ollama...');
  const ollamaPath = await integration.copyToOllamaModels(modelName, mergedPath);
  console.log(`📍 Modèle disponible à: ${ollamaPath}`);
  
  // #5 - Importer
  console.log('\n🚀 Étape 5: Import Ollama...');
  const success = await integration.importToOllama(modelName, modelfilePath);
  
  if (success) {
    // #6 - Vérifier
    console.log('\n✅ Étape 6: Vérification...');
    const isAvailable = await integration.verifyModel(modelName);
    
    if (isAvailable) {
      console.log(`\n🎉 Succès! Modèle "${modelName}" disponible dans Ollama`);
      
      // #7 - Tester
      console.log('\n🧪 Test du modèle:');
      const response = await integration.testModel(
        modelName,
        "Quelle est la pression maximale d'admission pour TG1 ?"
      );
      console.log(`Réponse: ${response.substring(0, 200)}...`);
      
      // #8 - Lier à l'app
      await integration.linkToApp(modelName);
      
      console.log('\n✨ Intégration terminée!');
      console.log(`💡 Utilisez: ollama run ${modelName}`);
    }
  }
}