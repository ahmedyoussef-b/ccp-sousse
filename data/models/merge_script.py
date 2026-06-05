
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

# Charger le modèle de base
base_model = AutoModelForCausalLM.from_pretrained(
    "unsloth/distilgpt2",
    torch_dtype=torch.float16,
    device_map="auto"
)
tokenizer = AutoTokenizer.from_pretrained("unsloth/distilgpt2")

# Charger et fusionner LoRA
model = PeftModel.from_pretrained(base_model, "C:\ahmed\ccp\data\models\extracted")
merged_model = model.merge_and_unload()

# Sauvegarder
merged_model.save_pretrained("C:\ahmed\ccp\data\models\merged\ccp_model")
tokenizer.save_pretrained("C:\ahmed\ccp\data\models\merged\ccp_model")
print("Fusion terminée")
