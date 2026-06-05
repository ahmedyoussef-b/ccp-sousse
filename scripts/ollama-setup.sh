# scripts/ollama-setup.sh
# Script d'installation et configuration d'Ollama

#!/bin/bash

echo "🔧 Configuration d'Ollama pour CCP"

# Détection de l'OS
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    echo "🪟 Windows détecté"
    OLLAMA_DIR="$USERPROFILE/.ollama/models"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 macOS détecté"
    OLLAMA_DIR="$HOME/.ollama/models"
else
    echo "🐧 Linux détecté"
    OLLAMA_DIR="$HOME/.ollama/models"
fi

echo "📁 Dossier des modèles Ollama: $OLLAMA_DIR"

# Créer le dossier s'il n'existe pas
mkdir -p "$OLLAMA_DIR"

# Vérifier si Ollama est installé
if ! command -v ollama &> /dev/null; then
    echo "⚠️ Ollama n'est pas installé"
    echo "📥 Installation en cours..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        curl -fsSL https://ollama.com/install.sh | sh
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
        echo "Téléchargez Ollama depuis: https://ollama.com/download"
        echo "Puis exécutez 'ollama serve' dans un terminal administrateur"
    else
        curl -fsSL https://ollama.com/install.sh | sh
    fi
fi

# Démarrer le service Ollama
echo "🚀 Démarrage d'Ollama..."
ollama serve &

# Attendre que le service soit prêt
sleep 3

# Vérifier le statut
if ollama list &> /dev/null; then
    echo "✅ Ollama est opérationnel"
    echo "📍 Modèles stockés dans: $OLLAMA_DIR"
else
    echo "⚠️ Problème de connexion à Ollama"
fi

# Créer un lien symbolique vers le dossier de l'application (optionnel)
APP_MODELS_DIR="./data/models/ollama_link"
mkdir -p "$APP_MODELS_DIR"

if [[ "$OSTYPE" != "msys" ]] && [[ "$OSTYPE" != "win32" ]]; then
    ln -sf "$OLLAMA_DIR" "$APP_MODELS_DIR"
    echo "🔗 Lien créé: $APP_MODELS_DIR -> $OLLAMA_DIR"
fi

echo ""
echo "✨ Configuration terminée !"
echo "💡 Commandes utiles:"
echo "   ollama list                  # Lister les modèles"
echo "   ollama run <model>           # Utiliser un modèle"
echo "   ollama rm <model>            # Supprimer un modèle"