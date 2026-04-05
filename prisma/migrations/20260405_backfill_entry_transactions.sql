-- Migration: Backfill transactions for SubAccountEntries without a linked Transaction
-- This creates CLEARED transactions for each orphaned entry and recalculates account balances.

-- Step 1: Create transactions for entries that have no linked transaction.
-- Uses MIN(c.id) as deterministic categoryId when multiple categories link to same group.
-- transaction.amount = -entry.amount (inverted sign convention)
INSERT INTO "Transaction" (id, date, amount, description, accountId, categoryId, type, status, subAccountEntryId, createdAt, updatedAt)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))) AS id,
  e.date,
  -e.amount AS amount,
  e.description,
  sa.accountId,
  (SELECT MIN(c.id) FROM Category c WHERE c.subAccountGroupId = g.id) AS categoryId,
  CASE WHEN -e.amount > 0 THEN 'INCOME' ELSE 'EXPENSE' END AS type,
  'CLEARED' AS status,
  e.id AS subAccountEntryId,
  datetime('now') AS createdAt,
  datetime('now') AS updatedAt
FROM SubAccountEntry e
JOIN SubAccountGroup g ON e.groupId = g.id
JOIN SubAccount sa ON g.subAccountId = sa.id
WHERE NOT EXISTS (
  SELECT 1 FROM "Transaction" t WHERE t.subAccountEntryId = e.id
);

-- Step 2: DO NOT recalculate currentBalance.
-- Reason: currentBalance may include an implicit initial balance that is NOT
-- captured as a transaction. Recalculating as SUM(transactions) would lose this.
-- The retroactive transactions are historical records only — they do not represent
-- new money movement. Going forward, the increment mechanism on new entries
-- handles balance updates correctly regardless of whether old entries are factored in.
