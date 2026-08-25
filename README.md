# MAY2026 Team 041 (Consolidated README)

This is a **single-file, shareable README** for the MAY2026 Team 041 project. You can send this file independently without requiring access to the repository structure.

---

## 1) Project Summary

**MAY2026 Team 041** is a community library management platform with a FastAPI backend and React frontend.

It supports:
- Role-based login and dashboards (Admin, Manager, Librarian, Member, Guardian, IT Head)
- Book catalog, borrowing, reservations, and seat booking
- Community reading club, reviews, and a leaderboard
- Fee/fine tracking and Razorpay payments for memberships
- Guardian-linked accounts for tracking a child's reading and dues
- An AI chatbot assistant, AI-generated book insights (summary/difficulty/themes),
  AI reading-level detection, a personal AI reading profile, AI-powered "similar books"
  recommendations, and staff-facing AI demand-forecast/late-return-risk insights — all
  backed by a swappable LLM provider (OpenAI, AWS Bedrock, or local Ollama)

---

## 2) Tech Stack and What Each Tool Is Used For

### Backend
- **Python 3.12+** — backend runtime language
- **FastAPI** — REST API framework
- **uv** — Python dependency/environment management
- **Prisma (prisma-client-py)** — ORM, schema, and DB migrations
- **PostgreSQL** — primary relational database
- **Redis** — chatbot conversation history store
- **PyJWT + bcrypt** — JWT authentication and password hashing
- **google-auth** — Google login token verification
- **Razorpay SDK** — payment integration for online membership fees
- **LangChain (+ langchain-openai / langchain-aws / langchain-ollama)** — unified interface
  to the configured LLM provider, used by the chatbot, book insights, reading-level
  detection, reading profiles, embedding-based "similar books", and manager AI insights
- **deep-translator** — UI content translation demo endpoint
- **slowapi** — rate limiting on AI/LLM-backed endpoints
- **Uvicorn** — ASGI server (dev and production)

### Frontend
- **React 19** — frontend UI framework
- **Vite** — dev server and build tool
- **TypeScript** — type-safe frontend development
- **TanStack Query** — server-state caching/fetching
- **React Router** — client-side routing
- **React Hook Form + Zod** — form state and validation
- **Tailwind CSS v4** — utility-first styling
- **Framer Motion** — animation
- **i18next / react-i18next** — multi-language UI (English/Hindi/Punjabi)
- **jsPDF + jspdf-autotable** — client-side PDF export (reports, receipts)
- **Sonner** — toast notifications
- **Lucide React** — icon library

### Testing / Dev Tooling
- **Pytest** — backend test suite
- **Vitest + Testing Library** — frontend unit/component tests
- **Playwright** — end-to-end browser tests against a real backend + DB
- **Ruff + mypy** — backend linting and type checking
- **ESLint + Prettier** — frontend linting and formatting
- **Docker Compose** — local PostgreSQL + Redis
- **Make** — common developer commands

