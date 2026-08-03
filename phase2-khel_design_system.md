# KHEL-O Design System Specification

**Extracted from**: Live prototype (`play-to-pitch.lovable.app`) + Production codebase (`e:\KHEL-O`)  
**Date**: 2026-08-01  
**Method**: Visual browser audit of 16+ screens + static analysis of [tailwind.config.js](file:///e:/KHEL-O/frontend/tailwind.config.js), [globals.css](file:///e:/KHEL-O/frontend/src/app/globals.css), and [layout.tsx](file:///e:/KHEL-O/frontend/src/app/layout.tsx)

---

## SECTION 1: COLOR SYSTEM

### 1.1 Brand Colors

| Token | Hex | Tailwind Class | Semantic Meaning | Where Used |
|-------|-----|---------------|------------------|------------|
| `--primary` | `#10B981` | `bg-primary`, `text-primary` | Primary brand green — trust, gaming energy | CTA buttons, active nav underline, price accents, "Open now" badges, star ratings, success checkmarks, selected-state rings |
| `--primary-dark` | `#059669` | `bg-primary-dark` | Primary hover state — slightly darker green | Button hover states, pressed CTA feedback |
| `--secondary` | `#1F2937` | `bg-secondary`, `text-secondary` | Dark charcoal — authority, premium weight | Secondary buttons, login hero panel background, dark header bars (booking wizard, checkout), sticky action bar, "Book now" / "Pay" / "Continue" button fills |
| `--accent` | `#FC7C78` | `text-accent` | Warm coral/terracotta — identity mark | Logo "K" circle fill, user avatar circle fill, "Off-peak" badge, promo code chips, coupon percentage badges, "upcoming" status pills, notification dot |

### 1.2 Background Colors

| Token | Hex | Tailwind Class | Semantic Meaning | Where Used |
|-------|-----|---------------|------------------|------------|
| `--surface` | `#F3F4F6` | `bg-surface` | Page-level background — light warm gray | `<body>` background, OTP page background, search/filter chip backgrounds, skeleton placeholder blocks |
| `--card` | `#FFFFFF` | `bg-card` | Card and elevated surface background — pure white | All cards (café, booking, tier, profile, admin stat), modals, bottom sheets, input fields, nav bar background |
| Login hero bg | `#1F2937` → warm gradient | N/A (inline) | Immersive split-screen hero | Login page left panel — dark charcoal gradient transitioning to warm brown/amber at bottom edge |
| Promotional banner bg | `#1F2937` → `#3B2F1F` | N/A (inline) | Hero promo gradient | "Get 30% off before 5 PM" banner — same charcoal-to-warm gradient as login |
| Rewards XP banner bg | `#1F2937` → `#3B2F1F` | N/A (inline) | Level progress hero | Rewards page top banner — matches the dark gradient language |
| Blue wash | ~`#E8F0FE` / `#DBEAFE` | N/A (page edge) | Ambient decoration | Subtle blue gradient wash visible on left/right page edges on desktop — purely decorative |

### 1.3 Text Colors

| Token | Hex | Tailwind Class | Semantic Meaning | Where Used |
|-------|-----|---------------|------------------|------------|
| `--text-primary` | `#111827` | `text-text-primary` | Primary content — near-black | Headings, café names, section titles, body copy, button labels (on light bg) |
| `--text-secondary` | `#4B5563` | `text-text-secondary` | Secondary content — medium gray | Subtitles, descriptions, location text, meta info, label text, helper text, "Hand-checked rigs, peripherals and ping" |
| `--text-technical` | `#10B981` | `text-text-technical` | Technical data accent — green | Price values (₹90/hr), booking reference codes, XP amounts (+100 XP), change percentages (+18% MoM) |
| White text | `#FFFFFF` | `text-white` | Inverted content | Text on dark backgrounds: button labels, login hero headline, banner text, promo badge text, nav bar on dark headers |
| White/70 | `rgba(255,255,255,0.7)` | `text-white/70` | Muted white | Subtitle text on dark backgrounds: "1,200+ verified gaming cafés…", reward banner subtext |

### 1.4 Border Colors

| Token | Hex | Tailwind Class | Where Used |
|-------|-----|---------------|------------|
| `--border` | `#E5E7EB` | `border-border` | Card borders, input borders, dividers, tab underlines, chip outlines, list item separators |
| Selected ring | `#FC7C78` (accent) / `#10B981` (primary) | `ring-accent`, `border-primary` | Selected tier card border (coral/orange ring), selected date circle, active time slot, selected payment method |

### 1.5 Status Colors

| Token | Hex | Tailwind Class | Meaning | Where Used |
|-------|-----|---------------|---------|------------|
| `--success` | `#10B981` | `text-success`, `bg-success` | Positive outcome | "Open now" pill (green text on transparent green bg), payment success checkmark, booking confirmed icon, "Approve" button |
| `--warning` | `#F59E0B` | `text-warning`, `bg-warning` | Attention required | Star rating fill color, "pending" status (amber), verification pending badge |
| `--error` | `#EF4444` | `text-error`, `bg-error` | Negative / destructive | "Reject" text, "Cancel booking" text/link, "Closed" badge, error messages, "3 pending" admin counter |
| Info | `#3B82F6` (est.) | — | Informational | Blue wash ambient edges, demo mode hint text |

### 1.6 Interactive State Colors

| State | Treatment | Duration | Where Used |
|-------|-----------|----------|------------|
| **Hover (buttons)** | `--primary` → `--primary-dark` | 150ms | All `.btn-primary` elements |
| **Hover (cards)** | Border tints to `primary/50` | 150ms | Café cards, quick action cards, tier cards |
| **Hover (outline btn)** | Background → `gray-50` | 150ms | `.btn-outline` elements |
| **Pressed (all buttons)** | `scale(0.95)` transform | 150ms | All interactive buttons — `active:scale-95` |
| **Pressed (cards)** | `scale(0.98)` transform | 150ms | Café cards, booking cards — `active:scale-[0.98]` |
| **Disabled** | `opacity: 0.5` | — | Submit buttons during loading — `disabled:opacity-50` |
| **Focus (inputs)** | Border color → `--primary` | instant | Text inputs, search bar — `focus:border-primary` |
| **Selected (chip/slot)** | Filled `--secondary` bg, white text | 150ms | Selected time slot, selected date pill, selected hardware tier (accent ring) |
| **Active nav item** | Underline bar `--primary`, bold text | — | Desktop nav: "Explore" with bottom border when active |

---

## SECTION 2: TYPOGRAPHY SYSTEM

### 2.1 Font Family Stack

| Role | Font Family | Fallback | CSS Variable | Google Fonts Config |
|------|------------|----------|--------------|-------------------|
| **Headings** | Space Grotesk | sans-serif | `--font-space-grotesk` | `Space_Grotesk`, latin, swap |
| **Body** | Plus Jakarta Sans | sans-serif | `--font-plus-jakarta` | `Plus_Jakarta_Sans`, latin, swap |
| **Data / Monospace** | JetBrains Mono | monospace | `--font-jetbrains-mono` | `JetBrains_Mono`, latin, swap |

### 2.2 Type Scale

| Style Name | Font Family | Weight | Size (est.) | Line Height (est.) | Letter Spacing | Where Used |
|------------|------------|--------|-------------|---------------------|----------------|------------|
| **Display** | Space Grotesk | Bold (700) | 32–36px / 2rem | 1.1 | -0.02em | Login hero headline "Every good rig in your city, one tap away." |
| **H1 — Page Title** | Space Grotesk | Bold (700) | 24–28px / 1.5rem | 1.2 | normal | "Hey Arjun, where are we playing?", "My bookings", "Rewards", "Profile", "Booking confirmed" |
| **H2 — Section Title** | Space Grotesk | Semibold (600) | 20–22px / 1.25rem | 1.3 | normal | "Featured cafés", "Nearby cafés", "Trending offers", "Recommended for you", "Hardware tiers", "Achievements", "Your coupons" |
| **H3 — Card Title** | Space Grotesk | Semibold (600) | 16–18px / 1rem | 1.3 | normal | Café names in cards ("Nexus Arena", "Respawn Lounge"), tier names ("Standard", "Premium"), admin app names ("Zone 51 Gaming") |
| **H4 — Subsection** | Space Grotesk | Semibold (600) | 14–15px / 0.875rem | 1.3 | normal | "Select date", "Select slot", "Hardware tier", "Duration", "Seats", "Payment method", "Coupons" |
| **Body — Default** | Plus Jakarta Sans | Regular (400) | 14px / 0.875rem | 1.5 | normal | Descriptions, paragraph text, help text, "Cafés are empty in the afternoon…", FAQ questions |
| **Body — Emphasis** | Plus Jakarta Sans | Medium (500) | 14px | 1.5 | normal | Nav items ("Explore", "Bookings"), button labels, list item primary text |
| **Caption** | Plus Jakarta Sans | Regular (400) | 12–13px / 0.75rem | 1.4 | normal | Location text "Indiranagar, Bengaluru · 1.2 km", "157 reviews", date/time meta, "+1,510 this month" |
| **Overline / Label** | Plus Jakarta Sans | Semibold (600) | 10–11px / 0.625rem | 1.2 | 0.05–0.1em (uppercase) | "OTHER PORTALS", tab labels, "Phone number" input label, status "upcoming" pill text |
| **Price — Large** | JetBrains Mono | Bold (700) | 28–32px / 1.75rem | 1.1 | normal | KPI stat values ("9,412", "₹1.16 Cr", "1,360 XP"), tier price large display ("₹90") |
| **Price — Inline** | JetBrains Mono | Semibold (600) | 13–14px / 0.8rem | 1.3 | normal | "from ₹90/hr" on café cards, "₹401 · Premium" in bookings, line item amounts |
| **Reference Code** | JetBrains Mono | Regular (400) | 11–12px / 0.7rem | 1.2 | 0.05em | Booking reference "KHL-6059" (coral badge), "GC-2026-XXXXXX", staff codes "STAFF-2291" |
| **Hardware Spec** | Plus Jakarta Sans | Regular (400) | 12–13px / 0.75rem | 1.4 | normal | "RTX 3050 · 16GB RAM · 144Hz", "22 seats", "144Hz display" — rendered in secondary text color, sometimes with leading icon |
| **Badge / Pill** | Plus Jakarta Sans | Semibold (600) | 10–12px / 0.625rem | 1 | normal | "Open now", "Closed", "Buy 2 hrs get 1 free", "PC Gaming", "upcoming", "Level 3", "+100 XP", coupon code chips |
| **Button Label** | Plus Jakarta Sans | Medium (500) | 14–15px / 0.875rem | 1 | normal | "Continue →", "Book now", "Pay ₹401", "Become a partner", "View booking" |

> [!NOTE]
> The three-font system creates a clear typographic hierarchy: **Space Grotesk** for navigation and structure, **Plus Jakarta Sans** for readability and content flow, **JetBrains Mono** for anything numerical, financial, or machine-generated. This is the most distinctive typographic choice in the system.

---

## SECTION 3: SPACING & LAYOUT SYSTEM

### 3.1 Base Unit

**Base unit: 4px** — all spacing derives from multiples of 4.

### 3.2 Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `space-0.5` | 2px | Micro gaps (between icon and text in tight pills) |
| `space-1` | 4px | Intra-element gaps (badge padding vertical), gap between star icon and rating number |
| `space-1.5` | 6px | Small element spacing (chip pill horizontal padding) |
| `space-2` | 8px | Inner card element gaps, gap between tag pills, icon-to-text gap |
| `space-3` | 12px | Card content section gaps, inter-row spacing in lists |
| `space-4` | 16px | Standard card padding (`p-4`), page horizontal padding (mobile), grid gaps |
| `space-5` | 20px | KPI card padding, generous inner spacing |
| `space-6` | 24px | Section-to-section vertical gap, between major content blocks |
| `space-8` | 32px | Page section margins, major vertical breathing room |

### 3.3 Page Layout

| Property | Mobile (≤ 640px) | Tablet (641–1024px) | Desktop (> 1024px) |
|----------|-----------------|--------------------|--------------------|
| **Page horizontal padding** | 16px (`px-4`) | 24px (est.) | Auto-centered |
| **Max content width** | 100% fluid | 100% fluid | ~900px (est. prototype constrains to ~880–920px centered column) |
| **Content centering** | Full bleed | Full bleed | `max-w-3xl mx-auto` (est.) — content sits in a centered column with blue wash edges |
| **Bottom nav clearance** | 96px (`pb-24`) | 96px | Not applicable (desktop uses top nav) |

### 3.4 Common Component Spacing

| Component | Padding | Gap |
|-----------|---------|-----|
| **Card (`.card-base`)** | 16px all sides (`p-4`) | — |
| **KPI stat card** | 20px (`p-5`) | — |
| **Button** | 12px vertical, 24px horizontal (`min-h-[48px] px-6`) | — |
| **Input field** | 12px vertical, 16px horizontal (`py-3 px-4`) | — |
| **Café card image** | 0 (flush to card edge) | — |
| **Grid (featured cafés)** | — | 16px gap (mobile), 20px (desktop) |
| **Grid (nearby cafés)** | — | 16–20px gap, 3-col on desktop |
| **Horizontal scroll carousel** | — | 12–16px gap between items |
| **Bottom sheet modal content** | 24px (`p-6`) | 16px between sections |
| **Booking wizard sections** | 24px horizontal | 24px between sections |

### 3.5 Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `rounded` | 4px | Small subtle rounds (rare) |
| `rounded-lg` | 8px | Chip outlines, small badges, tab bar |
| `rounded-xl` | 12px | Café card images, photo containers, input fields, OTP boxes |
| `rounded-2xl` | 16px | Cards, buttons, modals, content cards — **the dominant radius in the system** |
| `rounded-3xl` | 24px | Bottom sheets, modals (outer), profile avatar (sometimes) |
| `rounded-full` | 50% / 9999px | User avatar circles, badge pills, date picker circles, notification dots, logo "K" |

### 3.6 Elevation / Shadow

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-md` | `0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)` | Standard cards, booking cards, action cards |
| `shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04)` | Modals, elevated overlays, bottom sheets |
| `shadow-xl` | Default Tailwind | Payment modal, Razorpay popup overlay |
| No shadow | — | Nav bars use `border-b` instead of shadow |

---

## SECTION 4: COMPONENT INVENTORY

### 4.1 Navigation

#### TopNavBar (Desktop)
- **Visual**: White background, full width, 56px height, bottom border `border-border`
- **Left**: Logo mark ("K" in coral `#FC7C78` circle, 32px diameter) + "KHEL" text (Space Grotesk bold, 18px, text-primary)
- **Right**: Nav links ("Explore", "Bookings", "Rewards", "Profile") — Plus Jakarta Medium 14px, text-secondary, active item has bottom border `border-primary` 2px
- **Right icons**: Bell icon (16px, relative notification dot in coral), User avatar (32px circle, coral bg, white initial letter)
- **Variants**: Standard (gamer), Admin header (adds "Admin console" label + "Customer app" link + "3 pending" coral badge)
- **Sticky**: Yes, `sticky top-0 z-50`
- **Where**: All customer pages, admin pages (with admin variant)

