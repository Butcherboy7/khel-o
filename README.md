# KHEL-O — Gaming Café Marketplace & Demand Generation Platform

KHEL-O is a marketplace and demand-generation platform for gaming cafés in India. The core problem we solve is filling empty gaming PCs during off-peak hours (weekday mornings & afternoons).

---

## 🚀 Getting Started

### Prerequisites

- **Python:** 3.11+
- **Node.js:** 18+
- **Docker & Docker Compose:** Installed and running
- **PostgreSQL:** 15+ (if running locally without Docker)

---

## 🐳 Quick Start with Docker Compose

Run the entire stack (PostgreSQL database, FastAPI backend, and pgAdmin) with a single command:

```bash
docker-compose up --build
```

- **Backend API:** [http://localhost:8000](http://localhost:8000)
- **Health Check:** [http://localhost:8000/health](http://localhost:8000/health)
- **Interactive Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **pgAdmin Management:** [http://localhost:5050](http://localhost:5050) (Login: `admin@khelo.in` / `adminpassword`)

---

## 🛠 Local Development Setup

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt # or pip install -e .

# Copy environment variables
cp ../.env.example .env

# Run database migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup (PWA)

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

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
