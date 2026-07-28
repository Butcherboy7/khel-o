# User Flows — KHEL-O

## Overview

This document describes every major user journey in the KHEL-O platform. Each flow includes the steps, decision points, error scenarios, and expected outcomes. These flows are the source of truth for frontend screen design, API endpoint sequencing, and QA test case creation.

---

## 1. Player Registration and Onboarding

### Actors
- Gamer (new user)

### Preconditions
- User has an Indian mobile phone number (+91).
- User has the KHEL-O web app open.

### Steps

1. User opens the KHEL-O web app and taps "Sign Up."
2. System displays the registration form: phone number field.
3. User enters their 10-digit Indian mobile number.
4. System validates phone number format (+91, 10 digits).
   - **Error:** Invalid phone number format → Display inline error: "Please enter a valid 10-digit Indian mobile number."
5. System sends a 6-digit OTP via SMS.
6. System displays OTP input screen with a 5-minute countdown timer.
7. User enters the 6-digit OTP.
8. System verifies the OTP.
   - **Error:** Incorrect OTP → Display error: "Invalid OTP. Please try again." Allow up to 5 attempts.
   - **Error:** OTP expired → Display error: "OTP expired. Please request a new one." Show "Resend OTP" button.
   - **Error:** 5 failed attempts → Lock the phone number for 15 minutes. Display: "Too many attempts. Please try again in 15 minutes."
9. OTP verified successfully. System checks if this phone number is already registered.
   - **Decision:** Phone already registered → Redirect to login flow (issue tokens).
   - **Decision:** Phone not registered → Continue to profile creation.
10. System displays profile creation form: name (required), email (optional), city (required, dropdown), and optional profile photo upload.
11. User fills in the form and taps "Create Account."
12. System validates input:
    - **Error:** Name is empty → "Name is required."
    - **Error:** Email format is invalid → "Please enter a valid email address."
    - **Error:** City not selected → "Please select your city."
13. System creates the user account with role "Gamer."
14. System issues JWT access token (15 min) and refresh token (30 days).
15. System redirects user to the home screen (café discovery).
16. System sends a welcome SMS: "Welcome to KHEL-O! Discover gaming cafés near you."

### Post-conditions
- User account exists in the database with role "Gamer."
- User is authenticated and on the home screen.

---

## 2. Café Discovery

### Actors
- Authenticated Gamer

### Preconditions
- User is logged in.
- User is on the home screen.

### Steps

1. Home screen displays:
   - Search bar (search by café name, area, or city).
   - Active promotions carousel from nearby cafés.
   - List of nearby cafés (default sorted by distance if location permission granted, otherwise by city).
   - Map toggle (switch to map view).

2. **Path A: Search by text**
   1. User types a query (e.g., "Koramangala" or "FragHouse") in the search bar.
   2. System searches cafés by name, city, and area (case-insensitive, partial match).
   3. System returns matching verified cafés.
      - **Edge Case:** No results → Display: "No cafés found for '[query]'. Try a different search."
   4. User sees a list of matching cafés with: name, area, rating, distance (if available), starting price, and top hardware tier.

3. **Path B: Filter**
   1. User taps "Filters" button.
   2. System displays filter panel:
      - Hardware Tier Type: Standard, Premium, PS5, VIP (multi-select checkboxes).
      - Price Range: Slider (₹0 – ₹500/hour).
      - Rating: Minimum stars (1–5).
      - Amenities: AC, Parking, Food, Headphones Provided, etc. (multi-select).
      - Distance: Within 2 km, 5 km, 10 km, 25 km (if location available).
   3. User selects filters and taps "Apply."
   4. System returns filtered results.
      - **Edge Case:** No results with applied filters → Display: "No cafés match your filters. Try adjusting them."

4. **Path C: Map View**
   1. User taps "Map" toggle.
   2. System requests location permission (if not already granted).
      - **Decision:** Permission granted → Center map on user's location.
      - **Decision:** Permission denied → Center map on the user's selected city.
   3. System displays café location markers on the map.
   4. User taps a marker to see a brief café card (name, rating, starting price).
   5. User taps the card to navigate to the café profile.

