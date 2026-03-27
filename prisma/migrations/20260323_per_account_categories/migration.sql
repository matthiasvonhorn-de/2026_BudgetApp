-- Per-account categories: CategoryGroup bekommt accountId, AccountCategoryGroup entfällt

PRAGMA foreign_keys=OFF;

-- Neue CategoryGroup-Tabelle mit accountId
CREATE TABLE "new_CategoryGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "accountId" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CategoryGroup_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Datenmigration: bestehende Gruppen dem ersten Konto zuweisen
INSERT INTO "new_CategoryGroup" ("id", "name", "sortOrder", "accountId", "createdAt", "updatedAt")
SELECT
    g."id",
    g."name",
    g."sortOrder",
    COALESCE((SELECT a."id" FROM "Account" a ORDER BY a."createdAt" ASC LIMIT 1), ''),
    g."createdAt",
    g."updatedAt"
FROM "CategoryGroup" g;

DROP TABLE "CategoryGroup";
ALTER TABLE "new_CategoryGroup" RENAME TO "CategoryGroup";

-- Index für accountId
CREATE INDEX "CategoryGroup_accountId_idx" ON "CategoryGroup"("accountId");

-- AccountCategoryGroup-Tabelle entfernen
DROP TABLE IF EXISTS "AccountCategoryGroup";

PRAGMA foreign_keys=ON;
