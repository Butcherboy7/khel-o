# Database Design — KHEL-O

## Overview

This document presents the complete database design for the KHEL-O platform. It provides three progressive versions:

- **v0: Simple Flat Design** — Fastest MVP launch, minimal joins, simple structure.
- **v1: Normalized Relational Design** — Standard 3NF design with clean separation of concerns and proper foreign key constraints.
- **v2: Optimized Production Design** — Adds performance indexes, soft deletes, partitioning strategy, and audit fields.

All designs use **PostgreSQL 15+** with standard conventions:
- `snake_case` for all table and column names.
- Plural table names (e.g., `users`, `cafes`, `bookings`).
- All monetary values stored as `INTEGER` in **paisa** (1 INR = 100 paisa).
- All timestamps in `TIMESTAMPTZ` (UTC).

---

## 1. Version 0 — Simple Flat Design (Fast MVP)

### Rationale
v0 minimizes joins and complexity for ultra-fast MVP shipping. Denormalized fields store display names and JSON blobs directly on parent tables.

### Table Definitions

```sql
-- Users table (gamers, owners, admins combined)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(255),
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('gamer', 'cafe_owner', 'admin')),
    city VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    business_name VARCHAR(200), -- owner only
    pan_number VARCHAR(10),     -- owner only
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cafes table
CREATE TABLE cafes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    address VARCHAR(500) NOT NULL,
    city VARCHAR(100) NOT NULL,
    area VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    photos JSONB DEFAULT '[]'::jsonb,
    amenities JSONB DEFAULT '[]'::jsonb,
    operating_hours JSONB NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    average_rating DECIMAL(3, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hardware Tiers table
CREATE TABLE hardware_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    gpu_model VARCHAR(100) NOT NULL,
    cpu_model VARCHAR(100),
    ram_gb INT,
    monitor_refresh_rate INT,
    quantity INT NOT NULL,
    price_per_hour INT NOT NULL, -- in paisa
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Promotions table
CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    hardware_tier_id UUID NOT NULL REFERENCES hardware_tiers(id),
    title VARCHAR(100) NOT NULL,
    discount_percentage INT NOT NULL CHECK (discount_percentage BETWEEN 5 AND 50),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    applicable_days JSONB NOT NULL,
    time_window_start TIME NOT NULL,
    time_window_end TIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bookings table
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gamer_id UUID NOT NULL REFERENCES users(id),
    cafe_id UUID NOT NULL REFERENCES cafes(id),
    hardware_tier_id UUID NOT NULL REFERENCES hardware_tiers(id),
    promotion_id UUID REFERENCES promotions(id),
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_hours INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'payment_pending',
    confirmation_code VARCHAR(8),
    base_amount INT NOT NULL,        -- in paisa
    discount_amount INT DEFAULT 0,  -- in paisa
    convenience_fee INT NOT NULL,   -- in paisa
    gst_amount INT NOT NULL,        -- in paisa
    total_amount INT NOT NULL,      -- in paisa
    razorpay_order_id VARCHAR(50),
    razorpay_payment_id VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reviews table
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID UNIQUE NOT NULL REFERENCES bookings(id),
    gamer_id UUID NOT NULL REFERENCES users(id),
    cafe_id UUID NOT NULL REFERENCES cafes(id),
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 2. Version 1 — Normalized Relational Design

### Rationale
v1 introduces clean normalization (3NF), separating profile entities, detailed payment transactions, and sessions.

### ER Diagram (Text)

```
users (1) <--- (1) gamer_profiles
users (1) <--- (1) owner_profiles
users (1) <--- (1) admin_profiles
owner_profiles (1) <--- (*) cafes
cafes (1) <--- (*) hardware_tiers
cafes (1) <--- (*) promotions
hardware_tiers (1) <--- (*) promotions
hardware_tiers (1) <--- (*) bookings
bookings (1) <--- (1) payments
bookings (1) <--- (0..1) sessions
bookings (1) <--- (0..1) reviews
users (1) <--- (*) notifications
```

### Table Definitions

```sql
-- Core Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    name VARCHAR(100) NOT NULL,
    profile_photo_url VARCHAR(500),
    city VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('gamer', 'cafe_owner', 'admin')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned', 'deleted')),
    is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- Gamer Profiles
