# Wooder Reporter

> Enregistrement mobile + Transcription Whisper (OpenAI) + Rapport structuré Claude + Stockage Supabase

---

## Stack

| Composant | Service | Usage |
|-----------|---------|-------|
| Frontend | Next.js 14 + Vercel | PWA iPhone/Android |
| Transcription | OpenAI Whisper | Précision FR optimale |
| Rapport IA | Anthropic Claude Sonnet | Compte-rendu structuré |
| Stockage audio | Supabase Storage | Fichiers .webm/.mp4 |
| Base de données | Supabase Postgres | Sessions + rapports JSON |

---

## Installation

### 1. Créer le repo GitHub
Pusher ce dossier sur un nouveau repo GitHub.

### 2. Supabase — Créer le projet
1. https://supabase.com → New project
2. Ouvrir **SQL Editor** → coller et exécuter `supabase-schema.sql`
3. Vérifier dans **Storage** que le bucket `audio-sessions` est créé en Public

### 3. Variables d'environnement
```bash
cp .env.local.example .env.local
# Remplir les 5 variables avec vos clés
```

### 4. Déployer sur Vercel
1. https://vercel.com → Import Git Repository
2. **Settings → Environment Variables** → ajouter les 5 variables du `.env.local`
3. Deploy

### 5. Ajouter sur l'écran d'accueil iPhone
1. Ouvrir l'URL Vercel dans **Safari** (pas Chrome)
2. Bouton Partager → **Sur l'écran d'accueil**
3. L'app s'ouvre en plein écran sans barre Safari

---

## Utilisation

1. **Ouvrir l'app** sur iPhone
2. **Renseigner** titre, participants, date (optionnel)
3. **Démarrer** → AirPods sélectionnés automatiquement
4. **Arrêter** → transcription Whisper automatique (~1/6 de la durée)
5. **Corriger** la transcription si nécessaire
6. **Générer le rapport** → Claude analyse et structure
7. **Télécharger PDF** → impression depuis Safari → Enregistrer en PDF

---

## Limites Whisper
- Taille max : 25 MB (≈ 2h30 à qualité téléphone)
- Langues : 99 langues détectées automatiquement
- Coût : ~0,006 $/minute audio

## Limites Vercel Hobby
- Timeout API : 60 secondes
- Pour de longs enregistrements (>45min), passer en plan Pro (300s)

---

## Structure

```
wooder-reporter/
├── app/
│   ├── page.tsx              # UI principale (recorder + rapport)
│   ├── layout.tsx            # PWA meta tags
│   └── api/
│       ├── transcribe/       # POST → Whisper
│       └── report/           # POST → Claude
├── lib/
│   ├── supabase.ts           # Upload audio + save session
│   └── types.ts              # TypeScript interfaces
├── public/
│   └── manifest.json         # PWA manifest
├── supabase-schema.sql       # À exécuter dans Supabase
└── .env.local.example        # Template variables
```
