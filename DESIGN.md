# CloudVitta — Design System

> **⚠️ LIVING DOCUMENT — KEEP IN SYNC.** This file is the single source of truth for CloudVitta's design system. It describes the **actual implementation** (primarily `frontend/src/index.css` and the component patterns used across pages), never an aspirational one. Whenever a significant UI/UX change lands — new tokens, components, layout patterns, animation conventions — update the affected sections here in the same piece of work.
>
> Last synchronized: 2026-07-16 (initial version, written alongside the public landing page).

---

## 1. Design Philosophy

CloudVitta uses an **enterprise dark** aesthetic: a near-black canvas, layered zinc surfaces, restrained blue accents, and dense-but-legible data displays. Guiding principles:

1. **Function over decoration.** Glows and gradient cosmetics were deliberately removed (`.glow-primary`, `.gradient-text` are intentional no-ops kept for backwards compatibility). Visual interest comes from hierarchy, spacing, and subtle borders — not effects.
2. **One design system, one file.** All tokens and component classes live in `frontend/src/index.css` (Tailwind v4 `@theme` + plain CSS component classes). There is no `tailwind.config.js`; Tailwind v4 reads the CSS-based config.
3. **Truthful UI.** Screens render real data from the API. No fake statistics, placeholder charts, or aspirational marketing claims — this applies to product pages *and* the landing page.
4. **Consistency across surfaces.** The admin app, customer portal, auth screens, and landing page share the same tokens, buttons, cards, and typography so the product feels like one application end to end.

## 2. Brand Identity

- **Name:** CloudVitta — multi-tenant cloud object storage with metering, subscriptions, and billing built in.
- **Logo mark:** lucide `Zap` icon, white, inside a `rounded-lg`/`rounded-xl` square filled with `cv-primary` blue. Wordmark: "CloudVitta" in bold `cv-text`.
  - Sidebar/nav scale: 32px box (`w-8 h-8`), icon `size={18}`, wordmark `text-lg font-bold`.
  - Auth-page scale: 48px box (`w-12 h-12`), icon `size={24}`, wordmark `text-3xl font-bold`.
- **Voice:** professional, plain-spoken, honest. Feature claims must map to shipped capabilities.
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

**Rules:** never hardcode hex colors in components (the few remaining `zinc-800`-style utilities in older pages are legacy — prefer tokens for new work). Status colors are always paired with a 12%-opacity background and 20%-opacity border (see badges).

**Dark-only:** there is no light mode. Do not add per-component light variants.

## 4. Typography

- **Family:** `Inter` (Google Fonts, weights 300–800, loaded in `index.html`), falling back to `system-ui, -apple-system, sans-serif`. Set globally via `--font-sans`.
- **Scale in practice:**
  - Page titles: `text-2xl font-bold text-cv-text`
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
- **Content max-widths:** admin `max-w-screen-xl`, portal `max-w-6xl`, landing sections `max-w-6xl` (FAQ/prose `max-w-3xl`), auth cards `max-w-md`.
- **Radii:** `6px` (buttons, inputs, nav links), `10px` (cards, dropzones — `.glass-card`), `rounded-lg`/`rounded-xl` for icon chips, `rounded-full` for badges, avatars, meters.

## 6. Layout Principles

Three shell patterns:

1. **Admin shell (`AppLayout`):** fixed 256px left sidebar (`bg-cv-surface`, `border-r`), sectioned nav with uppercase dividers, tenant switcher (admins), user block + logout at bottom; scrollable main column.
2. **Portal shell (`CustomerLayout`):** same pattern at 240px width, flat nav list, notification bell with unread badge in the user block.
3. **Full-page (auth + landing):** no sidebar. Auth pages center a `max-w-md` card on `bg-cv-bg`. The landing page uses a sticky translucent header (`bg-cv-bg/85 backdrop-blur-md border-b`), full-width sections separated by `border-t border-cv-border`, and alternating `bg-cv-surface/40` bands for rhythm.

