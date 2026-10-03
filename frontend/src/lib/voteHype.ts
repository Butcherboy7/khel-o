/** Playful lines once a café's vote count passes its goal. The goal is a
 *  target, not a cap: votes keep counting and the copy keeps cheering. */
const TIERS: { from: number; line: string }[] = [
  { from: 1, line: 'Goal smashed 🎉 and you’re still voting?!' },
  { from: 1.5, line: 'Okay wow, y’all REALLY want this café on KHEL-O 😭🔥' },
  { from: 2, line: 'Double the goal. The owner is going to have to pick up the phone 📞' },
  { from: 3, line: 'This isn’t a vote anymore, it’s a movement 🚀' },
  { from: 5, line: 'Legends. Actual legends. We’re basically camping outside their door ⛺' },
];

export function overGoalLine(votes: number, goal: number): string | null {
  if (goal <= 0 || votes < goal) return null;
  const ratio = votes / goal;
  let line = TIERS[0].line;
  for (const t of TIERS) if (ratio >= t.from) line = t.line;
  return line;
}
