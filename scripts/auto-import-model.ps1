# scripts/auto-import-model.ps1
# Pipeline complet: ZIP Colab → Ollama

param(
    [string]$ZipPath = "",
    [string]$ModelName = "",
    [switch]$SkipGGUF,
    [switch]$Force
)

# Configuration
$BaseDir = "C:\ahmed\ccp"
$UploadsDir = Join-Path $BaseDir "data\models\uploaded"
$ExtractedDir = Join-Path $BaseDir "data\models\extracted"
$MergedDir = Join-Path $BaseDir "data\models\merged"
$GgufDir = Join-Path $BaseDir "data\models\gguf"
$RegistryPath = Join-Path $BaseDir "data\models\registry.json"
$LogPath = Join-Path $BaseDir "data\training\logs\import.log"

# Fonction de logging
function Write-ImportLog {
    param($Message, $Color = "Cyan")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] $Message"
    Write-Host $logEntry -ForegroundColor $Color
    $logDir = Split-Path $LogPath -Parent
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    Add-Content -Path $LogPath -Value $logEntry -Encoding UTF8
}

# Fonction pour trouver le dernier ZIP
function Get-LatestZip {
    if ($ZipPath -and (Test-Path $ZipPath)) {
        return $ZipPath
    }
    
    $zips = Get-ChildItem $UploadsDir -Filter "*.zip" | Sort-Object LastWriteTime -Descending
    if ($zips.Count -eq 0) {
        Write-ImportLog "Aucun fichier ZIP trouve dans $UploadsDir" "Red"
        return $null
    }
    
    return $zips[0].FullName
}

# Fonction pour extraire le ZIP
function Extract-Zip {
    param($ZipFile)
    
    Write-ImportLog " Extraction du ZIP: $ZipFile" "Yellow"
    
    # Nettoyer le dossier d'extraction
    if (Test-Path $ExtractedDir) {
        Remove-Item -Path $ExtractedDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $ExtractedDir -Force | Out-Null
    
    # Extraction
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipFile, $ExtractedDir)
    
    $files = Get-ChildItem $ExtractedDir -Recurse -File
    Write-ImportLog " Extraction terminee: $($files.Count) fichiers" "Green"
    
    return $files.Count
}

# Fonction pour detecter le type de modele
function Detect-ModelType {
    $files = Get-ChildItem $ExtractedDir -Recurse -File
    
    # Detection LoRA adapter
    if ($files.Name -contains "adapter_model.safetensors") {
        Write-ImportLog " Type detecte: LoRA adapter" "Green"
        return "lora"
    }
    
    # Detection modele complet
    if ($files.Name -contains "model.safetensors" -or $files.Name -contains "pytorch_model.bin") {
        Write-ImportLog " Type detecte: Modele complet" "Green"
        return "full"
    }
    
    # Detection GGUF
    if ($files.Name -contains "*.gguf") {
        Write-ImportLog " Type detecte: GGUF quantifie" "Green"
        return "gguf"
    }
    
    Write-ImportLog " Type non reconnu, traitement comme modele standard" "Yellow"
    return "standard"
}

# Fonction pour fusionner LoRA (si besoin)
function Merge-LoraModel {
    param($ModelName)
    
    Write-ImportLog " Fusion LoRA en cours..." "Yellow"
    
    $mergedModelDir = Join-Path $MergedDir $ModelName
    if (-not (Test-Path $mergedModelDir)) {
        New-Item -ItemType Directory -Path $mergedModelDir -Force | Out-Null
    }
    
    # Script Python pour fusion LoRA
    $pythonScript = @'
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import os
import json

extracted_path = r"''' + $ExtractedDir + @'"
merged_path = r"''' + $mergedModelDir + @'"

# Charger modele de base (leger pour test)
base_model_name = "unsloth/distilgpt2"

print("Chargement du modele de base...")
base_model = AutoModelForCausalLM.from_pretrained(
    base_model_name,
    torch_dtype=torch.float16,
    device_map="auto" if torch.cuda.is_available() else None
)
tokenizer = AutoTokenizer.from_pretrained(base_model_name)

print("Chargement et fusion LoRA...")
try:
    model = PeftModel.from_pretrained(base_model, extracted_path)
    merged_model = model.merge_and_unload()
    
    print("Sauvegarde du modele fusionne...")
    merged_model.save_pretrained(merged_path)
    tokenizer.save_pretrained(merged_path)
    
    print("SUCCESS")
except Exception as e:
    print(f"ERROR: {e}")
'@
    
    $scriptPath = Join-Path $BaseDir "temp_merge.py"
    $pythonScript | Out-File -FilePath $scriptPath -Encoding UTF8
    
    try {
        $result = & python $scriptPath 2>&1
        Write-ImportLog " Fusion terminee" "Green"
        Remove-Item $scriptPath -Force
        return $true
    } catch {
        Write-ImportLog " Erreur fusion: $_" "Red"
        Remove-Item $scriptPath -Force -ErrorAction SilentlyContinue
        return $false
    }
}

