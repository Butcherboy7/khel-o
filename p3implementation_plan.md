# KHEL-O Frontend Architecture & Implementation Plan

**Status**: AWAITING APPROVAL  
**Based on**: Codebase audit of [src/](file:///e:/KHEL-O/frontend/src), design system extraction from Lovable prototype, and backend API contract analysis  
**Target**: Complete frontend refactor — same Next.js 14 stack, restructured for quality and scalability

---

## SECTION 1: ARCHITECTURE DECISION

### 1.1 Organisation Strategy: Hybrid Feature + Layer

**Decision**: Feature-based organisation at the route/portal level, with a shared layer-based core.

**Justification**: The app has three distinct portals (customer, owner, admin) that share some UI primitives but have entirely different page structures, data queries, and navigation shells. A pure layer-based structure (flat `components/`, `hooks/`, `lib/`) would create a 50+ file component directory with no discoverability. A pure feature-based structure would duplicate shared utilities. The hybrid gives clear ownership boundaries without code duplication.

### 1.2 Proposed Directory Tree

```
src/
├── app/                              # Next.js App Router — routes only
│   ├── (auth)/                       # Unauthenticated route group
│   │   ├── layout.tsx                # Split-screen auth layout
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (customer)/                   # Gamer portal route group
│   │   ├── layout.tsx                # Customer shell (top bar + bottom nav)
│   │   ├── page.tsx                  # / — Explore
│   │   ├── cafes/[id]/page.tsx       # Café detail
│   │   ├── bookings/
│   │   │   ├── page.tsx              # Bookings list
│   │   │   ├── new/page.tsx          # Booking wizard (thin — delegates to feature components)
│   │   │   └── [id]/page.tsx         # Booking detail / pass
│   │   ├── rewards/page.tsx
│   │   └── profile/page.tsx
│   ├── (owner)/                      # Owner portal route group
│   │   ├── layout.tsx                # Owner shell (sidebar desktop, bottom nav mobile)
│   │   └── owner/
│   │       ├── dashboard/page.tsx
│   │       ├── cafe/page.tsx
│   │       ├── tiers/page.tsx
│   │       ├── bookings/page.tsx
│   │       ├── promotions/page.tsx
│   │       ├── staff/page.tsx
│   │       ├── onboarding/page.tsx
│   │       └── payouts/page.tsx
│   ├── (admin)/                      # Admin portal route group
│   │   ├── layout.tsx                # Admin shell (header bar)
│   │   └── admin/page.tsx
│   ├── globals.css                   # Design tokens + base styles
│   ├── layout.tsx                    # Root layout (fonts, metadata, providers)
│   └── providers.tsx                 # QueryClient + auth initialisation
│
├── components/
│   ├── ui/                           # Design system primitives (portal-agnostic)
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Badge.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   ├── BottomSheet.tsx
│   │   ├── Skeleton.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorState.tsx
│   │   ├── Spinner.tsx
│   │   ├── RatingDisplay.tsx
│   │   ├── PriceDisplay.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── TagPill.tsx
│   │   ├── FilterChip.tsx
│   │   ├── SegmentedTabs.tsx
│   │   ├── IncrementStepper.tsx
│   │   ├── ProgressBar.tsx
│   │   └── index.ts                  # Barrel export
│   │
│   ├── layout/                       # Structural layout components
│   │   ├── TopNavBar.tsx             # Customer desktop nav
│   │   ├── BottomNavBar.tsx          # Customer mobile nav
│   │   ├── OwnerSidebar.tsx          # Owner desktop sidebar
│   │   ├── OwnerMobileNav.tsx        # Owner mobile bottom nav
│   │   ├── AdminHeader.tsx           # Admin top bar
│   │   ├── StickyActionBar.tsx       # Bottom sticky CTA bar
│   │   ├── PageContainer.tsx         # Max-width centered content wrapper
│   │   └── AuthGuard.tsx             # Role-based route protection
│   │
│   ├── customer/                     # Customer-specific shared components
│   │   ├── CafeCard.tsx
│   │   ├── CafeCardSkeleton.tsx
│   │   ├── BookingCard.tsx
│   │   ├── BookingCardSkeleton.tsx
│   │   ├── TierCard.tsx
│   │   ├── PromoCard.tsx
│   │   ├── QRPassCard.tsx
│   │   ├── PhotoCarousel.tsx
│   │   ├── DateStrip.tsx
│   │   ├── TimeSlotGrid.tsx
│   │   ├── TierRadioGroup.tsx
│   │   ├── PaymentMethodSelector.tsx
│   │   ├── CouponInput.tsx
│   │   ├── AchievementCard.tsx
│   │   └── BookingSummaryBar.tsx
│   │
│   └── owner/                        # Owner-specific shared components
│       ├── StatCard.tsx
│       ├── TierForm.tsx
│       ├── PromotionForm.tsx
│       ├── StaffRow.tsx
│       ├── BookingRow.tsx
│       └── CafeForm.tsx
│
├── lib/                              # Pure utilities (no React, no side effects)
│   ├── api/                          # API layer — organised by domain
│   │   ├── client.ts                 # Axios instance + interceptors
│   │   ├── auth.ts                   # Auth endpoints
│   │   ├── cafes.ts                  # Café CRUD
│   │   ├── bookings.ts              # Booking CRUD
│   │   ├── payments.ts              # Razorpay order + verify
│   │   ├── promotions.ts            # Promotion CRUD
│   │   ├── owner.ts                 # Owner-specific endpoints
│   │   ├── admin.ts                 # Admin endpoints
│   │   ├── reviews.ts              # Review endpoints
│   │   └── index.ts                 # Re-export all
│   ├── format.ts                    # Date/time/currency formatting
│   ├── cn.ts                        # clsx + tailwind-merge utility
│   └── constants.ts                 # App-wide constants (cities, durations, roles)
│
├── hooks/                           # Custom React hooks
│   ├── useRazorpay.ts              # Razorpay script loader + checkout trigger
│   ├── useMediaQuery.ts            # Responsive breakpoint detection
│   ├── useDebounce.ts              # Input debouncing
│   └── queries/                     # TanStack Query hook wrappers
│       ├── useCafes.ts             # useListCafes, useCafeDetail
│       ├── useBookings.ts          # useGamerBookings, useBookingDetail
│       ├── useTiers.ts             # useCafeTiers
│       ├── usePromotions.ts        # usePromotions
│       ├── useOwner.ts             # useOwnerBookings, useOwnerStaff
│       └── useAdmin.ts            # usePendingCafes
│
├── store/                           # Zustand stores
│   └── authStore.ts                # Auth state (user, tokens, hydration)
│
└── types/                           # TypeScript type definitions
    ├── user.ts                     # User, UserRole
    ├── cafe.ts                     # Cafe, CafeDetail, CafeListItem
    ├── booking.ts                  # Booking, BookingDetail, CreateBookingRequest
    ├── payment.ts                  # PaymentOrder, RazorpayResponse
    ├── promotion.ts                # Promotion, PromotionDetail, PromotionFormData
    ├── tier.ts                     # HardwareTier, TierSpecs, TierFormData
    ├── review.ts                   # Review
    ├── owner.ts                    # OwnerPayoutAccount, AdminCafe
    └── index.ts                    # Barrel re-export
```

### 1.3 Key Decisions Justified

| Decision | Justification |
|----------|--------------|
| **`components/ui/` for primitives** | These are design-system-level atoms (Button, Input, Badge) that are used identically across all three portals. They accept design tokens and variant props — never business data. |
| **`components/customer/` and `components/owner/`** | Domain components that compose `ui/` primitives with business logic (CafeCard, StatCard). They live separate from route pages because they're reused across multiple pages within the same portal. |
| **`components/layout/`** | Structural shells (navbars, sidebars, guards) that are neither primitives nor domain components. They control page chrome and route protection. |
| **`lib/api/` split by domain** | The current 436-line monolithic [api.ts](file:///e:/KHEL-O/frontend/src/lib/api.ts) is unmaintainable. Splitting by domain (auth, cafes, bookings, payments) gives clear ownership and keeps each file under 80 lines. The Axios instance + interceptors remain in `client.ts`. |
| **`hooks/queries/` for TanStack wrappers** | Encapsulating query keys, stale times, and select transforms in named hooks prevents ad-hoc `useQuery` calls with inconsistent configurations scattered across pages. |
| **`types/` split by domain** | The current single [index.ts](file:///e:/KHEL-O/frontend/src/types/index.ts) at 191 lines works now but will not scale. Domain files mirror the API domain split for easy discovery. |
| **Route pages stay thin** | Every `page.tsx` should be a composition file that imports feature components and query hooks — never a 695-line monolith like the current [booking wizard](file:///e:/KHEL-O/frontend/src/app/(customer)/bookings/new/page.tsx). Target: no page file over 150 lines. |

---

## SECTION 2: DESIGN TOKEN SYSTEM

### 2.1 Architecture: CSS Custom Properties + Tailwind Extension

**Decision**: Two-layer token system.

1. **Layer 1 — CSS custom properties in [globals.css](file:///e:/KHEL-O/frontend/src/app/globals.css)**: Source of truth for all primitive values. This is what changes if the brand evolves.
2. **Layer 2 — [tailwind.config.js](file:///e:/KHEL-O/frontend/tailwind.config.js) `extend` referencing variables**: Makes tokens available as Tailwind utility classes (`bg-primary`, `text-text-secondary`, `font-heading`).

**Why not a TypeScript constants file?** Because tokens must be consumable in CSS (for `@layer base` rules, pseudo-elements, and third-party overrides). CSS variables solve this natively. TypeScript constants add a translation layer with no benefit — you'd still need to pass values to Tailwind via CSS vars.

**Why not Tailwind-only (no CSS vars)?** Because the Razorpay checkout theme, the PWA manifest theme-color, the meta viewport theme-color, and body styles all need to reference the primary color *outside* of Tailwind class context. CSS vars are the universal bridge.

### 2.2 Token Definitions

#### globals.css — Complete Token Set

```css
@layer base {
  :root {
    /* ── Brand ── */
    --primary: #10B981;
    --primary-dark: #059669;
    --secondary: #1F2937;
    --accent: #FC7C78;

    /* ── Backgrounds ── */
    --surface: #F3F4F6;
    --card: #FFFFFF;

    /* ── Text ── */
    --text-primary: #111827;
    --text-secondary: #4B5563;
    --text-technical: #10B981;

    /* ── Borders ── */
    --border: #E5E7EB;

    /* ── Status ── */
    --success: #10B981;
    --warning: #F59E0B;
    --error: #EF4444;

    /* ── Radii ── */
    --radius-lg: 8px;
    --radius-xl: 12px;
    --radius-2xl: 16px;
    --radius-3xl: 24px;

    /* ── Shadows ── */
    --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
    --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04);

    /* ── Animation ── */
    --duration-fast: 150ms;
    --duration-normal: 200ms;
    --duration-slow: 300ms;
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-in-out: cubic-bezier(0.45, 0, 0.55, 1);

    /* ── Z-index ── */
    --z-dropdown: 10;
    --z-sticky: 20;
    --z-nav: 40;
    --z-overlay: 50;
    --z-modal: 60;
    --z-toast: 70;

    /* ── Layout ── */
    --content-max-width: 920px;
    --nav-height: 56px;
    --bottom-nav-height: 64px;
    --button-min-height: 48px;
    --input-height: 48px;
  }
}
```

#### tailwind.config.js — Extended Theme

```js
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: 'var(--primary)', dark: 'var(--primary-dark)' },
        secondary: 'var(--secondary)',
        accent: 'var(--accent)',
        surface: 'var(--surface)',
        card: 'var(--card)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-technical': 'var(--text-technical)',
        border: 'var(--border)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
      },
      fontFamily: {
        heading: ['var(--font-space-grotesk)', 'sans-serif'],
        body: ['var(--font-plus-jakarta)', 'sans-serif'],
        data: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)',
      },
      boxShadow: {
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        normal: 'var(--duration-normal)',
        slow: 'var(--duration-slow)',
      },
      zIndex: {
        dropdown: 'var(--z-dropdown)',
        sticky: 'var(--z-sticky)',
        nav: 'var(--z-nav)',
        overlay: 'var(--z-overlay)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
      },
      maxWidth: {
        content: 'var(--content-max-width)',
      },
      height: {
        nav: 'var(--nav-height)',
        'bottom-nav': 'var(--bottom-nav-height)',
      },
      minHeight: {
        btn: 'var(--button-min-height)',
        input: 'var(--input-height)',
      },
    },
  },
  plugins: [],
};
```

### 2.3 How a Component Consumes Tokens

```tsx
// Button.tsx consumes tokens purely through Tailwind classes:
<button className="bg-primary hover:bg-primary-dark text-white rounded-2xl min-h-btn px-6 
                    font-medium active:scale-95 transition-all duration-fast">
  {children}
</button>

// StickyActionBar uses CSS vars for calculated positioning:
<div className="fixed bottom-0 left-0 right-0 z-nav bg-card border-t border-border"
     style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
```

No component ever imports a constant file. All access is through Tailwind classes or `var()` references.

---

## SECTION 3: COMPONENT ARCHITECTURE

### 3.1 Three-Tier Hierarchy

| Tier | Location | Responsibility | Import Rules |
|------|----------|---------------|--------------|
| **Primitives** | `components/ui/` | Design system atoms. Accept visual props only (variant, size, disabled). No business types. | May import: `lib/cn.ts`. Must NOT import: any type from `types/`, any API call, any store. |
| **Domain Components** | `components/customer/`, `components/owner/` | Compose primitives with business data. Accept typed domain props (cafe, booking, tier). | May import: `ui/` primitives, `types/`. Must NOT import: API calls directly, stores. |
| **Page Components** | `app/**/page.tsx` | Orchestrate queries, mutations, navigation. Compose domain components. | May import: everything. Must remain under 150 lines by delegating to domain components. |

### 3.2 Variant Pattern: Class Variance Authority (cva)

**Decision**: Use the `cva` pattern (import from `class-variance-authority` — 0.7kB) for components with multiple visual variants. This replaces ad-hoc ternary strings.

**Why cva over manual ternaries?** The current codebase has 12+ instances of inline `${isActive ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}` strings. These are hard to audit and easy to make inconsistent. cva centralises variant definitions.

```ts
// Example: Badge component variants
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center rounded-full font-semibold', // base
  {
    variants: {
      variant: {
        success: 'bg-success/10 text-success',
        error: 'bg-error/10 text-error',
        warning: 'bg-warning/10 text-warning',
        accent: 'bg-accent/10 text-accent',
        neutral: 'bg-surface text-text-secondary border border-border',
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        md: 'px-2.5 py-0.5 text-xs',
      },
    },
    defaultVariants: { variant: 'neutral', size: 'md' },
  }
);
```

### 3.3 Props Contract Pattern

Every component uses a dedicated interface. No inline prop types. No `Record<string, unknown>`.

```ts
// ── Primitive: no business types ──
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftAdornment?: React.ReactNode;
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
  as?: 'div' | 'article' | 'section';
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  snapPoints?: number[];
}

interface SegmentedTabsProps<T extends string> {
  tabs: Array<{ value: T; label: string }>;
  activeTab: T;
  onTabChange: (tab: T) => void;
}

interface IncrementStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  icon?: React.ReactNode;
  formatValue?: (value: number) => string;
}

// ── Domain: accepts business types ──
interface CafeCardProps {
  cafe: CafeListItem;
  layout?: 'vertical' | 'horizontal';
  onClick?: () => void;
}

interface TierCardProps {
  tier: HardwareTier;
  isSelected: boolean;
  onSelect: () => void;
}

interface BookingCardProps {
  booking: BookingDetail;
  onPress: (bookingId: string) => void;
}

interface QRPassCardProps {
  bookingReference: string;
  qrCodeUrl: string;
  details: Array<{ label: string; value: string }>;
}

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: React.ReactNode;
}

// ── Layout ──
interface AuthGuardProps {
  allowedRoles: Array<'gamer' | 'cafe_owner' | 'staff' | 'admin'>;
  children: React.ReactNode;
  fallbackPath?: string;
}

interface PageContainerProps {
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';  // sm=480, md=640, lg=920, xl=1200
  className?: string;
}

interface StickyActionBarProps {
  leftContent: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
}
```

### 3.4 Compound Component Pattern

Used exclusively for the booking wizard, which has tightly coupled steps that share form state:

```ts
// BookingWizard.tsx — compound component with context
interface BookingWizardContextValue {
  cafeId: string;
  state: BookingWizardState;
  dispatch: React.Dispatch<BookingWizardAction>;
  cafe: CafeDetail;
}

// Consumed via sub-components:
// <BookingWizard cafeId={id}>
//   <BookingWizard.DateStep />
//   <BookingWizard.SlotStep />
//   <BookingWizard.TierStep />
//   <BookingWizard.SummaryStep />
// </BookingWizard>
```

### 3.5 Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Component file | PascalCase | `CafeCard.tsx` |
| Hook file | camelCase, `use` prefix | `useCafes.ts` |
| Type file | camelCase domain name | `booking.ts` |
| Util file | camelCase action name | `format.ts` |
| API file | camelCase domain name | `cafes.ts` |
| Component prop interface | `{ComponentName}Props` | `CafeCardProps` |
| Query hook | `use{Action}{Domain}` | `useListCafes` |
| Mutation hook | `use{Action}{Domain}` | `useCreateBooking` |
| Query key | `[domain, ...params]` tuple | `['cafes', { city, query }]` |

---

## SECTION 4: STATE MANAGEMENT STRATEGY

### 4.1 Server State — TanStack Query v5

#### Query Key Conventions

All keys follow a hierarchical tuple pattern: `[domain, scope?, id?, params?]`

```ts
// ── Query Keys Factory ──
export const queryKeys = {
  cafes: {
    all: ['cafes'] as const,
    list: (params: CafeListParams) => ['cafes', 'list', params] as const,
    detail: (id: string) => ['cafes', 'detail', id] as const,
    tiers: (cafeId: string) => ['cafes', 'tiers', cafeId] as const,
  },
  bookings: {
    all: ['bookings'] as const,
    list: (params: BookingListParams) => ['bookings', 'list', params] as const,
    detail: (id: string) => ['bookings', 'detail', id] as const,
  },
  promotions: {
    all: ['promotions'] as const,
    byCafe: (cafeId: string) => ['promotions', 'byCafe', cafeId] as const,
  },
  owner: {
    bookings: (params: OwnerBookingParams) => ['owner', 'bookings', params] as const,
    staff: ['owner', 'staff'] as const,
    payoutStatus: ['owner', 'payoutStatus'] as const,
  },
  admin: {
    pendingCafes: ['admin', 'pendingCafes'] as const,
  },
  auth: {
    me: ['auth', 'me'] as const,
  },
} as const;
```

#### Default Configuration

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 minutes
      gcTime: 30 * 60 * 1000,           // 30 minutes (garbage collection)
      retry: 2,
      refetchOnWindowFocus: false,       // Disable — we don't want surprise refetches during booking
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,                          // Mutations never auto-retry — user should decide
    },
  },
});
```

**Why 5-minute stale time?** Café data changes infrequently during a browsing session. A gamer scrolling the explore page doesn't need real-time updates. But slot availability and booking state DO change — those specific queries override with `staleTime: 60_000` (1 minute).

#### Optimistic Updates

Applied only where the UI would feel broken without them:

1. **Booking cancellation**: Optimistically mark booking as `cancelled` in the list, revert on error.
2. **Promotion toggle (owner)**: Optimistically flip `isActive`, revert on error.

NOT applied to:
- Booking creation (requires server-side validation of slot availability)
- Payment verification (must wait for Razorpay callback)
- Café verification (admin action — correctness over speed)

#### Invalidation Strategy

| Mutation | Invalidates |
|----------|-------------|
| `createBooking` | `bookings.all` |
| `cancelBooking` | `bookings.all`, `bookings.detail(id)` |
| `verifyPayment` | `bookings.all`, `bookings.detail(id)` |
| `createCafe` / `updateCafe` | `cafes.all`, `cafes.detail(id)` |
| `createTier` / `updateTier` | `cafes.tiers(cafeId)`, `cafes.detail(cafeId)` |
| `createPromotion` / `updatePromotion` / `deletePromotion` | `promotions.byCafe(cafeId)` |
| `verifyCafe` (admin) | `admin.pendingCafes` |
| `checkinBooking` (staff) | `owner.bookings(params)` |

### 4.2 Client State — Zustand (Auth Only)

**Decision**: Keep Zustand for auth state only. Do NOT create additional stores.

**Justification**: The current [authStore.ts](file:///e:/KHEL-O/frontend/src/store/authStore.ts) is well-structured. The only global client state this app needs is auth (user, tokens, hydration). Everything else is either server state (TanStack Query), URL state (Next.js router), or local component state.

#### Auth Store Shape (Refined)

```ts
interface AuthState {
  // Data
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;

  // Status flags
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;

  // Actions
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  initializeFromStorage: () => Promise<void>;
}
```

**Changes from current**: Remove `setLoading` as a public action — loading state should only be managed internally by `initializeFromStorage`. Rename `setUser` to accept non-null only (null is handled by `logout`).

### 4.3 Local State

#### When to use `useState`
- Simple toggles: modal open/close, dropdown visibility
- Single form fields: search input, selected tab
- UI-only state: current carousel index, scroll position

#### When to use `useReducer`
- **Booking wizard form**: 7+ interdependent fields (date, time, duration, tier, seats, notes, coupon). A reducer with typed actions prevents impossible states.
- **Owner onboarding wizard**: Multi-step form with validation across steps.

```ts
// Booking wizard reducer shape
interface BookingWizardState {
  step: 1 | 2 | 3;             // 1=slot, 2=tier, 3=checkout
  selectedDate: string;
  selectedTime: string;
  selectedDuration: number;
  selectedTierId: string;
  seats: number;
  notes: string;
  couponCode: string;
  paymentMethod: 'upi' | 'card' | 'wallet';
}

type BookingWizardAction =
  | { type: 'SET_DATE'; date: string }
  | { type: 'SET_TIME'; time: string }
  | { type: 'SET_DURATION'; hours: number }
  | { type: 'SET_TIER'; tierId: string }
  | { type: 'SET_SEATS'; count: number }
  | { type: 'SET_NOTES'; notes: string }
  | { type: 'SET_COUPON'; code: string }
  | { type: 'SET_PAYMENT_METHOD'; method: 'upi' | 'card' | 'wallet' }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'RESET' };
```

### 4.4 URL State

| What | Where | Format | Why URL? |
|------|-------|--------|----------|
| **Café ID** | `/cafes/[id]` | Dynamic segment | Shareable deep link, back button |
| **Booking ID** | `/bookings/[id]` | Dynamic segment | Shareable pass, QR link |
| **Booking wizard context** | `/bookings/new?cafeId=X&tierId=Y` | Search params | Preserves context through payment flow, browser back works |
| **Explore filters** | `/?city=Bengaluru&q=Nexus` | Search params | Shareable filtered views, bookmarkable |
| **Booking list tab** | `/bookings?tab=completed` | Search param | Back button preserves tab selection |

Things that do NOT go in the URL:
- Auth tokens (security risk)
- Wizard step number (transient, wizard handles internally)
- Modal open/close state (ephemeral)
- Payment processing state (ephemeral)

---

## SECTION 5: PHASED IMPLEMENTATION PLAN

### Phase 1: Foundation

**What**: Design tokens, globals.css, tailwind.config.js, font loading, cn utility, provider setup, root layout, type definitions, API client refactor.

**Why first**: Every subsequent phase depends on the token system and API layer existing. Building any component before tokens are locked produces inconsistent styling.

**Scope**: Medium

**Acceptance Criteria**:
- [ ] `globals.css` contains complete token set (all CSS variables from Section 2)
- [ ] `tailwind.config.js` extends theme correctly — all tokens accessible as Tailwind classes
- [ ] `cn()` utility (`clsx` + `tailwind-merge`) works correctly
- [ ] `layout.tsx` loads all 3 Google Fonts via `next/font/google` with correct variables
- [ ] `providers.tsx` initialises QueryClient with defaults from Section 4
- [ ] `lib/api/client.ts` contains Axios instance with working refresh-token interceptor (extracted from current monolith)
- [ ] `lib/api/*.ts` domain files export all functions currently in `api.ts`
- [ ] `types/*.ts` domain files export all interfaces currently in `types/index.ts`
- [ ] App compiles with no TypeScript errors
- [ ] `cva` package installed (requires user confirmation)

**Risk**: Token value mismatches between CSS vars and Tailwind consumption → verify every color renders correctly.

---

### Phase 2: Navigation System

**What**: Customer shell (TopNavBar + BottomNavBar for mobile, TopNavBar only for desktop), Owner shell (sidebar desktop + bottom nav mobile), Admin shell (header bar), AuthGuard component, PageContainer.

**Why second**: Navigation shells define the viewport geometry (nav heights, content max-widths, safe area insets) that all page content lives within. Building pages without shells produces content that overflows or underlaps.

**Scope**: Medium

**Acceptance Criteria**:
- [ ] Customer layout shows TopNavBar on desktop (>768px), BottomNavBar on mobile
- [ ] Desktop TopNavBar: logo left, text nav links center-right, bell icon + avatar circle right
- [ ] Mobile BottomNavBar: 4 tabs (Explore, Bookings, Rewards, Profile) with active state
- [ ] Active nav state derived from `usePathname()` — matches prototype behavior
- [ ] BottomNavBar hidden on booking wizard and checkout routes
- [ ] Owner layout: sidebar on desktop (md+), bottom nav on mobile
- [ ] Admin layout: header bar with shield icon, title, "Customer app" link
- [ ] AuthGuard protects all portal route groups — redirects unauthenticated to `/login`
- [ ] AuthGuard enforces role: gamers cannot access `/owner/*` or `/admin/*`
- [ ] PageContainer enforces max-width per portal (customer: 920px, owner: 1200px, admin: 1200px)
- [ ] Responsive transition between mobile and desktop nav is seamless — no flash

**Risk**: Auth hydration race condition on hard refresh → the existing `isHydrated` flag pattern handles this. Preserve it exactly.

---

### Phase 3: Core Component Library

**What**: Build every `components/ui/` primitive and every `components/customer/` + `components/owner/` domain component in isolation. No page wiring.

**Why third**: Isolating components from pages forces clean prop contracts. Building components *inside* pages (the current pattern) leads to entangled state.

**Scope**: Large

**Acceptance Criteria**:
- [ ] All 18 `ui/` primitives built with correct variant props (Button: 5 variants × 3 sizes, Badge: 5 variants × 2 sizes, etc.)
- [ ] All 15 `customer/` domain components accept typed props and render correctly
- [ ] All 6 `owner/` domain components accept typed props
- [ ] Every component uses design tokens via Tailwind classes only — no hardcoded hex values
- [ ] Every interactive component has `active:scale-95` press feedback and `transition-all duration-fast`
- [ ] Skeleton variants exist for CafeCard, BookingCard, StatCard
- [ ] EmptyState and ErrorState components are generic with customisable icon, title, description, and action
- [ ] All components render correctly at both 375px and 1280px viewport widths

**Risk**: Over-abstracting components that only have 1 variant → bias toward simplicity. If a component has exactly 1 visual form, it doesn't need cva.

---

### Phase 4: Customer Portal

**What**: All customer-facing pages, assembled from Phase 3 components.

**Build order and why**:

1. **Login → OTP** — Must work first. Without auth, nothing else is testable. The prototype shows a split-screen layout (hero left, form right on desktop; full-screen form on mobile).

2. **Explore** — The landing page after login. Needs search bar, city filter chips, Flash Deals carousel, café grid. Tests CafeCard, FilterChip, SearchInput.

3. **Café Detail** — Reached from Explore. Tests PhotoCarousel, TierCard, StickyActionBar. Must correctly pass `cafeId` and `tierId` to booking wizard via URL params.

4. **Booking Wizard** — The critical revenue path. 3-step wizard (slot selection → tier selection → checkout). Uses `useReducer` for form state, TanStack Query for café data, and the Razorpay hook for payment. This is the highest-complexity page.

5. **Booking Confirmation** — Post-payment success screen. Tests QRPassCard, success state. Simple rendering page.

6. **Booking Detail / Pass** — Accessible from bookings list and from confirmation redirect. Tests BottomSheet modal with QR display.

7. **Bookings List** — Tab-filtered list (Upcoming, Completed, Cancelled). Tests SegmentedTabs, BookingCard, empty states.

8. **Rewards** — XP progress, achievements grid, coupons. Relatively standalone — no cross-page dependencies.

9. **Profile** — User info, settings links, FAQ accordion, portal navigation links. Last because it's lowest-revenue-impact.

**Scope**: Large

**Acceptance Criteria**:
- [ ] Complete booking flow works end-to-end: Explore → Café Detail → Book Now → Wizard → Pay → Confirmation with QR
- [ ] Razorpay checkout opens and processes payment (sandbox mode with mock fallback)
- [ ] Booking appears in Bookings List after confirmation
- [ ] Booking detail bottom sheet shows QR code and all booking info
- [ ] Cancel booking works from booking detail
- [ ] Search and city filtering works on Explore page
- [ ] Café detail shows correct tiers, reviews, promotions from API
- [ ] All pages have loading skeletons, error states, and empty states
- [ ] All pages respect responsive layout (mobile: full-width stacked, desktop: centered column)

**Risk**: Payment flow regression — the current Razorpay integration works. Extract the existing [useRazorpay.ts](file:///e:/KHEL-O/frontend/src/hooks/useRazorpay.ts) without modification. The mock fallback is critical for demo mode.

---

### Phase 5: Gamer-to-Owner Onboarding

**What**: Partner application wizard (multi-step form for café registration), pending state screen, rejection handling.

**Why here**: This is the bridge between the customer portal (where the "Become a partner" CTA lives) and the owner portal. It must be built before Phase 6 so there's a path to create owner accounts for testing.

**Scope**: Medium

**Acceptance Criteria**:
- [ ] "Become a partner" button on profile and home page navigates to `/owner/onboarding`
- [ ] Multi-step onboarding form: Business details → Café details → Hardware setup → Review & submit
- [ ] Form validates all required fields before each step progression
- [ ] Submission calls `createCafe()` API
- [ ] Post-submission shows "Pending verification" state with clear messaging
- [ ] If café is rejected, owner sees rejection reason and "Reapply" option

**Risk**: Current [onboarding page](file:///e:/KHEL-O/frontend/src/app/(owner)/owner/onboarding/page.tsx) is 17KB (est. ~450 lines). Decompose into step components.

---

### Phase 6: Owner Portal

**What**: All owner-facing pages — dashboard, café management, tier editor, booking management, promotions, staff management, payouts.

**Build order**:

1. **Dashboard** — KPI stat cards (revenue, bookings, occupancy) + quick actions. Tests StatCard.
2. **Café Management** — Edit café details form, photo management, hours. Tests CafeForm.
3. **Hardware Tiers** — List/create/edit tiers. Tests TierForm.
4. **Promotions** — List/create/edit/delete promotions. Tests PromotionForm.
5. **Bookings** — Owner view of bookings with check-in capability and QR scanning. Tests BookingRow.
6. **Staff Management** — Add/view staff members for the café. Tests StaffRow.
7. **Payouts** — KYC submission form and payout status display.

**Scope**: Large

**Acceptance Criteria**:
- [ ] Owner can view and edit café details
- [ ] Owner can create, edit, and deactivate hardware tiers
- [ ] Owner can create, edit, toggle, and delete promotions
- [ ] Owner can view bookings filtered by date and status
- [ ] Owner can check in a gamer by booking ID
- [ ] Owner can add staff members
- [ ] Staff-role users see only the Bookings & Scan view (no dashboard, no settings)
- [ ] Dashboard shows live stats from backend
- [ ] All forms validate inputs and show inline error messages
- [ ] Owner portal desktop layout uses sidebar navigation (matches prototype)

**Risk**: Staff vs owner role mismatch — the current owner layout already handles this with `isStaffOnly`. Preserve this conditional nav logic.

---

### Phase 7: Admin Portal

**What**: Admin verification queue, café review detail, approve/reject flow, platform stats.

**Scope**: Small

**Acceptance Criteria**:
- [ ] Admin sees list of pending café applications with owner details
- [ ] Admin can approve a café (status → `verified`)
- [ ] Admin can reject a café with a reason (status → `rejected`)
- [ ] Approved/rejected café disappears from pending queue
- [ ] Platform stats (total users, bookings, GMV, live cafés) display correctly
- [ ] Admin portal is desktop-only layout (no mobile optimisation)

**Risk**: Low — this is the smallest portal with the least UI complexity.

---

### Phase 8: Polish

**What**: Systematic audit and refinement pass across all portals.

**Sub-phases**:

1. **Animation pass**: Add `active:scale-95` to every button/card, `transition-all duration-fast` to every interactive element, bottom sheet slide-up/down animation, modal fade-in.

2. **Loading states audit**: Every page that fetches data must show domain-specific skeleton screens (not generic spinners). Verify all skeletons match the content layout they replace.

3. **Error states audit**: Every query-driven page must show an ErrorState component with retry button when the query fails. Verify error messages are user-friendly (not raw API error strings).

4. **Empty states audit**: Every list page must show an EmptyState component when the list is empty. Verify icons and copy are contextually appropriate.

5. **Responsive audit**: Test every page at 375px, 768px, 1024px, and 1440px. Fix any layout breaks, text truncation issues, or touch target violations.

6. **Accessibility audit**: Verify all interactive elements have `aria-label` where needed. Verify tab order is logical. Verify color contrast meets WCAG AA (4.5:1 for text). Verify all images have `alt` text.

7. **Performance audit**: Check bundle size. Lazy-load heavy pages (admin, owner) with `dynamic()`. Verify images use `next/image` with proper `sizes` prop. Verify no layout shift on page load.

**Scope**: Medium

**Acceptance Criteria**:
- [ ] Lighthouse mobile score ≥ 85 for Performance, ≥ 90 for Accessibility
- [ ] No layout shift visible on page load
- [ ] All interactive elements are reachable via keyboard Tab
- [ ] All skeleton screens match their content layout
- [ ] Every empty list shows contextual empty state
- [ ] Every failed fetch shows retry-able error state

---

## SECTION 6: RESPONSIVE STRATEGY

### 6.1 Breakpoints

| Name | Value | Semantic Meaning |
|------|-------|-----------------|
| `sm` | 640px | Small mobile → large mobile transition |
| `md` | 768px | Mobile → tablet / desktop navigation switch |
| `lg` | 1024px | Tablet → desktop content expansion |

**Why these three?** The app has exactly one meaningful navigation breakpoint (mobile bottom nav → desktop top nav at `md`). Content layout adapts once more at `lg` (café grid switches from 1-col to multi-col). Adding more breakpoints would add complexity without visual benefit.

### 6.2 Customer Portal Responsive Behavior

#### Explore Page
| Element | Mobile (<768px) | Desktop (≥768px) |
|---------|-----------------|-------------------|
| Search bar | Full-width, sticky below top bar | Full-width within max-content column |
| Filter chips | Horizontal scroll, `overflow-x-auto` | Wrap to second row if needed |
| Featured cafés | Horizontal scroll carousel, cards at 280px fixed width | 4-across horizontal scroll or grid |
| Nearby cafés | Single column, full-width cards | 3-column grid, cards fill column |
| Trending offers | 2×2 grid or stacked | 2×2 grid within content column |

#### Café Detail
| Element | Mobile | Desktop |
|---------|--------|---------|
| Hero photo | Full-width, 56vw height | Full-width within content column, 400px max height |
| Hardware tiers | Stacked vertically | 3-column horizontal grid |
| Tabs (Amenities/Games/Reviews) | Full-width horizontal tabs | Same |
| Sticky action bar | Full-width bottom | Same — full-width bottom within content |

#### Booking Wizard
| Element | Mobile | Desktop |
|---------|--------|---------|
| Date strip | Horizontal scroll of 7 day circles | Same, centered |
| Time slot grid | 4-column grid (fills viewport width) | 4-column grid within content max-width |
| Tier radio cards | Stacked vertically | Same — vertical stack is intentional for scanability |
| Checkout form | Stacked sections | Same — single column for payment forms always |

#### Booking Pass
| Element | Mobile | Desktop |
|---------|--------|---------|
| QR code | Centered, ~200px | Same — centered column, constrained width |
| Details grid | 2-column label/value pairs | Same |
| Actions | Stacked buttons | Side-by-side buttons |

### 6.3 Owner Portal Responsive Behavior

The owner portal should feel like a **web dashboard on desktop** and a **focused mobile tool on mobile**.

| Element | Mobile (<768px) | Desktop (≥768px) |
|---------|-----------------|-------------------|
| Navigation | Bottom tab bar (same pattern as customer) | Left sidebar, 256px wide, dark bg |
| Content area | Full-width, 16px padding | Fills remaining width, 32px padding, max-width 1200px |
| KPI stat cards | 2-column grid | 4-column grid |
| Data tables (bookings, staff) | Card-based list (each row is a card) | Horizontal table layout |
| Forms (tier, promo, café) | Full-width stacked fields | 2-column grid for short fields, full-width for long fields |

### 6.4 Admin Portal Responsive Behavior

**Decision**: Desktop-first. No mobile optimisation.

**Justification**: Admin users are platform operators working from desktops. The admin portal has exactly 1 page (verification queue). Optimising it for mobile adds effort with zero user benefit.

Layout: Full-width header bar, centered content column (max-width 1200px), stat cards in 4-column grid, application rows as horizontal cards with inline action buttons.

### 6.5 Avoiding the "Stretched Mobile App" Problem

The current [customer layout](file:///e:/KHEL-O/frontend/src/app/(customer)/layout.tsx) uses `max-w-md` (448px) — this makes the desktop view look like a phone emulator. The prototype uses a much wider content area (~920px).

**Fix**: `PageContainer` component applies `max-w-content` (920px for customer, 1200px for owner/admin) with `mx-auto px-4 lg:px-0`. Content fills the column naturally. The subtle blue wash on page edges (from the prototype) is achieved with:

```css
body {
  background: linear-gradient(135deg, #DBEAFE 0%, var(--surface) 20%, var(--surface) 80%, #DBEAFE 100%);
}
```

This makes desktop feel intentional, not accidentally wide.

---

## SECTION 7: RISK REGISTER

| # | Risk | Likelihood | Severity | Mitigation |
|---|------|-----------|----------|------------|
| 1 | **Auth flow regression during refactor** — Token refresh interceptor breaks, users get logged out mid-session | Medium | Critical | Extract the existing [Axios interceptor](file:///e:/KHEL-O/frontend/src/lib/api.ts#L13-L109) into `client.ts` with zero logic changes. Write a manual test: login → wait 30min → trigger API call → verify refresh works. Do NOT refactor the interceptor logic. |
| 2 | **Razorpay payment integration breaks** — Checkout fails to open, or payment verification fails | Medium | Critical | Copy [useRazorpay.ts](file:///e:/KHEL-O/frontend/src/hooks/useRazorpay.ts) verbatim. Do not rename, restructure, or "improve" it. The mock fallback (`pay_mock_${Date.now()}`) is essential for demo mode. Test: complete a full booking with mock payment in sandbox mode. |
| 3 | **QR code display breaks** — QR code not rendering on booking confirmation or booking detail | Low | High | QR code URL comes from `booking.qrCodeUrl` (server-generated). Ensure `QRPassCard` renders `<img src={qrCodeUrl} />` exactly — do not switch to a client-side QR library unless server stops providing URLs. |
| 4 | **Role-based routing regressions** — Gamers access owner portal, or owners can't reach their dashboard | Medium | High | Centralise all role checks in a single `AuthGuard` component instead of duplicating logic in 4 separate layouts (the current pattern). AuthGuard reads `user.role` from Zustand and compares against `allowedRoles` prop. Test all 4 roles × 4 route groups = 16 combinations. |
| 5 | **API contract mismatch** — Frontend types don't match backend response shapes after refactor | Medium | High | The current [types/index.ts](file:///e:/KHEL-O/frontend/src/types/index.ts) is the contract source of truth. When splitting into domain files, copy interfaces exactly — do not rename fields. Add runtime validation in API functions: `if (!res.data?.data) throw new Error('Unexpected response')`. |
| 6 | **Design token mismatch** — Colors or fonts look different after CSS variable restructuring | Low | Medium | Side-by-side comparison: render every major component at the end of Phase 3 and compare against prototype screenshots. The hex values are already correct in the current `globals.css`. |
| 7 | **Booking wizard state loss** — User goes back in the wizard and loses selections, or payment state is lost during Razorpay redirect | Medium | High | Use `useReducer` (not `useState` × 7 like current code). Wizard state is maintained in component state — NOT in URL or global store. The Razorpay checkout opens as a modal overlay (not a redirect), so React state persists. Verify: select date → select tier → go back → date is preserved. |
| 8 | **Bundle size bloat** — Adding cva + restructured imports increases JS bundle | Low | Low | cva is 0.7kB gzipped. The restructuring adds no new dependencies. Use `next/dynamic` for owner and admin route groups so they're not in the gamer's initial bundle. |
| 9 | **Hydration mismatch on auth** — Server renders "loading" state, client hydrates with "authenticated" state, causing flash | Medium | Medium | The existing pattern (render loading spinner until `isHydrated`) is correct. Preserve it. Every portal layout MUST check `if (!isHydrated) return <Spinner />` before rendering content. |
| 10 | **Responsive breakpoint inconsistency** — Components use different breakpoints creating a "half-mobile" state | Low | Medium | All responsive logic uses only `md:` (768px) and `lg:` (1024px) prefixes. No `sm:` breakpoint for layout changes. Enforce via code review: search for `sm:` in layout-affecting classes (grid-cols, hidden, flex-direction). |
| 11 | **Owner onboarding form data loss** — User fills 3 steps of the onboarding wizard, browser refreshes, loses everything | Medium | Medium | For Phase 5, persist wizard state to `sessionStorage` on each step transition. On mount, check `sessionStorage` for saved draft. Clear on successful submission. |
| 12 | **Race condition: double booking** — User clicks "Pay" twice before Razorpay modal opens, creating two pending bookings | Low | High | Disable the Pay button immediately on click (`isProcessingPayment` state). The current code already does this — preserve the `setIsProcessingPayment(true)` call before `createBooking()`. |

---

## Open Questions

> [!IMPORTANT]
> **Package installation**: Phase 1 requires installing `class-variance-authority` (~0.7kB gzipped). Confirm this is acceptable before proceeding.

> [!IMPORTANT]
> **Framer Motion**: The current `package.json` does not list `framer-motion` as a dependency despite it being mentioned in the project description. The motion design spec (Section 5 of the design system) shows all animations are achievable with CSS `transition` + `active:scale-*`. **Decision**: Do NOT add Framer Motion. Use CSS transitions only. Confirm this is acceptable — or if you want Framer Motion for the bottom sheet and modal animations specifically.

> [!IMPORTANT]
> **Login flow discrepancy**: The prototype uses OTP-based phone login (enter phone → receive OTP → verify). The current backend [auth.py](file:///e:/KHEL-O/backend/app/api/v1/auth.py) has only email/password login, Google OAuth, and token refresh. There is **no OTP endpoint**. Which login flow should the frontend implement? Options:
> 1. Keep the existing email/password flow (matches backend)
> 2. Add OTP endpoints to the backend first, then build OTP frontend
> 3. Build the OTP UI with a hardcoded demo bypass (like the Lovable prototype does)

> [!NOTE]
> **Image hosting**: The prototype uses rich café photos. The backend `photos` field returns URL strings but there's no upload endpoint visible. Café images may be seeded URLs pointing to external sources. The frontend should handle: (a) valid URLs rendering via `next/image`, (b) missing/broken URLs showing a gradient fallback. No upload UI is needed in Phase 4 unless the backend already supports it.
