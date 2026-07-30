# KHEL-O — Gaming Café Marketplace & Demand Generation Platform

KHEL-O is a marketplace and demand-generation platform for gaming cafés in India. The core problem we solve is filling empty gaming PCs during off-peak hours (weekday mornings & afternoons).

---

## ⚡ Quick Start: Clone & Run Locally

### 1. Clone the Repository

```bash
git clone https://github.com/Butcherboy7/khel-o.git
cd khel-o
```

### 2. Start Everything with Docker Compose (Recommended)

Run the entire application stack (PostgreSQL database, FastAPI backend, Next.js frontend, and pgAdmin) in one command:

```bash
docker compose up --build -d
```

### 3. Application URLs & Service Ports

- **Frontend Application (PWA):** [http://localhost:3002](http://localhost:3002)
- **Backend API Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Backend Health Check:** [http://localhost:8000/health](http://localhost:8000/health)
- **pgAdmin Management:** [http://localhost:5050](http://localhost:5050) (Login: `admin@khelo.in` / `adminpassword`)

---

## 🔐 One-Click Quick Demo Credentials

All demo accounts are pre-seeded automatically in PostgreSQL with password `testpass123`:

| Role | Email | Purpose / Direct Actions |
|------|-------|--------------------------|
| **🎮 Gamer (Customer)** | `test@example.com` | Explore venues, pick slots, pay & generate QR code |
| **🏪 Café Owner** | `owner@example.com` | Manage cafe details, hardware tiers, flash promos, payouts |
| **🎫 Café Staff** | `staff@example.com` | Scan customer QR codes & verify check-ins |
| **🛡️ Platform Admin** | `admin@example.com` | Approve pending cafe onboarding applications |

---

## 🛒 Complete Customer Checkout Flow

To test the complete customer booking and payment checkout flow:

1. **Log in as Gamer**: Go to `http://localhost:3002/login` and click **🎮 Gamer**.
2. **Explore Venues**: Go to `http://localhost:3002/` and click **Book Now** on a venue (e.g., *LXG Esports Arena*).
3. **Select Hardware Tier & Time Slot (Step 1 & 2)**:
   - On the venue page (`http://localhost:3002/cafes/<id>`), choose a hardware tier (e.g. *Flagship RTX 4080 Tier*) and click **Book Gaming Slot**.
   - Pick your **Date**, **Time Slot** (Morning, Afternoon, Evening, Night), and **Duration** (e.g. 2 hrs).
   - Click the green **Continue to Booking Review** button.
4. **Review & Pay (Step 3)**:
   - Review your live price summary, applied flash discounts, platform fees, and total payable amount.
   - Click **Confirm and Pay ₹XXX.XX**.
5. **Receive QR Pass**:
   - Razorpay payment modal pops up (or sandbox auto-verifies).
   - Once confirmed, you are immediately routed to your **Booking Confirmation Pass** featuring a live **QR Code**.

---

## 🛠 Local Setup (Without Docker)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -e .
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev -p 3002
```

---

## 📚 Documentation Map (`/docs`)

All system architecture, product rules, and API specifications are located in the `/docs` directory:

| Document | Title & Purpose |
|----------|-----------------|
| [00-README.md](docs/00-README.md) | **Docs Index:** Navigation & guide for reading documents. |
| [01-product-vision.md](docs/01-product-vision.md) | **Product Vision:** Problem statement, solution, and philosophy. |
| [02-prd.md](docs/02-prd.md) | **PRD:** Features, MoSCoW prioritization, and MVP scope. |
| [03-srs.md](docs/03-srs.md) | **SRS:** Functional & non-functional requirements. |
| [06-domain-model.md](docs/06-domain-model.md) | **Domain Model:** Source of truth for database and entity models. |
| [10-database-design.md](docs/10-database-design.md) | **Database Design:** PostgreSQL schemas and Alembic migration guide. |
| [12-api-spec.md](docs/12-api-spec.md) | **API Spec:** Endpoint list, parameters, and payloads. |
| [13-backend-architecture.md](docs/13-backend-architecture.md) | **Backend Architecture:** Modular monolith design and layer rules. |
| [14-frontend-architecture.md](docs/14-frontend-architecture.md) | **Frontend Architecture:** Next.js 14 App Router, PWA, and components. |
| [15-authentication.md](docs/15-authentication.md) | **Authentication:** Google OAuth 2.0 & Email/Password authentication. |
| [16-payments.md](docs/16-payments.md) | **Payments:** Razorpay zero-fee pass-through integration. |
