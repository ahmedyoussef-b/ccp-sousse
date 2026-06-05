
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model = AutoModelForCausalLM.from_pretrained("C:\ahmed\ccp\data\models\merged\ccp_model")
tokenizer = AutoTokenizer.from_pretrained("C:\ahmed\ccp\data\models\merged\ccp_model")

# Sauvegarder en format safetensors pour conversion GGUF
model.save_pretrained("C:\ahmed\ccp\data\models\gguf\ccp_model")
tokenizer.save_pretrained("C:\ahmed\ccp\data\models\gguf\ccp_model")
print("Prêt pour conversion GGUF")
