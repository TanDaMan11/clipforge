import { Clip, VideoMetadata, dynamicFallback, parseClips } from './analyze';

export async function analyzeVideo(meta: VideoMetadata): Promise<Clip[]> {
  const prompt = `You are editing the exact YouTube video described below. Return ONLY a JSON array containing exactly 5 genuinely different short-form clip candidates. Use the title, channel, and description to infer this video's actual subject and tone. Every title, hook, and summary must be specific to that subject; do not use generic reusable labels, stock story arcs, or facts not supported by the metadata. Choose varied moments and angles (for example an insight, reaction, explanation, surprising detail, or conclusion only when appropriate to this video). Use distinct timestamps from 0 to 900 seconds, with startTime before endTime and each clip 20-90 seconds long. If the duration is unknown, spread timestamps realistically across the first 15 minutes. Scores must be integers from 0 to 100.\nVideo title: ${meta.title}\nChannel/author: ${meta.author}\nDescription: ${meta.description || '(not provided)'}\nRequired schema: [{"title":"...","hook":"...","summary":"...","startTime":30,"endTime":72,"viralityScore":80}]`;
  const body = JSON.stringify({ messages: [{ role: 'user', content: prompt }], model: 'openai', jsonMode: true });
  try {
    const response = await fetch('https://text.pollinations.ai/', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body, signal: AbortSignal.timeout(20000) });
    if (response.ok) { const clips = parseClips(await response.text()); if (clips) return clips; console.warn('Pollinations returned invalid clip JSON'); }
    else console.warn(`Pollinations POST failed: ${response.status}`);
  } catch (error) { console.warn('Pollinations POST error', error); }
  // The keyless GET endpoint is a second real AI attempt, not a canned title fallback.
  try {
    const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (response.ok) { const clips = parseClips(await response.text()); if (clips) return clips; console.warn('Pollinations GET returned invalid clip JSON'); }
    else console.warn(`Pollinations GET failed: ${response.status}`);
  } catch (error) { console.warn('Pollinations GET error', error); }
  console.warn('Using metadata-derived fallback after both Pollinations attempts failed');
  return dynamicFallback(meta);
}
