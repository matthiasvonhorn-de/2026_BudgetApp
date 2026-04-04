# Step 5: Project Documentation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default Next.js README boilerplate with a project-specific document covering overview, stack, architecture, operations, and conventions.

**Architecture:** Single task — rewrite `README.md`. `CLAUDE.md` is left unchanged (Claude-specific guidance, not general project docs). Branch: `docs/readme`, base: `main` (or the most recently merged improvement branch).

**Tech Stack:** Markdown

---

## File Map

**Modified:**
- `README.md` — complete replacement of Next.js boilerplate

---

## Task 1: Replace README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Branch setup**

```bash
# Base on the last merged improvement branch (or main if all previous PRs are merged)
git checkout main && git pull
git checkout -b docs/readme
```

- [ ] **Step 2: Read the current README.md**

Run: `cat README.md`
Confirm it is the default Next.js boilerplate ("This is a Next.js project bootstrapped with..."). If it already has custom content, preserve useful sections.

- [ ] **Step 3: Write the new README.md**

Replace the entire file with the following content (adapt any details that differ from the current codebase state):

```markdown
# BudgetApp

A personal budget and savings tracker for desktop use. Runs locally in the browser (development) or as a standalone Electron app.

---

## Overview

BudgetApp implements envelope-style budgeting (inspired by YNAB): income is assigned to categories, expenses draw from those envelopes, and leftover amounts roll over month to month.

Key features:
- **Accounts** — physical bank accounts (Giro, Savings, Credit Card, Cash) with IBAN, balance, reconciliation
- **Transactions** — manual entry and CSV import with automatic deduplication and rule-based categorisation
- **Budget** — monthly category envelopes with rollover and "Ready to Assign" calculation
- **Savings plans** — SPARPLAN and FESTGELD accounts with interest/contribution schedules and booking
- **Reports** — monthly income/expense summary and category spending breakdown

---

## Stack

| Technology | Version | Why |
|---|---|---|
| Next.js (App Router) | 16 | Full-stack React with file-based API routes |
| TypeScript | 5 | Type safety across routes, services, and UI |
| Prisma | 7 + libSQL adapter | ORM for SQLite; adapter required for Electron packaging |
| SQLite (libSQL) | — | Embedded database; no server required |
| Zod | 4 | Schema validation at API boundaries; shared types via `z.infer<>` |
| TanStack Query | 5 | Data fetching, caching, mutation with automatic refetch |
| Zustand | — | Cross-component state (import wizard, month selector, settings) |
| shadcn/ui + Tailwind CSS | — | Component library built on Radix UI primitives |
| Electron | 41 | Desktop packaging; bundles the Next.js standalone build |
| Playwright | — | End-to-end tests against a running dev server |

---

## Architecture

### Request flow

```
Browser / Electron
  → src/app/(app)/[page]/page.tsx   (React client component)
  → TanStack Query useQuery / useMutation
  → fetch('/api/...')
  → src/app/api/[resource]/route.ts  (Next.js App Router route)
  → src/lib/services/savingsService.ts  (service layer, Savings domain only)
  → Prisma client
  → prisma/dev.db  (SQLite)
```

### Error handling

All route handlers are wrapped with `withHandler` from `src/lib/api/handler.ts`:

```ts
export const GET = withHandler(async (_, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params
  const data = await savingsService.getSavings(id)
  return NextResponse.json(data)
})
```

`withHandler` catches:
- `ZodError` → HTTP 400 with `{ error: issues }`
- `DomainError` → HTTP 4xx with `{ error: message }` (status set by the thrower)
- Unknown errors → HTTP 500 + `console.error`

### Schema sharing

Zod schemas for Savings, Accounts, and Transactions live in `src/lib/schemas/`. Routes import the schema for `.parse()`; components and tests import the inferred TypeScript type.

```ts
// src/lib/schemas/savings.ts
export const SavingsCreateSchema = z.object({ ... })
export type SavingsCreateInput = z.infer<typeof SavingsCreateSchema>
```

### Savings service

`src/lib/services/savingsService.ts` is the only service layer. It owns all savings business logic (schedule generation, payment booking, lazy-extend) and throws `DomainError` for domain errors. Routes are thin: parse input → call service → return JSON.

---

## Operations

### Start in development

```bash
npm run dev          # Next.js dev server → http://localhost:3000
npm run electron:dev # Open Electron window pointed at the dev server
```

### Production build

```bash
npm run build              # Next.js production build (standalone)
npm run electron:build     # Package as macOS .zip via electron-builder
```

### Database

The database file is `prisma/dev.db` (SQLite, not committed to git).

**Important:** `prisma migrate dev` does **not** work with the libSQL adapter. Apply schema changes manually:

```bash
# After editing prisma/schema.prisma:
npx prisma generate                    # Regenerate Prisma client types
sqlite3 prisma/dev.db "ALTER TABLE ..." # Apply SQL change
```

### Running tests

```bash
# Start the dev server first (tests run against http://localhost:3000):
npm run dev

# In a second terminal:
npx playwright test                         # All tests
npx playwright test tests/savings/          # Savings tests only
npx playwright test tests/savings/ --headed # With browser UI
```

---

## Conventions

### Amount sign convention

Negative = expense, positive = income. Budget envelopes store negative budgeted amounts (e.g. `budgeted = -600`). Available = `rolledOver + activity - budgeted`.

### Categories are per-account

`CategoryGroup.accountId` is required. Every group, category, and budget entry is scoped to a specific account. There is no global category list.

### Branch naming

| Prefix | Use |
|---|---|
| `feature/` | New user-facing functionality |
| `fix/` | Bug fixes |
| `chore/` | Refactoring, dependencies, tooling |
| `docs/` | Documentation only |

### Commit style

Short imperative subject line (under 72 characters). No ticket numbers required for personal use. Co-authored-by line added by Claude Code when AI-assisted.

### PR workflow

1. Branch off `main`, push, open as **Draft** immediately after first commit
2. Mark **Ready for Review** only when explicitly requested
3. Merge in GitHub UI; delete branch and pull `main` locally after merge

### Path aliases

`@/*` → `src/*` (configured in `tsconfig.json` and `next.config.ts`)

---

## Key gotchas

- `prisma migrate dev` requires a `datasource.url` in `schema.prisma` — the libSQL adapter uses `prisma.config.ts` instead. Always use manual SQL + `prisma generate`.
- Zod v4: use `.issues` not `.errors`; do not use `.default()` on string fields in form schemas (handle defaults in component state instead).
- `next.config.ts` sets `output: "standalone"` and externalises Prisma packages — this is required for Electron packaging and must not be removed.
```

- [ ] **Step 4: TypeScript / build check (sanity)**

Run: `npm run lint 2>&1 | tail -10`
Expected: no new lint errors (README is not linted, but confirms the dev setup still works)

- [ ] **Step 5: Commit and push**

```bash
git add README.md
git commit -m "docs: replace Next.js boilerplate README with project documentation"
git push -u origin docs/readme
gh pr create --draft --title "docs: replace README with project documentation" --body "$(cat <<'EOF'
## Summary
Replaces the default Next.js README boilerplate with a project-specific document covering:
- Overview and key features
- Technology stack with version and rationale
- Architecture: request flow, error handling, schema sharing, savings service
- Operations: dev, build, database migrations, running Playwright tests
- Conventions: amount signs, category scoping, branch naming, PR workflow, gotchas

CLAUDE.md is unchanged.
EOF
)"
```