#### BottomNavBar (Mobile)
- **Visual**: White bg, border-top, 56–64px height, safe area padding
- **Items**: 4 icons + labels — Explore, Bookings, Rewards, Profile
- **Active state**: Icon and label in `--primary`, inactive in `--text-secondary`
- **Hidden on**: Booking wizard, checkout, confirmed screens
- **Where**: Customer route group on mobile viewports

#### StickyActionBar
- **Visual**: White bg, top border, `fixed bottom-0`, full-width padded container
- **Content**: Left side shows summary text + price; Right side shows full-width CTA button (`--secondary` bg)
- **Where**: Café detail ("Starting from ₹90/hr" + "Book now"), Booking wizard (session summary + "Continue"), Checkout ("Total payable ₹401" + "Pay ₹401")

---

### 4.2 Cards

#### CaféCard
- **Photo**: 16:9 aspect ratio, `rounded-xl` top corners, full card width
- **Badges on photo**: Floating top-right corner — "Open now" (green text, green/10 bg, rounded-full), "Closed" (red text, red/10 bg), "Buy 2 hrs get 1 free" (accent coral text, coral/10 bg)
- **Body**: `p-4` padding below photo
- **Title row**: Café name (H3 style, left) + star icon + rating (JetBrains Mono, 14px, right)
- **Location**: Pin icon (primary green) + "Indiranagar, Bengaluru · 1.2 km" (caption, text-secondary)
- **Tag pills**: "PC Gaming", "Offers", "PS5" — outlined pills, `rounded-lg`, text-secondary, border-border
- **Price**: "from ₹90/hr" — lightning bolt icon (primary green) + JetBrains Mono semibold
- **Card shell**: `bg-card rounded-2xl border border-border shadow-md`
- **Interaction**: `cursor-pointer`, `active:scale-[0.98]`, hover: border tints to `primary/50`
- **Variants**: Featured (horizontal scroll row, fixed width ~280px), Nearby (responsive grid, full width), Recommended (grid)

