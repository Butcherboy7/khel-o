// Convert every café photo into the sizes the site asks for, right after a
// deploy, so the first visitor gets cached photos instead of waiting for the
// optimizer. Runs inside the frontend container (deploy_remote.sh):
//
//   docker exec -i khel_o_frontend node - < scripts/warm_image_cache.js
//
// Widths and quality must match WIDTHS / quality in frontend/src/lib/imageUrl.ts,
// hosts must match images.remotePatterns in frontend/next.config.js, or the
// warmed copies are never the ones browsers request.
const API = 'http://backend:8000/api/v1/cafes';
const SITE = 'http://127.0.0.1:3000';
const WIDTHS = [384, 640, 828, 1080, 1920];
const QUALITY = 70;
const OPTIMIZABLE = [
  /^https:\/\/khelo-cafe-photos-(prod|dev)\.s3\.ap-south-1\.amazonaws\.com\//,
  /^https:\/\/images\.unsplash\.com\//,
];
// Two at a time: fast enough (~0.1 s per photo), and leaves the second CPU
// free for real visitors while it runs.
const PARALLEL = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForSite() {
  for (let i = 0; i < 30; i++) {
    try { await fetch(SITE + '/', { signal: AbortSignal.timeout(5000) }); return; } catch { await sleep(2000); }
  }
  throw new Error('frontend did not come up');
}

async function photoUrls() {
  const urls = new Set();
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${API}?limit=50&page=${page}`, { signal: AbortSignal.timeout(15000) });
    const items = (await res.json())?.data?.items ?? [];
    for (const cafe of items) {
      for (const p of cafe.photos ?? []) {
        const url = typeof p === 'string' ? p : p?.url;
        if (url && OPTIMIZABLE.some((re) => re.test(url))) urls.add(url);
      }
    }
    if (items.length < 50) break;
  }
  return [...urls];
}

(async () => {
  const started = Date.now();
  await waitForSite();
  const photos = await photoUrls();
  const jobs = photos.flatMap((url) => WIDTHS.map((w) => `${SITE}/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${QUALITY}`));
  let done = 0, cached = 0, failed = 0;
  async function worker() {
    while (jobs.length) {
      const job = jobs.shift();
      try {
        const res = await fetch(job, { headers: { Accept: 'image/webp,*/*' }, signal: AbortSignal.timeout(30000) });
        await res.arrayBuffer();
        if (!res.ok) failed++;
        else if (res.headers.get('x-nextjs-cache') === 'HIT') cached++;
        else done++;
      } catch { failed++; }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`photo cache: ${photos.length} photos, ${done} converted, ${cached} already cached, ${failed} failed, ${secs}s`);
})().catch((e) => { console.log('photo cache warm-up failed:', e.message); });
