export type VideoMetadata = { title: string; author: string; description: string };
export type Clip = { title: string; hook: string; viralityScore: number; summary: string; startTime: number; endTime: number; videoId?: string };

const ID = '[a-zA-Z0-9_-]{11}';
const ID_RE = new RegExp(`^${ID}$`);
export function getYouTubeId(value: string) {
  const decoded = decodeURIComponent(value.trim());
  if (ID_RE.test(decoded)) return decoded;
  try {
    const url = new URL(decoded.includes('://') ? decoded : `https://${decoded}`);
    const id = url.searchParams.get('v') || url.pathname.match(new RegExp(`/(?:shorts|embed|live|v)/(${ID})`))?.[1] || '';
    return ID_RE.test(id) ? id : '';
  } catch { return ''; }
}

async function json(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('metadata unavailable');
  return response.json();
}
export async function fetchMetadata(id: string): Promise<VideoMetadata> {
  const url = `https://www.youtube.com/watch?v=${id}`;
  const results = await Promise.allSettled([
    json(`https://noembed.com/embed?url=${encodeURIComponent(url)}`),
    json(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`),
  ]);
  const data = results.map(r => r.status === 'fulfilled' ? r.value : null).find(x => x && typeof x.title === 'string' && x.title.trim());
  if (!data) throw new Error('Video not found or unavailable. Please check the YouTube URL.');
  return { title: data.title.trim(), author: String(data.author_name || data.author || 'Unknown channel').trim(), description: String(data.description || '').trim() };
}

export function dynamicFallback(meta: VideoMetadata): Clip[] {
  const subject = meta.title.replace(/\s+/g, ' ').trim();
  const channel = meta.author.replace(/\s+/g, ' ').trim();
  const terms = subject.split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 3).join(' ');
  return Array.from({ length: 5 }, (_, i) => { const start = 30 + i * 150; return { title: `${terms || subject} — moment ${i + 1}`, hook: `The moment ${channel} changes the conversation about ${terms || subject}`, summary: `A potential highlight from “${subject}” by ${channel}, selected around ${Math.floor(start / 60)}:${String(start % 60).padStart(2, '0')}.`, viralityScore: 72 - i * 3, startTime: start, endTime: start + 42 }; });
}
export function parseClips(raw: string): Clip[] | null {
  try { const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || raw); if (!Array.isArray(parsed) || parsed.length < 5) return null; const clips = parsed.slice(0, 5).map((x: any, i) => ({ title: String(x.title || ''), hook: String(x.hook || ''), summary: String(x.summary || x.description || ''), viralityScore: Math.max(0, Math.min(100, Number(x.viralityScore ?? x.virality_score) || 0)), startTime: Math.max(30, Number(x.startTime ?? x.start_time) || 30 + i * 60), endTime: Number(x.endTime ?? x.end_time) || 72 + i * 60 })); return clips.every(c => c.title && c.hook && c.endTime > c.startTime && c.startTime >= 30 && c.endTime <= 900) ? clips : null; } catch { return null; }
}
