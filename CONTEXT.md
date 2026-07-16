# CloudVitta — Project Context

> **⚠️ LIVING DOCUMENT — KEEP IN SYNC.** This file is the single source of truth for understanding this project across development sessions. Whenever a significant change lands — new feature, architectural change, integration, refactor, schema modification, infra/deployment change, security improvement, pricing update, auth change — **update the relevant sections of this file in the same piece of work**. It must always describe the *current* implementation, never an aspirational or outdated one.
>
> Last synchronized: 2026-07-16 (app-wide UI/UX consistency pass: shared UI component library (`components/ui/` — Modal/ConfirmDialog/StatCard/TabPills/Pagination/skeletons/OtpInput), shared `lib/` formatters (en-IN dates, bytes, chart theme, UI maps), mobile drawer in both layout shells, accessibility sweep, `DESIGN.md` rewritten; frontend-only change, no API/schema/auth changes).

---

## 1. Project Overview & Purpose

**CloudVitta** is a multi-tenant **cloud object storage service with built-in usage-based billing and subscription management**. It is a deliberate, self-hosted clone of [Meteroid](https://meteroid.com)-style billing (several backend service headers say "Equivalent to Meteroid's ...") fronting **Oracle Cloud Infrastructure (OCI) Object Storage** as the actual storage backend.

Two user-facing surfaces exist in one React app, behind a public **marketing landing page** (`/` — hero, features, how-it-works, security, pricing, FAQ, CTA; links to Log In / Create Account):
- **Admin app** (`/dashboard` + other admin routes) — for platform operators: customers, plans, subscriptions, invoices, coupons, addons, usage events, storage overview, user management.
- **Customer portal** (`/portal`) — for end users: file storage (upload/download/browse), billing self-service (plan upgrade/downgrade, invoices, simulated payment methods), API keys, account/security settings.

**What it is:** a demo/dev-grade S3-like storage product with metered billing, plan catalog, invoice generation, OTP-verified auth, **Razorpay payments (Test Mode)** with an immutable transaction ledger, and an admin back office.
**What it is NOT:** production-hardened SaaS. There is no tax engine, no proration, no deployment/CI setup, no tests, and several dead-but-scaffolded features (webhook dispatch, API-key auth — see §25).

## 2. Monorepo Layout

npm workspaces monorepo, root `package.json` name `cloudvitta`:

```
zoho project/
├── package.json            # workspaces: ["backend", "frontend"]; scripts: dev, dev:backend, dev:frontend, db:push, db:seed, db:studio, setup
├── .gitignore              # comprehensive: node_modules, .env*, *.db, dist, logs, IDE/OS files (keeps .env.example + .vscode/settings.json)
├── .env.example            # aggregate env reference (points to per-service templates)
├── README.md               # feature matrix, setup (env step + npm run setup), demo creds
├── implementation_plan.md  # historical work plan (forgot-password, pricing consistency, toast fixes — all implemented)
├── DESIGN.md               # design-system reference (living document — keep in sync with UI changes)
├── CONTEXT.md              # ← this file
├── backend/
│   ├── .env.example        # canonical backend env template (all vars, no values)
│   ├── src/
│   │   ├── server.js       # Express entry point
│   │   ├── routes/         # 25 route files
│   │   ├── services/       # billing, storage, metering, scheduler, email, OTP, webhooks
│   │   ├── middleware/     # auth.js, tenantContext.js
│   │   └── utils/errors.js # ApiError + global error handler
│   ├── prisma/
│   │   ├── schema.prisma   # 26 models, SQLite
│   │   ├── seed.js         # demo data (Free 500 MB / Pro 1 GB ₹200/mo)
│   │   └── dev.db          # SQLite database (gitignored)
│   └── .env                # local secrets (gitignored)
└── frontend/
    ├── .env.example       # frontend env template (VITE_API_URL — optional/unused)
    ├── vite.config.js      # port 5173, /api proxy → localhost:3000
    ├── index.html          # Inter font, dark theme
    ├── dist/               # build artifact (gitignored; regenerate with `npm run build`)
    └── src/
        ├── main.jsx        # Router + QueryClientProvider + sonner Toaster
        ├── App.jsx         # ALL routes + route guards (no lazy loading)
        ├── index.css       # entire design system (Tailwind v4 @theme, cv-* tokens)
        ├── api/client.js   # singleton fetch-based API client (~100 methods)
        ├── lib/currency.js # shared INR formatter (only lib file)
        ├── components/     # layout/ (AppLayout, CustomerLayout), ui/ (ErrorBanner, LoadingSpinner)
        └── pages/          # landing/ (public marketing page), auth/, dashboard/, customers/, catalog/,
                            # plans/, subscriptions/, invoices/, creditNotes/, coupons/, addons/, events/,
                            # settings/, users/, storage/, portal/
```

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js (ESM), **Express 5**, Prisma 6 ORM, **SQLite** (`file:./dev.db`, schema-push workflow — no migrations dir) |
| Auth | `jsonwebtoken` (Bearer JWT), `bcryptjs`, custom OTP service |
| Payments | **`razorpay` SDK v2 (Test Mode)** — orders API via SDK, signature/webhook verification via `node:crypto` HMAC |
| Storage | `@aws-sdk/client-s3` v3 pointed at **OCI S3-compatible endpoint** (region default `ap-mumbai-1`), `multer` for uploads |
| Email | **Brevo (Sendinblue) HTTP API v3** via native `fetch` (no SDK) |
| Scheduling | `node-cron` (5 jobs, see §21) |
| Frontend | React 18, Vite 6, **Tailwind CSS v4** (CSS-based config, no tailwind.config.js), React Router 6, Recharts, lucide-react, sonner (toasts), date-fns |
| Language | Plain JavaScript/JSX everywhere — no TypeScript, no tests, no linters |

## 4. High-Level Architecture

```
Browser (React SPA :5173)
   │  /api proxy (Vite dev) — Bearer JWT + x-tenant-id header
   ▼
Express API (:3000, backend/src/server.js)
   ├── middleware: helmet (security headers) → cors (localhost:5173 only) → request logger → express.json(10mb) → per-router auth chains
   ├── routes/* (25 routers, /api/... prefixes)
   ├── services/* (billing engine, storage, metering, lifecycle, OTP, email)
   ├── node-cron scheduler (snapshots, trials, invoicing, overdue, cleanup)
   ▼                                    ▼
Prisma → SQLite (dev.db)      AWS S3 SDK → OCI Object Storage (1 physical bucket)
                              Brevo API → transactional OTP emails
```

Single shared `PrismaClient` on `app.locals.prisma`; routes access it via `req.app.locals.prisma`. Global error handler maps `ApiError`, Prisma `P2002`→409, `P2025`→404, `P2003`→409 (FK constraint), JSON parse errors→400. Graceful shutdown on both SIGTERM and SIGINT.

## 5. Authentication & Authorization

**Registration (2-phase OTP):**
1. `POST /api/auth/register` → validates, bcrypt-hashes password (12 rounds), creates `PendingRegistration` with bcrypt-hashed OTP (10 rounds), emails OTP via Brevo. **No User row yet.**
2. `POST /api/auth/verify-otp` → verifies (6 digits, 10-min expiry, max 5 attempts, 60s resend cooldown). In one transaction creates: Organization → Tenant ("Production") → Customer (currency `INR`) → User (`role: 'user'`, verified) → auto-subscribes to the FREE plan (ACTIVE subscription). Then creates default storage bucket `<emaillocal>-files`, a `UserSession` (7-day expiry), and issues the JWT.

**Login:** `POST /api/auth/login` — blocks deactivated/unverified accounts, creates `UserSession` (IP, UA), returns `{ token, user, organization, tenants }`.

**Password reset:** OTP-based mirror of registration (`/forgot-password`, `/reset-password`, `/resend-reset-otp`), enumeration-safe (uniform generic responses). On success, **revokes all sessions**.

**Token:** JWT in `Authorization: Bearer` header only (stored client-side in **localStorage** `cv_token` — not httpOnly cookies). Payload: `{ userId, email, organizationId, role, customerId, tenantId, sessionId }`. Expiry `JWT_EXPIRY` (default 7d). Secret `JWT_SECRET` (**required** — no fallback; server returns 500 if unset).

**Middleware** (`backend/src/middleware/auth.js`):
- `authenticate` — verifies JWT, sets `req.user`; **requires** `sessionId` in token (no legacy token pass-through); validates `UserSession` active/unexpired; **fails closed** on DB errors (returns 401, never silently allows through).
- `requireAdmin` / `requireAdminOrMember` / `requireUser` (role `user` + non-null customerId; sets `req.customerId`).

## 6. User Roles & Permissions

| Role | Access |
|---|---|
| `admin` | Full admin app; user management incl. hard delete; tenant switcher |
| `member` | Admin app (adminUsers routes via `requireAdminOrMember`; hard delete is admin-only) |
| `user` | Customer portal only (`requireUser` on all `/api/portal/*`); scoped to their own `customerId` |

Frontend guards (in `App.jsx`, reading localStorage): `ProtectedRoute` (token exists), `AdminRoute` (role ≠ user), `UserRoute` (role = user). Login redirects by role: `user` → `/portal`, else `/dashboard`.

**RBAC enforcement:** All 15 admin CRUD route files (customers, plans, subscriptions, invoices, coupons, addons, events, stats, products, productFamilies, billableMetrics, apiTokens, webhooks, settings, creditNotes) enforce `requireAdminOrMember` middleware. Portal users (role `user`) receive 403 on all admin endpoints.

## 7. Multi-Tenancy / Tenant Isolation

Hierarchy: **Organization → Tenant(s) → Customers/Plans/Invoices/…** Everything hangs off `tenantId`.

- `tenantContext` middleware is **role-aware**: end-users (`role: 'user'`) are pinned to `jwt.tenantId` — the `x-tenant-id` header is ignored for them (prevents a portal user from reaching another tenant); admins/members take the active tenant from the **`x-tenant-id` header** (AppLayout tenant-switcher dropdown), falling back to their home `jwt.tenantId`. `validateTenantAccess` (always chained after `tenantContext`) then enforces the chosen tenant belongs to the caller's org, so header-based switching can never cross org boundaries. The switcher persists the selection in `cv_tenant_id`; AppLayout preserves it across reloads, self-healing to the home/default tenant if the stored id isn't one of the org's tenants.
- `validateTenantAccess`: verifies the tenant belongs to `req.user.organizationId`, sets `req.tenant`.
- `customerScope` (storage routes): role `user` → forced own customerId; admins → optional `?customerId` filter.
- Isolation is **row-level scoping by convention** — every query manually includes `tenantId` in `where`. No Prisma middleware/RLS. All mutation routes (PUT/DELETE/:id, POST /:id/action) include tenant-scoped `findFirst` guards before updates to prevent cross-tenant IDOR.

## 8. Object Storage Architecture

- **One physical OCI bucket** (`OCI_S3_BUCKET`); "buckets" in the app are DB rows (`StorageBucket`) acting as key prefixes. Key format: `{tenantId}/{customerId}/{bucketName}/{objectKey}` (sanitized against `..` traversal).
- Client: `backend/src/services/ociStorageClient.js` — AWS SDK v3 S3 client, `forcePathStyle: true`, against `OCI_S3_ENDPOINT`. `verifyOCIConnection()` (HeadBucket) runs at boot; failure warns but doesn't stop the server.
- **Upload lifecycle:** multipart POST (`file` field) → multer disk temp (`os.tmpdir()/cloudvitta-uploads`, **100 MB limit**) → quota checks → SHA-256 checksum → `PutObjectCommand` → upsert `StorageObject` row → increment bucket `usedBytes`/`objectCount` → auto-meter `storage_put_ops` + `storage_ingress_bytes` → unlink temp file.
- **Quota enforcement, in order:** (1) **global platform cap** `GLOBAL_STORAGE_CAP_GB` (default 15 GB, all users combined) → HTTP 507; (2) **plan hard cap** from the active subscription's storage component `hardCapGB` → HTTP 413; (3) bucket `quotaBytes` (only enforced with no active sub).
- **Download:** proxied stream through the backend (Content-Disposition, ETag, X-Checksum-SHA256) + meters `storage_get_ops`/`storage_egress_bytes`. **No presigned URLs anywhere.** `StorageBucket.isPublic` exists in schema but is never used.
- Deletes: OCI delete (warn on failure) + soft delete of `StorageObject` + counter decrement. `deleteBucket` requires empty, then sweeps orphan OCI keys under the prefix.

## 9. Usage Metering & Billing Architecture

**Metering:**
- `UsageEvent` rows written **synchronously in-request** by storage operations (put/get/delete/ingress/egress), plus arbitrary batch ingestion via `POST /api/events/ingest`.
- `StorageSnapshot` rows written by cron **every 15 min** (per customer aggregate with `bucketId: null` + per bucket) — used for time-weighted **GB-hour** storage averaging.
- `BillableMetric` aggregation types: COUNT, SUM, MAX, UNIQUE_COUNT, AVERAGE — computed **in JavaScript** over full event fetches (`services/metering.js`; fine for SQLite scale, a known scaling limit).
- Seeded metric codes: `storage_bytes_stored` (MAX), `storage_put_ops`/`storage_get_ops`/`storage_delete_ops` (COUNT), `storage_egress_bytes`/`storage_ingress_bytes` (SUM). **Bandwidth (egress/ingress) is internal-only — always excluded from invoices, portal plans, and charges** (surfaced only in admin storage stats).

**Billing engine** (`backend/src/services/billing.js` — `generateInvoiceForSubscription`):
- Only ACTIVE/TRIAL subs. Period derived from `billingDay` (MONTHLY/QUARTERLY/ANNUAL).
- Pricing models per `PriceComponent.pricingModel` JSON: **flat**, **per_unit** (with included-quota overage labeling), **tiered**, **per_thousand**, **package**. Prices in JSON are **whole-rupee floats**, converted to paise (`×100`) at invoice time.
- Addons: `priceCents × quantity` per line. Coupons: PERCENTAGE or FIXED_AMOUNT (paise), negative line, floor at 0.
- **`taxCents = 0`** (placeholder), **no proration**, invoice numbers `INV-00001` generated **inside the transaction** using `MAX(invoiceNumber)+1` (race-safe). Due date = now + `netTermsDays` (default 30). Created DRAFT with lines in a transaction.
- Invoice statuses: DRAFT → FINALIZED → PAID / VOID; FINALIZED past due → OVERDUE (cron).

## 10. Subscription & Pricing Model

- **Currency: INR (₹) platform-wide** (converted from USD on 2026-07-15). All Prisma `currency` fields default to `"INR"`. **Money is stored as integer paise — but field names still say `*Cents`** (`totalCents`, `priceCents`, etc.; deliberate rename-avoidance, documented in schema comment).
- Shared frontend formatter: `frontend/src/lib/currency.js` — `formatCurrency(paise)` (÷100, `Intl en-IN` → `₹200.00`) for `*Cents` fields; `formatRupees(amount)` for whole-rupee values (pricing JSON, `monthlyPrice`, charge floats). **Two money representations — do not mix them up.**
- **Plans (seeded):**
  | Plan | Price | Storage | Trial | Ops included |
  |---|---|---|---|---|
  | Free | ₹0/mo | **500 MB** hard cap (`500/1024` GB) | — | 1K PUT / 10K GET |
  | Pro | **₹200/mo** (flat `price: 200` → 20000 paise) | **1 GB** hard cap | 7 days | 5K PUT / 50K GET |
- Seeded addons: Priority Support ₹500/mo (RECURRING), Custom Domain ₹100 (ONETIME). Coupons: WELCOME20 (20%), FREEUPGRADE (100%).
- Plans are versioned (`Plan → PlanVersion → PriceComponent[]`); publishing a new version deactivates the old one. Plan statuses: DRAFT/ACTIVE.
- **Subscription state machine** (`services/subscriptionLifecycle.js`): PENDING→ACTIVE/CANCELLED; TRIAL→ACTIVE/CANCELLED; ACTIVE→PAUSED/CANCELLED/ENDED; PAUSED→ACTIVE/CANCELLED. (PAUSED is defined but no route sets it.)
- Plan change semantics differ by path: admin `change-plan` swaps components in place; portal `subscribe` ends the old sub and creates a new one. **Neither prorates.**

## 11. Payment Integration (Razorpay, Test Mode)

**Real Razorpay integration, env-driven** — swapping to Live Mode requires only changing `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`. No secrets in code; the checkout `key_id` is delivered to the browser via the create-order API response (no VITE_ var).

**Flow:** portal "Upgrade to Pro" → `POST /api/portal/billing/payments/create-order` (creates Razorpay order, paise, `payment_capture: 1` + local `Payment` row status CREATED) → checkout.js modal (dynamically loaded, `frontend/src/lib/razorpay.js`) → on success the browser calls `POST .../verify`, where the backend recomputes `HMAC-SHA256(order_id|payment_id, key_secret)` before any subscription change. The webhook (`POST /api/payments/webhook/razorpay`, public, raw-body, HMAC-verified against `RAZORPAY_WEBHOOK_SECRET`, mounted before `express.json` in server.js) is the redundant path for the same capture, plus `payment.failed` / `refund.processed`.

**Security invariant:** a paid subscription is only activated after backend HMAC verification. `POST /portal/billing/subscribe` returns **402** for any plan with a nonzero flat charge (free plans only). The backend re-fetches the payment entity from Razorpay on the verify path and checks the captured amount against the expected `amountCents` (mismatch → captured-but-not-activated, flagged for review).

**Idempotency (3 layers):** (1) atomic compare-and-swap claim on `Payment.status` (`updateMany where status in [CREATED, FAILED, CANCELLED]` → CAPTURED; verify-vs-webhook race has exactly one winner); (2) `PaymentWebhookEvent` unique on `razorpayEventId` dedupes deliveries (ERROR rows are reprocessable so Razorpay retries can recover); (3) `Transaction.idempotencyKey` unique dedupes ledger writes.

**On capture (winner only):** end old sub → create ACTIVE sub with `currentPeriodStart`/`currentPeriodEnd` (+1 billing period) — or extend the period if it's a renewal / same-plan repurchase — → generate invoice for the paid period via `generateInvoiceForSubscription` and mark it PAID, linked both ways to the Payment → ledger rows (`PAYMENT_CAPTURED` CREDIT, `SUBSCRIPTION_ACTIVATED`/`RENEWED`, `INVOICE_GENERATED`, `INVOICE_PAID`) → notification. Invoice failure never un-captures the payment. Storage quota updates automatically (derived from the active sub's `hardCapGB`).

