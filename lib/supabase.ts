import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function uploadAudio(audioBlob: Blob, sessionId: string): Promise<string | null> {
  const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const filePath = `${sessionId}/recording.${ext}`;
  const { error } = await supabase.storage
    .from('audio-sessions')
    .upload(filePath, audioBlob, { contentType: audioBlob.type, upsert: true });
  if (error) { console.error('Upload audio error:', error); return null; }
  const { data } = supabase.storage.from('audio-sessions').getPublicUrl(filePath);
  return data.publicUrl;
}

export async function saveSession(session: {
  id: string; titre: string; participants: string; date_seance: string;
  duration_seconds: number; audio_url: string | null; transcript: string; report: object | null;
}): Promise<string | null> {
  const { data, error } = await supabase.from('sessions').upsert(session).select('id').single();
  if (error) { console.error('Save session error:', error); return null; }
  return data?.id ?? null;
}

export async function getSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, titre, participants, date_seance, duration_seconds, audio_url, created_at')
    .order('created_at', { ascending: false });
  if (error) { console.error('Get sessions error:', error); return []; }
  return data ?? [];
}

export async function getSession(id: string) {
  const { data, error } = await supabase.from('sessions').select('*').eq('id', id).single();
  if (error) return null;
  return data;
}import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function uploadAudio(audioBlob: Blob, sessionId: string): Promise<string | null> {
  const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const filePath = `${sessionId}/recording.${ext}`;

  const { error } = await supabase.storage
    .from('audio-sessions')
    .upload(filePath, audioBlob, {
      contentType: audioBlob.type,
      upsert: false,
    });

  if (error) {
    console.error('Upload audio error:', error);
    return null;
  }

  const { data } = supabase.storage
    .from('audio-sessions')
    .getPublicUrl(filePath);

  return data.publicUrl;
}

export async function saveSession(session: {
  id: string;
  titre: string;
  participants: string;
  date_seance: string;
  duration_seconds: number;
  audio_url: string | null;
  transcript: string;
  report: object | null;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('sessions')
    .insert(session)
    .select('id')
    .single();

  if (error) {
    console.error('Save session error:', error);
    return null;
  }
  return data?.id ?? null;
}