5. **Path D: Sort**
   1. User taps "Sort by" dropdown.
   2. Options: Distance (nearest first), Rating (highest first), Price (lowest first), Relevance (default).
   3. System re-orders the café list.

6. User taps on a café card to navigate to the café profile page.

---

## 3. Viewing a Café Profile

### Actors
- Gamer (authenticated or guest)

### Steps

1. User navigates to a café profile (from search results, map, promotion, or direct link).
2. System displays the café profile page with:
   - Header: Café name, area, city, rating (stars + review count), verification badge.
   - Photo gallery: Up to 10 photos in a carousel.
   - About: Description, address, phone number, operating hours.
   - Hardware Tiers: Cards for each tier showing name, specs (GPU, CPU, RAM, monitor), per-hour pricing, and availability indicator.
   - Active Promotions: Banner cards showing discount percentage, applicable tier, time window, and validity dates.
   - Amenities: Icons/tags for amenities (AC, Parking, Wi-Fi speed, Food, Headphones, etc.).
   - Reviews: Recent reviews with rating, text, gamer name, and date.
   - "Book Now" button (sticky at bottom on mobile).

3. **Decision Point:** User taps "Book Now" → Navigate to the booking flow.
4. **Decision Point:** User taps on a promotion → Pre-fill the booking form with promotion details.
5. **Decision Point:** User taps "View All Reviews" → Load paginated review list.
6. **Decision Point:** User taps "Get Directions" → Open Google Maps with café coordinates.

### Error Scenarios
- **Café not found (invalid ID):** Display 404 page: "This café doesn't exist or has been removed."
- **Café not verified:** Display message: "This café is pending verification and not yet available for booking."
- **Café temporarily closed:** Display the profile with a banner: "This café is temporarily closed. Bookings are not available."

---

## 4. Making a Reservation

### Actors
- Authenticated Gamer

### Preconditions
- User is on the café profile page.
- Café is verified and open.

### Steps

