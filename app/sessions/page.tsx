'use client';

import { useState, useEffect } from 'react';
import { getSessions, getSession } from '@/lib/supabase';
import type { Report } from '@/lib/types';

const C = {
  bg: '#0f0e0c', surface: '#1a1815',
  border: '#2e2b24', borderLight: '#3d3930',
  amber: '#d4891a', amberLight: '#f0a832', amberDim: '#8a5a10',
  text: '#e8e2d4', textMuted: '#9a9080', textDim: '#5a5448',
  red: '#c0392b', green: '#2e7d52', greenLight: '#3dab6e',
};

const fmt = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

interface SessionRow {
  id: string; titre: string; participants: string;
  date_seance: string; duration_seconds: number;
  audio_url: string | null; created_at: string;
}
interface SessionFull extends SessionRow { transcript: string; report: Report | null; }

function printReport(report: Report, titre: string, participants: string, date: string, transcript: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  const now = new Date().toLocaleString('fr-FR');
  win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Rapport — ${titre}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Georgia,serif;color:#1a1a1a;padding:40px 60px;line-height:1.7;font-size:14px}.header{border-bottom:2px solid #1a1a1a;padding-bottom:20px;margin-bottom:32px}h1{font-size:26px;font-weight:700;margin-bottom:8px}.meta{font-family:'Courier New',monospace;font-size:11px;color:#666;display:flex;gap:20px;flex-wrap:wrap}h2{font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8a6020;font-family:'Courier New',monospace;margin:26px 0 10px;padding-bottom:3px;border-bottom:1px solid #e0d0b0}.resume{background:#faf7f0;border-left:3px solid #c8860e;padding:14px 18px;border-radius:0 6px 6px 0;font-size:15px}ul{list-style:none}ul li{padding:4px 0 4px 20px;position:relative}ul li::before{content:'→';position:absolute;left:0;color:#c8860e}.action{background:#f5f5f5;padding:9px 13px;border-radius:4px;margin-bottom:6px}.lbl{font-family:'Courier New',monospace;font-size:10px;color:#888;text-transform:uppercase}.verbatim{border-left:2px solid #ddd;padding:6px 14px;color:#444;font-style:italic;margin:5px 0}.conclusion{background:#f0f4ee;border-left:3px solid #2e7d52;padding:13px 18px;border-radius:0 6px 6px 0}.tx{margin-top:32px;border-top:1px dashed #ccc;padding-top:20px}.tx-body{font-family:'Courier New',monospace;font-size:11px;color:#444;white-space:pre-wrap;line-height:1.8;background:#fafafa;padding:14px;border-radius:4px}.footer{margin-top:40px;border-top:1px solid #e0e0e0;padding-top:12px;font-family:'Courier New',monospace;font-size:10px;color:#aaa;display:flex;justify-content:space-between}@media print{body{padding:20px 30px}}</style></head><body>
<div class="header"><h1>${titre}</h1><div class="meta"><span>📅 ${date}</span>${participants ? `<span>👥 ${participants}</span>` : ''}<span>🕐 ${now}</span></div></div>
<h2>Résumé exécutif</h2><div class="resume">${report.resume_executif}</div>
${report.points_cles?.length ? `<h2>Points clés</h2><ul>${report.points_cles.map(p => `<li>${p}</li>`).join('')}</ul>` : ''}
${report.decisions_prises?.length ? `<h2>Décisions prises</h2><ul>${report.decisions_prises.map(d => `<li>${d}</li>`).join('')}</ul>` : ''}
${report.actions_a_faire?.length ? `<h2>Actions à réaliser</h2>${report.actions_a_faire.map(a => `<div class="action"><strong>${a.action}</strong>${a.responsable ? `<div class="lbl">👤 ${a.responsable}</div>` : ''}${a.echeance ? `<div class="lbl">📅 ${a.echeance}</div>` : ''}</div>`).join('')}` : ''}
${report.verbatim_importants?.length ? `<h2>Citations importantes</h2>${report.verbatim_importants.map(v => `<div class="verbatim">"${v}"</div>`).join('')}` : ''}
${report.conclusion ? `<h2>Conclusion</h2><div class="conclusion">${report.conclusion}</div>` : ''}
<div class="tx"><h2>Transcription</h2><div class="tx-body">${transcript.trim()}</div></div>
<div class="footer"><span>Wooder Reporter</span><span>${now}</span></div></body></html>`);
  win.document.close(); setTimeout(() => win.print(), 500);
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SessionFull | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    getSessions().then(d => { setSessions(d as SessionRow[]); setLoading(false); });
  }, []);

  const openSession = async (id: string) => {
    setLoadingDetail(true);
    const data = await getSession(id);
    setSelected(data as SessionFull);
    setShowTranscript(false);
    setLoadingDetail(false);
  };

  return (
    <div style={{ background: C.bg, minHeight: '100svh', color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@keyframes slide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}`}</style>

      <header style={{ borderBottom: `1px solid ${C.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10, background: `${C.bg}f0`, backdropFilter: 'blur(8px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selected && <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: C.amberLight, fontSize: 20, cursor: 'pointer', padding: '0 8px 0 0' }}>←</button>}
          <div style={{ width: 30, height: 30, borderRadius: 7, background: `${C.amber}20`, border: `1px solid ${C.amberDim}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📋</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{selected ? (selected.titre || 'Séance') : 'Mes sessions'}</div>
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: 'monospace', letterSpacing: '0.07em' }}>{selected ? selected.date_seance : `${sessions.length} enregistrement${sessions.length > 1 ? 's' : ''}`}</div>
          </div>
        </div>
        <a href="/" style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', textDecoration: 'none' }}>+ Nouveau</a>
      </header>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 80px' }}>

        {/* LISTE */}
        {!selected && !loadingDetail && (
          <div style={{ animation: 'slide .3s ease' }}>
            {loading && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><div style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${C.border}`, borderTop: `2px solid ${C.amber}`, animation: 'spin .8s linear infinite' }} /></div>}
            {!loading && sessions.length === 0 && (
              <div style={{ textAlign: 'center', paddingTop: 60, color: C.textMuted }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🎙</div>
                <div style={{ fontSize: 14 }}>Aucune session enregistrée</div>
                <a href="/" style={{ display: 'inline-block', marginTop: 16, color: C.amberLight, fontSize: 13, textDecoration: 'none' }}>Démarrer un enregistrement →</a>
              </div>
            )}
            {sessions.map(s => (
              <button key={s.id} onClick={() => openSession(s.id)} style={{ width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px', marginBottom: 10, cursor: 'pointer', textAlign: 'left', animation: 'slide .3s ease', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.titre || 'Sans titre'}</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: C.textMuted, fontFamily: 'monospace' }}>📅 {s.date_seance}</span>
                    {s.participants && <span style={{ fontSize: 11, color: C.textMuted, fontFamily: 'monospace' }}>👥 {s.participants}</span>}
                    {s.duration_seconds > 0 && <span style={{ fontSize: 11, color: C.textDim, fontFamily: 'monospace' }}>⏱ {fmt(s.duration_seconds)}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {s.audio_url && <span style={{ fontSize: 11, background: `${C.amber}20`, color: C.amberLight, borderRadius: 4, padding: '2px 6px', fontFamily: 'monospace' }}>🎵</span>}
                  <span style={{ fontSize: 11, background: `${C.green}15`, color: C.greenLight, borderRadius: 4, padding: '2px 6px', fontFamily: 'monospace' }}>PDF</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* CHARGEMENT */}
        {loadingDetail && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><div style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${C.border}`, borderTop: `2px solid ${C.amber}`, animation: 'spin .8s linear infinite' }} /></div>}

        {/* DÉTAIL */}
        {selected && !loadingDetail && (
          <div style={{ animation: 'slide .35s ease' }}>
            {selected.audio_url && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>🎵 Audio · {fmt(selected.duration_seconds)}</div>
                <audio controls src={selected.audio_url} style={{ width: '100%', height: 36 }} />
              </div>
            )}

            {selected.report && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 14 }}>
                <Blk label="Résumé exécutif">
                  <div style={{ background: `${C.amber}10`, borderLeft: `3px solid ${C.amber}`, borderRadius: '0 8px 8px 0', padding: '12px 16px', fontSize: 14, lineHeight: 1.6 }}>{selected.report.resume_executif}</div>
                </Blk>
                {selected.report.points_cles?.length > 0 && <Blk label="Points clés">{selected.report.points_cles.map((p, i) => <Row key={i} text={p} />)}</Blk>}
                {selected.report.decisions_prises?.length > 0 && (
                  <Blk label="Décisions prises">{selected.report.decisions_prises.map((d, i) => <div key={i} style={{ background: `${C.green}12`, border: `1px solid ${C.green}25`, borderRadius: 6, padding: '6px 12px', fontSize: 13, marginBottom: 4 }}>{d}</div>)}</Blk>
                )}
                {selected.report.actions_a_faire?.length > 0 && (
                  <Blk label="Actions à réaliser">
                    {selected.report.actions_a_faire.map((a, i) => (
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
                {selected.report.verbatim_importants?.length > 0 && (
                  <Blk label="Citations importantes">
                    {selected.report.verbatim_importants.map((v, i) => <div key={i} style={{ borderLeft: `2px solid ${C.borderLight}`, paddingLeft: 14, fontSize: 13, color: C.textMuted, fontStyle: 'italic', lineHeight: 1.6, marginBottom: 8 }}>&ldquo;{v}&rdquo;</div>)}
                  </Blk>
                )}
                {selected.report.conclusion && (
                  <Blk label="Conclusion">
                    <div style={{ background: `${C.green}10`, borderLeft: `3px solid ${C.greenLight}`, borderRadius: '0 8px 8px 0', padding: '12px 16px', fontSize: 13, lineHeight: 1.6 }}>{selected.report.conclusion}</div>
                  </Blk>
                )}
              </div>
            )}

            {selected.transcript && (
              <div style={{ marginBottom: 14 }}>
                <button onClick={() => setShowTranscript(t => !t)} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer', width: '100%', fontFamily: 'monospace' }}>
                  {showTranscript ? '▲ Masquer la transcription' : '▼ Voir la transcription complète'}
                </button>
                {showTranscript && (
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '14px 16px', fontSize: 12, color: C.textMuted, lineHeight: 1.8, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
                    {selected.transcript}
                  </div>
                )}
              </div>
            )}

            {selected.report && (
              <button onClick={() => printReport(selected.report!, selected.titre, selected.participants, selected.date_seance, selected.transcript)} style={{ width: '100%', background: C.amber, color: '#0f0e0c', border: 'none', borderRadius: 12, padding: '15px', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                📄 Télécharger PDF
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Blk({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f0a832', fontFamily: 'monospace', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-block', width: 14, height: 1, background: '#8a5a10' }} />{label}
      </div>
      {children}
    </div>
  );
}

function Row({ text }: { text: string }) {
  return <div style={{ display: 'flex', gap: 10, fontSize: 13, marginBottom: 5 }}><span style={{ color: '#f0a832', fontFamily: 'monospace', flexShrink: 0 }}>→</span>{text}</div>;
}