Data pages follow: **title block** (h1 + one-line description) → optional KPI card row (`grid md:grid-cols-2 lg:grid-cols-4`) → content cards/tables.

## 7. Component Hierarchy & Reusable Components

**CSS component classes** (in `index.css`):

| Class | Purpose |
|---|---|
| `.glass-card` | Standard card: `cv-surface` bg, 1px `cv-border`, 10px radius, soft shadow |
| `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-ghost` / `.btn-sm` | Buttons; primary = solid blue, secondary = surface w/ border, danger = red tint |
| `.form-input`, `.form-label` | Inputs (dark bg, `cv-border-light`, blue focus ring) and uppercase labels |
| `.data-table` | Full-width tables, uppercase headers, row hover |
| `.badge` + `.badge-{active,trial,pending,cancelled,draft,paid,finalized,overdue,void,captured,failed,refunded}` | Status pills (12% bg / 20% border tinted by status) |
| `.sidebar-link` (+ `.active`) | Nav rows with 2px left accent bar when active |
| `.progress-bar` / `.progress-bar-fill` | 8px quota/usage bars (gradient fill; turns `cv-danger` >90%) |
| `.storage-meter` / `.storage-meter-fill` | 6px slim variant |
| `.dropzone` (+ `.active`) | Dashed upload target, blue tint on hover/drag |
| `.landing-grid-bg` | Faded grid backdrop (hero/CTA sections) |
| `.reveal` / `.reveal-visible` | Scroll-reveal animation pair (landing) |

**React components:** `components/ui/LoadingSpinner`, `components/ui/ErrorBanner` (message + retry), layout shells above. Pages compose these directly — there is no larger component library; prefer these primitives over new abstractions or third-party UI kits.

**Icons:** `lucide-react` exclusively. Sizes: 13–16px inline/buttons, 18px nav, 20px KPI chips, 24px logo. Icon chips: icon inside a `w-9/w-10 h-9/h-10 rounded-lg` square with `cv-surface-3` bg + `cv-border` border.

**Charts:** Recharts (Area/Line/Bar) with `cv-*` stroke/fill colors, used only where real data exists.

**Toasts:** `sonner`, top-right, dark-styled in `main.jsx`, with viewport-overflow hardening.

## 8. Navigation Philosophy

- Route structure lives entirely in `App.jsx`: public `/` (landing) + auth pages; `/portal/*` for customers; `/dashboard` and other admin paths under the admin shell.
- Role-based redirects: signed-in customers land on `/portal`, admins/members on `/dashboard`; guards (`ProtectedRoute`/`AdminRoute`/`UserRoute`) bounce users to their correct surface.
- Sidebars are the single navigation source inside the app (no breadcrumbs, no top nav). Active state = `.sidebar-link.active` (surface bg + left accent).
- The landing page uses in-page anchor navigation (`#features`, `#pricing`, …) with `scroll-mt-16` targets under the sticky header, plus Log in / Create account CTAs. Signed-in visitors see an "Open portal/dashboard" shortcut instead.

## 9. Responsive Design Guidelines

- Breakpoints: Tailwind defaults; `md:` (768px) and `lg:` (1024px) do most of the work; landing also uses `sm:` (640px).
- Card grids collapse: `grid-cols-1 md:grid-cols-2 lg:grid-cols-{3,4}`.
- Landing header collapses to a hamburger menu below `md`; hero CTAs stack (`flex-col sm:flex-row`, `w-full sm:w-auto`).
- App sidebars are fixed-width and not currently responsive (desktop-first admin tooling); new marketing/auth surfaces **must** be fully responsive down to ~360px.
- Typography steps down one size at mobile (`text-4xl sm:text-6xl` pattern).

## 10. Accessibility Standards

