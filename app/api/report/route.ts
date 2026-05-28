import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, metadata } = body;

    if (!transcript?.trim()) {
      return NextResponse.json({ error: 'Transcription vide' }, { status: 400 });
    }

    const prompt = `Tu es un expert en rédaction de comptes-rendus professionnels en français.

Contexte :
- Titre : ${metadata.titre || 'Entretien'}
- Participants : ${metadata.participants || 'Non précisés'}
- Date : ${metadata.date}

TRANSCRIPTION :
${transcript}

Réponds UNIQUEMENT avec un objet JSON valide (pas de markdown) :
{
  "resume_executif": "Résumé en 2-3 phrases",
  "points_cles": ["point 1", "point 2"],
  "decisions_prises": ["décision 1"],
  "actions_a_faire": [{"action": "...", "responsable": "...", "echeance": "..."}],
  "sujets_abordes": ["sujet 1"],
  "verbatim_importants": ["citation 1"],
  "prochaines_etapes": "...",
  "conclusion": "..."
}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
      model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    const raw = data.content.map((c: {type: string; text?: string}) => c.text || '').join('');
    const clean = raw.replace(/```json|```/g, '').trim();
    const report = JSON.parse(clean);

    return NextResponse.json({ report });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
