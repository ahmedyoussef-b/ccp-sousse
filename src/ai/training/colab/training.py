#!/usr/bin/env python3
"""
Script d'entraînement pour Antigravity Colab
Compatible avec l'intégration native de l'IDE
"""

import os
import sys
import json
import time
import pickle
import argparse
from datetime import datetime
from pathlib import Path

# ============================================================================
# CONFIGURATION ANTIGRAVITY
# ============================================================================

# Détection de l'environnement Colab dans Antigravity
IN_COLAB = 'COLAB_GPU' in os.environ or 'ANTIGRAVITY_COLAB' in os.environ

if IN_COLAB:
    from google.colab import files, drive
    print("✅ Environnement Colab Antigravity détecté")
else:
    print("⚠️ Mode local - simulation uniquement")

# ============================================================================
# PARAMÈTRES
# ============================================================================

MODEL_NAME = "unsloth/phi-4"  # Modèle de base
OUTPUT_DIR = "/content/ccp_model"
CHECKPOINT_DIR = "/content/checkpoints"
DATASET_PATH = "/content/dataset.jsonl"

# Paramètres d'entraînement
LORA_RANK = 16
LORA_ALPHA = 16
LEARNING_RATE = 2e-4
NUM_EPOCHS = 3
BATCH_SIZE = 2
MAX_SEQ_LENGTH = 2048

# ============================================================================
# FONCTIONS
# ============================================================================

def setup_environment():
    """Configure l'environnement Colab"""
    print("🔧 Configuration de l'environnement...")
    
    # Installation des dépendances si nécessaire
    os.system("pip install -q unsloth transformers datasets peft trl accelerate bitsandbytes")
    
    # Montage de Google Drive (si Colab)
    if IN_COLAB:
        drive.mount('/content/drive', force_remount=True)
        
        # Création des dossiers
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        os.makedirs(CHECKPOINT_DIR, exist_ok=True)
        os.makedirs("/content/drive/MyDrive/ccp_training", exist_ok=True)
        
        print("✅ Environnement configuré")
        return True
    return False

def load_dataset():
    """Charge le dataset depuis Drive ou upload"""
    print("📥 Chargement du dataset...")
    
    # Essayer depuis Drive
    drive_path = "/content/drive/MyDrive/ccp_training/dataset.jsonl"
    if os.path.exists(drive_path):
        shutil.copy2(drive_path, DATASET_PATH)
        print(f"✅ Dataset chargé depuis Drive: {drive_path}")
        return True
    
    # Sinon, demander l'upload (Antigravity)
    if IN_COLAB:
        print("📤 Veuillez uploader le fichier dataset.jsonl")
        uploaded = files.upload()
        for filename in uploaded.keys():
            if filename.endswith('.jsonl'):
                os.rename(filename, DATASET_PATH)
                print(f"✅ Dataset uploadé: {filename}")
                return True
    
    print("❌ Aucun dataset trouvé")
    return False

