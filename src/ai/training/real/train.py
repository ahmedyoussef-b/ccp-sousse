# Training script for AI models
#!/usr/bin/env python3
"""
train.py - Script d'entraînement réel avec Unsloth/QLoRA
Supports: rsLoRA, Dynamic Quantization, Gradient Monitoring
Version: 2.0.0
"""

import os
import sys
import json
import time
import argparse
import torch
import numpy as np
from typing import Dict, Any, Optional, List
from datetime import datetime

# ============================================================================
# IMPORTS AVEC FALLBACK
# ============================================================================

UNSLOTH_AVAILABLE = False
TRL_AVAILABLE = False
TRANSFORMERS_AVAILABLE = False

try:
    from unsloth import FastLanguageModel
    from unsloth import is_bfloat16_supported
    UNSLOTH_AVAILABLE = True
    print("✅ Unsloth loaded")
except ImportError:
    print("⚠️ Unsloth not available")

try:
    from trl import SFTTrainer
    TRL_AVAILABLE = True
    print("✅ TRL loaded")
except ImportError:
    print("⚠️ TRL not available")

try:
    import transformers
    from transformers import TrainingArguments
    TRANSFORMERS_AVAILABLE = True
    print(f"✅ Transformers {transformers.__version__} loaded")
except ImportError:
    print("❌ Transformers not available")

# ============================================================================
# CLASSES DE CONFIGURATION
# ============================================================================

class TrainingConfig:
    """Configuration centralisée"""
    
    # Modèle
    BASE_MODEL: str = "unsloth/phi-4"
    MAX_SEQ_LENGTH: int = 2048
    
    # Quantification
    USE_4BIT: bool = True
    BNB_4BIT_COMPUTE_DTYPE: str = "float16"
    BNB_4BIT_QUANT_TYPE: str = "nf4"
    
    # LoRA
    LORA_RANK: int = 16
    LORA_ALPHA: int = 16
    LORA_DROPOUT: float = 0.0
    USE_RSLORA: bool = True
    TARGET_MODULES: List[str] = [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj"
    ]
    
    # Entraînement
    BATCH_SIZE: int = 2
    GRADIENT_ACCUMULATION_STEPS: int = 4
    NUM_EPOCHS: int = 3
    LEARNING_RATE: float = 2e-4
    WARMUP_STEPS: int = 5
    WEIGHT_DECAY: float = 0.01
    OPTIMIZER: str = "adamw_8bit"
    LR_SCHEDULER: str = "linear"
    
    # Monitoring
    LOGGING_STEPS: int = 1
    EVAL_STEPS: int = 50
    SAVE_STEPS: int = 100
    GRADIENT_CHECKPOINTING: bool = True
    EARLY_STOPPING_PATIENCE: int = 3
    EARLY_STOPPING_THRESHOLD: float = 0.001
    
    # Export
    USE_DYNAMIC_QUANTIZATION: bool = True
    
    @classmethod
    def from_dict(cls, config: Dict[str, Any]):
        for key, value in config.items():
            if hasattr(cls, key):
                setattr(cls, key, value)
        return cls
    
    @classmethod
    def from_yaml(cls, path: str):
        try:
            import yaml
            with open(path, 'r') as f:
                config = yaml.safe_load(f)
                
            # Modèle
            if 'model' in config:
                cls.BASE_MODEL = config['model'].get('base', cls.BASE_MODEL)
                cls.MAX_SEQ_LENGTH = config['model'].get('max_seq_length', cls.MAX_SEQ_LENGTH)
                cls.USE_4BIT = config['model'].get('use_4bit', cls.USE_4BIT)
            
            # LoRA
            if 'lora' in config:
                cls.LORA_RANK = config['lora'].get('rank', cls.LORA_RANK)
                cls.LORA_ALPHA = config['lora'].get('alpha', cls.LORA_ALPHA)
                cls.USE_RSLORA = config['lora'].get('use_rslora', cls.USE_RSLORA)
                if 'target_modules' in config['lora']:
                    cls.TARGET_MODULES = config['lora']['target_modules']
            
            # Entraînement
            if 'training' in config:
                cls.BATCH_SIZE = config['training'].get('batch_size', cls.BATCH_SIZE)
                cls.NUM_EPOCHS = config['training'].get('num_epochs', cls.NUM_EPOCHS)
                cls.LEARNING_RATE = config['training'].get('learning_rate', cls.LEARNING_RATE)
            
            return cls
        except Exception as e:
            print(f"⚠️ Could not load config from {path}: {e}")
            return cls()