#### BookingCard
- **Layout**: Horizontal — thumbnail (64px square, `rounded-xl`) + info + status pill
- **Info stack**: Café name (H3), "Sat, 1 Aug · 6:00 PM · 2 hr" (caption), "₹401 · Premium" (monospace caption)
- **Status pill**: Top-right, "upcoming" in coral text on coral/10 bg, `rounded-full`, 10px semibold
- **Shell**: `bg-card rounded-2xl border border-border shadow-md p-4`
- **Interaction**: Tap opens bottom sheet detail modal

#### TierCard (Café Detail)
- **Layout**: Vertical column, 3-up horizontal grid
- **Header**: Tier name (H3, e.g., "Standard") + monitor icon (right)
- **Specs**: GPU icon + "RTX 3050" | "16GB RAM" | "144Hz display" | "22 seats" — caption style, stacked vertically
- **Price**: "₹90/hr" — price number in JetBrains Mono bold 24px, "/hr" in regular 14px text-secondary
- **Shell**: `bg-card rounded-2xl border border-border p-5`
- **Selected state**: Border becomes `border-accent` (#FC7C78) with orange/coral ring, slight bg tint `accent/5`

#### TierRadioCard (Booking Wizard)
- **Layout**: Horizontal row — radio dot + info + price
- **Radio dot**: 16px circle, coral filled when selected, gray border when not
- **Info**: Tier name (semibold 14px), "RTX 3050 · 16GB RAM · 144Hz" (caption monospace-feel)
- **Price**: "₹90/hr" right-aligned, JetBrains Mono semibold
- **Selected state**: `border-accent`, `bg-accent/5`, filled coral radio

#### PromoCard (Trending Offers)
- **Layout**: Horizontal — percentage circle (40px, coral bg/10, coral text, "50%") + info + code chip
- **Info**: "Flat 50% off first booking" (body semibold), "Max ₹150 off" (caption)
- **Code chip**: "KHEL50" — coral text, coral/10 bg, `rounded-lg`, 11px monospace
- **Shell**: `bg-card rounded-2xl border border-border p-4`

#### StatCard (Admin / Owner Dashboard)
- **Layout**: Label top-left (caption), icon top-right (24px muted), large number bottom-left (JetBrains Mono bold 32px), change text bottom (green "+18% MoM")
- **Shell**: `bg-card rounded-2xl border border-border p-5 shadow-md`
- **Variants**: With trend (+), with absolute count (+42 this month)

#### AchievementCard (Rewards)
- **Layout**: Horizontal — icon circle (40px, coral bg for unlocked, gray for locked) + title + XP badge
- **Unlocked**: Icon has color, XP badge is green bg + white text ("+ 100 XP")
- **Locked**: Lock icon, XP badge is gray bg + gray text
- **Shell**: `rounded-2xl border border-border p-4`

---

### 4.3 Buttons

| Variant | Background | Text | Border | Min Height | Radius | Hover | Press |
|---------|-----------|------|--------|------------|--------|-------|-------|
| **Primary** | `--primary` (#10B981) | white | none | 48px | 16px (2xl) | `--primary-dark` | `scale(0.95)` |
| **Secondary / Dark** | `--secondary` (#1F2937) | white | none | 48px | 16px (2xl) | gray-800 | `scale(0.95)` |
| **Outline** | `--card` (white) | `--secondary` | `border-border` | 48px | 16px (2xl) | gray-50 bg | `scale(0.95)` |
| **Ghost / Link** | transparent | `--primary` or `--text-secondary` | none | auto | — | underline or opacity | — |
| **Destructive ghost** | transparent | `--error` | none | auto | — | opacity | — |
| **Small pill** | varies | varies | `border-border` or none | 32px | full | bg lighten | `scale(0.95)` |
| **Icon button** | transparent or surface | icon color | optional border | 40–44px | full | bg change | — |

**Common traits**: All buttons use `transition-all duration-150`, `inline-flex items-center justify-center`, `font-medium`.

---

### 4.4 Form Elements

#### TextInput
- **Height**: 48px (`py-3 px-4`)
- **Background**: `--surface` (#F3F4F6) or `--card` (white)
- **Border**: `border-border`, 1px
- **Radius**: 16px (`rounded-2xl`) — some variants use 12px
- **Focus**: Border → `--primary`
- **Font**: Plus Jakarta, 14px
- **Placeholder**: text-secondary, 14px

#### PhoneInput (Prototype-only)
- **Layout**: "+91" prefix badge (rounded-lg, surface bg) + number input
- **Where**: Login page

#### OTPInput
- **Layout**: 4 individual square boxes, ~52px × 52px each, 12px gap
- **Border**: `border-border`, 1px
- **Radius**: 12px
- **Font**: JetBrains Mono, centered, 20px bold
- **Focus**: Border → `--primary`
- **Where**: OTP verification page

#### IncrementStepper (Duration / Seats)
- **Layout**: Label top, value left (large mono), "−" and "+" circle buttons right
- **Buttons**: 36px circle, surface bg, border-border, semibold "−" / "+"
- **Shell**: `rounded-2xl border border-border p-4`, horizontal layout
- **Where**: Booking wizard — Duration and Seats

#### FilterChip
- **Idle**: `border-border`, bg-transparent, text-secondary, `rounded-lg`, 36px height, 12–16px padding
- **Active**: `bg-secondary`, text-white (filled), or `bg-primary`, text-white
- **Where**: Category chips ("PC Gaming", "PS5", "Premium PCs", "Offers", "Open Now")

#### SegmentedTabBar
- **Layout**: Full-width horizontal row of equal-width segments
- **Style**: `bg-surface` container, `rounded-lg`, inner tabs are text-only
- **Active tab**: Bold text, `border-b-2 border-primary` underline, or filled bg segment
- **Variants**: Underline style (bookings: "Upcoming | Completed | Cancelled"), Pill style (admin: "Applications | Platform analytics | Support | System health")
- **Where**: Bookings list tabs, admin panel tabs, café detail tabs ("Amenities | Games | Reviews")

#### CouponInput
- **Layout**: Text input + "Apply" button inline
- **Below**: Quick-apply chip row with promo codes (coral text, coral/10 bg, rounded-lg)
- **Where**: Checkout page

---

### 4.5 Overlays

#### BottomSheet
- **Trigger**: Tap booking card on bookings page
- **Appearance**: Slides up from bottom of viewport
- **Structure**: Drag handle bar (40px wide, 4px tall, gray, rounded-full, centered top), followed by content
- **Backdrop**: `bg-black/50 backdrop-blur-sm`
- **Content**: White bg, `rounded-t-3xl`, `p-6`
- **Close**: Drag down or tap backdrop
- **Where**: Booking detail modal, tier edit (owner)

#### Modal (Payment Success)
- **Trigger**: Simulated Razorpay callback
- **Appearance**: Centered on screen over backdrop
- **Structure**: White bg, `rounded-2xl`, shadow-xl, centered content (checkmark → title → subtext → CTA)
- **Backdrop**: `bg-black/50 backdrop-blur-sm` (dimmed checkout behind)
- **Content**: Green checkmark icon (48px), "Payment successful" (H3), "₹401 paid via UPI" (caption), "View booking" dark button, "Simulated gateway" disclaimer
- **Where**: Post-payment success

#### Toast / Inline Banner
- **Style**: Coral/red bg/10, border-error/20, `rounded-2xl`, `p-3`, text-error 12px
- **Where**: Login error messages, booking form validation errors

---

### 4.6 Data Display

#### RatingDisplay
- **Layout**: Star icon (filled, warning amber `#F59E0B`) + number (JetBrains Mono semibold, 14px)
- **Where**: Café cards, café detail page
- **Variant**: With review count — "4.6" large + "157 reviews" caption below

#### StatusPill / Badge
- **Layout**: Inline pill, `rounded-full`, 8–10px padding horizontal, 2–4px vertical
- **Font**: 10–12px, semibold, uppercase or sentence case
- **Variants**:
  - "Open now" — green text, green/10 bg
  - "Closed" — red text, red/10 bg
  - "upcoming" — coral text, coral/10 bg
  - "Buy 2 hrs get 1 free" — coral text, coral/10 bg, `rounded-lg`
  - "Level 3" — coral text, coral/10 bg
  - "3 pending" — coral text, coral/10 bg (admin header)
  - "Off-peak" — coral text, coral/10 bg (hero banner)
  - "Premium" — coral text (checkout summary pills)

#### TagPill
- **Layout**: Inline, `rounded-lg`, `border border-border`, `px-2 py-0.5`
- **Font**: 11–12px, text-secondary
- **Where**: "PC Gaming", "PS5", "Offers", "Premium PCs" on café cards

#### PriceDisplay
- **Inline**: Lightning bolt icon (primary green) + "from ₹90/hr" (JetBrains Mono semibold 13px)
- **Large (tier)**: "₹90" (JetBrains Mono bold 24px) + "/hr" (regular 14px text-secondary)
- **Summary line**: "Premium × 2 hr × 1" left, "₹324" right (JetBrains Mono)
- **Total**: "Total payable" left (Plus Jakarta semibold), "₹401" right (JetBrains Mono bold 18px)

#### XPBadge
- **Layout**: `rounded-full`, 8px horizontal padding
- **Unlocked**: green bg, white text, "+100 XP"
- **Locked**: gray bg, gray text
- **Where**: Rewards achievements grid

#### ProgressBar
- **Track**: Gray bar, `rounded-full`, 8px height
- **Fill**: Green gradient or green solid, animated width
- **Where**: Rewards XP progress toward next level

---

### 4.7 Feedback

#### Skeleton
- **Style**: `bg-surface/50` or `bg-white/20` (on dark), `animate-pulse`, matching element shape and size
- **Radius**: Matches target element
- **Where**: Dashboard loading, café cards, booking cards, profile

#### EmptyState
- **Layout**: Centered column — large icon (48px, text-secondary/30) + title (H3) + description (body) + optional CTA button
- **Where**: "No upcoming sessions" (bookings), "No bookings yet" (owner dashboard), "No cafés registered yet" (admin)

#### ErrorState
- **Layout**: Centered column — AlertTriangle icon (error color, 48px) + title + error message + "Try Again" outline button
- **Where**: Failed data fetches on booking list, dashboard, admin

#### SuccessState
- **Layout**: Green checkmark circle (48px, `--success` color) + "Booking confirmed" heading + subtitle + QR pass + action buttons
- **Where**: Post-payment confirmation page

---

### 4.8 Specialty Components

#### QRPassCard
- **Layout**: Centered column — QR code image (~200px square, white padded card bg) + booking reference pill below
- **Reference pill**: Coral text, coral/10 bg, JetBrains Mono 12px, `rounded-full`
- **Below**: 2-column grid with label (caption) + value (body semibold) pairs: Café, City, Date, Time, Tier, Total paid
- **Divider**: Dashed border (gives "ticket tear" illusion)
- **Where**: Booking confirmed page, booking detail bottom sheet

#### PhotoCarousel
- **Layout**: Full-width image (16:9 or cover), white pagination dots centered bottom
- **Controls**: Overlaid back (←) and share (share icon) buttons at top corners, 40px circles, white bg, shadow
- **Where**: Café detail page hero

#### DatePicker (Horizontal Strip)
- **Layout**: 7-day horizontal row of circles
- **Each day**: Day name abbreviation top (caption, text-secondary), Date number below (body bold)
- **Selected**: Filled `--secondary` bg, white text, `rounded-full`
- **Unselected**: White bg, border-border, `rounded-full`
- **Where**: Booking wizard "Select date"

#### TimeSlotGrid
- **Layout**: 4-column grid of pill buttons
- **Each slot**: "10:00 AM" — 14px, `rounded-xl`, `border border-border`, 44px height
- **Selected**: `bg-secondary`, text-white
- **Disabled (past)**: `opacity-50`, no interaction
- **Where**: Booking wizard "Select slot"

#### PaymentMethodSelector
- **Layout**: Stacked radio-style cards
- **Each row**: Icon (24px) + method name + subtitle
- **Selected**: `border-accent`, `bg-accent/5` (coral ring)
- **Where**: Checkout page "Payment method"

#### ApplicationRow (Admin)
- **Layout**: Horizontal — Café name (H3) + owner details (caption: "Harshit Jain · Jaipur · 24 seats · 2 days ago") + action buttons right
- **Actions**: "✗ Reject" (ghost destructive) + "✓ Approve" (dark filled pill, `rounded-full`)
- **Where**: Admin panel "Applications" tab

#### CheckInRow (Staff)
- **Layout**: Horizontal — Seat number circle (gray, 40px) + gamer name + booking ref (monospace caption) + "Scan" dark pill button
- **Where**: Staff front desk dashboard

---

## SECTION 5: ANIMATION & MOTION SYSTEM

### 5.1 Documented Animations

| # | Trigger | Element | Type | Duration | Easing | Feel | Purpose |
|---|---------|---------|------|----------|--------|------|---------|
| 1 | **Button press** | All buttons | Scale down to 0.95 | 150ms | `ease-out` (CSS transition-all) | Snappy | Tactile feedback |
| 2 | **Card press** | Café/booking cards | Scale down to 0.98 | 150ms (est.) | `ease-out` | Snappy | Tactile feedback |
| 3 | **Page load** | Skeleton placeholders | Pulse opacity 50%→100% | ~2000ms loop | `ease-in-out` | Smooth breathing | Loading indication |
| 4 | **Button hover** | CTA buttons | Background color transition | 150ms | `ease` | Smooth | Interactive affordance |
| 5 | **Focus** | Input fields | Border color transition | instant / ~100ms | linear | Snappy | Focus indication |
| 6 | **Bottom sheet open** | Booking detail sheet | Slide up from viewport bottom | ~300ms (est.) | `ease-out` / spring-like | Smooth, slightly bouncy | Reveal content |
| 7 | **Bottom sheet close** | Booking detail sheet | Slide down to viewport bottom | ~200ms (est.) | `ease-in` | Snappy | Dismiss |
| 8 | **Modal appear** | Payment success modal | Fade in + scale from 0.95 to 1 | ~250ms (est.) | `ease-out` | Smooth | Celebration reveal |
| 9 | **Backdrop appear** | Modal/sheet overlay | Fade opacity 0→0.5 | ~200ms | `ease` | Smooth | Dim background |
| 10 | **Tab switch** | Tab content | No visible transition (instant swap) | 0ms | — | Instant | Content switch |
| 11 | **Page navigation** | Entire page | No crossfade — hard navigation (Next.js default) | ~100ms | — | Instant | Route change |
| 12 | **Horizontal scroll** | Café carousel (featured) | Native scroll snap or smooth scroll | Physics-based | — | Natural | Content browsing |

### 5.2 Motion Principles

- **150ms for micro-interactions**: The system consistently uses `duration-150` for button presses, hover states, and card interactions. This creates a snappy, responsive feel.
- **No page transitions**: Route changes are hard cuts. No crossfade or slide between pages.
- **Minimal decoration**: No entry animations on content blocks, no parallax, no scroll-triggered effects. The motion system is purely **functional** — providing feedback, not entertainment.
- **Native physics for scroll**: Horizontal carousels use native browser scroll behavior, not custom spring animations.
- **Pulse for loading**: The only "ambient" animation is `animate-pulse` on skeletons. It's soft and non-distracting.

---

## SECTION 6: RESPONSIVE BEHAVIOUR

### 6.1 Strategy

**Mobile-first fluid layout** with a single effective breakpoint at ~1024px (where bottom nav becomes top nav). Content is constrained to a max-width on desktop (~900px centered column). The prototype does NOT show a tablet-specific layout — it scales linearly from mobile to desktop.

### 6.2 Screen-by-Screen Adaptations

| Screen | Mobile (375px) | Desktop (1280px) |
|--------|---------------|-------------------|
| **Login** | Full-screen form, hero hidden | Split screen: hero image left 50%, form right 50% |
| **Home** | Search bar full-width, filter chips scroll horizontally, café cards stack vertically, featured cards in horizontal carousel | Search bar in centered column, filter chips in row, featured cafés as 4-across scrolling grid, nearby cafés as 3-column responsive grid |
| **Café Detail** | Photo full-width, content stacks vertically, tiers stack, sticky action bar | Photo as wide banner, content centered column, tiers in 3-column grid, sticky bar same |
| **Booking Wizard** | Full-width sections, date strip scrolls, time grid 4-col, tiers stack | Centered column, date strip inline, same grid structure |
| **Checkout** | Stacked sections (summary, coupons, payment, totals) | Same stacked but in centered column |
| **Bookings List** | Cards stack vertically | Cards in 2-column grid |
| **Booking Confirmed** | Full-width QR pass, stacked info | Centered narrower column, same layout |
| **Rewards** | XP banner full-width, achievements 1-col, coupons 1-col | Achievements 2-column grid, coupons 2-column grid |
| **Profile** | Stacked list items | Centered column, same structure |
| **Staff Dashboard** | Stacked check-in rows | Centered column |
| **Admin Dashboard** | Stat cards in 2x2 grid, app rows stack | 4 stat cards in a row, app rows as horizontal cards |

### 6.3 Navigation Adaptation

| Viewport | Navigation Form |
|----------|----------------|
| ≤ 768px (est.) | Bottom tab bar (4 items: Explore, Bookings, Rewards, Profile) |
| > 768px | Top navigation bar with horizontal text links + avatar + notification bell |

### 6.4 Content Width Strategy

On desktop, ALL content sits within a **centered column of ~880–920px** max width. The page outside this column shows a subtle blue-tinted wash. No sidebar exists for gamer views. Owner dashboard in production codebase adds a left sidebar at `md+` breakpoint.

---

## SECTION 7: DESIGN PRINCIPLES

### 7.1 Emotional Tone

The interface evokes **confident accessibility** — it feels like a premium utility that respects the user's time. It's not "loud gamer" or "neon eSports"; it's more like a polished booking app (Airbnb-like) that happens to be for gaming. The emotion is: *I trust this platform with my money and my Saturday evening.*

### 7.2 What Makes It Premium

1. **Three-font typographic system**: Heading (Space Grotesk) / Body (Plus Jakarta Sans) / Data (JetBrains Mono) creates information hierarchy that reads instantly. The monospace font for financial and machine-generated data is a deliberate choice that signals precision.

2. **Restraint in color**: Only two true brand colors (green + coral) on a neutral white/gray canvas. The coral accent is used sparingly enough to always feel special — logo marks, status indicators, promo codes. No gradients on cards. No flashy backgrounds.

3. **Consistent roundedness**: Nearly everything uses `rounded-2xl` (16px). This creates a soft, modern, approachable feeling without the "toy-like" quality of fully rounded shapes. The uniformity makes the interface feel intentional.

### 7.3 Three Most Distinctive Visual Choices

1. **The coral accent (#FC7C78)**: This warm terracotta/salmon is unusual for a tech/gaming product. It's not red, not orange — it sits in a unique warmth zone that pairs beautifully with the emerald green. It carries the brand's personality without being loud.

2. **JetBrains Mono for all financial data**: Every price, booking reference, XP count, and machine ID uses monospace. This creates an immediate visual cue: "this is a number I should pay attention to." It's a subtle but powerful pattern.

3. **The dark gradient hero panels**: The login hero, promo banner, and rewards XP header all share the same `#1F2937 → warm brown` gradient. This creates a "night gaming session" atmosphere that grounds the product's identity without being overwhelming. It's used in exactly 3 places across the whole app — restraint is the point.

### 7.4 What You Would Never Do in This Design Language

- **Use neon/fluorescent colors** — no bright purple, electric blue, or lime green. This isn't a Twitch skin.
- **Add card shadows heavier than `shadow-md`** — the system uses very subtle elevation. Heavy drop shadows would break the flat-modern aesthetic.
- **Use animations longer than 300ms** — everything is snappy and functional. No bouncing, wobbling, or spring physics on UI elements. No Lottie animations.
- **Mix border radii on the same surface** — if a card is `rounded-2xl`, don't put `rounded-sm` elements inside it. The consistency of the 16px radius IS the visual identity.
- **Use more than 2 weights of any font** — Space Grotesk uses bold and semibold. Plus Jakarta uses regular, medium, and semibold. No light weights, no ultrabold. The type system stays in a medium-weight range for clarity.

### 7.5 Information Density vs. Breathing Room

The design strikes a deliberate balance:

- **High density where it serves comparison**: Café cards pack 6 data points (photo, name, rating, location, tags, price) into a compact card. Time slot grids show 11+ options in a tight grid. This enables quick scanning.

- **Generous spacing between sections**: 24px gaps between major content sections (Featured cafés → Nearby cafés → Trending offers). Section headings have dedicated whitespace above and below.

- **Cards create visual containment**: Rather than floating content in open space, every group of information lives inside a bordered card. This creates cognitive chunking — each card is one "thought unit" that can be processed independently.

- **The page background color acts as spacing**: The light gray `#F3F4F6` between white cards provides implicit whitespace without needing explicit margins. The color difference creates perceptual separation.

---

## APPENDIX: DESIGN TOKEN QUICK REFERENCE

```css
:root {
  /* Brand */
  --primary: #10B981;
  --primary-dark: #059669;
  --secondary: #1F2937;
  --accent: #FC7C78;

  /* Backgrounds */
  --surface: #F3F4F6;
  --card: #FFFFFF;

  /* Text */
  --text-primary: #111827;
  --text-secondary: #4B5563;
  --text-technical: #10B981;

  /* Border */
  --border: #E5E7EB;

  /* Status */
  --success: #10B981;
  --warning: #F59E0B;
  --error: #EF4444;

  /* Typography */
  --font-heading: 'Space Grotesk', sans-serif;
  --font-body: 'Plus Jakarta Sans', sans-serif;
  --font-data: 'JetBrains Mono', monospace;

  /* Radii */
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-3xl: 24px;

  /* Shadows */
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 200ms ease;

  /* Layout */
  --content-max-width: 920px;
  --page-padding-mobile: 16px;
  --page-padding-desktop: auto; /* centered */
  --button-min-height: 48px;
  --input-height: 48px;
  --nav-height: 56px;
}
```
