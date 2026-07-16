# CloudVitta — Design System

> **⚠️ LIVING DOCUMENT — KEEP IN SYNC.** This file is the single source of truth for CloudVitta's design system. It describes the **actual implementation** (primarily `frontend/src/index.css`, `frontend/src/components/ui/`, `frontend/src/lib/`, and the component patterns used across pages), never an aspirational one. Whenever a significant UI/UX change lands — new tokens, components, layout patterns, animation conventions — update the affected sections here in the same piece of work.
>
> Last synchronized: 2026-07-16 (app-wide UI/UX consistency pass: shared component library, chart theme, date/byte formatters, mobile drawers, accessibility sweep).

---

## 1. Design Philosophy

CloudVitta uses an **enterprise dark** aesthetic: a near-black canvas, layered zinc surfaces, restrained blue accents, and dense-but-legible data displays. Guiding principles:

1. **Function over decoration.** Glows and gradient cosmetics were removed entirely (`.glow-primary`, `.glow-accent`, `.gradient-text` no longer exist — do not reintroduce them). Visual interest comes from hierarchy, spacing, and subtle borders — not effects.
2. **One design system, one file.** All tokens and component classes live in `frontend/src/index.css` (Tailwind v4 `@theme` + plain CSS component classes). There is no `tailwind.config.js`; Tailwind v4 reads the CSS-based config.
3. **Truthful UI.** Screens render real data from the API. No fake statistics, placeholder charts, or aspirational marketing claims — this applies to product pages *and* the landing page.
4. **Consistency across surfaces.** The admin app, customer portal, auth screens, and landing page share the same tokens, buttons, cards, typography, and shared React components so the product feels like one application end to end.

## 2. Brand Identity

- **Name:** CloudVitta — multi-tenant cloud object storage with metering, subscriptions, and billing built in.
- **Logo mark:** lucide `Zap` icon, white, inside a `rounded-lg`/`rounded-xl` square filled with `cv-primary` blue. Wordmark: "CloudVitta" in bold `cv-text`.
  - Sidebar/nav scale: 32px box (`w-8 h-8`), icon `size={18}`, wordmark `text-lg font-bold`.
  - Auth-page scale: 48px box (`w-12 h-12`), icon `size={24}`, wordmark `text-3xl font-bold`.
- **Voice:** professional, plain-spoken, honest. Feature claims must map to shipped capabilities. Auth entry copy is standardized on **"Sign in"** (never "Log in").
- **Currency is INR (₹)** — see §13.

## 3. Color Palette (design tokens)

Defined in `@theme` in `frontend/src/index.css`; use them as Tailwind utilities (`bg-cv-surface`, `text-cv-text-muted`, `border-cv-border`) or as CSS vars (`var(--color-cv-primary)`).

| Token | Value | Use |
|---|---|---|
| `cv-bg` | `#09090b` | App/page background |
| `cv-surface` | `#18181b` | Cards, sidebars |
| `cv-surface-2` | `#1c1c1e` | Hover states, nested surfaces, window bars |
| `cv-surface-3` | `#27272a` | Active nav, icon chips, progress tracks |
| `cv-border` | `#27272a` | Default borders/dividers |
| `cv-border-light` | `#3f3f46` | Input borders, emphasized borders |
| `cv-text` | `#fafafa` | Primary text |
| `cv-text-secondary` | `#a1a1aa` | Body/secondary text |
| `cv-text-muted` | `#71717a` | Captions, metadata, placeholders |
| `cv-primary` / `cv-accent` | `#3b82f6` | Brand blue: CTAs, active states, links, meters |
| `cv-primary-hover` | `#60a5fa` | Button hover, link hover |
| `cv-primary-muted` / `cv-accent-muted` | `#2563eb` | Gradient endpoints, pressed states |
| `cv-success` | `#22c55e` | Positive status, checkmarks |
| `cv-warning` | `#f59e0b` | Pending/warning status |
| `cv-danger` | `#ef4444` | Errors, destructive actions, >90% quota |
| `cv-info` | `#3b82f6` | Informational status |
| `cv-viz-purple` | `#8b5cf6` | Data-viz only: egress/bandwidth "internal infra" accents |

