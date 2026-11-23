# GTA 6 SEO and AI-search (GEO) pass: 2026-11-24

Branch `feat/seo-geo`, built from `deploy/prod159` (not from `main`, which was stale). Nothing here guarantees ranking or an AI recommendation. It makes KHEL-O crawlable, accurate and citable.

## 1. Audit findings

| Check | Result |
|---|---|
| OAI-SearchBot | **Allowed** and reachable. Live `robots.txt` has an explicit group; a request as `OAI-SearchBot/1.0` to `/gta6/hyderabad` returned HTTP 200 |
| GPTBot (training) | **Allowed**, same rules as before (unchanged policy). Implication: OpenAI may use public pages to train models. It does not affect ChatGPT Search; that is OAI-SearchBot. Now in its own rule group so it can be blocked without touching search |
| Bingbot | Allowed through `*` and now an explicit group |
| `/gta6` allow rule | Prefix match, covers `/gta6/...` (fine) |
| noindex | None found on GTA 6, guides or café pages. Intent/city pages set `index: true` |
| Release status | Pages already say "GTA 6 is out / came out 19 Nov 2026 on PS5 and Xbox Series X|S, not PC". Stale strings fixed (see below) |
| Contact details | Number already public on `/contact`; not in schema or GTA 6 pages. Added |
| Bing Webmaster | Meta tag wired (`NEXT_PUBLIC_BING_SITE_VERIFICATION`) but verification not confirmed. IndexNow key file and script exist |
| GA4 | Not installed. Measurement uses KHEL-O's own events (see measurement doc) |
| CDN/firewall | Not testable from here beyond the live 200. Re-check after deploy (section 5) |

## 2. Pages modified

- `src/components/gta6/Gta6SearchPage.tsx`: shared by `/gta6`, `/gta6/near-me`, `/gta6/<city>` (40) and the 11 intent pages. Added the café table, contact block and a `Service` schema node with the real contact details. Every GTA 6 page gets them.
- `src/constants/gta6Intents.ts`: FAQ answers added (rent a PS5, cheapest way, contact, find a café near me, partner cafés vs branches); "announced for" corrected to "out on".
- `src/app/gta6/Gta6Client.tsx`: stale "drops 19 Nov" share text and "launch date can change" footnote.
- `src/app/gta6/cities/page.tsx`: "releases" changed to "came out on".
- `src/app/layout.tsx`: Organization schema now has `telephone` and `contactPoint` (support hours as on the Contact page).
- `src/app/robots.ts`, `src/app/sitemap.ts`, `next.config.js`, `public/llms.txt`.

## 3. New pages and files

- `/guides` and 7 articles `/guides/<slug>` (content in `src/constants/guides.ts`).
- `src/constants/contact.ts` (single source for the number).
- Components `ContactBlock`, `CafeTable`.
- 301s: `/play-gta-6-in-hyderabad` to `/gta6/hyderabad`; `/play-gta-6-without-ps5` to `/gta6/without-ps5`. These are the URLs to use in ads, posts and directory listings; the real page keeps one canonical URL, so there is no duplicate-content page.

## 4. Keywords by page

| Page | Targets |
|---|---|
| `/gta6/hyderabad` | GTA 6 Hyderabad, play GTA 6 in Hyderabad, where to play GTA 6 in Hyderabad, GTA 6 gaming cafe Hyderabad, GTA 6 PS5 rental Hyderabad (as "PS5 by the hour") |
| `/gta6/near-me` | GTA 6 near me, GTA 6 gaming cafe near me, GTA 6 gaming zones near me, PS5 gaming cafe near me |
| `/gta6/without-ps5` | play GTA 6 without PS5, can I rent a PS5 to play GTA 6, cheapest way to play GTA 6, how to contact |
| `/gta6/india` | where to play GTA 6 in India, GTA 6 India |
| `/gta6/price`, `/gta6/gaming-cafe`, `/gta6/online`, `/gta6/free` | cost, which cafés have GTA 6, book online, "free" (earned play time only) |
| `/gta6/<city>` | Only cities in `GTA6_PLACES`; each shows real cafés or the honest "none yet" state |
| Guides 1 to 7 | the seven articles you listed, one per question |

