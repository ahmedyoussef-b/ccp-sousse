// src/app/docs/page.tsx
'use client';

import { 
  ArrowLeft, 
  BookOpen, 
  Database, 
  UploadCloud, 
  MessageSquare,
  Camera,
  HardDrive,
  Shield,
  Cpu,
  ChevronRight,
  Search,
  User,
  CheckCircle,
  Network,
  Share2
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function DocsPage() {
  const sections = [
    {
      id: 'mindmap',
      title: '🧠 Schémas Mentaux Topologiques',
      icon: Network,
      description: 'Cartographie visuelle de la hiérarchie Zone/Circuit/Paramètre pour une compréhension immédiate des dépendances techniques et physiques.',
      features: [
        'Navigation interactive 2D avec auto-centrage de caméra et auto-zoom intelligents',
        'Recherche en temps réel par label, description et code d\'identification KKS',
        'Surlignage néon du trajet optimal de causalité des ancêtres vers la racine',
        'Mode Focus de branche isolant le sous-système sélectionné (dimming opacité à 15%)',
        'Panneau d\'inspection latérale des métadonnées industrielles avancées (KKS, Unité, Criticité, Formule)',
        'Synchronisation bidirectionnelle directe vers la base de données SQLite opérationnelle'
      ]
    },
    {
      id: 'import-export',
      title: '🔌 Échanges & Import/Export',
      icon: Share2,
      description: 'Bridges de partage et collaboration technique entre les équipes d\'ingénierie et d\'exploitation.',
      features: [
        'Import XML mxGraphModel draw.io (reconstruction automatique des nœuds et des connexions)',
        'Import Miro & XMind CSV (résolution automatique des dépendances par correspondance de labels)',
        'Export Mermaid flowchart TD instantané pour vos documentations techniques vivantes',
        'Export JSON structuré pour le partage inter-équipes et la vectorisation RAG',
        'Assainissement des chaînes (Anti-XSS) et validation de taille de fichier (< 5 Mo)'
      ]
    },
    {
      id: 'chat',
      title: '💬 Chat Intelligent & RAG Topologique',
      icon: MessageSquare,
      description: 'Posez vos questions sur la centrale électrique et obtenez des réponses précises enrichies par le schéma mental des circuits.',
      features: [
        'Réponses basées sur le RAG hybride et la topologie des circuits',
        'Puces de suggestions interactives suggérées par l\'analyse structurelle',
        'Accès instantané au visualiseur de circuit directement dans l\'interface de discussion',
        'Temps de réponse < 200ms pour les requêtes courantes'
      ]
    },
    {
      id: 'upload',
      title: '☁️ Upload de Documents',
      icon: UploadCloud,
      description: 'Importez vos documents techniques dans la base de connaissances pour enrichir le système RAG.',
      features: [
        'Formats supportés : Markdown (.md), Texte (.txt), JSON (.json)',
        'Sélection de la collection cible (équipements, procédures, sécurité...)',
        'Assignation de l\'équipement associé (TG1, TG2, TV, Général)',
        'Profil utilisateur cible (chef de bloc, chef de quart, maintenance...)',
        'Extraction automatique des tags et métadonnées',
        'Découpage intelligent en chunks de 500 caractères'
      ]
    },
    {
      id: 'manage',
      title: '🗄️ Gestion des Documents',
      icon: Database,
      description: 'Administrez votre base de connaissances vectorielle ChromaDB.',
      features: [
        'Visualisation de toutes les collections et leur nombre de documents',
        'Recherche avancée par collection ou sur toutes les collections',
        'Affichage du score de pertinence pour chaque résultat',
        'Suppression de collections entières',
        'Consultation des métadonnées (source, équipement, tags, profil)',
        'Statistiques en temps réel'
      ]
    },
    {
      id: 'vision',
      title: '📷 Recherche par Image',
      icon: Camera,
      description: 'Utilisez la reconnaissance d\'images pour identifier des équipements.',
      features: [
        'Capture photo via caméra',
        'Upload d\'images existantes',
        'Reconnaissance d\'équipements (TG1, TG2, TV, pompes, vannes)',
        'Récupération automatique des informations techniques associées',
        'Historique des recherches'
      ]
    }
  ];

  const collections = [
    { name: 'centrale_equipements_principaux', description: 'TG1, TG2, TV', count: 0, color: 'blue' },
    { name: 'centrale_procedures', description: 'Démarrage, arrêt, urgence', count: 0, color: 'green' },
    { name: 'centrale_consignes_seuils', description: 'Valeurs nominales, alarmes', count: 0, color: 'yellow' },
    { name: 'centrale_maintenance', description: 'Plans, gammes, historique', count: 0, color: 'purple' },
    { name: 'centrale_securite', description: 'Consignes, EPI, analyses risques', count: 0, color: 'red' },
    { name: 'centrale_salle_controle_conduite', description: 'Pupitres, HMI, alarmes', count: 0, color: 'cyan' },
    { name: 'centrale_gestion_equipes_humain', description: 'Planning, passations', count: 0, color: 'orange' },
    { name: 'centrale_supervision_globale', description: 'Tableaux de bord, KPIs', count: 0, color: 'pink' }
  ];

  const profiles = [
    { name: 'chef_bloc_TG1', label: 'Chef de Bloc TG1', description: 'Conduite de la turbine à gaz TG1 et chaudière CR1' },
    { name: 'chef_bloc_TG2', label: 'Chef de Bloc TG2', description: 'Conduite de la turbine à gaz TG2 et chaudière CR2' },
    { name: 'operateur_TV', label: 'Opérateur TV', description: 'Conduite de la turbine à vapeur et circuits associés' },
    { name: 'chef_quart', label: 'Chef de Quart', description: 'Supervision de l\'installation et coordination des équipes' },
    { name: 'superviseur', label: 'Superviseur', description: 'Analyse des performances et planification stratégique' },
    { name: 'maintenance', label: 'Maintenance', description: 'Gestion des interventions et plans de maintenance' },
    { name: 'operateur_terrain', label: 'Opérateur Terrain', description: 'Inspections terrain et interventions locales' }
  ];

  const getColorClasses = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      green: 'bg-green-500/10 text-green-400 border-green-500/20',
      yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      red: 'bg-red-500/10 text-red-400 border-red-500/20',
      cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      pink: 'bg-pink-500/10 text-pink-400 border-pink-500/20'
    };
    return colors[color] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  };

  return (
    <div className="min-h-screen bg-[#212121]">
      {/* Header */}
      <div className="bg-[#171717] border-b border-white/5 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <BookOpen className="w-6 h-6 text-orange-500" />
                <div>
                  <h1 className="text-lg font-semibold text-white">Documentation Technique & Guide Utilisateur</h1>
                  <p className="text-xs text-gray-500">Exploitation des schémas topologiques et RAG intelligent</p>
                </div>
              </div>
            </div>
            <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20">
              Version 3.0
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Introduction */}
        <div className="bg-gradient-to-r from-orange-600/20 to-amber-600/20 rounded-2xl p-8 mb-8 border border-white/5">
          <h1 className="text-3xl font-bold text-white mb-4">
            CCP TOPOLOGY - Modélisation & Diagnostics de Circuits
          </h1>
          <p className="text-gray-300 text-lg mb-6">
            Module avancé d'intelligence d'exploitation et de navigation dans les réseaux de fluides et de thermodynamique complexes.
            Il permet d'associer un schéma mental interactif aux circuits physiques pour enrichir la recherche RAG et structurer les réponses opérationnelles de l'IA.
          </p>
          <div className="flex gap-4">
            <div className="flex items-center gap-2 text-sm text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span>Synchronisation Bidirectionnelle SQLite</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-orange-400">
              <Cpu className="w-4 h-4" />
              <span>ChromaDB Vector Matching</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-purple-400">
              <Shield className="w-4 h-4" />
              <span>Sécurisé et Persistant</span>
            </div>
          </div>
        </div>

        {/* Sections principales */}
        <div className="space-y-8 mb-12">
          <h2 className="text-2xl font-bold text-white">Guide d'Exploitation & Fonctionnalités</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <div key={section.id} className="bg-[#171717] rounded-xl border border-white/5 p-6 hover:border-white/10 transition-all">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-orange-500/10 rounded-xl">
                      <Icon className="w-6 h-6 text-orange-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-2">
                        {section.title}
                      </h3>
                      <p className="text-gray-400 text-sm mb-4">
                        {section.description}
                      </p>
                      <ul className="space-y-2">
                        {section.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-gray-500">
                            <ChevronRight className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Collections ChromaDB */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">Collections ChromaDB & Vector Store</h2>
          <p className="text-gray-400 mb-6">
            Les nœuds des schémas mentaux sont vectorisés de manière granulaire et indexés sémantiquement pour alimenter l'IA.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((collection) => (
              <div key={collection.name} className={cn(
                "p-4 rounded-lg border",
                getColorClasses(collection.color)
              )}>
                <div className="flex items-center gap-2 mb-2">
                  <Database className="w-4 h-4" />
                  <span className="font-mono text-sm font-medium">{collection.name}</span>
                </div>
                <p className="text-xs opacity-80 mb-2">{collection.description}</p>
                <Badge variant="outline" className="text-xs border-current opacity-70">
                  {collection.count} documents
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Profils utilisateurs */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">Bénéfices Attendus pour les Profils</h2>
          <p className="text-gray-400 mb-6">
            Une interface intuitive et performante adaptée aux réalités opérationnelles des équipes.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profiles.map((profile) => (
              <div key={profile.name} className="bg-[#171717] rounded-lg border border-white/5 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <User className="w-5 h-5 text-purple-400" />
                  <span className="font-medium text-white">{profile.label}</span>
                </div>
                <p className="text-sm text-gray-500">{profile.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Guide rapide */}
        <div className="bg-[#171717] rounded-xl border border-white/5 p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-orange-400" />
            Guide Rapide : Import, Édition & Diagnostics
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Badge className="bg-orange-500/20 text-orange-400">1</Badge>
              <div>
                <p className="text-white font-medium">Configurez ou importez votre schéma</p>
                <p className="text-gray-500 text-sm">Depuis le tableau d'administration des circuits, importez vos diagrammes au format <span className="text-orange-400">draw.io XML</span>, ou <span className="text-orange-400">Miro CSV</span>. Le système s'occupe de la mise en page automatique en arbre 2D.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge className="bg-orange-500/20 text-orange-400">2</Badge>
              <div>
                <p className="text-white font-medium">Liez et ajustez les paramètres physiques</p>
                <p className="text-gray-500 text-sm">Sélectionnez les nœuds de type paramètre et liez-les aux variables nominales réelles de la centrale. Utilisez la <span className="text-orange-400">synchronisation SQLite</span> en temps réel pour mettre à jour la base de données opérationnelle.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge className="bg-orange-500/20 text-orange-400">3</Badge>
              <div>
                <p className="text-white font-medium">Consultez l'IA pour vos diagnostics</p>
                <p className="text-gray-500 text-sm">Posez des questions sur le comportement des circuits techniques dans le <span className="text-orange-400">Chat Intelligent</span>. L'IA inclut désormais les dépendances causales des nœuds du Mind Map dans ses réponses.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-white/5 text-center">
          <p className="text-xs text-gray-600">
            AGENTIC - Hybrid RAG AI & Topology Platform | Version 3.0 | © 2026
          </p>
        </div>
      </div>
    </div>
  );
}