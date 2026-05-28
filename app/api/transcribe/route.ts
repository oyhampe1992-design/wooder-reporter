import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 10;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: 'Fichier audio manquant' }, { status: 400 });
    }

    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 25MB)' }, { status: 413 });
    }

    const whisperForm = new FormData();
    whisperForm.append('file', audioFile, `recording.webm`);
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('language', 'fr');
    whisperForm.append('response_format', 'verbose_json');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: whisperForm,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      return NextResponse.json({ error: `Erreur Whisper: ${err}` }, { status: 500 });
    }

    const data = await whisperRes.json();
    return NextResponse.json({ transcript: data.text });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
