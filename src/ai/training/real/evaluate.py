# Evaluation script for AI models
#!/usr/bin/env python3
"""
evaluate.py - Évaluation réelle des modèles fine-tunés
Mesure: Accuracy, Hallucination Rate, Instruction Following
Version: 2.0.0
"""

import json
import argparse
import torch
from typing import Dict, List, Any, Optional
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

class ModelEvaluator:
    """Évaluateur de modèles fine-tunés"""
    
    def __init__(self, base_model: str, lora_path: Optional[str] = None):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        print(f"🔧 Loading model on {self.device}")
        
        self.tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
        self.model = AutoModelForCausalLM.from_pretrained(
            base_model,
            torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            device_map="auto" if self.device == "cuda" else None,
            trust_remote_code=True,
        )
        
        if lora_path:
            print(f"🔧 Loading LoRA adapter from {lora_path}")
            self.model = PeftModel.from_pretrained(self.model, lora_path)
        
        self.model.eval()
        
        # Métriques
        self.correct = 0
        self.total = 0
        self.hallucinations = 0
        self.instructions_followed = 0
        
    def generate(self, prompt: str, max_new_tokens: int = 256) -> str:
        """Génère une réponse"""
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=0.1,
                do_sample=True,
                top_p=0.9,
                repetition_penalty=1.1,
            )
        
        response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
        return response[len(prompt):].strip()
    
    def evaluate_single(self, instruction: str, expected: str) -> Dict[str, Any]:
        """Évalue un seul exemple"""
        response = self.generate(instruction)
        
        # Vérification exactitude
        is_correct = expected.lower() in response.lower()
        
        # Détection hallucination
        hallucination_keywords = ['je pense', 'peut-être', 'supposons', 'à mon avis', 'selon moi']
        has_hallucination = any(kw in response.lower() for kw in hallucination_keywords)
        
        # Vérification suivi instruction
        follows_instruction = len(response) > 20 and not response.startswith("Désolé")
        
        return {
            'instruction': instruction,
            'expected': expected,
            'response': response,
            'is_correct': is_correct,
            'has_hallucination': has_hallucination,
            'follows_instruction': follows_instruction
        }
    
    def evaluate(self, test_data: List[Dict]) -> Dict[str, float]:
        """Évalue tout le dataset"""
        
        results = []
        
        for example in test_data:
            instruction = example.get('instruction', example.get('input', ''))
            expected = example.get('output', '')
            
            if not instruction or not expected:
                continue
            
            result = self.evaluate_single(instruction, expected)
            results.append(result)
            
            self.total += 1
            if result['is_correct']:
                self.correct += 1
            if result['has_hallucination']:
                self.hallucinations += 1
            if result['follows_instruction']:
                self.instructions_followed += 1
        
        return {
            'accuracy': self.correct / self.total if self.total > 0 else 0,
            'hallucination_rate': self.hallucinations / self.total if self.total > 0 else 0,
            'instruction_following': self.instructions_followed / self.total if self.total > 0 else 0,
            'total_samples': self.total,
            'detailed_results': results[:10]  # Limite pour la sortie
        }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base_model', type=str, required=True, help='Base model name')
    parser.add_argument('--lora_path', type=str, help='Path to LoRA adapter')
    parser.add_argument('--test_data', type=str, required=True, help='Path to test data JSON')
    parser.add_argument('--output', type=str, default='evaluation_results.json', help='Output file')
    
    args = parser.parse_args()
    
    with open(args.test_data, 'r') as f:
        test_data = json.load(f)
    
    evaluator = ModelEvaluator(args.base_model, args.lora_path)
    results = evaluator.evaluate(test_data)
    
    print(f"\n{'='*60}")
    print(f"📊 EVALUATION RESULTS")
    print(f"{'='*60}")
    print(f"   - Accuracy: {results['accuracy']*100:.1f}%")
    print(f"   - Hallucination Rate: {results['hallucination_rate']*100:.1f}%")
    print(f"   - Instruction Following: {results['instruction_following']*100:.1f}%")
    print(f"   - Total Samples: {results['total_samples']}")
    print(f"{'='*60}\n")
    
    with open(args.output, 'w') as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    main()