**Rules:** never hardcode hex colors in components — no raw `zinc-*`, `emerald-*`, `purple-*`, `red-400/500` utilities. The only sanctioned hexes outside `index.css` are in `lib/chartTheme.js` (Recharts requires literal colors; the values mirror the tokens above) and the Razorpay checkout `theme.color` (external SDK requires a literal, commented in code). Status colors are always paired with a ~10–12%-opacity background and 20–30%-opacity border (see badges).

**Dark-only:** there is no light mode. Do not add per-component light variants.

## 4. Typography

- **Family:** `Inter` (Google Fonts, weights 300–800, loaded in `index.html`), falling back to `system-ui, -apple-system, sans-serif`. Set globally via `--font-sans`.
- **Scale in practice:**
  - Page titles: `text-2xl font-bold text-cv-text` (enforced app-wide via `PageHeader`)
  - Landing/display headings: `text-3xl sm:text-4xl font-bold tracking-tight` (hero: up to `text-6xl`)
  - Card/section headings: `text-sm font-semibold`
  - Body: `text-sm text-cv-text-secondary`
  - Metadata/captions: `text-xs text-cv-text-muted` (extremes: `text-[10px]`/`text-[11px]`)
  - KPI values: `text-2xl font-bold`
- **Labels & table headers:** uppercase, `text-xs`/`text-[10px]`, `font-semibold`/`font-bold`, `letter-spacing: 0.05em` (`.form-label`, `.data-table th`, sidebar dividers, landing section eyebrows).
- Antialiasing is applied globally on `body`.

## 5. Spacing & Radius System

Tailwind's default 4px-based scale. Conventions in use:

- **Card padding:** `p-5`–`p-7` (dense KPI cards `p-5`, forms/pricing `p-7`, prose `p-8`).
- **Page gutter:** `p-6` inside layout `<main>`; landing sections use `px-5 sm:px-8` with `py-20 sm:py-24`.
- **Grid gaps:** `gap-4` for card grids, `gap-3` for compact grids, `space-y-*` for stacked lists.
- **Content max-widths:** admin `max-w-screen-xl`, portal `max-w-6xl`, landing sections `max-w-6xl` (FAQ/prose `max-w-3xl`), auth cards `max-w-md`, single-column forms `max-w-xl`–`max-w-3xl`.
- **Radii:** `6px` (buttons, inputs, nav links), `10px` (cards, dropzones — `.glass-card`), `rounded-lg`/`rounded-xl` for icon chips, `rounded-full` for badges, avatars, meters.

## 6. Layout Principles

Three shell patterns:

1. **Admin shell (`AppLayout`):** 256px (`w-64`) left sidebar (`bg-cv-surface`, `border-r`), sectioned nav with uppercase dividers, tenant switcher (admins; closes on outside click/Esc, `aria-expanded`/`role=listbox`), user block + Sign Out at bottom. Logout calls `api.logout()` then clears all `cv_*` localStorage keys.
2. **Portal shell (`CustomerLayout`):** identical pattern at the same `w-64` width, flat nav list, notification bell with unread badge in the user block (dropdown uses lucide `NOTIF_ICONS` map — no emojis).
3. **Full-page (auth + landing):** no sidebar. Auth pages center a `max-w-md` card on plain `bg-cv-bg` (no grid backdrop — `.landing-grid-bg` is landing-only, applied to absolutely-positioned `aria-hidden` decoration layers, never to containers holding interactive content). The landing page uses a sticky translucent header (`bg-cv-bg/85 backdrop-blur-md border-b`), full-width sections separated by `border-t border-cv-border`, and alternating `bg-cv-surface/40` bands for rhythm.

**Mobile (< `md`):** both app shells hide the sidebar and show a sticky topbar (logo + hamburger). The hamburger opens a left drawer (same sidebar content, `role="dialog"` `aria-modal`, backdrop click and Esc to close; nav links close the drawer on navigate).

Data pages follow: **title block** (h1 + one-line description, or `PageHeader`) → optional KPI card row (`grid md:grid-cols-2 lg:grid-cols-4`) → content cards/tables.

## 7. Component Hierarchy & Reusable Components

**CSS component classes** (in `index.css`):

