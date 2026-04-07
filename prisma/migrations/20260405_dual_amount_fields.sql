-- Migration: Replace amount/type with mainAmount/mainType/subAmount/subType
-- Date: 2026-04-05
--
-- NOTE: Steps 1-3 and 7 were applied during dev.db reset.
-- This script handles all remaining steps (4-6, 8).

-- Step 4: Create transactions for orphaned entries (entries without transactions)
INSERT INTO "Transaction" (id, date, mainAmount, mainType, subAmount, subType, description, accountId, categoryId, status, subAccountEntryId, createdAt, updatedAt)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  e.date,
  NULL,
  'INCOME',
  e.amount,
  CASE WHEN e.amount > 0 THEN 'INCOME' ELSE 'EXPENSE' END,
  e.description,
  sa.accountId,
  (SELECT c.id FROM Category c WHERE c.subAccountGroupId = g.id AND c.groupId IS NOT NULL ORDER BY c.id LIMIT 1),
  'CLEARED',
  e.id,
  datetime('now'),
  datetime('now')
FROM SubAccountEntry e
JOIN SubAccountGroup g ON e.groupId = g.id
JOIN SubAccount sa ON g.subAccountId = sa.id
WHERE NOT EXISTS (SELECT 1 FROM "Transaction" t WHERE t.subAccountEntryId = e.id);

-- Step 5: Convert SubAccountGroup.initialBalance to entries + transactions
-- Create entries for groups with initialBalance != 0
INSERT INTO SubAccountEntry (id, date, description, amount, fromBudget, groupId, createdAt, updatedAt)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  '2025-12-31T00:00:00.000Z',
  'Anfangssaldo',
  g.initialBalance,
  0,
  g.id,
  datetime('now'),
  datetime('now')
FROM SubAccountGroup g
WHERE g.initialBalance != 0;

-- Create transactions for those entries
INSERT INTO "Transaction" (id, date, mainAmount, mainType, subAmount, subType, description, accountId, categoryId, status, subAccountEntryId, createdAt, updatedAt)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  '2025-12-31T00:00:00.000Z',
  NULL,
  'INCOME',
  e.amount,
  CASE WHEN e.amount > 0 THEN 'INCOME' ELSE 'EXPENSE' END,
  'Anfangssaldo',
  sa.accountId,
  (SELECT c.id FROM Category c WHERE c.subAccountGroupId = g.id AND c.groupId IS NOT NULL ORDER BY c.id LIMIT 1),
  'CLEARED',
  e.id,
  datetime('now'),
  datetime('now')
FROM SubAccountEntry e
JOIN SubAccountGroup g ON e.groupId = g.id
JOIN SubAccount sa ON g.subAccountId = sa.id
WHERE e.description = 'Anfangssaldo' AND e.date = '2025-12-31T00:00:00.000Z'
  AND NOT EXISTS (SELECT 1 FROM "Transaction" t WHERE t.subAccountEntryId = e.id);

-- Set group.initialBalance = 0
UPDATE SubAccountGroup SET initialBalance = 0 WHERE initialBalance != 0;

-- Step 6: Create opening balance transaction for main account (one per account with sub-accounts)
-- First, ensure an "Anfangssaldo" category exists in the first category group of each such account
INSERT INTO Category (id, name, color, icon, type, groupId, sortOrder, isActive, rolloverEnabled, subAccountGroupId, subAccountLinkType, createdAt, updatedAt)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  'Anfangssaldo',
  '#94a3b8',
  NULL,
  'INCOME',
  (SELECT MIN(cg.id) FROM CategoryGroup cg WHERE cg.accountId = a.id),
  999,
  1,
  0,
  NULL,
  'BOOKING',
  datetime('now'),
  datetime('now')
FROM Account a
WHERE a.id IN (SELECT DISTINCT sa.accountId FROM SubAccount sa)
  AND NOT EXISTS (
    SELECT 1 FROM Category c
    JOIN CategoryGroup cg ON c.groupId = cg.id
    WHERE cg.accountId = a.id AND c.name = 'Anfangssaldo'
  );

-- Now create the opening balance transaction
INSERT INTO "Transaction" (id, date, mainAmount, mainType, subAmount, subType, description, accountId, categoryId, status, createdAt, updatedAt)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  '2025-12-31T00:00:00.000Z',
  0,
  'INCOME',
  NULL,
  NULL,
  'Anfangssaldo Hauptkonto',
  a.id,
  (SELECT c.id FROM Category c JOIN CategoryGroup cg ON c.groupId = cg.id WHERE cg.accountId = a.id AND c.name = 'Anfangssaldo' LIMIT 1),
  'CLEARED',
  datetime('now'),
  datetime('now')
FROM Account a
WHERE a.id IN (SELECT DISTINCT sa.accountId FROM SubAccount sa);

-- Step 8: Recalculate currentBalance for accounts with sub-accounts
UPDATE Account SET currentBalance = (
  SELECT COALESCE(SUM(COALESCE(t.mainAmount, 0) + COALESCE(t.subAmount, 0)), 0)
  FROM "Transaction" t WHERE t.accountId = Account.id
) WHERE id IN (SELECT DISTINCT accountId FROM SubAccount);
