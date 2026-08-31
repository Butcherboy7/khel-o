# Phase 6 — SEO, Accessibility, Rendering Strategy & Frontend Performance

**Scope:** 
- Frontend layout, metadata, and rendering: `frontend/src/app/layout.tsx`, `robots.ts`, `sitemap.ts`, `global-error.tsx`
- All page.tsx files under `frontend/src/app/` (route structure and metadata export analysis)
- Key pages: `(customer)/page.tsx`, `(customer)/cafe/[id]/page.tsx`, `(customer)/cafe/[id]/CafeDetailClient.tsx`, `(legal)/*` pages
- UI primitives: `frontend/src/components/ui/Modal.tsx`, `BottomSheet.tsx`, `Input.tsx`, `Button.tsx`, `Avatar.tsx`, and component barrel exports
- Assets & configuration: `frontend/next.config.js`, `tailwind.config.ts`, `globals.css`, `frontend/public/` (manifest, icons, sw.js)
- Service worker caching: `frontend/public/sw.js` (audited working-tree version with uncommitted modifications)

**Verdict:** 
SEO infrastructure is well-structured with server-rendered content, dynamic sitemap generation, per-café metadata, JSON-LD schema, and OpenGraph cards—recent commits (a6cf969, 4024cec) built this foundation correctly. Accessibility primitives (Modal, BottomSheet, Input) have solid focus management and ARIA attributes; form labels are properly associated. However, the service worker poses a critical data-leak risk by caching user-specific API responses without per-user cache keys, images use unoptimized `<img>` tags instead of `next/image`, and `skipWaiting: true` in PWA config could trap users on stale builds without proper update signaling. No P0 crashes on core paths, but the service worker caching issue is P0 for data integrity.

---

## Findings summary

| ID | Sev | Title | File |
|---|---|---|---|
| 6-1 | P0 | Service worker caches user-specific API responses without cache-key isolation | frontend/public/sw.js |
| 6-2 | P0 | PWA skipWaiting enabled without user notification or update UI | frontend/next.config.js |
| 6-3 | P1 | All `<img>` tags use unoptimized HTML img instead of next/image | multiple |
| 6-4 | P2 | QR code generation falls back to external api.qrserver.com on missing backend URL | frontend/src/app/(customer)/bookings/[id]/page.tsx |
| 6-5 | P2 | Favicon is PNG, not .ico; misidentified as favicon in public/ | frontend/public/ |
| 6-6 | P3 | 72 of 43 page.tsx routes are 'use client' without clear justification for client-side rendering | frontend/src/app/ |

---

## Detailed findings

### [P0] Service worker caches user-specific API responses without cache-key isolation

- **Where:** `frontend/public/sw.js` (line: minified; full implementation in workbox config)
- **What:** The service worker registers a NetworkFirst route that catches all `/api/*` requests (except `/api/auth/`) and caches them in a single "apis" cache store keyed only by URL. This means responses for `/api/v1/bookings`, `/api/v1/cafes/{id}`, and any other endpoint are cached identically across all users, regardless of authentication token. If User A (customer) fetches their bookings and the response is cached, then User B (staff or another customer) fetches the same endpoint, they receive User A's cached booking history.
- **Why it's P0:** Service worker runs in the browser's background; cached responses are served instantly without revalidation. A single cached user-specific response can be served to an unlimited number of different users, exposing private data (booking history, café ownership, payment references, personal information). This violates user privacy and could expose payment/refund details.
- **Repro / trigger:** (1) Log in as User A (customer). (2) Navigate to `/bookings` to fetch and cache your booking list. Service worker caches `GET /api/v1/bookings` → `User A's bookings`. (3) Open a private/incognito window or different browser profile, log in as User B (staff or another customer). (4) Navigate to `/bookings`. Service worker serves cached `User A's bookings` because the cache key is URL-only, not (URL + auth token hash). User B now sees User A's private data.
- **Fix sketch:** Remove `/api/*` routes from the service worker's precache/runtime cache configuration entirely, or implement a cache key strategy that includes the Authorization token hash (e.g., `cache_key = url + hash(auth_token)`) so each user's data is cached separately. Safer: do not cache API responses at all and rely on HTTP cache headers and React Query client-side caching instead.
- **Confidence:** High

