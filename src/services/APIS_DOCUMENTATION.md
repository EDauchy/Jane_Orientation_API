# Documentation des APIs data.gouv.fr utilisées

Ce document liste toutes les APIs du gouvernement français utilisées dans le projet pour récupérer les données des établissements.

## Sources des données

Toutes les APIs proviennent de [data.gouv.fr](https://www.data.gouv.fr/dataservices/), la plateforme ouverte des données publiques françaises.

## APIs utilisées

### 1. Logements CROUS

**Endpoint**: `https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr_crous_logement_france_entiere/records`

**Description**: Liste des logements CROUS disponibles en France entière.

**Données récupérées**:
- Nom et adresse du logement
- Coordonnées géographiques
- Informations de contact (email, téléphone, site web)
- Horaires d'ouverture
- Description

**Filtres disponibles**:
- `refine=zone:{ville}` : Filtrer par ville
- `limit` : Nombre de résultats (max 100)
- `offset` : Pagination

**Exemple d'utilisation**:
```
GET /api/map/housing?city=Paris&limit=50
```

### 2. Organismes de Formation (OF)

**Endpoint**: `https://dgefp.opendatasoft.com/api/explore/v2.1/catalog/datasets/liste-publique-des-of-v2/records`

**Description**: Liste publique des organismes de formation enregistrés auprès de la DGEFP (Direction Générale de l'Emploi et de la Formation Professionnelle).

**Données récupérées**:
- Raison sociale
- Adresse complète
- Coordonnées géographiques
- Informations de contact
- Indication si l'organisme propose de l'alternance
- Indication si les formations sont finançables (CPF)

**Filtres disponibles**:
- `refine=adresse_physique_ville:{ville}` : Filtrer par ville
- `limit` : Nombre de résultats
- `offset` : Pagination

**Exemple d'utilisation**:
```
GET /api/map/training-centers?city=Lyon&limit=50
```

### 3. Universités et établissements d'enseignement supérieur

**Endpoint**: `https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr-esr-principaux-etablissements-enseignement-superieur/records`

**Description**: Liste des principaux établissements d'enseignement supérieur français (universités, grandes écoles, etc.).

**Données récupérées**:
- Nom de l'établissement
- Adresse
- Coordonnées géographiques
- Informations de contact
- Type d'établissement (public/privé)
- Indication si l'établissement propose de l'alternance
- Indication si l'établissement propose de la formation continue

**Filtres disponibles**:
- `refine=ville:{ville}` : Filtrer par ville
- `limit` : Nombre de résultats
- `offset` : Pagination

**Exemple d'utilisation**:
```
GET /api/map/universities?city=Paris&limit=50
```

### 4. Établissements proposant de l'alternance

**Endpoint**: Combiné (utilise les APIs OF et Universités)

**Description**: Liste des établissements qui proposent des formations en alternance, extraite des organismes de formation et des universités.

**Exemple d'utilisation**:
```
GET /api/map/alternance?city=Paris&limit=50
```

## API unifiée

### `/api/map/establishments`

**Description**: API unifiée qui récupère tous les types d'établissements en une seule requête.

**Paramètres**:
- `city` (optionnel) : Filtrer par ville
- `limit` (optionnel, défaut: 100) : Nombre maximum de résultats
- `housing` (optionnel, défaut: true) : Inclure les logements CROUS
- `training` (optionnel, défaut: true) : Inclure les centres de formation
- `universities` (optionnel, défaut: true) : Inclure les universités
- `alternance` (optionnel, défaut: true) : Inclure les établissements avec alternance

**Exemple d'utilisation**:
```
GET /api/map/establishments?city=Paris&limit=100&housing=true&training=true&universities=true&alternance=true
```

**Réponse**:
```json
[
  {
    "id": "crous-123",
    "name": "Résidence CROUS Paris",
    "address": "123 Rue Example, 75001 Paris",
    "position": {
      "lat": 48.8566,
      "lon": 2.3522
    },
    "contact": {
      "email": "contact@crous.fr",
      "phone": "01 23 45 67 89",
      "website": "https://www.crous-paris.fr"
    },
    "openingHours": "Lun-Ven: 9h-17h",
    "description": "Résidence étudiante...",
    "tags": {
      "alternance": false,
      "financed": true,
      "university": true,
      "private": false,
      "adultTraining": false
    },
    "source": "crous"
  }
]
```

## Format normalisé

Toutes les APIs retournent des données dans le format `NormalizedResource` :

```typescript
interface NormalizedResource {
    id: string;                    // Identifiant unique
    name: string;                   // Nom de l'établissement
    address: string;                // Adresse complète
    position: {                     // Coordonnées GPS
        lat: number;
        lon: number;
    };
    contact: {                      // Informations de contact
        email?: string;
        phone?: string;
        website?: string;
    };
    openingHours?: string;          // Horaires d'ouverture
    description?: string;           // Description de l'établissement
    tags: {                         // Tags de classification
        alternance: boolean;         // Propose de l'alternance
        financed: boolean;           // Formations finançables
        university: boolean;         // Établissement universitaire
        private: boolean;            // Établissement privé
        adultTraining: boolean;      // Formation pour adultes
    };
    source: string;                 // Source de la donnée (crous, dgefp, esr)
    sourceId?: string;              // ID dans la source originale
}
```

## Notes importantes

1. **Rate limiting**: Les APIs data.gouv.fr sont publiques mais peuvent avoir des limites de taux. Il est recommandé de mettre en cache les résultats.

2. **Données manquantes**: Certains établissements peuvent ne pas avoir toutes les informations (horaires, contact, etc.). Le service gère ces cas en retournant des valeurs par défaut.

3. **Déduplication**: L'API unifiée `/api/map/establishments` déduplique automatiquement les établissements qui apparaissent dans plusieurs sources en se basant sur leur position géographique.

4. **Filtrage géographique**: Le filtrage par ville utilise les paramètres `refine` des APIs OpenDataSoft, qui sont plus performants que le filtrage côté serveur.

## Références

- [data.gouv.fr - APIs](https://www.data.gouv.fr/dataservices/)
- [OpenDataSoft API Documentation](https://help.opendatasoft.com/apis/ods-explore-v2/)
- [Ministère de l'Enseignement supérieur et de la Recherche](https://data.enseignementsup-recherche.gouv.fr/)