| Class | Purpose |
|---|---|
| `.glass-card` | Standard card: `cv-surface` bg, 1px `cv-border`, 10px radius, soft shadow |
| `.card-header` | Card header strip: `px-5 py-4 border-b` |
| `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-ghost` / `.btn-sm` | Buttons; primary = solid blue, secondary = surface w/ border, danger = red tint. `:disabled` = 55% opacity + `cursor: not-allowed` |
| `.btn-spinner` | 14px inline spinner for busy buttons (`{loading && <span className="btn-spinner" />}`) |
| `.icon-btn` / `.icon-btn-danger` | Square icon-only buttons (hover surface / danger tint). Always pair with `aria-label` |
| `.icon-chip` | 40px icon square: `cv-surface-3` bg + `cv-border` border (KPI cards, list rows) |
| `.form-input`, `.form-label` | Inputs (dark bg, `cv-border-light`, blue focus ring) and uppercase labels — pair with `htmlFor`/`id` |
| `.data-table` | Full-width tables, uppercase headers, row hover |
| `.badge` + `.badge-{active,trial,pending,cancelled,draft,paid,finalized,overdue,void,captured,failed,refunded}` | Status pills (tinted bg/border by status) |
| `.sidebar-link` (+ `.active`) | Nav rows with 2px left accent bar when active |
| `.tab-group` / `.tab-pill` (+ `.active`) | Pill tab bars; active pill = solid `cv-primary` (use via `TabPills`) |
| `.progress-bar` / `.progress-bar-fill` | 8px quota/usage bars (gradient fill; override to `var(--color-cv-danger)` >90%) |
| `.storage-meter` / `.storage-meter-fill` | 6px slim variant |
| `.skeleton` | Shimmering placeholder block (static surface under reduced motion) |
| `.dropzone` (+ `.active`) | Dashed upload target, blue tint on hover/drag |
| `.landing-grid-bg` | Faded grid backdrop — landing page only, on dedicated `aria-hidden` decoration layers (its mask-image would suppress content painting if applied to a content container) |
| `.reveal` / `.reveal-visible` | Scroll-reveal animation pair (landing) |

**Shared React components** (`frontend/src/components/ui/`) — always prefer these over re-implementing:

| Component | API / notes |
|---|---|
| `LoadingSpinner` | `size="sm"|"md"` — centered spinner (`role="status"`). Full-page loads use `md` |
| `ErrorBanner` | `message`, `onRetry` — `role="alert"`, danger-tinted card |
| `Modal` | `open, onClose, title, children, footer, width, dismissable, zIndex` — Esc/backdrop close, focus trap-in + restore, `role="dialog"` `aria-modal`, X close button |
| `ConfirmDialog` | `open, onClose, onConfirm, title, message, confirmLabel, cancelLabel, danger` — replaces native `confirm()`; async-aware busy state. Pattern: hold pending target in state (`deleteTarget`), render one dialog |
| `StatCard` | `icon, label, value, subValue, accent (primary|success|warning|danger|purple|neutral), progress {percent, danger}` — the KPI card |
| `EmptyState` | `icon, title, message, action, compact` — centered icon + copy + optional CTA |
| `PageHeader` | `title, subtitle, backTo, titleIcon, actions` — h1 block with optional back arrow and right-aligned actions |
| `TabPills` | `tabs [{key,label,icon?}], active, onChange` — `role="tablist"`, `aria-selected` |
| `Pagination` | `page, totalPages, onChange` — Prev/Next + "Page X of Y"; renders null when ≤1 page. Used by every paginated list |
| `Skeleton` / `TableSkeleton` | `TableSkeleton({rows, cols})` renders a shimmer `<tbody>` for table loading states |
| `OtpInput` (+ `OtpExpiryBar`, `OtpResend`) | Controlled 6-digit group (auto-advance, paste, arrows, `focusFirst()` ref); expiry countdown bar; resend-with-cooldown affordance |

**Shared libs** (`frontend/src/lib/`):