CREATE TABLE gamer_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferred_tier VARCHAR(50),
    total_bookings INT NOT NULL DEFAULT 0,
    total_spent INT NOT NULL DEFAULT 0, -- in paisa
    referral_code VARCHAR(10) UNIQUE,
    referred_by UUID REFERENCES users(id)
);

-- Owner Profiles
CREATE TABLE owner_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(200) NOT NULL,
    pan_number VARCHAR(10) NOT NULL,
    gst_number VARCHAR(15),
    business_address VARCHAR(500) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ
);

-- Admin Profiles
CREATE TABLE admin_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    mfa_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    mfa_secret VARCHAR(100)
);

-- Cafes
CREATE TABLE cafes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES owner_profiles(user_id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    address VARCHAR(500) NOT NULL,
    city VARCHAR(100) NOT NULL,
    area VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    photos JSONB DEFAULT '[]'::jsonb,
    amenities JSONB DEFAULT '[]'::jsonb,
    operating_hours JSONB NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_verification', 'info_requested', 'verified', 'rejected', 'suspended', 'temporarily_closed')),
    verification_notes TEXT,
    average_rating DECIMAL(3, 2) NOT NULL DEFAULT 0.00,
    total_reviews INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hardware Tiers
CREATE TABLE hardware_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    gpu_model VARCHAR(100) NOT NULL,
    cpu_model VARCHAR(100),
    ram_gb INT,
    monitor_size VARCHAR(20),
    monitor_refresh_rate INT,
    monitor_resolution VARCHAR(20),
    quantity INT NOT NULL CHECK (quantity > 0),
    price_per_hour INT NOT NULL CHECK (price_per_hour >= 2000), -- in paisa
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cafe_tier_name UNIQUE (cafe_id, name)
);

-- Promotions
CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    hardware_tier_id UUID NOT NULL REFERENCES hardware_tiers(id),
    title VARCHAR(100) NOT NULL,
    description TEXT,
    discount_percentage INT NOT NULL CHECK (discount_percentage BETWEEN 5 AND 50),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    applicable_days JSONB NOT NULL,
    time_window_start TIME NOT NULL,
    time_window_end TIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended', 'expired')),
    total_bookings_generated INT NOT NULL DEFAULT 0,
    total_revenue_generated INT NOT NULL DEFAULT 0, -- in paisa
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_promo_dates CHECK (end_date >= start_date)
);

-- Bookings
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gamer_id UUID NOT NULL REFERENCES users(id),
    cafe_id UUID NOT NULL REFERENCES cafes(id),
    hardware_tier_id UUID NOT NULL REFERENCES hardware_tiers(id),
    promotion_id UUID REFERENCES promotions(id),
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_hours INT NOT NULL CHECK (duration_hours BETWEEN 1 AND 6),
    status VARCHAR(30) NOT NULL DEFAULT 'payment_pending' CHECK (status IN ('payment_pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show', 'expired')),
    confirmation_code VARCHAR(8) UNIQUE,
    qr_code_url VARCHAR(500),
    base_amount INT NOT NULL,       -- in paisa
    discount_amount INT NOT NULL DEFAULT 0, -- in paisa
    convenience_fee INT NOT NULL,  -- in paisa
    gst_amount INT NOT NULL,       -- in paisa
    total_amount INT NOT NULL,     -- in paisa
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    checked_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    razorpay_order_id VARCHAR(50) NOT NULL,
    razorpay_payment_id VARCHAR(50),
    razorpay_signature VARCHAR(200),
    amount INT NOT NULL, -- in paisa
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    convenience_fee INT NOT NULL,
    gst_amount INT NOT NULL,
    discount_amount INT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refund_initiated', 'refunded', 'partially_refunded')),
    payment_method VARCHAR(50),
    refund_amount INT DEFAULT 0,
    refund_id VARCHAR(50),
    refund_status VARCHAR(20),
    refund_reason VARCHAR(200),
    idempotency_key VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID UNIQUE NOT NULL REFERENCES bookings(id),
    cafe_id UUID NOT NULL REFERENCES cafes(id),
    gamer_id UUID NOT NULL REFERENCES users(id),
    hardware_tier_id UUID NOT NULL REFERENCES hardware_tiers(id),
    assigned_machine VARCHAR(50),
    start_time TIMESTAMPTZ NOT NULL,
    expected_end_time TIMESTAMPTZ NOT NULL,
    actual_end_time TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'terminated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reviews
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID UNIQUE NOT NULL REFERENCES bookings(id),
    gamer_id UUID NOT NULL REFERENCES users(id),
    cafe_id UUID NOT NULL REFERENCES cafes(id),
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'flagged', 'removed')),
    flagged_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('sms', 'email', 'push', 'in_app')),
    title VARCHAR(200),
    body TEXT NOT NULL,
    metadata JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. Version 2 — Optimized Production Design