- Semantic landmarks (`header`, `nav`, `main`, `footer`, `section`) on the landing page; heading levels are hierarchical (one `h1` per page).
- Interactive elements are real `<button>`/`<a>`/`<Link>` elements; toggles carry `aria-expanded`, icon-only buttons carry `aria-label`; decorative visuals (grid backdrops, product mockups) are `aria-hidden`.
- Focus: `.form-input` has a visible blue focus ring; keep default focus outlines on links/buttons.
- Motion: `prefers-reduced-motion: reduce` disables reveal/fade animations and smooth scrolling (in `index.css`).
- Contrast: `cv-text-secondary` on `cv-bg`/`cv-surface` meets AA for body text; do not use `cv-text-muted` for essential copy at small sizes.

## 11. Animation Principles

Subtle, fast, and one-directional — motion communicates entry, never decorates:

- `.animate-fade-in` (0.3s rise + fade) for page/panel mounts; `.animate-slide-in` (0.25s) for list items.
- `.reveal`/`.reveal-visible` (0.55s ease, 16px rise) for scroll-triggered section entry on the landing page, staggered with inline `transition-delay` (~50–100ms steps), driven by a one-shot IntersectionObserver.
- Micro-transitions: 0.12–0.2s ease on hover/color/border changes; meters/progress fills animate width over 0.5–0.6s.
- `.animate-spin` for loading spinners.
- Nothing loops, bounces, or parallaxes. All entry animations respect reduced-motion (§10).

## 12. UI Patterns

- **KPI card:** label (uppercase muted xs) → value (2xl bold) → context line, with an icon chip top-right; optional progress bar underneath.
- **Empty states:** centered icon + short message + primary action inside a `glass-card`.
- **Loading:** centered spinner in an `h-64` container (or `LoadingSpinner`).
- **Errors:** `ErrorBanner` with retry; mutations report via `sonner` toasts.
- **Confirmation:** destructive actions use `confirm()` today; style destructive buttons `.btn-danger`.
- **Tabs:** pill group in a `bg-cv-surface-2 p-1 rounded-lg` container; active pill = solid `cv-primary`.
- **Accordions (FAQ):** bordered cards, chevron rotates 180° when open, panel fades in.
- **Modals:** fixed overlay + centered `glass-card` (portal patterns).

## 13. Currency & Data Display Rules

- **All money is INR.** Format through `frontend/src/lib/currency.js`: `formatCurrency(paise)` for `*Cents` fields (integer paise), `formatRupees(amount)` for whole-rupee floats (plan JSON, `monthlyPrice`). **Never hardcode `$` or add inline formatters.** Static marketing copy may write `₹200/month` literally, matching seeded pricing.
- Bytes: local `formatBytes` helpers (1024-based, two decimals).
- Dates: `date-fns` or `toLocaleDateString` — prefer `en-IN`/locale-neutral formats for new code.

## 14. Visual Consistency Rules

1. New surfaces must use `cv-*` tokens and existing component classes before inventing new ones.
2. No new UI frameworks or component libraries — React + Tailwind v4 + lucide + Recharts + sonner is the complete kit.
3. One icon set (lucide). No emojis in new UI chrome (legacy notification icons are the exception).
4. Buttons: exactly one `.btn-primary` per view section; secondary actions use `.btn-secondary`/`.btn-ghost`.
5. Every claim rendered in marketing surfaces (landing, help/about) must correspond to a shipped feature.
6. Keep the intentional no-op classes (`.glow-*`, `.gradient-text`) untouched; don't reintroduce glow/gradient cosmetics.

## 15. Future Design Guidelines

When extending the design system:

- Add new tokens to the `@theme` block (never scatter raw values), and document them in §3.
- New component classes go in `index.css` under a labeled `─── Section ───` banner comment, matching existing naming (`.thing`, `.thing-variant`).
- If the app ever needs a light theme, introduce it via token remapping (CSS vars), not per-component overrides.
- Prefer extracting a shared React component once a pattern appears on 3+ pages.
- Landing/marketing pages must remain fully responsive and reduced-motion-safe; app shells may stay desktop-first until a mobile requirement lands.
- **Update this document** (and the header date) whenever any of the above changes — same rule as `CONTEXT.md`.
