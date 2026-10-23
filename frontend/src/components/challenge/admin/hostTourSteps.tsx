import { ResultExample, type HostStep } from './HostTour';

/** The host guide, in plain words. One list per admin challenge page. */

export const CHALLENGE_PAGE_STEPS: HostStep[] = [
  {
    title: 'How hosting a challenge works',
    body: (
      <>
        <p>Before the day: people sign up here. Spots fill in order, then a waitlist.</p>
        <p>
          On the day, on the <b>Challenge day</b> page: check players in, close check-in, make the draw, type in who wins each match,
          and finish. Then make the rewards on the <b>Rewards</b> page.
        </p>
        <p className="text-caption text-text-secondary">Replay this any time with the Tutorial button.</p>
      </>
    ),
  },
  {
    target: 'practice',
    title: 'Practise first (dev only)',
    body: (
      <>
        <p>
          <b>Fill with practice players</b> adds made-up players (Rohan, Ronak, Aarav…) to fill the spots, plus 2 on the waitlist.
          Then open Challenge day and run the whole thing.
        </p>
        <p>
          <b>Clear practice players</b> removes them with their matches and rewards, so you can start again. This box doesn’t exist on the
          live site.
        </p>
      </>
    ),
  },
  {
    target: 'people',
    title: 'Who signed up',
    body: (
      <p>
        Everyone is listed here with their spot. If someone can’t make it, take them out: the next waitlist person moves up. Use the
        message buttons to tell them on WhatsApp.
      </p>
    ),
  },
  {
    target: 'day-link',
    title: 'On the day',
    body: <p>Open Challenge day on your phone at the café. Everything for the day is there, top to bottom, in order.</p>,
  },
];

export const DAY_PAGE_STEPS: HostStep[] = [
  {
    title: 'The day, start to finish',
    body: (
      <ol className="list-decimal space-y-1 pl-5">
        <li>Players arrive and show their QR: you check them in.</li>
        <li>At the start time you close check-in.</li>
        <li>You make the draw: KHEL-O shuffles who plays whom.</li>
        <li>Matches are played on whichever setup is free. You type in who wins.</li>
        <li>After the final, you finish and make the rewards.</li>
      </ol>
    ),
  },
  {
    target: 'screens',
    title: 'Put the bracket on the big screen',
    body: (
      <p>
        Open <b>Bracket on projector</b> on the café’s TV or projector. It updates by itself every few seconds and shows the next
        matches. <b>Rules on projector</b> is handy while people arrive.
      </p>
    ),
  },
  {
    target: 'checkin',
    title: '1. Check people in',
    body: (
      <>
        <p>
          Each player has a QR on their KHEL-O page (“My QR”). Scan it with your phone camera while signed in to KHEL-O, and they’re
          marked <b>Here</b>.
        </p>
        <p>No QR? Find their name in this list and tap it. Tap again to undo. Waitlist players who came can check in too.</p>
      </>
    ),
  },
  {
    target: 'close-checkin',
    title: 'Close check-in',
    body: (
      <>
        <p>
          When it’s time, press <b>Close check-in</b>. Confirmed players who aren’t here become no-shows, and waitlist players who are
          here take their spots, in order.
        </p>
        <p>Someone turns up late? Put them back on the main page, tick them here and close again.</p>
      </>
    ),
  },
  {
    target: 'plan',
    title: 'How long will it take?',
    body: (
      <p>
        Type how many setups (consoles) you can use. You’ll see how many rounds and matches there are and roughly how long it takes. It’s
        only an estimate to plan with.
      </p>
    ),
  },
  {
    target: 'draw',
    title: '2. Make the draw',
    body: (
      <p>
        Shuffles the players who are here into the bracket. With an uneven number, a few get a free pass (a bye) into round 2. You can
        redo the draw until the first result is in.
      </p>
    ),
  },
  {
    target: 'ready',
    title: '3. Send players to a free setup',
    body: (
      <>
        <p>
          <b>Ready to play</b> lists every match that can start now, in order. When a setup is free, call the top match out loud:
          “Rohan and Ronak, setup 2.”
        </p>
        <p>The projector shows the same list, so players can see when they’re next.</p>
      </>
    ),
  },
  {
    target: 'ready',
    title: 'Rohan beats Ronak 2–1',
    body: (
      <p>
        When they finish, tap their match. Tap <b>Rohan</b> (the winner), type the games if you like (2 and 1), and press <b>Save</b>.
        Rohan moves on to the next round automatically. Ronak is out.
      </p>
    ),
    example: <ResultExample winner="a" a={2} b={1} />,
  },
  {
    target: 'ready',
    title: 'Typed the wrong name?',
    body: (
      <>
        <p>
          Tap the same match again (in the bracket below), tap <b>Ronak</b> instead and Save. Or press <b>Clear</b> to empty it.
        </p>
        <p>
          You can fix a result until the next match has one. If Rohan’s next match already has a result, clear that one first, then fix this
          one.
        </p>
      </>
    ),
    example: <ResultExample winner="b" a={1} b={2} note="Fixed: Ronak goes through instead." />,
  },
  {
    target: 'bracket',
    title: 'The whole bracket',
    body: (
      <p>
        Every match, round by round. The final is best of 5 (unless you changed it). The two semi-final losers play for 3rd place just
        before the final.
      </p>
    ),
  },
  {
    target: 'finish',
    title: '4. Finish and celebrate',
    body: (
      <>
        <p>
          When the final has a result, press <b>Finish the challenge</b>. The results go up on the public page and the projector shows
          the top 3.
        </p>
        <p>Upload a photo of the champion for their page, then go to Rewards.</p>
      </>
    ),
  },
];

export const REWARDS_PAGE_STEPS: HostStep[] = [
  {
    title: 'Rewards, simply',
    body: (
      <p>
        Rewards are offers that work only on the accounts that earned them. Players see theirs on their own challenge page with a Book
        button. Payments work exactly like any other booking.
      </p>
    ),
  },
  {
    target: 'podium',
    title: 'Podium rewards',
    body: (
      <p>
        After you finish, press <b>Make the podium rewards</b>: 1st, 2nd and 3rd each get their hours for the set price at the café.
        Pressing again never makes doubles.
      </p>
    ),
  },
  {
    target: 'waitlist',
    title: 'Waitlist thank-you',
    body: <p>Everyone who was on the waitlist gets a small % off at the café, one booking each.</p>,
  },
  {
    target: 'poster',
    title: 'Winners: scan to see your rewards',
    body: (
      <p>
        Print this one QR and stick it by the screen. Winners scan it, sign in, and their rewards are right there. It holds no code, so
        anyone else who scans it just sees their own page.
      </p>
    ),
  },
  {
    target: 'uses',
    title: 'Every use',
    body: (
      <p>
        Each booking made with a reward shows up here. If KHEL-O pays a discount, the amount to add back in the café’s manual payout is
        shown at the top. You can switch a reward off here; the café owner can’t change it.
      </p>
    ),
  },
];