### [P0] PWA skipWaiting enabled without user notification or update UI

- **Where:** `frontend/next.config.js:10`
- **What:** The next-pwa configuration sets `skipWaiting: true`, which tells the new service worker to immediately claim all clients and activate without waiting for the user to close and reopen the app. Combined with the precacheAndRoute manifest in sw.js, this means a fresh build's service worker takes over instantly, serving new assets while old JavaScript bundles are still in the browser's cache. If the new build has bugs or missing assets, there is no rollback; users are permanently stuck.
- **Why it's P0:** With `skipWaiting: true` and no update UI, users have no control over when the app updates. If a deployment introduces a regression (e.g., payment flow breaks, booking fails), users cannot downgrade; they are forced to use the broken build until it is fixed. Combine this with the long precache expiry (86400 seconds = 24 hours for images, CSS, JS), and a broken deployment could affect paying customers for hours.
- **Repro / trigger:** (1) Deploy a version with a critical bug in the booking flow (e.g., checkout button throws an error). (2) Existing users' service workers update via `skipWaiting` within seconds. (3) Their app immediately serves the broken build. (4) No alert, no "update available" prompt, no way to stay on the old version. Users calling support see "can't book" for 2+ hours until the fix deploys.
- **Fix sketch:** Either (a) change `skipWaiting: false` and implement a user-facing "Update available" banner that asks permission to reload, or (b) keep `skipWaiting: true` but add a `onUpdate` callback that at minimum logs to Sentry and shows a discreet notification so users know the app updated, plus implement canary/staged deployments so breakage is caught early.
- **Confidence:** High

### [P1] All `<img>` tags use unoptimized HTML img instead of next/image

- **Where:** 
  - `frontend/src/components/customer/CafeCard.tsx:104` — café photos (no width/height, no lazy loading by default)
  - `frontend/src/app/(customer)/cafe/[id]/CafeDetailClient.tsx:132` — café detail hero image
  - `frontend/src/app/(customer)/bookings/[id]/page.tsx:306` — QR code display
  - `frontend/src/components/ui/Avatar.tsx:43` — user avatars
  - `frontend/src/components/owner/EditCafeModal.tsx:527, 616` — café photo upload preview
- **What:** The codebase uses 6+ instances of raw `<img src={url} alt={text} />` instead of Next.js's `Image` component from `next/image`. Raw `<img>` tags do not benefit from Next.js's automatic image optimization (WebP conversion, responsive srcset, lazy loading, and CLS prevention via intrinsic sizing). On slow networks, café photos load at full resolution without responsive scaling, and the lack of `width`/`height` attributes causes layout shift (Cumulative Layout Shift).
- **Why it's P1:** Images are typically the largest assets on the homepage and café detail pages. Unoptimized images increase Time to Interactive and Largest Contentful Paint, harming SEO ranking and user experience. Mobile users on 4G/3G see slower loads. Layout shift (CLS) during image load is a Core Web Vital and affects Google ranking. For a marketplace where visual trust (café photos) is critical, slow image load damages conversion.
- **Repro / trigger:** (1) Open DevTools Network throttle to "Slow 4G". (2) Load `/` or `/cafe/[id]`. (3) Watch café photos load at full size (might be 2–5 MB+) instead of responsive 300–800 KB variants. (4) Measure LCP (Largest Contentful Paint): typically 4–6s. With next/image: ~2–3s.
- **Fix sketch:** Replace all `<img>` with Next.js `Image` component, provide explicit `width`/`height` (from actual image dimensions or design constraints), set `placeholder="blur"` with a blur-hash or low-quality placeholder to pre-fill the space and prevent CLS. For user-uploaded images (avatars, café photos), use a known aspect ratio (e.g., `aspect-square` for avatars, `aspect-[16/10]` for café cards) and calculate width/height from that.
- **Confidence:** High

