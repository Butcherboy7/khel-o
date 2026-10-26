import { Gamepad2, HelpCircle, User } from 'lucide-react';

/** Fighting-game VS screen: you (1P) against whoever turns up (2P). Words kept to a minimum. */
export function VsPanel() {
  return (
    <div className="relative h-[168px] overflow-hidden rounded-3xl border border-[#262932] bg-[#0B0C10]" aria-hidden>
      <div className="chv-left absolute inset-0 bg-gradient-to-br from-[#E8675D] via-[#D0463C] to-[#5A2A26]">
        <div className="absolute left-5 top-4 flex flex-col">
          <span className="font-heading text-[44px] font-black leading-none text-white">1P</span>
          <span className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-white/85">You</span>
        </div>
        <User className="absolute bottom-[-14px] left-[13%] h-[104px] w-[104px] text-black/35" strokeWidth={2.4} />
      </div>
      <div className="chv-right absolute inset-0 bg-gradient-to-bl from-[#4F7BFF] via-[#2F4FB8] to-[#16213F]">
        <div className="absolute right-5 top-4 flex flex-col items-end">
          <span className="font-heading text-[44px] font-black leading-none text-white">2P</span>
          <span className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-white/85">???</span>
        </div>
        <HelpCircle className="absolute bottom-[-10px] right-[14%] h-[92px] w-[92px] text-black/35" strokeWidth={2.4} />
      </div>
      <span className="chv-vs absolute left-1/2 top-1/2 font-heading text-[56px] font-black italic leading-none text-[#F2C94C] [-webkit-text-stroke:2px_#1A1114]">
        VS
      </span>
    </div>
  );
}

/** The real spots as a character-select grid: filled slots show the player number, open ones a "?". */
export function PlayerSelect({ capacity, filled, open }: { capacity: number; filled: number; open: boolean }) {
  return (
    <div className="mt-3 grid grid-cols-5 gap-2" aria-hidden>
      {Array.from({ length: capacity }, (_, i) => {
        const taken = i < filled;
        const next = open && i === filled;
        return (
          <div
            key={i}
            className={`flex aspect-[4/5] flex-col items-center justify-center rounded-xl border-2 ${
              taken
                ? 'border-[#E8675D] bg-gradient-to-b from-[#D0463C] to-[#5A2A26] text-white'
                : next
                ? 'chv-open-slot border-[#E8675D] bg-[#1A1114] text-[#E8675D]'
                : 'border-dashed border-[#2F323C] bg-[#121318] text-[#4A4E5A]'
            }`}
          >
            {taken ? <Gamepad2 className="h-5 w-5" /> : <span className="font-heading text-xl font-black">?</span>}
            <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider">{taken ? `P${i + 1}` : next ? 'You?' : `P${i + 1}`}</span>
          </div>
        );
      })}
    </div>
  );
}
