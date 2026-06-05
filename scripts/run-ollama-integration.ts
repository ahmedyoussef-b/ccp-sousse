// scripts/run-ollama-integration.ts
// Point d'entrée pour l'intégration Ollama depuis Node.js

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { OllamaIntegration, fullIntegrationFlow } from './ollama-integration';

const execAsync = promisify(exec);

interface ImportOptions {
  zipPath?: string;
  modelName?: string;
  skipExtract?: boolean;
  skipMerge?: boolean;
  skipGGUF?: boolean;
}

class OllamaImportPipeline {
  private baseDir: string;
  private uploadsDir: string;
  private extractedDir: string;
  private mergedDir: string;
  private ggufDir: string;

  constructor() {
    this.baseDir = process.cwd();
    this.uploadsDir = path.join(this.baseDir, 'data', 'models', 'uploaded');
    this.extractedDir = path.join(this.baseDir, 'data', 'models', 'extracted');
    this.mergedDir = path.join(this.baseDir, 'data', 'models', 'merged');
    this.ggufDir = path.join(this.baseDir, 'data', 'models', 'gguf');
  }

  private log(message: string, color: string = 'cyan') {
    const colors: Record<string, string> = {
      cyan: '\x1b[36m',
      green: '\x1b[32m',
      red: '\x1b[31m',
      yellow: '\x1b[33m',
      reset: '\x1b[0m'
    };
    console.log(`${colors[color] || colors.cyan}[${new Date().toISOString()}] ${message}${colors.reset}`);
  }