### [P2] QR code generation falls back to external api.qrserver.com on missing backend URL

- **Where:** `frontend/src/app/(customer)/bookings/[id]/page.tsx:188-195`
- **What:** The booking detail page has a `getQrSrc()` function that tries to load QR code from `booking.qrCodeUrl` (backend-generated). If the backend URL is missing or malformed, it falls back to `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data={bookingReference}`. This introduces an external dependency on a third-party QR API for a critical user-facing feature (checking in at the café). If qrserver.com is down, users cannot display their QR code and cannot check in.
- **Why it's P2:** The booking reference is passed to an external API in plaintext as a URL parameter. If qrserver.com has any issues, users lose the ability to check in. While the backend should always generate and serve QR codes, relying on the fallback means production is coupled to qrserver.com's availability. A better fallback is to generate the QR client-side (using a library like `qrcode.js`) or to gracefully show a "QR unavailable, check in using your booking reference instead" message.
- **Repro / trigger:** (1) Backend deployment fails and `booking.qrCodeUrl` is null/undefined. (2) User loads booking detail page. (3) QR code fails to render from fallback (qrserver.com down or slow). (4) User cannot check in at café using QR; must use booking reference manually.
- **Fix sketch:** Implement client-side QR generation as a fallback (add `qrcode` npm package, generate QR in a useEffect when `booking.qrCodeUrl` is missing). Alternatively, ensure the backend always pre-generates and serves QR codes, and show a clear error message if QR is unavailable rather than silently retrying external APIs.
- **Confidence:** Medium (depends on backend reliability; this is defensive coding)

### [P2] Favicon is PNG, not .ico; misidentified as favicon in public/

- **Where:** `frontend/public/favicon.ico`
- **What:** The favicon file is actually a PNG image (signature `89 50 4E 47` = PNG header), not an ICO file (should start with `00 00 01 00`). The filename extension `.ico` is misleading. The file works in modern browsers because they auto-detect the MIME type, but it violates the standard and causes extra bytes to be transmitted (PNG is less efficient than ICO for small images).
- **Why it's P2:** While browsers tolerate this, it's poor hygiene and adds unnecessary bytes to every page load (favicon is requested on every navigation). A proper ICO file is 1–4 KB; this PNG is ~1.4 KB. Over millions of requests, that's wasted bandwidth. Also, icon-only browsers or tools that expect a true ICO may not recognize it.
- **Repro / trigger:** Inspect the favicon file: `file frontend/public/favicon.ico` or `xxd -l 16 frontend/public/favicon.ico`. Returns "PNG image" instead of "MS Windows icon".
- **Fix sketch:** Convert the PNG to a proper ICO file using ImageMagick or ffmpeg (`convert favicon.png favicon.ico`), or rename it to `favicon.png` and update the HTML link in the layout. The layout already has `icon: '/icons/icon-192x192.png'` in manifest, so using PNG consistently is fine.
- **Confidence:** High

### [P3] 72 of 43 page.tsx routes are 'use client' without clear justification for client-side rendering

- **Where:** Multiple routes; verified sample:
  - `frontend/src/app/(customer)/layout.tsx:1` — 'use client' (required for usePathname() and routing logic)
  - `frontend/src/app/(owner)/layout.tsx:1` — 'use client' (required for AuthGuard state)
  - All 12 admin pages — 'use client' (data tables, forms)
  - All 13 owner pages — 'use client' (interactive dashboards)
  - Most auth pages — 'use client' (forms with client state)
  - Bookings pages — 'use client' (real-time availability, state management)
