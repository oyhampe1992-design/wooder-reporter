-- ══════════════════════════════════════════════════════════════════
-- WOODER REPORTER — Schéma Supabase
-- Coller dans : Supabase Dashboard → SQL Editor → New query
-- ══════════════════════════════════════════════════════════════════

-- 1. TABLE SESSIONS
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.sessions (
  id            uuid primary key,
  titre         text,
  participants  text,
  date_seance   text,
  duration_seconds integer default 0,
  audio_url     text,
  transcript    text,
  report        jsonb,
  created_at    timestamptz default now()
);

-- Index pour tri chronologique
create index if not exists sessions_created_at_idx on public.sessions (created_at desc);

-- 2. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────
-- Pour l'instant : accès public (outil interne solo)
-- À restreindre si multi-utilisateurs plus tard

alter table public.sessions enable row level security;

create policy "Public insert" on public.sessions
  for insert with check (true);

create policy "Public select" on public.sessions
  for select using (true);

create policy "Public update" on public.sessions
  for update using (true);

-- 3. STORAGE BUCKET — Audio
-- ─────────────────────────────────────────────────────────────────
-- Aller dans : Storage → New bucket
-- Nom : audio-sessions
-- Public : OUI (pour lire les URLs depuis le rapport PDF)
-- Ou via SQL :

insert into storage.buckets (id, name, public)
values ('audio-sessions', 'audio-sessions', true)
on conflict (id) do nothing;

create policy "Public audio upload" on storage.objects
  for insert with check (bucket_id = 'audio-sessions');

create policy "Public audio read" on storage.objects
  for select using (bucket_id = 'audio-sessions');

-- ══════════════════════════════════════════════════════════════════
-- VÉRIFICATION — Lister les sessions
-- ══════════════════════════════════════════════════════════════════
-- select id, titre, participants, date_seance, duration_seconds, created_at
-- from public.sessions
-- order by created_at desc
-- limit 20;
