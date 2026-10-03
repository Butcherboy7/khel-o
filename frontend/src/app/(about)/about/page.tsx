import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'The story of KHEL-O, the gaming café booking platform for India, and the people and friends who built it.',
};

const STORY = [
  {
    label: 'The spark',
    title: "It started with a thought in Daksesh's head.",
    body: (
      <>
        <b>Daksesh Kalewar</b>, an IIT Bombay alumnus, had an idea: gaming cafés deserve a better way to be found and
        booked. Simple to say. Slightly bigger to build.
      </>
    ),
  },
  {
    label: 'The ask',
    title: 'Then he asked Uzair to build it.',
    body: (
      <>
        Daksesh brought the idea to <b>Uzair</b>, and Uzair said yes before fully understanding how many late nights
        that sentence contained.
      </>
    ),
  },
  {
    label: 'The itch',
    title: 'Uzair and Bindu always wanted a startup of their own.',
    body: (
      <>
        Turns out <b>Bindu</b> had been wanting the same thing for just as long. So an idea, a builder and a future CEO
        walked into the same room, and KHEL-O stopped being a thought and started being a company.
      </>
    ),
  },
  {
    label: 'Right now',
    title: 'And here we are, growing, with friends carrying us.',
    body: (
      <>
        <b>Sathvik</b> joined and quickly became the person who does a bit of everything: finding cafés, keeping owners
        happy, testing, and herding our bug testers. A whole social media team keeps our feeds alive, and friends tested
        every button, found bugs we swore did not exist, and still showed up the next day. We did not do this alone, and
        we would not want to.
      </>
    ),
  },
];

type Tone = 'primary' | 'ink' | 'sun' | 'soft';

const TONE = {
  bubble: {
    primary: 'bg-primary text-white',
    ink: 'bg-secondary text-white',
    sun: 'bg-[#F59E0B] text-[#18191E]',
    soft: 'border border-primary bg-[#E54D42]/10 text-primary',
  },
  avatar: {
    primary: 'bg-primary text-white',
    ink: 'bg-secondary text-white',
    sun: 'bg-[#F59E0B] text-[#18191E]',
    soft: 'bg-[#E54D42]/10 text-primary',
  },
} as const;

const TEAM: {
  name: string;
  aka?: string;
  initials: string;
  role: string;
  bubble: string;
  tone: Tone;
  linkedin: string;
  bio: string;
  quip: string;
  bullets?: string[];
}[] = [
  {
    name: 'Mohammed Abdullah',
    aka: 'prefers Uzair',
    initials: 'MA',
    role: 'Founder & CTO',
    bubble: 'Writes the code',
    tone: 'primary',
    linkedin: 'https://www.linkedin.com/in/mohammed-abdullah-40b419321/',
    bio: "Builds KHEL-O from the booking screen you tap to the infrastructure running quietly behind it. If something breaks, he's probably already looking at it. Please call him Uzair. Everyone who has known him longer than the company does.",
    quip: 'Powered by chai and the dangerous thought: “How hard could it be?”',
  },
  {
    name: 'Bindu',
    initials: 'B',
    role: 'CEO',
    bubble: 'Runs the show',
    tone: 'ink',
    linkedin: 'https://www.linkedin.com/in/bindhu-s-ab1b7a3a7/',
    bio: 'Always wanted a startup of her own, and now runs one. Keeps the whole company pointed in one direction while everyone else is arguing about button colours.',
    quip: "Doesn't have a profile picture yet. Mysterious, honestly.",
  },
  {
    name: 'Ammana Sathvik Reddy',
    initials: 'AS',
    role: 'Customer Acquisition Specialist',
    bubble: 'Does a bit of everything',
    tone: 'sun',
    linkedin: 'https://www.linkedin.com/in/ammana-sathvik-reddy-a00498349/',
    bio: 'Sathvik has put in a huge amount of work, and it shows everywhere in KHEL-O.',
    bullets: [
      'Brings in new gamers and cafés as our Customer Acquisition Specialist',
      'Helps our CTO test what gets built, before you ever see it',
      'Keeps relationships with café owners warm and friendly',
      'Manages our bug testers, a job that needs patience and snacks',
    ],
    quip: 'If a café owner smiles about us, he probably had a hand in it.',
  },
  {
    name: 'Daksesh Kalewar',
    initials: 'DK',
    role: 'Founding Partner',
    bubble: 'Where it all began',
    tone: 'soft',
    linkedin: 'https://www.linkedin.com/in/daksesh-kalewar-502708213/',
    bio: 'An IIT Bombay alumnus, and the person who had the idea in the first place. Without his "what if" there would be no KHEL-O, and a lot fewer queues.',
    quip: 'Prefers not to be on camera, so we are respecting that.',
  },
];