- `currency.js` — `formatCurrency(paise)`, `formatRupees(amount)` (§13).
- `format.js` — `formatBytes(bytes)` (1024-based, 2 decimals) and `formatDate(date, style)` with styles `short` (16 Jul 2026), `long`, `datetime`, `monthDay`; locale is `en-IN` everywhere; falsy/invalid dates render `—`.
- `chartTheme.js` — `CHART_COLORS` (8-color categorical ramp), `PRIMARY`, `PRIMARY_HOVER`, `GRID_STROKE`, `AXIS_STROKE`, `TOOLTIP_STYLE` for all Recharts usage.
- `uiMaps.js` — `ROLE_BADGES`, `PAYMENT_BADGES`, `EVENT_LABELS`, `getFileIcon(contentType)` (icon + token color class), `parseUA(ua)`.

**Icons:** `lucide-react` exclusively — no emojis anywhere in UI chrome. Sizes: 13–16px inline/buttons, 18px nav, 20px KPI chips, 24px logo.

**Charts:** Recharts (Area/Line/Bar/Pie) themed via `chartTheme.js`, used only where real data exists.

**Toasts:** `sonner`, top-right, dark-styled in `main.jsx` via `cv-*` CSS vars.

## 8. Navigation Philosophy

- Route structure lives entirely in `App.jsx`: public `/` (landing) + auth pages; `/portal/*` for customers; `/dashboard` and other admin paths under the admin shell.
- Role-based redirects: signed-in customers land on `/portal`, admins/members on `/dashboard`; guards (`ProtectedRoute`/`AdminRoute`/`UserRoute`) bounce users to their correct surface.
- Sidebars are the single navigation source inside the app (no breadcrumbs except object-key paths in bucket views, no top nav). Active state = `.sidebar-link.active`.
- In-app navigation always uses React Router `Link`/`useNavigate` — never `window.location.href` or raw `<a href>` for internal routes.
- The landing page uses in-page anchor navigation (`#features`, `#pricing`, …) with `scroll-mt-16` targets under the sticky header, plus Sign in / Create account CTAs. Signed-in visitors see an "Open portal/dashboard" shortcut instead.

## 9. Responsive Design Guidelines

- Breakpoints: Tailwind defaults; `md:` (768px) and `lg:` (1024px) do most of the work; landing also uses `sm:` (640px).
- Card grids collapse: `grid-cols-1 md:grid-cols-2 lg:grid-cols-{3,4}`; two-column form grids use `grid-cols-1 sm:grid-cols-2`.
- **App shells are responsive:** below `md` the sidebar becomes a hamburger-triggered drawer (§6). Page header rows use `flex-wrap` so action buttons drop below the title on narrow screens.
- Landing header collapses to a hamburger menu below `md`; hero CTAs stack (`flex-col sm:flex-row`, `w-full sm:w-auto`).
- Typography steps down one size at mobile (`text-4xl sm:text-6xl` pattern).

## 10. Accessibility Standards

- Semantic landmarks (`header`, `nav`, `main`, `footer`, `section`); heading levels are hierarchical (one `h1` per page — `text-2xl font-bold`).
- Interactive elements are real `<button>`/`<a>`/`<Link>` elements. Icon-only buttons carry `aria-label`; toggles use `role="switch"` + `aria-checked`; accordions use `aria-expanded`; dropdowns use `aria-haspopup`/`aria-expanded`; decorative visuals are `aria-hidden`.
- Modals/drawers: `role="dialog"` `aria-modal`, Esc + backdrop close, focus moves into the panel on open and restores on close (built into `Modal`).
- Focus: `.form-input` has a visible blue focus ring; `.btn`, `.icon-btn`, `.sidebar-link`, `.tab-pill` show a 2px `cv-primary` `:focus-visible` outline.
- Every form input is associated with its label via `htmlFor`/`id` (modals included).
- Loading/error states announce themselves: spinners `role="status"`, error text `role="alert"`.
- Motion: `prefers-reduced-motion: reduce` disables reveal/fade/shimmer animations and smooth scrolling (in `index.css`).
- Contrast: `cv-text-secondary` on `cv-bg`/`cv-surface` meets AA for body text; do not use `cv-text-muted` for essential copy at small sizes.

## 11. Animation Principles

Subtle, fast, and one-directional — motion communicates entry, never decorates:

