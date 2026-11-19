# Café page revamp: compact setup tiles, swipe gallery, working photo viewer, game posters, call option

Date: 2026-11-20. Status: approved by the founder's brief (build, then review on dev).
Branch: `feat/gta6-check-first` (same worktree, cut from c67eafa). Skills used: Impeccable (Operate mode,
craft floor) and UI-UX Pro Max `ui-styling` (Tailwind, accessibility, responsive).
Surface: `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx` (customer café page) and the GTA 6 request screens.

## Mode and direction (Impeccable)
**Operate.** A player is choosing a setup and a time. Scanability, one-screen density and native expectations beat
expression. Brand shows in precise detail (the existing KHEL-O red, Space-style heading face, depth buttons), not in new
decoration. No new colours, fonts or card-in-card nesting. Tokens stay the project's existing Tailwind tokens
(`bg-card`, `border-border`, `text-text-primary/secondary`, `text-caption`, `font-heading`, `font-data`).
Craft-floor checks that apply: contrast 4.5:1 on small text, 44px tap targets, visible keyboard focus, no kicker labels
above headings, no coloured side borders, one authored motion moment (the swipe), real content at 390px and 1440px.

## Problems (verified)
1. **Photos do not open.** Reproduced on dev (MNG Gaming Cafe, desktop 1440x900): clicking the hero photo opens nothing.
   Cause: a full-size gradient overlay (`absolute inset-0`) sits above the `<img>` and swallows the click, so the
   `onClick` on the image never fires, on desktop or phone. Second fault: in the viewer, the image container is a
   flex child without `min-h-0`, so tall (vertical) photos overflow instead of fitting, and `stopPropagation` on the
   container means tapping the empty area around the photo does not close it.
2. **Setup tiles are tall.** Each PC tile stacks name, GPU line, RAM/Hz line, three FPS figures, "estimated", offers,
   photo link. A café with 4 setups does not fit one screen.
3. **PC tiles show only GPU, RAM and Hz.** CPU and the monitor (`specs.monitor`) are stored but never shown.
4. **Games available is a grid of text chips.**
5. **Photo gallery cannot be swiped** (arrows and a "1 / 5" pill only) and has no dot indicator.
6. **GTA 6 requests: no call option.** Players can WhatsApp the founder but cannot call.

## Design

