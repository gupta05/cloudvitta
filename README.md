# ☁️ CloudVitta — Billing & Subscription Management Platform

A full-stack SaaS billing platform inspired by [Meteroid](https://github.com/meteroid-oss/meteroid), built with modern web technologies. CloudVitta provides comprehensive subscription management, usage-based billing, and invoice generation — all in a single deployable package.

## ✨ Features

| Area | Capabilities |
|---|---|
| **Multi-Tenancy** | Organizations → Tenants with isolated data, tenant switcher |
| **Customer Management** | CRUD, search, pagination, customer 360° view |
| **Product Catalog** | Product families, products, billable metrics (COUNT/SUM/MAX/UNIQUE_COUNT/AVERAGE) |
| **Plan Builder** | Multi-version plans with price components: flat, per-unit, tiered, package pricing |
| **Subscriptions** | Full lifecycle: create → activate → pause → cancel. Plan changes (upgrade/downgrade) |
| **Billing Engine** | Automated invoice generation from subscriptions, coupon application, addon charges |
| **Usage Metering** | Event ingestion API, 5 aggregation types, real-time usage tracking |
| **Invoices** | Draft → Finalize → Pay → Void lifecycle, line items, credit notes |
| **Coupons** | Percentage & fixed-amount discounts, redemption limits, expiry dates |
| **Add-ons** | One-time & recurring add-ons attachable to subscriptions |
| **API Tokens** | Generate/revoke API keys with HMAC hashing |
| **Webhooks** | HMAC-signed delivery, event filtering, exponential backoff retries |
| **Dashboard** | MRR, customer count, subscription status, revenue charts |
| **Scheduler** | Cron-based background jobs: trial expiration, overdue detection, auto-invoicing |

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js, Express.js |
| **Database** | SQLite (via Prisma ORM) |
| **Auth** | JWT (jsonwebtoken + bcryptjs) |
| **Frontend** | React 18, Vite 6, TailwindCSS v4 |
| **Charts** | Recharts |
| **Icons** | Lucide React |
| **Notifications** | Sonner (toast) |
| **Routing** | React Router v6 |
| **State** | TanStack React Query |

## 🚀 Getting Started

### Prerequisites
- Node.js 18+

### Installation

This is an npm-workspaces monorepo, so install and run everything from the repo root.

```bash
# 1. Configure environment variables
#    Copy the templates and fill in your own values (see the table below).
cp backend/.env.example backend/.env
cp .env.example .env            # optional aggregate reference
# frontend/.env is optional (see frontend/.env.example)

# 2. Set the initial administrator credentials in backend/.env
#    ADMIN_EMAIL=admin@yourcompany.com
#    ADMIN_PASSWORD=<a-strong-password>      # min 8 chars; change after first login

# 3. Install deps (both workspaces), push the schema, and seed the baseline
npm run setup                   # = npm install && npm run db:push && npm run db:seed
```

> **Minimum to boot:** set a `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`
> in `backend/.env` (all required by `npm run db:seed`). The OCI, Brevo, and
> Razorpay values are only needed for storage uploads, OTP emails, and payments
> respectively — the app starts without them but those features will be inert.

### Required environment variables

Full documentation lives in `backend/.env.example`. Summary:

| Variable | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | ✅ | JWT signing secret (server 500s if unset) |
| `DATABASE_URL` | ✅ | SQLite connection string (`file:./dev.db`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ✅ (seed) | Initial administrator account provisioned by `npm run db:seed` |
| `OCI_S3_ENDPOINT` / `_BUCKET` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` / `_REGION` | for storage | Oracle Cloud Object Storage (S3-compatible) |
| `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` | for OTP email | Transactional email delivery |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | for payments | Razorpay (Test Mode) |
| `GLOBAL_STORAGE_CAP_GB`, `RENEWAL_GRACE_DAYS`, `PORT`, `JWT_EXPIRY` | optional | Have sensible defaults |

### Running

```bash
# From the repo root — starts backend (:3000) and frontend (:5173) together
npm run dev
```

Open **http://localhost:5173** in your browser.

### Administrator account

There are **no demo/seed logins**. `npm run db:seed` provisions a single
administrator from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `backend/.env`:

- The password is hashed with bcrypt (12 rounds) — it is never stored in
  plaintext and never committed to the repo.
- Seeding is **idempotent**: re-running never creates a duplicate admin and
  never overwrites an existing admin's password.
- Sign in at `/login` with those credentials, then change the password from
  the account settings after first login.

Everyone else signs up through the public **Create Account** flow, which only
ever creates normal customer (`user`) accounts — the public API can never
create an administrator.

## 📁 Project Structure

```
cloudvitta/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # 20+ table schema
│   │   └── seed.js             # Realistic demo data
│   ├── src/
│   │   ├── server.js           # Express entry point
│   │   ├── middleware/
│   │   │   ├── auth.js         # JWT authentication
│   │   │   └── tenantContext.js # Multi-tenant isolation
│   │   ├── routes/             # 18 route modules
│   │   │   ├── auth.js
│   │   │   ├── customers.js
│   │   │   ├── plans.js
│   │   │   ├── subscriptions.js
│   │   │   ├── invoices.js
│   │   │   ├── events.js
│   │   │   ├── stats.js
│   │   │   └── ...
│   │   ├── services/           # Business logic
│   │   │   ├── billing.js      # Invoice generation engine
│   │   │   ├── metering.js     # Usage aggregation
│   │   │   ├── subscriptionLifecycle.js
│   │   │   ├── scheduler.js    # Cron background jobs
│   │   │   └── webhookDispatcher.js
│   │   └── utils/
│   │       ├── errors.js
│   │       └── pagination.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/client.js       # Centralized API client
│   │   ├── components/
│   │   │   └── layout/AppLayout.jsx
│   │   ├── pages/
│   │   │   ├── auth/           # Login, Register
│   │   │   ├── dashboard/      # KPI dashboard + charts
│   │   │   ├── customers/      # List, Detail, Create
│   │   │   ├── catalog/        # Products, Families, Metrics
│   │   │   ├── plans/          # List, Builder, Detail
│   │   │   ├── subscriptions/  # List, Detail, Create
│   │   │   ├── invoices/       # List, Detail
│   │   │   ├── creditNotes/    # List + Create
│   │   │   ├── coupons/        # List + Create
│   │   │   ├── addons/         # List + Create
│   │   │   ├── events/         # Log + Ingest
│   │   │   └── settings/       # Entity, Tokens, Webhooks
│   │   ├── index.css           # Design system
│   │   ├── main.jsx
│   │   └── App.jsx
│   ├── vite.config.js
│   └── package.json
├── .gitignore
├── .env.example
└── package.json                # Root monorepo
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` — Create account + organization
- `POST /api/auth/login` — JWT login
- `GET /api/auth/me` — Current user + tenants

### Resources (all require `Authorization: Bearer <token>` + `x-tenant-id` header)
- `/api/customers` — CRUD + search
- `/api/product-families` — CRUD
- `/api/products` — CRUD
- `/api/billable-metrics` — CRUD
- `/api/plans` — CRUD + publish + versioning
- `/api/subscriptions` — CRUD + activate/cancel/change-plan
- `/api/invoices` — List + generate + finalize/pay/void
- `/api/credit-notes` — CRUD
- `/api/coupons` — CRUD + toggle
- `/api/addons` — CRUD
- `/api/events` — Ingest + query + usage aggregation
- `/api/stats` — MRR, revenue, subscription stats
- `/api/api-tokens` — Generate/revoke
- `/api/webhooks` — CRUD
- `/api/settings/invoicing-entity` — Company info for invoices

## License

MIT
