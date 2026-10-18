/**
 * Café photos through Next's image optimizer (/_next/image): resized to the
 * width the screen needs, served as WebP, and cached by the browser.
 * Straight from S3 they were full camera size (2–5 MB each, no cache
 * headers) — PageSpeed measured 15 MB on the homepage, 12 MB of it photos.
 *
 * Only hosts listed in next.config.js images.remotePatterns can go through
 * the optimizer; anything else is returned untouched so it still loads.
 */

// Must match images.remotePatterns in next.config.js (a host the optimizer
// refuses would show a broken image until fallBackToOriginal kicks in).
const OPTIMIZABLE = [
  /^https:\/\/khelo-cafe-photos-(prod|dev)\.s3\.ap-south-1\.amazonaws\.com\//,
  /^https:\/\/images\.unsplash\.com\//,
];

// Must be in Next's default deviceSizes/imageSizes, or /_next/image rejects the width.
const WIDTHS = [384, 640, 828, 1080, 1920] as const;

export function canOptimize(url: string | null | undefined): url is string {
  return !!url && OPTIMIZABLE.some((re) => re.test(url));
}

function at(url: string, width: number, quality: number): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
}

/**
 * `src` / `srcSet` / `sizes` for an <img>. `sizes` is the CSS width the image
 * renders at (e.g. "(min-width: 768px) 33vw, 100vw"); the browser then picks
 * the smallest width that is sharp on that screen.
 */
export function optimizedImg(
  url: string,
  sizes: string,
  { maxWidth = 1080, quality = 70 }: { maxWidth?: number; quality?: number } = {},
): { src: string; srcSet?: string; sizes?: string } {
  if (!canOptimize(url)) return { src: url };
  const widths = WIDTHS.filter((w) => w <= maxWidth);
  return {
    src: at(url, widths[widths.length - 1], quality),
    srcSet: widths.map((w) => `${at(url, w, quality)} ${w}w`).join(', '),
    sizes,
  };
}

/** onError for an optimized <img>: if the optimizer fails, load the original
 *  once instead of showing a broken image. */
export function fallBackToOriginal(original: string) {
  return (e: { currentTarget: HTMLImageElement }) => {
    const img = e.currentTarget;
    if (!img.src.includes('/_next/image')) return;
    img.srcset = '';
    img.src = original;
  };
}