### Deployment / Hosting
No hosting provider is wired up yet — see [§5 Deployment Guide](#5-deployment-guide) for
the platform-agnostic notes on how each piece is meant to be deployed.

---

## 3) Architecture & Diagrams

### 3.1 System Architecture

```mermaid
flowchart LR
    subgraph Client
        FE["React 19 + Vite<br/>Frontend"]
    end

    subgraph Server
        BE["FastAPI Backend<br/>/api/v1"]
    end

    PG[("PostgreSQL<br/>via Prisma")]
    RD[("Redis")]
    LLM{{"LLM Provider<br/>OpenAI / Bedrock / Ollama"}}
    GA["Google OAuth"]
    RP["Razorpay"]

    FE -->|"HTTPS + JWT"| BE
    BE --> PG
    BE -->|"chat history"| RD
    BE -->|"chatbot, book insights,<br/>recommendations, AI ops insights"| LLM
    BE -->|"token verification"| GA
    BE -->|"membership payments"| RP
```

The frontend never talks to Postgres, Redis, or the LLM provider directly — every
integration is proxied through the FastAPI backend, which is the only service holding
credentials for them. Every LLM-backed feature is designed to degrade gracefully (see
[§3.4](#34-ai-feature-request-flow)) rather than break the rest of the app if that
provider is unreachable.

### 3.2 Code Structure

```mermaid
flowchart TD
    Root["MAY2026-Team-041/"]
    Root --> Backend["backend/"]
    Root --> Frontend["frontend/"]
    Root --> Assets["assets/"]
    Root --> Compose["docker-compose.yml"]

    Backend --> BApp["src/app/"]
    Backend --> BPrisma["prisma/  (schema.prisma + migrations/)"]
    Backend --> BTests["tests/"]
    Backend --> BScripts["scripts/  (seed &amp; backfill jobs)"]

    BApp --> BApi["api/  (auth dependency, role guards)"]
    BApp --> BCore["core/  (config, security, llm)"]
    BApp --> BDb["db/  (Prisma client, pagination)"]
    BApp --> BModules["modules/  (30 feature modules)"]

    BModules --> BM1["catalog &amp; transactions:<br/>books, loans, reservations, seat_booking,<br/>reviews, wishlist, library_reviews, book_records"]
    BModules --> BM2["staff &amp; ops:<br/>manager, admin, it_head, guardian,<br/>audit_log, permission_requests, support_tickets"]
    BModules --> BM3["billing &amp; growth:<br/>payments, pricing_plans, coupons,<br/>billing_requests, leaderboard, events"]
    BModules --> BM4["AI-backed:<br/>chat, recommendations, translate<br/>(book insights live inside books/)"]

    Frontend --> FSrc["src/"]
    FSrc --> FApp["app/  (router, layouts, route guards)"]
    FSrc --> FComponents["components/  (ui/, layout/, common/)"]
    FSrc --> FFeatures["features/  (21 screen folders)"]
    FSrc --> FProviders["providers/  (auth, theme, query client)"]
    FSrc --> FI18n["i18n/  (en, hi, pa)"]

    FFeatures --> FF1["books, dashboard, reservations,<br/>seat-booking, reading-progress, ..."]
    FFeatures --> FF2["admin, guardian, it-head,<br/>community, events, leaderboard, ..."]
```

Every backend module follows the same internal layering, which is what actually keeps a
30-module codebase navigable — knowing the pattern once means you can find your way
around any of them:

```mermaid
flowchart LR
    Router["router.py<br/>HTTP routes + auth/role guards"] --> Service["service.py<br/>business logic, orchestration"]
    Service --> Repository["repository.py<br/>Prisma queries"]
    Repository --> DB[("PostgreSQL")]
    Service --> Schemas["schemas.py<br/>Pydantic request/response shapes"]
```

### 3.3 Database Schema (Core Entities)

The full schema (~30 models — community posts, events, billing, support tickets, audit
log, and more) lives in
[`backend/prisma/schema.prisma`](backend/prisma/schema.prisma). The diagram below is the
core library-workflow subset:

```mermaid
erDiagram
    ROLE ||--o{ USER : has
    USER ||--o{ LOAN : borrows
    USER ||--o{ RESERVATION : requests
    USER ||--o{ REVIEW : writes
    USER ||--o{ PAYMENT : makes
    USER ||--o{ WISHLIST : saves
    USER ||--o{ READING_PROGRESS : tracks
    USER ||--o| GUARDIAN_LINK : "guardian in"
    USER ||--o| GUARDIAN_LINK : "member in"
    BOOK ||--o{ LOAN : "borrowed via"
    BOOK ||--o{ RESERVATION : "requested via"
    BOOK ||--o{ REVIEW : receives
    BOOK ||--o{ WISHLIST : "saved in"
    BOOK ||--o{ READING_PROGRESS : "tracked in"
    RESERVATION |o--o| LOAN : "approved into"

    ROLE {
        uuid id PK
        string name "admin, manager, librarian, member, guardian, it-head"
    }
    USER {
        uuid id PK
        string email
        string fullName
        uuid roleId FK
        json readingProfile "AI-generated, cached"
    }
    BOOK {
        uuid id PK
        string title
        string author
        string category
        int totalCopies
        json aiInsights "AI-generated, cached"
        float embedding "AI similarity vector"
    }
    LOAN {
        uuid id PK
        uuid bookId FK
        uuid memberId FK
        datetime dueDate
        datetime returnedAt
        boolean finePaid
    }
    RESERVATION {
        uuid id PK
        uuid memberId FK
        uuid bookId FK
        string status "pending, approved, rejected, cancelled"
        uuid loanId FK
    }
    REVIEW {
        uuid id PK
        uuid bookId FK
        uuid memberId FK
        int rating
        string comment
    }
    PAYMENT {
        uuid id PK
        uuid userId FK
        int amount
        string status
    }
    WISHLIST {
        uuid id PK
        uuid memberId FK
        uuid bookId FK
    }
    READING_PROGRESS {
        uuid id PK
        uuid memberId FK
        uuid bookId FK
        string status "reading, completed"
        int percentComplete
    }
    GUARDIAN_LINK {
        uuid id PK
        uuid guardianId FK
        uuid memberId FK
    }
```

A `Loan` is created either directly (staff issuing a book) or by approving a
`Reservation`, which is why `RESERVATION` optionally points at the `LOAN` it became.
`Book.aiInsights` and `Book.embedding`/`User.readingProfile` are the caches behind the
AI features — see the next diagram for how they're populated.

### 3.4 AI Feature Request Flow

Every AI-backed endpoint (book insights, similarity, reading profiles, manager demand
forecast) follows the same cache-first, degrade-gracefully shape. Book insights shown as
the representative example:

```mermaid
sequenceDiagram
    participant U as Browser
    participant API as FastAPI (/books/{id}/insights)
    participant DB as PostgreSQL
    participant LLM as LLM Provider

    U->>API: GET /books/{id}/insights
    API->>DB: read Book.aiInsights
    alt already cached
        DB-->>API: existing JSON
        API-->>U: 200 (instant — no LLM call)
    else not cached yet
        API->>LLM: one short, structured-JSON prompt
        alt valid JSON returned
            LLM-->>API: summary, difficulty, themes, ...
            API->>DB: save Book.aiInsights
            API-->>U: 200 (freshly generated)
        else provider unreachable / bad output
            API-->>U: 200 with a null body
            Note over U: UI shows an "AI unavailable" state —<br/>the rest of the app is unaffected
        end
    end
```

The cache is invalidated (cleared, not regenerated inline) whenever the book's
title/author/category/description is edited, so the next read regenerates it lazily —
editing a book is never blocked on an LLM call.

---

## 4) Local Setup (Quick Start)

### Prerequisites
- Python 3.12+
- uv
- Node.js 20+
- npm
- Docker (for local PostgreSQL + Redis)

### Environment setup
```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

The root `.env` owns shared infrastructure values (`DATABASE_URL`, Postgres
credentials/port). Backend-only settings — JWT secret, Google/Razorpay keys, and the
`LLM_MODE`/provider settings below — live in `backend/.env`.

```env
# backend/.env — AI provider selection (LLM_MODE: openai | bedrock | ollama)
LLM_MODE=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text   # used only for "You may also like" similarity

# Optional integrations
GOOGLE_CLIENT_ID=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

```env
# frontend/.env
VITE_API_URL=http://127.0.0.1:8000
VITE_API_PREFIX=/api/v1
VITE_GOOGLE_CLIENT_ID=
```

### Install dependencies
```bash
make install
```

### Initialize the database
Generate the Prisma client, then apply migrations. Start PostgreSQL first with Docker
Compose if it is not already running:
```bash
docker compose up -d --wait db
```

```bash
make db-generate
make db-migrate
```

> **Port already in use?** If a local PostgreSQL instance is already listening on 5432,
> Docker Compose will silently bind to the wrong server. Change `POSTGRES_PORT` and
> `DATABASE_URL` in `.env` to an unused port (e.g. 5433) and re-run the steps above.

### Run backend
```bash
npm run backend          # from the repo root — starts Postgres + Redis, then FastAPI with reload
```
Backend URL: `http://localhost:8000`

### Run frontend
```bash
npm run frontend         # from the repo root
```
Frontend URL: `http://localhost:5173`

---

## 5) Deployment Guide

No CI-verified deployment target is configured yet. The notes below describe how each
piece is built to be deployed once a host is chosen — swap in whichever
Postgres/container/static hosting provider you use.

### Database
Any managed PostgreSQL works. Point `DATABASE_URL` at it (include `sslmode=require` if
the provider needs it) — pending migrations are applied automatically on backend
startup (`AUTO_MIGRATE`, see `backend/src/app/core/config.py`).

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
```

### Backend
Run as a container or process behind a process manager:
```bash
uv run uvicorn app.main:app --app-dir src --host 0.0.0.0 --port 8000
```
Required environment variables: `DATABASE_URL`, `JWT_SECRET` (32+ random characters — a
short/default value is rejected when `APP_ENV=production`). Point `REDIS_URL` at a real
Redis instance rather than the `localhost` default. Optional: `GOOGLE_CLIENT_ID`,
`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`, and the `LLM_MODE` + provider credentials for
AI features.

### Frontend
Static build, servable from any CDN/static host:
```bash
npm --prefix frontend run build   # outputs frontend/dist
```
Set `VITE_API_URL` (and `VITE_API_PREFIX`, `VITE_GOOGLE_CLIENT_ID`) at build time to
point at the deployed backend.

---

## 6) Demo Credentials (Seeded)

Run the dev-preview seed once (development/test/e2e environments only):
```bash
cd backend
uv run python scripts/seed_dev_accounts.py
```

| Role      | Email                            | Password        |
| --------- | --------------------------------- | ---------------- |
| Admin     | `admin@devpreview.internal`       | `DevPreview123!` |
| Manager   | `manager@devpreview.internal`     | `DevPreview123!` |
| Librarian | `librarian@devpreview.internal`   | `DevPreview123!` |
| Member    | `member@devpreview.internal`      | `DevPreview123!` |
| Guardian  | `guardian@devpreview.internal`    | `DevPreview123!` |
| IT Head   | `it-head@devpreview.internal`     | `DevPreview123!` |

The password can be overridden with the `DEV_SEED_PASSWORD` environment variable. A
separate, richer catalog + ~5 months of synthetic activity is seeded automatically on
backend startup in development (`AUTO_SEED_DEMO`, `scripts/seed_demo_data.py`).

---

## 7) Useful URLs

Local backend:
- API base: `http://localhost:8000/api/v1`
- Live health: `http://localhost:8000/health/live`
- Readiness health: `http://localhost:8000/health/ready`
- OpenAPI docs: `http://localhost:8000/docs`

Local frontend: `http://localhost:5173`

---

## 8) Troubleshooting

- **Frontend can't connect to backend**
  - Verify `VITE_API_URL` + `VITE_API_PREFIX` in `frontend/.env`
  - Check the backend is running and reachable at that URL

- **Database connection failure / Docker binds the wrong Postgres**
  - Verify `DATABASE_URL` format/credentials in `.env`
  - If a local Postgres is already on port 5432, change `POSTGRES_PORT` and
    `DATABASE_URL` to an unused port and restart

- **`ImportError` on `from prisma.models import X` after pulling changes**
  - Someone else's schema change leaves your local Prisma client stale. Run
    `make db-generate`. Enabling the repo's git hooks once
    (`git config core.hooksPath .githooks`) does this automatically after every
    merge/checkout that touches `backend/prisma/schema.prisma`

- **401/403 errors**
  - Ensure the JWT is sent as `Authorization: Bearer <token>`
  - Confirm the logged-in user's role has permission for that endpoint

- **Google login issues**
  - Keep the same `GOOGLE_CLIENT_ID` in both `backend/.env` and `frontend/.env`

- **Razorpay issues**
  - Ensure both the backend secret keys and the frontend public key are configured

- **AI features (chatbot, book insights, recommendations) show "unavailable"**
  - Expected, not a bug: every AI feature degrades gracefully when the configured
    `LLM_MODE` provider is unreachable (see [§3.4](#34-ai-feature-request-flow)). For
    local Ollama, confirm it's running and that `OLLAMA_MODEL`/`OLLAMA_EMBEDDING_MODEL`
    are pulled (`ollama pull <model>`)

---

## 9) Basic Validation Commands

Backend tests (needs PostgreSQL running):
```bash
cd backend
uv run pytest
```

Frontend lint, type-check, and build:
```bash
cd frontend
npm run lint
npm run build
```

Frontend unit tests:
```bash
cd frontend
npm run test
```

End-to-end (Playwright, drives a real browser against a real backend + DB):
```bash
npm run test:e2e:install   # once, to install browser binaries
make test-e2e
```

Or, from the repo root, backend + frontend-unit together:
```bash
make test
```

---

## 10) License / Sharing Note

No license file is currently included in this repository. This README is intentionally
written as a **standalone project summary** so it can be copied and shared
independently for submissions, reviews, or onboarding.