const CREW: { name: string; initials: string; role: string; tone: Tone; text: string }[] = [
  {
    name: 'Niyaz',
    initials: 'N',
    role: 'Editor',
    tone: 'primary',
    text: "Turns our random footage into videos people actually want to watch. Niyaz is the guy behind some of KHEL-O's coolest edits, making sure the good moments don't stay stuck in our camera roll.",
  },
  {
    name: 'Zeeshan',
    initials: 'Z',
    role: 'Content & Ideation',
    tone: 'ink',
    text: 'Comes up with the ideas we sometimes question before filming, and somehow they usually work. Zeeshan keeps our content fresh, experimental, and occasionally a little weird.',
  },
  {
    name: 'Maleeha',
    initials: 'M',
    role: 'Social Media (Intern)',
    tone: 'sun',
    text: 'Keeps multiple KHEL-O profiles moving while juggling everything from posting to planning. She has played a big part in helping us show up online consistently and get KHEL-O in front of more people.',
  },
];

const label = 'text-[12px] font-semibold uppercase tracking-[0.12em] text-text-secondary';

export default function AboutPage() {
  return (
    <div className="flex flex-col gap-16">
      <header className="flex flex-col gap-5">
        <span className={label}>The people behind your booking</span>
        <h1 className="font-heading text-[40px] font-extrabold leading-[1.04] tracking-tight text-text-primary md:text-[60px]">
          One <span className="text-primary">big idea</span>, a small team and a lot of very patient friends.
        </h1>
        <p className="max-w-[60ch] text-body text-text-secondary md:text-[19px]">
          KHEL-O lets you book a station at a gaming café without calling anyone, standing in a queue or asking &quot;is
          the PS5 free?&quot; for the fifth time. This is the story of how it got built, and who is responsible.
        </p>
      </header>

      <section aria-label="Our story">
        {STORY.map((c, i) => (
          <div key={c.label} className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-5">
            <div className="flex flex-col items-center">
              <span className="mt-2 h-3.5 w-3.5 flex-none rounded-full bg-primary ring-[5px] ring-[#E54D42]/20" />
              {i < STORY.length - 1 && (
                <span className="mt-1.5 min-h-8 w-[3px] flex-1 rounded-full bg-[#E54D42]/40" aria-hidden />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-2 pb-9">
              <span className={label}>{c.label}</span>
              <h2 className="font-heading text-h2 font-bold text-text-primary">{c.title}</h2>
              <p className="max-w-[62ch] text-body text-text-secondary [&_b]:font-semibold [&_b]:text-text-primary">
                {c.body}
              </p>
            </div>
          </div>
        ))}
      </section>

      <section aria-label="The team" className="flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <span className={label}>The team</span>
          <h2 className="font-heading text-h1 font-extrabold text-text-primary">
            Meet the people who will answer when you say &quot;this button is broken&quot;.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-7 md:grid-cols-2">
          {TEAM.map((p, i) => (
            <article
              key={p.name}
              className="relative flex min-w-0 flex-col gap-3.5 rounded-3xl border border-border bg-card p-5 pt-8"
            >
              <span
                className={`khelo-bubble absolute -top-3.5 left-5 z-[1] rounded-[999px_999px_999px_4px] px-3 py-1 text-[12px] font-semibold uppercase tracking-wide shadow-card ${TONE.bubble[p.tone]}`}
                style={{ animationDelay: `${i * 1.4}s` }}
              >
                {p.bubble}
              </span>
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-[76px] w-[76px] flex-none items-center justify-center rounded-[22px] font-heading text-[28px] font-extrabold ${TONE.avatar[p.tone]}`}
                  role="img"
                  aria-label={p.name}
                >
                  {p.initials}
                </div>
                <div className="min-w-0">
                  <h3 className="font-heading text-h3 font-bold text-text-primary">
                    {p.name}
                    {p.aka && (
                      <span className="ml-1.5 whitespace-nowrap font-body text-caption font-semibold text-text-secondary">
                        ({p.aka})
                      </span>
                    )}
                  </h3>
                  <div className="text-caption font-semibold text-primary">{p.role}</div>
                </div>
              </div>
              <p className="text-body text-text-secondary">{p.bio}</p>
              {p.bullets && (
                <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body text-text-secondary marker:text-primary">
                  {p.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              <span className="border-t border-dashed border-border pt-3 text-caption text-text-secondary">{p.quip}</span>
              <a
                href={p.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] w-fit items-center rounded-full border border-border px-4 text-caption font-semibold text-text-primary transition-colors hover:border-primary hover:text-primary"
              >
                LinkedIn ↗<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="Social media team and early help" className="flex flex-col gap-5">
        <span className={label}>The wider crew</span>
        <h2 className="font-heading text-h1 font-extrabold text-text-primary">The ones who keep the engines running.</h2>
        <p className="max-w-[62ch] text-body text-text-secondary">
          Our social media team helps bring KHEL-O to life online. From editing and content ideas to managing multiple
          profiles, they&apos;ve helped us reach people far beyond Hyderabad, including people who have reached out to us
          from other states.
        </p>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
          {CREW.map((m) => (
            <article key={m.name} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-[18px]">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-12 w-12 flex-none items-center justify-center rounded-[15px] font-heading text-[18px] font-extrabold ${TONE.avatar[m.tone]}`}
                  aria-hidden
                >
                  {m.initials}
                </span>
                <div>
                  <h3 className="font-heading text-[19px] font-bold text-text-primary">{m.name}</h3>
                  <div className="text-caption font-semibold text-primary">{m.role}</div>
                </div>
              </div>
              <p className="text-caption leading-relaxed text-text-secondary">{m.text}</p>
            </article>
          ))}
        </div>
        <div className="flex items-center gap-3.5 rounded-2xl border border-dashed border-border bg-card p-[18px]">
          <span
            className={`flex h-12 w-12 flex-none items-center justify-center rounded-[15px] font-heading text-[18px] font-extrabold ${TONE.avatar.soft}`}
            aria-hidden
          >
            SC
          </span>
          <p className="text-caption leading-relaxed text-text-secondary">
            <b className="text-text-primary">Sai Charan</b> helped us get KHEL-O moving in the early days, especially with
            cold calling and reaching out to cafés. He is less involved now while he focuses on his own work, but he
            played an important role in getting our early momentum started.
          </p>
        </div>
      </section>

      <section aria-label="Thank you" className="flex flex-col gap-3.5 rounded-[26px] bg-secondary p-6 text-white md:p-10">
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/60">To my friends</span>
        <h2 className="font-heading text-h1 font-extrabold">If friendship was wealth, I would be the richest man.</h2>
        <p className="max-w-[62ch] text-body text-white/80">
          A huge shout-out to every single friend who trusted us and never gave up on us, and who encouraged us on the
          days we wanted to give up. I still remember each of you sharing our links with your friends, and helping us get
          contacts of café owners and important people.
        </p>
        <p className="max-w-[62ch] text-body text-white/80">
          And to everyone who took part in our content creation: I do not want anyone to feel left out. I will remember
          every one of you, and I am grateful to have friends like you. I know this is a little emotional, but you get
          the feeling.
        </p>
        <p className="text-body font-semibold">Thank you, truly. ❤️</p>
        <p className="font-heading text-h2 font-bold">-uzzu</p>
        <Link
          href="/browse"
          className="mt-1.5 inline-flex min-h-[48px] w-fit items-center rounded-full bg-primary px-6 text-body font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          Find a café near you
        </Link>
      </section>

      <section
        aria-label="Company"
        className="flex flex-col gap-2 border-t border-border pt-8 text-caption leading-relaxed text-text-secondary"
      >
        <h2 className="font-heading text-h3 font-bold text-text-primary">Company</h2>
        <p className="max-w-[70ch]">
          KHEL-O is a booking marketplace for gaming cafés in India. It is operated as a sole proprietorship by Mohammed
          Abdullah, headquartered in Hyderabad, Telangana, India. The Platform is a software product, a Next.js web
          application backed by a Python/FastAPI service, built and operated in-house and not resold or white-labeled
          from another provider.
        </p>
        <p>
          For partnership, press, or general enquiries, see our{' '}
          <Link href="/contact" className="font-semibold text-primary hover:underline">
            Contact Us
          </Link>{' '}
          page.
        </p>
      </section>
    </div>
  );
}