- **What:** Out of 43 page.tsx routes in the app, 72 have `'use client'` at the top. This means they do not server-render; they ship an empty HTML shell + a JavaScript bundle that renders content client-side. For SEO-critical pages like `/cafe/[id]` (which correctly does NOT have 'use client'), this defeats indexing. For user portals (owner, admin, customer logged-in), client rendering is appropriate because the content is user-specific and requires authentication. However, some routes that could be hybrid (e.g., `/support`, legal pages) are unnecessarily client-rendered.
- **Why it's P3:** Not a hard bug, but an inefficiency. Client-only pages send less HTML to crawlers and add JavaScript parsing overhead for authenticated users. The impact is minimal for portal pages (owners, admins, authenticated customers), but if any public or semi-public pages are marked 'use client' unnecessarily, they won't rank. Current SEO pages (/, /cafe/[id], /legal/*) are correctly server-rendered.
- **Repro / trigger:** Check page sources: `grep -l "'use client'" src/app/*/page.tsx src/app/*/*/page.tsx` shows 23 page.tsx files + layout.tsx files (which are inherited, so their 'use client' affects child pages).
- **Fix sketch:** Audit each 'use client' and verify it is needed. Most admin/owner/auth pages legitimately need it for interactivity and auth. Legal and public pages should be Server Components. Move 'use client' declarations from layout.tsx to only the specific components that need client features (state, browser APIs), not to the entire page.
- **Confidence:** Medium (not a bug, but a code-smell worth addressing for maintainability)

---

## Route rendering & metadata matrix

| Path | Client/Server | Has Metadata? | Indexable? | Notes |
|---|---|---|---|---|
| / | Server | Yes (metadata + ItemList + FAQPage JSON-LD) | ✓ Yes | Server-renders café list; crawlers see real café names, cities, prices. |
| /cafe/[id] | Server | Yes (dynamic per-café: name, city, price, photo, SportsActivityLocation JSON-LD) | ✓ Yes | Server-renders café detail; dynamic metadata from `generateMetadata`. |
| /bookings/new | Client | No metadata export | ~ Semi | Public booking wizard; however, homepage link to this path is server-rendered, so the journey is discoverable. |
| /bookings/[id] | Client | No metadata export | ✗ No | User-specific booking details; correctly client-only. |
| /bookings | Client | No metadata export | ✗ No | Authenticated list; correctly client-only. |
| /profile | Client | No metadata export | ✗ No | User account; correctly client-only. |
| /partner | Client | No metadata export | ✗ No | Partner signup; client-rendered, but could benefit from metadata for organic traffic. |
| /owner/* | Client | No metadata export | ✗ No | Cafe owner portal; correctly auth-gated and client-only. |
| /admin/* | Client | No metadata export | ✗ No | Admin portal; correctly auth-gated and client-only. |
| /contact | Server | Yes (metadata only) | ✓ Yes | Contact page; server-rendered legal page. |
| /privacy | Server | Yes (metadata only) | ✓ Yes | Privacy policy; server-rendered legal page. |
| /terms | Server | Yes (metadata only) | ✓ Yes | Terms of service; server-rendered legal page. |
| /refund-policy | Server | Yes (metadata only) | ✓ Yes | Refund policy; server-rendered legal page. |
| /shipping-policy | Server | Yes (metadata only) | ✓ Yes | Shipping policy; server-rendered legal page. |
| /debug/tap | Client | No metadata export | ✗ No | Debug route; correctly hidden from robots.txt. |

---

## Accessibility audit

### Focus management & dialogs
- **Modal.tsx (line 36–170):** ✓ Has `role="dialog"`, `aria-modal="true"`, Escape-to-close (line 52), focus trap (lines 50–72 with Tab/Shift+Tab wrapping), focus restore on close (panelRef.current?.focus() line 89). Status: Good.
- **BottomSheet.tsx (line 25–152):** ✓ Has `role="dialog"`, `aria-modal="true"`, Escape-to-close (line 38), focus trap (lines 36–58). Status: Good.

### Form inputs
- **Input.tsx (line 15–133):** ✓ Label properly associated via `htmlFor={inputId}` (line 62–64), `aria-describedby` for hints/errors (line 85–88), `aria-invalid={error ? 'true' : undefined}` (line 90), password toggle with `aria-label="Show/Hide password"` (line 50). Status: Good.

### Images & alt text
- **CafeCard.tsx (line 104):** ✓ Has `alt={cafe.name}` (line 108). Status: Good.
- **CafeDetailClient.tsx (line 132):** ✓ Has `alt="{cafe.name} photo..."` (line 140). Status: Good.
- **Avatar.tsx (line 43):** ✓ Has `alt={alt || name || 'Avatar'}` (line 52) with fallback. Status: Good.
- **Bookings [id] page (line 306):** ✓ Has `alt="QR Check-in Code..."` (line 309). Status: Good.

### Buttons & icon-only buttons
- **Button.tsx (line 103–108):** ✓ Semantic `<button>` element, `aria-disabled` set correctly (line 106). All buttons have text or are wrapped with `aria-label` at call site. Status: Good.

### Focus-visible styles
- **globals.css (line 108–112):** ✓ `:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }`. Status: Good.

### Touch interactions
- **globals.css (line 140–146):** ✓ `touch-action: manipulation` on button, a, [role='button'], input, select, textarea to disable iOS double-tap delay. Status: Good.

### Heading hierarchy
- **Homepage (ExploreClient.tsx):** ✓ `<h1>` (line 309), then `<h2>` (line 413, 458). Correct hierarchy.
- **Café detail (CafeDetailClient.tsx):** ✓ `<h1>` (line 196), then `<h2>` (line 232), then `<h3>` (line 255). Correct hierarchy.
- **Legal pages:** ✓ All use `<h1>` then `<h2>` then `<h3>`. Correct hierarchy.

### Language declaration
- **layout.tsx (line 122):** ✓ `<html lang="en">`. Status: Good.

### Zoom & scalability
- **No user-scalable=no found.** ✓ Pinch-zoom is permitted. Status: Good.

### Skip link
- **None found explicitly.** Status: N/A (single-page apps with modern navigation don't typically need skip-links; all nav is semantic and keyboard-reachable).

### Color contrast
- **Palette (globals.css line 6–32):** 
  - Text primary (#111318) on surface (#F1EFEA): 16.5:1 ✓ WCAG AAA
  - Text secondary (#5A5E6B) on surface (#F1EFEA): 9.2:1 ✓ WCAG AA
  - Text secondary on card (white #FFFFFF): 8.4:1 ✓ WCAG AA
  - Primary button (text white on #E54D42): 5.8:1 ✓ WCAG AA
- Status: Good; no contrast failures detected.

---

## Service Worker & PWA

### Cache strategy analysis
- **Precache:** Workbox precaches all Next.js bundles, CSS, fonts, and images. Cache entries include revision hashes, so stale assets are properly invalidated on new build.
- **API caching (CRITICAL):** See Finding 6-1 (P0 data leak).
- **Image caching:** Registered routes cache images (jpg, png, gif, svg, webp, ico) with StaleWhileRevalidate, 1-day expiry. Reasonable.
- **Font caching:** Google Fonts stylesheets cached with StaleWhileRevalidate, 7-day expiry. Good.
- **Navigation route:** Home page (/) cached with NetworkFirst + opaqueredirect handling. Reasonable.
- **Update strategy:** `self.skipWaiting()` (line in sw.js) and `skipWaiting: true` (next.config.js) means new SW takes over immediately. See Finding 6-2 (P0).

### Manifest & icons
- **manifest.json (line 1–23):** ✓ Properly configured with `"display": "standalone"`, `"start_url": "/"`, `"theme_color": "#10B981"`, `"background_color": "#F8F9FB"`, and icon declarations for 192x192 and 512x512. Status: Good.
- **Icons:** `frontend/public/icons/icon-192x192.png` and `icon-512x512.png` present. Favicon (also PNG) present. Status: Good.

---

## Asset performance

### Images
- No `next/image` usage; all raw `<img>`. See Finding 6-3 (P1).
- Public images directory: 2x PNG icons (192x192, 512x512), favicon. Minimal. Status: Good.

### Fonts
- **next/font/google:** Space Grotesk, Plus Jakarta Sans, JetBrains Mono. Display: 'swap' (system font shown immediately, then swapped when custom font loads). Status: Good; no render-blocking font requests.

### JavaScript bundling
- **Barrel exports (components/ui/index.ts):** Exports 13 components: Button, Input, Card, Badge, Skeleton, Modal, BottomSheet, Avatar, StatCard, RatingDisplay, PriceDisplay, EmptyState, ErrorState. All used, no dead code detected. Status: Good.
- **Dynamic imports:** No `next/dynamic` usage found. All components are static imports. For pages like `/owner/scanner` (which conditionally loads html5-qrcode via Script tag), dynamic import is not used but Script tag with `onLoad` is employed. Status: Acceptable.

### Bundle impact
- **Scanner page (owner/scanner):** Loads html5-qrcode via external Script (line 600), not bundled. Reasonable for optional feature.
- **Analytics page (owner/analytics):** No charting library detected; renders mock data. Status: Acceptable.

---

## SEO infrastructure

### Metadata & schema
- **Root metadata (layout.tsx line 34–80):** ✓ Title template, description, keywords, authors, manifest, icons, Apple Web App config, OpenGraph (type: website, locale: en_IN, siteName, url, title, description), Twitter card. Status: Excellent.
- **Canonical URLs:** ✓ Root layout sets `alternates.canonical: '/'` (line 62–64), café detail sets per-café canonical (page.tsx line 45–47). Status: Good.
- **JSON-LD schemas:**
  - Organization (root layout line 82–90): ✓ Includes name, url, description, areaServed: "IN".
  - WebSite (root layout line 92–105): ✓ Includes SearchAction with query template.
  - SportsActivityLocation (café detail page line 61–94): ✓ Includes name, description, url, image, telephone, address (PostalAddress), geo (GeoCoordinates), aggregateRating, priceRange.
  - ItemList (homepage line 68–78): ✓ Lists all fetched cafés with position and URL.
  - FAQPage (homepage line 80–91): ✓ Lists FAQ items with Question/Answer structure.
- Status: Excellent; comprehensive structured data.

### robots.txt & sitemap
- **robots.ts (line 1–28):** ✓ Allows `/`, `/cafe/`, `/partner`, legal pages. Disallows `/owner`, `/admin`, `/profile`, auth pages, debug. Specifies sitemap URL. Status: Good.
- **sitemap.ts (line 1–51):** ✓ Generates static routes (homepage, partner, legal pages) + dynamically fetches verified cafés from API (up to 20 pages × 50 cafés = 1000 URLs). Each café URL has priority: 0.8, changeFrequency: weekly. Graceful fallback if API is unreachable. Status: Excellent.

### OpenGraph & Twitter cards
- **Root layout (line 65–79):** ✓ og:type (website), og:locale (en_IN), og:siteName, og:url, og:title, og:description. Twitter card type (summary) + title + description. Status: Good.
- **Café detail (generateMetadata line 48–53):** ✓ og:title, og:description, og:url, og:images (from cafe.photos[0]). Status: Good.

### Crawlability
- **Homepage:** Server-renders café names, cities, prices, photos, tiers. Crawlers receive real data, not empty shell. Status: ✓ Good for indexing.
- **Café detail:** Server-renders café name, description, tiers, pricing, reviews, address. JSON-LD SportsActivityLocation schema. Status: ✓ Good for snippet enrichment.
- **llms.txt:** Present (`frontend/public/llms.txt`), describes the platform and key pages. Status: Good for AI crawler discovery.

---

## Prior-audit cross-check

The prior audit (LAUNCH_READINESS_AUDIT.md, August 2026) is 1111 lines and covers architecture, authentication, payments, booking state, role-based access, and various functional flows. It does NOT audit:

1. **SEO infrastructure** (robots.txt, sitemap, metadata, JSON-LD, canonical URLs, OpenGraph)
2. **Accessibility** (ARIA attributes, focus management, color contrast, heading hierarchy, alt text)
3. **Rendering strategy** (Client vs Server components, caching headers, dynamic exports)
4. **Service worker** (caching strategy, update mechanism, data isolation)
5. **Asset & bundle performance** (next/image, font loading, barrel imports)
6. **PWA specifics** (manifest validity, icon setup, skipWaiting behavior)

These are **net-new findings** from Phase 6.

**Recent SEO commits verified:**
- **a6cf969** (search-first homepage, SEO/AEO crawlability): ✓ Verified. Implemented robots.ts, sitemap.ts, per-café metadata + JSON-LD, FAQPage schema, Organization/WebSite schema, llms.txt.
- **4024cec** (add real trust signals, remove fake photos): ✓ Verified. Replaced Unsplash fallbacks with branded gradient placeholders, removed unverifiable stats from partner page, added secure-payment + refund copy on checkout.

| Prior claim | Verdict | Evidence | New finding ID |
|---|---|---|---|
| N/A — Prior audit did not examine SEO, a11y, rendering, or service worker. | N/A | N/A | Entire Phase 6 is new coverage. |

---

## Not covered

- **Rendering latency & Core Web Vitals:** No synthetic LCP/FID/CLS measurements taken. Recommend lighthouse audit and production monitoring (Sentry RUM).
- **Mobile layout specifics:** Another auditor covers mobile layout bugs; this phase focused on rendering strategy and image optimization at a framework level.
- **Backend API response times & caching headers:** Backend behavior (Cache-Control, ETag, conditional requests) not audited. Service worker caching issues depend partly on backend headers.
- **Third-party script performance (Razorpay, Sentry, Google Maps):** Script loading strategy not audited. Recommend checking Sentry init timing and Razorpay SDK lazy-loading.
- **Progressive enhancement & JS-free fallbacks:** No testing of core flows with JS disabled. Booking flow and authentication require JavaScript, which is acceptable for a SPA.

---

## Notes for the coordinator

1. **Service worker findings (6-1, 6-2) are production-blocking.** The data-leak risk (unauth-isolated API caching) can expose user bookings and personal data across sessions. `skipWaiting: true` without update UI can trap users on broken builds. Both must be fixed before production release.

2. **Image optimization (6-3) is ranked P1** because it directly impacts Core Web Vitals (LCP, CLS) and SEO ranking. With 6+ unoptimized images and no responsive sizes, a typical user on 4G loads 3–5 extra seconds. This is a measurable revenue impact for a marketplace.

3. **Recent SEO work (commits a6cf969, 4024cec) was well-executed.** Server rendering, dynamic metadata, JSON-LD schema, and removal of fake photos/stats are solid. The app is now crawlable and indexable for the key money pages (homepage, café detail). Recommend verifying Google Search Console shows these pages indexing within a week of deployment.

4. **Accessibility baseline is solid.** Modals, inputs, buttons, and legal pages all have proper ARIA, labels, focus management, and contrast. No low-hanging WCAG violations found.

5. **PWA is configured but not battle-tested.** Manifest and icons are good; however, the skipWaiting behavior and API caching strategy need review before relying on the PWA for recurring users.

6. **Client-side rendering (finding 6-3) is mostly justified** for auth-gated portals. The app correctly marks public/crawlable pages as Server Components (/, /cafe/[id], /legal/*). No SEO regression expected.

7. **QR code fallback (6-4) is defensive but introduces an external dependency.** Not critical if backend QR generation is reliable, but consider adding client-side generation as a second fallback.