**Expiry/renewal:** hourly cron (`:30`) `processPaidSubscriptionExpirations` — past `currentPeriodEnd`: one-time renewal-reminder notification during the grace window (`RENEWAL_GRACE_DAYS`, default 3); past grace: `downgradeToFreePlan` (old sub ENDED + `SUBSCRIPTION_EXPIRED` ledger + new Free ACTIVE sub + notification). `currentPeriodEnd == null` = free/legacy sub, never expires. Portal shows "Paid through …" + a Renew Now button within 7 days of expiry (renewal extends from `max(now, currentPeriodEnd)`). `autoRenew` field reserved for future recurring billing. Paid-plan TRIALs that lapse without payment are downgraded to Free (not silently activated). Refunds (`refund.processed`): payment → REFUNDED + DEBIT ledger; a full refund on an active sub also downgrades to Free.

**Transaction Ledger** (`services/ledger.js`): append-only `Transaction` rows for every financial event — types `PAYMENT_CAPTURED/FAILED/REFUNDED`, `SUBSCRIPTION_ACTIVATED/RENEWED/CANCELLED/EXPIRED`, `INVOICE_GENERATED/PAID`, `CREDIT/DEBIT_ADJUSTMENT` — with direction CREDIT/DEBIT/NEUTRAL (revenue counted once, on PAYMENT_CAPTURED). Free-plan subscribe/cancel, admin mark-paid, and cron invoice generation also write ledger entries. Portal Billing → Payments tab shows payment history + the ledger, all served from DB records.

