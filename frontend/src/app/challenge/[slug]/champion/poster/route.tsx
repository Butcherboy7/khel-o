import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { getBracket } from '@/lib/api/challenges';
import { challengeDay } from '@/lib/challenge';

// The champion poster to post on WhatsApp / Instagram: their photo, name and
// the podium, in the dark challenge look. ?size=story gives 1080×1920,
// anything else the 1080×1350 feed size. ?download=1 saves it as a file.
export const dynamic = 'force-dynamic';

const SIZES = { post: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 } } as const;

async function file(path: string): Promise<Buffer | null> {
  try {
    return await readFile(join(process.cwd(), path));
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const kind = url.searchParams.get('size') === 'story' ? 'story' : 'post';
  const { width, height } = SIZES[kind];
  let b;
  try {
    b = await getBracket(slug);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const champ = b.standings.find((s) => s.place === 1);
  if (!champ) return new Response('No champion yet', { status: 404 });
  const second = b.standings.find((s) => s.place === 2);
  const third = b.standings.find((s) => s.place === 3);
  const ch = b.challenge;
  const [teko, logoBuf] = await Promise.all([file('public/fonts/Teko-Bold.ttf'), file('public/brand/khelo-logo-128.png')]);
  const logo = logoBuf ? `data:image/png;base64,${logoBuf.toString('base64')}` : null;
  const photo = ch.championPhotoUrl;
  const tall = kind === 'story';
  const photoH = tall ? 860 : 560;
  const head = teko ? 'Teko' : 'sans-serif';

  const img = new ImageResponse(
    (
      <div style={{ width, height, display: 'flex', flexDirection: 'column', background: '#0A0809', color: '#F4F1EC', padding: tall ? '180px 70px 200px' : '60px 70px', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', background: '#F2C94C', color: '#1A1306', fontFamily: head, fontSize: 46, padding: '4px 22px 0', transform: 'skewX(-10deg)', textTransform: 'uppercase', letterSpacing: 2 }}>
            {ch.title.replace(/^KHELO\s+/i, '')}
          </div>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- satori draws plain img
            <img src={logo} width={84} height={84} alt="" style={{ borderRadius: 18, background: '#F6F1ED', padding: 6 }} />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 22, fontFamily: head, fontSize: 150, lineHeight: 0.9, color: '#F2C94C', textTransform: 'uppercase' }}>
          Champion
        </div>
        <div style={{ display: 'flex', marginTop: 22, height: photoH, borderRadius: 36, overflow: 'hidden', border: '6px solid #F2C94C', background: '#16181E', alignItems: 'center', justifyContent: 'center' }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- satori draws plain img
            <img src={photo} alt="" width={width - 152} height={photoH - 12} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
          ) : (
            logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- satori draws plain img
              <img src={logo} width={320} height={320} alt="" style={{ opacity: 0.9 }} />
            ) : null
          )}
        </div>
        <div style={{ display: 'flex', marginTop: 28, fontFamily: head, fontSize: champ.name.length > 16 ? 110 : 140, lineHeight: 0.9, textTransform: 'uppercase' }}>
          {champ.name}
        </div>
        <div style={{ display: 'flex', marginTop: 10, fontSize: 34, color: '#C9C4CF' }}>
          {ch.cafe.name} · {challengeDay(ch.startsAt)}
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 'auto' }}>
          {[second, third].filter(Boolean).map((s) => (
            <div key={s!.place} style={{ display: 'flex', flexDirection: 'column', flex: 1, border: '3px solid #3a2b2e', borderRadius: 24, padding: '14px 22px', background: '#16121A' }}>
              <div style={{ display: 'flex', fontFamily: head, fontSize: 40, color: s!.place === 2 ? '#C9CED6' : '#D49A63' }}>{s!.place === 2 ? '2ND' : '3RD'}</div>
              <div style={{ display: 'flex', fontFamily: head, fontSize: 60, lineHeight: 1, textTransform: 'uppercase' }}>{s!.name}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26, fontFamily: head, fontSize: 38, letterSpacing: 2, color: '#C9C4CF', textTransform: 'uppercase' }}>
          <span>Next challenge? Join the community.</span>
          <span style={{ color: '#F2C94C' }}>khel-o.com</span>
        </div>
      </div>
    ),
    {
      width,
      height,
      fonts: teko ? [{ name: 'Teko', data: teko, weight: 700, style: 'normal' }] : undefined,
      headers: {
        'Cache-Control': 'no-store',
        ...(url.searchParams.get('download')
          ? { 'Content-Disposition': `attachment; filename="khelo-${slug}-champion-${kind}.png"` }
          : {}),
      },
    },
  );
  return img;
}
