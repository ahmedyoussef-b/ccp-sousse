/**
 * @fileOverview Service de déclenchement et monitoring Colab
 * @version 1.0.0
 */

import { antigravityColabBridge } from './colab-bridge';
import { trainingDataCollector } from './data-collector';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[COLAB-TRIGGER]';

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
// SERVICE PRINCIPAL
// ============================================================================

export class ColabTriggerService {
    private isChecking: boolean = false;
    private checkInterval: NodeJS.Timeout | null = null;
    
    /**
     * Déclenche un entraînement via Colab
     */
    async triggerColabTraining(): Promise<{
        status: 'prepared' | 'error';
        message: string;
        instructions?: string;
    }> {
        logInfo('Préparation du déclenchement Colab...');
        
        try {
            // 1. Vérifier qu'on a assez de données
            const data = await trainingDataCollector.collectAll();
            
            if (data.length < 10) {
                return {
                    status: 'error',
                    message: `Données insuffisantes (${data.length}/10). Continuez à collecter.`
                };
            }
            
            // 2. Préparer le dataset
            
            // 3. Générer les instructions
            const instructions = this.generateInstructions(data.length);
            
            logSuccess('Dataset prêt pour Colab');
            
            return {
                status: 'prepared',
                message: `Dataset préparé avec ${data.length} exemples. Suivez les instructions ci-dessous.`,
                instructions
            };
            
        } catch (error: any) {
            logError('Erreur préparation', error);
            return {
                status: 'error',
                message: `Erreur: ${error.message}`
            };
        }
    }
    
    /**
     * Génère les instructions pour l'utilisateur
     */
    private generateInstructions(sampleCount: number): string {
        return `
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    🚀 ENTRAÎNEMENT VIA COLAB (ANTIGRAVITY)                     ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  📊 STATUT: ${sampleCount} exemples collectés (seuil: 50)                                ║
║                                                                               ║
║  📝 ÉTAPES À SUIVRE DANS ANTIGRAVITY:                                          ║
║                                                                               ║
║  1. Ouvrez l'onglet **COLAB** dans le panneau latéral                         ║
║                                                                               ║
║  2. Téléchargez le fichier dataset.jsonl depuis:                              ║
║     ${process.cwd()}/data/training/dataset.jsonl                               ║
║                                                                               ║
║  3. Créez un nouveau notebook et collez le script ci-dessous                  ║
║                                                                               ║
║  4. Exécutez les cellules dans l'ordre                                        ║
║                                                                               ║
║  5. Une fois l'entraînement terminé, téléchargez le modèle                    ║
║                                                                               ║
║  6. Importez le modèle dans Ollama:                                           ║
║     ollama create ccp-model -f Modelfile                                      ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

📋 SCRIPT COLAB À COPIER:

\`\`\`python
# Cellule 1: Installation
!pip install -q unsloth transformers datasets peft trl accelerate bitsandbytes

# Cellule 2: Téléchargement du dataset (via l'interface)
# Uploader le fichier dataset.jsonl

# Cellule 3: Script d'entraînement
%%writefile train.py
${this.getTrainingScript()}

# Cellule 4: Exécution
!python train.py --epochs 3 --lora_rank 16

# Cellule 5: Téléchargement du modèle
from google.colab import files
files.download('/content/ccp_model.zip')
\`\`\`

📌 Note: L'entraînement peut prendre 10-30 minutes selon la quantité de données.
        Gardez l'onglet actif pour éviter la déconnexion.
`;
    }
    
    private getTrainingScript(): string {
        return `import os
import json
import argparse
from unsloth import FastLanguageModel
from unsloth import is_bfloat16_supported
from trl import SFTTrainer
from transformers import TrainingArguments
from datasets import load_dataset

def main():
    # Paramètres
    MODEL_NAME = "unsloth/phi-4"
    OUTPUT_DIR = "/content/ccp_model"
    LORA_RANK = 16
    NUM_EPOCHS = 3
    
    print("🚀 Chargement du modèle...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=MODEL_NAME,
        max_seq_length=2048,
        dtype=None,
        load_in_4bit=True,
    )
    
    print("🔧 Configuration LoRA...")
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
    
    print("📊 Chargement du dataset...")
    dataset = load_dataset('json', data_files='/content/dataset.jsonl', split='train')
    
    def formatting_func(examples):
        texts = []
        for i in range(len(examples['instruction'])):
            text = f"<|user|>\\n{examples['instruction'][i]}\\n<|assistant|>\\n{examples['output'][i]}"
            texts.append(text)
        return {"text": texts}
    
    dataset = dataset.map(formatting_func, batched=True)
    
    print(f"📊 Dataset: {len(dataset)} exemples")
    print("🏋️ Démarrage de l'entraînement...")
    
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
    
    trainer.train()
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    
    print("✅ Entraînement terminé!")

if __name__ == "__main__":
    main()
`;
    }
    
    /**
     * Démarre la surveillance des nouveaux modèles
     */
    startMonitoring(intervalMs: number = 60000): void {
        if (this.checkInterval) {
            logInfo('Surveillance déjà active');
            return;
        }
        
        logInfo(`Démarrage surveillance (intervalle: ${intervalMs}ms)`);
        
        this.checkInterval = setInterval(async () => {
            if (this.isChecking) return;
            
            this.isChecking = true;
            try {
                const hasNewModel = await antigravityColabBridge.checkForNewModel();
                if (hasNewModel) {
                    logSuccess('Nouveau modèle détecté!');
                    // Déclencher l'import automatique
                    await this.importLatestModel();
                }
            } catch (error) {
                logError('Erreur surveillance', error);
            } finally {
                this.isChecking = false;
            }
        }, intervalMs);
    }
    
    /**
     * Importe le dernier modèle depuis Colab
     */
    private async importLatestModel(): Promise<void> {
        logInfo('Recherche du dernier modèle...');
        // Logique d'import à implémenter
    }
    
    /**
     * Arrête la surveillance
     */
    stopMonitoring(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            logInfo('Surveillance arrêtée');
        }
    }
}

export const colabTriggerService = new ColabTriggerService();