# ============================================================================
# METRICS TRACKER
# ============================================================================

class MetricsTracker:
    """Suivi des métriques avec early stopping"""
    
    def __init__(self, patience: int = 3, threshold: float = 0.001):
        self.patience = patience
        self.threshold = threshold
        self.best_loss = float('inf')
        self.counter = 0
        self.history: List[Dict] = []
        self.gradient_norms: List[float] = []
        
    def update(self, loss: float, grad_norm: Optional[float] = None, step: int = 0) -> bool:
        """Update et retourne True si early stopping"""
        
        self.history.append({
            'loss': loss,
            'grad_norm': grad_norm,
            'step': step,
            'timestamp': time.time()
        })
        
        if grad_norm is not None:
            self.gradient_norms.append(grad_norm)
        
        # Early stopping check
        if loss < self.best_loss - self.threshold:
            self.best_loss = loss
            self.counter = 0
            return False
        else:
            self.counter += 1
            if self.counter >= self.patience:
                print(f"\n🛑 Early stopping triggered at step {step} (loss: {loss:.4f})")
                return True
        
        # Overfitting warning
        if grad_norm is not None and grad_norm < 0.05 and loss < 0.1:
            print(f"⚠️ Potential overfitting: grad_norm={grad_norm:.4f}, loss={loss:.4f}")
        
        return False
    
    def get_summary(self) -> Dict[str, Any]:
        return {
            'best_loss': self.best_loss,
            'final_loss': self.history[-1]['loss'] if self.history else None,
            'converged': self.counter < self.patience,
            'total_steps': len(self.history)
        }

# ============================================================================
# DATA FORMATTING
# ============================================================================

def format_chatml(example: Dict) -> str:
    """Format ChatML pour l'entraînement"""
    system = example.get('system', 'Tu es un expert technique en centrale électrique.')
    user = example.get('instruction', example.get('input', ''))
    assistant = example.get('output', '')
    
    return f"<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n{assistant}<|im_end|>"

def format_alpaca(example: Dict) -> str:
    """Format Alpaca"""
    instruction = example.get('instruction', '')
    input_text = example.get('input', '')
    output = example.get('output', '')
    
    if input_text:
        return f"Below is an instruction that describes a task, paired with an input that provides further context. Write a response that appropriately completes the request.\n\n### Instruction:\n{instruction}\n\n### Input:\n{input_text}\n\n### Response:\n{output}"
    else:
        return f"Below is an instruction that describes a task. Write a response that appropriately completes the request.\n\n### Instruction:\n{instruction}\n\n### Response:\n{output}"

# ============================================================================
# TRAINER PRINCIPAL
# ============================================================================

