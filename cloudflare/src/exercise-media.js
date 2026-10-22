// Workers Static Assets can return 200 with the whole MP4 for Range requests.
// Safari probes bytes=0-1 before playback, including before a service worker controls the page.
export async function exerciseClip(request, assets, {music=false}={}) {
  const url = new URL(request.url);
  if (!(music ? /^\/music\/(momentum|morning|breathe)\.mp3$/ : /^\/exercise-media\/clip\/\d{4,5}\.mp4$/).test(url.pathname)) return new Response(null, {status: 404});
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405, headers: {Allow: 'GET, HEAD'}});
  const range = request.method === 'GET' ? request.headers.get('range') : null;
  const headers = new Headers(request.headers);
  headers.delete('range');
  headers.delete('if-range');
  if (range) headers.delete('if-none-match');
  const full = await assets.fetch(new Request(request, {headers}));
  if (/text\/html/i.test(full.headers.get('content-type') || '')) return new Response(null, {status: 404});
  const outHeaders = new Headers(full.headers);
  outHeaders.set('Accept-Ranges', 'bytes');
  const ifRange = request.headers.get('if-range');
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (full.status !== 200 || !match || (!match[1] && !match[2]) || (ifRange && ifRange !== full.headers.get('etag'))) {
    return new Response(full.body, {status: full.status, headers: outHeaders});
  }
  const body = await full.arrayBuffer(), size = body.byteLength;
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[1] && match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) {
    return new Response(null, {status: 416, headers: {'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes'}});
  }
  end = Math.min(end, size - 1);
  outHeaders.delete('content-encoding');
  outHeaders.set('Content-Length', String(end - start + 1));
  outHeaders.set('Content-Range', `bytes ${start}-${end}/${size}`);
  return new Response(body.slice(start, end + 1), {status: 206, headers: outHeaders});
}