- `.animate-fade-in` (0.3s rise + fade) for page/panel mounts; `.animate-slide-in` (0.25s) for list items and the mobile drawer.
- `.reveal`/`.reveal-visible` (0.55s ease, 16px rise) for scroll-triggered section entry on the landing page, staggered with inline `transition-delay`, driven by a one-shot IntersectionObserver.
- `.skeleton` shimmer (1.4s loop) for table/content placeholders — the one sanctioned looping animation; becomes a static block under reduced motion.
- Micro-transitions: 0.12–0.2s ease on hover/color/border changes; meters/progress fills animate width over 0.5–0.6s.
- `.animate-spin` for spinners (`LoadingSpinner`, `.btn-spinner`).
- Nothing bounces or parallaxes. All entry animations respect reduced-motion (§10).

## 12. UI Patterns

- **KPI card:** use `StatCard` — label (uppercase muted xs) → value (2xl bold) → context line, icon chip top-right via `accent`; optional `progress`.
- **Empty states:** use `EmptyState` (compact variant inside cards, full variant for whole-page empties, `action` for CTAs).
- **Loading:** `LoadingSpinner` for page/panel loads; `TableSkeleton` inside `.data-table` for list fetches; `.btn-spinner` + disabled for submitting buttons.
- **Errors:** `ErrorBanner` with retry for page-level failures; inline `role="alert"` text for list-level failures; mutations report via `sonner` toasts. No silent `.catch(() => {})` on primary data fetches.
- **Confirmation:** destructive actions (delete/revoke/cancel/void/deactivate) always go through `ConfirmDialog` with `danger` — native `confirm()` is banned.
- **Tabs:** `TabPills` everywhere (status filters, settings sections, catalog tabs).
- **Pagination:** `Pagination` under every paginated table.
- **Accordions (FAQ):** bordered cards, chevron rotates when open, `aria-expanded`, panel fades in.
- **Modals:** always the shared `Modal` (or `ConfirmDialog`); never hand-rolled overlays. The Razorpay "verifying payment" overlay is the one sanctioned bespoke overlay (non-dismissable, `role="dialog"` + `aria-label`).

## 13. Currency & Data Display Rules

- **All money is INR.** Format through `frontend/src/lib/currency.js`: `formatCurrency(paise)` for `*Cents` fields (integer paise), `formatRupees(amount)` for whole-rupee floats (plan JSON, `monthlyPrice`, chart values). **Never hardcode `$`, never template `₹${...}` in pages.** Static marketing copy may write `₹200/month` literally, matching seeded pricing.
- Bytes: `formatBytes` from `lib/format.js` (1024-based, two decimals) — no local copies.
- Dates: `formatDate(date, style)` from `lib/format.js` (`en-IN`, styles `short`/`long`/`datetime`/`monthDay`) — direct `toLocaleDateString`/`toLocaleString` calls on dates are banned in pages. `Number.toLocaleString()` for counts is fine.

## 14. Visual Consistency Rules

1. New surfaces must use `cv-*` tokens and the shared components (§7) before inventing new ones.
2. No new UI frameworks or component libraries — React + Tailwind v4 + lucide + Recharts + sonner is the complete kit.
3. One icon set (lucide). No emojis in UI chrome.
4. Buttons: exactly one `.btn-primary` per view section; secondary actions use `.btn-secondary`/`.btn-ghost`; icon-only actions use `.icon-btn`(+`-danger`).
5. Every claim rendered in marketing surfaces (landing, help/about) must correspond to a shipped feature.
6. Do not reintroduce glow/gradient cosmetics (`.glow-*`, `.gradient-text` were removed).
7. Recharts colors come from `chartTheme.js` only.
8. Role/payment/event-label mappings come from `uiMaps.js` — no per-page copies.

## 15. Future Design Guidelines

When extending the design system:

- Add new tokens to the `@theme` block (never scatter raw values), and document them in §3.
- New component classes go in `index.css` under a labeled `─── Section ───` banner comment, matching existing naming (`.thing`, `.thing-variant`).
- If the app ever needs a light theme, introduce it via token remapping (CSS vars), not per-component overrides.
- Extract a shared React component once a pattern appears on 3+ pages (this is how `StatCard`, `Modal`, `TabPills`, etc. came to exist — follow their prop-style: config via props, no context).
- All surfaces (app shells included) must remain responsive down to ~360px and reduced-motion-safe.
- **Update this document** (and the header date) whenever any of the above changes — same rule as `CONTEXT.md`.
