"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Users,
  Store,
  Repeat,
  QrCode,
  Monitor,
  TrendingDown,
  Tag,
  Star,
  Gamepad2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { InfoTip } from "@/components/shared/InfoTip";
import { INFO_TIPS } from "@/lib/ownerGuideCopy";
import type { InsightSlot, OwnerInsights } from "@/lib/api/owner";

// ---------------------------------------------------------------- formatting

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function hourLabel(h: number) {
  return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
}

/** 18, 21 -> "6–9pm"; 11, 14 -> "11am–2pm". End is exclusive (the hour it ends). */
export function rangeLabel(start: number, end: number) {
  const sameHalf = start < 12 === end < 12 && end !== 0;
  return sameHalf
    ? `${start % 12 || 12}–${hourLabel(end)}`
    : `${hourLabel(start)}–${hourLabel(end)}`;
}

const slotLabel = (s: InsightSlot) =>
  `${s.day} ${rangeLabel(s.startHour, s.endHour)}`;

export function periodName(days: number) {
  return days === 90 ? "3 months" : `${days} days`;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// ---------------------------------------------------------------- shell

/** One titled section. The line under the title always says why it matters. */
export function Section({
  title,
  why,
  tip,
  children,
  className,
}: {
  title: string;
  why: string;
  tip?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-1.5 font-heading text-h3 text-text-primary">
          {title}
          {tip && <InfoTip text={tip} label={`About ${title.toLowerCase()}`} />}
        </h2>
        <p className="max-w-prose text-caption text-text-secondary">{why}</p>
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- earnings

export function EarningsStory({ data }: { data: OwnerInsights }) {
  const { earnings, trend, days } = data;
  const change =
    earnings.previous > 0
      ? Math.round(
          ((earnings.total - earnings.previous) / earnings.previous) * 100,
        )
      : null;
  const max = Math.max(1, ...trend.map((p) => p.revenue));
  const bestIdx = trend.reduce(
    (best, p, i) => (p.revenue > trend[best].revenue ? i : best),
    0,
  );
  const [picked, setPicked] = useState<number | null>(null);
  const shown = trend[picked ?? bestIdx];
  const weekly = days > 31;
  const fmtDay = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: weekly ? undefined : "short",
      day: "numeric",
      month: "short",
    });

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-body text-text-secondary">
          In the last {periodName(days)} you earned
          <InfoTip text={INFO_TIPS.insightsEarnings} label="About earnings" />
        </p>
        <p className="font-heading text-[2.5rem] font-bold leading-none tracking-tight text-text-primary tabular-nums sm:text-[3rem]">
          {inr(earnings.total)}
        </p>
        {change !== null ? (
          <p
            className={cn(
              "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-caption font-semibold",
              change >= 0
                ? "bg-emerald-50 text-emerald-800"
                : "bg-rose-50 text-rose-800",
            )}
          >
            {change >= 0 ? (
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
            )}
            {change === 0
              ? "Same as"
              : `${Math.abs(change)}% ${change > 0 ? "more" : "less"} than`}{" "}
            the {periodName(days)} before
          </p>
        ) : (
          <p className="text-caption text-text-secondary">
            Nothing to compare with yet. Check back after your next{" "}
            {periodName(days)}.
          </p>
        )}
        <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-body text-text-secondary">
          <div className="flex gap-1">
            <dt className="sr-only">Bookings</dt>
            <dd>
              <span className="font-semibold text-text-primary tabular-nums">
                {earnings.bookings.toLocaleString("en-IN")}
              </span>{" "}
              bookings
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="sr-only">Hours played</dt>
            <dd>
              <span className="font-semibold text-text-primary tabular-nums">
                {earnings.hoursPlayed}
              </span>{" "}
              hours played
            </dd>
          </div>
          {earnings.bookings > 0 && (
            <div className="flex gap-1">
              <dt className="sr-only">Average booking</dt>
              <dd>
                <span className="font-semibold text-text-primary tabular-nums">
                  {inr(earnings.avgPerBooking)}
                </span>{" "}
                per booking
              </dd>
            </div>
          )}
        </dl>
      </div>

      {earnings.total > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-caption text-text-secondary" aria-live="polite">
            <span className="font-semibold text-text-primary">
              {weekly ? `Week of ${fmtDay(shown.date)}` : fmtDay(shown.date)}
            </span>
            {" · "}
            {inr(shown.revenue)} from {shown.bookings}{" "}
            {shown.bookings === 1 ? "booking" : "bookings"}
            {picked === null && " · your best " + (weekly ? "week" : "day")}
          </p>
          <div
            className="flex h-28 items-end gap-[3px] sm:gap-1"
            role="group"
            aria-label={`Earnings per ${weekly ? "week" : "day"}`}
          >
            {trend.map((p, i) => {
              const active = i === (picked ?? bestIdx);
              return (
                <button
                  key={p.date}
                  type="button"
                  onClick={() => setPicked(i)}
                  aria-label={`${fmtDay(p.date)}: ${inr(p.revenue)}`}
                  aria-pressed={active}
                  className="group flex h-full min-w-0 flex-1 items-end rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
                >
                  <span
                    className={cn(
                      "block w-full rounded-t-[3px] transition-[height,background-color] duration-500 ease-out motion-reduce:transition-none",
                      active
                        ? "bg-emerald-600"
                        : "bg-emerald-200 group-hover:bg-emerald-300",
                    )}
                    style={{
                      height: `${Math.max((p.revenue / max) * 100, p.revenue > 0 ? 4 : 1.5)}%`,
                    }}
                  />
                </button>
              );
            })}
          </div>
          <div className="flex justify-between text-caption text-text-secondary">
            <span>{fmtDay(trend[0].date)}</span>
            <span>{weekly ? "This week" : "Today"}</span>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- next steps

interface Step {
  icon: typeof Clock;
  title: string;
  body: string;
  href: string;
  cta: string;
}

/** Up to three concrete moves, chosen from this period's own numbers. */
export function pickSteps(d: OwnerInsights): Step[] {
  const steps: Step[] = [];
  const { week, customers, funnel, reviews, stations, earnings } = d;

  if (!d.enoughData) {
    steps.push({
      icon: Tag,
      title: "Get your first regulars in",
      body: "A launch offer gives new players a reason to try you. Once you have a handful of bookings, this page starts showing your busy and quiet times.",
      href: "/owner/offers",
      cta: "Create an offer",
    });
  }
  if (earnings.previous > 0 && earnings.total < earnings.previous * 0.8) {
    const drop = Math.round((1 - earnings.total / earnings.previous) * 100);
    steps.push({
      icon: TrendingDown,
      title: `Earnings are down ${drop}% on the ${periodName(d.days)} before`,
      body: "An offer on your quiet hours is the quickest way to win players back without cutting prices at peak time.",
      href: "/owner/offers",
      cta: "Create an offer",
    });
  }
  if (week.quietest && week.quietest.percent < 25) {
    steps.push({
      icon: Clock,
      title: `${slotLabel(week.quietest)} is quiet (${week.quietest.percent}% full)`,
      body: "Empty seats earn nothing. A happy-hours discount just for this time fills them without touching your busy hours.",
      href: "/owner/offers",
      cta: "Set up happy hours",
    });
  }
  if (week.busiest && week.busiest.percent >= 70) {
    steps.push({
      icon: Users,
      title: `${slotLabel(week.busiest)} is ${week.busiest.percent}% full`,
      body: "Keep someone on the desk for this rush, and don’t run discounts here. Players are already coming.",
      href: "/owner/staff",
      cta: "Manage staff",
    });
  }
  if (funnel.pageVisitors >= 20 && funnel.paid / funnel.pageVisitors < 0.05) {
    steps.push({
      icon: Store,
      title: `${funnel.pageVisitors} people saw your page, ${funnel.paid} booked`,
      body: "Clear photos of your setup, correct prices and opening hours are what make a visitor book.",
      href: "/owner/settings",
      cta: "Improve your page",
    });
  }
  if (customers.total >= 5 && customers.returning / customers.total < 0.3) {
    steps.push({
      icon: Repeat,
      title: "Most players came only once",
      body: "Coming back is where the money is. An offer for returning players gives them a reason for a second visit.",
      href: "/owner/offers",
      cta: "Create an offer",
    });
  }
  const [top, next] = stations;
  if (
    top &&
    next &&
    top.perSeat > next.perSeat * 1.5 &&
    top.percentFull >= 50
  ) {
    steps.push({
      icon: Monitor,
      title: `Your ${top.tierName} earn the most per seat`,
      body: `${inr(top.perSeat)} per seat against ${inr(next.perSeat)} for ${next.tierName}, and they’re ${top.percentFull}% full. Adding one more pays for itself fastest.`,
      href: "/owner/tiers",
      cta: "See your stations",
    });
  }
  if (reviews.count < 10) {
    steps.push({
      icon: QrCode,
      title:
        reviews.count === 0
          ? "You have no reviews yet"
          : `Only ${reviews.count} ${reviews.count === 1 ? "review" : "reviews"} so far`,
      body: "Players pick cafés with more reviews. Put your review QR on the counter and ask happy players to scan it.",
      href: "/owner/reviews",
      cta: "Get your review QR",
    });
  }
  // Same destination twice in a row reads as nagging; keep the first of each.
  const seen = new Set<string>();
  return steps
    .filter((s) => (seen.has(s.href) ? false : (seen.add(s.href), true)))
    .slice(0, 3);
}

export function NextSteps({ data }: { data: OwnerInsights }) {
  const steps = pickSteps(data);
  if (steps.length === 0) return null;
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-secondary p-4 text-white sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-1.5 font-heading text-h2">
          What to do next
          <InfoTip
            text={INFO_TIPS.insightsNextSteps}
            label="About these suggestions"
            className="[&>button:hover]:text-white [&>button]:text-white/70 [&_[role=tooltip]]:ring-1 [&_[role=tooltip]]:ring-white/20"
          />
        </h2>
        <p className="text-caption text-white/70">
          Picked from your own numbers for the last {periodName(data.days)}.
        </p>
      </div>
      <ol className="flex flex-col divide-y divide-white/10">
        {steps.map((s) => (
          <li
            key={s.title}
            className="flex gap-3 py-4 first:pt-0 last:pb-0 sm:items-center sm:gap-4"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-300">
              <s.icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-body-emphasis font-semibold text-white">
                  {s.title}
                </p>
                <p className="text-caption text-white/75">{s.body}</p>
              </div>
              <Link
                href={s.href}
                className="inline-flex min-h-[40px] w-fit shrink-0 items-center gap-1.5 rounded-xl bg-white px-3.5 text-caption font-semibold text-secondary transition-colors hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {s.cta}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- week grid

const SHADES = [
  { min: 70, cls: "bg-emerald-700", label: "Packed" },
  { min: 45, cls: "bg-emerald-500", label: "Busy" },
  { min: 20, cls: "bg-emerald-300", label: "Some players" },
  { min: 1, cls: "bg-emerald-100", label: "Quiet" },
  { min: 0, cls: "bg-surface", label: "Empty" },
];
const shade = (p: number) => SHADES.find((s) => p >= s.min)!;

export function WeekGrid({ data }: { data: OwnerInsights }) {
  const { hours, grid, busiest, quietest, averageFull } = data.week;
  const [cell, setCell] = useState<[number, number] | null>(null);

  if (hours.length === 0) {
    return (
      <Section
        title="When your café is busy"
        why="Once players start booking, you’ll see which days and hours fill up."
        tip={INFO_TIPS.insightsWeek}
      >
        <p className="text-body text-text-secondary">
          No bookings in this period yet.
        </p>
      </Section>
    );
  }

  const picked = cell
    ? {
        day: DAY_NAMES[cell[0]],
        hour: hours[cell[1]],
        pct: grid[cell[0]][cell[1]],
      }
    : null;

  return (
    <Section
      title="When your café is busy"
      why="Plan staff for the rush, and put offers on the empty hours instead of discounting the busy ones."
      tip={INFO_TIPS.insightsWeek}
    >
      <p className="text-body text-text-secondary">
        On average{" "}
        <span className="font-semibold text-text-primary tabular-nums">
          {averageFull}%
        </span>{" "}
        of your seats were in use while you were open.
      </p>

      {data.enoughData && (busiest || quietest) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {busiest && (
            <div className="flex flex-col gap-0.5 rounded-xl bg-emerald-50 px-3.5 py-3">
              <span className="text-caption font-semibold text-emerald-800">
                Busiest
              </span>
              <span className="text-body-emphasis font-semibold text-text-primary">
                {slotLabel(busiest)}
              </span>
              <span className="text-caption text-emerald-900/80">
                {busiest.percent}% of seats in use
              </span>
            </div>
          )}
          {quietest && (
            <div className="flex flex-col gap-0.5 rounded-xl bg-amber-50 px-3.5 py-3">
              <span className="text-caption font-semibold text-amber-800">
                Quietest
              </span>
              <span className="text-body-emphasis font-semibold text-text-primary">
                {slotLabel(quietest)}
              </span>
              <span className="text-caption text-amber-900/80">
                {quietest.percent}% of seats in use
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex w-full max-w-xl flex-col gap-2">
        <p
          className="min-h-[1.25rem] text-caption text-text-secondary"
          aria-live="polite"
        >
          {picked ? (
            <>
              <span className="font-semibold text-text-primary">
                {picked.day} {rangeLabel(picked.hour, (picked.hour + 1) % 24)}
              </span>
              {" · "}
              {picked.pct}% of seats in use on average
            </>
          ) : (
            "Tap any square to see how full that hour was."
          )}
        </p>
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: "2.75rem repeat(7, minmax(0, 1fr))" }}
        >
          <span />
          {DAYS.map((d) => (
            <span
              key={d}
              className="pb-0.5 text-center text-caption font-medium text-text-secondary"
            >
              {d}
            </span>
          ))}
          {hours.map((h, hi) => (
            <div key={h} className="contents">
              <span className="flex items-center justify-end pr-1.5 text-caption text-text-secondary tabular-nums">
                {hi % 2 === 0 ? hourLabel(h) : ""}
              </span>
              {DAYS.map((_, wd) => {
                const p = grid[wd][hi];
                const on = cell?.[0] === wd && cell?.[1] === hi;
                return (
                  <button
                    key={wd}
                    type="button"
                    onClick={() => setCell([wd, hi])}
                    aria-label={`${DAY_NAMES[wd]} ${hourLabel(h)}: ${p}% full`}
                    className={cn(
                      "h-6 rounded-[5px] transition-shadow",
                      shade(p).cls,
                      p === 0 && "border border-border",
                      on &&
                        "ring-2 ring-text-primary ring-offset-1 ring-offset-card",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-primary",
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <ul
          className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-text-secondary"
          aria-label="Colour key"
        >
          {[...SHADES].reverse().map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-3 w-3 rounded-[3px]",
                  s.cls,
                  s.min === 0 && "border border-border",
                )}
                aria-hidden
              />
              {s.label}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- customers

export function CustomersPanel({ data }: { data: OwnerInsights }) {
  const c = data.customers;
  const backPct = c.total ? Math.round((c.returning / c.total) * 100) : 0;
  return (
    <Section
      title="Who plays here"
      why="New players grow you. Players who come back are what keep the lights on."
      tip={INFO_TIPS.insightsCustomers}
    >
      {c.total === 0 ? (
        <p className="text-body text-text-secondary">
          No players booked in this period yet.
        </p>
      ) : (
        <>
          <p className="text-body text-text-secondary">
            <span className="font-heading text-h2 font-bold text-text-primary tabular-nums">
              {c.total}
            </span>{" "}
            {c.total === 1 ? "player" : "players"} booked.{" "}
            <span className="font-semibold text-text-primary">
              {c.returning}
            </span>{" "}
            had played here before.
          </p>
          <div className="flex flex-col gap-2">
            <div
              className="flex h-3 w-full overflow-hidden rounded-full bg-surface"
              aria-hidden
            >
              <span
                className="h-full bg-emerald-600"
                style={{ width: `${backPct}%` }}
              />
              <span
                className="h-full bg-amber-300"
                style={{ width: `${100 - backPct}%` }}
              />
            </div>
            <div className="flex justify-between text-caption text-text-secondary">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full bg-emerald-600"
                  aria-hidden
                />
                Came back · {c.returning}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full bg-amber-300"
                  aria-hidden
                />
                New · {c.new}
              </span>
            </div>
          </div>
          {c.regulars.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-caption font-semibold text-text-primary">
                Your regulars
              </h3>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {c.regulars.map((r, i) => (
                  <li
                    key={`${r.name}-${i}`}
                    className="flex items-center justify-between px-3 py-2 text-body"
                  >
                    <span className="text-text-primary">{r.name}</span>
                    <span className="text-caption text-text-secondary tabular-nums">
                      {r.visits} visits
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-caption text-text-secondary">
                Know them by name at the desk. It’s the cheapest way to keep
                them.
              </p>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- funnel

export function FunnelPanel({ data }: { data: OwnerInsights }) {
  const f = data.funnel;
  const top = Math.max(1, f.pageVisitors, f.startedBooking, f.paid);
  const rows = [
    {
      label: "Opened your café page",
      value: f.pageVisitors,
      cls: "bg-emerald-200",
    },
    {
      label: "Started a booking",
      value: f.startedBooking,
      cls: "bg-emerald-400",
    },
    { label: "Paid bookings", value: f.paid, cls: "bg-emerald-600" },
  ];
  const rate = f.pageVisitors
    ? Math.round((f.paid / f.pageVisitors) * 100)
    : null;
  return (
    <Section
      title="From your page to a booking"
      why="If lots of people look but few book, your photos, prices or hours are the place to fix."
      tip={INFO_TIPS.insightsFunnel}
    >
      {f.pageVisitors === 0 && f.paid === 0 ? (
        <p className="text-body text-text-secondary">
          No visits counted in this period yet.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.label} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-body">
                  <span className="text-text-secondary">{r.label}</span>
                  <span className="font-semibold text-text-primary tabular-nums">
                    {r.value.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface">
                  <div
                    className={cn("h-full rounded-full", r.cls)}
                    style={{ width: `${(r.value / top) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          {rate !== null && (
            <p className="text-caption text-text-secondary">
              About{" "}
              <span className="font-semibold text-text-primary">
                {Math.min(rate, 100)} in 100
              </span>{" "}
              people who opened your page went on to book.
            </p>
          )}
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- stations

export function StationsPanel({ data }: { data: OwnerInsights }) {
  const s = data.stations;
  return (
    <Section
      title="Which stations earn most"
      why="Compared per seat, so you know where one more machine, or a price change, would pay off."
      tip={INFO_TIPS.insightsStations}
    >
      {s.length === 0 ? (
        <p className="text-body text-text-secondary">
          Add your stations to see how each one earns.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {s.map((t, i) => (
            <li
              key={t.tierName}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body-emphasis font-semibold text-text-primary">
                  {t.tierName}
                  <span className="ml-1.5 text-caption font-normal text-text-secondary">
                    {t.seats} {t.seats === 1 ? "seat" : "seats"}
                  </span>
                </span>
                <span className="shrink-0 text-body text-text-primary tabular-nums">
                  <span className="font-semibold">{inr(t.perSeat)}</span>
                  <span className="text-caption text-text-secondary">
                    {" "}
                    per seat
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      i === 0 && t.revenue > 0
                        ? "bg-emerald-600"
                        : "bg-emerald-300",
                    )}
                    style={{ width: `${t.percentFull}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-caption text-text-secondary tabular-nums">
                  {t.percentFull}% full
                </span>
              </div>
              <p className="text-caption text-text-secondary tabular-nums">
                {inr(t.revenue)} from {t.bookings}{" "}
                {t.bookings === 1 ? "booking" : "bookings"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- games + reviews

export function GamesAndReviews({
  data,
  topGames,
}: {
  data: OwnerInsights;
  topGames: { name: string; percentage: number }[];
}) {
  const r = data.reviews;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Section
        title="What people play"
        why="Keep these installed, updated and ready. It’s what players ask for."
      >
        {topGames.length === 0 ? (
          <p className="text-body text-text-secondary">
            Players haven’t picked a game on their bookings yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {topGames.map((g) => (
              <li key={g.name} className="flex items-center gap-3 text-body">
                <Gamepad2
                  className="h-4 w-4 shrink-0 text-text-secondary"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-text-primary">
                  {g.name}
                </span>
                <span className="text-caption text-text-secondary tabular-nums">
                  {Math.round(g.percentage)}% of bookings
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section
        title="What players say"
        why="Your rating is the first thing a new player sees next to your name."
      >
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Star className="h-6 w-6 fill-current" aria-hidden />
          </span>
          <p className="text-body text-text-secondary">
            {r.average !== null ? (
              <>
                <span className="font-heading text-h2 font-bold text-text-primary tabular-nums">
                  {r.average.toFixed(1)}
                </span>{" "}
                from {r.count} {r.count === 1 ? "review" : "reviews"}
              </>
            ) : (
              "No reviews yet"
            )}
            <br />
            <span className="text-caption">
              {r.newInPeriod} new in the last {periodName(data.days)}
            </span>
          </p>
        </div>
        <Link
          href="/owner/reviews"
          className="inline-flex min-h-[40px] w-fit items-center gap-1.5 rounded-xl border border-border px-3.5 text-caption font-semibold text-text-primary hover:bg-surface"
        >
          Read and reply to reviews
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </Section>
    </div>
  );
}