`PaymentMethod` rows remain display-only card records (portal form); real charges go through Razorpay checkout. Local dev: the verify endpoint carries the happy path without any tunnel; webhook-only events (refunds) require exposing `/api/payments/webhook/razorpay` via a tunnel (e.g. ngrok) and configuring it in the Razorpay dashboard with events `payment.captured`, `payment.failed`, `refund.processed`.

## 12. Database Schema (Prisma, SQLite — 29 models)

Key facts: string pseudo-enums (SQLite), JSON as String columns, BigInt for bytes, money as integer paise.

| Group | Models |
|---|---|
| Identity | `Organization` → `Tenant` (currency INR default) → `User` (role, isVerified, deactivatedAt, optional customerId link), `UserSession`, `PendingRegistration`, `PasswordResetRequest` |
| Catalog | `ProductFamily`, `Product`, `BillableMetric` (code unique per tenant), `Plan` → `PlanVersion` (billingPeriod, trialDays, currency) → `PriceComponent` (feeType + `pricingModel` JSON + optional metric) |
| Customers/Billing | `Customer` (currency INR, balanceCents, JSON addresses, alias unique per tenant), `Subscription` (+ `currentPeriodStart`/`currentPeriodEnd` paid-through tracking, `autoRenew` (reserved), `SubscriptionComponent` with unused `pricingOverride`, `SubscriptionAddon`), `Invoice` → `InvoiceLine`, `CreditNote`, `Coupon`, `Addon`, `InvoicingEntity` (1:1 tenant letterhead — seeded as Indian entity: GSTIN `29ABCDE1234F1Z5`, Bengaluru, country IN), `PaymentMethod` (display-only card records) |
| Payments/Ledger | `Payment` (one row per Razorpay order; `razorpayOrderId`/`razorpayPaymentId` unique; status CREATED/CAPTURED/FAILED/CANCELLED/REFUNDED; amountCents paise; gatewayResponse JSON; links to Subscription + Invoice), `Transaction` (immutable append-only ledger; type + direction CREDIT/DEBIT/NEUTRAL; unique `idempotencyKey`; links to Payment/Invoice/Subscription), `PaymentWebhookEvent` (unique `razorpayEventId` dedup + raw payload audit; PROCESSING/PROCESSED/ERROR) |
| Storage/Metering | `StorageBucket` (denormalized usedBytes/objectCount, quotaBytes, unused isPublic), `StorageObject` (unique [bucketId, key], soft-delete, sha256), `StorageSnapshot` (GB-hour source), `UsageEvent` (indexed [tenantId, customerId, eventCode, timestamp]) |
| Misc | `ApiToken` (SHA-256 hash + prefix), `WebhookEndpoint` (secret + events JSON), `Notification`, `NotificationPreference` (13 toggles), `UserPreference` |

