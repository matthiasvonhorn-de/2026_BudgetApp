# BudgetApp

Personal budget management app with envelope budgeting (YNAB-style), account tracking, loan amortization, and savings plans. Runs locally as a desktop browser app or Electron app with SQLite storage.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Recharts
- **State**: TanStack Query (server state), Zustand (client state)
- **Backend**: Next.js API Routes, Prisma v7 + libSQL adapter, SQLite
- **Desktop**: Electron (optional)
- **Testing**: Playwright (E2E)

## Getting Started

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Start dev server
npm run dev
# → http://localhost:3000
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run test:e2e:ui` | Playwright with UI |
| `npm run electron:dev` | Run Electron with current build |
| `npm run electron:build` | Build macOS Electron app (zip) |

## Features

### Accounts
Physical bank accounts (checking, savings, credit card, cash, investment) with IBAN, bank name, color coding, drag-and-drop reordering, and reconciliation.

### Transactions
Manual entry and CSV import with duplicate detection (`importHash`). Supports income, expense, and transfer types. Status tracking: Pending → Cleared → Reconciled.

### Envelope Budgeting
YNAB-style budgeting: monthly budget assignments per category, activity tracking, rollover between months. Categories are scoped per account via category groups.

### Categories & Rules
Hierarchical categories (groups → categories) with automatic categorization rules for CSV imports. Rules support field matching (description, payee, amount) with various operators.

### Sub-Accounts
Virtual sub-accounts linked to physical accounts for earmarking funds. Categories can be linked to sub-account groups with booking or transfer semantics.

### Loans
Annuity and installment loan tracking with auto-generated amortization schedules. Supports extra payments (recalculates remaining schedule), paid-until initialization, and linked transaction creation on payment.

### Savings Plans
Sparplan (recurring contributions) and Festgeld (fixed deposit) management. Auto-generated schedules with interest calculations. Pay/unpay entries with linked transactions on savings and giro accounts.

### Reports & Dashboard
Monthly income vs. expense bar chart, category spending pie chart, account overview. Month navigation synced across dashboard and budget views.

## Architecture

```
src/
  app/(app)/           Pages: dashboard, accounts, transactions, budget, etc.
  app/api/             API route handlers per resource
  components/          UI components grouped by feature
  components/ui/       shadcn/ui primitives
  lib/                 Business logic
    api/               withHandler (error handling HOF), DomainError
    budget/            Budget calculations
    csv/               CSV parser
    loans/             Amortization schedule generation
    rules/             Category rule matcher
    savings/           Savings schedule generation
    schemas/           Shared Zod validation schemas
  store/               Zustand stores
  hooks/               Custom React hooks
prisma/
  schema.prisma        Data model
  dev.db               SQLite database file
```

### Request Flow

```
Page (client) → TanStack Query → fetch('/api/...') → API Route → Prisma → SQLite
```

### Key Patterns

- **API error handling**: All routes use `withHandler()` HOF for centralized error handling (Zod validation errors → 400, DomainError → status code, unhandled → 500)
- **Validation**: Zod schemas in `src/lib/schemas/` shared between routes
- **Data fetching**: TanStack Query with `invalidateQueries()` after mutations
- **Forms**: react-hook-form + Zod v4 via shadcn FormField
- **Amount convention**: Negative = expense, Positive = income

## Database

Prisma v7 with libSQL adapter. Does **not** use `prisma migrate dev`. Schema changes are applied manually:

```bash
# After editing prisma/schema.prisma:
npx prisma generate          # Regenerate client types
sqlite3 prisma/dev.db "ALTER TABLE ..."  # Apply SQL changes manually
```

## License

Private project.
