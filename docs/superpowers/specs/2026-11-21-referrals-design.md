# Referrals and first-booking credits: design

Date: 2026-11-21. Asked for by the founder ("₹15 off for everyone, one more ₹15 with the code from the WhatsApp community, and a referral system"). The founder pre-approved building it on DEV overnight; prod needs a separate "promote". The programme ships switched OFF (`referrals_on` false) and is turned on from the admin Referrals page.

## What the player gets

| Who | What | When it applies |
|---|---|---|
| Every new player | ₹15 off (welcome) | first paid booking |
| New player who types the community code | +₹15 off | first paid booking; the code is posted only in WhatsApp community announcements |
| A player whose friend joined from their link | ₹15 off their next booking, per friend | after the friend's first booking is **checked in at the café** |

- KHEL-O pays all of it. The café's share never changes. The credit is stored in `bookings.khelo_discount` (the same column as the ₹1 price drop), so every payout and café-share formula stays correct: café share = total − fee + khelo_discount.
- A booking carries at most ₹30 of KHEL-O credit, and at least ₹1 is always charged (Razorpay's minimum).
- Credits apply only when the session price is ₹50 or more.
- All amounts, the community code and an on/off switch live in Platform Settings, editable on the admin Referrals page.

## Razorpay and RBI fit (why it's shaped this way)

- **Discount, not money.** Rewards are only ever a lower price on a KHEL-O booking. There is no cash, no withdrawal, no transfer, no wallet balance and no top-up, so this is not a prepaid payment instrument (RBI PPI rules) and no Razorpay wallet feature is needed.
- **The order is created for the discounted amount.** Razorpay charges exactly what the customer pays; a refund returns at most what was paid. The KHEL-O credit is never refunded as cash. A cancelled booking puts an unused referral credit back.
- **One level only.** There is no reward for a friend's friend, and no reward for signing up alone, so this is not multi-level marketing, which Razorpay prohibits.
- **Earned only by real play.** The referrer is rewarded only when the friend's own paid booking is checked in at the café.
- **Clear public terms** at `/referral-terms`, linked from the invite card and checkout.

## Abuse limits

- No self-referral (your own code is refused, and so is a friend with the same phone number).
- The link has to be claimed within 14 days of the friend's account being made, before their first paid booking. A player has only one referrer.
- At most 10 rewarded friends per referrer (then the status is `capped`). Credits expire 60 days after they're earned.
- One referral credit per booking. The credit is reserved when the booking is created and marked used when payment is confirmed. If two pending bookings race, the first one wins; the second may also get ₹15, an accepted small leak.
- Admin can void a referral. The community code is case-insensitive and the admin can rotate it at any time.

## Data (migration 097)

- `platform_settings`: `referrals_on`, `welcome_credit`, `community_code`, `community_credit`, `referral_reward`.
- `bookings`: `khelo_credit` (the part of `khelo_discount` that is a credit), `credit_note` (e.g. `welcome+community`), `referral_credit_id`.
- `referrals` (referrer_id, referred_id unique, code, status `joined|rewarded|capped|void`, booking_id, rewarded_at, void_reason).
- `referral_credits` (user_id, referral_id, amount, status `available|used|expired|void`, expires_at, used_booking_id, used_at).

## Flow

1. The link `?inv=<code>` (already live) is stored in the browser for 30 days on landing.
2. Once the person is signed in, `POST /referrals/claim` runs once and then forgets the stored code.
3. Quote and create both call `khelo_credits_for()`, which returns the welcome, community-code and referral-credit lines. The community code is typed in the existing "Have a code?" box. If it matches, it's taken as the community code and not looked up as a café promo.
4. Payment confirmed: `referrals.on_paid` marks the reserved referral credit used.
5. Check-in: `referrals.on_checked_in` rewards the referrer and sends them an in-app notification.
6. Cancel: `referrals.on_cancelled` releases the credit.

## Screens

- Checkout: credit lines (Welcome offer, Community code, Friend reward), plus a "+₹15 with the community code" hint and a join link.
- Invite card: "Friends get up to ₹30 off their first booking; you get ₹15 off for each friend who plays", with available rewards and the friend count.
- Admin → Growth → Referrals: switch, amounts, community code, totals (credits given, ₹ spent by kind), recent referrals with Void.
- `/referral-terms`.
