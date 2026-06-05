# Guide d'Export et d'Import Mind Map

L'éditeur de Mind Map supporte de multiples formats pour vous permettre d'utiliser vos données dans divers contextes (rapports, outils externes, IA).

## Formats d'Export

### PDF (.pdf)
Génère un document PDF haute résolution de votre Mind Map complet, conservant les couleurs, thèmes et hiérarchie. Idéal pour partager un aperçu statique à des collaborateurs ou pour intégrer dans un rapport de fin d'intervention.

### XMind (.xmind)
Exporte sous le format standard XMind. Ce format vous permet d'ouvrir, d'éditer et de retravailler la structure dans l'application Desktop XMind (ou MindMeister / Miro en l'important). 

### Image Vectorielle (.svg)
Génère une image vectorielle SVG riche. Contrairement aux images bitmap (PNG/JPG), le SVG garde une netteté parfaite quel que soit le niveau de zoom.

### Données Brutes (.json)
Exporte la structure interne. Ce fichier permet de réimporter le graphe complet (y compris les métadonnées métier) dans notre plateforme sans aucune perte.

---

## Import de fichiers

Le module d'import permet de charger un graphe existant.

### Pourquoi pas d'import d'image directe ?
Les formats binaires (PNG, JPG, PDF) sont des images "plates" : elles ne contiennent pas la structure arborescente (nœuds, liaisons parent-enfant) nécessaire à notre graphe intelligent.

**Pour importer un schéma depuis une image :**
1. Utilisez un outil dédié comme **XMind**, **Miro** ou **MindMeister** pour analyser ou recréer la structure.
2. Exportez depuis cet outil en format **JSON** ou **XMind**.
3. Importez ce fichier ici via l'onglet **Texte** de l'interface d'import.
