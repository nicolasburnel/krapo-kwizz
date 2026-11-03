# Krapo Kwizz

Le quiz des chants et des photos d'amphibiens de Guyane, publié avec **Cerato**, association herpétologique de Guyane.

👉 Le jeu en ligne : **https://nicolasburnel.github.io/krapo-kwizz/**

Krapo Kwizz est un site gratuit, sans inscription, qui fonctionne sur téléphone et sur ordinateur, et même hors connexion une fois installé.

- **Écoute** : un chant, trouver l'espèce, en choisissant parmi 4 noms ou 4 photos, ou en écrivant le nom.
- **Photo** : une photo, nommer l'espèce, du niveau Découverte au niveau Maître, avec des indices.
- **Rythmes** : série de 20 questions, contre-la-montre de 60 secondes, survie à 3 vies.
- **Défi du jour** : 10 questions (chants et photos), les mêmes pour tout le monde chaque jour, avec résultat à partager.
- **Ambiance mare** : plusieurs espèces d'un même milieu chantent ensemble, il faut cocher toutes celles qu'on entend.
- **Mode inverse** : une photo, retrouver son chant parmi 4. **Photo qui se dévoile** : option du mode Photo.
- **Badges**, **partage du score**, et **Mon carnet** pour cocher les espèces vues ou entendues sur le terrain.
- **Espèces** : toutes les fiches, avec photos, chant, critères et confusions possibles.
- **Progrès** : maîtrise par famille et records, enregistrés sur l'appareil du joueur.

---

## Notice : modifier l'appli sans coder

Tout se fait sur github.com, dans ce dépôt. Chaque modification enregistrée (« Commit changes ») met le site à jour automatiquement en une ou deux minutes.

### Le fichier des espèces : `data/especes.csv`

C'est le cœur de l'appli : une ligne par espèce. GitHub l'affiche comme un tableau. Pour le modifier, ouvre le fichier puis clique sur le crayon ✏️.

| Colonne | Contenu | Exemple |
|---|---|---|
| `id` | identifiant unique, en minuscules et sans espaces, à ne pas changer | `scinax-cynocephalus` |
| `nom` | nom scientifique actuel | `Scinax cynocephalus` |
| `nom_vernaculaire` | nom français | `Scinax des savanes` |
| `famille` | famille | `Hylidae` |
| `page_guide` | page dans le guide 2023 | `37` |
| `son` | nom du fichier dans le dossier `sons/` (vide = pas de chant) | `scinax-cynocephalus.mp3` |
| `auteur_son` | auteur de l'enregistrement | `Christian Marty & Philippe Gaucher` |
| `photos` | fichiers du dossier `photos/`, séparés par ` \| ` | `scinax-cynocephalus-1.webp \| scinax-cynocephalus-2.webp` |
| `credit_photos` | auteur(s) des photos, affiché sur la fiche | `Elven Remérand` |
| `habitat`, `taille` | utilisés pour les indices et la fiche | `Marais (littoral)` |
| `criteres` | critères d'identification, séparés par ` \| ` | `Museau court \| Iris rouge` |
| `confusions` | noms des espèces confondables, séparés par ` \| ` ; utilisés pour le niveau Expert | `Scinax jolyi \| Scinax proboscideus` |
| `commentaire` | texte de la fiche | |
| `ancien_nom` | ancien nom, s'il a changé ; il reste accepté comme bonne réponse | `Scinax nebulosus` |
| `remarque` | note libre, non affichée | |

⚠️ Si une case contient une virgule, elle doit être entre guillemets `"…"`. L'éditeur de GitHub le signale si le tableau est cassé : vérifie l'aperçu avant d'enregistrer.

### Les milieux de l'ambiance mare : `data/ambiances.csv`

Une ligne par milieu (mare forestière, sous-bois, bord de crique, savanes et marais, village). La colonne `especes` liste les `id` des espèces qui peuvent réellement chanter ensemble dans ce milieu, séparés par ` | `. Seules les espèces qui ont un chant sont utilisées, et un milieu doit en compter au moins 6. Tu peux ajouter un milieu en ajoutant une ligne.

### Renommer une espèce

1. Dans `data/especes.csv`, remplace le `nom`.
2. Mets l'ancien nom dans `ancien_nom` : il reste accepté comme réponse et s'affiche sur la fiche.
3. Si l'espèce apparaît dans la colonne `confusions` d'autres espèces, remplace-y aussi le nom.
4. Ne touche pas à l'`id`, sinon les progrès des joueurs sur cette espèce repartent à zéro.

### Ajouter ou remplacer un chant

1. Prépare un MP3, mono, autour de 112 kbit/s et de 10 à 30 secondes. Nomme-le comme l'`id` : `boana-boans.mp3`.
2. Ouvre le dossier `sons/`, puis Add file → Upload files, et dépose le fichier.
3. Dans `data/especes.csv`, mets le nom du fichier dans la colonne `son` et l'auteur dans `auteur_son`.

### Ajouter une photo

1. Prépare une image au format WebP ou JPG. Donne-lui un **nouveau nom** (par exemple `-v3`) si elle remplace une ancienne photo : sinon les joueurs qui ont déjà l'ancienne en mémoire hors-ligne continueront de la voir.
   Format conseillé : WebP ou JPG, d'environ 900 px de large, si possible détourée ou sur fond neutre.
2. Dépose-la dans le dossier `photos/`.
3. Ajoute son nom dans la colonne `photos` (et le photographe dans `credit_photos`), séparé des autres par ` | `. La première photo sert de vignette et de proposition dans le mode « 4 photos ».

### Ajouter une espèce

Ajoute une ligne à la fin de `data/especes.csv` avec un nouvel `id`, ajoute ses fichiers, et c'est tout. Une espèce sans `son` n'apparaît que dans le mode Photo, une espèce sans `photos` que dans le mode Écoute.

### Changer des textes ou réglages

- Le texte « À propos » et les crédits se trouvent dans `js/app.js`, fonction `viewAbout`.
- Les réglages du jeu se trouvent en haut de `js/app.js`, dans `CFG` : longueur d'une série, durée du chrono, nombre de vies, points, coût d'un indice.
- Les couleurs se trouvent en haut de `css/style.css`.
- Après une modification de code (`js/`, `css/`, `index.html`), augmente `VERSION` dans `sw.js` (par exemple `kk-app-v2`) pour que les joueurs reçoivent la nouvelle version.

### Mise en ligne (une seule fois)

Settings → Pages → *Build and deployment* : Source « Deploy from a branch », branche `main`, dossier `/ (root)`, puis Save. Le site est publié sur `https://nicolasburnel.github.io/krapo-kwizz/`.

---

## Crédits et licence

- **Chants** : sonothèque de l'Atlas des amphibiens de Guyane. L'auteur de chaque enregistrement est indiqué dans `data/especes.csv` et sur chaque fiche.
- **Photos et critères** : *Guide d'identification des Amphibiens de Guyane*, E. Remérand & Q. Uriot (2023), et ses photographes.
- **Conception** : Nicolas Burnel, avec Cerato.

Les contenus (sons, photos, textes) sont sous licence **Creative Commons BY-NC 4.0** (attribution, pas d'usage commercial), voir `LICENSE.md`. Le code de l'appli est sous licence MIT.

Contact : nicolasburnel2005@gmail.com
