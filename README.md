# GeoFinance Globe

Globe terrestre 3D en temps réel : cliquez ou zoomez sur un pays pour afficher ses
indicateurs économiques (PIB, croissance, inflation, chômage, dette…) et ses dernières
actualités financières.

## Fonctionnalités

- **Globe 3D interactif** (globe.gl / three.js) avec contours de 174 pays, rotation
  automatique, survol et sélection.
- **Temps réel** : horloge UTC, position réelle du Soleil (point subsolaire) qui éclaire
  le globe et dessine le cycle jour / nuit, bandeau de cours de change.
- **Zoom = sélection** : en zoomant (molette ou pincement) sur un pays, sa fiche s'ouvre
  automatiquement. Recherche par nom et accès rapide aux grandes économies.
- **Fiche pays** :
  - PIB nominal, croissance, PIB / habitant, inflation, chômage, population, dette
    publique, balance courante, exportations, IDE (Banque mondiale, dernière année
    disponible avec variation vs année précédente) ;
  - courbe du PIB sur 25 ans ;
  - taux de change de la devise nationale face au dollar et à l'euro (BCE, variation
    30 jours) ;
  - actualités financières (Google Actualités RSS, ou GNews.io si vous saisissez une
    clé dans ⚙ Paramètres), en français ou en anglais.

## Lancer le site

C'est un site 100 % statique, sans étape de build. Il doit être servi via HTTP
(le chargement des contours en JSON ne fonctionne pas en `file://`) :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Ou activez GitHub Pages sur la branche (« Deploy from a branch », dossier racine).

## Sources de données (aucune clé requise)

| Donnée | Source |
| --- | --- |
| Indicateurs économiques, profil pays | [API Banque mondiale](https://api.worldbank.org/) |
| Taux de change | [Frankfurter](https://www.frankfurter.app/) (données BCE) |
| Actualités | Flux RSS Google Actualités via relais CORS public (allorigins, corsproxy, codetabs), ou [GNews.io](https://gnews.io/) avec clé |
| Drapeaux | [flagcdn.com](https://flagcdn.com/) |
| Contours | [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth 1:110m) |

Les réponses sont mises en cache dans `localStorage` (profil 7 j, indicateurs 6 h,
devises 30 min, actualités 10 min).

## Structure

```
index.html          page unique
css/style.css       thème sombre, panneau latéral, bandeau, responsive
js/app.js           globe, soleil, sélection, rendu du panneau
js/data.js          clients API (Banque mondiale, Frankfurter, actualités) + cache
js/countries.js     index ISO généré : id numérique -> codes alpha-2/3, noms FR/EN
data/               contours TopoJSON des pays
assets/             textures de la Terre et fond étoilé (three-globe)
vendor/             globe.gl et topojson-client embarqués
```
