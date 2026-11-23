# KHEL-O AI and search visibility: measurement (2026-11-24)

Keep the channels separate. Do not add them together.

| Channel | Where to read it | How it is identified |
|---|---|---|
| Google organic | Google Search Console, Performance | Search Console is the source of truth for impressions, clicks, position |
| Bing organic | Bing Webmaster Tools, Search Performance | Same, for Bing |
| Microsoft AI citations (Copilot, Bing AI) | Bing Webmaster Tools, **AI Performance** report | Cited pages and citation counts. Not mixed with ChatGPT numbers |
| ChatGPT referrals | KHEL-O admin Conversion report, AI bucket | Visits arriving with `utm_source=chatgpt.com` (ChatGPT adds this itself) or a `chatgpt.com` / `chat.openai.com` referrer |
| Other AI referrals | Same AI bucket | Referrer host: perplexity.ai, claude.ai, gemini.google.com, copilot.microsoft.com |
| Landing pages from AI | Same report, first page of the visit | `page_view` events carry `path`, `ref`, and `land: 1` on the first page |
| Call taps | `ui_action` events, action `gta6_contact_call` | metadata: `source` (page), `page` (city or `all`) |
| WhatsApp taps | `ui_action` events, action `gta6_contact_whatsapp` | same metadata |
| Booking enquiries and conversions | Existing Conversion report (bookings, sign-ups) | Attributed to first-touch source |

Notes
- Code that records this: `components/layout/PageViewTracker.tsx` (referrer host, utm), `backend/app/services/conversion_report.py` (AI_HOSTS bucket), `components/gta6/ContactBlock.tsx` (call / WhatsApp events).
- A call or WhatsApp tap is a tap on the button, not a completed call. A WhatsApp tap opens the chat; a conversation only counts when someone replies. Log real enquiries by hand for now.
- Referrers are often stripped by AI apps. Expect "direct" to hide some AI traffic. Compare direct traffic to GTA 6 pages week on week.
- There is no GA4 on this site. The admin reports above are the source of truth. If you want GA4 later, add it deliberately: it needs a cookie/consent decision first.

## Monthly report (copy this table)

| Month | Google impressions (GTA 6 queries) | Google clicks | Avg position | Bing clicks | Bing AI citations | ChatGPT visits | Other AI visits | Call taps | WhatsApp taps | Bookings from GTA 6 pages | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Dec 2026 | | | | | | | | | | | |
| Jan 2027 | | | | | | | | | | | |

Pull events with the read-only prod method in `reference_marketing_context` (scripts/ops/prod_sql.sh), for example:

```sql
select metadata->>'action' as action, metadata->>'source' as page, count(*)
from analytics_events
where event_type = 'ui_action' and metadata->>'action' in ('gta6_contact_call','gta6_contact_whatsapp')
  and created_at > now() - interval '30 days'
group by 1, 2 order by 3 desc;
```

(Check the table and column names against the schema before running; adjust if they differ.)