### Rationale
v2 adds performance indexes, soft deletes (`deleted_at`), partition strategies for high-growth tables (`bookings`, `notifications`), and spatial indexing for geo-queries.

### Added Performance & Architectural Enhancements

1. **PostGIS Extensions / Spatial Indexing:** Using PostgreSQL `cube` & `earthdistance` or standard Composite B-Tree indexes on `(latitude, longitude)` for fast radius searches.
2. **Soft Deletes:** `deleted_at TIMESTAMPTZ` added to key entities.
3. **Partitioning:** `bookings` table partitioned by range on `booking_date` (monthly partitions).
4. **Targeted Indexes:** Covering indexes for critical read operations (availability check, search, promo lookup).

### Complete Production Schema DDL (v2)

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    name VARCHAR(100) NOT NULL,
    profile_photo_url VARCHAR(500),
    city VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('gamer', 'cafe_owner', 'admin')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned', 'deleted')),
    is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_users_phone ON users(phone_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role_status ON users(role, status) WHERE deleted_at IS NULL;

-- Gamer Profiles
CREATE TABLE gamer_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferred_tier VARCHAR(50),
    total_bookings INT NOT NULL DEFAULT 0,
    total_spent INT NOT NULL DEFAULT 0,
    referral_code VARCHAR(10) UNIQUE,
    referred_by UUID REFERENCES users(id)
);

-- Owner Profiles
CREATE TABLE owner_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(200) NOT NULL,
    pan_number VARCHAR(10) NOT NULL,
    gst_number VARCHAR(15),
    business_address VARCHAR(500) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ
);

-- Cafes
CREATE TABLE cafes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES owner_profiles(user_id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    address VARCHAR(500) NOT NULL,
    city VARCHAR(100) NOT NULL,
    area VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    photos JSONB DEFAULT '[]'::jsonb,
    amenities JSONB DEFAULT '[]'::jsonb,
    operating_hours JSONB NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_verification', 'info_requested', 'verified', 'rejected', 'suspended', 'temporarily_closed')),
    verification_notes TEXT,
    average_rating DECIMAL(3, 2) NOT NULL DEFAULT 0.00,
    total_reviews INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Discovery & Location Indexes
CREATE INDEX idx_cafes_city_status ON cafes(city, status) WHERE deleted_at IS NULL AND is_active = TRUE;
CREATE INDEX idx_cafes_location ON cafes(latitude, longitude);
CREATE INDEX idx_cafes_owner ON cafes(owner_id);

-- Hardware Tiers
CREATE TABLE hardware_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    gpu_model VARCHAR(100) NOT NULL,
    cpu_model VARCHAR(100),
    ram_gb INT,
    monitor_size VARCHAR(20),
    monitor_refresh_rate INT,
    monitor_resolution VARCHAR(20),
    quantity INT NOT NULL CHECK (quantity > 0),
    price_per_hour INT NOT NULL CHECK (price_per_hour >= 2000),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_cafe_tier_name UNIQUE (cafe_id, name)
);

