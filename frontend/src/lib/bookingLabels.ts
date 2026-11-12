/** What the person at the desk needs to get ready for a booking, in plain words. */
export function groupLabel(b: {
  seatsCount?: number | null;
  playersCount?: number | null;
  isRoom?: boolean;
}): string | null {
  const seats = b.seatsCount ?? 1;
  const players = b.playersCount ?? seats;
  if (b.isRoom) return `Cabin · ${players} PC${players === 1 ? '' : 's'}`;
  if (players > seats) return `${players} players sharing ${seats} console${seats === 1 ? '' : 's'}`;
  if (seats > 1) return `${seats} machines`;
  return null;
}