class RealTrainer:
    """Entraîneur réel avec toutes les optimisations"""
    
    def __init__(self, config: Optional[TrainingConfig] = None):
        self.config = config or TrainingConfig()
        self.model = None
        self.tokenizer = None
        self.metrics_tracker = MetricsTracker(
            patience=self.config.EARLY_STOPPING_PATIENCE,
            threshold=self.config.EARLY_STOPPING_THRESHOLD
        )
        
    def load_model(self):
        """Charge le modèle avec les optimisations"""
        
        print(f"\n{'='*60}")
        print(f"🚀 Loading model: {self.config.BASE_MODEL}")
        print(f"{'='*60}")
        
        if UNSLOTH_AVAILABLE:
            self.model, self.tokenizer = FastLanguageModel.from_pretrained(
                model_name=self.config.BASE_MODEL,
                max_seq_length=self.config.MAX_SEQ_LENGTH,
                dtype=None,
                load_in_4bit=self.config.USE_4BIT,
            )
            print("✅ Model loaded with Unsloth (optimized)")
        else:
            raise RuntimeError("Unsloth is required for real training. Please install: pip install unsloth")
        
        return self.model, self.tokenizer
    
    def setup_lora(self):
        """Configure LoRA avec rsLoRA"""
        
        print(f"\n🔧 Setting up LoRA (rank={self.config.LORA_RANK}, rsLoRA={self.config.USE_RSLORA})")
        
        self.model = FastLanguageModel.get_peft_model(
            self.model,
            r=self.config.LORA_RANK,
            target_modules=self.config.TARGET_MODULES,
            lora_alpha=self.config.LORA_ALPHA,
            lora_dropout=self.config.LORA_DROPOUT,
            bias="none",
            use_gradient_checkpointing=self.config.GRADIENT_CHECKPOINTING,
            random_state=3407,
            use_rslora=self.config.USE_RSLORA,
        )
        
        # Statistiques
        trainable_params = sum(p.numel() for p in self.model.parameters() if p.requires_grad)
        total_params = sum(p.numel() for p in self.model.parameters())
        
        print(f"📊 LoRA Statistics:")
        print(f"   - Trainable params: {trainable_params:,} ({100 * trainable_params / total_params:.2f}%)")
        print(f"   - Total params: {total_params:,}")
        
        return self.model
    
    def train(self, dataset_path: str, output_dir: str) -> Dict[str, Any]:
        """Exécute l'entraînement complet"""
        
        start_time = time.time()
        
        print(f"\n{'='*60}")
        print(f"🏋️ STARTING REAL TRAINING")
        print(f"{'='*60}")
        print(f"📁 Dataset: {dataset_path}")
        print(f"📁 Output: {output_dir}")
        print(f"⚙️ Config: {self.config.__dict__}")
        print(f"{'='*60}\n")
        
        # 1. Chargement
        self.load_model()
        
        # 2. Configuration LoRA
        self.setup_lora()
        
        # 3. Chargement dataset
        from datasets import load_dataset
        
        dataset = load_dataset('json', data_files=dataset_path, split='train')
        
        def format_func(examples):
            texts = []
            for i in range(len(examples['instruction'] if 'instruction' in examples else examples['input'])):
                example = {
                    'instruction': examples.get('instruction', [''])[i] if 'instruction' in examples else examples.get('input', [''])[i],
                    'input': examples.get('input', [''])[i] if 'input' in examples else '',
                    'output': examples.get('output', [''])[i],
                }
                text = format_chatml(example)
                texts.append(text)
            return {"text": texts}
        
        dataset = dataset.map(format_func, batched=True)
        
        # Split train/validation
        if len(dataset) > 100:
            split_dataset = dataset.train_test_split(test_size=0.1, seed=42)
            train_dataset = split_dataset['train']
            eval_dataset = split_dataset['test']
        else:
            train_dataset = dataset
            eval_dataset = None
        
        print(f"📊 Dataset: {len(train_dataset)} train samples, {len(eval_dataset) if eval_dataset else 0} eval samples")
        
        # 4. Configuration entraîneur
        training_args = TrainingArguments(
            output_dir=output_dir,
            per_device_train_batch_size=self.config.BATCH_SIZE,
            per_device_eval_batch_size=self.config.BATCH_SIZE,
            gradient_accumulation_steps=self.config.GRADIENT_ACCUMULATION_STEPS,
            warmup_steps=self.config.WARMUP_STEPS,
            num_train_epochs=self.config.NUM_EPOCHS,
            learning_rate=self.config.LEARNING_RATE,
            fp16=self.config.USE_4BIT and torch.cuda.is_available(),
            bf16=not self.config.USE_4BIT and torch.cuda.is_bf16_supported(),
            logging_steps=self.config.LOGGING_STEPS,
            evaluation_strategy="steps" if eval_dataset else "no",
            eval_steps=self.config.EVAL_STEPS if eval_dataset else None,
            save_strategy="steps",
            save_steps=self.config.SAVE_STEPS,
            load_best_model_at_end=True if eval_dataset else False,
            metric_for_best_model="eval_loss" if eval_dataset else None,
            greater_is_better=False,
            push_to_hub=False,
            report_to="none",
            optim=self.config.OPTIMIZER,
            lr_scheduler_type=self.config.LR_SCHEDULER,
            weight_decay=self.config.WEIGHT_DECAY,
            gradient_checkpointing=self.config.GRADIENT_CHECKPOINTING,
            save_total_limit=2,
            remove_unused_columns=False,
        )
        
        # 5. Callback pour monitoring
        class GradientMonitorCallback:
            def __init__(self, metrics_tracker):
                self.metrics_tracker = metrics_tracker
                
            def on_log(self, args, state, control, logs=None, **kwargs):
                if logs:
                    loss = logs.get('loss', None)
                    grad_norm = logs.get('grad_norm', None)
                    if loss:
                        should_stop = self.metrics_tracker.update(loss, grad_norm, state.global_step)
                        if should_stop:
                            control.should_training_stop = True
        
        # 6. Entraînement
        trainer = SFTTrainER(
            model=self.model,
            tokenizer=self.tokenizer,
            train_dataset=train_dataset,
            eval_dataset=eval_dataset,
            dataset_text_field="text",
            max_seq_length=self.config.MAX_SEQ_LENGTH,
            args=training_args,
            callbacks=[GradientMonitorCallback(self.metrics_tracker)],
        )
        
        print("\n🚀 Starting training loop...")
        train_result = trainer.train()
        
        # 7. Sauvegarde
        print("\n💾 Saving final model...")
        trainer.save_model(output_dir)
        self.tokenizer.save_pretrained(output_dir)
        
        # 8. Export GGUF avec Dynamic Quantization
        if self.config.USE_DYNAMIC_QUANTIZATION:
            try:
                print("\n📦 Exporting to GGUF with Dynamic Quantization...")
                self.model.save_pretrained_gguf(
                    f"{output_dir}_gguf",
                    self.tokenizer,
                    quantization_method="dynamic_v2_0"
                )
                print("✅ GGUF export completed")
            except Exception as e:
                print(f"⚠️ GGUF export failed: {e}")
        
        # 9. Résultats
        training_time = time.time() - start_time
        metrics_summary = self.metrics_tracker.get_summary()
        
        results = {
            'success': True,
            'train_loss': float(train_result.training_loss),
            'train_steps': train_result.global_step,
            'training_time': training_time,
            'output_dir': output_dir,
            'config': {
                'lora_rank': self.config.LORA_RANK,
                'use_rslora': self.config.USE_RSLORA,
                'num_epochs': self.config.NUM_EPOCHS,
                'learning_rate': self.config.LEARNING_RATE,
            },
            'early_stopping': not metrics_summary['converged'],
            'best_loss': metrics_summary['best_loss'],
        }
        
        print(f"\n{'='*60}")
        print(f"✅ TRAINING COMPLETED")
        print(f"   - Final loss: {results['train_loss']:.4f}")
        print(f"   - Training time: {training_time:.1f}s")
        print(f"   - Output: {output_dir}")
        print(f"{'='*60}\n")
        
        return results

# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description='Real training for LLMs')
    parser.add_argument('--dataset', type=str, required=True, help='Path to dataset JSONL file')
    parser.add_argument('--output', type=str, required=True, help='Output directory')
    parser.add_argument('--config', type=str, help='Path to config YAML file')
    parser.add_argument('--model', type=str, default='unsloth/phi-4', help='Base model name')
    parser.add_argument('--epochs', type=int, default=3, help='Number of epochs')
    parser.add_argument('--lora_rank', type=int, default=16, help='LoRA rank')
    parser.add_argument('--use_rslora', action='store_true', help='Use rsLoRA')
    parser.add_argument('--no_4bit', action='store_true', help='Disable 4-bit quantization')
    
    args = parser.parse_args()
    
    # Configuration
    config = TrainingConfig()
    config.BASE_MODEL = args.model
    config.NUM_EPOCHS = args.epochs
    config.LORA_RANK = args.lora_rank
    config.USE_RSLORA = args.use_rslora
    config.USE_4BIT = not args.no_4bit
    
    if args.config:
        config = TrainingConfig.from_yaml(args.config)
    
    # Entraînement
    trainer = RealTrainer(config)
    results = trainer.train(args.dataset, args.output)
    
    # Sauvegarde résultats
    with open(f"{args.output}/training_results.json", 'w') as f:
        json.dump(results, f, indent=2)
    
    # Sortie JSON pour consommation TypeScript
    print(json.dumps(results))

if __name__ == "__main__":
    main()