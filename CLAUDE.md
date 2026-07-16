# CloudVitta — Project Instructions

## Read CONTEXT.md first
`CONTEXT.md` at the project root is the single source of truth for architecture, business logic, schema, API surface, security posture, and known limitations. Consult it before making non-trivial changes.

## Keep CONTEXT.md synchronized (mandatory)
Whenever you implement a **significant change**, update the affected sections of `CONTEXT.md` in the same piece of work, plus the "Last synchronized" date in its header. Significant changes include:
- New features or API endpoints, or changes to existing endpoint behavior
- Prisma schema modifications
- Authentication, authorization, or session changes
- Pricing, currency, plan, or billing-logic changes
- New integrations, SDKs, or third-party services
- Security improvements (also remove fixed items from CONTEXT.md §24–26)
- Deployment/infrastructure/configuration changes
- Major refactors or architectural changes

Keep CONTEXT.md factual and current-state — replace superseded facts, don't append history.

## Project quick facts
- npm-workspaces monorepo: `backend/` (Express 5 + Prisma/PostgreSQL, ESM) + `frontend/` (React 18 + Vite + Tailwind v4).
- **Currency is INR (₹)**. Money is integer paise in `*Cents`-named fields; plan pricing JSON uses whole-rupee floats. Frontend formatting goes through `frontend/src/lib/currency.js` (`formatCurrency` for paise, `formatRupees` for whole rupees) — never hardcode `$` or re-add inline formatters.
- DB workflow: `npm run db:push` (no migrations) + `npm run db:seed` (non-destructive for user accounts).
- Dev: `npm run dev` (backend :3000, frontend :5173 with /api proxy). Admin account is provisioned by `npm run db:seed` from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (see CONTEXT.md §22); no demo logins exist.
- No tests exist; verify changes by running the app.