CREATE INDEX idx_hw_tiers_cafe_active ON hardware_tiers(cafe_id, is_active) WHERE deleted_at IS NULL;

-- Promotions
CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    hardware_tier_id UUID NOT NULL REFERENCES hardware_tiers(id),
    title VARCHAR(100) NOT NULL,
    description TEXT,
    discount_percentage INT NOT NULL CHECK (discount_percentage BETWEEN 5 AND 50),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    applicable_days JSONB NOT NULL,
    time_window_start TIME NOT NULL,
    time_window_end TIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended', 'expired')),
    total_bookings_generated INT NOT NULL DEFAULT 0,
    total_revenue_generated INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_promotions_active_lookup ON promotions(cafe_id, hardware_tier_id, status, start_date, end_date) WHERE status = 'active';

-- Bookings (Partitioned Table Strategy)
CREATE TABLE bookings (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    gamer_id UUID NOT NULL,
    cafe_id UUID NOT NULL,
    hardware_tier_id UUID NOT NULL,
    promotion_id UUID,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_hours INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'payment_pending',
    confirmation_code VARCHAR(8),
    qr_code_url VARCHAR(500),
    base_amount INT NOT NULL,
    discount_amount INT NOT NULL DEFAULT 0,
    convenience_fee INT NOT NULL,
    gst_amount INT NOT NULL,
    total_amount INT NOT NULL,
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    checked_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, booking_date)
) PARTITION BY RANGE (booking_date);

-- Partition Examples
CREATE TABLE bookings_2026_01 PARTITION OF bookings
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE bookings_2026_02 PARTITION OF bookings
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Indexes on Partitioned Bookings Table
CREATE INDEX idx_bookings_availability ON bookings(hardware_tier_id, booking_date, start_time, end_time, status);
CREATE INDEX idx_bookings_gamer ON bookings(gamer_id, booking_date);
CREATE INDEX idx_bookings_cafe_status ON bookings(cafe_id, status, booking_date);
CREATE INDEX idx_bookings_confirmation ON bookings(confirmation_code) WHERE confirmation_code IS NOT NULL;

-- Payments
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    booking_date DATE NOT NULL,
    razorpay_order_id VARCHAR(50) NOT NULL,
    razorpay_payment_id VARCHAR(50),
    razorpay_signature VARCHAR(200),
    amount INT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    convenience_fee INT NOT NULL,
    gst_amount INT NOT NULL,
    discount_amount INT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'created',
    payment_method VARCHAR(50),
    refund_amount INT DEFAULT 0,
    refund_id VARCHAR(50),
    refund_status VARCHAR(20),
    refund_reason VARCHAR(200),
    idempotency_key VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (booking_id, booking_date) REFERENCES bookings(id, booking_date) ON DELETE CASCADE
);

CREATE INDEX idx_payments_razorpay_order ON payments(razorpay_order_id);
CREATE INDEX idx_payments_status ON payments(status);

-- Sessions
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    booking_date DATE NOT NULL,
    cafe_id UUID NOT NULL REFERENCES cafes(id),
    gamer_id UUID NOT NULL REFERENCES users(id),
    hardware_tier_id UUID NOT NULL REFERENCES hardware_tiers(id),
    assigned_machine VARCHAR(50),
    start_time TIMESTAMPTZ NOT NULL,
    expected_end_time TIMESTAMPTZ NOT NULL,
    actual_end_time TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (booking_id, booking_date) REFERENCES bookings(id, booking_date)
);

CREATE INDEX idx_sessions_active ON sessions(cafe_id, status) WHERE status = 'active';

-- Reviews
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    booking_date DATE NOT NULL,
    gamer_id UUID NOT NULL REFERENCES users(id),
    cafe_id UUID NOT NULL REFERENCES cafes(id),
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'published',
    flagged_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (booking_id, booking_date) REFERENCES bookings(id, booking_date)
);

CREATE INDEX idx_reviews_cafe_status ON reviews(cafe_id, status, rating);
```