def train_model():
    """Exécute l'entraînement"""
    print("🚀 Démarrage de l'entraînement...")
    
    try:
        from unsloth import FastLanguageModel
        from unsloth import is_bfloat16_supported
        from trl import SFTTrainer
        from transformers import TrainingArguments
        from datasets import load_dataset
        
        # 1. Chargement du modèle
        print(f"📦 Chargement du modèle: {MODEL_NAME}")
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=MODEL_NAME,
            max_seq_length=MAX_SEQ_LENGTH,
            dtype=None,
            load_in_4bit=True,
        )
        
        # 2. Configuration LoRA
        print(f"🔧 Configuration LoRA (rank={LORA_RANK})")
        model = FastLanguageModel.get_peft_model(
            model,
            r=LORA_RANK,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                           "gate_proj", "up_proj", "down_proj"],
            lora_alpha=LORA_ALPHA,
            lora_dropout=0,
            bias="none",
            use_gradient_checkpointing="unsloth",
            random_state=3407,
            use_rslora=True,
        )
        
        # 3. Chargement du dataset
        dataset = load_dataset('json', data_files=DATASET_PATH, split='train')
        print(f"📊 Dataset: {len(dataset)} exemples")
        
        # 4. Formatage
        def formatting_func(examples):
            texts = []
            for i in range(len(examples['instruction'] if 'instruction' in examples else examples['input'])):
                instruction = examples.get('instruction', [''])[i] if 'instruction' in examples else examples.get('input', [''])[i]
                output = examples.get('output', [''])[i]
                text = f"<|user|>\n{instruction}\n<|assistant|>\n{output}"
                texts.append(text)
            return {"text": texts}
        
        dataset = dataset.map(formatting_func, batched=True)
        
        # 5. Entraînement
        trainer = SFTTrainer(
            model=model,
            tokenizer=tokenizer,
            train_dataset=dataset,
            dataset_text_field="text",
            max_seq_length=MAX_SEQ_LENGTH,
            args=TrainingArguments(
                per_device_train_batch_size=BATCH_SIZE,
                gradient_accumulation_steps=4,
                warmup_steps=5,
                num_train_epochs=NUM_EPOCHS,
                learning_rate=LEARNING_RATE,
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
        
        # 6. Entraînement avec checkpoints
        print("🏋️ Entraînement en cours...")
        train_result = trainer.train()
        
        # 7. Sauvegarde
        print("💾 Sauvegarde du modèle...")
        model.save_pretrained(OUTPUT_DIR)
        tokenizer.save_pretrained(OUTPUT_DIR)
        
        # 8. Export pour Ollama (GGUF)
        print("📦 Export au format GGUF...")
        try:
            model.save_pretrained_gguf(f"{OUTPUT_DIR}_gguf", tokenizer, quantization_method="q4_k_m")
        except:
            print("⚠️ Export GGUF non disponible")
        
        # 9. Copie vers Drive
        if IN_COLAB:
            import shutil
            shutil.copytree(OUTPUT_DIR, f"/content/drive/MyDrive/ccp_training/model_{int(time.time())}")
            print("✅ Modèle sauvegardé sur Google Drive")
        
        # 10. Métriques
        metrics = {
            'train_loss': float(train_result.training_loss),
            'train_steps': train_result.global_step,
            'training_time': train_result.metrics.get('train_runtime', 0),
            'final_loss': float(train_result.training_loss),
            'timestamp': datetime.now().isoformat()
        }
        
        print("\n" + "="*50)
        print("✅ ENTRAÎNEMENT TERMINÉ")
        print(f"   Loss finale: {metrics['final_loss']:.4f}")
        print(f"   Durée: {metrics['training_time']:.1f}s")
        print("="*50)
        
        return metrics
        
    except Exception as e:
        print(f"❌ Erreur: {e}")
        raise

def save_checkpoint(epoch, model, optimizer, loss):
    """Sauvegarde un checkpoint"""
    checkpoint = {
        'epoch': epoch,
        'model_state': model.state_dict(),
        'optimizer_state': optimizer.state_dict(),
        'loss': loss,
        'timestamp': datetime.now().isoformat()
    }
    
    path = f"{CHECKPOINT_DIR}/checkpoint_epoch_{epoch}.pt"
    torch.save(checkpoint, path)
    
    # Copie vers Drive
    if IN_COLAB:
        shutil.copy2(path, f"/content/drive/MyDrive/ccp_training/checkpoints/")
    
    print(f"💾 Checkpoint sauvegardé: epoch {epoch}")
    return path

def download_model():
    """Télécharge le modèle vers la machine locale (Antigravity)"""
    import zipfile
    
    print("📥 Préparation du téléchargement...")
    
    # Création d'une archive
    zip_path = "/content/ccp_model.zip"
    with zipfile.ZipFile(zip_path, 'w') as zipf:
        for root, dirs, files in os.walk(OUTPUT_DIR):
            for file in files:
                zipf.write(os.path.join(root, file), 
                          os.path.relpath(os.path.join(root, file), OUTPUT_DIR))
    
    # Téléchargement (Antigravity)
    if IN_COLAB:
        files.download(zip_path)
        print("✅ Modèle téléchargé")
    
    return zip_path

# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['train', 'resume', 'download'], default='train')
    parser.add_argument('--epochs', type=int, default=NUM_EPOCHS)
    parser.add_argument('--lora_rank', type=int, default=LORA_RANK)
    
    args = parser.parse_args()
    
    print("\n" + "="*50)
    print("🎯 ANTIGRAVITY COLAB - TRAINING CCP")
    print("="*50 + "\n")
    
    # Setup
    setup_environment()
    
    if args.mode == 'train':
        if load_dataset():
            train_model()
            download_model()
        else:
            print("❌ Impossible de continuer sans dataset")
            
    elif args.mode == 'download':
        download_model()
    
    print("\n✅ Opération terminée")

if __name__ == "__main__":
    main()