/** Playful lines once a café's vote count passes its goal. The goal is a
 *  target, not a cap: votes keep counting and the copy keeps cheering.
 *  Each tier has a few lines; the vote count picks one, so the line
 *  rotates every time someone new votes. */
const TIERS: { from: number; lines: string[] }[] = [
  {
    from: 1,
    lines: [
      'Goal smashed 🎉 and you’re still voting?!',
      'The aura on this crowd is unmatched ✨',
      'Bro the votes are voting themselves 💀',
    ],
  },
  {
    from: 1.5,
    lines: [
      'Okay wow, y’all REALLY want this café on KHEL-O 😭🔥',
      'The owner’s phone is about to be very busy 📱',
      'Y’all are carrying this café’s whole marketing team 🫡',
    ],
  },
  {
    from: 2,
    lines: [
      'Double the goal. The owner is going to have to pick up the phone 📞',
      'At this point we should just show up with a cake 🎂',
    ],
  },
  {
    from: 3,
    lines: [
      'This isn’t a vote anymore, it’s a movement 🚀',
      'This café doesn’t know it yet, but it’s already famous 😌',
    ],
  },
  {
    from: 5,
    lines: ['Legends. Actual legends. We’re basically camping outside their door ⛺'],
  },
];

export function overGoalLine(votes: number, goal: number): string | null {
  if (goal <= 0 || votes < goal) return null;
  const ratio = votes / goal;
  let tier = TIERS[0];
  for (const t of TIERS) if (ratio >= t.from) tier = t;
  return tier.lines[votes % tier.lines.length];
}