Workflow: **`prisma db push`** (no migrations). Seed (`prisma/seed.js`) is **non-destructive for user accounts** — wipes only catalog/billing/storage-metadata data (incl. payments/transactions/webhook events), upserts tenants/customers (forcing `currency: 'INR'` on existing rows). Acme's seeded Pro sub gets `currentPeriodStart/End` so the expiry cron doesn't downgrade the demo account.

## 13. API Architecture

All under `/api`, JSON, Bearer JWT + `x-tenant-id` (admins). 25 routers mounted in `server.js`:

| Area | Prefixes |
|---|---|
| Auth (public) | `/api/auth` — register, verify-otp, resend-otp, login, logout, me, forgot-password, reset-password, resend-reset-otp |
| Org/tenant | `/api/organizations`, `/api/tenants` |
| Catalog | `/api/product-families`, `/api/products`, `/api/billable-metrics`, `/api/plans` (CRUD + publish + versions), `/api/coupons`, `/api/addons` |
| Billing | `/api/customers`, `/api/subscriptions` (activate/cancel/change-plan/addons), `/api/invoices` (generate/finalize/mark-paid/void), `/api/credit-notes` |
| Metering | `/api/events` (ingest/list/usage), `/api/stats` (admin dashboard MRR/revenue) |
| Storage | `/api/storage` (buckets, objects upload/download/meta, usage, history, stats) |
| Platform | `/api/api-tokens`, `/api/webhooks`, `/api/settings` (invoicing entity), `/api/users` (admin user mgmt) |
| Portal (requireUser) | `/api/portal` (dashboard/subscription/invoices/usage/activity/api-keys), `/api/portal/account` (profile/password/sessions/delete), `/api/portal/settings`, `/api/portal/billing` (plans/subscribe [free only, 402 for paid]/cancel/payment-methods/charges/invoice download), `/api/portal/billing/payments` (create-order/verify/failure/history GET / + transactions), `/api/portal/notifications` |
| Payments (public) | `POST /api/payments/webhook/razorpay` — raw-body, HMAC-authenticated Razorpay webhook (mounted before `express.json`) |
| Health | `GET /api/health` |

