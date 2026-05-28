'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { uploadAudio, saveSession } from '@/lib/supabase';
import type { SessionMetadata, Report } from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const C = {
  bg: '#0f0e0c', surface: '#1a1815', surfaceHover: '#222019',
  border: '#2e2b24', borderLight: '#3d3930',
  amber: '#d4891a', amberLight: '#f0a832', amberDim: '#8a5a10',
  text: '#e8e2d4', textMuted: '#9a9080', textDim: '#5a5448',
  red: '#c0392b', green: '#2e7d52', greenLight: '#3dab6e',
};

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

// ─── PDF generation ───────────────────────────────────────────────────────────

function printReport(report: Report, metadata: SessionMetadata, transcript: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  const now = new Date().toLocaleString('fr-FR');
  win.document.write(`<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<title>Rapport — ${metadata.titre || 'Entretien'}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,serif;color:#1a1a1a;padding:40px 60px;line-height:1.7;font-size:14px}
.header{border-bottom:2px solid #1a1a1a;padding-bottom:20px;margin-bottom:32px}
h1{font-size:28px;font-weight:700;letter-spacing:-0.02em;margin-bottom:8px}
.meta{font-family:'Courier New',monospace;font-size:11px;color:#666;display:flex;gap:24px;flex-wrap:wrap}
h2{font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a6020;font-family:'Courier New',monospace;margin:28px 0 10px;padding-bottom:4px;border-bottom:1px solid #e0d0b0}
.resume{background:#faf7f0;border-left:3px solid #c8860e;padding:16px 20px;border-radius:0 6px 6px 0;font-size:15px}
ul{list-style:none}
ul li{padding:4px 0 4px 20px;position:relative}
ul li::before{content:'→';position:absolute;left:0;color:#c8860e}
.action{background:#f5f5f5;padding:10px 14px;border-radius:4px;margin-bottom:6px}
.action-label{font-family:'Courier New',monospace;font-size:10px;color:#888;text-transform:uppercase}
.verbatim{border-left:2px solid #ddd;padding:6px 14px;color:#444;font-style:italic;margin:5px 0}
.conclusion{background:#f0f4ee;border-left:3px solid #2e7d52;padding:14px 20px;border-radius:0 6px 6px 0}
.transcript{margin-top:32px;border-top:1px dashed #ccc;padding-top:20px}
.transcript-text{font-family:'Courier New',monospace;font-size:11px;color:#444;white-space:pre-wrap;line-height:1.8;background:#fafafa;padding:16px;border-radius:4px}
.footer{margin-top:40px;border-top:1px solid #e0e0e0;padding-top:14px;font-family:'Courier New',monospace;font-size:10px;color:#aaa;display:flex;justify-content:space-between}
@media print{body{padding:20px 30px}}
</style></head><body>
<div class="header">
  <h1>${metadata.titre || 'Compte-rendu'}</h1>
  <div class="meta">
    <span>📅 ${metadata.date}</span>
    ${metadata.participants ? `<span>👥 ${metadata.participants}</span>` : ''}
    <span>🕐 Généré le ${now}</span>
  </div>
</div>

<h2>Résumé exécutif</h2>
<div class="resume">${report.resume_executif}</div>

${report.points_cles?.length ? `<h2>Points clés</h2><ul>${report.points_cles.map(p => `<li>${p}</li>`).join('')}</ul>` : ''}
${report.decisions_prises?.length ? `<h2>Décisions prises</h2><ul>${report.decisions_prises.map(d => `<li>${d}</li>`).join('')}</ul>` : ''}
${report.actions_a_faire?.length ? `<h2>Actions à réaliser</h2>${report.actions_a_faire.map(a => `<div class="action"><strong>${a.action}</strong>${a.responsable ? `<div class="action-label">👤 ${a.responsable}</div>` : ''}${a.echeance ? `<div class="action-label">📅 ${a.echeance}</div>` : ''}</div>`).join('')}` : ''}
${report.sujets_abordes?.length ? `<h2>Sujets abordés</h2><ul>${report.sujets_abordes.map(s => `<li>${s}</li>`).join('')}</ul>` : ''}
${(report as Report & { points_non_resolus?: string[] }).points_non_resolus?.length ? `<h2>Points non résolus</h2><ul>${(report as Report & { points_non_resolus?: string[] }).points_non_resolus!.map(p => `<li>${p}</li>`).join('')}</ul>` : ''}
${report.verbatim_importants?.length ? `<h2>Citations importantes</h2>${report.verbatim_importants.map(v => `<div class="verbatim">"${v}"</div>`).join('')}` : ''}
${report.prochaines_etapes ? `<h2>Prochaines étapes</h2><p>${report.prochaines_etapes}</p>` : ''}
${report.conclusion ? `<h2>Conclusion</h2><div class="conclusion">${report.conclusion}</div>` : ''}

<div class="transcript">
  <h2>Transcription complète (Whisper)</h2>
  <div class="transcript-text">${transcript.trim()}</div>
</div>
<div class="footer">
  <span>Wooder Reporter · Transcription Whisper + Claude</span>
  <span>${now}</span>
</div>
</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'setup' | 'recording' | 'transcribing' | 'review' | 'generating' | 'done';

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReporterPage() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [metadata, setMetadata] = useState<SessionMetadata>({
    titre: '',
    participants: '',
    date: new Date().toLocaleDateString('fr-FR'),
  });
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string>(generateId());

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // ─── Record ───────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    setError(null);
    sessionIdRef.current = generateId();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(1000);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
      setPhase('recording');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Impossible d'accéder au microphone : ${msg}`);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('transcribing');
  }, []);

  // ─── Transcribe ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'transcribing' || !audioBlob) return;

    const transcribe = async () => {
      setStatusMsg('Transcription Whisper en cours…');
      try {
        const form = new FormData();
        form.append('audio', audioBlob, 'recording.webm');

        const res = await fetch('/api/transcribe', { method: 'POST', body: form });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Erreur transcription');

        setTranscript(data.transcript);
        setPhase('review');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Transcription échouée : ${msg}`);
        setPhase('review'); // Fallback: édition manuelle
      } finally {
        setStatusMsg('');
      }
    };

    // Wait for MediaRecorder to fully stop and set audioBlob
    const timer = setTimeout(transcribe, 300);
    return () => clearTimeout(timer);
  }, [phase, audioBlob]);

  // ─── Generate Report ──────────────────────────────────────────────────────

  const generateReport = useCallback(async () => {
    if (!transcript.trim()) return;
    setPhase('generating');
    setError(null);

    try {
      setStatusMsg('Claude analyse la transcription…');
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, metadata }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReport(data.report);

      // Sauvegarde Supabase en arrière-plan
      setStatusMsg('Sauvegarde en cours…');
      let savedAudioUrl: string | null = null;
      if (audioBlob) {
        savedAudioUrl = await uploadAudio(audioBlob, sessionIdRef.current);
      }
      const id = await saveSession({
        id: sessionIdRef.current,
        titre: metadata.titre || 'Sans titre',
        participants: metadata.participants,
        date_seance: metadata.date,
        duration_seconds: recordingTime,
        audio_url: savedAudioUrl,
        transcript,
        report: data.report,
      });
      if (id) setSavedSessionId(id);

      setPhase('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase('review');
    } finally {
      setStatusMsg('');
    }
  }, [transcript, metadata, audioBlob, recordingTime]);

  const reset = () => {
    setPhase('setup');
    setTranscript('');
    setReport(null);
    setAudioUrl(null);
    setAudioBlob(null);
    setError(null);
    setRecordingTime(0);
    setSavedSessionId(null);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ background: C.bg, minHeight: '100svh', color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes pulse { 0%{transform:scale(.8);opacity:.8} 100%{transform:scale(2.2);opacity:0} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes slideIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        * { box-sizing: border-box; }
        input, textarea { font-family: inherit !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <header style={{
        borderBottom: `1px solid ${C.border}`, padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10,
        background: `${C.bg}f0`, backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: `${C.amber}20`, border: `1px solid ${C.amberDim}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🎙</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>Wooder Reporter</div>
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: 'monospace', letterSpacing: '0.07em' }}>WHISPER · CLAUDE · SUPABASE</div>
          </div>
        </div>
        {phase !== 'setup' && (
          <button onClick={reset} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
            Nouveau
          </button>
        )}
      </header>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px 80px', animation: 'slideIn .35s ease' }}>

        {/* ── SETUP ── */}
        {phase === 'setup' && (
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 400, fontFamily: "'DM Serif Display', Georgia, serif", marginBottom: 8, lineHeight: 1.2 }}>
              Enregistrez.<br /><span style={{ color: C.amberLight }}>Transcrivez. Reportez.</span>
            </h1>
            <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 24, lineHeight: 1.6 }}>
              Whisper (OpenAI) transcrit avec précision, Claude structure le rapport.
            </p>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Informations de séance</div>
              {[
                { key: 'titre', label: 'Titre', placeholder: 'Ex : Entretien RH — Pierre Martin' },
                { key: 'participants', label: 'Participants', placeholder: 'Ex : Pierre, Marie, Antoine' },
                { key: 'date', label: 'Date', placeholder: 'JJ/MM/AAAA' },
              ].map(({ key, label, placeholder }) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 4 }}>{label}</label>
                  <input
                    value={metadata[key as keyof SessionMetadata]}
                    onChange={e => setMetadata(m => ({ ...m, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontSize: 14, outline: 'none' }}
                  />
                </div>
              ))}
            </div>

            <div style={{ background: `${C.amber}08`, border: `1px solid ${C.amberDim}30`, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
              🎧 <strong style={{ color: C.text }}>AirPods :</strong> connectez-les avant de démarrer. Ils seront automatiquement sélectionnés comme micro principal.
            </div>

            {error && <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}30`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#e57373', marginBottom: 16 }}>{error}</div>}

            <button onClick={startRecording} style={{ width: '100%', background: C.amber, color: '#0f0e0c', border: 'none', borderRadius: 12, padding: 16, fontWeight: 700, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              🎙 Démarrer l&apos;enregistrement
            </button>
          </div>
        )}

        {/* ── RECORDING ── */}
        {phase === 'recording' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, paddingTop: 20 }}>
            {/* Pulsing mic */}
            <div style={{ position: 'relative', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ position: 'absolute', width: 80, height: 80, borderRadius: '50%', border: `2px solid ${C.red}`, animation: 'pulse 1.4s ease-out infinite', opacity: 0 }} />
              <div style={{ position: 'absolute', width: 80, height: 80, borderRadius: '50%', border: `2px solid ${C.red}`, animation: 'pulse 1.4s ease-out .5s infinite', opacity: 0 }} />
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, boxShadow: `0 0 24px ${C.red}66` }}>🎙</div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: C.red, fontFamily: 'monospace', letterSpacing: '0.15em', animation: 'blink 1.4s ease infinite' }}>● ENREGISTREMENT</div>
              <div style={{ fontSize: 44, fontFamily: 'monospace', fontWeight: 500, letterSpacing: '0.05em', marginTop: 4 }}>{formatTime(recordingTime)}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{metadata.titre || 'Séance en cours'}</div>
            </div>

            <button onClick={stopRecording} style={{ background: `${C.red}20`, border: `1px solid ${C.red}40`, color: C.red, borderRadius: 10, padding: '12px 32px', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
              ⏹ Arrêter et transcrire
            </button>

            <div style={{ fontSize: 12, color: C.textDim, textAlign: 'center', lineHeight: 1.6 }}>
              L&apos;audio est enregistré en local.<br />La transcription Whisper démarrera automatiquement.
            </div>
          </div>
        )}

        {/* ── TRANSCRIBING ── */}
        {phase === 'transcribing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, paddingTop: 40 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', border: `3px solid ${C.border}`, borderTop: `3px solid ${C.amber}`, animation: 'spin .8s linear infinite' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Transcription Whisper…</div>
              <div style={{ fontSize: 13, color: C.textMuted }}>Votre audio est analysé par OpenAI Whisper</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, fontFamily: 'monospace' }}>Durée ≈ {Math.round(recordingTime / 6)} sec</div>
            </div>
          </div>
        )}

        {/* ── REVIEW ── */}
        {phase === 'review' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: C.amberLight, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                ✓ Transcription — {recordingTime ? formatTime(recordingTime) : ''}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: C.textDim }}>
                {transcript.trim().split(/\s+/).filter(Boolean).length} mots
              </div>
            </div>

            {/* Editable transcript */}
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="La transcription apparaîtra ici — vous pouvez la corriger avant de générer le rapport."
              style={{ width: '100%', minHeight: 200, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', color: C.text, fontSize: 13, lineHeight: 1.7, resize: 'vertical', outline: 'none', marginBottom: 16 }}
            />

            {audioUrl && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, fontFamily: 'monospace' }}>AUDIO ENREGISTRÉ</div>
                <audio controls src={audioUrl} style={{ width: '100%', height: 36 }} />
              </div>
            )}

            {error && <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}30`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#e57373', marginBottom: 14 }}>{error}</div>}

            <button
              onClick={generateReport}
              disabled={!transcript.trim()}
              style={{ width: '100%', background: transcript.trim() ? C.amber : C.border, color: transcript.trim() ? '#0f0e0c' : C.textDim, border: 'none', borderRadius: 12, padding: 16, fontWeight: 700, fontSize: 15, cursor: transcript.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
            >
              ✨ Générer le rapport IA
            </button>
          </div>
        )}

        {/* ── GENERATING ── */}
        {phase === 'generating' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, paddingTop: 40 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', border: `3px solid ${C.border}`, borderTop: `3px solid ${C.amber}`, animation: 'spin .8s linear infinite' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{statusMsg || 'Analyse en cours…'}</div>
              <div style={{ fontSize: 13, color: C.textMuted }}>Claude structure votre compte-rendu</div>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              {['Résumé', 'Points clés', 'Actions', 'Citations', 'Conclusion'].map((s, i) => (
                <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: C.amberDim, animation: `blink 1.4s ease ${i * 0.15}s infinite` }}>{s}</div>
              ))}
            </div>
          </div>
        )}

        {/* ── DONE ── */}
        {phase === 'done' && report && (
          <div style={{ animation: 'slideIn .4s ease' }}>
            {savedSessionId && (
              <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}30`, borderRadius: 8, padding: '8px 14px', fontSize: 12, color: C.greenLight, marginBottom: 16, fontFamily: 'monospace' }}>
                ✓ Sauvegardé dans Supabase · {savedSessionId.slice(0, 8)}…
              </div>
            )}

            {/* Report display */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{metadata.titre || 'Compte-rendu'}</div>
              <div style={{ fontSize: 12, color: C.textMuted, fontFamily: 'monospace', marginBottom: 20 }}>{metadata.date}{metadata.participants && ` · ${metadata.participants}`}</div>

              {/* Résumé */}
              <Block label="Résumé exécutif">
                <div style={{ background: `${C.amber}10`, borderLeft: `3px solid ${C.amber}`, borderRadius: '0 8px 8px 0', padding: '12px 16px', fontSize: 14, lineHeight: 1.6 }}>
                  {report.resume_executif}
                </div>
              </Block>

              {report.points_cles?.length > 0 && (
                <Block label="Points clés">
                  {report.points_cles.map((p, i) => <ListRow key={i} text={p} />)}
                </Block>
              )}

              {report.decisions_prises?.length > 0 && (
                <Block label="Décisions prises">
                  {report.decisions_prises.map((d, i) => (
                    <div key={i} style={{ background: `${C.green}12`, border: `1px solid ${C.green}25`, borderRadius: 6, padding: '6px 12px', fontSize: 13, marginBottom: 4 }}>{d}</div>
                  ))}
                </Block>
              )}

              {report.actions_a_faire?.length > 0 && (
                <Block label="Actions à réaliser">
                  {report.actions_a_faire.map((a, i) => (
                    <div key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{a.action}</div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        {a.responsable && <span style={{ fontSize: 11, color: C.textMuted, fontFamily: 'monospace' }}>👤 {a.responsable}</span>}
                        {a.echeance && <span style={{ fontSize: 11, color: C.textMuted, fontFamily: 'monospace' }}>📅 {a.echeance}</span>}
                      </div>
                    </div>
                  ))}
                </Block>
              )}

              {report.verbatim_importants?.length > 0 && (
                <Block label="Citations importantes">
                  {report.verbatim_importants.map((v, i) => (
                    <div key={i} style={{ borderLeft: `2px solid ${C.borderLight}`, paddingLeft: 14, fontSize: 13, color: C.textMuted, fontStyle: 'italic', lineHeight: 1.6, marginBottom: 8 }}>"{v}"</div>
                  ))}
                </Block>
              )}

              {report.conclusion && (
                <Block label="Conclusion">
                  <div style={{ background: `${C.green}10`, borderLeft: `3px solid ${C.greenLight}`, borderRadius: '0 8px 8px 0', padding: '12px 16px', fontSize: 13, lineHeight: 1.6 }}>
                    {report.conclusion}
                  </div>
                </Block>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => printReport(report, metadata, transcript)}
                style={{ flex: 1, minWidth: 150, background: C.amber, color: '#0f0e0c', border: 'none', borderRadius: 10, padding: '13px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                📄 Télécharger PDF
              </button>
              {audioUrl && (
                <a href={audioUrl} download="enregistrement.webm" style={{ flex: 1, minWidth: 130, background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '13px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none' }}>
                  🎵 Audio .webm
                </a>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f0a832', fontFamily: 'monospace', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-block', width: 16, height: 1, background: '#8a5a10' }} />
        {label}
      </div>
      {children}
    </div>
  );
}

function ListRow({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 13, marginBottom: 5 }}>
      <span style={{ color: '#f0a832', fontFamily: 'monospace', flexShrink: 0 }}>→</span>
      {text}
    </div>
  );
}
