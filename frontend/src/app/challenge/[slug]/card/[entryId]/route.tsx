import { getChallenge, getPublicPlayer } from '@/lib/api/challenges';
import { challengeDay, challengeTimeRange } from '@/lib/challenge';
import { storyCard } from '@/components/challenge/storyCard';

// "I'm in": a player's story card, made from their display name only.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; entryId: string }> }) {
  const { slug, entryId } = await params;
  try {
    const [ch, p] = await Promise.all([getChallenge(slug), getPublicPlayer(slug, entryId)]);
    return storyCard({
      kicker: 'KHELO CHALLENGE',
      title: ch.title,
      footer: `${challengeDay(ch.startsAt)} · ${challengeTimeRange(ch.startsAt, ch.endsAt)}`,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 64, color: '#A3A6B1' }}>I’m in.</div>
          <div style={{ display: 'flex', marginTop: 16, fontSize: 132, fontWeight: 800, lineHeight: 1, letterSpacing: -3 }}>{p.name}</div>
          {p.mainCharacter && (
            <div style={{ display: 'flex', marginTop: 28, fontSize: 52, color: '#DADCE3' }}>Main: {p.mainCharacter}</div>
          )}
          <div style={{ display: 'flex', marginTop: 64, fontSize: 52, color: '#DADCE3' }}>
            {ch.game} at {ch.cafe.name}
          </div>
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              marginTop: 40,
              padding: '20px 40px',
              borderRadius: 999,
              background: '#D0463C',
              fontSize: 44,
              fontWeight: 700,
              color: '#FFFFFF',
            }}
          >
            {p.status === 'confirmed' ? 'Spot confirmed' : 'On the waitlist'} · free sign-up
          </div>
        </div>
      ),
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
