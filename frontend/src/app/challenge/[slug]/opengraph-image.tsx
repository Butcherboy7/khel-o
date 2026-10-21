import { ImageResponse } from 'next/og';
import { getChallenge } from '@/lib/api/challenges';
import { challengeDay, challengeTimeRange } from '@/lib/challenge';

// The link preview on WhatsApp / Instagram: built from the challenge's own
// fields, so the next challenge gets its own card without new code.
export const alt = 'KHELO challenge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 300;

// Next 14 passes params as an object, Next 15 as a promise: awaiting works for both.
export default async function Image({ params }: { params: { slug: string } | Promise<{ slug: string }> }) {
  const { slug } = await params;
  let title = 'KHELO Challenge';
  let line = 'Free sign-up on KHEL-O';
  let where = '';
  let spots = '';
  try {
    const ch = await getChallenge(slug);
    title = ch.title;
    line = `${ch.game} · ${challengeDay(ch.startsAt)}, ${challengeTimeRange(ch.startsAt, ch.endsAt)}`;
    where = `${ch.cafe.name}, ${ch.cafe.city}`;
    spots = `Free sign-up · ${ch.capacity} spots · ${ch.minAge}+`;
  } catch {
    /* a draft or a wrong link: the plain card */
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: 'linear-gradient(135deg, #0E0F13 0%, #1A1114 60%, #3A1512 100%)',
          color: '#F4F1EC',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, letterSpacing: 6, color: '#E8675D' }}>
          KHELO CHALLENGE
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>{title}</div>
          <div style={{ marginTop: 24, fontSize: 34, color: '#DADCE3' }}>{line}</div>
          {where && <div style={{ marginTop: 10, fontSize: 34, color: '#A3A6B1' }}>{where}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              padding: '14px 28px',
              borderRadius: 999,
              background: '#D0463C',
              fontSize: 30,
              fontWeight: 700,
              color: '#FFFFFF',
            }}
          >
            {spots || 'Free sign-up'}
          </div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700 }}>khel-o.com</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
