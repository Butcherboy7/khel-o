import { gameArtFor, posterColors } from '@/lib/gameArt';
import { PlatformIcon } from '@/components/icons/PlatformIcons';

/**
 * One game as a portrait poster. Uses cleared artwork when there is some (lib/gameArt.ts), otherwise an original
 * generated poster: a dark gradient from the game's name with the name set large.
 */
export function GamePoster({ game, platform }: { game: string; platform: string }) {
  const art = gameArtFor(game);
  const { from, to } = posterColors(game);
  return (
    <li
      className="relative aspect-[3/4] w-[104px] flex-none snap-start overflow-hidden rounded-2xl border border-black/10 shadow-card"
      style={art ? undefined : { backgroundImage: `linear-gradient(155deg, ${from}, ${to})` }}
    >
      {art && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" aria-hidden />
      <div className="relative flex h-full flex-col justify-end gap-1.5 p-2.5">
        <span className="font-heading text-[15px] font-extrabold uppercase leading-[1.05] tracking-tight text-white [overflow-wrap:anywhere]">
          {game}
        </span>
        <PlatformIcon platform={platform} className="h-3.5 w-3.5 text-white/80" />
      </div>
    </li>
  );
}