Not done on purpose: "GTA 6 free download", "GTA 6 requirements", "GTA 6 gameplay", "GTA 6 release date" pages. They would compete with Rockstar and the press and the intent is not a café booking. The PC vs PS5 guide covers the PC and download questions honestly.

## 5. Technical SEO

- robots: GPTBot and OAI-SearchBot are separate groups; Bingbot explicit.
- Sitemap: `/guides` and 7 articles with `lastmod` = the date the facts were checked.
- Canonicals and `en-IN` alternates on every new page. Breadcrumb JSON-LD.
- Crawlable HTML: the café table, contact block and FAQ answers are plain HTML (the FAQ uses `<details>`, whose content is in the DOM).
- Not changed: Core Web Vitals work from prod77/90 stays as is. New components add no images and no script beyond one small client component.

## 6. Structured data

Organization (+ `telephone`, `contactPoint`), WebSite, WebPage, BreadcrumbList, `Service` (per GTA 6 page), ItemList of `EntertainmentBusiness` with a `ReserveAction`, FAQPage on GTA 6 pages (Google shows FAQ rich results only for a few sites now; keep it for Bing and AI readers, do not expect ranking from it), `Article` on guides. No `AggregateRating` or review markup: there are no verified reviews to mark up.

## 7. Issues and caveats found

- Local `main` is stale (no `gta6` directory). Do not branch from it. Use the latest `deploy/prodN` tag.
- `dateModified` on GTA 6 pages is "now" because the café list is live data; the visible "as of <date>" is the same day.
- FAQ content is duplicated between the visible FAQ and JSON-LD by design.
- A competing result named "pre-book" could not be verified earlier; no change.
- Café-level "has GTA 6" claims are only the cafés returned by the live GTA 6 listings. No café is advertised by hand.

## 8. Bing: what you must do (about 10 minutes)

1. Go to bing.com/webmasters, sign in.
2. **Import from Google Search Console** (this verifies the site and brings the sitemap). If that is not offered, add the site and choose the meta-tag option; give me the `content` value and set `NEXT_PUBLIC_BING_SITE_VERIFICATION` on prod.
3. Sitemaps: submit `https://khel-o.com/sitemap.xml`.
4. After deploy, run `python scripts/ops/indexnow.py` (IndexNow key is already live).
5. URL Inspection: inspect `/gta6/hyderabad`, `/gta6/near-me`, `/gta6/without-ps5`, `/guides`.
6. Watch Crawl information for errors and the **AI Performance** report for citations. Submitting a URL does not guarantee indexing.

## 9. Google Search Console

URL Inspection, then Request indexing, for `/guides`, the 7 guides, `/gta6/hyderabad`, `/gta6/near-me`. Then watch queries for "GTA 6" weekly.

## 10. Other manual steps

- Google Business Profile for KHEL-O (service-area business, Hyderabad), same name, number and website as the site. Do not list partner cafés as your own locations.
- Ask each partner café to add a link to its khel-o.com page and keep its own Google Business Profile accurate.
- Reviews: ask real players to review the café on Google after a booking. Do not buy or write reviews.
- Mentions (quality over quantity): r/hyderabad and r/IndianGaming (honest answers, not ads), Hyderabad gaming Discord/WhatsApp communities, local gaming creators on YouTube (link in the description), Hyderabad city blogs, directories (Justdial, Sulekha), and gaming-café owners' own sites. Pitch the guides, not the home page.
- Confirm the phone number below is the right public number.

## 11. Ideas that could raise visibility

Real photos and short videos on café pages, reviews on café pages, a per-café "what GTA 6 setup" detail (screen, controllers) once verified, Telugu and Hindi versions of the top two pages, weekly "free slots today" freshness, a short founder video embedded on the Hyderabad page.

## Open item for you

Official number used: **+91 81421 28389** (call and WhatsApp), hours Monday to Saturday 10:00 AM to 7:00 PM IST, email hello@khel-o.com. These were already on your `/contact` page. If you want a different public WhatsApp number, change `src/constants/contact.ts`, `layout.tsx` (Organization) and `public/llms.txt`, and the numbers in `gta6Intents.ts` / `guides.ts` text.
