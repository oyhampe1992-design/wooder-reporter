'use client';

import { useState, useRef, useCallback } from 'react';
import { uploadAudio, saveSession } from '@/lib/supabase';
import type { SessionMetadata, Report } from '@/lib/types';

const SEGMENT_MS = 4 * 60 * 1000;

const C = {
  bg: '#0f0e0c', surface: '#1a1815',
  border: '#2e2b24', borderLight: '#3d3930',
  amber: '#d4891a', amberLight: '#f0a832', amberDim: '#8a5a10',
  text: '#e8e2d4', textMuted: '#9a9080', textDim: '#5a5448',
  red: '#c0392b', green: '#2e7d52', greenLight: '#3dab6e',
};

const fmt = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

const getMimeType = () => {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return 'audio/webm';
};

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function printReport(report: Report, meta: SessionMetadata, transcript: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  const now = new Date().toLocaleString('fr-FR');
  win.document.write(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Rapport — ${meta.titre || 'Entretien'}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,serif;color:#1a1a1a;padding:40px 60px;line-height:1.7;font-size:14px}
.header{border-bottom:2px solid #1a1a1a;padding-bottom:20px;margin-bottom:32px}
h1{font-size:26px;font-weight:700;letter-spacing:-0.02em;margin-bottom:8px}
.meta{font-family:'Courier New',monospace;font-size:11px;color:#666;display:flex;gap:20px;flex-wrap:wrap}
h2{font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8a6020;font-family:'Courier New',monospace;margin:26px 0 10px;padding-bottom:3px;border-bottom:1px solid #e0d0b0}
.resume{background:#faf7f0;border-left:3px solid #c8860e;padding:14px 18px;border-radius:0 6px 6px 0;font-size:15px}
ul{list-style:none}ul li{padding:4px 0 4px 20px;position:relative}ul li::before{content:'→';position:absolute;left:0;color:#c8860e}
.action{background:#f5f5f5;padding:9px 13px;border-radius:4px;margin-bottom:6px}
.lbl{font-family:'Courier New',monospace;font-size:10px;color:#888;text-transform:uppercase}
.verbatim{border-left:2px solid #ddd;padding:6px 14px;color:#444;font-style:italic;margin:5px 0}
.conclusion{background:#f0f4ee;border-left:3px solid #2e7d52;padding:13px 18px;border-radius:0 6px 6px 0}
.tx{margin-top:32px;border-top:1px dashed #ccc;padding-top:20px}
.tx-body{font-family:'Courier New',monospace;font-size:11px;color:#444;white-space:pre-wrap;line-height:1.8;background:#fafafa;padding:14px;border-radius:4px}
.footer{margin-top:40px;border-top:1px solid #e0e0e0;padding-top:12px;font-family:'Courier New',monospace;font-size:10px;color:#aaa;display:flex;justify-content:space-between}
@media print{body{padding:20px 30px}}
</style></head><body>
<div class="header">
  <h1>${meta.titre || 'Compte-rendu'}</h1>
  <div class="meta">
    <span>📅 ${meta.date}</span>
    ${meta.participants ? `<span>👥 ${meta.participants}</span>` : ''}
    <span>🕐 ${now}</span>
  </div>
</div>
<h2>Résumé exécutif</h2><div class="resume">${report.resume_executif}</div>
${report.points_cles?.length ? `<h2>Points clés</h2><ul>${report.points_cles.map(p => `<li>${p}</li>`).join('')}</ul>` : ''}
${report.decisions_prises?.length ? `<h2>Décisions prises</h2><ul>${report.decisions_prises.map(d => `<li>${d}</li>`).join('')}</ul>` : ''}
${report.actions_a_faire?.length ? `<h2>Actions à réaliser</h2>${report.actions_a_faire.map(a =>
  `<div class="action"><strong>${a.action}</strong>${a.responsable ? `<div class="lbl">👤 ${a.responsable}</div>` : ''}${a.echeance ? `<div class="lbl">📅 ${a.echeance}</div>` : ''}</div>`).join('')}` : ''}
${report.sujets_abordes?.length ? `<h2>Sujets abordés</h2><ul>${report.sujets_abordes.map(s => `<li>${s}</li>`).join('')}</ul>` : ''}
${report.verbatim_importants?.length ? `<h2>Citations importantes</h2>${report.verbatim_importants.map(v => `<div class="verbatim">"${v}"</div>`).join('')}` : ''}
${report.prochaines_etapes ? `<h2>Prochaines étapes</h2><p>${report.prochaines_etapes}</p>` : ''}
${report.conclusion ? `<h2>Conclusion</h2><div class="conclusion">${report.conclusion}</div>` : ''}
<div class="tx"><h2>Transcription complète (Whisper)</h2><div class="tx-body">${transcript.trim()}</div></div>
<div class="footer"><span>Wooder Reporter · Whisper + Claude</span><span>${now}</span></div>
</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

type Phase = 'setup' | 'recording' | 'review' | 'generating' | 'done';
interface SegmentStatus { index: number; status: 'recording' | 'transcribing' | 'done' | 'error'; }

export default function ReporterPage() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [meta, setMeta] = useState<SessionMetadata>({
    titre: '', participants: '', date: new Date().toLocaleDateString('fr-FR'),
  });
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [segments, setSegments] = useState<SegmentStatus[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isTranscriptionComplete, setIsTranscriptionComplete] = useState(false);
  const [blackScreen, setBlackScreen] = useState(false); // ← écran noir

  const streamRef = useRef<MediaStream | null>(null);
  const fullRecorderRef = useRef<MediaRecorder | null>(null);
  const fullChunksRef = useRef<Blob[]>([]);
  const segmentRecorderRef = useRef<MediaRecorder | null>(null);
  const segmentIndexRef = useRef(0);
  const segmentsCountRef = useRef(0);
  const segmentsDoneRef = useRef(0);
  const transcriptsRef = useRef<Map<number, string>>(new Map());
  const rotateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false);
  const sessionIdRef = useRef(uid());
  const wakeLockRef = useRef<WakeLockSentinel | null>(null); // ← wake lock

  const rebuildTranscript = useCallback(() => {
    const ordered = Array.from(transcriptsRef.current.entries())
      .sort(([a], [b]) => a - b).map(([, t]) => t).filter(Boolean).join(' ');
    setTranscript(ordered);
  }, []);

  const transcribeSegment = useCallback(async (blob: Blob, index: number) => {
    setSegments(prev => prev.map(s => s.index === index ? { ...s, status: 'transcribing' } : s));
    try {
      const form = new FormData();
      form.append('audio', blob, 'segment.webm');
      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      transcriptsRef.current.set(index, data.transcript || '');
      rebuildTranscript();
      setSegments(prev => prev.map(s => s.index === index ? { ...s, status: 'done' } : s));
    } catch {
      setSegments(prev => prev.map(s => s.index === index ? { ...s, status: 'error' } : s));
    } finally {
      segmentsDoneRef.current += 1;
      if (segmentsDoneRef.current >= segmentsCountRef.current) setIsTranscriptionComplete(true);
    }
  }, [rebuildTranscript]);

  const startSegmentRecorder = useCallback((stream: MediaStream, index: number) => {
    const mimeType = getMimeType();
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      transcribeSegment(blob, index);
    };
    recorder.start();
    segmentRecorderRef.current = recorder;
    segmentsCountRef.current += 1;
    setSegments(prev => [...prev, { index, status: 'recording' }]);
    rotateTimerRef.current = setTimeout(() => {
      if (!isRecordingRef.current) return;
      if (segmentRecorderRef.current?.state === 'recording') segmentRecorderRef.current.stop();
      const next = index + 1;
      segmentIndexRef.current = next;
      startSegmentRecorder(stream, next);
    }, SEGMENT_MS);
  }, [transcribeSegment]);

  // ── Acquérir le Wake Lock
  const acquireWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as Navigator & {
          wakeLock: { request: (type: string) => Promise<WakeLockSentinel> }
        }).wakeLock.request('screen');
      }
    } catch {
      // Wake Lock non supporté — pas bloquant
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    setError(null); setTranscript(''); setSegments([]);
    setIsTranscriptionComplete(false); setBlackScreen(false);
    transcriptsRef.current = new Map();
    segmentIndexRef.current = 0; segmentsCountRef.current = 0; segmentsDoneRef.current = 0;
    sessionIdRef.current = uid();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      isRecordingRef.current = true;

      await acquireWakeLock(); // ← garde l'écran allumé

      const mimeType = getMimeType();
      fullChunksRef.current = [];
      const fullRec = new MediaRecorder(stream, { mimeType });
      fullRec.ondataavailable = e => { if (e.data.size > 0) fullChunksRef.current.push(e.data); };
      fullRec.onstop = () => {
        const blob = new Blob(fullChunksRef.current, { type: mimeType });
        setAudioBlob(blob); setAudioUrl(URL.createObjectURL(blob));
      };
      fullRec.start(1000);
      fullRecorderRef.current = fullRec;
      startSegmentRecorder(stream, 0);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
      setPhase('recording');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Impossible d'accéder au microphone : ${msg}`);
    }
  }, [acquireWakeLock, startSegmentRecorder]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    setBlackScreen(false);
    releaseWakeLock(); // ← libère le wake lock
    if (rotateTimerRef.current) clearTimeout(rotateTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (segmentRecorderRef.current?.state === 'recording') segmentRecorderRef.current.stop();
    if (fullRecorderRef.current?.state === 'recording') fullRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setPhase('review');
  }, [releaseWakeLock]);

  const generateReport = useCallback(async () => {
    if (!transcript.trim()) return;
    setPhase('generating'); setError(null);
    try {
      setStatusMsg('Claude analyse la transcription…');
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, metadata: meta }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReport(data.report);
      setStatusMsg('Sauvegarde…');
      let savedAudioUrl: string | null = null;
      if (audioBlob) savedAudioUrl = await uploadAudio(audioBlob, sessionIdRef.current);
      const id = await saveSession({
        id: sessionIdRef.current, titre: meta.titre || 'Sans titre',
        participants: meta.participants, date_seance: meta.date,
        duration_seconds: recordingTime, audio_url: savedAudioUrl,
        transcript, report: data.report,
      });
      if (id) setSavedId(id);
      setPhase('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('review');
    } finally { setStatusMsg(''); }
  }, [transcript, meta, audioBlob, recordingTime]);

  const reset = () => {
    setPhase('setup'); setTranscript(''); setReport(null);
    setAudioUrl(null); setAudioBlob(null); setError(null);
    setRecordingTime(0); setSegments([]); setSavedId(null);
    setIsTranscriptionComplete(false); setBlackScreen(false);
    releaseWakeLock();
  };

  const pendingSegments = segments.filter(s => s.status !== 'done' && s.status !== 'error').length;

  return (
    <div style={{ background: C.bg, minHeight: '100svh', color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes pulse { 0%{transform:scale(.8);opacity:.8} 100%{transform:scale(2.2);opacity:0} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes slide { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        *{box-sizing:border-box} input,textarea{font-family:inherit!important}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
      `}</style>

      {/* ── ÉCRAN NOIR ── */}
      {blackScreen && (
        <div
          onClick={() => setBlackScreen(false)}
          style={{
            position: 'fixed', inset: 0, background: '#000', zIndex: 9999,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
            paddingBottom: 60,
          }}
        >
          {/* Indicateur discret que l'enregistrement tourne */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, opacity: 0.15 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.red, animation: 'blink 1.4s ease infinite' }} />
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#fff', letterSpacing: '0.1em' }}>
              {fmt(recordingTime)}
            </div>
            <div style={{ fontSize: 10, color: '#fff', letterSpacing: '0.08em' }}>
              appuyer pour rallumer
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10, background: `${C.bg}f0`, backdropFilter: 'blur(8px)' }}>
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

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px 80px', animation: 'slide .35s ease' }}>

        {/* ── SETUP ── */}
        {phase === 'setup' && (
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 400, fontFamily: "'DM Serif Display', Georgia, serif", marginBottom: 8, lineHeight: 1.2 }}>
              Enregistrez.<br /><span style={{ color: C.amberLight }}>Transcrivez. Reportez.</span>
            </h1>
            <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 24, lineHeight: 1.6 }}>
              Transcription Whisper par segments de 4 min — fonctionne pour des séances de plusieurs heures.
            </p>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Informations de séance</div>
              {([
                { key: 'titre' as const, label: 'Titre', placeholder: 'Ex : Formation — Équipe Oyhampe' },
                { key: 'participants' as const, label: 'Participants', placeholder: 'Ex : Pierre, Marie, Antoine' },
                { key: 'date' as const, label: 'Date', placeholder: 'JJ/MM/AAAA' },
              ]).map(({ key, label, placeholder }) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 4 }}>{label}</label>
                  <input value={meta[key]} onChange={e => setMeta(m => ({ ...m, [key]: e.target.value }))} placeholder={placeholder}
                    style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontSize: 14, outline: 'none' }} />
                </div>
              ))}
            </div>
            <div style={{ background: `${C.amber}08`, border: `1px solid ${C.amberDim}30`, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
              🎧 <strong style={{ color: C.text }}>AirPods :</strong> connectez avant de démarrer.<br />
              📱 <strong style={{ color: C.text }}>Écran noir :</strong> disponible pendant l&apos;enregistrement pour économiser la batterie.
            </div>
            {error && <Err msg={error} />}
            <Btn onClick={startRecording} primary>🎙 Démarrer l&apos;enregistrement</Btn>
          </div>
        )}

        {/* ── RECORDING ── */}
        {phase === 'recording' && (
          <div style={{ animation: 'slide .3s ease' }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '28px 20px', marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ position: 'relative', width: 76, height: 76, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'absolute', width: 76, height: 76, borderRadius: '50%', border: `2px solid ${C.red}`, animation: 'pulse 1.4s ease-out infinite', opacity: 0 }} />
                <div style={{ position: 'absolute', width: 76, height: 76, borderRadius: '50%', border: `2px solid ${C.red}`, animation: 'pulse 1.4s ease-out .5s infinite', opacity: 0 }} />
                <div style={{ width: 54, height: 54, borderRadius: '50%', background: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, boxShadow: `0 0 24px ${C.red}55` }}>🎙</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: C.red, fontFamily: 'monospace', letterSpacing: '0.14em', animation: 'blink 1.4s ease infinite' }}>● ENREGISTREMENT</div>
                <div style={{ fontSize: 44, fontFamily: 'monospace', fontWeight: 500, letterSpacing: '0.04em', marginTop: 4 }}>{fmt(recordingTime)}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{meta.titre || 'Séance en cours'}</div>
              </div>

              {/* Boutons */}
              <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                {/* Écran noir */}
                <button onClick={() => setBlackScreen(true)} style={{
                  flex: 1, background: '#111', border: `1px solid ${C.border}`,
                  color: C.textMuted, borderRadius: 10, padding: '11px 16px',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  🌑 Écran noir
                </button>
                {/* Arrêter */}
                <button onClick={stopRecording} style={{
                  flex: 1, background: `${C.red}20`, border: `1px solid ${C.red}40`,
                  color: C.red, borderRadius: 10, padding: '11px 16px',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  ⏹ Arrêter
                </button>
              </div>
            </div>

            {segments.length > 0 && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Transcription en temps réel</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {segments.map(s => <SegmentRow key={s.index} segment={s} />)}
                </div>
                {transcript && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.textMuted, lineHeight: 1.6, fontStyle: 'italic', maxHeight: 80, overflowY: 'auto' }}>
                    {transcript.slice(-300)}…
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── REVIEW ── */}
        {phase === 'review' && (
          <div style={{ animation: 'slide .3s ease' }}>
            {segments.length > 0 && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                  {isTranscriptionComplete ? '✓ Transcription complète' : `En cours (${pendingSegments} segment${pendingSegments > 1 ? 's' : ''} restant${pendingSegments > 1 ? 's' : ''})…`}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {segments.map(s => <SegmentRow key={s.index} segment={s} compact />)}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: C.amberLight, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Transcription · {fmt(recordingTime)}</div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: C.textDim }}>{transcript.trim().split(/\s+/).filter(Boolean).length} mots</div>
            </div>
            <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
              placeholder="Transcription en cours — vous pouvez déjà corriger…"
              style={{ width: '100%', minHeight: 200, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', color: C.text, fontSize: 13, lineHeight: 1.7, resize: 'vertical', outline: 'none', marginBottom: 14 }} />
            {audioUrl && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.textMuted, marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Audio complet</div>
                <audio controls src={audioUrl} style={{ width: '100%', height: 36 }} />
              </div>
            )}
            {error && <Err msg={error} />}
            <Btn onClick={generateReport} disabled={!transcript.trim()} primary>✨ Générer le rapport IA</Btn>
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
          </div>
        )}

        {/* ── DONE ── */}
        {phase === 'done' && report && (
          <div style={{ animation: 'slide .4s ease' }}>
            {savedId && (
              <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}30`, borderRadius: 8, padding: '8px 14px', fontSize: 12, color: C.greenLight, marginBottom: 14, fontFamily: 'monospace' }}>
                ✓ Sauvegardé · {savedId.slice(0, 8)}…
              </div>
            )}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{meta.titre || 'Compte-rendu'}</div>
              <div style={{ fontSize: 12, color: C.textMuted, fontFamily: 'monospace', marginBottom: 20 }}>
                {meta.date}{meta.participants && ` · ${meta.participants}`}
              </div>
              <Blk label="Résumé exécutif">
                <div style={{ background: `${C.amber}10`, borderLeft: `3px solid ${C.amber}`, borderRadius: '0 8px 8px 0', padding: '12px 16px', fontSize: 14, lineHeight: 1.6 }}>{report.resume_executif}</div>
              </Blk>
              {report.points_cles?.length > 0 && <Blk label="Points clés">{report.points_cles.map((p, i) => <Row key={i} text={p} />)}</Blk>}
              {report.decisions_prises?.length > 0 && (
                <Blk label="Décisions prises">
                  {report.decisions_prises.map((d, i) => (
                    <div key={i} style={{ background: `${C.green}12`, border: `1px solid ${C.green}25`, borderRadius: 6, padding: '6px 12px', fontSize: 13, marginBottom: 4 }}>{d}</div>
                  ))}
                </Blk>
              )}
              {report.actions_a_faire?.length > 0 && (
                <Blk label="Actions à réaliser">
                  {report.actions_a_faire.map((a, i) => (
                    <div key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{a.action}</div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        {a.responsable && <span style={{ fontSize: 11, color: C.textMuted, fontFamily: 'monospace' }}>👤 {a.responsable}</span>}
                        {a.echeance && <span style={{ fontSize: 11, color: C.textMuted, fontFamily: 'monospace' }}>📅 {a.echeance}</span>}
                      </div>
                    </div>
                  ))}
                </Blk>
              )}
              {report.verbatim_importants?.length > 0 && (
                <Blk label="Citations importantes">
                  {report.verbatim_importants.map((v, i) => (
                    <div key={i} style={{ borderLeft: `2px solid ${C.borderLight}`, paddingLeft: 14, fontSize: 13, color: C.textMuted, fontStyle: 'italic', lineHeight: 1.6, marginBottom: 8 }}>&ldquo;{v}&rdquo;</div>
                  ))}
                </Blk>
              )}
              {report.conclusion && (
                <Blk label="Conclusion">
                  <div style={{ background: `${C.green}10`, borderLeft: `3px solid ${C.greenLight}`, borderRadius: '0 8px 8px 0', padding: '12px 16px', fontSize: 13, lineHeight: 1.6 }}>{report.conclusion}</div>
                </Blk>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Btn onClick={() => printReport(report, meta, transcript)} primary style={{ flex: 1, minWidth: 150 }}>📄 Télécharger PDF</Btn>
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

function Btn({ onClick, children, primary = false, disabled = false, style = {} }: {
  onClick?: () => void; children: React.ReactNode;
  primary?: boolean; disabled?: boolean; style?: React.CSSProperties;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', border: 'none', borderRadius: 12, padding: '15px 20px',
      fontWeight: 700, fontSize: 15, cursor: disabled ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      background: primary ? (disabled ? '#3d3930' : '#d4891a') : '#1a1815',
      color: primary ? (disabled ? '#5a5448' : '#0f0e0c') : '#e8e2d4',
      ...style,
    }}>{children}</button>
  );
}

function Err({ msg }: { msg: string }) {
  return <div style={{ background: '#c0392b15', border: '1px solid #c0392b30', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#e57373', marginBottom: 14 }}>{msg}</div>;
}

function Blk({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f0a832', fontFamily: 'monospace', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-block', width: 14, height: 1, background: '#8a5a10' }} /> {label}
      </div>
      {children}
    </div>
  );
}

function Row({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 13, marginBottom: 5 }}>
      <span style={{ color: '#f0a832', fontFamily: 'monospace', flexShrink: 0 }}>→</span>{text}
    </div>
  );
}

function SegmentRow({ segment, compact = false }: { segment: SegmentStatus; compact?: boolean }) {
  const icons = { recording: '⏺', transcribing: '🔄', done: '✓', error: '✗' };
  const colors = { recording: '#c0392b', transcribing: '#d4891a', done: '#3dab6e', error: '#e57373' };
  const labels = { recording: 'En cours', transcribing: 'Whisper…', done: 'Transcrit', error: 'Erreur' };

  if (compact) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'monospace', color: colors[segment.status] }}>
      <span style={{ animation: segment.status === 'transcribing' ? 'spin .8s linear infinite' : 'none', display: 'inline-block' }}>{icons[segment.status]}</span>
      S{segment.index + 1}
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
      <span style={{ color: colors[segment.status], animation: segment.status === 'transcribing' ? 'spin .8s linear infinite' : 'none', display: 'inline-block', width: 16, textAlign: 'center' }}>{icons[segment.status]}</span>
      <span style={{ color: '#e8e2d4' }}>Segment {segment.index + 1}</span>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: colors[segment.status] }}>{labels[segment.status]}</span>
    </div>
  );
}
