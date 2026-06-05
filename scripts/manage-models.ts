// scripts/manage-models.ts
// Gestion des modèles Ollama

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import readline from 'readline';

const execAsync = promisify(exec);

interface ModelInfo {
  name: string;
  size: string;
  modified: string;
  location: string;
}

class ModelManager {
  private ollamaModelsDir: string;

  constructor() {
    const platform = process.platform;
    if (platform === 'win32') {
      this.ollamaModelsDir = path.join(process.env.USERPROFILE || '', '.ollama', 'models');
    } else {
      this.ollamaModelsDir = path.join(process.env.HOME || '', '.ollama', 'models');
    }
  }

  private log(message: string, color: string = 'cyan') {
    const colors: Record<string, string> = {
      cyan: '\x1b[36m',
      green: '\x1b[32m',
      red: '\x1b[31m',
      yellow: '\x1b[33m',
      white: '\x1b[37m',
      reset: '\x1b[0m'
    };
    console.log(`${colors[color] || colors.cyan}${message}${colors.reset}`);
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const { stdout } = await execAsync('ollama list');
      const lines = stdout.split('\n').slice(1);
      const models: ModelInfo[] = [];
      
      for (const line of lines) {
        if (line.trim()) {
          const parts = line.split(/\s+/);
          if (parts.length >= 3) {
            models.push({
              name: parts[0],
              size: parts[2] || '?',
              modified: parts[1] || '?',
              location: path.join(this.ollamaModelsDir, parts[0])
            });
          }
        }
      }
      
      return models;
    } catch {
      return [];
    }
  }

  async showModels() {
    this.log('\n📋 MODÈLES OLLAMA INSTALLÉS', 'cyan');
    this.log('=========================================', 'cyan');
    
    const models = await this.listModels();
    
    if (models.length === 0) {
      this.log('Aucun modèle trouvé', 'yellow');
      return;
    }
    
    for (const model of models) {
      this.log(`\n🏷️ ${model.name}`, 'green');
      this.log(`   Taille: ${model.size}`, 'white');
      this.log(`   Modifié: ${model.modified}`, 'white');
      this.log(`   Emplacement: ${model.location}`, 'gray');
    }
    
    this.log('\n=========================================', 'cyan');
  }

  async testModel(modelName: string) {
    this.log(`\n🧪 Test du modèle: ${modelName}`, 'cyan');
    this.log('=========================================', 'cyan');
    
    const testQuestions = [
      "Quelle est la pression maximale d'admission pour TG1 ?",
      "Température normale de fonctionnement de la turbine TV ?",
      "Comment effectuer un démarrage sécurisé de TG2 ?"
    ];
    
    for (const question of testQuestions) {
      this.log(`\n❓ ${question}`, 'yellow');
      try {
        const { stdout } = await execAsync(`ollama run ${modelName} "${question}" --temperature 0.3 2>&1`);
        this.log(`🤖 ${stdout.substring(0, 300)}`, 'green');
      } catch (error) {
        this.log(`❌ Erreur: ${error}`, 'red');
      }
    }
  }

  async setActiveModel(modelName: string) {
    const envPath = path.join(process.cwd(), '.env.local');
    
    if (!fs.existsSync(envPath)) {
      this.log('❌ Fichier .env.local non trouvé', 'red');
      return;
    }
    
    let content = fs.readFileSync(envPath, 'utf-8');
    
    if (content.includes('OLLAMA_MODEL=')) {
      content = content.replace(/OLLAMA_MODEL=.*/, `OLLAMA_MODEL=${modelName}`);
    } else {
      content += `\nOLLAMA_MODEL=${modelName}\n`;
    }
    
    fs.writeFileSync(envPath, content);
    this.log(`✅ Modèle actif changé pour: ${modelName}`, 'green');
    this.log('🔄 Redémarrez l\'application pour appliquer les changements', 'yellow');
  }

  async deleteModel(modelName: string) {
    this.log(`⚠️ Suppression du modèle: ${modelName}`, 'red');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('Confirmer la suppression ? (O/N): ', async (answer) => {
      if (answer.toUpperCase() === 'O') {
        try {
          await execAsync(`ollama rm ${modelName}`);
          this.log(`✅ Modèle ${modelName} supprimé`, 'green');
        } catch (error) {
          this.log(`❌ Erreur: ${error}`, 'red');
        }
      } else {
        this.log('Suppression annulée', 'yellow');
      }
      rl.close();
    });
  }

  async showHelp() {
    this.log(`
╔════════════════════════════════════════════════════════════════╗
║                    GESTION DES MODÈLES OLLAMA                   ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Commande: npx ts-node scripts/manage-models.ts [action]      ║
║                                                                ║
║  Actions:                                                      ║
║    list              - Lister tous les modèles                 ║
║    test <nom>        - Tester un modèle                        ║
║    set-active <nom>  - Définir le modèle actif                 ║
║    delete <nom>      - Supprimer un modèle                     ║
║    help              - Afficher cette aide                     ║
║                                                                ║
║  Exemples:                                                     ║
║    npx ts-node scripts/manage-models.ts list                   ║
║    npx ts-node scripts/manage-models.ts test ccp_model         ║
║    npx ts-node scripts/manage-models.ts set-active ccp_model   ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
    `, 'cyan');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const manager = new ModelManager();
  
  if (args.length === 0) {
    await manager.showHelp();
    return;
  }
  
  const action = args[0];
  const param = args[1];
  
  switch (action) {
    case 'list':
      await manager.showModels();
      break;
    case 'test':
      if (!param) {
        console.log('❌ Nom du modèle requis');
        await manager.showHelp();
      } else {
        await manager.testModel(param);
      }
      break;
    case 'set-active':
      if (!param) {
        console.log('❌ Nom du modèle requis');
        await manager.showHelp();
      } else {
        await manager.setActiveModel(param);
      }
      break;
    case 'delete':
      if (!param) {
        console.log('❌ Nom du modèle requis');
        await manager.showHelp();
      } else {
        await manager.deleteModel(param);
      }
      break;
    case 'help':
    default:
      await manager.showHelp();
      break;
  }
}

main().catch(console.error);