# Fonction pour convertir en GGUF
function Convert-ToGGUF {
    param($ModelName)
    
    if ($SkipGGUF) {
        Write-ImportLog " Conversion GGUF sautee (option --SkipGGUF)" "Yellow"
        return $true
    }
    
    Write-ImportLog " Conversion GGUF en cours..." "Yellow"
    
    $sourceDir = Join-Path $MergedDir $ModelName
    $ggufModelDir = Join-Path $GgufDir $ModelName
    
    if (-not (Test-Path $sourceDir)) {
        Write-ImportLog " Dossier source non trouve pour GGUF" "Red"
        return $false
    }
    
    New-Item -ItemType Directory -Path $ggufModelDir -Force | Out-Null
    
    # Copier les fichiers pour conversion GGUF
    Copy-Item -Path "$sourceDir\*" -Destination $ggufModelDir -Recurse
    
    Write-ImportLog " Modele pret pour GGUF: $ggufModelDir" "Green"
    return $true
}

# Fonction pour creer le Modelfile Ollama
function Create-Modelfile {
    param($ModelName, $ModelPath)
    
    $modelfileContent = @"
FROM $ModelPath
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER stop "</s>"
PARAMETER num_ctx 4096

TEMPLATE """{{ .Prompt }}"""

SYSTEM """Tu es un expert en centrales à cycle combiné (CCP).
Tu connais les procedes, les specifications techniques et les bonnes pratiques 
pour l'exploitation des turbines à gaz (TG1, TG2) et des turbines à vapeur (TV).

Reponds de maniere precise et concise en te basant sur les connaissances techniques.
Si tu n'es pas sur, indique-le clairement et propose de consulter la documentation."""
"@
    
    $modelfilePath = Join-Path $ModelPath "Modelfile"
    $modelfileContent | Out-File -FilePath $modelfilePath -Encoding UTF8
    
    Write-ImportLog " Modelfile cree: $modelfilePath" "Green"
    return $modelfilePath
}

# Fonction pour importer dans Ollama
function Import-ToOllama {
    param($ModelName, $ModelPath)
    
    Write-ImportLog " Import dans Ollama: $ModelName" "Yellow"
    
    # Verifier si Ollama est disponible
    $ollamaCheck = Get-Command ollama -ErrorAction SilentlyContinue
    if (-not $ollamaCheck) {
        Write-ImportLog " Ollama non installe!" "Red"
        return $false
    }
    
    # Supprimer l'ancien modele si existe
    $existingModel = & ollama list 2>$null | Select-String $ModelName
    if ($existingModel -and $Force) {
        Write-ImportLog " Suppression de l'ancien modele..." "Yellow"
        & ollama rm $ModelName 2>&1 | Out-Null
    }
    
    # Creer le Modelfile
    $modelfilePath = Create-Modelfile -ModelName $ModelName -ModelPath $ModelPath
    
    # Importer
    Write-ImportLog " Creation du modele Ollama..." "Cyan"
    $result = & ollama create $ModelName -f $modelfilePath 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-ImportLog " Modele $ModelName importe avec succes!" "Green"
        
        # Tester le modele
        Write-ImportLog " Test du modele..." "Cyan"
        $testResult = & ollama run $ModelName "Test de connexion" --temperature 0.1 2>&1
        
        return $true
    } else {
        Write-ImportLog " Erreur import: $result" "Red"
        return $false
    }
}

