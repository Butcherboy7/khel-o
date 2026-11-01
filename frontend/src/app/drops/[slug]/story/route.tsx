import { getDrop } from '@/lib/api/drops';
import { blockTimes, dayLabel } from '@/lib/drops';
import { storyCard } from '@/components/challenge/storyCard';

// "I got my GTA 6 seat at AdamsDen": a 1080×1920 picture for a WhatsApp
// status or Instagram story. Only drop details, never a name, phone or pass.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const blockId = new URL(req.url).searchParams.get('block');
  try {
    const d = await getDrop(slug);
    const b = d.blocks.find((x) => x.id === blockId) ?? null;
    return storyCard({
      kicker: 'KHELO LAUNCH DROP',
      title: `I got my ${d.game} seat at ${d.cafe.name}`,
      footer: d.cafe.city,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {b && <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>{dayLabel(b.date)}</div>}
          {b && <div style={{ display: 'flex', marginTop: 16, fontSize: 56, color: '#DADCE3' }}>{blockTimes(b)}</div>}
          <div style={{ display: 'flex', marginTop: 56, fontSize: 52, color: '#DADCE3' }}>
            {`Only ${d.seatsTotal} seats. ${d.seatsLeft > 0 ? `${d.seatsLeft} left.` : 'All gone.'}`}
          </div>
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              marginTop: 40,
              padding: '20px 40px',
              borderRadius: 999,
              background: '#F6C25B',
              fontSize: 44,
              fontWeight: 700,
              color: '#231A05',
            }}
          >
            {`Get yours: khel-o.com/drops/${d.slug}`}
          </div>
        </div>
      ),
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
