// scripts/watch-uploads.ts
// Surveillance du dossier uploads avec import automatique

import * as fs from 'fs';
import * as path from 'path';
import { OllamaImportPipeline } from './run-ollama-integration';

class UploadWatcher {
  private uploadsDir: string;
  private processedDir: string;
  private watchInterval: number;
  private processedFiles: Set<string>;
  private isProcessing: boolean;

  constructor(watchIntervalSeconds: number = 30) {
    this.uploadsDir = path.join(process.cwd(), 'data', 'models', 'uploaded');
    this.processedDir = path.join(process.cwd(), 'data', 'models', 'processed');
    this.watchInterval = watchIntervalSeconds * 1000;
    this.processedFiles = new Set();
    this.isProcessing = false;
  }

  private log(message: string, color: string = 'cyan') {
    const colors: Record<string, string> = {
      cyan: '\x1b[36m',
      green: '\x1b[32m',
      red: '\x1b[31m',
      yellow: '\x1b[33m',
      reset: '\x1b[0m'
    };
    console.log(`${colors[color] || colors.cyan}[${new Date().toLocaleTimeString()}] ${message}${colors.reset}`);
  }

  private ensureDirectories() {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
      this.log(`📁 Dossier créé: ${this.uploadsDir}`, 'yellow');
    }
    if (!fs.existsSync(this.processedDir)) {
      fs.mkdirSync(this.processedDir, { recursive: true });
    }
  }

  private async processZip(zipPath: string) {
    if (this.isProcessing) {
      this.log(`⏳ Déjà en traitement, fichier mis en attente: ${path.basename(zipPath)}`, 'yellow');
      return;
    }

    this.isProcessing = true;
    this.log(`🆕 Nouveau ZIP détecté: ${path.basename(zipPath)}`, 'green');

    // Vérifier que le fichier est complet (taille stable)
    await this.waitForFileStable(zipPath);

    try {
      const pipeline = new OllamaImportPipeline();
      const success = await pipeline.run({ zipPath });

      if (success) {
        // Déplacer vers processed
        const destPath = path.join(this.processedDir, path.basename(zipPath));
        fs.renameSync(zipPath, destPath);
        this.processedFiles.add(zipPath);
        this.log(`✅ Import terminé, fichier archivé`, 'green');
      } else {
        this.log(`❌ Échec de l'import pour ${path.basename(zipPath)}`, 'red');
      }
    } catch (error) {
      this.log(`❌ Erreur lors de l'import: ${error}`, 'red');
    } finally {
      this.isProcessing = false;
    }
  }

  private async waitForFileStable(filePath: string, maxWaitSeconds: number = 60): Promise<boolean> {
    let lastSize = -1;
    let stableCount = 0;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitSeconds * 1000) {
      if (!fs.existsSync(filePath)) return false;
      
      const currentSize = fs.statSync(filePath).size;
      
      if (currentSize === lastSize && currentSize > 0) {
        stableCount++;
        if (stableCount >= 3) {
          this.log(`✅ Fichier stable (${(currentSize / 1024 / 1024).toFixed(2)} MB)`, 'green');
          return true;
        }
      } else {
        stableCount = 0;
        lastSize = currentSize;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    this.log(`⚠️ Timeout: le fichier n'est pas stable après ${maxWaitSeconds}s`, 'yellow');
    return true; // On tente quand même
  }

  async start() {
    this.ensureDirectories();
    
    this.log('=========================================', 'cyan');
    this.log('👁️ SURVEILLANCE DES UPLOADS COLAB', 'cyan');
    this.log('=========================================', 'cyan');
    this.log(`📁 Dossier surveillé: ${this.uploadsDir}`, 'yellow');
    this.log(`⏱️ Intervalle: ${this.watchInterval / 1000} secondes`, 'yellow');
    this.log('');
    
    // Scanner les fichiers existants
    const existingZips = fs.readdirSync(this.uploadsDir).filter(f => f.endsWith('.zip'));
    for (const zip of existingZips) {
      this.processedFiles.add(path.join(this.uploadsDir, zip));
    }
    
    // Boucle de surveillance
    setInterval(async () => {
      try {
        const files = fs.readdirSync(this.uploadsDir);
        const zips = files.filter(f => f.endsWith('.zip'));
        
        for (const zip of zips) {
          const fullPath = path.join(this.uploadsDir, zip);
          if (!this.processedFiles.has(fullPath)) {
            await this.processZip(fullPath);
          }
        }
      } catch (error) {
        this.log(`Erreur lors du scan: ${error}`, 'red');
      }
    }, this.watchInterval);
    
    this.log(`👁️ Surveillance active...`, 'green');
  }
}

// Démarrer la surveillance
const watcher = new UploadWatcher(30);
watcher.start().catch(console.error);