/**
 * Shrinks a photo in the browser before it's uploaded: scaled so its longest
 * side is at most `maxDim`, re-encoded as WebP. A phone photo of a café is
 * typically 3–6 MB of JPEG; the same picture as a 1600px WebP is a few
 * hundred KB, which is most of a café page's weight and its largest paint.
 *
 * Never blocks an upload: any failure (an old browser with no WebP encoder,
 * a format the browser can't decode) returns the original file, as does a
 * result that came out larger than what went in.
 */
export async function toWebp(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    // Browsers without a WebP encoder silently hand back PNG instead.
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], name, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
}
