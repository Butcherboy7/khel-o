import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { getChallenge } from '@/lib/api/challenges';
import { challengeDay, challengeTimeRange } from '@/lib/challenge';

// The link preview on WhatsApp / Instagram: built from the challenge's own
// fields, so the next challenge gets its own card without new code. Same
// look as the site's share card (cream grid, logo, red stamp).
export const alt = 'KHEL-O challenge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 300;

async function logo(): Promise<string | null> {
  try {
    const buf = await readFile(join(process.cwd(), 'public/brand/khelo-logo-128.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// Next 14 passes params as an object, Next 15 as a promise: awaiting works for both.
export default async function Image({ params }: { params: { slug: string } | Promise<{ slug: string }> }) {
  const { slug } = await params;
  let title = 'KHEL-O Challenge';
  let kicker = 'Free challenge';
  let when = '';
  let where = 'Hyderabad';
  let spots = 'Free sign-up';
  try {
    const ch = await getChallenge(slug);
    title = ch.title.replace(/^KHELO\s+/i, '');
    kicker = `Free challenge · ${ch.game}`;
    when = `${challengeDay(ch.startsAt)}, ${challengeTimeRange(ch.startsAt, ch.endsAt)}`;
    where = `${ch.cafe.name}, ${ch.cafe.city}`;
    spots = `${ch.capacity} player spots · anyone can watch`;
  } catch {
    /* a draft or a wrong link: the plain card */
  }
  const src = await logo();
  const ink = '#17181C';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 64px',
          backgroundColor: '#F1EFEA',
          backgroundImage:
            'linear-gradient(rgba(23,24,28,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(23,24,28,0.05) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          color: ink,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} width={72} height={72} style={{ borderRadius: 16, border: `3px solid ${ink}` }} alt="" />
            )}
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 700 }}>KHEL-O</div>
          </div>
          <div
            style={{
              display: 'flex',
              background: ink,
              color: '#F1EFEA',
              padding: '10px 18px',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: 4,
            }}
          >
            CHALLENGE · HYDERABAD
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 3, color: '#D0463C', textTransform: 'uppercase' }}>
            {kicker}
          </div>
          <div style={{ display: 'flex', marginTop: 12, fontSize: 80, fontWeight: 800, lineHeight: 1.0, letterSpacing: -2 }}>
            {title}
          </div>
          {when && <div style={{ display: 'flex', marginTop: 22, fontSize: 36, fontWeight: 600 }}>{when}</div>}
          <div style={{ display: 'flex', marginTop: 6, fontSize: 32, color: '#5E6068' }}>{where}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 28, color: '#3A3B42' }}>{spots}</div>
          <div
            style={{
              display: 'flex',
              background: '#D0463C',
              color: '#FFFFFF',
              padding: '14px 26px',
              fontSize: 32,
              fontWeight: 700,
              boxShadow: `7px 7px 0 ${ink}`,
            }}
          >
            Sign up free · khel-o.com
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
