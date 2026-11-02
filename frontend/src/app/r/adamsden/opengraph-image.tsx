import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// The banner WhatsApp shows under the khel-o.com/r/adamsden link.
export const alt = 'Rate AdamsDen on KHEL-O';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function logo(): Promise<string | null> {
  try {
    const buf = await readFile(join(process.cwd(), 'public/brand/khelo-logo-128.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export default async function Image() {
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
          <div style={{ display: 'flex', background: ink, color: '#F1EFEA', padding: '10px 18px', fontSize: 20, fontWeight: 700, letterSpacing: 4 }}>
            TEKKEN #01 CREW
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 3, color: '#D0463C' }}>YOU WERE THERE. SAY SO.</div>
          <div style={{ display: 'flex', marginTop: 12, fontSize: 104, fontWeight: 800, lineHeight: 1.0, letterSpacing: -3 }}>
            How was AdamsDen?
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 30 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <svg key={i} width="84" height="84" viewBox="0 0 24 24">
                <path fill="#F5B301" stroke={ink} strokeWidth="0.6" d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7L2 9.2l7.1-.6z" />
              </svg>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 600 }}>Tap to rate · 30 seconds · helps the next gamer</div>
          <div style={{ display: 'flex', background: '#D0463C', color: '#fff', padding: '14px 28px', fontSize: 30, fontWeight: 800, borderRadius: 14 }}>
            Rate it ★
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
