import type { ReactNode } from 'react';
import { ImageResponse } from 'next/og';

/** A 1080×1920 story card (Instagram story / WhatsApp status), in the same
 *  look as the challenge's link preview. Only display names, never phones
 *  or codes. */
export function storyCard({ kicker, title, children, footer }: { kicker: string; title: string; children: ReactNode; footer: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '120px 96px',
          background: 'linear-gradient(160deg, #0E0F13 0%, #1A1114 55%, #3A1512 100%)',
          color: '#F4F1EC',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, letterSpacing: 8, color: '#E8675D' }}>{kicker}</div>
          <div style={{ display: 'flex', marginTop: 28, fontSize: 84, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2 }}>{title}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 40, fontWeight: 700 }}>
          <div style={{ display: 'flex', color: '#DADCE3' }}>{footer}</div>
          <div style={{ display: 'flex' }}>khel-o.com</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
