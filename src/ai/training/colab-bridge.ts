/**
 * @fileOverview Bridge entre l'application CCP et Antigravity Colab
 * @version 1.0.0
 */

import { promises as fs } from 'fs';
import path from 'path';
import { trainingDataCollector } from './data-collector';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[COLAB-BRIDGE]';

function logInfo(message: string, data?: any): void {
    console.log(`${LOG_PREFIX} 📍 ${message}`);
    if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logSuccess(message: string, data?: any): void {
    console.log(`${LOG_PREFIX} ✅ ${message}`);
    if (data) console.log(`${LOG_PREFIX} 📊 ${JSON.stringify(data, null, 2).substring(0, 300)}`);
}

function logError(message: string, error?: any): void {
    console.error(`${LOG_PREFIX} ❌ ${message}`);
    if (error) console.error(`${LOG_PREFIX} 🔥 ${error.message || error}`);
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface ColabTrainingConfig {
    epochs: number;
    loraRank: number;
    learningRate: number;
    modelName: string;
}

export interface ColabTrainingResult {
    success: boolean;
    modelPath?: string;
    metrics?: {
        trainLoss: number;
        finalLoss: number;
        trainingTime: number;
    };
    error?: string;
    checkpointId?: string;
}

// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

export class AntigravityColabBridge {
    private datasetPath: string;
    
    constructor() {
        this.datasetPath = path.join(process.cwd(), 'data/training/dataset.jsonl');
        
        logInfo('Pont Antigravity Colab initialisé');
    }
    
    /**
     * Prépare le dataset pour Colab
     */
    async prepareDataset(): Promise<string> {
        logInfo('Préparation du dataset pour Colab...');
        
        // Collecter les données
        const data = await trainingDataCollector.collectAll();
        
        if (data.length === 0) {
            throw new Error('Aucune donnée d\'entraînement disponible');
        }
        
        // Formater pour l'entraînement
        const formattedData = data.map(example => ({
            instruction: example.input,
            input: example.context || '',
            output: example.output,
            weight: example.weight || 1.0,
            type: example.type
        }));
        
        // Sauvegarder en JSONL
        const jsonlContent = formattedData.map(item => JSON.stringify(item)).join('\n');
        await fs.mkdir(path.dirname(this.datasetPath), { recursive: true });
        await fs.writeFile(this.datasetPath, jsonlContent, 'utf-8');
        
        logSuccess(`Dataset préparé: ${data.length} exemples → ${this.datasetPath}`);
        
        return this.datasetPath;
    }
    
    /**
     * Télécharge le dataset vers l'environnement Antigravity
     * (Antigravity gère automatiquement l'upload via l'interface)
     */
    async uploadToAntigravity(): Promise<void> {
        logInfo('Le dataset est prêt. Utilisez l\'interface Antigravity pour le télécharger.');
        logInfo(`Chemin du fichier: ${this.datasetPath}`);
        
        // Afficher les instructions
        console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  📤 TÉLÉCHARGEMENT VERS ANTIGRAVITY COLAB                         ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  1. Ouvrez l'onglet COLAB dans Antigravity                       ║
║  2. Téléchargez le fichier: ${path.basename(this.datasetPath)}
║  3. Collez le script training.py dans une cellule               ║
║  4. Exécutez: !python training.py --mode train                  ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
        `);
    }
    
    /**
     * Vérifie si un nouveau modèle est disponible sur Drive
     */
    async checkForNewModel(): Promise<boolean> {
        // Cette méthode serait appelée périodiquement pour vérifier
        // si un modèle a été téléchargé depuis Colab
        const modelsDir = path.join(process.cwd(), 'data/models/colab');
        
        try {
            await fs.access(modelsDir);
            const files = await fs.readdir(modelsDir);
            const modelFiles = files.filter(f => f.endsWith('.zip') || f.endsWith('.gguf'));
            
            if (modelFiles.length > 0) {
                logSuccess(`${modelFiles.length} nouveau(x) modèle(s) disponible(s)`);
                return true;
            }
        } catch {
            // Dossier inexistant
        }
        
        return false;
    }
    
    /**
     * Importe un modèle depuis Colab vers Ollama
     */
    async importModelToOllama(modelPath: string, modelName: string): Promise<boolean> {
        logInfo(`Import du modèle ${modelName} vers Ollama...`);
        
        try {
            // Commande d'import Ollama
            const { exec } = require('child_process');
            
            return new Promise((resolve) => {
                exec(`ollama create ${modelName} -f ${modelPath}`, (error: any) => {
                    if (error) {
                        logError('Erreur import', error);
                        resolve(false);
                    } else {
                        logSuccess(`Modèle ${modelName} importé avec succès`);
                        resolve(true);
                    }
                });
            });
        } catch (error) {
            logError('Erreur import', error);
            return false;
        }
    }
    
    /**
     * Génère le script Colab à copier/coller
     */
    generateColabScript(): string {
        return `# ============================================
# SCRIPT POUR ANTIGRAVITY COLAB
# ============================================

# 1. Installation des dépendances
!pip install -q unsloth transformers datasets peft trl accelerate bitsandbytes

# 2. Téléchargement du dataset (via l'interface Antigravity)
#    - Uploader le fichier dataset.jsonl

# 3. Création du script d'entraînement
%%writefile training.py
${this.getTrainingScriptContent()}

# 4. Exécution
!python training.py --mode train --epochs 3 --lora_rank 16

# 5. Téléchargement du modèle (via l'interface)
#    - Le modèle sera disponible dans /content/ccp_model.zip
`;
    }
    
    private getTrainingScriptContent(): string {
        return `import os
import json
import time
import argparse
from datetime import datetime

# Installation des dépendances (si nécessaire)
os.system("pip install -q unsloth transformers datasets peft trl accelerate bitsandbytes")

# Paramètres
MODEL_NAME = "unsloth/phi-4"
OUTPUT_DIR = "/content/ccp_model"
DATASET_PATH = "/content/dataset.jsonl"
LORA_RANK = 16
NUM_EPOCHS = 3

def train():
    print("🚀 Démarrage de l'entraînement...")
    
    from unsloth import FastLanguageModel
    from unsloth import is_bfloat16_supported
    from trl import SFTTrainer
    from transformers import TrainingArguments
    from datasets import load_dataset
    
    # Chargement du modèle
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=MODEL_NAME,
        max_seq_length=2048,
        dtype=None,
        load_in_4bit=True,
    )
    
    # Configuration LoRA
    model = FastLanguageModel.get_peft_model(
        model,
        r=LORA_RANK,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                       "gate_proj", "up_proj", "down_proj"],
        lora_alpha=LORA_RANK,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=3407,
        use_rslora=True,
    )
    
    # Chargement du dataset
    dataset = load_dataset('json', data_files=DATASET_PATH, split='train')
    print(f"📊 Dataset: {len(dataset)} exemples")
    
    # Formatage
    def formatting_func(examples):
        texts = []
        for i in range(len(examples['instruction'])):
            text = f"<|user|>\\n{examples['instruction'][i]}\\n<|assistant|>\\n{examples['output'][i]}"
            texts.append(text)
        return {"text": texts}
    
    dataset = dataset.map(formatting_func, batched=True)
    
    # Entraînement
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=2048,
        args=TrainingArguments(
            per_device_train_batch_size=2,
            gradient_accumulation_steps=4,
            warmup_steps=5,
            num_train_epochs=NUM_EPOCHS,
            learning_rate=2e-4,
            fp16=not is_bfloat16_supported(),
            bf16=is_bfloat16_supported(),
            logging_steps=10,
            optim="adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="linear",
            seed=3407,
            output_dir=OUTPUT_DIR,
            save_strategy="epoch",
            report_to="none",
        ),
    )
    
    # Entraînement
    trainer.train()
    
    # Sauvegarde
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    
    print("✅ Entraînement terminé!")
    return True

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', default='train')
    parser.add_argument('--epochs', type=int, default=3)
    parser.add_argument('--lora_rank', type=int, default=16)
    args = parser.parse_args()
    
    if args.mode == 'train':
        train()

if __name__ == "__main__":
    main()
`;
    }
}

// Instance singleton
export const antigravityColabBridge = new AntigravityColabBridge();