  /**
   * Trouver le dernier fichier ZIP
   */
  private async findLatestZip(): Promise<string | null> {
    if (!fs.existsSync(this.uploadsDir)) {
      return null;
    }
    
    const files = fs.readdirSync(this.uploadsDir);
    const zips = files.filter(f => f.endsWith('.zip'))
      .map(f => ({
        name: f,
        path: path.join(this.uploadsDir, f),
        mtime: fs.statSync(path.join(this.uploadsDir, f)).mtime
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    
    return zips.length > 0 ? zips[0].path : null;
  }

  /**
   * Extraire le fichier ZIP
   */
  private async extractZip(zipPath: string): Promise<boolean> {
    this.log(`📦 Extraction de ${path.basename(zipPath)}...`, 'yellow');
    
    // Nettoyer le dossier d'extraction
    if (fs.existsSync(this.extractedDir)) {
      fs.rmSync(this.extractedDir, { recursive: true, force: true });
    }
    fs.mkdirSync(this.extractedDir, { recursive: true });
    
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(this.extractedDir, true);
      
      const fileCount = fs.readdirSync(this.extractedDir).length;
      this.log(`✅ Extraction terminée: ${fileCount} fichiers`, 'green');
      return true;
    } catch (error) {
      this.log(`❌ Erreur extraction: ${error}`, 'red');
      return false;
    }
  }

  /**
   * Détecter le type de modèle
   */
  private detectModelType(): 'lora' | 'full' | 'gguf' | 'standard' {
    const files = fs.readdirSync(this.extractedDir);
    
    if (files.includes('adapter_model.safetensors') || files.includes('adapter_model.bin')) {
      return 'lora';
    }
    if (files.some(f => f.endsWith('.gguf'))) {
      return 'gguf';
    }
    if (files.includes('model.safetensors') || files.includes('pytorch_model.bin')) {
      return 'full';
    }
    return 'standard';
  }

  /**
   * Fusionner le modèle LoRA
   */
  private async mergeLora(modelName: string): Promise<string> {
    this.log(`🔗 Fusion LoRA pour ${modelName}...`, 'yellow');
    
    const mergedModelPath = path.join(this.mergedDir, modelName);
    fs.mkdirSync(mergedModelPath, { recursive: true });
    
    // Script Python pour la fusion
    const pythonScript = `
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import os
import shutil

extracted_path = r"${this.extractedDir.replace(/\\/g, '/')}"
merged_path = r"${mergedModelPath.replace(/\\/g, '/')}"

try:
    # Charger un petit modèle de base pour test
    base_model_name = "unsloth/distilgpt2"
    
    print(f"Chargement du modèle de base: {base_model_name}")
    base_model = AutoModelForCausalLM.from_pretrained(
        base_model_name,
        torch_dtype=torch.float16,
        device_map="auto" if torch.cuda.is_available() else None
    )
    tokenizer = AutoTokenizer.from_pretrained(base_model_name)
    
    print("Chargement des poids LoRA...")
    model = PeftModel.from_pretrained(base_model, extracted_path)
    
    print("Fusion des poids...")
    merged_model = model.merge_and_unload()
    
    print(f"Sauvegarde du modèle fusionné dans {merged_path}")
    merged_model.save_pretrained(merged_path)
    tokenizer.save_pretrained(merged_path)
    
    print("SUCCESS")
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
`;
    
    const scriptPath = path.join(this.baseDir, 'temp_merge.py');
    fs.writeFileSync(scriptPath, pythonScript);
    
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const { stdout, stderr } = await execAsync(`python "${scriptPath}"`);
      
      if (stderr && !stderr.includes('SUCCESS')) {
        this.log(`⚠️ Fusion avec avertissements: ${stderr.substring(0, 200)}`, 'yellow');
      }
      
      this.log(`✅ Fusion terminée: ${mergedModelPath}`, 'green');
      return mergedModelPath;
    } catch (error) {
      this.log(`❌ Erreur fusion: ${error}`, 'red');
      return this.extractedDir; // Fallback
    } finally {
      if (fs.existsSync(scriptPath)) {
        fs.unlinkSync(scriptPath);
      }
    }
  }

  /**
   * Pipeline principal
   */
  async run(options: ImportOptions = {}): Promise<boolean> {
    this.log('=========================================', 'cyan');
    this.log('🚀 PIPELINE D\'IMPORT AUTOMATIQUE', 'cyan');
    this.log('=========================================', 'cyan');
    
    // 1. Trouver le ZIP
    let zipPath = options.zipPath;
    if (!zipPath) {
      zipPath = await this.findLatestZip();
      if (!zipPath) {
        this.log('❌ Aucun fichier ZIP trouvé', 'red');
        return false;
      }
    }
    
    this.log(`📁 ZIP source: ${path.basename(zipPath)}`, 'cyan');
    
    // 2. Déterminer le nom du modèle
    let modelName = options.modelName;
    if (!modelName) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      modelName = `ccp_model_${timestamp}`;
    }
    this.log(`🏷️ Nom du modèle: ${modelName}`, 'cyan');
    
    // 3. Extraire
    if (!options.skipExtract) {
      const extracted = await this.extractZip(zipPath);
      if (!extracted) return false;
    }
    
    // 4. Détecter le type
    const modelType = this.detectModelType();
    this.log(`📊 Type détecté: ${modelType}`, 'cyan');
    
    // 5. Fusionner si LoRA
    let modelPath = this.extractedDir;
    if (modelType === 'lora' && !options.skipMerge) {
      modelPath = await this.mergeLora(modelName);
    } else if (modelType === 'full') {
      modelPath = path.join(this.mergedDir, modelName);
      fs.mkdirSync(modelPath, { recursive: true });
      fs.cpSync(this.extractedDir, modelPath, { recursive: true });
    }
    
    // 6. Intégration Ollama
    this.log('', 'cyan');
    const integration = new OllamaIntegration();
    
    try {
      const modelfilePath = await integration.createModelfile(modelName, modelPath);
      const ollamaPath = await integration.copyToOllamaModels(modelName, modelPath);
      const success = await integration.importToOllama(modelName, modelfilePath);
      
      if (success) {
        const isAvailable = await integration.verifyModel(modelName);
        if (isAvailable) {
          this.log(`🎉 Modèle "${modelName}" disponible dans Ollama!`, 'green');
          
          // Tester le modèle
          this.log('🧪 Test du modèle...', 'cyan');
          const response = await integration.testModel(
            modelName,
            "Quelle est la pression maximale d'admission pour TG1 ?"
          );
          this.log(`📝 Réponse test: ${response.substring(0, 150)}...`, 'green');
          
          // Lier à l'application
          await integration.linkToApp(modelName);
          
          // Archiver le ZIP
          const archiveDir = path.join(this.baseDir, 'data', 'models', 'archive');
          if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
          const archivePath = path.join(archiveDir, `${path.basename(zipPath)}`);
          fs.renameSync(zipPath, archivePath);
          
          this.log('', 'green');
          this.log('=========================================', 'green');
          this.log('✅ IMPORT RÉUSSI !', 'green');
          this.log('=========================================', 'green');
          this.log(`🆔 Modèle: ${modelName}`, 'cyan');
          this.log(`📍 Emplacement: ${ollamaPath}`, 'cyan');
          this.log(`💡 Test: ollama run ${modelName}`, 'yellow');
          
          return true;
        }
      }
      
      return false;
    } catch (error) {
      this.log(`❌ Erreur intégration: ${error}`, 'red');
      return false;
    }
  }
}

// Exécution en ligne de commande
async function main() {
  const args = process.argv.slice(2);
  const options: ImportOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--zip':
      case '-z':
        options.zipPath = args[++i];
        break;
      case '--name':
      case '-n':
        options.modelName = args[++i];
        break;
      case '--skip-extract':
        options.skipExtract = true;
        break;
      case '--skip-merge':
        options.skipMerge = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Utilisation: npx ts-node scripts/run-ollama-integration.ts [options]

Options:
  --zip, -z <path>     Chemin vers le fichier ZIP (optionnel, utilise le dernier)
  --name, -n <name>    Nom du modèle (optionnel, généré automatiquement)
  --skip-extract       Ignorer l'extraction du ZIP
  --skip-merge         Ignorer la fusion LoRA
  --help, -h           Afficher cette aide
        `);
        return;
    }
  }
  
  const pipeline = new OllamaImportPipeline();
  await pipeline.run(options);
}

// Exécuter si appelé directement
if (require.main === module) {
  main().catch(console.error);
}

export { OllamaImportPipeline };