1. User taps "Book Now" (or taps on a specific hardware tier's "Book" button).
2. System displays the booking form:
   - **Date:** Date picker (today to 7 days ahead).
   - **Start Time:** Time picker (only shows available time slots within operating hours, in 30-minute increments).
   - **Duration:** Dropdown (1, 2, 3, 4, 5, or 6 hours).
   - **Hardware Tier:** Dropdown or tier cards (pre-selected if user tapped a specific tier).

3. User selects date.
4. User selects start time.
   - **Constraint:** Start time must be at least 30 minutes from now (if booking for today).
   - **Constraint:** Start time must be within café's operating hours.
   - **Error:** Selected time is in the past → "Please select a future time."
   - **Error:** Selected time is outside operating hours → "Café is closed at this time. Operating hours: 10 AM – 12 AM."

5. User selects duration.
   - **Constraint:** Start time + duration must not exceed café closing time.
   - **Error:** Session extends beyond closing → "Your session would end after the café closes at 12 AM. Please select a shorter duration."

6. User selects hardware tier.
7. System checks availability for the selected tier, date, time, and duration.
   - **Availability:** System counts confirmed bookings for this tier in the requested time window. If count < tier quantity, the tier is available.
   - **Error:** Tier fully booked → Display: "This tier is fully booked for the selected time. Try a different tier or time."

8. System displays booking summary:
   - Café name and address.
   - Date, start time, end time.
   - Hardware tier name and specs.
   - Base amount: hourly rate × duration.
   - Promotion discount (if applicable): -X% off = -₹Y.
   - Convenience fee: ₹Z.
   - GST on convenience fee: 18% of ₹Z.
   - **Total amount:** Base − discount + convenience fee + GST.

9. User reviews the summary and taps "Proceed to Payment."
10. System creates a booking record in "payment_pending" state.
11. System creates a Razorpay order.
12. System opens the Razorpay payment modal.
13. → Continue to Payment Flow (Section 5).

### Error Scenarios
- **User is not logged in:** Redirect to login page with return URL. After login, return to booking form with selections preserved.
- **Café goes offline during booking:** Display error: "This café is currently unavailable. Please try again later."
- **Tier becomes unavailable between selection and payment:** Display error: "Sorry, this tier just got booked. Please select a different time or tier."
- **Network error during submission:** Display error: "Something went wrong. Please try again." Preserve form inputs.

---

## 5. Payment Flow

### Actors
- Authenticated Gamer
- Razorpay (external system)

### Preconditions
- Booking record created in "payment_pending" state.
- Razorpay order created.

### Steps

1. Razorpay payment modal is displayed to the user.
2. User selects a payment method: UPI, Debit Card, Credit Card, Net Banking, or Wallet.
3. User completes payment on Razorpay.
   - **UPI:** User enters UPI ID or scans QR → Approves on UPI app.
   - **Card:** User enters card details → OTP verification.
   - **Net Banking:** User redirected to bank login → Completes payment.

4. **Decision: Payment Successful**
   1. Razorpay sends a webhook: `payment.captured`.
   2. System verifies webhook signature.
   3. System verifies the Razorpay payment ID, order ID, and amount match.
   4. System updates booking status: "payment_pending" → "confirmed."
   5. System creates a payment record with: amount, convenience fee, GST, discount, gateway reference, and status "captured."
   6. System generates a booking confirmation code (8-character alphanumeric).
   7. System generates a QR code from the confirmation code.
   8. System sends booking confirmation SMS to the gamer.
   9. System sends new booking notification SMS to the café owner.
   10. System sends email receipt to the gamer (if email is on file).
   11. User sees the booking confirmation screen with: confirmation code, QR code, café details, session details, and amount paid.

5. **Decision: Payment Failed**
   1. Razorpay sends a webhook: `payment.failed` (or user cancels).
   2. System updates the payment record status to "failed."
   3. Booking remains in "payment_pending" state.
   4. User sees the error screen: "Payment failed. Please try again."
   5. User can tap "Retry Payment" to attempt payment again with the same Razorpay order.
   6. After 3 failed attempts, system cancels the booking: "payment_pending" → "cancelled."

6. **Decision: Payment Timeout**
   1. If no payment event is received within 30 minutes, system runs a background job to expire "payment_pending" bookings.
   2. Booking status: "payment_pending" → "expired."
   3. User is notified: "Your booking has expired. Please create a new booking."

### Idempotency
- Razorpay may send duplicate webhooks. The system must be idempotent: processing the same webhook twice must not create duplicate payment records or double-update booking status.

---

## 6. Post-Booking Experience

### Actors
- Authenticated Gamer
- Café Owner

### Steps

1. **Pre-Session Reminder (T-30 minutes)**
   1. System sends a push notification to the gamer: "Your session at [Café Name] starts in 30 minutes. Booking code: [CODE]."

2. **Gamer Arrives at Café**
   1. Gamer shows the QR code or booking confirmation code to the café staff.
   2. Owner opens the KHEL-O dashboard and navigates to "Today's Bookings."
   3. Owner finds the booking (by scanning QR or searching by code).
   4. Owner taps "Check In."
   5. System updates booking status: "confirmed" → "checked_in."
   6. System creates a session record with start time = now, expected end time = start + duration.
   7. Owner assigns any available machine in the booked hardware tier to the gamer (recorded as optional free-text field).

3. **Session In Progress**
   1. Session is active. Timer counts down in the owner dashboard.
   2. **Decision: Gamer wants to extend session.**
      1. Owner checks if the tier has availability for the next hour(s).
      2. If available, owner extends the session (Could Have feature — MVP: manual adjustment).
   3. **Decision: Gamer leaves early.**
      1. Owner taps "End Session."
      2. System updates session: actual end time = now. Session status: "completed."
      3. No partial refund for early departure in MVP.

4. **Session Ends Naturally**
   1. Expected end time is reached.
   2. System automatically marks session as "completed."
   3. Booking status: "checked_in" → "completed."
   4. System sends a post-session notification to the gamer: "Thanks for playing at [Café Name]! Rate your experience."

5. **Review Submission**
   1. Gamer opens the booking in their history.
   2. Gamer taps "Write a Review."
   3. Gamer submits rating (1–5 stars) and optional text comment (max 500 chars).
   4. System saves the review and updates the café's average rating.
   5. Café owner sees the new review in their dashboard.

6. **No-Show Handling**
   1. If the gamer does not arrive within 15 minutes of session start time:
   2. Owner taps "No-Show" on the booking.
   3. System updates booking status: "confirmed" → "no_show."
   4. No refund is processed (per business rules).
   5. Session is not created.
   6. System sends a notification to the gamer: "You were marked as a no-show for your booking at [Café Name]."

---

## 7. Booking Cancellation (by Gamer)

### Actors
- Authenticated Gamer

### Preconditions
- Booking is in "confirmed" state.

### Steps

1. Gamer opens booking history and selects the upcoming booking.
2. Gamer taps "Cancel Booking."
3. System checks the cancellation policy:
   - **More than 2 hours before session start:** Full refund.
   - **1–2 hours before session start:** 50% refund.
   - **Less than 1 hour before session start:** No refund.
4. System displays cancellation confirmation with the refund amount: "Cancel this booking? You will receive a refund of ₹[amount]."
5. Gamer confirms cancellation.
6. System updates booking status: "confirmed" → "cancelled."
7. System initiates refund via Razorpay (if applicable).
8. System creates a refund record with amount and reason.
9. System sends cancellation SMS to the gamer with refund details.
10. System sends cancellation notification to the café owner.
11. The cancelled slot becomes available for new bookings.

### Error Scenarios
- **Booking already checked in:** Cannot cancel. Display: "This booking has already been checked in and cannot be cancelled."
- **Booking already completed:** Cannot cancel. Display: "This booking has already been completed."
- **Refund processing fails:** Log the error. Mark refund as "pending." Admin is notified for manual intervention. Gamer sees: "Refund initiated. You will receive ₹[amount] within 5–7 business days."

---

## 8. Owner Onboarding

### Actors
- New Café Owner

### Steps

1. User opens the KHEL-O web app and taps "Register as Café Owner" (or "List Your Café").
2. System displays the owner registration form: phone number.
3. User enters their 10-digit Indian mobile number.
4. System sends OTP. User enters OTP. System verifies. (Same as player registration, steps 3–8.)
5. OTP verified. System displays the business profile form:
   - Business name (required).
   - Owner's full name (required).
   - Business address (required).
   - PAN number (required for verification).
   - GST number (optional).
   - Email (required for owner accounts).
6. User fills in the business profile form and taps "Continue."
   - **Error:** Missing required fields → Inline validation errors.
   - **Error:** Invalid PAN format → "Please enter a valid PAN number."
7. System creates the owner account with role "CaféOwner."
8. System redirects the owner to the café setup wizard.

9. **Café Setup Wizard — Step 1: Basic Info**
   - Café name, description, address, city (dropdown), area, phone number.
   - System geocodes the address to get latitude/longitude.

10. **Café Setup Wizard — Step 2: Photos**
    - Upload up to 10 photos. First photo becomes the cover image.
    - Supported formats: JPEG, PNG. Max size: 5 MB per photo.
    - **Error:** File too large → "Photo must be under 5 MB."
    - **Error:** Invalid format → "Please upload JPEG or PNG images only."

11. **Café Setup Wizard — Step 3: Operating Hours**
    - Set opening and closing time for each day of the week.
    - Option to mark specific days as closed.

12. **Café Setup Wizard — Step 4: Amenities**
    - Select from predefined list: AC, Parking, Food & Beverages, Headphones, Webcam, Streaming Setup, Private Booths, Wi-Fi, etc.

13. **Café Setup Wizard — Step 5: Hardware Tiers**
    - Add at least one hardware tier.
    - For each tier: name, GPU, CPU, RAM, monitor size, monitor refresh rate, monitor resolution, quantity, per-hour price.
    - System suggests templates (Standard, Premium, PS5, VIP) that the owner can customize.
    - **Error:** No tiers added → "Please add at least one hardware tier."

14. **Café Setup Wizard — Step 6: Review & Submit**
    - Owner reviews all entered information.
    - Owner taps "Submit for Verification."
    - System saves the café profile with status "pending_verification."
    - System notifies admins that a new café is pending verification.

15. Owner sees a confirmation screen: "Your café has been submitted for verification. This usually takes 24–48 hours. We'll notify you once it's approved."

16. Owner can access their dashboard while waiting, but the café is not visible to gamers until verified.

---

## 9. Owner Creating a Promotion

### Actors
- Verified Café Owner

### Preconditions
- Café is verified and active.
- At least one hardware tier exists.

### Steps

1. Owner navigates to "Promotions" in their dashboard.
2. Owner taps "Create Promotion."
3. System displays the promotion creation form:
   - Title (required, max 100 chars). Example: "Weekday Afternoon Special."
   - Description (optional, max 500 chars). Example: "30% off on Premium Tier PCs, Mon–Fri, 2–5 PM."
   - Hardware Tier (dropdown, select one).
   - Discount Percentage (required, 5%–50%).
   - Start Date (required, must be today or future).
   - End Date (required, must be after start date, max 30 days from start).
   - Applicable Days (multi-select: Mon, Tue, Wed, Thu, Fri, Sat, Sun).
   - Time Window — Start Time (required).
   - Time Window — End Time (required, must be after start time).

4. Owner fills in the form and taps "Preview."
5. System validates:
   - **Error:** Discount > 50% → "Maximum discount allowed is 50%."
   - **Error:** End date before start date → "End date must be after start date."
   - **Error:** Time window end before start → "End time must be after start time."
   - **Error:** Overlapping with existing active promotion for the same tier and time window → "A promotion already exists for [Tier Name] during this time. Please adjust the time or tier."
   - **Error:** Promotion duration > 30 days → "Promotions can run for a maximum of 30 days."

6. System displays a preview of how the promotion will appear to gamers.
7. Owner taps "Publish."
8. System creates the promotion with status "active."
9. System triggers the `PromotionPublished` event.
10. System sends push notifications to nearby gamers: "[Café Name] is offering 30% off on Premium Tier, 2–5 PM. Book now!"
11. Promotion appears on the café profile page and in the gamer's home feed.

### Managing Existing Promotions

- **Pause:** Owner can pause an active promotion. Status: "active" → "paused." Paused promotions are not visible to gamers and do not apply discounts.
- **Resume:** Owner can resume a paused promotion. Status: "paused" → "active."
- **End Early:** Owner can end a promotion before the end date. Status: "active" → "ended."
- **Auto-Expire:** System automatically sets status to "expired" when end date is reached.

---

## 10. Owner Managing Bookings

### Actors
- Verified Café Owner

### Steps

1. Owner opens their dashboard and navigates to "Bookings."
2. System displays today's bookings by default, sorted by start time:
   - Each booking shows: gamer name, hardware tier, start time, end time, booking code, status, and amount.
   - Status filter: All, Upcoming, Checked In, Completed, No-Show, Cancelled.
   - Date filter: Calendar picker.

3. **Upcoming Booking → Check In**
   1. Gamer arrives. Owner locates the booking (search by code or browse list).
   2. Owner taps "Check In."
   3. System updates booking status: "confirmed" → "checked_in."
   4. System creates a session record.
   5. Owner optionally enters the assigned machine identifier (e.g., "PC-07").

4. **Upcoming Booking → No-Show**
   1. 15 minutes past session start, gamer has not arrived.
   2. Owner taps "Mark No-Show."
   3. System prompts: "Mark [Gamer Name] as no-show? No refund will be processed."
   4. Owner confirms.
   5. Booking status: "confirmed" → "no_show."

5. **Checked In → End Session**
   1. Gamer finishes and leaves early, or session time ends.
   2. If session time ends naturally, system auto-completes.
   3. If gamer leaves early, owner taps "End Session."
   4. Booking status: "checked_in" → "completed."

6. **View Booking Details**
   1. Owner taps on any booking to see full details: gamer name, phone (masked), tier, time, amount, payment status, promotion applied (if any).

---

## 11. Admin Verifying a Café

### Actors
- Admin

### Preconditions
- A café has been submitted for verification (status: "pending_verification").

### Steps

1. Admin logs into the admin panel.
2. Admin navigates to "Café Verifications."
3. System displays a list of cafés pending verification, sorted by submission date (oldest first).
4. Admin selects a café to review.
5. System displays the full café profile submitted by the owner:
   - Business details: owner name, business name, PAN, GST, address.
   - Café details: name, description, photos, operating hours, amenities.
   - Hardware tiers: specs, pricing, quantity.
6. Admin reviews the information.

7. **Decision: Approve**
   1. Admin taps "Approve."
   2. System prompts: "Approve [Café Name]? It will become visible to gamers."
   3. Admin confirms.
   4. System updates café status: "pending_verification" → "verified."
   5. System triggers the `CaféVerified` event.
   6. System sends SMS to the owner: "Congratulations! Your café [Café Name] has been verified and is now live on KHEL-O."
   7. System sends email to the owner with a link to their live café profile.

8. **Decision: Reject**
   1. Admin taps "Reject."
   2. System prompts for a rejection reason (required text field).
   3. Admin enters the reason (e.g., "Photos do not match the claimed hardware. Please upload updated photos.").
   4. Admin confirms.
   5. System updates café status: "pending_verification" → "rejected."
   6. System sends SMS to the owner: "Your café [Café Name] verification was not approved. Reason: [reason]. Please update your profile and resubmit."
   7. Owner can update their profile and resubmit. Status: "rejected" → "pending_verification."

9. **Decision: Request More Information**
   1. Admin taps "Request Info."
   2. Admin enters the information needed (e.g., "Please upload a photo of your PS5 setup.").
   3. System updates café status: "pending_verification" → "info_requested."
   4. System notifies the owner.
   5. Owner provides additional info and resubmits. Status: "info_requested" → "pending_verification."

### Error Scenarios
- **Admin tries to verify a café that is already verified:** System prevents the action: "This café is already verified."
- **Admin tries to verify a café that has been suspended:** System prevents the action: "This café has been suspended and cannot be verified."

---

## 12. Flow Summary Matrix

| Flow | Primary Actor | Trigger | Key Decision Points | Happy Path End State |
|------|--------------|---------|--------------------|--------------------|
| Player Registration | Gamer | User opens app | OTP verification, new vs returning user | Account created, user on home screen |
| Café Discovery | Gamer | User on home screen | Search, filter, sort, map vs list | User on café profile page |
| Café Profile | Gamer | User taps café card | Book Now, view reviews, get directions | User starts booking flow |
| Make a Reservation | Gamer | User taps "Book Now" | Date, time, tier, availability check | Booking in "payment_pending" state |
| Payment | Gamer + Razorpay | Booking created | Payment success, failure, or timeout | Booking "confirmed," SMS sent |
| Post-Booking | Gamer + Owner | Session time approaches | Check-in, no-show, early departure, extension | Session "completed," review submitted |
| Cancellation | Gamer | User taps "Cancel" | Refund policy tier (full, partial, none) | Booking "cancelled," refund initiated |
| Owner Onboarding | Owner | User taps "List Your Café" | OTP, business info, café setup wizard | Café submitted for verification |
| Create Promotion | Owner | Owner taps "Create Promotion" | Validation, overlap check, preview | Promotion "active," gamers notified |
| Manage Bookings | Owner | Owner opens dashboard | Check-in, no-show, end session | Booking states managed |
| Admin Verification | Admin | New café submitted | Approve, reject, request info | Café "verified" or "rejected" |
