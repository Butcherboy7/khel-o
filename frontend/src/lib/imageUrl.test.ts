import { describe, expect, it } from 'vitest';
import { optimizedImg } from './imageUrl';

const S3 = 'https://khelo-photos.s3.ap-south-1.amazonaws.com/cafes/abc/photo.jpg';

describe('optimizedImg', () => {
  it('routes our S3 photos through the optimizer with a width ladder', () => {
    const img = optimizedImg(S3, '100vw', { maxWidth: 828 });
    expect(img.src).toBe(`/_next/image?url=${encodeURIComponent(S3)}&w=828&q=70`);
    expect(img.srcSet?.split(', ').map((s) => s.split(' ')[1])).toEqual(['384w', '640w', '828w']);
    expect(img.sizes).toBe('100vw');
  });

  it('leaves hosts the optimizer will not fetch untouched', () => {
    expect(optimizedImg('https://example.com/x.jpg', '100vw')).toEqual({ src: 'https://example.com/x.jpg' });
    expect(optimizedImg('https://evil.com/?https://a.s3.x.amazonaws.com/', '100vw').srcSet).toBeUndefined();
  });
});
