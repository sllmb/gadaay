# GADAAY — Agence de Voyage
### Projet L2 GLSI · ESP Dakar · 2026

---

## Structure du projet

```
gadaay/
├── api/
│   └── index.js          ← Backend Express (routes API)
├── public/
│   └── index.html        ← Frontend (design Trippo)
├── sql/
│   └── schema.sql        ← Base de données MySQL complète
├── .env.example          ← Variables d'environnement
├── .gitignore
├── package.json
├── vercel.json           ← Config déploiement Vercel
└── README.md
```

---

## ÉTAPE 1 — Installer le projet en local (VSCode)

### 1.1 Prérequis
- [Node.js](https://nodejs.org) v18+
- [MySQL](https://dev.mysql.com/downloads/) 8.0+
- [VSCode](https://code.visualstudio.com/)
- [Git](https://git-scm.com/)

### 1.2 Cloner / Ouvrir le projet dans VSCode
```bash
# Dans le terminal VSCode (Ctrl+`)
cd Desktop
# Copie le dossier gadaay ici, puis :
cd gadaay
npm install
```

### 1.3 Créer le fichier .env
```bash
cp .env.example .env
```
Ouvre `.env` et remplis tes valeurs :
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=TON_MOT_DE_PASSE_MYSQL
DB_NAME=agence_voyage
PORT=3000
```

### 1.4 Créer la base de données
Ouvre MySQL Workbench ou le terminal MySQL :
```bash
mysql -u root -p < sql/schema.sql
```
Ou copie-colle le contenu de `sql/schema.sql` dans MySQL Workbench et exécute.

### 1.5 Lancer le serveur
```bash
npm run dev
```
Ouvre http://localhost:3000 dans ton navigateur ✅

---

## ÉTAPE 2 — Mettre sur GitHub

### 2.1 Créer un repo GitHub
1. Va sur https://github.com/new
2. Nom du repo : `gadaay`
3. Public ou Private → **Create repository**

### 2.2 Pousser le code
```bash
git init
git add .
git commit -m "Initial commit - GADAAY Agence de Voyage"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/gadaay.git
git push -u origin main
```

---

## ÉTAPE 3 — Base de données en ligne (PlanetScale ou Railway)

> Vercel est serverless → tu as besoin d'une base MySQL en ligne.

### Option A : PlanetScale (gratuit) — RECOMMANDÉ
1. Va sur https://planetscale.com → **Sign up**
2. Crée une database : `agence-voyage`
3. Clique **Connect** → choisis **Node.js**
4. Copie les variables de connexion
5. Importe le schema : **Console** → colle le contenu de `sql/schema.sql`

### Option B : Railway (gratuit)
1. Va sur https://railway.app → **New Project** → **MySQL**
2. Clique sur la base → **Connect** → copie les variables
3. Va dans **Query** → colle le contenu de `sql/schema.sql`

### Option C : Aiven (gratuit)
1. Va sur https://aiven.io → MySQL → Free plan
2. Crée le service → copie les credentials

---

## ÉTAPE 4 — Déployer sur Vercel

### 4.1 Connecter GitHub à Vercel
1. Va sur https://vercel.com → **Sign up with GitHub**
2. Clique **New Project**
3. Importe ton repo `gadaay`

### 4.2 Configurer les variables d'environnement
Dans Vercel → **Settings** → **Environment Variables**, ajoute :
```
DB_HOST     = [hôte de ta base en ligne]
DB_USER     = [utilisateur]
DB_PASSWORD = [mot de passe]
DB_NAME     = agence_voyage
```

### 4.3 Déployer
Clique **Deploy** → attends 1-2 minutes → ton site est en ligne ! 🎉

Ton URL sera : `https://gadaay-xxx.vercel.app`

---

## API Endpoints

| Méthode | Route                          | Description                      |
|---------|--------------------------------|----------------------------------|
| GET     | /api/circuits                  | Liste tous les circuits          |
| POST    | /api/circuits                  | Créer un circuit                 |
| GET     | /api/departs                   | Départs disponibles              |
| GET     | /api/clients                   | Liste des clients                |
| POST    | /api/clients                   | Ajouter un client                |
| GET     | /api/reservations              | Liste des réservations           |
| POST    | /api/reservations              | Créer une réservation            |
| PUT     | /api/reservations/:id/annuler  | Annuler une réservation          |
| GET     | /api/paiements                 | Liste des paiements              |
| POST    | /api/paiements                 | Enregistrer un paiement          |
| GET     | /api/soldes-impayes            | Réservations avec solde > 0      |
| GET     | /api/dashboard                 | Stats tableau de bord            |
| GET     | /api/guides                    | Liste des guides                 |

### Requêtes de consultation (Partie 2)
| Méthode | Route                                  | Requête SQL                         |
|---------|----------------------------------------|-------------------------------------|
| GET     | /api/requetes/departs-disponibles      | Départs statut ouvert               |
| GET     | /api/requetes/ca-par-destination       | CA groupé par destination           |
| GET     | /api/requetes/clients-multi-circuits   | Clients ayant réservé 2+ circuits   |
| GET     | /api/requetes/circuits-jamais-reserves | Circuits avec 0 réservation         |
| GET     | /api/requetes/guide-top                | Guide avec le plus de voyageurs     |

---

## Technologies utilisées

- **Frontend** : HTML5, CSS3, JavaScript vanilla
- **Backend**  : Node.js + Express.js
- **Base de données** : MySQL 8.0
- **ORM/Driver** : mysql2 (prepared statements)
- **Déploiement** : Vercel (serverless)
- **Design** : Inspiré de Trippo UI

---

*Projet réalisé dans le cadre du module SGBD — L2 GLSI, ESP Dakar 2026*
