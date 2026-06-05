from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import torch

# Chemins
BASE_MODEL = "distilgpt2"
ADAPTER_PATH = "./content/ccp_model"  # Dossier contenant adapter_model.safetensors
OUTPUT_PATH = "./merged_model"

print("🚀 Chargement du modèle de base...")
base_model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL,
    torch_dtype=torch.float32,
)

print("🔧 Chargement du tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
tokenizer.pad_token = tokenizer.eos_token

print("🔗 Fusion de l'adaptateur LoRA...")
model = PeftModel.from_pretrained(base_model, ADAPTER_PATH)

print("💾 Fusion et sauvegarde...")
merged_model = model.merge_and_unload()
merged_model.save_pretrained(OUTPUT_PATH)
tokenizer.save_pretrained(OUTPUT_PATH)

print(f"✅ Modèle fusionné sauvegardé dans {OUTPUT_PATH}")
