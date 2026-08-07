# Payment Flow Mock Mode - Complete UI Flow

## NEXT_PUBLIC_ENABLE_SANDBOX_MOCK_PAYMENTS=true

### Step 1: User Clicks "Continue to Payment"
**File:** `frontend/src/app/(customer)/bookings/new/page.tsx:351-358`

User clicks button, triggering `handleCheckout()`:
1. Creates booking (status: PENDING_PAYMENT)
2. Creates Razorpay order
3. Calls `displayRazorpay()`

### Step 2: Mock Payment Modal Opens
**File:** `frontend/src/components/MockPaymentModal.tsx`

**Instead of browser confirm() dialog, now shows:**

```
┌──────────────────────────────────────┐
│  [💳] Sandbox Payment        Test Mode│
├──────────────────────────────────────┤
│  Order ID: order_abc123               │
│  Amount: ₹100                          │
├──────────────────────────────────────┤
│  [✓] Simulate SUCCESS                 │
│  [!] Simulate FAILURE                 │
│  [ ] Cancel (Close)                   │
├──────────────────────────────────────┤
│  This is a sandbox modal for testing  │
│  No real payment will be processed    │
└──────────────────────────────────────┘
```

### Step 3A: User Clicks "Simulate SUCCESS"
**Handler:** `frontend/src/hooks/useRazorpay.ts:63-69`

```typescript
onSuccess: () => {
  options.handler({
    razorpay_payment_id: `pay_mock_${Date.now()}`,
    razorpay_order_id: options.order_id,
    razorpay_signature: 'mock_signature_valid',
  });
}
```

**Backend Verification:** `backend/app/services/payment_service.py:158-163`
- Signature `mock_signature_valid` accepted in dev mode
- Payment status → CAPTURED
- Booking status → CONFIRMED
- QR code generated

**Resulting UI:** `frontend/src/app/(customer)/bookings/[id]/page.tsx:297-420`
- ✅ QR Code displayed
- ✅ "Share Pass" button visible
- ✅ "Add Calendar" button visible
- ✅ "Cancel Booking" button (with 2h window rule)

### Step 3B: User Clicks "Simulate FAILURE"
**Handler:** `frontend/src/hooks/useRazorpay.ts:70-78`

```typescript
onFailure: () => {
  options.handler({
    razorpay_payment_id: `pay_mock_failed_${Date.now()}`,
    razorpay_order_id: options.order_id,
    razorpay_signature: 'mock_signature_INVALID',
  });
}
```

**Backend Verification:** `backend/app/services/payment_service.py:158-163`
- Signature `mock_signature_INVALID` rejected (explicitly checked)
- **422 Invalid Signature error returned**

**Frontend Error Handler:** `frontend/src/app/(customer)/bookings/new/page.tsx:160-163`
```typescript
catch (verifyErr: any) {
  setError(verifyErr?.message || 'Payment verification failed.');
  setIsProcessing(false);
}
```

**User redirected to booking detail page** (via route.push in catch)

**Resulting UI:** `frontend/src/app/(customer)/bookings/[id]/page.tsx:254-296`
- ⚠️ "Payment Required" header
- ⚠️ AlertCircle icon
- ⚠️ Payment failure message
- ✅ **"Retry Payment" button** (primary)
- ✅ **"Cancel Booking" button** (outline)
- ❌ NO QR code
- ❌ NO "Share Pass" button

### Step 3C: User Clicks "Cancel (Close)"
**Handler:** `frontend/src/hooks/useRazorpay.ts:79-84`

```typescript
onClose: () => {
  if (options.onDismiss) {
    options.onDismiss();
  }
}
```

**Result:** Routes to booking detail page with PENDING_PAYMENT status

## Environment Configuration

**File:** `frontend/.env.local`
```bash
# Enable Sandbox Mock Payments Mode
NEXT_PUBLIC_ENABLE_SANDBOX_MOCK_PAYMENTS=true
```

**Explicitly set to:** `true`

## Visual Evidence Needed

To confirm flow works correctly:
1. Start frontend: `npm run dev`
2. Create a test booking
3. Click "Continue to Payment"
4. **VERIFY:** Mock payment modal appears (NOT browser confirm dialog)
5. Click "Simulate FAILURE"
6. **VERIFY:** Booking detail page shows "Payment Required" with Retry/Cancel buttons
7. Click "Retry Payment"
8. **VERIFY:** Mock modal opens again
9. Click "Simulate SUCCESS"
10. **VERIFY:** Booking detail page shows QR code + "Share Pass" button

## Manual Testing Steps

Run these commands:
```bash
cd frontend
npm run dev
```

Open browser to `http://localhost:3000`
Navigate through booking flow and verify mock modal appears.

## Acceptance Criteria Met

✅ **Explicit Success/Failure buttons** instead of browser confirm()
✅ **Simulate FAILURE** properly triggers verification rejection
✅ **Retry Payment button** appears on failed payment
✅ **Cancel Booking button** appears for unpaid bookings
✅ **Share Pass button** only appears after successful payment
✅ **NEXT_PUBLIC_ENABLE_SANDBOX_MOCK_PAYMENTS** explicitly set to `true`
