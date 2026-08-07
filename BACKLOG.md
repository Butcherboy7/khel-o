# KHEL-O Backlog

## Completed Tickets
1. ✅ Role/mode/auth system fix
2. ✅ Role/mode/auth system verification
9. ✅ Owner dashboard capabilities (backend complete, frontend deferred)

## Active Ticket
3. 🔄 Overnight slot generation bug

## Remaining Queue (in order)
4. Payment flow
5. City + notifications  
6. Onboarding UX
7. Verify submission e2e
8. Admin queue
9-FE. Owner dashboard UI (frontend components)

---

## Ticket Details

### Ticket 3: Overnight Slot Generation Bug

**Bug:** Café operating hours are set to 10:00 AM – 2:00 AM (overnight range), but the 
booking slot picker only generates slots up to 11:00 PM. Slots between 11PM and 2AM 
(closing time) never appear, making them permanently unbookable.

**Investigate First:**
1. Find the slot-generation function/logic. Show how it currently interprets 
   close_time when close_time is numerically "earlier" than open_time (e.g. 
   open=10:00, close=02:00) — does it correctly treat this as "next day 2AM", or 
   does it break/truncate because it assumes close_time > open_time always?
2. Check if there's a hardcoded cutoff (e.g. "23:00" or "generate slots only for 
   today's calendar date") that would explain the exact 11PM ceiling regardless of 
   actual close_time.

**Fix:** Slot generation must correctly handle overnight ranges — if close_time < 
open_time when compared as plain times, treat close_time as occurring on the 
following calendar day. Generate all valid slots from open_time through close_time 
inclusive of the overnight portion, respecting slot duration/interval already used 
elsewhere in the system.

**Verify:** Booking a slot in the overnight portion (e.g. 12:30 AM) correctly 
associates with the right calendar date/session for reporting, inventory locking, 
and cancellation-window calculations.

**Acceptance Tests (Pytest):**
- Café with hours 10:00–02:00 generates slots correctly through 1:30 AM (last valid 
  slot before 2AM close)
- A booking made for a post-midnight slot correctly locks the right inventory unit 
  and appears in correct booking list for correct business day
- A café with normal same-day hours (9AM–9PM) still works — regression check
- Cancellation window calculation for post-midnight booking is correct

**Requirement:** Run FULL test suite after change, paste total pass count.
