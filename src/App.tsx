import { useState } from 'react';
import { Sparkles, Download, Search, Loader2 } from 'lucide-react';
import JSZip from 'jszip';

type C = { title: string; hook: string; virality_score: number; reasoning: string; start_time: number; end_time: number; segment_text: string };
const demo: C[] = [{ title: 'The Mind-Blowing Truth', hook: 'Nobody tells you this…', virality_score: 94, reasoning: 'Curiosity gap and emotional payoff.', start_time: 42, end_time: 68, segment_text: 'The biggest shift happens when you stop waiting and start shipping.' }];

const YOUTUBE_ID = '[a-zA-Z0-9_-]{11}';
const BROAD_ID_PATTERN = new RegExp(`(?:v=|/v/|youtu\\.be/|/shorts/|/embed/|/live/|%3Dv%3D|%3D)(${YOUTUBE_ID})`, 'i');
const DIRECT_ID_PATTERN = new RegExp(`^${YOUTUBE_ID}$`);

function repeatedlyDecode(value: string): string {
  let decoded = value;
  for (let i = 0; i < 5; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

// Accept raw, encoded, Google redirect, tracked, and all common YouTube URL forms.
export function getYouTubeId(value: string): string {
  const decoded = repeatedlyDecode(value.trim());
  const broadMatch = decoded.match(BROAD_ID_PATTERN)?.[1];
  if (broadMatch) return broadMatch;
  if (DIRECT_ID_PATTERN.test(decoded)) return decoded;

  const candidates = [decoded];
  try {
    const parsed = new URL(decoded.includes('://') ? decoded : `https://${decoded}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\\./, '');
    if (host === 'google.com' || host === 'google.co.uk' || host.endsWith('.google.com')) {
      for (const key of ['url', 'q']) {
        const target = parsed.searchParams.get(key);
        if (target) candidates.push(repeatedlyDecode(target));
      }
    }
  } catch { /* broad matching below handles malformed search-result URLs */ }

  for (const candidate of candidates) {
    const match = candidate.match(BROAD_ID_PATTERN)?.[1];
    if (match) return match;
    if (DIRECT_ID_PATTERN.test(candidate)) return candidate;
    try {
      const url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
      const host = url.hostname.toLowerCase().replace(/^www\\./, '');
      if (!['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) continue;
      if (host === 'youtu.be') {
        const id = url.pathname.slice(1).match(new RegExp(`^${YOUTUBE_ID}`))?.[0];
        if (id) return id;
      }
      const queryId = url.searchParams.get('v')?.match(new RegExp(`^${YOUTUBE_ID}`))?.[0];
      if (queryId) return queryId;
      const pathId = url.pathname.match(new RegExp(`^/(?:v|shorts|embed|live)/(${YOUTUBE_ID})`, 'i'))?.[1];
      if (pathId) return pathId;
    } catch { /* continue with the next candidate */ }
  }
  return '';
}

const decode = (s: string) => { const el = document.createElement('textarea'); el.innerHTML = s; return el.value; };
async function fetchTranscript(videoId: string): Promise<string> {
  const urls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
    `https://video.google.com/timedtext?lang=en&v=${videoId}&fmt=srv3`,
    `https://corsproxy.io/?url=${encodeURIComponent(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`)}`
  ];
  for (const endpoint of urls) {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) continue;
      const xml = await response.text();
      const lines = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)].map(m => decode(m[1].replace(/<br\s*\/?>/gi, '\n')));
      if (lines.length) return lines.join(' ');
    } catch { /* try the next public endpoint */ }
  }
  return '';
}
async function videoMetadata(id: string) {
  try { const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`); if (r.ok) return await r.json(); } catch { /* metadata is optional */ }
  return { title: `YouTube video ${id}`, author_name: 'YouTube creator' };
}

