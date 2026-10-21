import { getBracket } from '@/lib/api/challenges';
import { challengeDay } from '@/lib/challenge';
import { storyCard } from '@/components/challenge/storyCard';

const MEDAL: Record<number, string> = { 1: '#F2C27A', 2: '#C9CBD3', 3: '#D79A6B' };
const PLACE: Record<number, string> = { 1: '1ST', 2: '2ND', 3: '3RD' };

// The podium as a story card, once the places are decided.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const b = await getBracket(slug);
    if (b.standings.length === 0) return new Response('No results yet', { status: 404 });
    const ch = b.challenge;
    return storyCard({
      kicker: 'KHELO CHALLENGE · RESULTS',
      title: ch.title,
      footer: `${ch.cafe.name} · ${challengeDay(ch.startsAt)}`,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {b.standings.map((s) => (
            <div key={s.place} style={{ display: 'flex', alignItems: 'baseline', marginTop: s.place === 1 ? 0 : 48 }}>
              <div style={{ display: 'flex', width: 220, fontSize: 56, fontWeight: 800, letterSpacing: 4, color: MEDAL[s.place] }}>
                {PLACE[s.place]}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: s.place === 1 ? 120 : 80,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: -2,
                  color: s.place === 1 ? '#FFFFFF' : '#DADCE3',
                }}
              >
                {s.name}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', marginTop: 80, fontSize: 48, color: '#A3A6B1' }}>{ch.game}</div>
        </div>
      ),
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
