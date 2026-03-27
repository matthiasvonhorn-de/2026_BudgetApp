# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server → http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint

# Electron desktop build
npm run electron:dev         # Run Electron with current build
npm run electron:build       # Build macOS app (zip)
```

## Database

**Prisma v7 + libSQL adapter** — does NOT use standard `prisma migrate`. Apply schema changes manually:

```bash
# After editing prisma/schema.prisma:
npx prisma generate          # Regenerate client types
# Apply SQL changes manually via sqlite3 or direct SQL:
sqlite3 prisma/dev.db "ALTER TABLE ..."
```

Database file: `prisma/dev.db`. Singleton client in `src/lib/prisma.ts` uses `PrismaLibSql` adapter configured in `prisma.config.ts`.

## Architecture

### Request flow
`src/app/(app)/[page]/page.tsx` (client component) → TanStack Query hook → `fetch('/api/...')` → `src/app/api/[resource]/route.ts` → Prisma → `prisma/dev.db`

### Key patterns
- **API routes**: Each resource has `route.ts` with GET/POST handlers + `[id]/route.ts` for PUT/DELETE. Validate input with Zod, return `Response.json(data)`.
- **Data fetching**: TanStack Query (`useQuery`, `useMutation`). Mutations call `queryClient.invalidateQueries()` to refetch.
- **Forms**: react-hook-form + Zod v4 via shadcn `FormField`. **Zod v4 uses `.issues` not `.errors`; no `z.string().default()` in schemas** — handle defaults in component logic.
- **State**: Zustand stores in `src/store/` for cross-component state (import wizard, UI month selection, settings).

### Directory layout
```
src/app/(app)/          # All main pages (dashboard, accounts, transactions, budget, etc.)
src/app/api/            # API route handlers per resource
src/components/         # UI components grouped by feature (accounts/, transactions/, import/, settings/, layout/)
src/components/ui/      # shadcn/ui primitives (do not modify)
src/lib/                # Business logic: budget/calculations.ts, csv/parser.ts, rules/matcher.ts, loans/amortization.ts
src/store/              # Zustand stores
src/hooks/              # Custom React hooks
```

### Data model key points
- **Categories are per-account**: `CategoryGroup.accountId` is required — groups/categories/budgets are scoped to a specific account.
- **Amount convention**: Negative = expense, Positive = income.
- **Transaction status**: `PENDING` → `CLEARED` → `RECONCILED`.
- **Duplicate detection**: `Transaction.importHash` unique index.
- **Budget**: `BudgetEntry` unique on `(categoryId, month, year)`.

## Conventions

- **Currency**: Always use `useFormatCurrency()` hook from `src/hooks/`.
- **Month names**: Always use `getMonthName(month, year)` from `@/lib/budget/calculations`.
- **Dropdowns**: Show human-readable labels (use `ACCOUNT_TYPE_LABELS` etc.), never raw enum values.
- **New pages**: Place in `src/app/(app)/`.
- **New dialogs/modals**: Standalone components in `src/components/[feature]/`.
- **Path alias**: `@/*` → `src/*`.

## Critical gotchas

- `prisma migrate dev` **does not work** with the libSQL adapter — use manual SQL + `prisma generate`.
- Zod v4: `.issues` not `.errors`; no `.default()` on string fields in form schemas.
- `next.config.ts` sets `output: "standalone"` and externalizes Prisma packages — required for Electron packaging.
