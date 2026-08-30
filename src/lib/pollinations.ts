import { Clip, VideoMetadata, dynamicFallback, parseClips } from './analyze';
export async function analyzeVideo(meta: VideoMetadata): Promise<Clip[]> {
  const prompt = `Return ONLY a JSON array of exactly 5 unique viral video clips. Analyze ONLY this specific video. Detect its genre (tech review, podcast, comedy, tutorial, vlog, sports, music, gaming, news, essay, or another appropriate genre) from the metadata. Base every title, hook, and description strictly on the actual topic; never invent unrelated subjects. Timestamps must be between 00:30 and 15:00, have startTime and endTime in seconds, and include viralityScore from 0 to 100.\nTitle: ${meta.title}\nChannel: ${meta.author}\nDescription: ${meta.description || '(not provided)'}\nSchema: [{"title":"...","hook":"...","summary":"...","startTime":30,"endTime":72,"viralityScore":80}]`;
  try {
    const response = await fetch('https://text.pollinations.ai/', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], model: 'openai', jsonMode: true }), signal: AbortSignal.timeout(20000) });
    if (response.ok) { const clips = parseClips(await response.text()); if (clips) return clips; }
  } catch { /* deterministic metadata fallback below */ }
  return dynamicFallback(meta);
}
