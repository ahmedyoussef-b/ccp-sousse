# 🚀 Capacités du Système CCP

> Dernière mise à jour : 2026-05-07

---

## 💬 Accessible via le Chat (Commandes Slash)

| Commande | Description | API Appelée |
|----------|-------------|-------------|
| `/search-similar <texte>` | Recherche des images similaires par description | `api/vision/search` |
| `/diagnose <description>` | Active le diagnostic IA industriel | `api/vision/diagnose` |
| `/stitch` | Mode assemblage panoramique d'images | `api/vision/panorama` |
| `/add-reference` | Mode enregistrement d'image de référence | `api/vision/register` |
| `/health` | Affiche l'état du système | `api/health` |
| `/help` | Liste toutes les commandes disponibles | - |

---

## 🧠 Accessible via le Chat (Détection Automatique)

| Fonctionnalité | Déclencheur | Module |
|----------------|-------------|--------|
| Cache Sémantique | Toute requête | `ai/cache/semantic-cache.ts` |
| RAG Multi-Zones | Mots-clés techniques | `ai/vector/chromadb-schema.ts` |
| Vision RAG | Mots-clés visuels + analyse active | `lib/services/industrial-vision/vision-rag.service.ts` |
| Enrichissement Vision Intelligent | Requêtes avec intent visuel | `lib/services/vision-integration.service.ts` |
| Toolformer (Actions) | Calculs, résumés | `ai/actions/toolformer-local.ts` |
| Agent Autonome | Missions complexes | `ai/agent/agent-core.ts` |
| Orchestrateur (7ème voix) | Requêtes training/QR | `ai/orchestration/` |
| Contexte Conversationnel | Follow-ups | `ai/orchestration/conversation-context.ts` |
| Prédiction de Suggestions | Après chaque réponse | `ai/actions/predictive-engine.ts` |

---

## 🖼️ Accessible via l'Interface Vision

| Page | Fonctionnalités |
|------|-----------------|
| `/vision` | Gestion des images, recherche, diagnostic |
| `/industrial-vision` | Vision industrielle, analyse pupitres |
| `/industrial-vision/innovations` | Test des innovations (Zero-shot, Few-shot, etc.) |
| `/industrial-vision/rag` | Vision RAG |
| `/industrial-vision/references` | Gestion des images de référence |
| `/banque-images` | Banque d'images IA |

---

## ⚙️ Accessible via l'Interface d'Administration

| Page | Fonctionnalités |
|------|-----------------|
| `/admin` | Administration générale |
| `/admin/documents/...` | Gestion des documents |
| `/admin/logs` | Consultation des logs |
| `/admin/reindex` | Réindexation des données |
| `/admin/vision` | Administration vision |
| `/training` | Entraînement des modèles |
| `/training/dataset-manager` | Gestion des datasets |
| `/training/integration` | Intégration des modèles |
| `/mcp` | Gestion MCP (Model Context Protocol) |
| `/prompts` | Gestion des prompts |
| `/docs` | Documentation |
| `/help` | Aide utilisateur |

---

## 🔌 APIs Backend Principales

| Catégorie | Endpoints |
|-----------|-----------|
| **Chat** | `POST/GET/PUT/DELETE /api/chat` |
| **Vision** | `POST/GET/DELETE /api/vision/*` (search, diagnose, register, folders, images, panorama, assemble, etc.) |
| **Industrial Vision** | `POST /api/industrial-vision/*` (analyze, innovations, rag, reference, stats, tree) |
| **Innovations** | `POST /api/innovations/*` (zero-shot, few-shot, computer-use, dual-consensus, hybrid-search, panoramic, part-matching) |
| **Training** | `POST/GET /api/training/*` (dashboard, dataset, colab, models, versions) |
| **Documents** | `POST/GET/DELETE /api/documents/*` (upload, search, tree, collections, delete) |
| **Agent** | `POST/GET/DELETE /api/agent/*` (dashboard, undo) |
| **Voice** | `POST/GET /api/voice/*` (stt, synthesize, voices) |
| **Admin** | `POST/GET /api/admin/*` (collections, diagnostics, reindex, reset) |
| **Cache** | `POST /api/cache/*` (permanent, train) |
| **Config** | `POST/GET /api/config/*` (active-model, llm-provider) |
| **Health** | `GET /api/health` |
| **WebSocket** | `WS /api/ws` |

---

## 🧩 Modules IA (src/ai)

| Module | Fichiers Clés | Statut |
|--------|---------------|--------|
| **RAG** | `context-assembler.ts`, `intelligent-retriever.ts`, `query-analyzer.ts` | ✅ Intégré |
| **Providers** | `gemini-provider.ts`, `groq-provider.ts`, `ollama-client.ts`, `llm-router.ts` | ✅ Intégré |
| **Cache** | `semantic-cache.ts`, `compression-engine.ts`, `local-embeddings.ts` | ✅ Intégré |
| **Agent** | `agent-core.ts`, `task-planner.ts`, `task-executor.ts` | ✅ Intégré |
| **Orchestration** | `agentic-loop.ts`, `multi-agent-system.ts`, `workflow-orchestrator.ts` | ✅ Intégré |
| **Reasoning** | `analogical.ts`, `counterfactual.ts`, `metacognition.ts`, `dynamic-cot.ts` | 🔄 Partiel |
| **Learning** | `implicit-rl.ts`, `curriculum.ts`, `transfer-learning.ts` | 🔄 Partiel |
| **Innovations** | `zero-shot-anomaly.ts`, `few-shot-defect-trainer.ts`, `panoramic-stitching.ts` | ✅ Intégré |
| **Memory** | `episodic-memory.ts` | ✅ Intégré |
| **Vector** | `chromadb-manager.ts`, `embeddings.ts` | ✅ Intégré |
| **Validation** | `chunk-validator.ts`, `context-validator.ts`, `sequence-validator.ts` | ✅ Intégré |
| **Nominal** | `nominal-agent.ts`, `deduplication.service.ts` | 🔄 À vérifier |

---

## 🎯 Innovations Vision (niveau 1-4)

| # | Innovation | Fichier |
|---|------------|---------|
| 01 | Zero-Shot Anomaly Detection | `01-zero-shot-anomaly.ts` |
| 02 | Computer Use Agent | `02-computer-use-agent.ts` |
| 03 | Dual Consensus Vision | `03-dual-consensus-vision.ts` |
| 04 | Auto Folder Classifier | `04-auto-folder-classifier.ts` |
| 05 | Hybrid Vision Search | `05-hybrid-vision-search.ts` |
| 06 | Few-Shot Defect Trainer | `06-few-shot-defect-trainer.ts` |
| 07 | Panoramic Stitching | `07-panoramic-stitching.ts` |
| 08 | Confidence Feedback | `08-confidence-feedback.ts` |
| 09 | Intelligent Part Matching | `09-intelligent-part-matching.ts` |

---

## 📊 État Global

| Métrique | Valeur |
|----------|--------|
| **Fichiers TypeScript** | ~350+ |
| **APIs Routes** | ~100+ |
| **Composants React** | ~80+ |
| **Modules IA** | 25+ |
| **Innovations Vision** | 9 |
| **Commandes Slash** | 6 |
| **Fichiers `.bak` nettoyés** | 8 |

---

*Document généré automatiquement — mis à jour le 2026-05-07*