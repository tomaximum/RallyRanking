# 🏁 RallyRanking

[![Status](https://img.shields.io/badge/Status-Stable-success.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Web-blue.svg)](#)
[![Version](https://img.shields.io/badge/Version-2.3-orange.svg)](#)

![RallyRanking Banner](docs/images/banner.png)

## 🚀 Présentation

**RallyRanking** est un outil web ultra-performant conçu pour la gestion et le scoring de rallyes automobiles et moto. Importez vos traces GPX, définissez vos waypoints, et obtenez un classement immédiat avec gestion fine des pénalités.

L'application est conçue pour être **confidentielle**, **rapide**, et compatible avec tous les supports (Mobile, Tablette, PC) via une interface moderne et réactive.

---

## 🔥 Fonctionnalités Clés

### ⏱️ Mode Time Attack
Le mode classique pour les épreuves de vitesse pure.
- Calcul précis du temps net (Temps Brut - Neutralisations).
- Gestion automatique des waypoints manqués et des zones de vitesse contrôlées (VMAX).

### 🏆 Mode Régularité (**NOUVEAU**)
Spécialement conçu pour les épreuves de régularité (VHR / VHRS).
- **Temps de Référence** : Définissez un temps cible au format `HH:MM:SS`.
- **Calcul de pénalité** : Seul le dépassement (retard) est pénalisé, avec un score final exprimé en secondes.
- **Affichage Dédié** : Un tableau de classement optimisé pour une lecture rapide des écarts.

### 🗺️ Carte Interactive
- Rendu fluide des traces GPX avec personnalisation des couleurs.
- Visualisation immédiate des waypoints validés ou manqués sur le terrain.
- Zoom intelligent lors de la sélection d'un concurrent dans le tableau.

### 📄 Rapports Professionnels
- **Export CSV** : Pour un traitement externe ou archivage.
- **Classement PDF** : Un rapport officiel élégant, prêt à être imprimé ou partagé.
- **Fiches Individuelles** : Génération d'une fiche A4 complète par pilote (carte du parcours, détail des passages waypoints et pénalités).

### 💾 Persistance & Robustesse
- **Sauvegarde Automatique** : Sauvegarde en temps réel de votre session dans le navigateur (`localStorage`).
- **Mode Offline** : Une fois chargée, l'application fonctionne sans connexion internet.
- **Bouton Reset** : Pour réinitialiser l'espace de travail en un clic avant un nouveau rallye.

---

## 🛠️ Guide de Démarrage Rapide

1.  **Configuration** : Ouvrez le menu **Configuration** pour définir votre barème de pénalités et le mode (Time Attack / Régularité).
2.  **Roadbook** : Glissez-déposez votre fichier GPX de référence (contenant le tracé idéal et les waypoints).
3.  **Concurrents** : Glissez-déposez les fichiers GPX des concurrents.
4.  **Résultats** : C'est terminé ! Consultez le classement en temps réel et générez vos PDF.

---

## 💻 Architecture Technique
-   **Frontend** : Pur HTML5 / CSS3 / JavaScript (ES6+).
-   **Cartographie** : Leaflet.js pour une manipulation fluide des cartes.
-   **PDF** : jsPDF pour la génération de documents professionnels côté client.
-   **Confidentialité** : Aucune donnée n'est envoyée sur un serveur. Tout le traitement GPX et géographique s'effectue localement sur votre appareil.

---

Conçu avec passion pour le sport automobile 🏁 par **[Tomaximum](https://github.com/tomaximum)**.