Frontend client: `frontend/src/api/client.js` — singleton fetch wrapper, ~100 named methods, hardcoded `/api` base (relies on Vite proxy), auto `Authorization` + `x-tenant-id` headers, **401 → clears token and hard-redirects to `/login`**.

## 14. Frontend Architecture

- **Routing:** all in `App.jsx`, statically imported (no code-splitting). Public `/` = marketing landing page (`pages/landing/LandingPage.jsx` — no layout shell, sticky header, IntersectionObserver scroll-reveal, anchors to #features/#pricing/#faq; shows Sign in / Create Account, or an "Open portal/dashboard" shortcut when a token exists). Public auth pages; `/portal/*` inside `CustomerLayout`; admin app inside `AppLayout` with Dashboard at **`/dashboard`** (moved off `/`). Role redirects (Login, OtpVerification, `UserRoute`) send admins/members to `/dashboard`. Internal navigation uses React Router only (no `window.location.href`).
- **State:** local `useState`/`useEffect` + direct `api.*` calls per page. **React Query is installed and its provider mounted, but has zero consumers** (dead infra). No context providers — auth state = localStorage (`cv_token`, `cv_tenant_id`, `cv_role`, `cv_customer_id`, `cv_user`) + the ApiClient singleton.
- **Layouts:** `AppLayout` (admin sidebar `w-64`, sectioned nav, **tenant switcher** → `setTenantId` + full reload with outside-click/Esc close, `/auth/me` re-sync on mount) vs `CustomerLayout` (portal sidebar `w-64`, **notification bell** with unread badge polled every 30s, lucide notification icons). Both shells: server-side logout (`api.logout()` + full `cv_*` cleanup) and a **mobile drawer** (hamburger topbar below `md`, `role="dialog"` drawer with backdrop/Esc close).
- **Design system:** entirely in `src/index.css` — Tailwind v4 `@theme` with `cv-*` tokens (`bg #09090b`, primary `#3b82f6`, data-viz `cv-viz-purple #8b5cf6`), component classes (`.glass-card`, `.card-header`, `.data-table`, `.badge badge-{status}`, `.btn` (+`.btn-spinner`, `:disabled`), `.icon-btn`/`.icon-chip`, `.form-input`, `.tab-group`/`.tab-pill`, `.skeleton`, `.dropzone`, `.progress-bar`, landing `.landing-grid-bg`/`.reveal`, `:focus-visible` outlines, `prefers-reduced-motion` support). **Dark-only** — no light mode. Documented in root **`DESIGN.md`** (living document, keep in sync).
- **Shared UI components** (`components/ui/`): `LoadingSpinner`, `ErrorBanner`, `Modal`, `ConfirmDialog` (replaces all native `confirm()`), `StatCard`, `EmptyState`, `PageHeader`, `TabPills`, `Pagination` (used by all paginated lists), `Skeleton`/`TableSkeleton`, `OtpInput` (+`OtpExpiryBar`/`OtpResend`). Shared libs (`lib/`): `currency.js` (`formatCurrency` paise / `formatRupees` rupees), `format.js` (`formatBytes`, `formatDate` — single `en-IN` locale), `chartTheme.js` (Recharts colors/tooltip mirroring tokens), `uiMaps.js` (`ROLE_BADGES`, `PAYMENT_BADGES`, `EVENT_LABELS`, `getFileIcon`, `parseUA`).
- **Charts:** Recharts themed via `lib/chartTheme.js` (Dashboard revenue line ₹, subs bar; storage area/pie charts).
- **Uploads:** native HTML5 drag-drop (admin `BucketDetail` whole-page drop; portal `CustomerBucketDetail` accessible dropzone card — `role="button"`, keyboard-triggerable) → multipart FormData. Downloads via blob + Content-Disposition parsing.
- **Toasts:** sonner, top-right, styled via `cv-*` CSS vars, with viewport-overflow hardening (maxWidth calc, word-break) in main.jsx + index.css.
- **Accessibility baseline:** modals with focus management, `htmlFor`/`id` on form fields, `aria-label` on icon buttons, `role="switch"` toggles, `role="alert"`/`role="status"` on error/loading states, skeleton loaders for tables.

## 15. Session Management

- `UserSession` row per login/registration: IP (`x-forwarded-for`), user-agent, `expiresAt` = 7 days, `lastActiveAt` updated fire-and-forget per request.
- Validated by `authenticate` when the JWT carries `sessionId` → 401 "Session expired or revoked" if inactive/expired.
- Users can view sessions (with current-session marker), revoke individual ones (not current), or revoke-all (portal Account → Security; admins per-user in UserDetail). Password reset and account deactivation revoke all sessions.

## 16. Notifications & Email

- **Email (Brevo):** exactly two transactional emails — registration OTP and password-reset OTP (inline dark HTML, 6-digit boxes). No invoice/billing emails. Registration fails closed if the OTP email can't be sent (503, pending record deleted).
- **In-app notifications:** `Notification` rows (types: account/billing/storage/security/system) surfaced only in the portal bell dropdown (last 5, mark-read/mark-all/delete). Created on welcome, new login, password change, etc. `NotificationPreference` has 13 toggles (portal Settings) — **preferences are stored but not consulted before creating notifications**.

## 17. Background Jobs (node-cron, started at boot)

| Schedule | Job |
|---|---|
| `*/15 * * * *` | `snapshotStorageUsage` — StorageSnapshot rows for GB-hour billing |
| `0 * * * *` | `processTrialExpirations` — TRIAL past trialEndDate → ACTIVE (free plans) or downgrade to Free (unpaid paid-plan trials) |
| `30 * * * *` | `processPaidSubscriptionExpirations` — grace-window renewal reminders; past grace → downgrade to Free |
| `0 2 * * *` | FINALIZED invoices past dueDate → OVERDUE |
| `0 3 * * *` | Auto-generate invoices for ACTIVE subs where `billingDay` = today (skips if period already invoiced) |
| `0 4 * * *` | Cleanup `PendingRegistration` rows older than 24h |

## 18. Webhooks & API Tokens (scaffolded, NOT live)

- **Webhooks:** `WebhookEndpoint` CRUD + a complete dispatcher (`services/webhookDispatcher.js` — HMAC-SHA256 `X-CloudVitta-Signature`, 3 retries with backoff) — **but nothing ever calls `dispatchWebhook`**. Configurable, never fires.
- **API tokens:** created via admin Settings and portal Developer pages (`cv_` + 32 hex; SHA-256 hash stored, raw shown once) — **but no middleware authenticates API-key requests**; `/api/events/ingest` is JWT-only; `lastUsedAt` never updates. Portal API keys are **tenant-scoped, not customer-scoped** (all portal users of a tenant share the list).

## 19. Configuration & Environment Variables

Backend `.env` (template: `backend/.env.example`; a root `.env.example` aggregates all vars, and `frontend/.env.example` documents the optional `VITE_API_URL`). **Note: a real `backend/.env` with live-looking OCI/Brevo/Razorpay credentials exists in the working tree — it is gitignored (never committed), but rotate the keys if they were ever shared elsewhere.**

| Var | Purpose |
|---|---|
| `PORT` | API port (default 3000) |
| `DATABASE_URL` | `file:./dev.db` |
| `JWT_SECRET` / `JWT_EXPIRY` | JWT signing (hardcoded dev fallback exists) / lifetime (7d) |
| `OCI_S3_ENDPOINT` / `OCI_S3_BUCKET` / `OCI_S3_REGION` / `OCI_S3_ACCESS_KEY_ID` / `OCI_S3_SECRET_ACCESS_KEY` | OCI object storage (S3-compat) |
| `GLOBAL_STORAGE_CAP_GB` | Platform-wide storage cap (15) |
| `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` | Transactional email |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay API keys (Test Mode `rzp_test_…`; live migration = swap values only). key_id is sent to the browser via the create-order response |
| `RAZORPAY_WEBHOOK_SECRET` | HMAC secret for `/api/payments/webhook/razorpay` (set when configuring the webhook in the Razorpay dashboard; events: payment.captured, payment.failed, refund.processed) |
| `RENEWAL_GRACE_DAYS` | Days after `currentPeriodEnd` before a lapsed paid sub is downgraded to Free (default 3) |
| `VITE_API_URL` | Documented but **unused** — frontend hardcodes `/api` + Vite proxy |

## 20. Third-Party Services & SDKs

| Service | Use | Integration |
|---|---|---|
| Oracle Cloud Object Storage | File storage | `@aws-sdk/client-s3` v3 against OCI S3-compat endpoint |
| Brevo (Sendinblue) | OTP emails | Raw HTTP v3 API via fetch |
| Razorpay | Payments (Test Mode) | `razorpay` SDK (orders, payment fetch); `node:crypto` HMAC for signature/webhook verification; checkout.js loaded dynamically in the browser |

## 21. Deployment & Infrastructure

**None exists.** No Dockerfile, docker-compose, CI (.github/), or platform configs. Dev-only workflow: local Node processes + SQLite file + Vite dev server with proxy. Deploying would require at minimum: real DB (SQLite → Postgres implies schema/JSON/enum changes), serving the built frontend, HTTPS/CORS config, secret management, and process supervision.

## 22. Development Workflow

```bash
npm run setup          # install + db:push + db:seed
npm run dev            # backend (:3000, node --watch) + frontend (:5173) together
npm run db:push        # apply schema changes (no migrations)
npm run db:seed        # re-seed (preserves real user accounts; resets catalog/billing/storage-metadata)
npm run db:studio      # Prisma Studio
```

**Demo credentials** (password `password123` for all):
- Admin: `admin@cloudvitta.dev` · Member: `member@cloudvitta.dev`
- Portal: `user@acme.com` (Acme — Pro ₹200/mo), `user@techstart.io` (TechStart — Free)

## 23. Important Design Decisions & Trade-offs

1. **`*Cents` field names hold paise** — renaming to `*Paise` after the INR conversion was deemed high-churn/zero-value; semantics ("integer smallest currency unit") unchanged.
2. **Two money representations:** integer paise (`*Cents` DB fields → `formatCurrency`) vs whole-rupee floats (pricing JSON `price`/`unitPrice`, portal `monthlyPrice`, `charges.amount` → `formatRupees`). Mixing them is the top recurring bug class.
3. **Logical buckets over one physical OCI bucket** — cheap multi-tenancy; prefix-based isolation; no per-customer OCI provisioning.
4. **Proxied downloads instead of presigned URLs** — enables metering every GET/egress byte; costs backend bandwidth.
5. **Synchronous in-request metering + 15-min snapshots** — simplicity over ingestion pipeline; JS-side aggregation acceptable at SQLite scale.
6. **Schema-push instead of migrations** — fast dev iteration; no migration history (would need to change for production).
7. **Tenant scoping by convention** (manual `tenantId` in every where) — no global enforcement layer.
8. **Non-destructive seed** — re-runnable demo reset that never deletes real user accounts.
9. **Bandwidth is metered but never billed** — egress/ingress tracked for infra awareness only (admin sees est. infra cost @ ₹7.5/GB).
10. **DB records are the financial source of truth** — Payments/Transactions/Invoices drive all billing UI and reporting; gateway responses are persisted (`Payment.gatewayResponse`, `PaymentWebhookEvent.payload`) but never rendered live.
11. **Claim-guard idempotency over locks** — payment capture uses an atomic status-guarded `updateMany` (CAS) instead of interactive transactions, avoiding SQLite lock contention between the verify endpoint and the webhook; webhook event-id dedup and ledger idempotency keys are the second and third layers.
12. **Downgrade-to-Free on expiry** (not hard-cancel) — a lapsed paid sub keeps the account functional at 500 MB; existing files remain, over-quota uploads get 413.

## 24. Known Limitations & Assumptions

- No tests of any kind; no linting; no TypeScript.
- No proration on plan changes; `taxCents` always 0.
- Account deletion cascades DB rows but **does not delete OCI objects** (orphans remain in the bucket).
- JWT in localStorage (XSS-exfiltratable); portal invoice "download" is a `document.write` print window with unescaped interpolation.
- `zod` and `uuid` are declared deps but never used (validation is ad-hoc); React Query mounted but unused; `CURRENCY_SYMBOL` exported but unused.
- Dead schema features: `Subscription.PAUSED`, `Customer.balanceCents`, `StorageBucket.isPublic`, `SubscriptionComponent.pricingOverride` (stored, never read by billing), `Invoice.notes`.
- Portal contact form is fake (setTimeout + toast, sends nothing).
- Razorpay webhooks require a public tunnel (e.g. ngrok) in local dev — the verify endpoint carries the happy path, but refunds only arrive via webhook.
- README project-structure section is stale (predates storage/portal/users pages and OTP flows).

## 25. Security Posture

**Implemented:** bcrypt 12 (passwords) / 10 (OTPs); CSPRNG OTPs hashed at rest with expiry/attempt-lockout/cooldown; enumeration-safe password reset; session revocation on reset/deactivation; API tokens & webhook secrets from `crypto.randomBytes`, tokens stored as SHA-256; object-key sanitization; org-level tenant validation; CORS restricted to localhost:5173; **`helmet` HTTP security headers**; **request logging** (method, path, status, duration); **fail-closed auth** (no dev secret fallback, DB errors → 401); **RBAC (`requireAdminOrMember`) on all 15 admin CRUD route files**; **tenant-scoped IDOR guards on all mutation endpoints**; **Content-Disposition filename sanitization** on downloads; **customer isolation on storage upload/delete** for portal users; coupon discount range validation.

**Remaining gaps (ranked):**
1. JWT in localStorage (XSS-exfiltratable) — httpOnly cookies would require CORS changes.
2. No HTTP rate limiting (only OTP cooldowns).
3. Live-looking credentials present in the local `backend/.env` (gitignored — not committed; rotate if ever shared outside this machine).
4. Portal API keys tenant-scoped (shared across a tenant's portal users), not customer-scoped.

## 26. Outstanding TODOs / Future Improvements

- Wire up webhook dispatch (call `dispatchWebhook` from invoice/subscription events) and API-key authentication middleware (then honor `expiresAt`/`lastUsedAt`).
- Tax (GST) calculation, proration/credits on plan change; Razorpay recurring billing / e-mandates (`Subscription.autoRenew` is reserved for this).
- Adopt zod for comprehensive input validation; add HTTP rate limiting; move JWT to httpOnly cookies.
- Delete OCI objects on account deletion; use notification preferences before creating notifications.
- Invoice PDF generation + email delivery; billing emails generally.
- Postgres migration + Prisma migrations for production; deployment setup (Docker/CI).
- Remove dead code: React Query (or adopt it), unused frontend assets, duplicate `.progress-bar` CSS.
- Tests (none exist).

---

## Maintenance Protocol for This Document

When completing any significant change, update the affected section(s) above and the "Last synchronized" date in the header. Significant = new feature, API surface change, schema change, auth/security change, pricing/currency change, new integration or dependency, deployment/infrastructure change, or fixing anything listed in §24–26 (remove it from the list when done). Keep entries factual and current-state; move superseded facts out rather than appending history.