export default function App() {
  const [u, setU] = useState(''), [t, setT] = useState(''), [cs, setCs] = useState<C[]>([]), [sel, setSel] = useState<C | null>(null), [cap, setCap] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  async function forge(source = t, fallback = false) {
    if (!source) return setMsg('No transcript or captions were available for this video.');
    setBusy(true); setMsg(fallback ? 'Captions unavailable; generating an estimated breakdown from video metadata…' : 'Analyzing transcript…');
    try {
      const r = await fetch('https://text.pollinations.ai/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: `Return ONLY JSON array of exactly 5 viral moments with title,hook,virality_score,reasoning,start_time,end_time,segment_text. ${fallback ? 'These are estimates: use the video metadata and clearly infer plausible timestamp ranges.' : ''} Source: ${source}` }) });
      const x = JSON.parse((await r.text()).match(/\[[\s\S]*\]/)?.[0] || '');
      if (!Array.isArray(x) || !x.length) throw new Error('empty analysis');
      setCs(x); setSel(x[0]); setCap(x[0].segment_text); setMsg(fallback ? 'Captions were unavailable; this timestamped breakdown is an AI estimate.' : 'Transcript fetched and analyzed automatically.');
    } catch { setCs(demo); setSel(demo[0]); setCap(demo[0].segment_text); setMsg('AI analysis was unavailable; showing a fallback clip.'); }
    finally { setBusy(false); }
  }
  async function load() {
    const videoId = getYouTubeId(u); if (!videoId) return setMsg('Invalid YouTube URL.');
    setBusy(true); setMsg('Fetching captions automatically…');
    const transcript = await fetchTranscript(videoId); setT(transcript);
    const meta = await videoMetadata(videoId);
    setBusy(false);
    if (transcript) await forge(transcript);
    else await forge(`Video title: ${meta.title}. Channel: ${meta.author_name}. Video ID: ${videoId}. Generate an estimated timestamped breakdown.`, true);
  }
  async function dl() { const z = new JSZip(); cs.forEach((c, i) => z.file(`clip-${i + 1}.srt`, `1\n00:00:00,000 --> 00:00:30,000\n${c.segment_text}`)); const b = await z.generateAsync({ type: 'blob' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'clipforge-captions.zip'; a.click(); }
  const videoId = getYouTubeId(u);
  return <main className="min-h-screen grid-bg"><header className="max-w-6xl mx-auto p-6 flex justify-between"><b className="text-2xl">CLIP<span className="text-emerald-400">FORGE</span></b><button onClick={dl} className="border border-zinc-700 rounded-lg px-4 py-2"><Download size={16} /></button></header><div className="max-w-6xl mx-auto p-6"><div className="glass rounded-3xl p-8"><p className="text-emerald-400 font-mono">// AI CREATOR STUDIO</p><h1 className="text-5xl font-bold mt-3">Long-form in. <span className="text-emerald-400">Viral shorts out.</span></h1><div className="flex gap-3 mt-8"><div className="flex-1 flex gap-2 items-center bg-zinc-950 border border-zinc-700 rounded-xl px-4"><Search size={18} /><input value={u} onChange={e => setU(e.target.value)} placeholder="YouTube URL" className="bg-transparent outline-none w-full py-4" /></div><button className="bg-white text-black rounded-xl px-5" onClick={load} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : 'Load'}</button></div><textarea value={t} onChange={e => setT(e.target.value)} placeholder="Captions are fetched automatically; paste a transcript only as an optional fallback." className="w-full h-28 mt-3 bg-zinc-950 border border-zinc-700 rounded-xl p-4" /><button onClick={() => forge()} disabled={busy} className="mt-3 bg-emerald-400 text-black font-bold rounded-xl px-5 py-3 flex gap-2"><Sparkles /> Forge 5 clips</button><p className="text-amber-300 mt-3">{msg}</p></div>{cs.length > 0 && <div className="grid md:grid-cols-[330px_1fr] gap-5 mt-6"><aside><h2 className="font-bold mb-3">Viral moments <span className="text-emerald-400">{String(cs.length).padStart(2, '0')}</span></h2>{cs.map((c, i) => <button key={`${c.title}-${i}`} onClick={() => { setSel(c); setCap(c.segment_text); }} className="glass rounded-xl p-4 mb-3 w-full text-left"><small className="text-emerald-400">0{i + 1} · {c.virality_score}% VIRAL</small><h3 className="font-bold mt-2">{c.title}</h3><p className="text-zinc-400 text-sm">{c.hook}</p></button>)}</aside><section className="glass rounded-2xl p-5 grid md:grid-cols-[280px_1fr] gap-6"><div className="aspect-[9/16] bg-zinc-950 rounded-xl relative overflow-hidden">{videoId && <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${videoId}?start=${sel?.start_time ?? 0}`} title="Preview" />}<div className="absolute bottom-8 text-center p-3 font-bold w-full text-xl">{cap}</div></div><div><p className="text-emerald-400 font-mono">// EDITOR</p><h2 className="text-2xl font-bold">{sel?.title}</h2><p className="text-zinc-400 mt-2">{sel?.reasoning}</p><textarea value={cap} onChange={e => setCap(e.target.value)} className="w-full h-28 mt-6 bg-zinc-950 border border-zinc-700 rounded-lg p-3" /><button onClick={dl} className="w-full mt-5 bg-emerald-400 text-black font-bold rounded-xl py-3"><Download className="inline" /> Download captions + metadata</button></div></section></div>}</div></main>;
}