import { COMMUNITY_URL } from '@/lib/challenge';

/** The free-GTA-6-time offer, with its condition stated: earned by joining the
 *  community and playing the next tournament. The terms live in the community,
 *  so no amount or date is promised here. */
export function FreePlayCard({ utmCampaign }: { utmCampaign: string }) {
  return (
    <section aria-labelledby="free-h" className="flex flex-col gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-5">
      <h2 id="free-h" className="font-heading text-h2 font-bold text-balance">Play GTA 6 free: earn it in a tournament</h2>
      <p className="text-body text-text-primary">
        Join the KHEL-O WhatsApp community and play in our next tournament. Players who take part get free GTA 6 play time as a reward, plus GTA 6 launch goodies. The rules and rewards are posted in the community.
      </p>
      <a
        href={`${COMMUNITY_URL}`}
        target="_blank"
        rel="noopener noreferrer"
        data-campaign={utmCampaign}
        className="btn-depth inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-5 font-semibold text-white sm:w-fit"
      >
        Join the community
      </a>
    </section>
  );
}