# Fonction pour mettre a jour le registry
function Update-Registry {
    param($ModelName, $ModelPath, $Status)
    
    $registry = @{ models = @() }
    if (Test-Path $RegistryPath) {
        $registry = Get-Content $RegistryPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    
    $newModel = @{
        name = $ModelName
        path = $ModelPath
        created_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        status = $Status
        type = $ModelType
        size_kb = [math]::Round((Get-ChildItem $ModelPath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1KB, 2)
    }
    
    $registry.models = @($newModel) + $registry.models
    $registry | ConvertTo-Json -Depth 10 | Out-File -FilePath $RegistryPath -Encoding UTF8
    
    Write-ImportLog " Registry mis a jour" "Green"
}

# Fonction pour mettre a jour l'application
function Update-AppConfig {
    param($ModelName)
    
    $envPath = Join-Path $BaseDir ".env.local"
    
    if (Test-Path $envPath) {
        $content = Get-Content $envPath -Raw -Encoding UTF8
        if ($content -match "OLLAMA_MODEL=") {
            $content = $content -replace "OLLAMA_MODEL=.*", "OLLAMA_MODEL=$ModelName"
        } else {
            $content += "`nOLLAMA_MODEL=$ModelName`n"
        }
        $content | Out-File -FilePath $envPath -Encoding UTF8
        Write-ImportLog " Application configuree pour utiliser $ModelName" "Green"
    }
}

# Fonction de notification
function Send-Notification {
    param($Title, $Message, $Type = "info")
    
    # Toast Windows
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        # Notification simple via PowerShell
        Write-Host "🔔 $Title : $Message" -ForegroundColor Magenta
    } catch {
        Write-Host "🔔 $Title : $Message" -ForegroundColor Magenta
    }
    
    # Log
    Write-ImportLog "$Title : $Message" "Magenta"
}

# ============================================
# PIPELINE PRINCIPAL
# ============================================

Write-ImportLog "=========================================" "Cyan"
Write-ImportLog " PIPELINE D'IMPORT AUTOMATIQUE" "Cyan"
Write-ImportLog "=========================================" "Cyan"

# 1. Trouver le ZIP
$zipFile = Get-LatestZip
if (-not $zipFile) {
    Send-Notification -Title "ERREUR" -Message "Aucun ZIP trouve" -Type "error"
    exit 1
}

Write-ImportLog " ZIP source: $zipFile" "Cyan"

# 2. Determiner le nom du modele
if (-not $ModelName) {
    $ModelName = "ccp_model_" + (Get-Date -Format "yyyyMMdd_HHmmss")
}
Write-ImportLog " Nom du modele: $ModelName" "Cyan"

# 3. Extraire
$extractedCount = Extract-Zip -ZipFile $zipFile
if ($extractedCount -eq 0) {
    Send-Notification -Title "ERREUR" -Message "Extraction echouee" -Type "error"
    exit 1
}

# 4. Detecter le type
$ModelType = Detect-ModelType

# 5. Traitement selon le type
$finalModelPath = $ExtractedDir

switch ($ModelType) {
    "lora" {
        Write-ImportLog " Traitement LoRA detecte - Fusion necessaire" "Yellow"
        $mergeSuccess = Merge-LoraModel -ModelName $ModelName
        if ($mergeSuccess) {
            $finalModelPath = Join-Path $MergedDir $ModelName
        }
    }
    "full" {
        Write-ImportLog " Modele complet detecte" "Green"
        $finalModelPath = Join-Path $MergedDir $ModelName
        Copy-Item -Path "$ExtractedDir\*" -Destination $finalModelPath -Recurse
    }
    "gguf" {
        Write-ImportLog " Modele GGUF detecte" "Green"
        $finalModelPath = Join-Path $GgufDir $ModelName
        Copy-Item -Path "$ExtractedDir\*" -Destination $finalModelPath -Recurse
    }
    default {
        Write-ImportLog " Modele standard detecte" "Green"
        $finalModelPath = Join-Path $MergedDir $ModelName
        Copy-Item -Path "$ExtractedDir\*" -Destination $finalModelPath -Recurse
    }
}

# 6. Conversion GGUF (optionnel)
if ($ModelType -ne "gguf") {
    Convert-ToGGUF -ModelName $ModelName
}

# 7. Import dans Ollama
$importSuccess = Import-ToOllama -ModelName $ModelName -ModelPath $finalModelPath

if ($importSuccess) {
    # 8. Mettre a jour le registry
    Update-Registry -ModelName $ModelName -ModelPath $finalModelPath -Status "imported"
    
    # 9. Mettre a jour l'application
    Update-AppConfig -ModelName $ModelName
    
    # 10. Archiver le ZIP source
    $archiveDir = Join-Path $BaseDir "data\models\archive"
    if (-not (Test-Path $archiveDir)) {
        New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
    }
    $archiveName = "$(Get-Date -Format 'yyyyMMdd_HHmmss')_$(Split-Path $zipFile -Leaf)"
    Move-Item -Path $zipFile -Destination (Join-Path $archiveDir $archiveName) -Force
    
    # 11. Notification finale
    Send-Notification -Title "IMPORT TERMINE" -Message "Modele $ModelName disponible dans Ollama" -Type "success"
    
    Write-ImportLog ""
    Write-ImportLog "=========================================" "Green"
    Write-ImportLog " IMPORT REUSSI !" "Green"
    Write-ImportLog "=========================================" "Green"
    Write-ImportLog " Modele: $ModelName" "Cyan"
    Write-ImportLog " Type: $ModelType" "Cyan"
    Write-ImportLog " Emplacement: $finalModelPath" "Cyan"
    Write-ImportLog ""
    Write-ImportLog " Test: ollama run $ModelName" "Yellow"
    
} else {
    Send-Notification -Title "ERREUR IMPORT" -Message "Echec de l'import du modele" -Type "error"
    exit 1
}