### 1. Setup tile (all setups)
One tile, three tiers of information, nothing hidden that decides the choice:
- **Row 1:** platform icon, setup name, price per hour on the right. (Unchanged.)
- **Row 2, PCs:** a compact 2x2 spec grid in `text-caption`, only the fields that exist:
  `CPU` / `GPU` on the first line, `Screen` (specs.monitor, e.g. 27" 1440p IPS) / `Refresh` (refreshRateHz, "240 Hz") on
  the second. Label in `text-text-secondary`, value in `font-semibold text-text-primary`. RAM joins the CPU line's end
  when present. Missing fields are skipped, never shown as "N/A".
- **Row 2, consoles:** the model line as today.
- **FPS disclosure:** the three FPS figures move behind one small button, "Game FPS" with a chevron, closed by default.
  Opening shows the same figures plus the "estimated" note inline, below the tile content. It is a real `<button>` with
  `aria-expanded`/`aria-controls`, 44px tall hit area, `relative z-10` so it never triggers booking.
- Offer line, co-op line and "See N photos" are unchanged but "See N photos" shares a line with the FPS button
  (`FPS` left, `Photos` right) to save a row.
Target: a café with 4 setups shows all 4 tiles in one 390x844 screen below the title.

### 2. Hero gallery
- Swipeable track: CSS scroll-snap (`snap-x snap-mandatory`, one slide per photo, `overscroll-x-contain`), so a thumb
  swipe works natively with momentum. Only slide 1 is eager; the rest `loading="lazy"`.
- **Instagram-style dots** centred at the bottom over a soft scrim: the active dot is wider/solid white, others
  `white/50`. More than 7 photos: dots shrink and the pill "n / N" stays. Dots are buttons (jump to photo), 24px hit area.
- **Arrows stay** (desktop, always visible on hover and on keyboard focus; hidden on touch-only screens is NOT done:
  they remain, just unobtrusive), and scroll the track by one slide.
- The "n / N" pill stays top-right of the image.
- The overlay gradient gets `pointer-events-none`. Tapping a photo opens the viewer.

### 3. Photo viewer (lightbox)
- Fix the fit: image container `min-h-0 flex-1`, image `max-h-full max-w-full object-contain`, so vertical, horizontal
  and square photos all fit the screen on phone and PC.
- Close by tapping **anywhere that is not the photo, an arrow or a control** (remove the container's
  `stopPropagation`; stop propagation only on the image itself and the arrow buttons). Escape and the X still close.
- Swipe left/right (existing) and arrows remain; add the same dot indicator under the photo. Body scroll stays locked.
- `role="dialog"`, `aria-modal`, focus moved to the close button on open and restored on close.

### 4. Games available as posters
- Replace the text chips with a horizontally scrolling row of **portrait poster tiles** (3:4, about 104px wide on
  phone, scroll-snap), one row per platform under the existing platform heading. Rows scroll sideways so the section
  stays short however many games a café lists.
- **Art:** official game covers are third-party copyright, so they are NOT used. Each poster is an original generated
  tile: a deterministic two-colour gradient from the game's name, the game name set large in the heading face,
  small platform icon bottom-left. A `GAME_ART` map (`lib/gameArt.ts`) lets the founder drop a licensed or
  permission-cleared image into `public/games/<key>.jpg` later and it replaces the generated tile automatically.
  Exception: GTA 6 reuses the artwork already in the app (`/drops/gta6-square.jpg`).
- Text on every poster is white on a darkened gradient (contrast checked at 4.5:1).

### 5. Call option for GTA 6 requests
- `GET /gta6-requests/config` already returns the founder WhatsApp number; the client builds `tel:+<digits>` from it.
- **Request status screen:** next to "Message us on WhatsApp", a second button **Call us** (secondary style,
  phone icon). The copy says "Calling is usually faster."
- **Request pop-up:** after the number is typed, the hint reads "...message us on WhatsApp or call us."
- **Founder alerts (already built, unchanged):** on every new request the founder gets an in-app/push notification and an
  email. A WhatsApp message to the founder happens when the player taps the WhatsApp button (pre-filled with café,
  console, time and reference). Automatic WhatsApp alerts need the WhatsApp Business API and are out of scope.

## Files
- Modify: `app/(customer)/cafe/[id]/CafeDetailClient.tsx` (tile, hero gallery, lightbox, games section),
  `components/customer/SetupPhotosSection.tsx` (no change expected), `components/gta6/Gta6RequestSheet.tsx`,
  `app/(customer)/gta6-requests/[id]/page.tsx`, `lib/api/gta6Requests.ts` (`founderCallUrl`).
- Create: `components/customer/SetupSpecs.tsx` (spec grid + FPS disclosure), `components/customer/PhotoCarousel.tsx`
  (swipe track + dots + arrows), `components/customer/GamePoster.tsx`, `lib/gameArt.ts`.

## Testing
Vitest: spec-grid field picking (skips missing fields, formats Hz), dot windowing for many photos, poster colour is
deterministic per name. Real-browser check on dev at 390x844 and 1440x900: the hero click opens the viewer (the
reproduced failure), a vertical photo fits the viewport, a tap outside the photo closes it, swiping the hero moves
the dots, a 4-setup café shows all tiles on one screen, FPS opens and closes, posters scroll, Call us has a `tel:` link.
Dev first; the founder reviews, then runs the prod deploy.

## Out of scope
Owner-side forms (CPU/monitor fields already exist), changing prices or booking flow, automatic WhatsApp alerts,
licensed game artwork (placeholder map is ready for it).
